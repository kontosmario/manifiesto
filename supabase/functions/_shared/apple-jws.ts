// apple-jws.ts — verificación de JWS de Apple (StoreKit 2 / ASSN v2)
// ===================================================================
//
// Módulo COMPARTIDO entre las edge functions `validate-purchase` (cliente →
// servidor) y `appstore-notifications` (Apple → servidor). Ver el spec
// canónico: docs/superpowers/specs/2026-06-12-apple-subscriptions-design.md
// §2 ("Verifica offline: parsea el header JWS, lee el x5c …").
//
// Qué firma Apple y cómo lo verificamos
// -------------------------------------
// StoreKit 2 y App Store Server Notifications v2 entregan cada transacción /
// notificación como un **JWS compact** (`header.payload.signature`, todo
// base64url) firmado con **ES256** (ECDSA sobre la curva P-256, hash
// SHA-256). El header protegido trae un `x5c`: la cadena de certificados
// X.509 (DER en base64 *estándar*, no base64url) que Apple usó para firmar:
//
//     x5c[0] = leaf      (cert de firma; su clave pública verifica el JWS)
//     x5c[1] = intermedio (Apple Worldwide Developer Relations / similar)
//     x5c[2] = root        (Apple Root CA - G3)
//
// Para confiar en el payload hay que probar DOS cosas independientes:
//
//   (A) La CADENA de certificados es válida y ancla en el Apple Root CA-G3
//       que NOSOTROS bundleamos (pin). NO se confía en el root que venga en
//       el x5c sin compararlo byte-a-byte con el nuestro: si confiáramos en
//       el root del propio token, un atacante con cualquier cadena
//       self-consistente pasaría la validación.
//
//   (B) La FIRMA del JWS (`header.payload`) verifica con la clave pública
//       del cert LEAF.
//
// Solo cuando (A) y (B) pasan se decodifica y devuelve el payload JSON.
//
// Decisión criptográfica: x509 lib vs Web Crypto
// ----------------------------------------------
// `crypto.subtle` (Web Crypto, nativo de Deno) NO sabe parsear ni validar
// cadenas X.509 — no hay one-liner para "este DER está firmado por aquel DER
// y las fechas son válidas". Construir eso a mano (parsear ASN.1, TBSCert,
// AlgorithmIdentifier, extraer la firma del issuer, etc.) es exactamente la
// clase de código criptográfico artesanal que NO querés escribir.
//
// Por eso usamos una división estricta:
//
//   • `@peculiar/x509` (npm:, corre en Deno) → SOLO para (A): parsear los
//     certs DER del x5c, validar fechas (notBefore/notAfter) y verificar la
//     firma de CADA cert contra la clave pública del siguiente eslabón
//     (leaf←intermedio←root), y comparar el root con el pin. Esta lib usa
//     `crypto.subtle` por debajo (le inyectamos `crypto` vía
//     `cryptoProvider.set`), así que la primitiva criptográfica sigue siendo
//     Web Crypto — la lib solo aporta el parsing ASN.1/x509 y el armado de
//     la cadena.
//
//   • `crypto.subtle.verify({ name:'ECDSA', hash:'SHA-256' }, …)` (Web Crypto
//     directo) → para (B): la firma del JWS en sí. La clave pública del leaf
//     se exporta a un `CryptoKey` con `cert.publicKey.export(...)`. ⚠️ La
//     firma JWS de Apple está en formato **JOSE raw R||S** (64 bytes), que es
//     justo lo que `crypto.subtle.verify` con ECDSA espera — NO el wrapper
//     DER/ASN.1 que usan OpenSSL o los certs X.509. No hay conversión: el
//     raw del JWS entra tal cual.
//
// El Apple Root CA-G3 NO se hardcodea acá: se pasa como parámetro
// (`opts.appleRootCaG3`), provisto por el secret `APPLE_ROOT_CA_G3` (DER o
// PEM). El módulo solo lo PARSEA y lo COMPARA. Así rotar/auditar el pin es un
// cambio de secret, no de código, y este archivo no "inventa" el formato del
// cert de Apple.

