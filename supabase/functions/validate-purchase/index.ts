// validate-purchase
// -----------------
// Cliente → servidor, tras una compra o un restore de StoreKit 2. Es el ÚNICO
// punto donde un recibo de Apple se valida criptográficamente desde el cliente
// y donde el mapping `original_transaction_id → family_id` se establece. Ver el
// spec canónico §2:
//   docs/superpowers/specs/2026-06-12-apple-subscriptions-design.md
//
// Contrato (§2):
//   1. Autentica al usuario de Supabase (JWT del cliente en Authorization).
//   2. Recibe { jws } — el `jwsRepresentation` (signed transaction de
//      StoreKit 2).
//   3. Verifica el JWS OFFLINE con `verifyAppleJws` (módulo compartido):
//      cadena x5c → Apple Root CA-G3 pineado (secret APPLE_ROOT_CA_G3) +
//      firma ES256 + bundleId (secret APPLE_BUNDLE_ID). Recién entonces
//      confía en el payload.
//   4. Extrae original_transaction_id, product_id, expires_date,
//      appAccountToken (= family_id), environment, signed_date.
//   5. Compra NUEVA (no existe family_entitlements con ese
//      original_transaction_id): verifica que el appAccountToken (family_id)
//      sea una familia donde el usuario autenticado es miembro activo. Si no,
//      403. Con OK: setea el mapping (UPDATE family_entitlements SET
//      original_transaction_id ... WHERE family_id) y llama
//      apply_subscription_transaction con status 'active'.
//   6. RESTORE (ya existe mapping): rutea por original_transaction_id.
//      - Mapping → familia ACTUAL del usuario  → re-sincroniza
//        (apply_subscription_transaction) y devuelve el entitlement.
//      - Mapping → OTRA familia (purchaser que se mudó de hogar) → devuelve
//        { error: 'SUBSCRIPTION_BOUND_TO_OTHER_FAMILY' } con status 409 — un
//        código DISTINGUIBLE, nunca un fallo genérico a alguien que paga.
//
// La escritura va con el service-role client (las RPCs son security definer);
// la AUTENTICACIÓN del caller usa el anon client + auth.getUser(token) para
// resolver el user_id sin que el cliente lo pueda falsificar — el patrón de
// register-push-subscription / send-family-push.
//
// POST /functions/v1/validate-purchase
// Body { jws: string }
// Auth Supabase user JWT.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  extractTransactionPayload,
  verifyAppleJws,
  type AppleTransactionInfo,
} from '../_shared/apple-jws.ts'

interface RequestBody {
  jws?: string
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
const appleBundleId = env?.get('APPLE_BUNDLE_ID') ?? ''
const appleRootCaG3 = env?.get('APPLE_ROOT_CA_G3') ?? ''

// CORS allowlist — parity con las otras edge functions. Los callers mobile
// no leen CORS, pero la función queda expuesta sobre HTTP público.
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

// RFC 6750 §2.1 bearer parser — exige el prefijo literal `Bearer `
// (case-insensitive). NO hay fallback a "el header crudo es el token"
// (la regresión cerrada en Sprint H-8 / I-2 en las otras funciones).
function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null
  const normalized = authorizationHeader.trim()
  if (!normalized) return null
  const bearerPrefix = 'bearer '
  if (!normalized.toLowerCase().startsWith(bearerPrefix)) return null
  return normalized.slice(bearerPrefix.length).trim() || null
}

// Igualdad constant-time para el reject del service-role token (parity con
// register-push-subscription / send-family-push).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

function isServerReady(): boolean {
  return Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      supabaseServiceRoleKey &&
      appleBundleId &&
      appleRootCaG3,
  )
}

// Tope de tamaño del JWS — un signed transaction real ronda 2–4 KB; el cap es
// holgado pero corta payloads abusivos antes de gastar CPU en crypto.
const MAX_JWS_LEN = 16_384

/** Fila relevante de family_entitlements para el routing de restore. */
interface EntitlementRow {
  family_id: string
  subscription_status: string | null
  product_id: string | null
  pending_product_id: string | null
  expires_at: string | null
  grace_expires_at: string | null
  auto_renew: boolean | null
  environment: string | null
  comped: boolean | null
}

