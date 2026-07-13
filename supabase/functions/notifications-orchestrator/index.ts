// notifications-orchestrator
// --------------------------
// Single Edge Function called by pg_cron to fan-out scheduled
// notifications. Replaces the per-row trigger fan-out, which at
// 5k MAU was driving ~5k Edge invocations/day.
//
// Two roles (2026-07 coalescing):
//   · processKind(kind) — for cron-emitted kinds (check-ins, fixed_upcoming):
//     list_pending_notifications → emit_notifications_bulk (INSERT-ONLY, dedup,
//     pushed_at NULL). Does NOT push.
//   · processCoalescedRelay() — kind 'push_backlog', the SOLE pusher: reads all
//     unpushed rows (list_unpushed_notifications), groups by recipient, and
//     sends ONE combined push per user when 2+ are pending (else the single
//     row's push). Marks pushed_at. The in-app feed stays granular.
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

// ─── Coalescing relay ───────────────────────────────────────────────
// Coalescing (owner 2026-07): el relay `push_backlog` es el ÚNICO emisor de
// push. Agrupa TODAS las filas sin pushear por DESTINATARIO y, cuando hay 2+
// para el mismo usuario, manda UN push combinado en vez de N. Los kinds que
// antes pusheaban inline (check-ins, fixed_upcoming) ahora se insertan
// insert-only (ver processKind) y caen acá. El feed in-app queda granular
// (cada fila persiste); solo colapsa el push. Los sociales/de evento no tocan
// esta tabla → siguen instantáneos.

// Una fila candidata a coalescer. Espejo del retorno de
// list_unpushed_notifications (incluye severity + created_at, agregados en la
// migración 20260713120000).
interface CoalescibleRow {
  id: string
  family_id: string
  user_id: string | null
  title: string
  body: string
  kind: string
  severity: string
  metadata: Record<string, unknown>
  created_at: string
}

// Título del push combinado. Gentil / "sin culpa", neutro de horario. Pushes
// server-side son ES-only por ahora (la localización por receptor es un
// follow-up conocido); el body reusa los headlines ya emitidos.
export const COMBINED_PUSH_TITLE = 'Tu resumen de hoy 🌱'
const COMBINED_MAX_ITEMS = 3
// Menor rank = mayor prioridad (para elegir la ruta/data del combinado).
const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  warning: 2,
  info: 3,
  low: 4,
}

// Body combinado: junta los headlines (title de cada fila) por " · ", ordenados
// por hora, cap 3 + "y N más". El `?? ''` en created_at es defensivo: si el edge
// fn se deployara ANTES de la migración 20260713120000 (orden incorrecto), el
// list_unpushed viejo no trae created_at → localeCompare(undefined) crashearía el
// relay. Con el fallback degrada a orden estable sin romper.
export function combineBody(rows: CoalescibleRow[]): string {
  const headlines = [...rows]
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .map((r) => r.title.trim())
    .filter((h) => h.length > 0)
  if (headlines.length <= COMBINED_MAX_ITEMS) return headlines.join(' · ')
  const shown = headlines.slice(0, COMBINED_MAX_ITEMS).join(' · ')
  return `${shown} y ${headlines.length - COMBINED_MAX_ITEMS} más`
}