import * as x509 from 'npm:@peculiar/x509@1.12.3'

// Inyectar el WebCrypto de Deno como proveedor de la lib x509. Sin esto la
// lib busca un `crypto` global tipo navegador y falla en el runtime de Edge
// Functions. Idempotente: setear el mismo proveedor más de una vez es inocuo.
x509.cryptoProvider.set(crypto)

// ───────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ───────────────────────────────────────────────────────────────────────────

/** Header protegido de un JWS compact de Apple. */
export interface AppleJwsHeader {
  /** Algoritmo de firma. Apple siempre usa 'ES256'. */
  alg: string
  /** Cadena de certs X.509 en DER/base64 estándar: [leaf, intermedio, root]. */
  x5c: string[]
}

/** Opciones de verificación. */
export interface VerifyAppleJwsOptions {
  /**
   * Apple Root CA-G3 pineado, como lo entrega el secret `APPLE_ROOT_CA_G3`.
   * Acepta PEM (`-----BEGIN CERTIFICATE----- …`) o DER en base64 crudo. La
   * cadena del x5c DEBE anclar exactamente en este cert.
   */
  appleRootCaG3: string
  /** bundleId esperado (`APPLE_BUNDLE_ID`). Se asserta contra el payload. */
  expectedBundleId: string
  /**
   * Si `true`, EXIGE que el payload traiga un `bundleId` string: un payload
   * SIN bundleId falla con `bundle_id_mismatch` (no solo "si está presente y no
   * matchea"). Úsese SOLO para los JWS de TRANSACCIÓN (`signedTransactionInfo`),
   * que siempre traen `bundleId`. NO prender para el envelope de notificación
   * (su `bundleId` vive en `data.bundleId`, no en el payload directo) ni para el
   * `signedRenewalInfo`. Default: `false` (assert laxo: solo si está presente).
   */
  requireBundleId?: boolean
  /**
   * Environment esperado ('Sandbox' | 'Production'). Opcional: el guard de
   * environment del spec (§2) suele querer INSPECCIONAR el environment y
   * decidir (audit + skip) en vez de rechazar duro, así que por defecto NO
   * se asserta. Si se pasa, un mismatch hace fallar la verificación.
   */
  expectedEnvironment?: AppleEnvironment
  /**
   * Reloj inyectable para tests deterministas. Default: `new Date()`.
   * La validación de fechas de la cadena usa este valor.
   */
  now?: Date
}

export type AppleEnvironment = 'Sandbox' | 'Production'

/** Resultado tipado de la verificación. Discriminado por `ok`. */
export type VerifyAppleJwsResult<T = Record<string, unknown>> =
  | { ok: true; payload: T }
  | { ok: false; reason: AppleJwsFailureReason }

/** Razones de fallo. Estables para logging/branching del caller. */
export type AppleJwsFailureReason =
  | 'malformed_jws' // no son 3 segmentos base64url, o header/payload no son JSON
  | 'unsupported_alg' // alg !== 'ES256'
  | 'missing_x5c' // header sin x5c usable
  | 'cert_parse_error' // algún cert del x5c o el root pineado no parsea
  | 'chain_invalid' // un eslabón no está firmado por el siguiente
  | 'cert_expired' // notBefore/notAfter fuera de rango para `now`
  | 'root_not_pinned' // el root del x5c no es el Apple Root CA-G3 que pineamos
  | 'signature_invalid' // la firma ES256 del JWS no verifica con el leaf
  | 'bundle_id_mismatch' // payload.bundleId !== expectedBundleId
  | 'environment_mismatch' // payload.environment !== expectedEnvironment (si se pidió)

// ───────────────────────────────────────────────────────────────────────────
// Utilidades base64 / base64url
// ───────────────────────────────────────────────────────────────────────────

/**
 * Alfabeto base64url SIN padding (los segmentos de un JWS compact nunca llevan
 * `=`). Validamos ANTES de tocar el contenido: un segmento con caracteres fuera
 * de `[A-Za-z0-9_-]` no es un JWS bien formado y nunca debe llegar a `atob`.
 */
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/
/**
 * Alfabeto base64 ESTÁNDAR con padding opcional (los certs DER del x5c vienen
 * en base64 estándar, no base64url). Apple usa `+`/`/` y hasta 2 chars de
 * padding `=` al final. Validamos antes de `atob` para no aceptar entradas
 * laxas (whitespace, base64url, basura) que algunos `atob` toleran.
 */
