// ISO timestamp del deploy inicial del backfill + success screen +
// CTA de saldo (feature "estado inicial de usuario nuevo v1").
//
// Usuarios cuyo profiles.onboarding_completed_at es estrictamente
// ANTERIOR a este timestamp reciben un backfill silencioso (todos
// los tours marcados seen) en el primer arranque post-deploy. Esto
// evita que vean tours retroactivos en pantallas que llevaban tiempo
// usando sin que el auto-fire los molestara.
//
// Ajustar al día efectivo del merge.
export const TOURS_FEATURE_DEPLOYED_AT = '2026-05-27T00:00:00Z'