const ENTITLEMENT_COLUMNS =
  'family_id, subscription_status, product_id, pending_product_id, expires_at, grace_expires_at, auto_renew, environment, comped'

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
          'Missing env vars (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, APPLE_BUNDLE_ID, APPLE_ROOT_CA_G3).',
      },
      500,
      cors,
    )
  }

  // ── Body ──────────────────────────────────────────────────────────────────
  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload.' }, 400, cors)
  }
  const jws = typeof body.jws === 'string' ? body.jws.trim() : ''
  if (!jws) {
    return jsonResponse({ error: 'jws is required.' }, 400, cors)
  }
  if (jws.length > MAX_JWS_LEN) {
    return jsonResponse({ error: 'jws too large.' }, 400, cors)
  }

  // ── Auth: bearer token requerido, sin excepciones ──────────────────────────
  const bearer = extractBearerToken(
    request.headers.get('Authorization') ?? request.headers.get('authorization'),
  )
  if (!bearer) {
    return jsonResponse({ error: 'Unauthorized (missing token).' }, 401, cors)
  }
  // Reject explícito del service-role token: auth.getUser lo resuelve a un
  // payload "user-shaped" del service-principal — sin este gate, quien tuviera
  // la service-role key podría acreditar compras a familias arbitrarias.
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

  // ── Verificación del JWS (offline, root pineado) ──────────────────────────
  // NO pasamos expectedEnvironment: en validate-purchase aceptamos Sandbox y
  // Production (un build de TestFlight/sandbox debe poder validar). El guard
  // de environment "duro" vive en el webhook (§2), no acá.
  const verifyResult = await verifyAppleJws<AppleTransactionInfo>(jws, {
    appleRootCaG3,
    expectedBundleId: appleBundleId,
    // Este JWS ES una transacción de StoreKit 2 → SIEMPRE trae bundleId. Lo
    // exigimos: un payload sin bundleId no es una transacción legítima.
    requireBundleId: true,
  })
  if (!verifyResult.ok) {
    // JWS inválido → 400 (no es un problema de auth ni de servidor). El motivo
    // tipado va al log para diagnóstico; el cliente recibe un código estable.
    console.error('[validate-purchase] JWS verification failed', {
      reason: verifyResult.reason,
      userId,
    })
    return jsonResponse(
      { error: 'INVALID_RECEIPT', reason: verifyResult.reason },
      400,
      cors,
    )
  }

  // ── Extracción del payload normalizado ────────────────────────────────────
  const tx = extractTransactionPayload(verifyResult.payload)
  const originalTransactionId = tx.originalTransactionId
  if (!originalTransactionId) {
    return jsonResponse(
      { error: 'INVALID_RECEIPT', reason: 'missing_original_transaction_id' },
      400,
      cors,
    )
  }
  const productId = tx.productId
  const expiresAt = tx.expiresDate ? tx.expiresDate.toISOString() : null
  const environment = tx.environment
  const signedAt = (tx.signedDate ?? new Date()).toISOString()
  // appAccountToken = family_id en la compra. Autoritativo SOLO para el
  // bootstrap de la compra nueva (§2); en restore ruteamos por OTID.
  const appAccountToken = tx.appAccountToken

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey)

  // ── Routing: ¿existe ya un mapping para este original_transaction_id? ──────
  const existingResp = await admin
    .from('family_entitlements')
    .select(ENTITLEMENT_COLUMNS)
    .eq('original_transaction_id', originalTransactionId)
    .maybeSingle()

  if (existingResp.error) {
    console.error('[validate-purchase] mapping lookup failed', existingResp.error)
    return jsonResponse({ error: 'internal' }, 500, cors)
  }

  // ════════════════════════════════════════════════════════════════════════
  // RESTORE — el mapping ya existe. Ruteo por original_transaction_id.
  // ════════════════════════════════════════════════════════════════════════
  if (existingResp.data) {
    const mapped = existingResp.data as EntitlementRow

    // ¿La familia mapeada es la familia ACTUAL del usuario autenticado? Esto
    // es lo que distingue "restore en mi hogar" de "purchaser que se mudó".
    const isMember = await isActiveMemberOfFamily(admin, userId, mapped.family_id)
    if (isMember === null) {
      return jsonResponse({ error: 'internal' }, 500, cors)
    }

    if (!isMember) {
      // El mapping apunta a OTRA familia → código DISTINGUIBLE (no genérico),
      // el cliente muestra el mensaje accionable de §2. 409 Conflict.
      console.warn('[validate-purchase] restore bound to other family', {
        userId,
        originalTransactionId,
        boundFamilyId: mapped.family_id,
      })
      return jsonResponse(
        { error: 'SUBSCRIPTION_BOUND_TO_OTHER_FAMILY' },
        409,
        cors,
      )
    }

    // Caso feliz: re-sincronizamos el entitlement de la familia con el estado
    // del recibo (idempotente por signed_date dentro de la RPC) y devolvemos.
    const applyError = await applyTransaction(admin, {
      familyId: mapped.family_id,
      originalTransactionId,
      productId,
      expiresAt,
      environment,
      signedAt,
      purchaserUserId: userId,
    })
    if (applyError) {
      console.error('[validate-purchase] restore apply failed', applyError)
      return jsonResponse({ error: 'internal' }, 500, cors)
    }

    const entitlement = await fetchEntitlement(admin, mapped.family_id)
    return jsonResponse(
      { ok: true, mode: 'restore', familyId: mapped.family_id, entitlement },
      200,
      cors,
    )
  }

  // ════════════════════════════════════════════════════════════════════════
  // COMPRA NUEVA — no hay mapping. El appAccountToken (= family_id) es
  // autoritativo SOLO acá, y ÚNICAMENTE si el usuario es miembro activo de esa
  // familia (un usuario no puede acreditar una compra a otra familia).
  // ════════════════════════════════════════════════════════════════════════
  if (!appAccountToken || !isUuid(appAccountToken)) {
    return jsonResponse(
      { error: 'INVALID_RECEIPT', reason: 'missing_app_account_token' },
      400,
      cors,
    )
  }
  const familyId = appAccountToken

  const isMember = await isActiveMemberOfFamily(admin, userId, familyId)
  if (isMember === null) {
    return jsonResponse({ error: 'internal' }, 500, cors)
  }
  if (!isMember) {
    // El usuario adjuntó un family_id del que no es miembro activo → 403.
    console.warn('[validate-purchase] purchase credited to a non-member family', {
      userId,
      familyId,
      originalTransactionId,
    })
    return jsonResponse(
      { error: 'FORBIDDEN_FAMILY', reason: 'not_active_member' },
      403,
      cors,
    )
  }

  // Persistir el mapping `original_transaction_id → family_id`. La fila de
  // family_entitlements ya existe (trigger seed_family_entitlement), así que
  // es un UPDATE sobre la fila de la familia. Lo seteamos en un paso explícito
  // para detectar la colisión del unique constraint con un código claro.
  const mappingResp = await admin
    .from('family_entitlements')
    .update({ original_transaction_id: originalTransactionId })
    .eq('family_id', familyId)
    .is('original_transaction_id', null)
    .select('family_id')
    .maybeSingle()

  if (mappingResp.error) {
    // 23505 = unique_violation: otro family_entitlements ya tiene este OTID.
    // Carrera con el webhook bootstrap o con otra familia → ruteamos como
    // "ligado a otra familia" para no dar un error opaco a alguien que paga.
    if ((mappingResp.error as { code?: string }).code === '23505') {
      console.warn('[validate-purchase] OTID already mapped elsewhere (race)', {
        userId,
        familyId,
        originalTransactionId,
      })
      return jsonResponse(
        { error: 'SUBSCRIPTION_BOUND_TO_OTHER_FAMILY' },
        409,
        cors,
      )
    }
    console.error('[validate-purchase] mapping write failed', mappingResp.error)
    return jsonResponse({ error: 'internal' }, 500, cors)
  }
  if (!mappingResp.data) {
    // La fila de esta familia ya tenía un original_transaction_id distinto
    // (el `.is(..., null)` no matcheó). El webhook ya bootstrappeó otra sub
    // para esta familia: re-leemos y resolvemos sin pisar.
    const current = await admin
      .from('family_entitlements')
      .select('original_transaction_id')
      .eq('family_id', familyId)
      .maybeSingle()
    const currentOtid = (current.data as { original_transaction_id?: string | null } | null)
      ?.original_transaction_id
    if (currentOtid && currentOtid !== originalTransactionId) {
      // La familia ya está suscripta con OTRA transacción. No clobbereamos;
      // devolvemos el entitlement vigente (el cliente ya tiene acceso).
      const entitlement = await fetchEntitlement(admin, familyId)
      return jsonResponse(
        { ok: true, mode: 'already_subscribed', familyId, entitlement },
        200,
        cors,
      )
    }
    // currentOtid === originalTransactionId: lo seteó una llamada concurrente
    // a este mismo recibo; seguimos al apply (idempotente).
  }

  // Aplicar la transacción: status 'active' para una compra nueva válida.
  const applyError = await applyTransaction(admin, {
    familyId,
    originalTransactionId,
    productId,
    expiresAt,
    environment,
    signedAt,
    purchaserUserId: userId,
  })
  if (applyError) {
    console.error('[validate-purchase] new purchase apply failed', applyError)
    return jsonResponse({ error: 'internal' }, 500, cors)
  }

  const entitlement = await fetchEntitlement(admin, familyId)
  return jsonResponse(
    { ok: true, mode: 'purchase', familyId, entitlement },
    200,
    cors,
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

// `createClient` sin genéricos resuelve a un overload cuyo `ReturnType` queda
// parametrizado con `never` y no matchea la instancia real (createClient(url,
// key)). Capturamos el tipo desde una invocación concreta — el mismo shape que
// usamos en `handler` — para que los helpers acepten ese client sin fricción.
type AdminClient = ReturnType<typeof makeClient>
function makeClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey)
}