const BASE64_STD_RE = /^[A-Za-z0-9+/]+={0,2}$/

/** base64url (sin padding, con `-`/`_`) → Uint8Array<ArrayBuffer>. */
function base64UrlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  // base64url → base64 estándar + repadding.
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4
  if (pad === 2) b64 += '=='
  else if (pad === 3) b64 += '='
  else if (pad === 1) throw new Error('invalid base64url length')
  return base64ToBytes(b64)
}

/**
 * base64 estándar (con `+`/`/`, padding opcional) → Uint8Array respaldado por
 * un `ArrayBuffer` plano. Tipamos el backing buffer explícitamente
 * (`Uint8Array<ArrayBuffer>`): las firmas de `@peculiar/x509` y de
 * `crypto.subtle` exigen vistas sobre `ArrayBuffer` (no `ArrayBufferLike`, que
 * incluiría `SharedArrayBuffer`). Al construir el `Uint8Array` sobre un
 * `ArrayBuffer` que creamos nosotros, el tipo queda fijado correctamente.
 */
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  // `atob` es global en Deno. Lo usamos en vez de una tabla propia para no
  // mantener un decodificador base64 a mano (otra fuente de bugs sutiles).
  const binary = atob(b64.trim())
  const buffer = new ArrayBuffer(binary.length)
  const out = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/** Decodifica una porción base64url a string UTF-8 (header / payload JSON). */
function base64UrlToUtf8(b64url: string): string {
  return new TextDecoder().decode(base64UrlToBytes(b64url))
}

// ───────────────────────────────────────────────────────────────────────────
// 1) parseJwsHeader
// ───────────────────────────────────────────────────────────────────────────

/**
 * Decodifica el header protegido (primer segmento, base64url) de un JWS
 * compact y devuelve `{ alg, x5c }`. NO verifica nada: es puro parsing, útil
 * para inspección y para el paso 1 de `verifyAppleJws`.
 *
 * @throws si el JWS no tiene 3 segmentos o el header no es JSON con `x5c[]`.
 */
export function parseJwsHeader(jws: string): AppleJwsHeader {
  const segments = jws.split('.')
  if (segments.length !== 3) {
    throw new Error('JWS compact debe tener 3 segmentos (header.payload.signature)')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(base64UrlToUtf8(segments[0]))
  } catch {
    throw new Error('header JWS no es JSON base64url válido')
  }
  const header = parsed as { alg?: unknown; x5c?: unknown }
  if (typeof header.alg !== 'string') {
    throw new Error('header JWS sin `alg`')
  }
  if (
    !Array.isArray(header.x5c) ||
    header.x5c.length === 0 ||
    !header.x5c.every((c): c is string => typeof c === 'string')
  ) {
    throw new Error('header JWS sin `x5c[]` de strings')
  }
  return { alg: header.alg, x5c: header.x5c }
}

// ───────────────────────────────────────────────────────────────────────────
// 2) verifyAppleJws
// ───────────────────────────────────────────────────────────────────────────

/**
 * Carga el Apple Root CA-G3 pineado (PEM o DER-base64) a un X509Certificate.
 * `@peculiar/x509` acepta PEM y DER directamente en el constructor.
 */
function parsePinnedRoot(raw: string): x509.X509Certificate {
  const trimmed = raw.trim()
  // El constructor de la lib detecta PEM por el header; para DER-base64 crudo
  // lo pasamos como ArrayBuffer para no ambigüedad.
  if (trimmed.includes('-----BEGIN')) {
    return new x509.X509Certificate(trimmed)
  }
  return new x509.X509Certificate(base64ToBytes(trimmed))
}

