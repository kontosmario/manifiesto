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

// Per-message outcome in the orchestrator batch path, aligned positionally
// with the input messages so the orchestrator can mark only delivered rows.
//   'ok'      — Expo accepted the push (delivered to APNs/FCM)
//   'removed' — DeviceNotRegistered; the subscription was pruned
//   'error'   — transient (rate-limit / 5xx / network); NOT marked, retried
type ExpoBatchStatus = 'ok' | 'error' | 'removed'

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

// Allowed origins: only the production site domain. The Edge
// Function is invoked from the mobile app (which doesn't read CORS)
// and from server-side notification orchestrator (which doesn't
// either). The only browser-origin caller is the web-push subscribe
// path on manifiestoapp.com. Echo back exactly the matched origin so
// credentials can be set if needed in the future.
const ALLOWED_ORIGINS = new Set([
  'https://manifiestoapp.com',
  'https://www.manifiestoapp.com',
])

function corsHeadersFor(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : ''
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function jsonResponse(
  payload: unknown,
  status = 200,
  corsHeadersOverride: Record<string, string> = corsHeadersFor(null),
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeadersOverride,
      'Content-Type': 'application/json',
    },
  })
}

function isServerReady(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey)
}

// Constant-time string equality. The naive `a === b` short-circuits
// on first byte mismatch, leaking how many leading bytes matched
// through response timing. The risk over the public internet is
// extremely low (gateway latency dwarfs single-byte timing
// differences) but the cost of doing it right is one helper. Used
// for service-role bearer checks below.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

// Distinguish a genuine rate-limit hit (P0001 raised inside the
// `enforce_rate_limit*` plpgsql helpers) from transient DB / planner
// failures. Postgres surfaces the SQLSTATE via PostgREST as the `code`
// field on the error object; older payloads include just `message`.
// Returning false on unknown shape biases toward 503 (caller retries
// later) rather than silently masking a real outage as a 429.
function isRateLimitErrcode(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; message?: unknown }
  if (typeof e.code === 'string' && e.code === 'P0001') return true
  // PostgREST returns the raised exception MESSAGE in `message`. The
  // helper uses a stable prefix ("Rate limit") that we can sniff as a
  // fallback when SQLSTATE isn't surfaced (e.g. functions that wrap the
  // error before re-raising).
  if (typeof e.message === 'string' && /rate limit/i.test(e.message)) return true
  return false
}

// RFC 6750 §2.1 bearer parser — requires the literal `Bearer ` prefix
// (case-insensitive, per RFC). The previous implementation fell back to
// returning the raw header value when no prefix matched, which let
// callers send a bare token and still authenticate. That violates the
// spec and silently masks misconfigured clients. All known callers
// (mobile via `supabase.functions.invoke` and the orchestrator) emit
// the prefix, so tightening this is safe. H-8 (red-team 2026-06-10).
function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null
  }

  const normalized = authorizationHeader.trim()
  if (!normalized) {
    return null
  }

  const bearerPrefix = 'bearer '
  if (!normalized.toLowerCase().startsWith(bearerPrefix)) {
    return null
  }
  return normalized.slice(bearerPrefix.length).trim() || null
}

// Strip control characters and cap length. Push payloads end up
// rendered verbatim by the OS notification UI; we don't want a
// malicious caller injecting newlines, ANSI escapes, or extreme
// strings that fragment the notification or impersonate UI chrome.
//
// Sprint O · Audit #8 O-2 (2026-06-14): the original ASCII-only range
// (\x00-\x1F\x7F) missed Unicode `Cf` "format" characters that the OS
// notification UI happily renders (or, worse, reorders). Specifically:
//   • U+200B-U+200D  zero-width space / joiner / non-joiner
//   • U+200E-U+200F  LRM / RLM (left-to-right / right-to-left mark)
//   • U+202A-U+202E  RTL/LTR override family (incl. U+202E, the
//                    "RIGHT-TO-LEFT OVERRIDE" used to spoof "$100"
//                    as "$001" in feed / push body)
//   • U+2066-U+2069  bidi isolate family
//   • U+FEFF         BOM / zero-width no-break space
// Attacker-planted expense descriptions containing these chars could
// flip digits in the push body the family member sees.
export function sanitizeText(value: string | undefined, maxLen: number): string {
  if (!value) return ""
  // Build the regex via RegExp() so the source file stays grep-friendly
  // (no literal control bytes or invisible chars embedded inline).
  // eslint-disable-next-line no-control-regex
  const controlRe = new RegExp(
    "[\\x00-\\x1F\\x7F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]+",
    "gu",
  )
  return value.replace(controlRe, " ").trim().slice(0, maxLen)
}

