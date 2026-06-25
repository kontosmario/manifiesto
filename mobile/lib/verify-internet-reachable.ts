// Verificación ACTIVA de internet (round-trip real), fuente de verdad por
// encima de NetInfo.
//
// Por qué existe: NetInfo (`isInternetReachable`) es poco confiable —
//   1. Al resumir de background emite un snapshot STALE (la OS suspendió la
//      radio) que puede decir "offline" durante varios segundos aunque haya
//      conexión real.
//   2. Su probe por defecto pega a `clients3.google.com/generate_204`; si esa
//      URL está lenta o bloqueada en la red del usuario, `isInternetReachable`
//      queda en `false` de forma PERSISTENTE → falso "Sin conexión a internet".
// Confiar solo en eso hacía aparecer la vista de offline teniendo internet.
//
// Esta función hace un GET real a varios endpoints y resuelve `true` apenas UNO
// confirma. TODOS son endpoints `generate_204` (Google + Cloudflare, distintos
// proveedores por redundancia) y se exige status EXACTO 204: eso detecta
// CAPTIVE PORTALS, que interceptan con un 200/redirect a su login en vez de un
// 204 vacío → se tratan como "sin internet real", correcto para una app que
// necesita su backend. Acepta un `signal` para que el caller pueda cancelar la
// verificación en vuelo (evita races de "mostrar offline después de volver
// online").

interface Probe {
  url: string
  ok: (status: number) => boolean
}

const is204 = (status: number) => status === 204

// Se corren en paralelo; gana el primero que confirme. Solo 204-estrictos.
const PROBES: Probe[] = [
  { url: 'https://www.gstatic.com/generate_204', ok: is204 },
  { url: 'https://connectivitycheck.gstatic.com/generate_204', ok: is204 },
  { url: 'https://cp.cloudflare.com/generate_204', ok: is204 },
]

const DEFAULT_TIMEOUT_MS = 4000 // holgado para celular AR lento; gana la 1ª rápida

export interface VerifyOptions {
  timeoutMs?: number
  /** Permite cancelar la verificación desde afuera (cleanup de effect, etc.). */
  signal?: AbortSignal
}

/**
 * Verifica si el dispositivo realmente tiene internet. Resuelve `true` apenas
 * un endpoint confiable responde 204; `false` cuando TODOS fallan/timeoutean o
 * si el `signal` ya estaba abortado. Nunca lanza.
 */
export async function verifyInternetReachable(opts: VerifyOptions = {}): Promise<boolean> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal } = opts
  if (signal?.aborted) return false
  const attempts = PROBES.map((probe) => runProbe(probe, timeoutMs, signal))
  return firstTrue(attempts)
}

async function runProbe(probe: Probe, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onExternalAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onExternalAbort)
  }
  try {
    // Cache-bust por query param: garantiza un round-trip real (no una
    // respuesta cacheada por el OS/CDN que daría un falso "online").
    const res = await fetch(`${probe.url}?_=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
    return probe.ok(res.status)
  } catch {
    // Abort (timeout/cancel externo), DNS, o error de red → no confirma.
    return false
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onExternalAbort)
  }
}

/**
 * Como `Promise.any` pero por VALOR: resuelve `true` apenas una promesa da
 * `true`; resuelve `false` recién cuando todas resolvieron `false`. (Las
 * probes nunca rechazan.)
 */
function firstTrue(promises: Array<Promise<boolean>>): Promise<boolean> {
  return new Promise((resolve) => {
    let remaining = promises.length
    if (remaining === 0) {
      resolve(false)
      return
    }
    for (const p of promises) {
      void p.then((ok) => {
        if (ok) resolve(true)
        else if (--remaining === 0) resolve(false)
      })
    }
  })
}