/** Parsea un cert DER (base64 estándar, como viene en x5c) a X509Certificate. */
function parseDerCert(b64Der: string): x509.X509Certificate {
  // El x5c es base64 ESTÁNDAR (no base64url). Rechazamos cualquier cosa que no
  // matchee el alfabeto estándar ANTES de `atob`: `atob` de Deno tolera algunas
  // entradas laxas, y no queremos que un x5c con base64url/whitespace/basura se
  // cuele al parser ASN.1. El throw lo captura el caller como 'cert_parse_error'.
  if (!BASE64_STD_RE.test(b64Der.trim())) {
    throw new Error('x5c cert no es base64 estándar')
  }
  return new x509.X509Certificate(base64ToBytes(b64Der))
}

/** Fechas de validez OK para `now`. */
function isWithinValidity(cert: x509.X509Certificate, now: Date): boolean {
  return cert.notBefore.getTime() <= now.getTime() && now.getTime() <= cert.notAfter.getTime()
}

/**
 * Lee el flag `cA` de la extensión BasicConstraints (OID 2.5.29.19) de un cert.
 * Devuelve:
 *   - true/false  → la extensión está presente y declara cA.
 *   - undefined   → la extensión NO está presente en el cert.
 *
 * Distinguimos "ausente" de "presente con cA:false" porque la política de
 * cadena trata cada caso distinto (un intermedio SIN BasicConstraints es
 * inválido; el leaf simplemente no debe declarar cA:true).
 */
function basicConstraintsCa(cert: x509.X509Certificate): boolean | undefined {
  const ext = cert.getExtension(x509.BasicConstraintsExtension)
  if (!ext) return undefined
  return ext.ca === true
}

/**
 * Verifica el JWS compact ES256 de Apple. Ver el bloque de cabecera del
 * archivo para la justificación criptográfica completa.
 *
 * Pasos:
 *   1. Parsear header; exigir `alg === 'ES256'` y `x5c` usable.
 *   2. Parsear los certs DER del x5c [leaf, intermedio, root].
 *   3. (A) Validar la CADENA con `@peculiar/x509`:
 *        - fechas de cada cert OK,
 *        - leaf firmado por intermedio, intermedio firmado por root,
 *        - el root del x5c es byte-idéntico al Apple Root CA-G3 PINEADO.
 *   4. (B) Verificar la FIRMA del JWS con `crypto.subtle.verify` (ECDSA
 *        P-256 / SHA-256) usando la pública del LEAF y la firma raw R||S.
 *   5. Decodificar el payload; assert de bundleId (y environment si se pidió).
 */
