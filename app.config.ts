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
    // Sprint F · F1 (red team finding 2026-06-10, Mobile H3 + Infra H-1):
    // OTA bundles are signed with an RSA-2048 key (alg `rsa-v1_5-sha256`,
    // see metadata below). The matching cert is bundled into the app
    // binary at build time; expo-updates rejects any manifest whose
    // signature doesn't verify against this cert.
    //
    // Threat model: a leaked EXPO_TOKEN (compromised GitHub Action dep,
    // stolen ~/.expo session, EAS dashboard phishing) would otherwise let
    // an attacker push an arbitrary JS bundle to the `production` channel
    // and RCE every installed user on next cold start. With signing, the
    // attacker also needs the private key — stored separately as the
    // GitHub Secret EXPO_UPDATE_PRIVATE_KEY (see ota-update.yml) and held
    // offline by the owner.
    //
    // Key rotation: regenerate via `expo-updates codesigning:generate`,
    // ship a new TestFlight build with the new cert, then update the
    // secret. Old binaries continue to verify against the old cert until
    // users update. See docs/operaciones/runbook-release-automation.md.
    codeSigningCertificate: './certs/certificate.pem',
    codeSigningMetadata: {
      keyid: 'main',
      alg: 'rsa-v1_5-sha256',
    },
  },
  plugins: [
    'expo-router',
    'expo-notifications',
    'expo-sqlite',
    'expo-asset',
    'expo-secure-store',
    'expo-updates',
    // Sprint P · Audit #9 P-3 (2026-06-10): expo-screen-capture is used at
    // runtime in auth/PIN screens (login, signup, reset-password, pin-unlock,
    // pin-setup, require-reauth-sheet) via preventScreenCaptureAsync(). The
    // package does NOT export a config plugin (it's runtime-only API), so
    // it does NOT get registered here. Expo autolinking picks up the native
    // module from package.json dependencies directly.
    // Sprint P · Audit #9 P-4 (2026-06-10): expo-image-picker's default
    // plugin config injects `RECORD_AUDIO` permission into the Android
    // manifest because the camera API supports video. We only use the
    // picker for static images (OCR import flow), so the permission
    // inflates the Play Store privacy disclosure for no functional gain.
    // Setting microphonePermission: false drops it from the manifest.
    ['expo-image-picker', { microphonePermission: false }],
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
    // Sprint P · Audit #9 P-1 (2026-06-10): Universal Links so iOS routes
    // auth callbacks (magic link, OAuth redirect, password reset) through
    // https://manifiestoapp.com/auth/* instead of the custom
    // `manifiesto://` scheme. Custom schemes can be hijacked by any other
    // app on the device that registers the same scheme; Universal Links
    // are cryptographically scoped to the AASA file we host at
    // https://manifiestoapp.com/.well-known/apple-app-site-association
    // (owner action — see runbook). We KEEP the `manifiesto://` scheme
    // declared at the top-level `scheme` field as a Supabase OAuth-flow
    // fallback so older clients / providers that don't honor Universal
    // Links still land in the app.
    associatedDomains: ['applinks:manifiestoapp.com'],
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
    // Sprint M · Audit #7 L-3 (2026-06-14): Info.plist previously
    // declared NSMicrophoneUsageDescription and NSCameraUsageDescription
    // (leftover Expo default-template entries) even though no shipping
    // code uses the microphone or camera. App Store privacy labels
    // require usage descriptions to be backed by actual API use. The
    // plist was edited to remove them; this `infoPlist` override pins
    // them to `undefined` so a future `expo prebuild` that re-generates
    // Info.plist from defaults can't silently re-introduce them. Keeps
    // NSPhotoLibraryUsageDescription (used by OCR import flow) and
    // NSFaceIDUsageDescription untouched.
    infoPlist: {
      NSMicrophoneUsageDescription: undefined,
      NSCameraUsageDescription: undefined,
    },
  },
  android: {
    package: 'com.manifiesto.mobile',
    // Sprint P · Audit #9 P-4 (2026-06-10): explicit deny-list to prevent
    // upstream plugins / merged manifests from silently shipping extra
    // permissions. RECORD_AUDIO would otherwise reappear if any future
    // dep declares it (and inflate the Play Store privacy declaration).
    // SYSTEM_ALERT_WINDOW would let the app draw over other apps — a
    // capability we never want and that triggers Play Store review flags.
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
    // Sprint P · Audit #9 P-1 (2026-06-10): Android App Links so the
    // OS routes https://manifiestoapp.com/auth/* deep-links to this app
    // without the disambiguation chooser (autoVerify resolves against
    // https://manifiestoapp.com/.well-known/assetlinks.json — owner
    // action to host, see runbook). The custom `manifiesto://` scheme
    // remains active via the top-level `scheme` field for Supabase OAuth
    // fallback paths that don't honor App Links.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: 'manifiestoapp.com', pathPrefix: '/auth' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
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
