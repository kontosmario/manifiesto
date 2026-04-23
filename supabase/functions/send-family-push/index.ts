import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.0'
import webpush from 'npm:web-push@3.6.7'

interface PushRequestBody {
  familyId?: string
  title?: string
  body?: string
  kind?: string
  url?: string
}

interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface PushResult {
  sent: number
  failed: number
  removed: number
}

interface ExpoTicket {
  status?: 'ok' | 'error'
  details?: {
    error?: string
  }
}

interface ExpoPushResponse {
  data?: ExpoTicket[]
  errors?: Array<{ message?: string }>
}

const denoGlobal = globalThis as {
  Deno?: {
    serve: (handler: (request: Request) => Promise<Response>) => void
    env: {
      get: (key: string) => string | undefined
    }
  }
}

const env = denoGlobal.Deno?.env
const supabaseUrl = env?.get('SUPABASE_URL') ?? ''
const supabaseAnonKey = env?.get('SUPABASE_ANON_KEY') ?? ''
const supabaseServiceRoleKey = env?.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const vapidPublicKey = env?.get('WEB_PUSH_VAPID_PUBLIC_KEY') ?? ''
const vapidPrivateKey = env?.get('WEB_PUSH_VAPID_PRIVATE_KEY') ?? ''
const vapidContactEmail = env?.get('WEB_PUSH_CONTACT_EMAIL') ?? 'push@example.com'
const hasWebPushConfig = Boolean(vapidPublicKey && vapidPrivateKey)
const vapidSubject = vapidContactEmail.startsWith('mailto:')
  ? vapidContactEmail
  : `mailto:${vapidContactEmail}`

if (hasWebPushConfig) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function isServerReady(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey)
}

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null
  }

  const normalized = authorizationHeader.trim()
  if (!normalized) {
    return null
  }

  const bearerPrefix = 'bearer '
  if (normalized.toLowerCase().startsWith(bearerPrefix)) {
    return normalized.slice(bearerPrefix.length).trim() || null
  }

  return normalized
}

function getGatewayUserId(request: Request): string | null {
  const value =
    request.headers.get('x-supabase-auth-user') ??
    request.headers.get('x-supabase-auth-user-id')
  if (!value || !value.trim()) {
    return null
  }

  return value.trim()
}

function isExpoPushToken(value: string): boolean {
  return /^ExponentPushToken\[[^\]]+\]$/.test(value) || /^ExpoPushToken\[[^\]]+\]$/.test(value)
}

function isExpoSubscription(subscription: PushSubscriptionRow): boolean {
  return (
    isExpoPushToken(subscription.endpoint.trim()) ||
    subscription.p256dh === 'expo' ||
    subscription.auth === 'expo'
  )
}

async function removeSubscription(
  adminClient: SupabaseClient,
  subscriptionId: string,
): Promise<number> {
  const deleteResponse = await adminClient
    .from('push_subscriptions')
    .delete()
    .eq('id', subscriptionId)

  return deleteResponse.error ? 0 : 1
}

async function sendExpoPush(
  adminClient: SupabaseClient,
  subscription: PushSubscriptionRow,
  payload: Required<Pick<PushRequestBody, 'title' | 'body' | 'kind' | 'url'>>,
): Promise<PushResult> {
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          to: subscription.endpoint,
          title: payload.title,
          body: payload.body,
          sound: 'default',
          priority: 'high',
          channelId: 'default',
          data: {
            kind: payload.kind,
            url: payload.url,
          },
        },
      ]),
    })

    if (!response.ok) {
      return { sent: 0, failed: 1, removed: 0 }
    }

    const data = (await response.json()) as ExpoPushResponse
    const ticket = data.data?.[0]

    if (ticket?.status === 'ok') {
      return { sent: 1, failed: 0, removed: 0 }
    }

    let removed = 0
    if (ticket?.details?.error === 'DeviceNotRegistered') {
      removed = await removeSubscription(adminClient, subscription.id)
    }

    return { sent: 0, failed: 1, removed }
  } catch {
    return { sent: 0, failed: 1, removed: 0 }
  }
}