/**
 * ¿El usuario es miembro ACTIVO (role <> 'blocked', sin blocked_at) de esta
 * familia? Devuelve `null` ante error de DB (el caller responde 500).
 */
async function isActiveMemberOfFamily(
  admin: AdminClient,
  userId: string,
  familyId: string,
): Promise<boolean | null> {
  const resp = await admin
    .from('family_members')
    .select('role, blocked_at')
    .eq('user_id', userId)
    .eq('family_id', familyId)
    .maybeSingle()
  if (resp.error) {
    console.error('[validate-purchase] membership lookup failed', resp.error)
    return null
  }
  if (!resp.data) return false
  const member = resp.data as { role?: string | null; blocked_at?: string | null }
  if (member.role === 'blocked' || member.blocked_at) return false
  return true
}

interface ApplyArgs {
  familyId: string
  originalTransactionId: string
  productId: string | null
  expiresAt: string | null
  environment: string | null
  signedAt: string
  purchaserUserId: string
}

/**
 * Llama a la RPC `apply_subscription_transaction` (único punto de escritura,
 * security definer, idempotente por signed_date). status 'active' — esta
 * función solo aplica compras/restores válidos; el ciclo de vida
 * (grace/expired/...) lo maneja el webhook. Devuelve un Error o `null`.
 */
