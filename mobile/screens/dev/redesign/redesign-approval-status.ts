/**
 * Estado de aprobación de los previews del rediseño 2026-07 (gate del
 * owner: réplica pixel-perfect aprobada contra design/rediseno-2026-07/
 * antes de cablear nada a la app real).
 */

export type PreviewApprovalStatus = 'pendiente' | 'aprobada'

// Única fuente: el flip pendiente→aprobada del owner se edita ACÁ.
export const REDESIGN_APPROVAL: Record<string, PreviewApprovalStatus> = {
  // Fundación (nav bar, Brot, partículas) + onboarding + auth: TODO
  // APROBADO por el owner 2026-07-17 ("todo lo anterior que quedó en
  // pendiente está aprobado").
  'nav-bar': 'aprobada',
  'brot': 'aprobada',
  'particles': 'aprobada',
  // Onboarding fácil: APROBADO 2026-07-16 (flujo completo, creador + joiner).
  'onboarding': 'aprobada',
  'onb-5a': 'aprobada',
  'onb-5b': 'aprobada',
  'onb-5c': 'aprobada',
  'onb-5d': 'aprobada',
  'onb-5e': 'aprobada',
  'onb-5e2': 'aprobada',
  'onb-5f': 'aprobada',
  // Autenticación (Turno 4): réplicas + derivadas + arranques, APROBADAS.
  'auth': 'aprobada',
  'auth-3a': 'aprobada',
  'auth-4a': 'aprobada',
  'auth-4b': 'aprobada',
  'auth-4c': 'aprobada',
  'auth-login-vistas': 'aprobada',
  'auth-forgot': 'aprobada',
  'auth-pin': 'aprobada',
  'auth-bridge': 'aprobada',
  'auth-offline': 'aprobada',
  'auth-coldstart': 'aprobada',
  // Plan del hogar (4m/4mo · paywall): APROBADO 2026-07-18 ("todo SUCCESS
  // y aprobado, incluido el paywall"). Auth + onboarding + paywall = OK,
  // cableados a uso real.
  'auth-plan': 'aprobada',
  // Notificaciones (Turno 6 · mockups 7a/7ao lista · 7b/7bo empty state):
  // APROBADO 2026-07-18. Cableado a la pantalla real en curso.
  'notif': 'aprobada',
}
