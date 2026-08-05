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
  // NOTA (F5/F6 2026-07-22): la nav-bar sigue aprobada, pero el visual
  // CANÓNICO VIVO es `home-final` (NeoTabBarLive) — supersede la réplica
  // 1b/1c del doc viejo (`NeoTabBar`, ya ELIMINADA por huérfana). El swap
  // live (`tabBar={renderNeoTabBar}`) monta NeoTabBarLive con surco + FAB
  // dark invertido crema + itemDots, no la vieja réplica.
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
  // HOME FINAL (handoff nuevo design/home-final-2026-07, 2026-07-21):
  // supersede el Inicio 1b/1c del doc viejo. Hero saldo con pozo + medidor
  // de cupo, resumen ciclo, meta, racha Brot reactivo, actividad y nav
  // nueva (FAB con surco; oscuro invertido crema). APROBADA 2026-07-21
  // ("es hora de llevarlo y cablearlo con la HOME real"). Cableado en curso.
  'home-final': 'aprobada',
  // GASTOS (rediseño, handoff design/gastos-2026-07, 2026-07-21): réplica
  // pixel-perfect claro/oscuro + máquina de estados (calendario⇄detalle,
  // dropdown de ciclo, filtro, vencido, cerrado). APROBADA 2026-07-29
  // ("GASTOS Y NAV Y HOME APROBADOS"), ya cableada a datos reales.
  'gastos': 'aprobada',
  // FIJOS (rediseño, handoff design/fijos-2026-07, 2026-07-29): sección
  // completa en tres pantallas — vista principal (hero E1-E8 + componente
  // Avisos A1-A6 + tabs/categorías), detalle expandido del ítem y alta en
  // 2 pasos sin scroll. Se integra por fases, cada una con su gate propio:
  // réplica en preview → aprobación del owner → cableado. PENDIENTE.
  'fijos': 'pendiente',
  // CONTROL (handoff design_handoff_control, 2026-08-03): el owner pidió
  // la integración completa de punta a punta SIN pasar por el gate de
  // réplica ("realiza de punta a punta la integración completa de la
  // nueva vista de control ... procede", 2026-08-03) — el swap en la tab
  // insights es directo; este entry existe para que el índice dev liste
  // el preview con datos reales.
  'control': 'aprobada',
  // EDGE-TO-EDGE + scroll edge effect (2026-08-04): no es una vista del
  // rediseño sino un banco de tuning. Queda en 'pendiente' porque el
  // veredicto del degradé sale del iPhone y todavía no se miró en device.
  'edge-effect': 'pendiente',
}
