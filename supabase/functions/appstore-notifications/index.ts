// appstore-notifications — App Store Server Notifications v2 (ASSN v2) webhook
// ============================================================================
//
// Apple → servidor. Apple le pega a esta URL en cada evento del ciclo de vida
// de una suscripción (renovó, falló, venció, gracia, reembolso, revoke, …) con
// un único `signedPayload` (JWS ES256). Es lo que mantiene el entitlement de la
// familia fresco aunque el cliente esté offline.
//
// Spec canónico (contrato exacto): docs/superpowers/specs/2026-06-12-apple-
// subscriptions-design.md §2 (`appstore-notifications`).
//
// MODELO DE CONFIANZA — esto NO es una edge function con auth de usuario
// ----------------------------------------------------------------------
// A diferencia de send-family-push / register-push-subscription, este endpoint
// es server-to-server desde Apple: NO trae un JWT de Supabase ni un origin de
// browser. La confianza viene 100% de la firma criptográfica del `signedPayload`
// (cadena x5c → Apple Root CA-G3 pineado + firma ES256). Por eso:
//   • verify_jwt = false en config.toml (no hay token de gateway que validar).
//   • No hay CORS (Apple no es un browser).
//   • Cliente service_role (el único punto de escritura es la RPC
//     apply_subscription_transaction, security definer; la tabla
//     family_entitlements tiene RLS with-check(false)).
//
// FORMA DEL CUERPO (ASSN v2): { "signedPayload": "<JWS compact>" }. El payload
// decodificado (`responseBodyV2DecodedPayload`) trae:
//   notificationType, subtype, notificationUUID, signedDate,
//   data: { signedTransactionInfo, signedRenewalInfo, bundleId, environment }.
// `signedTransactionInfo` y `signedRenewalInfo` son JWS ANIDADOS firmados por
// separado: se re-verifican con verifyAppleJws antes de confiar en su contenido.
//
// FLUJO (orden exacto del spec §2):
//   1. Verificar el JWS del envelope (root pineado, bundleId).
//   2. Re-verificar el JWS anidado de la transacción → fuente de
//      original_transaction_id / product_id / expires / appAccountToken /
//      signed_date / environment.
//   3. GUARD de environment: Sandbox bajo prod ENV → audit + 200 + skip de TODA
//      mutación (un evento de sandbox NUNCA muta un entitlement de producción).
//   4. DEDUP por tabla: insert en subscription_events keyed por notification_uuid;
//      conflicto → ya procesado → 200 y corta.
//   5. ROUTING por original_transaction_id contra family_entitlements:
//        • mapping existe → usarlo (appAccountToken del payload es informativo,
//          NUNCA autoritativo: Apple lo persiste de la transacción original y
//          queda stale si el purchaser cambió de familia).
//        • mapping NO existe Y SUBSCRIBED/INITIAL_BUY|RESUBSCRIBE → BOOTSTRAP:
//          usar el appAccountToken de ESTA transacción (= la familia compradora)
//          para anclar el mapping. Robustez: si el cliente compró pero crasheó
//          antes de validate-purchase, el webhook crea el entitlement. El JWS
//          está verificado → el appAccountToken es auténtico.
//        • mapping NO existe y NO es initial buy → audit + 200, sin mutar.
//   6. Mapear notificationType → efecto y llamar apply_subscription_transaction
//      (el ordering por signed_date vive adentro de la RPC).
//   7. 200 SIEMPRE que el procesamiento sea idempotente-ok (Apple reintenta en
//      no-200, hasta ~5 veces). Errores REALES de verificación → 400.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.0'
import {
  type AppleNotificationPayload,
  type AppleTransactionInfo,
  extractNotificationPayload,
  extractTransactionPayload,
  verifyAppleJws,
} from '../_shared/apple-jws.ts'

