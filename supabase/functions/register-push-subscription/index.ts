// register-push-subscription
// --------------------------
// Gatekeeper for writes to `push_subscriptions`. Previously the mobile
// client wrote directly to the table via supabase.from('push_subscriptions')
// .upsert(...), constructing user_id + family_id on the client. A modified
// binary could pass any values and rely entirely on RLS — defense-in-depth
// hole flagged by red-team audit 2026-06-10 (F4).
//
// This function:
//   1. Requires a JWT bearer token (the user's session).
//   2. Calls auth.getUser(token) server-side to resolve the authenticated
//      user_id — the client cannot spoof it.
//   3. Looks up family_id from `family_members` server-side — the client
//      cannot spoof it either, even if RLS would catch a cross-family
//      attempt.
//   4. Validates the push token format (Expo: `ExponentPushToken[...]` or
//      `ExpoPushToken[...]`). Belt and suspenders against arbitrary
//      strings being written into the column.
//   5. UPSERTs the row with the server-side values.
//
// POST /functions/v1/register-push-subscription
// Body {
//   token: string,
//   provider?: 'expo' | 'web',
//   userAgent?: string,
//   p256dh?: string,  // web-push only; ignored for expo
//   auth?: string,    // web-push only; ignored for expo
// }
// Auth Supabase user JWT.

import { createClient } from 'npm:@supabase/supabase-js@2.57.0'

interface RequestBody {
  token?: string
  provider?: string
  userAgent?: string
  p256dh?: string
  auth?: string
}

const denoGlobal = globalThis as {
  Deno?: {
    serve: (handler: (request: Request) => Promise<Response>) => void
    env: { get: (key: string) => string | undefined }
  }
}

const env = denoGlobal.Deno?.env
const supabaseUrl = env?.get('SUPABASE_URL') ?? ''
const supabaseAnonKey = env?.get('SUPABASE_ANON_KEY') ?? ''
const supabaseServiceRoleKey = env?.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Mirror the CORS allowlist used in other edge functions. Mobile
// callers don't read CORS at all but the function is exposed publicly
// over HTTP, so we keep parity with send-family-push / control-advisor.
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
    headers: { ...corsHeadersOverride, 'Content-Type': 'application/json' },
  })
}

// RFC 6750 §2.1 bearer parser — requires the literal `Bearer ` prefix
// (case-insensitive, per RFC). The previous implementation fell back to
// returning the raw header value when no prefix matched, which let
// callers send a bare token and still authenticate (the same regression
// fixed in Sprint H-8 across the other three edge functions). Sprint I
// · I-2 (red-team re-audit 2026-06-10).
function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null
  const normalized = authorizationHeader.trim()
  if (!normalized) return null
  const bearerPrefix = 'bearer '
  if (!normalized.toLowerCase().startsWith(bearerPrefix)) {
    return null
  }
  return normalized.slice(bearerPrefix.length).trim() || null
}

// Constant-time string equality. Mirrors send-family-push so the
// service-role reject below cannot leak match progress through response
// timing. Sprint J · Audit #3 J-Edge1(b) (2026-06-10).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

function isServerReady(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey)
}

// Sprint J · Audit #3 J-Edge1(d) (2026-06-10): tightened from
// `[^\]]+` (which accepted newlines, control characters, even closing
// brackets via URI-encoding tricks) to url-safe base64 alphabet only,
// 18-200 chars (real Expo tokens are ~22 chars of base64; cap is
// generous). Combined with control-char stripping below, blocks log
// injection / display-spoofing tokens.
const EXPO_PUSH_TOKEN_REGEX =
  /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{18,200}\]$/

