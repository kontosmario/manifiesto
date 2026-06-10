// notifications-orchestrator
// --------------------------
// Single Edge Function called by pg_cron to fan-out scheduled
// notifications. Replaces the per-row trigger fan-out, which at
// 5k MAU was driving ~5k Edge invocations/day. The orchestrator:
//
//   1. Calls list_pending_notifications(p_kind) to get candidates.
//   2. Chunks results into groups of 200.
//   3. For each chunk: emit_notifications_bulk to insert with dedup,
//      resolve push tokens for the relevant family/user pairs, and
//      hand the resulting ExpoPushMessage[] to send-family-push v2
//      in a single invocation (which itself batches to Expo at 100/req).
//
// POST /functions/v1/notifications-orchestrator
// Body { kind: Kind }
// Auth Service-role bearer (called from pg_cron via pg_net only).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { chunk } from './chunking.ts'

type Kind =
  | 'morning_checkins'
  | 'midday_checkins'
  | 'evening_checkins'
  | 'fixed_upcoming'
  | 'streak_at_risk'
  | 'streak_broken'
  | 'weekly_insights'

const ALLOWED_KINDS: ReadonlySet<Kind> = new Set<Kind>([
  'morning_checkins',
  'midday_checkins',
  'evening_checkins',
  'fixed_upcoming',
  'streak_at_risk',
  'streak_broken',
  'weekly_insights',
])

interface PendingRow {
  family_id: string
  user_id: string | null
  title: string
  body: string
  kind: string
  severity: string
  metadata: Record<string, unknown>
  dedup_key: string
}

interface PushSubscriptionRow {
  family_id: string
  user_id: string
  endpoint: string
}

interface ExpoPushMessage {
  to: string
  sound: string
  title: string
  body: string
  data: unknown
}

const denoGlobal = globalThis as {
  Deno?: {
    serve: (handler: (request: Request) => Promise<Response>) => void
    env: { get: (key: string) => string | undefined }
  }
}

const env = denoGlobal.Deno?.env
const supabaseUrl = env?.get('SUPABASE_URL') ?? ''
const supabaseServiceRoleKey = env?.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CHUNK_SIZE = 200

// CORS for this function is defensive only — the sole production
// caller is pg_cron (via pg_net), which does not honor CORS at all.
// We still surface preflight headers + thread them onto non-success
// responses so that:
//   (a) a future browser-origin caller (ops dashboard, debug tool)
//       sees a real status instead of a generic CORS error, and
//   (b) the response shape matches `send-family-push` and
//       `control-advisor` for consistency.
// H-9 (red-team 2026-06-10).
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

function isKind(value: unknown): value is Kind {
  return typeof value === 'string' && ALLOWED_KINDS.has(value as Kind)
}

function adminClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_URL or service role key env vars')
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  })
}

async function fetchPushTokens(
  admin: ReturnType<typeof adminClient>,
  familyIds: string[],
  userIds: string[],
): Promise<PushSubscriptionRow[]> {
  if (familyIds.length === 0) return []
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('family_id, user_id, endpoint')
    .in('family_id', familyIds)
  if (error) throw error
  const rows = (data ?? []) as PushSubscriptionRow[]
  // userIds is the set of user-scoped rows in this chunk. If empty,
  // every chunk row is family-scoped (user_id null), so all family
  // tokens are valid recipients. Otherwise filter to {family-scoped
  // rows that match family_id} ∪ {user-scoped rows that match user_id}.
  if (userIds.length === 0) return rows
  const userSet = new Set(userIds)
  return rows.filter((r) => userSet.has(r.user_id))
}