interface WebhookBody {
  signedPayload?: string
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
const appleRootCaG3 = env?.get('APPLE_ROOT_CA_G3') ?? ''
const expectedBundleId = env?.get('APPLE_BUNDLE_ID') ?? ''
// El spec (§2) nombra el secret `ENV` ('production' | 'development'); el prompt
// de implementación lo llamó `APP_ENV`. Aceptamos ambos para no acoplarnos a un
// nombre y que el guard funcione cualquiera sea el que el owner cargó.
const appEnv = (env?.get('ENV') ?? env?.get('APP_ENV') ?? '').toLowerCase()
const isProductionEnv = appEnv === 'production'

function isServerReady(): boolean {
  return Boolean(supabaseUrl && supabaseServiceRoleKey && appleRootCaG3 && expectedBundleId)
}

/** Respuesta JSON simple. Apple no lee CORS — sin headers de origin. */
function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ───────────────────────────────────────────────────────────────────────────
// Efecto de cada notificationType sobre el entitlement (spec §2, tabla)
// ───────────────────────────────────────────────────────────────────────────

type SubscriptionStatus = 'none' | 'active' | 'grace' | 'expired'

interface TransactionFacts {
  originalTransactionId: string
  productId: string | null
  expiresAt: Date | null
  signedDate: Date | null
  environment: 'Sandbox' | 'Production' | null
  appAccountToken: string | null
}

/**
 * Lo que escribimos en family_entitlements para este evento. `null` en un campo
 * = "no lo toques" (la RPC hace coalesce salvo en los que sí limpiamos
 * explícitamente: pending_product_id y grace_expires_at se setean SIEMPRE al
 * valor calculado — `null` ahí significa "limpiar", que es lo correcto cuando
 * no hay downgrade pendiente ni gracia).
 */
interface EntitlementEffect {
  status: SubscriptionStatus
  productId: string | null
  pendingProductId: string | null
  expiresAt: Date | null
  graceExpiresAt: Date | null
  autoRenew: boolean | null
  /** Si false, el evento se audita pero NO muta el entitlement. */
  mutate: boolean
}

/** Renewal info del JWS anidado `signedRenewalInfo` (parcial, lo que usamos). */
interface AppleRenewalInfo {
  autoRenewStatus?: number // 0 = off, 1 = on
  autoRenewProductId?: string // producto que se renovará (upgrade/downgrade)
  gracePeriodExpiresDate?: number // ms epoch, presente en GRACE_PERIOD
  [k: string]: unknown
}

const NO_OP_AUDIT: EntitlementEffect = {
  status: 'none',
  productId: null,
  pendingProductId: null,
  expiresAt: null,
  graceExpiresAt: null,
  autoRenew: null,
  mutate: false,
}

/**
 * Mapea (notificationType, subtype, transactionFacts, renewalInfo) → efecto.
 * Casos EXACTOS del spec §2. El ordering por signed_date NO vive acá: lo hace
 * apply_subscription_transaction. Acá solo decidimos QUÉ aplicar.
 */
function effectForNotification(
  notificationType: string,
  subtype: string | null,
  tx: TransactionFacts,
  renewal: AppleRenewalInfo | null,
): EntitlementEffect {
  const graceFromRenewal = msToDateLocal(renewal?.gracePeriodExpiresDate)
  const autoRenew =
    renewal && typeof renewal.autoRenewStatus === 'number'
      ? renewal.autoRenewStatus === 1
      : null
  const autoRenewProductId =
    renewal && typeof renewal.autoRenewProductId === 'string'
      ? renewal.autoRenewProductId
      : null

  switch (notificationType) {
    // ── Alta / re-alta: active, set product/expires ───────────────────────
    case 'SUBSCRIBED': // subtype: INITIAL_BUY | RESUBSCRIBE
      return {
        status: 'active',
        productId: tx.productId,
        pendingProductId: null,
        expiresAt: tx.expiresAt,
        graceExpiresAt: null,
        autoRenew,
        mutate: true,
      }

    // ── Renovó: active, bump expires, limpiar grace, aplicar pending ──────
    // El producto efectivo tras renovar es el productId de la nueva
    // transacción (si hubo upgrade/downgrade ya aplicado, viene reflejado).
    // pending_product_id se limpia (la RPC lo setea al valor que pasemos:
    // null = "se aplicó/no hay pendiente").
    case 'DID_RENEW':
      return {
        status: 'active',
        productId: tx.productId,
        pendingProductId: null,
        expiresAt: tx.expiresAt,
        graceExpiresAt: null, // limpiar grace
        autoRenew,
        mutate: true,
      }

    // ── Falló la renovación ───────────────────────────────────────────────
    case 'DID_FAIL_TO_RENEW':
      if (subtype === 'GRACE_PERIOD') {
        // Período de gracia: el acceso CONTINÚA hasta grace_expires_at.
        return {
          status: 'grace',
          productId: tx.productId,
          pendingProductId: null,
          expiresAt: tx.expiresAt,
          graceExpiresAt: graceFromRenewal,
          autoRenew,
          mutate: true,
        }
      }
      // Retry sin gracia: mantener el estado vigente hasta expires_at. No
      // forzamos un status nuevo (no hay grace_expires_date); auditamos y
      // dejamos que EXPIRED/DID_RENEW resuelvan. El acceso sigue por la
      // resolución (active hasta expires_at).
      return NO_OP_AUDIT

    // ── Venció / gracia vencida: bloqueo ──────────────────────────────────
    case 'EXPIRED':
    case 'GRACE_PERIOD_EXPIRED':
      return {
        status: 'expired',
        productId: tx.productId,
        pendingProductId: null,
        expiresAt: tx.expiresAt,
        graceExpiresAt: null,
        autoRenew,
        mutate: true,
      }

    // ── Cambió el flag de auto-renovación: sigue activo hasta expires_at ──
    case 'DID_CHANGE_RENEWAL_STATUS':
      return {
        status: 'active',
        productId: tx.productId,
        pendingProductId: null,
        expiresAt: tx.expiresAt,
        // autoRenewStatus viene en el renewalInfo; si por algún motivo no
        // está, derivamos del subtype AUTO_RENEW_ENABLED/DISABLED.
        autoRenew:
          autoRenew ??
          (subtype === 'AUTO_RENEW_DISABLED'
            ? false
            : subtype === 'AUTO_RENEW_ENABLED'
              ? true
              : null),
        graceExpiresAt: null,
        mutate: true,
      }

    // ── Cambió la preferencia de renovación (upgrade / downgrade) ─────────
    case 'DID_CHANGE_RENEWAL_PREF':
      if (subtype === 'UPGRADE') {
        // Upgrade = nueva transacción inmediata; el product_id cambia YA.
        return {
          status: 'active',
          productId: tx.productId,
          pendingProductId: null,
          expiresAt: tx.expiresAt,
          graceExpiresAt: null,
          autoRenew,
          mutate: true,
        }
      }
      // Downgrade = se aplica al PRÓXIMO ciclo: registrar pending_product_id
      // (el producto al que va a renovar), sin tocar el product_id vigente.
      // Para no pisar product_id ni expires con la transacción VIEJA, no los
      // mandamos (productId/expiresAt = null → coalesce mantiene el actual);
      // solo seteamos pending_product_id.
      return {
        status: 'active',
        productId: null,
        pendingProductId: autoRenewProductId,
        expiresAt: null,
        graceExpiresAt: null,
        autoRenew,
        mutate: true,
      }

    // ── Reembolso: revocar ────────────────────────────────────────────────
    case 'REFUND':
      return {
        status: 'expired',
        productId: tx.productId,
        pendingProductId: null,
        expiresAt: tx.expiresAt,
        graceExpiresAt: null,
        autoRenew,
        mutate: true,
      }

    // ── Reembolso revertido: re-otorgar ──────────────────────────────────
    case 'REFUND_REVERSED':
      return {
        status: 'active',
        productId: tx.productId,
        pendingProductId: null,
        expiresAt: tx.expiresAt,
        graceExpiresAt: null,
        autoRenew,
        mutate: true,
      }

    // ── Revoke (Family Sharing): revocar ──────────────────────────────────
    case 'REVOKE':
      return {
        status: 'expired',
        productId: tx.productId,
        pendingProductId: null,
        expiresAt: tx.expiresAt,
        graceExpiresAt: null,
        autoRenew,
        mutate: true,
      }

    // ── TEST: validación del endpoint (botón "Request a Test Notification") ─
    // No trae transacción real → ya lo cortamos antes de acá; defensivo.
    case 'TEST':
      return NO_OP_AUDIT

    // ── Cualquier otro tipo: auditar + 200, sin mutar ─────────────────────
    default:
      return NO_OP_AUDIT
  }
}

function msToDateLocal(ms: unknown): Date | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null
  return new Date(ms)
}

