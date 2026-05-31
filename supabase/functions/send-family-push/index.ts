import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.0'
import webpush from 'npm:web-push@3.6.7'

interface PushRequestBody {
  familyId?: string
  title?: string
  body?: string
  kind?: string
  url?: string
  messages?: ExpoPushMessage[]
}

// New batch path used by the notifications-orchestrator. Lets the
// orchestrator hand us a pre-built list of Expo push messages and
// fan them out in batches of 100 (Expo Push API limit per request).
interface ExpoPushMessage {
  to: string
  title: string
  body: string
  data?: unknown
  sound?: string
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

// Strip control characters and cap length. Push payloads end up
// rendered verbatim by the OS notification UI; we don't want a
// malicious caller injecting newlines, ANSI escapes, or extreme
// strings that fragment the notification or impersonate UI chrome.
function sanitizeText(value: string | undefined, maxLen: number): string {
  if (!value) return ""
  // Build the control-char regex via RegExp() so the source stays
  // grep-friendly (no literal 0x00-0x1F bytes embedded in the file).
  // eslint-disable-next-line no-control-regex
  const controlRe = new RegExp("[\\x00-\\x1F\\x7F]+", "g")
  return value.replace(controlRe, " ").trim().slice(0, maxLen)
}

const ALLOWED_PUSH_KINDS = new Set([
  'info',
  'expense_logged',
  'fixed_paid',
  'fixed_created',
  'fixed_edited',
  'fixed_deleted',
  'goal_contribution',
  'goal_milestone',
  'goal_achieved',
  'goal_created',
  'streak_broken',
  'streak_milestone',
  'shield_used',
  'shield_earned',
  'member_warning',
  'member_nudge',
  'member_left',
  'cycle_close',
])

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

// Bulk Expo Push fan-out used by notifications-orchestrator.
// Splits into batches of 100 (Expo's per-request cap) and fires
// them sequentially. We don't propagate per-ticket errors here —
// the orchestrator counts attempts, not deliveries; DeviceNotRegistered
// cleanup happens in the per-subscription Expo path elsewhere.
async function sendExpoBatch(messages: ExpoPushMessage[]): Promise<void> {
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100)
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      })
    } catch (error) {
      // Swallow — the orchestrator logs based on the response status,
      // and a network failure on one batch shouldn't abort the rest.
      console.error('sendExpoBatch failed', error)
    }
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

  // notifications-orchestrator path: caller pre-resolved tokens and
  // built ExpoPushMessage[]. This branch must ONLY be reachable by
  // the orchestrator (service-role). Without this gate, since
  // verify_jwt is off at the gateway (ES256 workaround), an
  // unauthenticated caller could spam arbitrary Expo push tokens.
  if (Array.isArray(payload.messages)) {
    const orchestratorToken = extractBearerToken(
      request.headers.get('Authorization') ?? request.headers.get('authorization'),
    )
    if (!orchestratorToken || orchestratorToken !== supabaseServiceRoleKey) {
      return jsonResponse({ error: 'Unauthorized (service-role required for batch path).' }, 401)
    }
    const messages = payload.messages
    if (messages.length === 0) {
      return jsonResponse({ ok: true, count: 0 })
    }
    await sendExpoBatch(messages)
    return jsonResponse({ ok: true, count: messages.length })
  }

  // Sanitize + length-cap user-controlled strings BEFORE any auth /
  // membership work. Stops control-char injection and keeps the
  // notification payload bounded regardless of caller behavior.
  const familyId = (payload.familyId ?? '').trim()
  const title = sanitizeText(payload.title, 80)
  const body = sanitizeText(payload.body, 240)
  const rawKind = sanitizeText(payload.kind, 64) || 'info'
  const kind = ALLOWED_PUSH_KINDS.has(rawKind) ? rawKind : 'info'
  // url is consumed client-side as a route hint. Reject anything that
  // doesn't start with `/` to block javascript:, http://, intent:, etc.
  const rawUrl = sanitizeText(payload.url, 200)
  const url = rawUrl.startsWith('/') ? rawUrl : '/home'

  if (!familyId || !title) {
    return jsonResponse({ error: 'familyId and title are required.' }, 400)
  }

  // Strict bearer-token auth. The previous gateway-header fallback
  // (`x-supabase-auth-user` / `x-supabase-auth-user-id`) was
  // exploitable because verify_jwt is off (ES256 workaround) — the
  // gateway does NOT inject those headers, so a caller could spoof
  // them. Always require a valid bearer token, no exceptions.
  const token = extractBearerToken(
    request.headers.get('Authorization') ?? request.headers.get('authorization'),
  )
  if (!token) {
    return jsonResponse({ error: 'Unauthorized (missing token).' }, 401)
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey)
  const authUserResponse = await userClient.auth.getUser(token)
  if (authUserResponse.error || !authUserResponse.data.user) {
    return jsonResponse({ error: 'Unauthorized (invalid token).' }, 401)
  }
  const actorUserId = authUserResponse.data.user.id

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)

  // Per-user rate limit: 10/minute. Legitimate notifications are
  // emitted by triggers (1 per mutation); a client driving 10+/min
  // is a fan-out abuse signal. We rate-limit BEFORE the membership
  // check so an attacker hammering invalid family IDs still burns
  // their own bucket.
  const rateLimitResponse = await adminClient.rpc('enforce_rate_limit_for_user', {
    p_user_id: actorUserId,
    p_action: 'send_family_push',
    p_max_attempts: 10,
    p_window_seconds: 60,
  })
  if (rateLimitResponse.error) {
    return jsonResponse({ error: 'Rate limit exceeded. Try again shortly.' }, 429)
  }

  const membershipResponse = await adminClient
    .from('family_members')
    .select('family_id, role, blocked_at')
    .eq('family_id', familyId)
    .eq('user_id', actorUserId)
    .maybeSingle()

  if (membershipResponse.error || !membershipResponse.data) {
    return jsonResponse({ error: 'User is not a member of this family.' }, 403)
  }

  // Reject blocked members — they can still hold a valid JWT briefly
  // after the owner blocks them, and we don't want them spamming
  // pushes during that window.
  const member = membershipResponse.data as {
    role?: string | null
    blocked_at?: string | null
  }
  if (member.role === 'blocked' || member.blocked_at) {
    return jsonResponse({ error: 'Forbidden: blocked member.' }, 403)
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