const ALLOWED_PUSH_KINDS = new Set([
  'info',
  'expense_logged',
  'income_logged',
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
      // Push audit (2026-06-15): refresh last_used_at on every successful
      // send so the 90-day retention cron doesn't reap tokens of devices
      // that are active but haven't re-registered recently.
      await adminClient
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', subscription.id)
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
// Splits into batches of 100 (Expo's per-request cap) and fires them
// sequentially.
//
// Push audit (2026-06-15): the previous version discarded the Expo
// response entirely — it never checked `response.ok`, never parsed the
// per-message tickets, so a 429/500/503 or a `DeviceNotRegistered`
// looked identical to a clean delivery. Two consequences: dead tokens
// accumulated forever (the orchestrator's batch path never pruned them,
// despite the comment claiming "elsewhere"), and the orchestrator could
// not tell which notifications actually shipped.
//
// Now we parse the tickets positionally (Expo guarantees ticket[i] maps
// to message[i]), return a `statuses` array aligned with the input so
// the orchestrator marks only delivered rows, prune `DeviceNotRegistered`
// endpoints, and refresh `last_used_at` for the endpoints that shipped.
async function sendExpoBatch(
  adminClient: SupabaseClient,
  messages: ExpoPushMessage[],
): Promise<{ result: PushResult; statuses: ExpoBatchStatus[] }> {
  const statuses: ExpoBatchStatus[] = new Array(messages.length).fill('error')
  const deadEndpoints = new Set<string>()
  const deliveredEndpoints = new Set<string>()

  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100)
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      })

      if (!response.ok) {
        // Transient (rate-limit / 5xx). Leave the whole batch as 'error'
        // so the orchestrator does NOT mark these rows pushed — the
        // backlog retries allow-listed kinds on the next run.
        console.error('[send-family-push] Expo batch non-ok', response.status)
        continue
      }

      const data = (await response.json()) as ExpoPushResponse
      const tickets = data.data ?? []
      for (let j = 0; j < batch.length; j++) {
        const ticket = tickets[j]
        const endpoint = batch[j].to
        if (ticket?.status === 'ok') {
          statuses[i + j] = 'ok'
          deliveredEndpoints.add(endpoint)
        } else if (ticket?.details?.error === 'DeviceNotRegistered') {
          statuses[i + j] = 'removed'
          deadEndpoints.add(endpoint)
        } else {
          statuses[i + j] = 'error'
        }
      }
    } catch (error) {
      // Network failure on one batch shouldn't abort the rest; those
      // messages stay 'error' (not marked pushed → retried).
      console.error('[send-family-push] Expo batch fetch failed', error)
    }
  }

  let removed = 0
  if (deadEndpoints.size > 0) {
    const del = await adminClient
      .from('push_subscriptions')
      .delete()
      .in('endpoint', [...deadEndpoints])
      .select('id')
    removed = del.error ? 0 : Array.isArray(del.data) ? del.data.length : 0
    if (del.error) {
      console.error('[send-family-push] dead-token prune failed', del.error)
    }
  }

  if (deliveredEndpoints.size > 0) {
    const upd = await adminClient
      .from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .in('endpoint', [...deliveredEndpoints])
    if (upd.error) {
      console.error('[send-family-push] last_used_at refresh failed', upd.error)
    }
  }

  const sent = statuses.filter((s) => s === 'ok').length
  const failed = statuses.filter((s) => s === 'error').length
  return { result: { sent, failed, removed }, statuses }
}