// ───────────────────────────────────────────────────────────────────────────
// Persistencia
// ───────────────────────────────────────────────────────────────────────────

/**
 * Inserta el evento en subscription_events (dedup + audit). Devuelve:
 *   'inserted'  → es nuevo, seguir procesando.
 *   'duplicate' → notification_uuid ya visto, cortar con 200.
 *   'error'     → fallo de DB (el caller decide si reintentar / 500).
 */
async function recordEvent(
  admin: SupabaseClient,
  row: {
    notificationUuid: string
    originalTransactionId: string
    notificationType: string
    subtype: string | null
    signedDate: Date
    environment: string
    rawPayload: unknown
  },
): Promise<'inserted' | 'duplicate' | 'error'> {
  const insert = await admin.from('subscription_events').insert({
    notification_uuid: row.notificationUuid,
    original_transaction_id: row.originalTransactionId,
    // notification_type + subtype en una sola columna (el spec lo permite:
    // "notification_type text not null -- + subtype si aplica").
    notification_type: row.subtype
      ? `${row.notificationType}:${row.subtype}`
      : row.notificationType,
    signed_date: row.signedDate.toISOString(),
    environment: row.environment,
    raw_payload: row.rawPayload,
  })

  if (!insert.error) return 'inserted'
  // 23505 = unique_violation → ya procesado (dedup). Idempotente.
  const code = (insert.error as { code?: string }).code
  if (code === '23505') return 'duplicate'
  console.error('[appstore-notifications] subscription_events insert failed', insert.error)
  return 'error'
}