export async function verifyAppleJws<T = Record<string, unknown>>(
  jws: string,
  opts: VerifyAppleJwsOptions,
): Promise<VerifyAppleJwsResult<T>> {
  const now = opts.now ?? new Date()

  // ── Paso 1: header ────────────────────────────────────────────────────────
  const segments = jws.split('.')
  if (segments.length !== 3) return { ok: false, reason: 'malformed_jws' }
  const [headerB64, payloadB64, signatureB64] = segments
  // Los 3 segmentos de un JWS compact son base64url SIN padding. Validamos el
  // alfabeto ANTES de decodificar/reconstruir: un segmento con caracteres fuera
  // de `[A-Za-z0-9_-]` no es un JWS válido. (No tocamos la reconstrucción del
  // signing input — `headerB64.payloadB64` crudos —, solo rechazamos basura.)
  if (
    !BASE64URL_RE.test(headerB64) ||
    !BASE64URL_RE.test(payloadB64) ||
    !BASE64URL_RE.test(signatureB64)
  ) {
    return { ok: false, reason: 'malformed_jws' }
  }

  let header: AppleJwsHeader
  try {
    header = parseJwsHeader(jws)
  } catch {
    // El throw distingue mal x5c vs header roto; acá colapsamos a malformed
    // salvo el caso "sin x5c", que el caller puede querer distinguir.
    try {
      JSON.parse(base64UrlToUtf8(headerB64))
    } catch {
      return { ok: false, reason: 'malformed_jws' }
    }
    return { ok: false, reason: 'missing_x5c' }
  }

  if (header.alg !== 'ES256') {
    // Apple solo firma con ES256. Cualquier otro alg (incluido el infame
    // `alg: 'none'`) se rechaza explícitamente — nunca confiar en el alg
    // declarado para elegir el verificador.
    return { ok: false, reason: 'unsupported_alg' }
  }

  // ── Paso 2: parsear certs ─────────────────────────────────────────────────
  let chain: x509.X509Certificate[]
  let pinnedRoot: x509.X509Certificate
  try {
    chain = header.x5c.map(parseDerCert)
    pinnedRoot = parsePinnedRoot(opts.appleRootCaG3)
  } catch {
    return { ok: false, reason: 'cert_parse_error' }
  }
  if (chain.length < 2) {
    // Necesitamos al menos leaf + un issuer. La cadena real de Apple es de 3.
    return { ok: false, reason: 'chain_invalid' }
  }
  const leaf = chain[0]

  // ── Paso 3: validar cadena + pin del root (A) ─────────────────────────────
  // 3a. Fechas de validez de TODOS los certs de la cadena.
  for (const cert of chain) {
    if (!isWithinValidity(cert, now)) {
      return { ok: false, reason: 'cert_expired' }
    }
  }

  // 3b. Cada cert (excepto el último del x5c) debe estar firmado por la
  // pública del SIGUIENTE. `cert.verify({ publicKey })` chequea exactamente
  // eso (la firma del cert contra una clave issuer dada), usando WebCrypto
  // por debajo. PERO la firma sola NO basta: la validación posicional (verificar
  // (subject[i], issuer[i+1]) por índice) acepta una cadena cuyos eslabones no
  // se nombran entre sí. Por eso exigimos ADEMÁS:
  //   (i)   NAME CHAINING: el DN del issuer textual del subject debe igualar el
  //         DN del subject del cert issuer (`subject.issuer === issuer.subject`).
  //         Sin esto, un atacante podría insertar un cert válido-por-firma pero
  //         que no pertenece a la cadena nombrada.
  //   (ii)  BASIC CONSTRAINTS: cada cert ISSUER (los intermedios) debe declarar
  //         cA:true vía BasicConstraints; si la extensión está ausente en un
  //         intermedio → inválido (no asumimos cA). El LEAF no debe declarar
  //         cA:true (un cert de firma de hoja con cA:true es inválido).
  // NO confiamos en el `issuer` textual para REEMPLAZAR la verificación de
  // firma: lo exigimos COMO REQUISITO ADICIONAL a la firma criptográfica.
  try {
    for (let i = 0; i < chain.length - 1; i++) {
      const subject = chain[i]
      const issuer = chain[i + 1]
      const signedByIssuer = await subject.verify({ publicKey: issuer.publicKey, date: now })
      if (!signedByIssuer) {
        return { ok: false, reason: 'chain_invalid' }
      }
      // (i) El nombre del issuer del subject debe encadenar con el subject del
      // cert que lo firma. `@peculiar/x509` expone ambos DN como strings
      // normalizados (`.issuer` / `.subject`).
      if (subject.issuer !== issuer.subject) {
        return { ok: false, reason: 'chain_invalid' }
      }
      // (ii) El issuer (un intermedio o el root) debe ser una CA. Si
      // BasicConstraints está ausente en un intermedio, lo tratamos como
      // inválido — no asumimos capacidad de CA.
      if (basicConstraintsCa(issuer) !== true) {
        return { ok: false, reason: 'chain_invalid' }
      }
    }
  } catch {
    return { ok: false, reason: 'chain_invalid' }
  }

  // 3b-leaf. El LEAF no debe ser una CA. Si declara explícitamente cA:true es
  // inválido (un cert de firma de hoja que se hace pasar por CA). Ausencia de
  // BasicConstraints en el leaf es aceptable (es lo normal en un cert de firma).
  if (basicConstraintsCa(leaf) === true) {
    return { ok: false, reason: 'chain_invalid' }
  }

  // 3c. PIN del root: el último cert del x5c DEBE ser byte-idéntico al Apple
  // Root CA-G3 que bundleamos. Comparamos el DER crudo (rawData) — no el
  // subject/issuer textual, que es falsificable. Esto es lo que ancla la
  // confianza: sin esto, una cadena self-consistente con un root atacante
  // pasaría 3b.
  const x5cRootDer = new Uint8Array(chain[chain.length - 1].rawData)
  const pinnedRootDer = new Uint8Array(pinnedRoot.rawData)
  if (!bytesEqual(x5cRootDer, pinnedRootDer)) {
    return { ok: false, reason: 'root_not_pinned' }
  }
  // Defensa extra: el root pineado debe además haber firmado al cert que lo
  // precede (ya cubierto por 3b si el root es el último eslabón, pero lo
  // dejamos explícito si la cadena fuese de 2 y el "issuer" fuese el root).
  // (No-op cuando chain.length === 3 porque 3b ya lo verificó.)

  // ── Paso 4: verificar la firma del JWS con el LEAF (B) ────────────────────
  // Exportar la pública del leaf como CryptoKey ECDSA P-256. La firma del
  // JWS es raw R||S (64 bytes), formato JOSE — el que `crypto.subtle.verify`
  // espera para ECDSA. NO se convierte a/desde DER.
  let leafKey: CryptoKey
  try {
    leafKey = await leaf.publicKey.export(
      { name: 'ECDSA', namedCurve: 'P-256' },
      ['verify'],
    )
  } catch {
    return { ok: false, reason: 'cert_parse_error' }
  }

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  let signature: Uint8Array<ArrayBuffer>
  try {
    signature = base64UrlToBytes(signatureB64)
  } catch {
    return { ok: false, reason: 'malformed_jws' }
  }

  let signatureValid = false
  try {
    signatureValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      leafKey,
      signature,
      signingInput,
    )
  } catch {
    return { ok: false, reason: 'signature_invalid' }
  }
  if (!signatureValid) {
    return { ok: false, reason: 'signature_invalid' }
  }

  // ── Paso 5: decodificar payload y asserts ─────────────────────────────────
  let payload: T & { bundleId?: unknown; environment?: unknown }
  try {
    payload = JSON.parse(base64UrlToUtf8(payloadB64))
  } catch {
    return { ok: false, reason: 'malformed_jws' }
  }

  // bundleId: presente en transactionInfo (`bundleId`) y en el envelope de
  // las notificaciones (`data.bundleId`, propagado por el caller). Para el
  // JWS de transacción/renewal, `bundleId` está en el payload directo.
  //
  // Si `requireBundleId` está prendido, un payload SIN `bundleId` string es un
  // fallo duro: un JWS de transacción siempre lo trae, así que su ausencia es
  // sospechosa (p. ej. un renewalInfo o un envelope colado por el call-site de
  // transacción). El assert laxo (presente y != esperado → reject) se mantiene
  // siempre.
  if (opts.requireBundleId && typeof payload.bundleId !== 'string') {
    return { ok: false, reason: 'bundle_id_mismatch' }
  }
  if (typeof payload.bundleId === 'string' && payload.bundleId !== opts.expectedBundleId) {
    return { ok: false, reason: 'bundle_id_mismatch' }
  }

  if (
    opts.expectedEnvironment &&
    typeof payload.environment === 'string' &&
    payload.environment !== opts.expectedEnvironment
  ) {
    return { ok: false, reason: 'environment_mismatch' }
  }

  return { ok: true, payload: payload as T }
}

