export function normalizeAppRoute(rawPath?: string | null): string {
  const value = rawPath?.trim()
  if (!value) {
    return '/(app)/(tabs)/home'
  }

  if (value.startsWith('/(app)/') || value.startsWith('/(auth)/')) {
    return value
  }

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
      return '/(app)/(tabs)/home'
  }
}