function highestSeverityRow(rows: CoalescibleRow[]): CoalescibleRow {
  return [...rows].sort(
    (a, b) =>
      (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
      (a.created_at ?? '').localeCompare(b.created_at ?? ''),
  )[0]
}

// send-family-push batchea SOLO a Expo (sendExpoBatch en el path batch). Un
// endpoint web-push le daría a Expo un ticket 'error' PERMANENTE (no
// 'DeviceNotRegistered' → nunca se prunea), y bajo el marcado por-fila una fila
// cuyo único endpoint es web quedaría sin marcar → retry-storm. El path directo
// legacy rutea web a sendWebPush; el batch no. Excluimos web acá.
//
// Filtro por EXCLUSIÓN (no whitelist de prefijo): un endpoint web-push es SIEMPRE
// una URL (https://fcm… / VAPID / Mozilla); un push token de Expo NUNCA lo es.
// Excluir por URL evita descartar un token Expo de formato inesperado (que
// cortaría TODO el push a ese usuario) — la lógica canónica isExpoSubscription
// (send-family-push) además reconoce Expo por sentinels p256dh/auth='expo' que
// fetchPushTokens no trae, así que un whitelist por prefijo daría falsos
// negativos. Un usuario solo-web queda sin mensaje → cae a in-app-only.
function isBatchDeliverable(endpoint: string): boolean {
  const e = endpoint.trim()
  return !e.startsWith('http://') && !e.startsWith('https://')
}

// Agrupa por DESTINATARIO (usuario) y arma UN mensaje por usuario, fan-out a sus
// tokens. Las filas family-wide (user_id null) van a TODOS los miembros con
// token. `rowIdsByIndex[i]` = ids de las filas que componen `messages[i]` (una
// fila family-wide aparece en varios destinatarios → se dedup-marca al final).
export function buildCoalescedMessages(
  rows: CoalescibleRow[],
  tokens: PushSubscriptionRow[],
): { messages: ExpoPushMessage[]; rowIdsByIndex: string[][] } {
  const byUser = new Map<string, { familyId: string; endpoints: string[] }>()
  for (const t of tokens) {
    if (!isBatchDeliverable(t.endpoint)) continue
    let entry = byUser.get(t.user_id)
    if (!entry) {
      entry = { familyId: t.family_id, endpoints: [] }
      byUser.set(t.user_id, entry)
    }
    entry.endpoints.push(t.endpoint)
  }

  const messages: ExpoPushMessage[] = []
  const rowIdsByIndex: string[][] = []
  for (const [userId, { familyId, endpoints }] of byUser) {
    const mine = rows.filter(
      (r) =>
        r.user_id === userId || (r.user_id === null && r.family_id === familyId),
    )
    if (mine.length === 0) continue
    const single = mine.length === 1
    const title = single ? mine[0].title : COMBINED_PUSH_TITLE
    const body = single ? mine[0].body : combineBody(mine)
    const data = single ? mine[0].metadata : highestSeverityRow(mine).metadata
    const ids = mine.map((r) => r.id)
    for (const endpoint of endpoints) {
      messages.push({ to: endpoint, sound: 'default', title, body, data })
      rowIdsByIndex.push(ids)
    }
  }
  return { messages, rowIdsByIndex }
}

type TicketStatus = 'ok' | 'error' | 'removed'

// Envía un chunk de mensajes (send-family-push batchea a Expo 100/req). Devuelve
// el array POSICIONAL de statuses (statuses[j] ↔ messages[j]), o null si la
// invocación falló ENTERA (edge fn caído / 5xx / 401). OJO: send-family-push
// devuelve HTTP 200 aun cuando Expo está caído (deja 'error' y sigue), así que
// `null` NO cubre un outage de Expo — ese caso se detecta por-fila en el caller
// (una fila con todos sus tickets en 'error' no se entregó → no se marca).
async function sendCoalesced(
  admin: ReturnType<typeof adminClient>,
  messages: ExpoPushMessage[],
): Promise<TicketStatus[] | null> {
  const sendResponse = await admin.functions.invoke('send-family-push', {
    body: { messages },
  })
  if (sendResponse.error) {
    console.error('send-family-push failed', sendResponse.error)
    return null
  }
  return ((sendResponse.data as { statuses?: unknown } | null)?.statuses ??
    []) as TicketStatus[]
}

// Ids de fila con ≥1 ticket terminal ('ok' entregado | 'removed' device muerto)
// dado el array posicional de statuses y las filas por-índice del chunk. Una fila
// cuyos tickets fueron TODOS 'error' (o sin status: array corto) NO es terminal →
// no se marca → reintento seguro (no se entregó a nadie). Función pura para poder
// testear el invariante anti-pérdida sin red.
export function terminalRowIds(
  statuses: TicketStatus[],
  rowIdsByIndex: string[][],
): Set<string> {
  const terminal = new Set<string>()
  for (let j = 0; j < rowIdsByIndex.length; j++) {
    const st = statuses[j]
    if (st === 'ok' || st === 'removed') {
      for (const id of rowIdsByIndex[j]) terminal.add(id)
    }
  }
  return terminal
}

// Mensajes por invoke a send-family-push (acota el payload; send-family-push
// batchea a Expo 100/req internamente).
const SEND_CHUNK_SIZE = 500

async function processCoalescedRelay() {
  const admin = adminClient()

  const pendingResponse = await admin
    .rpc('list_unpushed_notifications')
    .returns<CoalescibleRow[]>()
  if (pendingResponse.error) throw pendingResponse.error
  const rows = pendingResponse.data ?? []
  if (rows.length === 0) {
    return { kind: 'push_backlog', processed: 0, sent: 0 }
  }

  // Todos los tokens de familia válidos (family-wide necesita todos los
  // miembros; el agrupado por usuario re-aplica el user-scoping). userIds=[]
  // → fetchPushTokens devuelve todos los family-scoped + filtra blocked/muted.
  const familyIds = [...new Set(rows.map((r) => r.family_id))]
  const tokens = await fetchPushTokens(admin, familyIds, [])

  const { messages, rowIdsByIndex } = buildCoalescedMessages(rows, tokens)

  // Marcado POR-FILA-TERMINAL: una fila se marca pushed sólo si tuvo ≥1 ticket
  // terminal ('ok' entregado, o 'removed' device muerto) en este chunk. Si TODOS
  // sus tickets fueron 'error' (Expo 429/5xx/caído — send-family-push devuelve 200
  // igual) la fila no se entregó a NADIE → queda sin marcar → reintento seguro
  // (cero riesgo de dup). Una fila con algún 'ok' se marca aunque otro de sus
  // tickets errore (fan-out parcial: reintentar re-pushearía a quien ya recibió).
  // Se marca por-chunk (no al final) para que un timeout del edge fn a mitad del
  // drenaje no re-envíe lo ya enviado la próxima corrida.
  let sent = 0
  let marked = 0
  const markPushed = async (ids: string[]) => {
    if (ids.length === 0) return
    // Entregamos ANTES de marcar; si el mark falla en silencio la fila queda
    // pushed_at NULL y la próxima corrida la re-pushea (el spam que este feature
    // elimina). No hay atomicidad posible entre Expo y Postgres, pero un retry
    // corto cierra casi toda la ventana de un blip de DB.
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await admin.rpc('mark_notifications_pushed', { p_ids: ids })
      if (!res.error) {
        marked += typeof res.data === 'number' ? res.data : 0
        return
      }
      console.error('mark_notifications_pushed failed', {
        attempt,
        error: res.error,
      })
      if (attempt < 2) await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
    }
  }

  for (let i = 0; i < messages.length; i += SEND_CHUNK_SIZE) {
    const mChunk = messages.slice(i, i + SEND_CHUNK_SIZE)
    const rChunk = rowIdsByIndex.slice(i, i + SEND_CHUNK_SIZE)
    const statuses = await sendCoalesced(admin, mChunk)
    if (statuses === null) continue // invoke falló entero → reintento próxima corrida
    for (const st of statuses) if (st === 'ok') sent++
    await markPushed([...terminalRowIds(statuses, rChunk)])
  }

  // Filas sin ningún mensaje (in-app-only: usuario sin token Expo, o family-wide
  // sin miembros con token). Nunca se intentan por push → marcarlas para que no
  // queden re-seleccionadas indefinidamente.
  const inAnyMessage = new Set(rowIdsByIndex.flat())
  await markPushed(rows.filter((r) => !inAnyMessage.has(r.id)).map((r) => r.id))

  return { kind: 'push_backlog', processed: marked, sent }
}

