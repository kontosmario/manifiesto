// notifications-orchestrator
// --------------------------
// Single Edge Function called by pg_cron to fan-out scheduled
// notifications. Replaces the per-row trigger fan-out, which at
// 5k MAU was driving ~5k Edge invocations/day. The orchestrator:
//
//   1. Calls list_pending_notifications(p_kind) to get candidates.
//   2. Chunks results into groups of 200.
//   3. For each chunk: emit_notifications_bulk_returning to insert with
//      dedup (returns the inserted rows' ids + content), resolve push
//      tokens, build one ExpoPushMessage per (row × token), hand them to
//      send-family-push v2 (which batches to Expo at 100/req and returns
//      per-message statuses), and mark pushed_at on exactly what shipped.
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
  | 'push_backlog'

const ALLOWED_KINDS: ReadonlySet<Kind> = new Set<Kind>([
  'morning_checkins',
  'midday_checkins',
  'evening_checkins',
  'fixed_upcoming',
  'streak_at_risk',
  'streak_broken',
  'weekly_insights',
  'push_backlog',
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
  if (rows.length === 0) return []

  // Sprint L · Audit #5 L-5 (2026-06-10): defense-in-depth filter
  // against blocked members. The DB-side `family_block_member` RPC
  // scrubs push_subscriptions at block time (Sprint L migration
  // 20260613004100), but two stale-row windows remain:
  //   • A client re-registers a push token immediately after being
  //     blocked (before any subsequent block call scrubs the new row).
  //   • Push tokens written prior to G-DB2 / L-5 that pre-date the
  //     scrubbing logic and still linger in the table.
  // We do a second query against family_members and drop any push
  // row whose (family_id, user_id) lands on a blocked membership.
  // Two queries instead of an inner-join because push_subscriptions
  // has no FK to family_members — PostgREST cannot resolve an
  // implicit relationship there.
  const blockedKeys = await fetchBlockedMembershipKeys(admin, familyIds)
  const filtered = rows.filter(
    (r) => !blockedKeys.has(`${r.family_id}:${r.user_id}`),
  )
  // userIds is the set of user-scoped rows in this chunk. If empty,
  // every chunk row is family-scoped (user_id null), so all family
  // tokens are valid recipients. Otherwise filter to {family-scoped
  // rows that match family_id} ∪ {user-scoped rows that match user_id}.
  const afterUser =
    userIds.length === 0
      ? filtered
      : (() => {
          const userSet = new Set(userIds)
          return filtered.filter((r) => userSet.has(r.user_id))
        })()

  // Push audit (2026-06-15): respect the channel_push preference. Drop
  // tokens whose owner muted the push channel. This is push-only — the
  // in-app feed row is emitted separately (gated by channel_inapp
  // upstream in list_pending_notifications), so muting push never
  // suppresses the feed.
  return dropMutedPushTokens(admin, afterUser)
}

// Drops push tokens whose owner has channel_push=false. Fail-open on a
// query error: a stray push beats dropping every notification on a blip.
async function dropMutedPushTokens(
  admin: ReturnType<typeof adminClient>,
  rows: PushSubscriptionRow[],
): Promise<PushSubscriptionRow[]> {
  if (rows.length === 0) return rows
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const { data, error } = await admin
    .from('notification_preferences')
    .select('user_id, channel_push')
    .in('user_id', userIds)
  if (error) {
    console.error('[notifications-orchestrator] channel_push prefs fetch failed', error)
    return rows
  }
  const muted = new Set<string>()
  for (const row of (data ?? []) as Array<{
    user_id: string
    channel_push: boolean | null
  }>) {
    if (row.channel_push === false) muted.add(row.user_id)
  }
  return muted.size === 0 ? rows : rows.filter((r) => !muted.has(r.user_id))
}

async function fetchBlockedMembershipKeys(
  admin: ReturnType<typeof adminClient>,
  familyIds: string[],
): Promise<Set<string>> {
  if (familyIds.length === 0) return new Set()
  const { data, error } = await admin
    .from('family_members')
    .select('family_id, user_id, role, blocked_at')
    .in('family_id', familyIds)
  if (error) {
    // Fail-open would leak pushes to blocked members. Better to
    // log and treat the whole batch as having an empty blocklist —
    // the DB scrub is the canonical defense; this second query
    // is just hardening.
    console.error('[notifications-orchestrator] family_members fetch failed', error)
    return new Set()
  }
  const out = new Set<string>()
  for (const row of (data ?? []) as Array<{
    family_id: string
    user_id: string
    role: string | null
    blocked_at: string | null
  }>) {
    if (row.role === 'blocked' || row.blocked_at !== null) {
      out.add(`${row.family_id}:${row.user_id}`)
    }
  }
  return out
}

// A notification row ready to fan out to devices. `id` is the row's
// notifications.id (so we can mark exactly the rows that shipped).
interface OutRow {
  id: string
  family_id: string
  user_id: string | null
  title: string
  body: string
  metadata: Record<string, unknown>
}

// Build one Expo message per (row × matching token). A family-broadcast
// row (user_id null) fans out to every member's token; a user-scoped row
// only to that user's tokens. `rowIdByIndex[i]` is the source row id for
// `messages[i]`, kept aligned so we can map Expo's positional tickets
// back to rows.
//
// Push audit (2026-06-15): the previous code used a Map keyed by token
// endpoint and `rows.find(...)`, so each device received only the FIRST
// matching row and any co-occurring notifications were silently dropped
// (and then marked pushed). Iterating rows×tokens fixes that.
function buildMessages(
  rows: OutRow[],
  tokens: PushSubscriptionRow[],
): { messages: ExpoPushMessage[]; rowIdByIndex: string[] } {
  const messages: ExpoPushMessage[] = []
  const rowIdByIndex: string[] = []
  for (const row of rows) {
    for (const sub of tokens) {
      if (sub.family_id !== row.family_id) continue
      if (row.user_id !== null && row.user_id !== sub.user_id) continue
      messages.push({
        to: sub.endpoint,
        sound: 'default',
        title: row.title,
        body: row.body,
        data: row.metadata,
      })
      rowIdByIndex.push(row.id)
    }
  }
  return { messages, rowIdByIndex }
}

// Invoke send-family-push (batch path) and reduce its positional
// `statuses` into the set of row ids that hit a transient 'error' (worth
// retrying). Returns null on a total invocation failure so the caller
// marks nothing and the next run retries. 'removed' (DeviceNotRegistered)
// is NOT an error — the device is gone, retrying won't help.
async function sendMessages(
  admin: ReturnType<typeof adminClient>,
  messages: ExpoPushMessage[],
  rowIdByIndex: string[],
): Promise<{ erroredRowIds: Set<string>; sent: number } | null> {
  const sendResponse = await admin.functions.invoke('send-family-push', {
    body: { messages },
  })
  if (sendResponse.error) {
    console.error('send-family-push failed', sendResponse.error)
    return null
  }
  const statuses = ((sendResponse.data as { statuses?: unknown } | null)?.statuses ??
    []) as Array<'ok' | 'error' | 'removed'>
  const erroredRowIds = new Set<string>()
  let sent = 0
  for (let i = 0; i < rowIdByIndex.length; i++) {
    const st = statuses[i]
    if (st === 'ok') sent++
    else if (st === 'error') erroredRowIds.add(rowIdByIndex[i])
  }
  return { erroredRowIds, sent }
}

// Auditoría 2026-06-11 (H1): los crons SQL legacy (rachas, zombies,
// price hikes, weekly insights) insertan filas en `notifications` pero
// no pushean — quedaban in-app-only para siempre. Este kind relayea
// las filas recientes sin push (allow-list en list_unpushed_notifications,
// kinds cron-only para no duplicar ni checkins ni pushes sociales) y
// las marca con pushed_at. Cron: cada 30 minutos.
async function processPushBacklog() {
  const admin = adminClient()

  const pendingResponse = await admin
    .rpc('list_unpushed_notifications')
    .returns<Array<PendingRow & { id: string }>>()
  if (pendingResponse.error) throw pendingResponse.error
  const rows = pendingResponse.data ?? []
  if (rows.length === 0) {
    return { kind: 'push_backlog', processed: 0, sent: 0, chunks: 0 }
  }

  const chunks = chunk(rows, CHUNK_SIZE)
  let sent = 0
  let marked = 0

  for (const c of chunks) {
    const familyIds = [...new Set(c.map((r) => r.family_id))]
    const userIds = c
      .map((r) => r.user_id)
      .filter((id): id is string => typeof id === 'string')
    const tokens = await fetchPushTokens(admin, familyIds, userIds)

    const outRows: OutRow[] = c.map((r) => ({
      id: r.id,
      family_id: r.family_id,
      user_id: r.user_id,
      title: r.title,
      body: r.body,
      metadata: r.metadata,
    }))
    const { messages, rowIdByIndex } = buildMessages(outRows, tokens)

    let erroredRowIds = new Set<string>()
    if (messages.length > 0) {
      const outcome = await sendMessages(admin, messages, rowIdByIndex)
      if (outcome === null) {
        // Total send failure → mark nothing; the next 30-min run retries
        // (rows stay inside the 24h window).
        continue
      }
      erroredRowIds = outcome.erroredRowIds
      sent += outcome.sent
    }

    // Mark every row that did NOT hit a transient error. Covers:
    //   · no-token rows (in-app-only — retrying won't invent a device)
    //   · delivered rows (≥1 'ok' ticket)
    //   · rows whose only tokens were dead (pruned; no point retrying)
    // Rows with a transient 'error' stay unpushed and are retried.
    const idsToMark = c
      .filter((r) => !erroredRowIds.has(r.id))
      .map((r) => r.id)
    if (idsToMark.length > 0) {
      const markResponse = await admin.rpc('mark_notifications_pushed', {
        p_ids: idsToMark,
      })
      if (markResponse.error) {
        console.error('mark_notifications_pushed failed', markResponse.error)
      } else {
        marked += typeof markResponse.data === 'number' ? markResponse.data : 0
      }
    }
  }

  return { kind: 'push_backlog', processed: marked, sent, chunks: chunks.length }
}

async function processKind(kind: Kind) {
  if (kind === 'push_backlog') {
    return processPushBacklog()
  }
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
  let marked = 0

  for (const c of chunks) {
    // 1. Persist with dedup. The *returning* variant hands back the rows
    //    actually inserted (post-dedup) with their new ids + content, so
    //    we (a) push only fresh rows — no duplicate push for a row that
    //    already existed today — and (b) can mark pushed_at on exactly
    //    what shipped (previously processKind never marked at all,
    //    leaving thousands of rows pushed_at=NULL forever).
    const insertResponse = await admin.rpc('emit_notifications_bulk_returning', {
      p_rows: c,
    })
    if (insertResponse.error) {
      console.error('emit_notifications_bulk_returning failed', insertResponse.error)
      continue
    }
    const inserted = (insertResponse.data ?? []) as OutRow[]
    processed += inserted.length
    if (inserted.length === 0) continue

    // 2. Resolve push tokens for the inserted rows' recipients.
    const familyIds = [...new Set(inserted.map((r) => r.family_id))]
    const userIds = inserted
      .map((r) => r.user_id)
      .filter((id): id is string => typeof id === 'string')
    const tokens = await fetchPushTokens(admin, familyIds, userIds)

    // 3. One message per (row × matching token). A family-broadcast row
    //    (user_id null) fans out to every member's token; a user-scoped
    //    row only to that user's tokens.
    const { messages, rowIdByIndex } = buildMessages(inserted, tokens)

    let erroredRowIds = new Set<string>()
    if (messages.length > 0) {
      const outcome = await sendMessages(admin, messages, rowIdByIndex)
      if (outcome === null) {
        // Total send failure: leave inserted rows unpushed. Allow-listed
        // kinds get retried by the backlog; the rest stay in-app-only.
        continue
      }
      erroredRowIds = outcome.erroredRowIds
      sent += outcome.sent
    }

    // 4. Mark pushed_at on inserted rows that didn't hit a transient
    //    error (delivered, no-token, or only-dead-token rows).
    const idsToMark = inserted
      .filter((r) => !erroredRowIds.has(r.id))
      .map((r) => r.id)
    if (idsToMark.length > 0) {
      const markResponse = await admin.rpc('mark_notifications_pushed', {
        p_ids: idsToMark,
      })
      if (markResponse.error) {
        console.error('mark_notifications_pushed failed', markResponse.error)
      } else {
        marked += typeof markResponse.data === 'number' ? markResponse.data : 0
      }
    }
  }

  return { kind, processed, sent, marked, chunks: chunks.length }
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

  // Caller gate: this function is invoked by pg_cron (via pg_net) and
  // should not be reachable by end users. Defense-in-depth against an
  // authenticated user triggering a full notification fan-out
  // (DoS/cost amplifier at scale).
  //
  // Auditoría 2026-06-11: la rotación de keys dejó stale el secret del
  // vault y TODO el pipeline de push murió en silencio con 401 durante
  // días. Ahora el caller autentica con un secret DEDICADO
  // (`ORCHESTRATOR_CRON_SECRET`, env del function + vault del DB):
  //   · sobrevive rotaciones del service-role key (causa raíz del 401)
  //   · menor blast radius — el bearer que viaja por pg_net solo
  //     autoriza invocar este function, no es la god-key del proyecto.
  // El service-role key se acepta como fallback de compatibilidad.
  const cronSecret = env?.get('ORCHESTRATOR_CRON_SECRET') ?? ''
  const callerToken = extractBearerToken(
    request.headers.get('Authorization') ?? request.headers.get('authorization'),
  )
  const matchesCronSecret =
    Boolean(callerToken) && Boolean(cronSecret) && timingSafeEqual(callerToken!, cronSecret)
  const matchesServiceRole =
    Boolean(callerToken) &&
    Boolean(supabaseServiceRoleKey) &&
    timingSafeEqual(callerToken!, supabaseServiceRoleKey)
  if (!matchesCronSecret && !matchesServiceRole) {
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