/** Comparación de bytes (longitud + contenido). No necesita ser constant-time:
 *  comparamos certs públicos, no secretos. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// ───────────────────────────────────────────────────────────────────────────
// 5) Helpers de extracción de payload
// ───────────────────────────────────────────────────────────────────────────
//
// Apple expresa los timestamps en milisegundos epoch (number). Los
// convertimos a Date acá para que los callers no manipulen ms a mano.

/** Payload firmado de una transacción de StoreKit 2 (`JWSTransaction`). */
export interface AppleTransactionInfo {
  transactionId?: string
  originalTransactionId?: string
  productId?: string
  bundleId?: string
  /** ms epoch */
  expiresDate?: number
  /** ms epoch */
  signedDate?: number
  appAccountToken?: string
  environment?: string
  [k: string]: unknown
}

/** Forma normalizada de una transacción para el resto del backend. */
export interface ExtractedTransactionPayload {
  transactionId: string | null
  originalTransactionId: string | null
  productId: string | null
  /** Vencimiento de la suscripción; null si la transacción no expira. */
  expiresDate: Date | null
  /** UUID que adjuntamos en la compra; lo usamos = family_id. */
  appAccountToken: string | null
  environment: AppleEnvironment | null
  /** Cuándo Apple firmó el JWS — clave de ordering en el path unificado (§1). */
  signedDate: Date | null
}