async function sendWebPush(
  adminClient: SupabaseClient,
  subscription: PushSubscriptionRow,
  payload: string,
): Promise<PushResult> {
  if (!hasWebPushConfig) {
    return { sent: 0, failed: 1, removed: 0 }
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      payload,
    )

    return { sent: 1, failed: 0, removed: 0 }
  } catch (error) {
    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : null

    if (statusCode === 404 || statusCode === 410) {
      const removed = await removeSubscription(adminClient, subscription.id)
      return { sent: 0, failed: 1, removed }
    }

    return { sent: 0, failed: 1, removed: 0 }
  }
}

async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  if (!isServerReady()) {
    return jsonResponse(
      {
        error:
          'Missing env vars in Edge Function (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).',
      },
      500,
    )
  }

  let payload: PushRequestBody
  try {
    payload = (await request.json()) as PushRequestBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload.' }, 400)
  }

  const familyId = (payload.familyId ?? '').trim()
  const title = (payload.title ?? '').trim()
  const body = payload.body?.trim() ?? ''
  const kind = payload.kind?.trim() || 'info'
  const url = payload.url?.trim() || '/home'

  if (!familyId || !title) {
    return jsonResponse({ error: 'familyId and title are required.' }, 400)
  }

  const token = extractBearerToken(
    request.headers.get('Authorization') ?? request.headers.get('authorization'),
  )
  const gatewayUserId = getGatewayUserId(request)

  let actorUserId = gatewayUserId
  if (token) {
    const userClient = createClient(supabaseUrl, supabaseAnonKey)
    const authUserResponse = await userClient.auth.getUser(token)
    if (authUserResponse.error || !authUserResponse.data.user) {
      if (!gatewayUserId) {
        return jsonResponse(
          {
            error: 'Unauthorized user (invalid token).',
          },
          401,
        )
      }
    } else {
      actorUserId = authUserResponse.data.user.id
    }
  }

  if (!actorUserId) {
    return jsonResponse(
      {
        error: 'Unauthorized user (missing token).',
      },
      401,
    )
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)

  const membershipResponse = await adminClient
    .from('family_members')
    .select('family_id')
    .eq('family_id', familyId)
    .eq('user_id', actorUserId)
    .maybeSingle()

  if (membershipResponse.error || !membershipResponse.data) {
    return jsonResponse({ error: 'User is not a member of this family.' }, 403)
  }

  const subscriptionsResponse = await adminClient
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .eq('family_id', familyId)
    .neq('user_id', actorUserId)

  if (subscriptionsResponse.error) {
    return jsonResponse(
      { error: 'Could not fetch push subscriptions.', details: subscriptionsResponse.error.message },
      500,
    )
  }

  const subscriptions = (subscriptionsResponse.data ?? []) as PushSubscriptionRow[]
  if (subscriptions.length === 0) {
    return jsonResponse({ sent: 0, failed: 0, removed: 0 })
  }

  const webPushPayload = JSON.stringify({
    title,
    body,
    kind,
    url,
  })

  const results = await Promise.all(
    subscriptions.map((subscription) => {
      if (isExpoSubscription(subscription)) {
        return sendExpoPush(adminClient, subscription, { title, body, kind, url })
      }

      return sendWebPush(adminClient, subscription, webPushPayload)
    }),
  )

  const summary = results.reduce<PushResult>(
    (accumulator, current) => ({
      sent: accumulator.sent + current.sent,
      failed: accumulator.failed + current.failed,
      removed: accumulator.removed + current.removed,
    }),
    { sent: 0, failed: 0, removed: 0 },
  )

  return jsonResponse(summary)
}

if (!denoGlobal.Deno?.serve) {
  throw new Error('This function must run on Deno runtime.')
}

denoGlobal.Deno.serve(handler)