export async function handler(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request.headers.get('origin'))

  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: cors,
    })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, cors)
  }

  if (!isServerReady()) {
    return jsonResponse(
      {
        error:
          'Missing env vars in Edge Function (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).',
      },
      500,
      cors,
    )
  }

  let payload: PushRequestBody
  try {
    payload = (await request.json()) as PushRequestBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload.' }, 400, cors)
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
    if (
      !orchestratorToken ||
      !supabaseServiceRoleKey ||
      !timingSafeEqual(orchestratorToken, supabaseServiceRoleKey)
    ) {
      return jsonResponse({ error: 'Unauthorized (service-role required for batch path).' }, 401, cors)
    }
    // Belt-and-suspenders sanitize even though this branch is gated to
    // the service-role caller (notifications-orchestrator). If anyone
    // ever exfiltrated the service-role key (the only way to reach
    // this branch) we still don't want raw control chars / extreme
    // strings ending up in OS notification chrome.
    const messages = payload.messages.map((m) => ({
      to: typeof m.to === 'string' ? m.to.slice(0, 256) : '',
      title: sanitizeText(m.title, 80),
      body: sanitizeText(m.body, 240),
      data: m.data,
      sound: m.sound,
    }))
    if (messages.length === 0) {
      return jsonResponse({ ok: true, count: 0, sent: 0, failed: 0, removed: 0, statuses: [] }, 200, cors)
    }
    const batchAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)
    const { result, statuses } = await sendExpoBatch(batchAdmin, messages)
    return jsonResponse(
      {
        ok: true,
        count: messages.length,
        sent: result.sent,
        failed: result.failed,
        removed: result.removed,
        statuses,
      },
      200,
      cors,
    )
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
    return jsonResponse({ error: 'familyId and title are required.' }, 400, cors)
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
    return jsonResponse({ error: 'Unauthorized (missing token).' }, 401, cors)
  }

  // Sprint I · I-6 — defense in depth. supabase-js' `auth.getUser`
  // accepts the service-role JWT and resolves it to a service-principal
  // user object. Outside the orchestrator batch path above (which is
  // the only legitimate service-role caller) we must NOT let the
  // service-role token act as a regular user — it would bypass the
  // per-user rate limit and pretend to be a member of any family.
  if (timingSafeEqual(token, supabaseServiceRoleKey)) {
    return jsonResponse({ error: 'Unauthorized (invalid token).' }, 401, cors)
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey)
  const authUserResponse = await userClient.auth.getUser(token)
  if (authUserResponse.error || !authUserResponse.data.user) {
    return jsonResponse({ error: 'Unauthorized (invalid token).' }, 401, cors)
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
    // H-10 (red-team 2026-06-10): the previous implementation conflated
    // every RPC error with an actual rate-limit hit. `enforce_rate_limit`
    // raises with errcode `P0001` when the bucket is full; anything else
    // (network blip, planner error, missing extension) is a transient
    // infrastructure failure that should surface as 503, not 429.
    if (isRateLimitErrcode(rateLimitResponse.error)) {
      return jsonResponse({ error: 'Rate limit exceeded. Try again shortly.' }, 429, cors)
    }
    console.error('[send-family-push] enforce_rate_limit_for_user failed', rateLimitResponse.error)
    return jsonResponse({ error: 'Rate limit check unavailable. Try again shortly.' }, 503, cors)
  }

  const membershipResponse = await adminClient
    .from('family_members')
    .select('family_id, role, blocked_at')
    .eq('family_id', familyId)
    .eq('user_id', actorUserId)
    .maybeSingle()

  if (membershipResponse.error || !membershipResponse.data) {
    return jsonResponse({ error: 'User is not a member of this family.' }, 403, cors)
  }

  // Reject blocked members — they can still hold a valid JWT briefly
  // after the owner blocks them, and we don't want them spamming
  // pushes during that window.
  const member = membershipResponse.data as {
    role?: string | null
    blocked_at?: string | null
  }
  if (member.role === 'blocked' || member.blocked_at) {
    return jsonResponse({ error: 'Forbidden: blocked member.' }, 403, cors)
  }

  // Per-family rate limit (F6, red-team 2026-06-10): the per-user
  // bucket caps a single attacker at 10/min, but an attacker with N
  // puppet accounts inside the same family could multiply throughput
  // Nx. Cap the family aggregate at 30/min regardless of member
  // count. We seed the bucket with the family owner's user_id (stable,
  // unique per family thanks to the `family_members_one_owner_per_family`
  // index) so every member's call lands in the same row.
  const ownerResponse = await adminClient
    .from('family_members')
    .select('user_id')
    .eq('family_id', familyId)
    .eq('role', 'owner')
    .maybeSingle()
  // Sprint I · I-5 — null owner used to silently SKIP the bucket,
  // letting an attacker exploiting an ownership-transition window burst
  // past the family cap. Reject with 503 instead. Falling back to
  // `family_id` as the seed would FK-violate against
  // rpc_rate_limits.user_id (references auth.users).
  const familyBucketSeed = ownerResponse.data?.user_id ?? null
  if (!familyBucketSeed) {
    console.error('[send-family-push] no owner for family — refusing call', {
      familyId,
    })
    // Sprint J-Med · J-Med4 (2026-06-10): generic public message,
    // detailed reason already in console.error above for ops.
    return jsonResponse(
      { error: 'Temporarily unavailable. Try again shortly.' },
      503,
      cors,
    )
  }
  const familyRateLimitResponse = await adminClient.rpc(
    'enforce_rate_limit_for_user',
    {
      p_user_id: familyBucketSeed,
      p_action: 'send_family_push_family',
      p_max_attempts: 30,
      p_window_seconds: 60,
    },
  )
  if (familyRateLimitResponse.error) {
    // H-10 (red-team 2026-06-10): distinguish actual rate-limit
    // P0001 from transient DB / planner errors. See per-user
    // branch above for the rationale.
    if (isRateLimitErrcode(familyRateLimitResponse.error)) {
      return jsonResponse(
        { error: 'Rate limit exceeded (family). Try again shortly.' },
        429,
        cors,
      )
    }
    console.error(
      '[send-family-push] enforce_rate_limit_for_user (family) failed',
      familyRateLimitResponse.error,
    )
    return jsonResponse(
      { error: 'Rate limit check unavailable. Try again shortly.' },
      503,
      cors,
    )
  }

  const subscriptionsResponse = await adminClient
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .eq('family_id', familyId)
    .neq('user_id', actorUserId)

  if (subscriptionsResponse.error) {
    // Redact upstream error (M-edge3, red-team 2026-06-10). The
    // PostgREST/Postgres message can leak schema details; log it for
    // the operator and return a generic message to the caller.
    console.error('[send-family-push] subscriptions query failed', subscriptionsResponse.error)
    return jsonResponse({ error: 'internal' }, 500, cors)
  }

  // Sprint L · Audit #5 L-5 (2026-06-10): defense-in-depth against
  // blocked-member surveillance. The DB migration
  // 20260613004100_sprint_l_block_member_push_cleanup.sql scrubs
  // push_subscriptions inside `family_block_member`, but stale rows
  // can survive: (a) a client re-registers a push token right after
  // being blocked, (b) tokens written prior to L-5 still linger.
  // We separately query family_members for the family and exclude
  // any (family_id, user_id) tuple that lands on a blocked role or
  // a non-null blocked_at. Two queries (no inner-join) because
  // push_subscriptions has no FK to family_members.
  const familyMembersResponse = await adminClient
    .from('family_members')
    .select('user_id, role, blocked_at')
    .eq('family_id', familyId)
  if (familyMembersResponse.error) {
    console.error(
      '[send-family-push] family_members fetch failed',
      familyMembersResponse.error,
    )
    return jsonResponse({ error: 'internal' }, 500, cors)
  }
  const blockedUserIds = new Set<string>()
  for (const row of (familyMembersResponse.data ?? []) as Array<{
    user_id: string
    role: string | null
    blocked_at: string | null
  }>) {
    if (row.role === 'blocked' || row.blocked_at !== null) {
      blockedUserIds.add(row.user_id)
    }
  }
  const subscriptionsAfterBlock = (
    (subscriptionsResponse.data ?? []) as PushSubscriptionRow[]
  ).filter((s) => !blockedUserIds.has(s.user_id))

  // Push audit (2026-06-15): respect the recipient's channel_push
  // preference. This is the PUSH channel only — the in-app feed row is
  // emitted separately and is gated by channel_inapp upstream, so muting
  // push here never suppresses the feed. Fail-open on a query error
  // (better a stray push than dropping every notification on a blip).
  const recipientUserIds = [...new Set(subscriptionsAfterBlock.map((s) => s.user_id))]
  const mutedPushUserIds = new Set<string>()
  if (recipientUserIds.length > 0) {
    const prefsResponse = await adminClient
      .from('notification_preferences')
      .select('user_id, channel_push')
      .in('user_id', recipientUserIds)
    if (prefsResponse.error) {
      console.error('[send-family-push] channel_push prefs fetch failed', prefsResponse.error)
    } else {
      for (const row of (prefsResponse.data ?? []) as Array<{
        user_id: string
        channel_push: boolean | null
      }>) {
        if (row.channel_push === false) mutedPushUserIds.add(row.user_id)
      }
    }
  }
  const subscriptions = subscriptionsAfterBlock.filter(
    (s) => !mutedPushUserIds.has(s.user_id),
  )
  if (subscriptions.length === 0) {
    return jsonResponse({ sent: 0, failed: 0, removed: 0 }, 200, cors)
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

  return jsonResponse(summary, 200, cors)
}

if (!denoGlobal.Deno?.serve) {
  throw new Error('This function must run on Deno runtime.')
}

denoGlobal.Deno.serve(handler)
