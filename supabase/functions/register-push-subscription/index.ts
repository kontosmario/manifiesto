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

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null
  const normalized = authorizationHeader.trim()
  if (!normalized) return null
  const bearerPrefix = 'bearer '
  if (normalized.toLowerCase().startsWith(bearerPrefix)) {
    return normalized.slice(bearerPrefix.length).trim() || null
  }
  return normalized
}

function isServerReady(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey)
}

const EXPO_PUSH_TOKEN_REGEX =
  /^(?:Exponent|Expo)PushToken\[[^\]]+\]$/

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

  const token = clip(body.token, MAX_TOKEN_LEN)
  if (!token) {
    return jsonResponse({ error: 'token is required.' }, 400, cors)
  }

  const providerRaw = clip(body.provider, 16) ?? 'expo'
  const provider = providerRaw === 'web' ? 'web' : 'expo'

  // Server-side format validation. We currently only ship Expo Push
  // from the mobile client; web-push tokens come via a different
  // surface and are not yet wired through this function. Reject
  // anything that doesn't match the Expo token format outright when
  // provider=expo. For provider=web we accept any non-empty endpoint
  // (the format is a URL, validated separately).
  if (provider === 'expo' && !EXPO_PUSH_TOKEN_REGEX.test(token)) {
    return jsonResponse({ error: 'Invalid Expo push token format.' }, 400, cors)
  }

  // Auth: bearer token required, no exceptions. Verify with the anon
  // client so the JWT is checked against Supabase Auth.
  const bearer = extractBearerToken(
    request.headers.get('Authorization') ?? request.headers.get('authorization'),
  )
  if (!bearer) {
    return jsonResponse({ error: 'Unauthorized (missing token).' }, 401, cors)
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

  const userAgent = clip(body.userAgent, MAX_USER_AGENT_LEN) ?? 'unknown'
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
