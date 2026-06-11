// Estado compartido del cold-start launch splash (AuthLaunchSplash).
//
// El driver lo consulta para que el min-hold del bridge nunca venza
// ANTES de que el entrance del fern termine — garantiza que el reveal
// (soar-away) jamás corte el growth, sin meter conocimiento de UI en
// la máquina pura. RootLayoutShell marca shown/gone.

/** Duración del entrance del launch splash (fern growth + wordmark rise). */
export const LAUNCH_ENTRANCE_MS = 2000

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