async function applyTransaction(admin: AdminClient, args: ApplyArgs): Promise<Error | null> {
  const { error } = await admin.rpc('apply_subscription_transaction', {
    p_family_id: args.familyId,
    p_original_transaction_id: args.originalTransactionId,
    p_status: 'active',
    p_product_id: args.productId,
    p_expires_at: args.expiresAt,
    p_grace_expires_at: null,
    p_auto_renew: true,
    p_environment: args.environment,
    p_signed_date: args.signedAt,
    p_purchaser_user_id: args.purchaserUserId,
    p_pending_product_id: null,
  })
  return error ? new Error(error.message) : null
}

/** Lee el entitlement vigente de la familia para devolverlo al cliente. */
async function fetchEntitlement(
  admin: AdminClient,
  familyId: string,
): Promise<EntitlementRow | null> {
  const resp = await admin
    .from('family_entitlements')
    .select(ENTITLEMENT_COLUMNS)
    .eq('family_id', familyId)
    .maybeSingle()
  if (resp.error) {
    console.error('[validate-purchase] entitlement fetch failed', resp.error)
    return null
  }
  return (resp.data as EntitlementRow | null) ?? null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

if (!denoGlobal.Deno?.serve) {
  throw new Error('This function must run on Deno runtime.')
}

denoGlobal.Deno.serve(handler)
