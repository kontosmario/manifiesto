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

export function authFlowLog(tag: string, message: string, extra?: Record<string, unknown>) {
  if (!__DEV__) return
  if (baselineMs === null) {
    baselineMs = Date.now()
  }
  const elapsed = Date.now() - baselineMs
  const elapsedStr = `T+${elapsed.toString().padStart(5, ' ')}ms`
  const extraStr = extra ? ` ${JSON.stringify(extra)}` : ''
  // eslint-disable-next-line no-console
  console.log(`[auth-flow] ${elapsedStr} [${tag}] ${message}${extraStr}`)
}

export function resetAuthFlowTimer() {
  if (!__DEV__) return
  baselineMs = Date.now()
  // eslint-disable-next-line no-console
  console.log('[auth-flow] ─── TIMER RESET ───')
}