async function processKind(kind: Kind) {
  const admin = adminClient()

  const pendingResponse = await admin
    .rpc('list_pending_notifications', { p_kind: kind })
    .returns<PendingRow[]>()
  if (pendingResponse.error) throw pendingResponse.error
  const pending = pendingResponse.data ?? []
  if (pending.length === 0) {
    return { kind, processed: 0, sent: 0, chunks: 0 }
  }

  const chunks = chunk(pending, CHUNK_SIZE)
  let processed = 0
  let sent = 0

  for (const c of chunks) {
    // 1. Persist with dedup. emit_notifications_bulk returns the
    //    count of rows actually inserted (post-dedup), not the count
    //    we handed it.
    const insertResponse = await admin.rpc('emit_notifications_bulk', { p_rows: c })
    if (insertResponse.error) {
      console.error('emit_notifications_bulk failed', insertResponse.error)
      continue
    }
    const insertedCount =
      typeof insertResponse.data === 'number' ? insertResponse.data : 0
    processed += insertedCount

    // 2. Resolve push tokens for the chunk's recipients.
    const familyIds = [...new Set(c.map((r) => r.family_id))]
    const userIds = c
      .map((r) => r.user_id)
      .filter((id): id is string => typeof id === 'string')
    const tokens = await fetchPushTokens(admin, familyIds, userIds)
    if (tokens.length === 0) continue

    // 3. Map token -> message. A chunk may contain multiple rows for
    //    the same family with different titles/bodies (morning_checkin
    //    is per-user), so we match by family + user_id (null = family
    //    broadcast, which fans out to every member's token).
    const tokenToMsg = new Map<string, ExpoPushMessage>()
    for (const sub of tokens) {
      const row = c.find(
        (r) =>
          r.family_id === sub.family_id &&
          (r.user_id === null || r.user_id === sub.user_id),
      )
      if (!row) continue
      tokenToMsg.set(sub.endpoint, {
        to: sub.endpoint,
        sound: 'default',
        title: row.title,
        body: row.body,
        data: row.metadata,
      })
    }

    if (tokenToMsg.size === 0) continue

    // 4. Single Edge invocation; send-family-push handles the
    //    100-per-request Expo cap internally.
    const messages = [...tokenToMsg.values()]
    const sendResponse = await admin.functions.invoke('send-family-push', {
      body: { messages },
    })
    if (sendResponse.error) {
      console.error('send-family-push failed', sendResponse.error)
    } else {
      sent += messages.length
    }
  }

  return { kind, processed, sent, chunks: chunks.length }
}

// Constant-time string equality. The naive `a === b` short-circuits
// on first byte mismatch, leaking how many leading bytes matched
// through response timing. The risk over the public internet is
// extremely low (gateway latency dwarfs single-byte timing
// differences) but the cost of doing it right is one helper. Used
// for the service-role bearer check below.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

// RFC 6750 §2.1 bearer parser — requires the literal `Bearer ` prefix
// (case-insensitive, per RFC). The previous implementation fell back
// to returning the raw header when no prefix matched, which let a
// caller skip the spec. The only caller is pg_cron (via pg_net) which
// already emits `Bearer <service-role-key>`, so tightening this is
// safe. H-8 (red-team 2026-06-10).
function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null
  }
  const normalized = authorizationHeader.trim()
  if (!normalized.toLowerCase().startsWith('bearer ')) {
    return null
  }
  const token = normalized.slice(7).trim()
  return token.length > 0 ? token : null
}

export async function handler(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request.headers.get('origin'))

  // H-9 (red-team 2026-06-10): handle OPTIONS preflight explicitly with
  // CORS headers. Returning 405 without CORS (the previous behavior)
  // would cause a browser preflight to fail with a generic CORS error,
  // masking the real reason a request was rejected.
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, cors)
  }

  // Service-role gate: this function is invoked by pg_cron (which
  // signs with the service-role key) and should not be reachable by
  // end users. Defense-in-depth against an authenticated user
  // triggering a full notification fan-out (DoS/cost amplifier at
  // scale).
  const callerToken = extractBearerToken(
    request.headers.get('Authorization') ?? request.headers.get('authorization'),
  )
  if (
    !callerToken ||
    !supabaseServiceRoleKey ||
    !timingSafeEqual(callerToken, supabaseServiceRoleKey)
  ) {
    return jsonResponse({ error: 'Unauthorized (service-role required).' }, 401, cors)
  }

  let payload: { kind?: unknown }
  try {
    payload = (await request.json()) as { kind?: unknown }
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload.' }, 400, cors)
  }
  if (!isKind(payload.kind)) {
    return jsonResponse({ error: 'kind required (one of allowed kinds).' }, 400, cors)
  }
  try {
    const result = await processKind(payload.kind)
    return jsonResponse(result, 200, cors)
  } catch (error) {
    // Redact upstream error from the response (M-edge2, red-team
    // 2026-06-10). The callers are pg_cron (service-role) which
    // doesn't render the body, and ops dashboards. Returning the raw
    // exception message can leak Postgres error codes / SQL hints /
    // service-internal identifiers. Log the detail for the operator
    // and respond with a generic marker.
    console.error('orchestrator failed', error)
    return jsonResponse({ error: 'internal' }, 500, cors)
  }
}

if (!denoGlobal.Deno?.serve) {
  throw new Error('This function must run on Deno runtime.')
}

denoGlobal.Deno.serve(handler)
