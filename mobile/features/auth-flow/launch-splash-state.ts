// Estado compartido del cold-start launch splash (AuthLaunchSplash).
//
// El driver lo consulta para que el min-hold del bridge nunca venza
// ANTES de que el entrance del fern termine — garantiza que el reveal
// (soar-away) jamás corte el growth, sin meter conocimiento de UI en
// la máquina pura. RootLayoutShell marca shown/gone.

/**
 * Duración del entrance del launch splash. Rediseño arranque
 * (auth-cold-start.tsx): logo pop 0.08–0.98s + wordmark rise 0.75–1.35s
 * → el entrance asienta a los 1350ms. (El visual fern anterior usaba
 * 2000.) Si los timings del cold start cambian, actualizar acá.
 */
export const LAUNCH_ENTRANCE_MS = 1350

let shownAt: number | null = null

export function markLaunchSplashShown() {
  shownAt = Date.now()
}

export function markLaunchSplashGone() {
  shownAt = null
}

/** Ms que faltan para que el entrance del launch termine (0 si no hay launch). */
export function getLaunchEntranceRemainingMs(): number {
  if (shownAt === null) return 0
  return Math.max(0, LAUNCH_ENTRANCE_MS - (Date.now() - shownAt))
}
