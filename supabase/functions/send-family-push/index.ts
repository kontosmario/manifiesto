import { createClient } from 'npm:@supabase/supabase-js@2.57.0'
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
const vapidSubject = vapidContactEmail.startsWith('mailto:')
  ? vapidContactEmail
  : `mailto:${vapidContactEmail}`

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function isServerReady(): boolean {
  return Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      supabaseServiceRoleKey &&
      vapidPublicKey &&
      vapidPrivateKey,
  )
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
          'Missing env vars in Edge Function (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY).',
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
  const url = payload.url?.trim() || '/app'

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

  const pushPayload = JSON.stringify({
    title,
    body,
    kind,
    url,
  })

  let sent = 0
  let failed = 0
  let removed = 0

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          pushPayload,
        )
        sent += 1
      } catch (error) {
        failed += 1
        const statusCode =
          typeof error === 'object' &&
          error !== null &&
          'statusCode' in error &&
          typeof (error as { statusCode?: unknown }).statusCode === 'number'
            ? (error as { statusCode: number }).statusCode
            : null

        if (statusCode === 404 || statusCode === 410) {
          const deleteResponse = await adminClient
            .from('push_subscriptions')
            .delete()
            .eq('id', subscription.id)

          if (!deleteResponse.error) {
            removed += 1
          }
        }
      }
    }),
  )

  return jsonResponse({ sent, failed, removed })
}

if (!denoGlobal.Deno?.serve) {
  throw new Error('This function must run on Deno runtime.')
}

denoGlobal.Deno.serve(handler)