/**
 * Resuelve el family_id objetivo del evento por routing (spec §2 paso 5):
 *   - mapping existe (original_transaction_id) → esa familia.
 *   - bootstrap (initial buy sin mapping) → la familia del appAccountToken.
 *   - else → null (audit + skip).
 */
async function resolveTargetFamily(
  admin: SupabaseClient,
  tx: TransactionFacts,
  notificationType: string,
  subtype: string | null,
): Promise<
  | { kind: 'mapped'; familyId: string }
  | { kind: 'bootstrap'; familyId: string }
  | { kind: 'unmapped' }
> {
  // 1) ¿Existe el mapping por original_transaction_id?
  const mapped = await admin
    .from('family_entitlements')
    .select('family_id')
    .eq('original_transaction_id', tx.originalTransactionId)
    .maybeSingle()

  if (mapped.error) {
    console.error('[appstore-notifications] entitlement lookup failed', mapped.error)
    throw new Error('entitlement_lookup_failed')
  }
  if (mapped.data) {
    return { kind: 'mapped', familyId: (mapped.data as { family_id: string }).family_id }
  }

  // 2) Sin mapping. Solo bootstrapeamos en la compra inicial / re-suscripción.
  const isInitialBuy =
    notificationType === 'SUBSCRIBED' &&
    (subtype === 'INITIAL_BUY' || subtype === 'RESUBSCRIBE')

  if (!isInitialBuy) {
    // Renovación/expiración de una sub que nunca vimos → no hay a quién
    // acreditar. Audit + 200 (ya quedó en subscription_events).
    return { kind: 'unmapped' }
  }

  // BOOTSTRAP: el appAccountToken de ESTA transacción es la familia compradora.
  // El JWS está verificado, así que el token es auténtico. Confirmamos que la
  // familia existe (tiene su fila de entitlement seedeada por trigger) antes de
  // anclar el mapping. El check de membresía vive en validate-purchase; el
  // webhook confía en el token firmado (peor caso: un pagante acredita otra
  // familia, su propia pérdida — ver spec §2).
  const familyId = tx.appAccountToken
  if (!familyId || !isUuid(familyId)) {
    // Sin appAccountToken usable no podemos bootstrapear. Audit + 200.
    console.warn('[appstore-notifications] initial buy without usable appAccountToken', {
      originalTransactionId: tx.originalTransactionId,
    })
    return { kind: 'unmapped' }
  }

  const family = await admin
    .from('family_entitlements')
    .select('family_id')
    .eq('family_id', familyId)
    .maybeSingle()

  if (family.error) {
    console.error('[appstore-notifications] bootstrap family lookup failed', family.error)
    throw new Error('bootstrap_lookup_failed')
  }
  if (!family.data) {
    // El appAccountToken no corresponde a ninguna familia conocida. No
    // inventamos filas: audit + 200, validate-purchase lo resolverá cuando el
    // cliente reconecte.
    console.warn('[appstore-notifications] appAccountToken does not map to a known family', {
      familyId,
      originalTransactionId: tx.originalTransactionId,
    })
    return { kind: 'unmapped' }
  }

  return { kind: 'bootstrap', familyId }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim())
}

