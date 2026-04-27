import type { ExpoConfig } from 'expo/config'

type PluginEntry = NonNullable<ExpoConfig['plugins']>[number]

// Google sign-in plugin requires `iosUrlScheme` (reversed iOS OAuth
// client ID, e.g. com.googleusercontent.apps.123-abc) and refuses to
// load without it. Only register the plugin when the env var is
// present — otherwise we'd block the whole project from booting.
// The JS handler in social-sign-in.ts already gracefully reports
// "no configurado" so callers see a friendly fallback at runtime.
const GOOGLE_IOS_URL_SCHEME = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME
const googlePlugin: PluginEntry | null = GOOGLE_IOS_URL_SCHEME
  ? [
      '@react-native-google-signin/google-signin',
      { iosUrlScheme: GOOGLE_IOS_URL_SCHEME },
    ]
  : null

const config: ExpoConfig = {
  name: 'Manifiesto',
  slug: 'manifiesto',
  version: '1.0.0',
  icon: './assets/brand/wallet-cartoon-app-icon.png',
  orientation: 'portrait',
  scheme: 'manifiesto',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  plugins: [
    'expo-router',
    'expo-notifications',
    'expo-sqlite',
    'expo-asset',
    'expo-secure-store',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Permití Face ID para desbloquear tu acceso guardado en Manifiesto.',
      },
    ],
    // Sign in with Apple — requires the iOS entitlement which the
    // plugin wires up automatically. Apple Developer Portal must
    // also have "Sign In with Apple" capability enabled for this
    // app's bundle id (com.manifiesto.mobile).
    'expo-apple-authentication',
    // Google plugin — only included when EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME
    // is set. Filtered out below.
    ...(googlePlugin ? [googlePlugin] : []),
  ],
  experiments: {
    typedRoutes: true,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.manifiesto.mobile',
    icon: './assets/brand/wallet-cartoon-app-icon.png',
    usesAppleSignIn: true,
  },
  android: {
    package: 'com.manifiesto.mobile',
  },
  web: {
    bundler: 'metro',
    output: 'single',
  },
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    },
  },
}

export default config