// Sprint J · Audit #3 J-Edge1(c) (2026-06-10): allowlist of web-push
// endpoint hosts. The `provider:'web'` branch used to accept ANY
// `endpoint` URL because we never validated the host. That let a caller
// register `http://internal-metadata.example/` (SSRF) or
// `javascript:alert(1)` (stored XSS for the future web dashboard) as a
// "push endpoint". Lock down to the four public push services we
// actually support.
//
// Hosts (exact suffix match for the wildcard entry):
//   • fcm.googleapis.com                       — Chrome / Edge (FCM)
//   • updates.push.services.mozilla.com        — Firefox (autopush)
//   • *.notify.windows.com                     — Edge legacy / WNS
//   • web.push.apple.com                       — Safari (APNs web)
const WEB_PUSH_HOST_ALLOWLIST = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
])
const WEB_PUSH_HOST_SUFFIX_ALLOWLIST = [
  '.notify.windows.com',
]

function isAllowedWebPushEndpoint(rawEndpoint: string): boolean {
  let url: URL
  try {
    url = new URL(rawEndpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  if (WEB_PUSH_HOST_ALLOWLIST.has(host)) return true
  return WEB_PUSH_HOST_SUFFIX_ALLOWLIST.some((suffix) => host.endsWith(suffix))
}

// Sprint J · Audit #3 J-Edge1(d) (2026-06-10): strip ASCII control
// characters BEFORE the format regex check. A token containing
// `\r\n` could fool log analysis or downstream consumers (Expo's API
// rejects them, but defense-in-depth is cheap).
//
// Sprint O · Audit #8 O-2 (2026-06-14): extend to Unicode `Cf` format
// chars (bidi marks/overrides, zero-width chars, BOM). The user-agent
// metadata field could otherwise be planted with U+202E and shown in
// admin / debug UIs with reversed digits.
export function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  const controlRe = new RegExp(
    '[\\x00-\\x1F\\x7F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]+',
    'gu',
  )
  return value.replace(controlRe, '')
}

// Sanity caps for the optional metadata fields. Push subscriptions
// are written verbatim into a Postgres text column — we don't want a
// caller stuffing megabytes in. Limits are well above any legitimate
// value.
const MAX_TOKEN_LEN = 256
const MAX_USER_AGENT_LEN = 200
const MAX_KEY_LEN = 512

function clip(value: string | undefined | null, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

export async function handler(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request.headers.get('origin'))

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, cors)
  }

  if (!isServerReady()) {
    return jsonResponse(
      {
        error:
          'Missing env vars (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).',
      },
      500,
      cors,
    )
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload.' }, 400, cors)
  }

  const tokenRaw = clip(body.token, MAX_TOKEN_LEN)
  if (!tokenRaw) {
    return jsonResponse({ error: 'token is required.' }, 400, cors)
  }
  // Sprint J · Audit #3 J-Edge1(d): strip ASCII control characters
  // before any validation. A token with embedded \r\n would otherwise
  // slip through the format regex (which uses `[^\]]+`-class patterns
  // historically) and end up in logs / OS notification chrome.
  const token = stripControlChars(tokenRaw)
  if (!token) {
    return jsonResponse({ error: 'token is required.' }, 400, cors)
  }

  const providerRaw = clip(body.provider, 16) ?? 'expo'
  const provider = providerRaw === 'web' ? 'web' : 'expo'

  // Server-side format validation. We currently only ship Expo Push
  // from the mobile client; web-push tokens come via the web-push
  // subscribe path on manifiestoapp.com. Reject anything that doesn't
  // match the (tightened) Expo token regex when provider=expo. For
  // provider=web we additionally require the endpoint URL to belong
  // to a known public push service host (J-Edge1(c)).
  if (provider === 'expo' && !EXPO_PUSH_TOKEN_REGEX.test(token)) {
    return jsonResponse({ error: 'Invalid Expo push token format.' }, 400, cors)
  }
  if (provider === 'web' && !isAllowedWebPushEndpoint(token)) {
    // Sprint J · Audit #3 J-Edge1(c): SSRF / stored-XSS guard. We used
    // to accept any non-empty string as a `web` endpoint.
    return jsonResponse({ error: 'Invalid web push endpoint host.' }, 400, cors)
  }

  // Auth: bearer token required, no exceptions. Verify with the anon
  // client so the JWT is checked against Supabase Auth.
  const bearer = extractBearerToken(
    request.headers.get('Authorization') ?? request.headers.get('authorization'),
  )
  if (!bearer) {
    return jsonResponse({ error: 'Unauthorized (missing token).' }, 401, cors)
  }

  // Sprint J · Audit #3 J-Edge1(b) (2026-06-10): explicit service-role
  // reject. supabase-js' `auth.getUser` resolves the service-role JWT
  // to a "user-shaped" payload for the service principal — without this
  // gate a caller holding the service-role key could register push
  // subscriptions for arbitrary families bypassing the per-user / per-
  // family rate limits. Constant-time compare via `timingSafeEqual`
  // for parity with send-family-push.
  if (timingSafeEqual(bearer, supabaseServiceRoleKey)) {
    return jsonResponse(
      { error: 'Service-role token not permitted on this path' },
      401,
      cors,
    )
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey)
  const authUserResponse = await userClient.auth.getUser(bearer)
  if (authUserResponse.error || !authUserResponse.data.user) {
    return jsonResponse({ error: 'Unauthorized (invalid token).' }, 401, cors)
  }
  const userId = authUserResponse.data.user.id

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey)

  // Look up the user's family_id server-side. The client could be
  // signed in but not yet onboarded into a family (push_subscriptions
  // .family_id is NOT NULL in the current schema), in which case we
  // reject with a 409 so the client retries after onboarding rather
  // than treating it as auth/permission.
  const membershipResponse = await admin
    .from('family_members')
    .select('family_id, role, blocked_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (membershipResponse.error) {
    console.error('[register-push-subscription] membership lookup failed', membershipResponse.error)
    return jsonResponse({ error: 'internal' }, 500, cors)
  }
  if (!membershipResponse.data) {
    return jsonResponse({ error: 'No family membership.' }, 409, cors)
  }
  const member = membershipResponse.data as {
    family_id: string
    role?: string | null
    blocked_at?: string | null
  }
  if (member.role === 'blocked' || member.blocked_at) {
    return jsonResponse({ error: 'Forbidden: blocked member.' }, 403, cors)
  }
  const familyId = member.family_id

  // Per-user rate limit. Registering a push token shouldn't happen
  // more than once per app launch in practice; 20/min is a comfortable
  // ceiling that stops a misbehaving client (or attacker) from
  // hammering the table.
  const rateLimitResponse = await admin.rpc('enforce_rate_limit_for_user', {
    p_user_id: userId,
    p_action: 'register_push_subscription',
    p_max_attempts: 20,
    p_window_seconds: 60,
  })
  if (rateLimitResponse.error) {
    return jsonResponse({ error: 'Rate limit exceeded. Try again shortly.' }, 429, cors)
  }

  // Sprint J · Audit #3 J-Edge1(a) (2026-06-10): per-family rate limit.
  // The per-user bucket of 20/min above caps a single attacker, but N
  // puppet accounts inside the same family multiply throughput Nx.
  // Cap the family aggregate at 60/min (slightly above the per-user
  // ceiling × 3 active members, which is the realistic upper bound for
  // launches concentrated in a short window). We seed the bucket with
  // the family owner's user_id (stable, unique per family thanks to
  // `family_members_one_owner_per_family`) so every member's call
  // lands in the same row. Mirrors the send-family-push pattern.
  const ownerResponse = await admin
    .from('family_members')
    .select('user_id')
    .eq('family_id', familyId)
    .eq('role', 'owner')
    .maybeSingle()
  const familyBucketSeed = ownerResponse.data?.user_id ?? null
  if (!familyBucketSeed) {
    // Mirrors Sprint I · I-5: null owner used to silently SKIP the
    // bucket. Reject with 503 instead (consistent with send-family-push).
    // Sprint K · Audit #4 K-2 (2026-06-10): generic client-facing
    // message so the 503 doesn't disclose "ownership in flux" — that
    // string was a recon signal for an attacker probing family state
    // transitions. The detail stays in console.error for ops triage,
    // mirroring the send-family-push fix from Sprint J-Med4.
    console.error('[register-push-subscription] no owner for family — refusing', {
      familyId,
    })
    return jsonResponse(
      { error: 'Temporarily unavailable. Try again shortly.' },
      503,
      cors,
    )
  }
  const familyRateLimitResponse = await admin.rpc('enforce_rate_limit_for_user', {
    p_user_id: familyBucketSeed,
    p_action: 'register_push_subscription_family',
    p_max_attempts: 60,
    p_window_seconds: 60,
  })
  if (familyRateLimitResponse.error) {
    return jsonResponse(
      { error: 'Rate limit exceeded (family). Try again shortly.' },
      429,
      cors,
    )
  }

  // Push audit (2026-06-15) V-001: the user-agent string is shown in
  // admin / debug UIs; strip control + bidi chars so a planted U+202E
  // can't reverse digits there. (The token already runs through
  // stripControlChars above; the userAgent was missing it.)
  const userAgentRaw = clip(body.userAgent, MAX_USER_AGENT_LEN)
  const userAgent = (userAgentRaw && stripControlChars(userAgentRaw)) || 'unknown'
  // For web-push we expect keys; for expo we hard-code the sentinel
  // values the table uses to mark "this is an expo push token, not a
  // web-push subscription". Trusting the client's p256dh/auth for
  // expo rows would let a malicious caller create rows the
  // notifications-orchestrator routes via the wrong transport.
  const p256dh =
    provider === 'expo' ? 'expo' : clip(body.p256dh, MAX_KEY_LEN) ?? ''
  const authKey =
    provider === 'expo' ? 'expo' : clip(body.auth, MAX_KEY_LEN) ?? ''

  if (provider === 'web' && (!p256dh || !authKey)) {
    return jsonResponse({ error: 'web push requires p256dh + auth keys.' }, 400, cors)
  }

  // Re-home del token al usuario ACTUAL. El endpoint de Expo es por
  // device/instalación: un device tiene un solo usuario activo a la vez. Si una
  // cuenta anterior dejó su fila (logout best-effort que falló o cambio de
  // cuenta en el mismo device), sus notifs family-wide (fixed_upcoming, etc.)
  // seguirían llegando a ESTE device — el bug de "fijos/Buen día de otra cuenta".
  // Borramos cualquier fila con este endpoint de OTRO usuario antes de
  // re-registrar → el token queda asociado solo a quien está logueado ahora,
  // self-healing aunque el logout no haya limpiado. La unique key es
  // (user_id, endpoint), así que sin esto las filas viejas sobreviven.
  const rehomeResponse = await admin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', token)
    .neq('user_id', userId)
  if (rehomeResponse.error) {
    // Best-effort: no bloqueamos el registro si la limpieza falla.
    console.error(
      '[register-push-subscription] re-home delete failed',
      rehomeResponse.error,
    )
  }

  const upsertResponse = await admin
    .from('push_subscriptions')
    .upsert(
      {
        family_id: familyId,
        user_id: userId,
        provider,
        endpoint: token,
        p256dh,
        auth: authKey,
        user_agent: userAgent,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' },
    )

  if (upsertResponse.error) {
    console.error('[register-push-subscription] upsert failed', upsertResponse.error)
    return jsonResponse({ error: 'internal' }, 500, cors)
  }

  return jsonResponse({ ok: true, familyId, userId }, 200, cors)
}

if (!denoGlobal.Deno?.serve) {
  throw new Error('This function must run on Deno runtime.')
}

denoGlobal.Deno.serve(handler)
