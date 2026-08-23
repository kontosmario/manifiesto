// Allowlist for routes the server is permitted to deep-link the
// app into via push notification payloads.
//
// Why an allowlist (vs. accepting any string starting with /(app)/):
//   The previous implementation passed through any `/(app)/...` or
//   `/(auth)/...` string verbatim. A push payload could route the
//   user into mutation screens (add-fixed-expense, settings sheets,
//   onboarding flows) without confirmation, which is undesirable
//   even within the family threat model. We constrain push entry
//   points to a known set of safe, read-only landing screens.

const SAFE_PUSH_ROUTES = [
  '/(app)/(tabs)/home',
  '/(app)/(tabs)/expenses',
  '/(app)/(tabs)/fixed-expenses',
  // OJO: '/(app)/(tabs)/control' NO va acá. La tab se renombró a `insights`
  // en el rediseño y esa ruta ya no existe; tenerla en el allowlist hacía
  // que los payloads server legacy (cycle_close, assistant_dormant, racha
  // del jardín) pasaran DIRECTO y expo-router pusheara una ruta muerta →
  // pantalla en blanco (no hay +not-found). Incidente 2026-08-23. El alias
  // de abajo la remapea.
  '/(app)/(tabs)/insights',
  '/(app)/notifications',
  '/(app)/settings',
  '/(auth)/login',
  '/(auth)/join',
] as const

const SAFE_ROUTE_SET = new Set<string>(SAFE_PUSH_ROUTES)

export function normalizeAppRoute(rawPath?: string | null): string {
  const value = rawPath?.trim()
  if (!value) {
    return '/(app)/(tabs)/home'
  }

  // Direct allowlist match.
  if (SAFE_ROUTE_SET.has(value)) {
    return value
  }

  // Friendly aliases that resolve to allowlisted routes.
  switch (value) {
    case '/home':
    case 'home':
    case '/app':
    case 'app':
      return '/(app)/(tabs)/home'
    case '/expenses':
    case 'expenses':
    case '/app/expenses':
      return '/(app)/(tabs)/expenses'
    case '/fixed-expenses':
    case 'fixed-expenses':
    case '/app/fixed-expenses':
    case '/commitments':
    case 'commitments':
    case '/app/commitments':
      return '/(app)/(tabs)/fixed-expenses'
    case '/notifications':
    case 'notifications':
      return '/(app)/notifications'
    case '/control':
    case 'control':
    case '/(app)/(tabs)/control':
      return '/(app)/(tabs)/insights'
    case '/insights':
    case 'insights':
      return '/(app)/(tabs)/insights'
    case '/settings':
    case 'settings':
      return '/(app)/settings'
    case '/login':
    case 'login':
      return '/(auth)/login'
    case '/join':
    case 'join':
      return '/(auth)/join'
    default:
      // Unknown route — fall back to home rather than passing
      // through arbitrary `/(app)/...` paths from a push payload.
      return '/(app)/(tabs)/home'
  }
}
