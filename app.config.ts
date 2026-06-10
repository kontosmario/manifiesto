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
  icon: './assets/brand/ios-icon-light.png',
  orientation: 'portrait',
  scheme: 'manifiesto',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  // OTA — Sprint C / C7. The EAS Update channel maps to the build
  // profile (see `eas.json`): production builds subscribe to the
  // `production` channel by default. Runtime version pinned to the
  // installed SDK so a JS-only update never lands on an incompatible
  // native shell — bumping SDK 54 → 55 forces a new TestFlight build,
  // not a silent OTA. The fallback timeout is 0 so cold starts never
  // block on the network: if the manifest fetch is slow, we render
  // the cached bundle and download the new one for next launch.
  runtimeVersion: { policy: 'sdkVersion' },
  updates: {
    url: 'https://u.expo.dev/54449767-9236-4734-972a-e561debd1360',
    fallbackToCacheTimeout: 0,
  },
  plugins: [
    'expo-router',
    'expo-notifications',
    'expo-sqlite',
    'expo-asset',
    'expo-secure-store',
    'expo-updates',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Permití Face ID para desbloquear tu acceso guardado en Manifiesto.',
      },
    ],
    // Sign in with Apple — requires the iOS entitlement which the
    // plugin wires up automatically. Apple Developer Portal must
    // also have "Sign In with Apple" capability enabled for this
    // app's bundle id (com.manifiesto.mobile.ZKYQF7UNYA).
    'expo-apple-authentication',
    // Google plugin — only included when EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME
    // is set. Filtered out below.
    ...(googlePlugin ? [googlePlugin] : []),
    // Bumps iOS deployment target to 15.5 to satisfy
    // @react-native-ml-kit/text-recognition v2 (its podspec hardcodes
    // `:ios => "15.5"` via the GoogleMLKit 8.0.0 pods). Sin esto,
    // `pod install` falla con "specs satisfying ... required a higher
    // minimum deployment target". 15.5 cubre ~96% de devices activos.
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '15.5' },
      },
    ],
    // Sprint E · C3 (red team finding 2026-06-10): the Expo default
    // AndroidManifest references @xml/secure_store_backup_rules and
    // @xml/secure_store_data_extraction_rules but never writes them.
    // Missing files → rules silently fall back to "back up everything",
    // so `adb backup` can extract AsyncStorage / SecureStore. This
    // local plugin copies the two XMLs from plugins/android-backup-rules/
    // into android/app/src/main/res/xml/ on every prebuild.
    './plugins/with-android-backup-rules.cjs',
  ],
  experiments: {
    typedRoutes: true,
  },
  ios: {
    supportsTablet: true,
    // El sufijo del Team ID en el bundle id es el resultado de un auto-
    // provisioning de Apple Developer al crear el App ID. Apple no permite
    // modificar el Bundle ID una vez registrado y borrarlo está bloqueado
    // por la entrada de App Store Connect. Como el bundle id es invisible
    // al usuario (solo Apple/EAS lo ven), lo aceptamos así para evitar
    // un eventual cooldown de 30+ días sobre `com.manifiesto.mobile`.
    bundleIdentifier: 'com.manifiesto.mobile.ZKYQF7UNYA',
    // iOS 18+ tri-variant icons. The fern source SVG is rendered
    // into three 1024×1024 PNGs by `scripts/generate-ios-app-icons.mjs`
    // and dropped into `Images.xcassets/AppIcon.appiconset/`. The
    // xcasset Contents.json is the source of truth at archive time;
    // these paths exist so a future `expo prebuild` regenerates the
    // xcasset entries identically.
    icon: {
      light: './assets/brand/ios-icon-light.png',
      dark: './assets/brand/ios-icon-dark.png',
      tinted: './assets/brand/ios-icon-tinted.png',
    },
    usesAppleSignIn: true,
    // App Store compliance — declaramos que sólo usamos crypto
    // estándar de Apple (HTTPS via URLSession, Keychain, etc) y NO
    // implementamos crypto propia. Esto evita el questionnaire de
    // export compliance en cada submission. Si en algún momento
    // empezamos a usar libs como libsodium o implementación propia
    // de AES, hay que sacar esta línea y completar el formulario.
    config: {
      usesNonExemptEncryption: false,
    },
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
      // Hardcoded so it's baked into the bundle regardless of how
      // the build is invoked (xcodebuild direct vs `expo run:ios`
      // vs EAS Build cloud). Previously this read from .env, but
      // the EXConstants build phase runs in a sandboxed shell that
      // doesn't pick up .env reliably — pushed tokens were silently
      // failing with `projectId === ''`. Linked to the EAS project
      // at expo.dev/accounts/markon07/projects/manifiesto.
      projectId: '54449767-9236-4734-972a-e561debd1360',
    },
  },
}

export default config