// Los kinds cron-emitidos (check-ins, fixed_upcoming) ya NO pushean inline: se
// insertan insert-only (pushed_at NULL) con dedup, y processCoalescedRelay los
// pushea combinados. Así 2+ notifs que caen juntas para un mismo usuario
// colapsan en 1 push. (Antes: emit_returning + push inline por fila.)
async function processKind(kind: Kind) {
  if (kind === 'push_backlog') {
    return processCoalescedRelay()
  }
  const admin = adminClient()

  const pendingResponse = await admin
    .rpc('list_pending_notifications', { p_kind: kind })
    .returns<PendingRow[]>()
  if (pendingResponse.error) throw pendingResponse.error
  const pending = pendingResponse.data ?? []
  if (pending.length === 0) {
    return { kind, processed: 0 }
  }

  const chunks = chunk(pending, CHUNK_SIZE)
  let processed = 0
  for (const c of chunks) {
    // Insert-only con dedup (on conflict dedup_key do nothing). Deja pushed_at
    // NULL → el relay coalescente se encarga del push.
    const insertResponse = await admin.rpc('emit_notifications_bulk', { p_rows: c })
    if (insertResponse.error) {
      console.error('emit_notifications_bulk failed', insertResponse.error)
      continue
    }
    processed += typeof insertResponse.data === 'number' ? insertResponse.data : 0
  }

  return { kind, processed, inserted: true, chunks: chunks.length }
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