// ───────────────────────────────────────────────────────────────────────────
// Handler
// ───────────────────────────────────────────────────────────────────────────

export async function handler(request: Request): Promise<Response> {
  // Apple solo hace POST. (No OPTIONS: no es un browser.)
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  if (!isServerReady()) {
    // Falta config → 500. Apple reintenta; cuando el owner cargue los secrets,
    // el retry procesa. No es un error de Apple, no devolvemos 400.
    console.error('[appstore-notifications] missing env config', {
      hasUrl: Boolean(supabaseUrl),
      hasServiceRole: Boolean(supabaseServiceRoleKey),
      hasRoot: Boolean(appleRootCaG3),
      hasBundle: Boolean(expectedBundleId),
    })
    return jsonResponse({ error: 'Server not configured.' }, 500)
  }

  let body: WebhookBody
  try {
    body = (await request.json()) as WebhookBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload.' }, 400)
  }
  if (typeof body.signedPayload !== 'string' || !body.signedPayload) {
    return jsonResponse({ error: 'signedPayload is required.' }, 400)
  }

  // ── Paso 1: verificar el JWS del ENVELOPE (cadena → root pineado, bundleId) ─
  // El bundleId del envelope vive en data.bundleId; verifyAppleJws solo lo
  // assertea si el payload (top-level) trae `bundleId`. El envelope NO lo trae
  // al tope, así que el assert de bundleId del envelope es no-op y lo hacemos
  // contra el de la TRANSACCIÓN (que sí lo trae). Mantenemos expectedBundleId
  // acá igual por consistencia.
  const envelopeResult = await verifyAppleJws<AppleNotificationPayload>(body.signedPayload, {
    appleRootCaG3,
    expectedBundleId,
  })
  if (!envelopeResult.ok) {
    // Firma/cadena inválida = el caller NO es Apple (o el payload está
    // corrupto). Error real de verificación → 400 (no reintentar tiene sentido,
    // pero Apple igual reintenta; un 400 evita loops infinitos en su lado).
    console.error('[appstore-notifications] envelope JWS verification failed', envelopeResult.reason)
    return jsonResponse({ error: 'JWS verification failed.', reason: envelopeResult.reason }, 400)
  }

  const note = extractNotificationPayload(envelopeResult.payload)
  if (!note.notificationType || !note.notificationUUID || !note.signedDate) {
    console.error('[appstore-notifications] envelope missing required fields', {
      notificationType: note.notificationType,
      notificationUUID: note.notificationUUID,
      hasSignedDate: Boolean(note.signedDate),
    })
    return jsonResponse({ error: 'Malformed notification envelope.' }, 400)
  }

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey)

  // ── Caso TEST: validación del endpoint. No trae transacción. Log + 200. ───
  // (App Store Connect → "Request a Test Notification".) No persistimos en
  // subscription_events porque no hay original_transaction_id (NOT NULL).
  if (note.notificationType === 'TEST') {
    console.log('[appstore-notifications] TEST notification received', {
      notificationUUID: note.notificationUUID,
      environment: note.environment,
    })
    return jsonResponse({ ok: true, test: true }, 200)
  }

  // ── Paso 2: re-verificar el JWS ANIDADO de la transacción ─────────────────
  // Firmado por separado (trae su propia cadena x5c). Sin esto, confiaríamos en
  // datos no verificados embebidos en un envelope verificado — la firma del
  // envelope NO cubre el contenido del JWS interno como confiable.
  if (!note.signedTransactionInfo) {
    // Algunas notificaciones (p. ej. ciertos RENEWAL_EXTENSION) podrían venir
    // sin transactionInfo. Sin transacción no hay original_transaction_id para
    // rutear: audit + 200.
    console.warn('[appstore-notifications] notification without signedTransactionInfo', {
      notificationType: note.notificationType,
      notificationUUID: note.notificationUUID,
    })
    return jsonResponse({ ok: true, skipped: 'no_transaction_info' }, 200)
  }

  const txResult = await verifyAppleJws<AppleTransactionInfo>(note.signedTransactionInfo, {
    appleRootCaG3,
    expectedBundleId, // el JWS de transacción SÍ trae bundleId → se assertea.
    // Y lo EXIGIMOS: este JWS es una transacción → siempre trae bundleId. Su
    // ausencia significa un payload que no es una transacción legítima.
    requireBundleId: true,
  })
  if (!txResult.ok) {
    console.error('[appstore-notifications] transaction JWS verification failed', txResult.reason)
    return jsonResponse({ error: 'Transaction JWS verification failed.', reason: txResult.reason }, 400)
  }

  const extractedTx = extractTransactionPayload(txResult.payload)
  if (!extractedTx.originalTransactionId) {
    console.error('[appstore-notifications] transaction without originalTransactionId', {
      notificationUUID: note.notificationUUID,
    })
    return jsonResponse({ error: 'Transaction missing originalTransactionId.' }, 400)
  }

  // Renewal info (opcional): autoRenewStatus, autoRenewProductId,
  // gracePeriodExpiresDate. Re-verificar también (JWS firmado aparte).
  let renewalInfo: AppleRenewalInfo | null = null
  if (note.signedRenewalInfo) {
    const renewalResult = await verifyAppleJws<AppleRenewalInfo>(note.signedRenewalInfo, {
      appleRootCaG3,
      expectedBundleId,
    })
    if (renewalResult.ok) {
      renewalInfo = renewalResult.payload
    } else {
      // El renewalInfo es complementario: si no verifica, logueamos pero no
      // abortamos (el efecto principal viene de la transacción). Sin grace/
      // autoRenew confiables, el efecto usa los defaults conservadores.
      console.warn('[appstore-notifications] renewalInfo JWS verification failed (continuing)', renewalResult.reason)
    }
  }

  // El environment autoritativo es el de la TRANSACCIÓN firmada (extractedTx),
  // no el del envelope. Caemos al del envelope si la transacción no lo trae.
  const eventEnvironment =
    extractedTx.environment ?? note.environment ?? 'Production'

  const tx: TransactionFacts = {
    originalTransactionId: extractedTx.originalTransactionId,
    productId: extractedTx.productId,
    expiresAt: extractedTx.expiresDate,
    // Fallback DELIBERADO al signed_date del envelope (note.signedDate): ambos
    // son timestamps REALES de Apple, nunca fabricados. A diferencia de
    // validate-purchase (que RECHAZA si falta signedDate, porque una compra
    // user-initiated sin él es anómala), el webhook es lenient para no DESCARTAR
    // eventos del ciclo de vida — y el envelope siempre trae un signed_date real.
    signedDate: extractedTx.signedDate ?? note.signedDate,
    environment: extractedTx.environment ?? note.environment,
    appAccountToken: extractedTx.appAccountToken,
  }

  // ── Paso 3: GUARD de environment ──────────────────────────────────────────
  // Sandbox bajo prod ENV → audit en subscription_events + 200 + skip de TODA
  // mutación. Evita que un evento de sandbox pise el entitlement de una familia
  // real si los family_id colisionan post-seed.
  const isSandboxUnderProd = eventEnvironment === 'Sandbox' && isProductionEnv
  // El signed_date efectivo para audit/ordering (siempre presente: cae al del
  // envelope si la transacción no lo trae).
  const effectiveSignedDate = tx.signedDate ?? note.signedDate

  // ── Paso 4: DEDUP por tabla (insert en subscription_events) ───────────────
  // El insert es el dedup Y el audit. Lo hacemos ANTES de mutar, incluso bajo
  // el guard de sandbox (el guard exige audit + skip).
  const recorded = await recordEvent(admin, {
    notificationUuid: note.notificationUUID,
    originalTransactionId: tx.originalTransactionId,
    notificationType: note.notificationType,
    subtype: note.subtype,
    signedDate: effectiveSignedDate,
    environment: eventEnvironment,
    rawPayload: {
      // Audit trail: el envelope decodificado + la transacción decodificada.
      // Suficiente para soporte/replay sin re-verificar.
      notification: envelopeResult.payload,
      transaction: txResult.payload,
      renewalInfo,
    },
  })

  if (recorded === 'duplicate') {
    // notification_uuid ya visto → ya procesado. 200 y corta (idempotente).
    return jsonResponse({ ok: true, duplicate: true }, 200)
  }
  if (recorded === 'error') {
    // Fallo de DB real (no unique-violation). 500 → Apple reintenta.
    return jsonResponse({ error: 'internal' }, 500)
  }

  // Guard de environment: audit YA hecho arriba; ahora skip de mutación.
  if (isSandboxUnderProd) {
    console.log('[appstore-notifications] sandbox event under production ENV — audited, skipping mutation', {
      notificationType: note.notificationType,
      notificationUUID: note.notificationUUID,
    })
    return jsonResponse({ ok: true, skipped: 'sandbox_under_production' }, 200)
  }

  // ── Paso 5: ROUTING por original_transaction_id ───────────────────────────
  let target:
    | { kind: 'mapped'; familyId: string }
    | { kind: 'bootstrap'; familyId: string }
    | { kind: 'unmapped' }
  try {
    target = await resolveTargetFamily(admin, tx, note.notificationType, note.subtype)
  } catch {
    // Fallo de lookup → 500 para que Apple reintacte. El evento ya está
    // auditado, pero la mutación no corrió; el retry lo resolverá.
    return jsonResponse({ error: 'internal' }, 500)
  }

  if (target.kind === 'unmapped') {
    // Sin familia a quién acreditar. Ya está auditado. 200 sin mutar.
    return jsonResponse({ ok: true, skipped: 'no_mapping' }, 200)
  }

  // ── Paso 6: calcular el efecto y aplicar vía la RPC (ordering adentro) ────
  const effect = effectForNotification(note.notificationType, note.subtype, tx, renewalInfo)

  if (!effect.mutate) {
    // Tipo auditable que no muta (p. ej. DID_FAIL_TO_RENEW retry, tipos
    // desconocidos). Ya está en subscription_events. 200.
    return jsonResponse({ ok: true, audited: true, notificationType: note.notificationType }, 200)
  }

  // En bootstrap, p_original_transaction_id ancla el mapping en la fila de la
  // familia (apply_subscription_transaction hace coalesce → la setea). En
  // mapped, es la misma OTID que ya está; coalesce la deja igual.
  const rpc = await admin.rpc('apply_subscription_transaction', {
    p_family_id: target.familyId,
    p_original_transaction_id: tx.originalTransactionId,
    p_status: effect.status,
    p_product_id: effect.productId,
    p_expires_at: effect.expiresAt ? effect.expiresAt.toISOString() : null,
    p_grace_expires_at: effect.graceExpiresAt ? effect.graceExpiresAt.toISOString() : null,
    p_auto_renew: effect.autoRenew,
    p_environment: eventEnvironment,
    p_signed_date: effectiveSignedDate.toISOString(),
    // purchaser_user_id: el webhook no conoce qué USER disparó la compra
    // (el appAccountToken es family_id, no user_id). validate-purchase lo
    // setea. Pasamos null → coalesce preserva el existente.
    p_purchaser_user_id: null,
    p_pending_product_id: effect.pendingProductId,
  })

  if (rpc.error) {
    console.error('[appstore-notifications] apply_subscription_transaction failed', rpc.error)
    // IDEMPOTENCIA: el dedup (insert en subscription_events) y la RPC NO
    // comparten transacción. Si dejáramos el evento insertado y devolviéramos
    // 500, el retry de Apple vería el notification_uuid ya presente y cortaría
    // en 'duplicate' (200) SIN re-aplicar la mutación → estado perdido. Para
    // que el retry SÍ re-procese, borramos el evento de audit antes del 500.
    // (La reconciliación periódica vía App Store Server API —spec §2 "Regla de
    // oro"— es la red de seguridad si el delete también fallara.)
    const rollback = await admin
      .from('subscription_events')
      .delete()
      .eq('notification_uuid', note.notificationUUID)
    if (rollback.error) {
      console.error('[appstore-notifications] failed to roll back audit row after RPC failure', rollback.error)
    }
    return jsonResponse({ error: 'internal' }, 500)
  }

  return jsonResponse(
    {
      ok: true,
      applied: note.notificationType,
      subtype: note.subtype,
      familyId: target.familyId,
      bootstrap: target.kind === 'bootstrap',
    },
    200,
  )
}

if (!denoGlobal.Deno?.serve) {
  throw new Error('This function must run on Deno runtime.')
}

denoGlobal.Deno.serve(handler)
