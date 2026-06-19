// Auth flow diagnostic logger.
//
// Logs timestamped events relative to the first call (T+0) so it's easy
// to trace WHEN things happen in the auth pipeline. Only active en __DEV__.
//
// Usage:
//   import { authFlowLog } from '@/lib/auth-flow-logger'
//   authFlowLog('unlock-screen', 'fireUnlock entry')
//   authFlowLog('controller', 'showAuthTransitionSplash called')
//
// Filter en Metro logs con: [auth-flow]
//
// Reset el timestamp baseline llamando `resetAuthFlowTimer()` cuando arranca
// un nuevo flow (ej: cold start, tap login button).

let baselineMs: number | null = null

// Silenciado por default (igual que anim-log): no ensucia la consola de dev a
// menos que se prenda explícitamente vía setAuthFlowLogEnabled(true). No
// persiste — se resetea con cada reload.
let enabled = false

export function setAuthFlowLogEnabled(value: boolean) {
  enabled = value && __DEV__
}

export function authFlowLog(tag: string, message: string, extra?: Record<string, unknown>) {
  if (!__DEV__ || !enabled) return
  if (baselineMs === null) {
    baselineMs = Date.now()
  }
  const elapsed = Date.now() - baselineMs
  const elapsedStr = `T+${elapsed.toString().padStart(5, ' ')}ms`
  const extraStr = extra ? ` ${JSON.stringify(extra)}` : ''
  console.log(`[auth-flow] ${elapsedStr} [${tag}] ${message}${extraStr}`)
}

export function resetAuthFlowTimer() {
  if (!__DEV__ || !enabled) return
  baselineMs = Date.now()
  console.log('[auth-flow] ─── TIMER RESET ───')
}