/** Convierte ms epoch (o undefined) a Date | null. */
function msToDate(ms: unknown): Date | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null
  return new Date(ms)
}

function normalizeEnvironment(env: unknown): AppleEnvironment | null {
  return env === 'Sandbox' || env === 'Production' ? env : null
}

/**
 * Normaliza un payload de transacción ya verificado a la forma que consume
 * `validate-purchase` y `apply_subscription_transaction`. No verifica nada —
 * asume que `verifyAppleJws` ya corrió sobre el JWS de origen.
 */
export function extractTransactionPayload(
  info: AppleTransactionInfo,
): ExtractedTransactionPayload {
  return {
    transactionId: typeof info.transactionId === 'string' ? info.transactionId : null,
    originalTransactionId:
      typeof info.originalTransactionId === 'string' ? info.originalTransactionId : null,
    productId: typeof info.productId === 'string' ? info.productId : null,
    expiresDate: msToDate(info.expiresDate),
    appAccountToken: typeof info.appAccountToken === 'string' ? info.appAccountToken : null,
    environment: normalizeEnvironment(info.environment),
    signedDate: msToDate(info.signedDate),
  }
}

/** Envelope de una App Store Server Notification v2 (`responseBodyV2DecodedPayload`). */
export interface AppleNotificationPayload {
  notificationType?: string
  subtype?: string
  notificationUUID?: string
  /** ms epoch */
  signedDate?: number
  data?: {
    /** JWS de la transacción (re-verificar con verifyAppleJws antes de usar). */
    signedTransactionInfo?: string
    /** JWS del renewal info (re-verificar antes de usar). */
    signedRenewalInfo?: string
    bundleId?: string
    environment?: string
    [k: string]: unknown
  }
  [k: string]: unknown
}

/** Forma normalizada del envelope de una notificación. */
export interface ExtractedNotificationPayload {
  notificationType: string | null
  subtype: string | null
  notificationUUID: string | null
  /**
   * JWS anidado de la transacción. ⚠️ Está firmado por separado: el caller
   * DEBE pasarlo por `verifyAppleJws` otra vez antes de confiar en su
   * contenido. Acá solo lo extraemos.
   */
  signedTransactionInfo: string | null
  /** JWS anidado del renewal info. Mismo caveat: re-verificar. */
  signedRenewalInfo: string | null
  signedDate: Date | null
  environment: AppleEnvironment | null
}

/**
 * Normaliza el envelope de una ASSN v2 ya verificado. Devuelve los JWS
 * anidados SIN verificar — son firmas independientes que el caller debe
 * re-verificar con `verifyAppleJws` (la firma del envelope NO cubre el
 * contenido de los JWS anidados como confiable por transitividad para el
 * payload; cada uno trae su propia cadena x5c).
 */
export function extractNotificationPayload(
  payload: AppleNotificationPayload,
): ExtractedNotificationPayload {
  const data = payload.data ?? {}
  return {
    notificationType:
      typeof payload.notificationType === 'string' ? payload.notificationType : null,
    subtype: typeof payload.subtype === 'string' ? payload.subtype : null,
    notificationUUID:
      typeof payload.notificationUUID === 'string' ? payload.notificationUUID : null,
    signedTransactionInfo:
      typeof data.signedTransactionInfo === 'string' ? data.signedTransactionInfo : null,
    signedRenewalInfo:
      typeof data.signedRenewalInfo === 'string' ? data.signedRenewalInfo : null,
    signedDate: msToDate(payload.signedDate),
    environment: normalizeEnvironment(data.environment),
  }
}
