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
  // 1.2.0: build 13 (1.1.0) ya en el App Store; esta submission suma
  // features nuevos (coalescing de push, FAB con tap→menú, metas
  // secuenciales, categorías) → nueva versión de marketing.
  version: '1.2.0',
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
    // i18n (2026-06-26): expo-localization expone el idioma del sistema
    // (getLocales) para que el LanguageProvider arranque en el idioma del
    // teléfono y caiga a 'es' si no es ES/EN. El override manual (ES/EN/
    // Sistema) vive en Ajustes y se persiste en persistent-kv.
    'expo-localization',
    // Google sign-in (2026-06-21): el flujo OAuth web (signInWithOAuth +
    // PKCE → WebBrowser.openAuthSessionAsync) usa expo-web-browser. NO se
    // registra como plugin acá a propósito: el módulo nativo lo cablea
    // Expo autolinking desde package.json (igual que expo-screen-capture
    // más abajo). El config-plugin de expo-web-browser es un no-op salvo
    // que se pase `experimentalLauncherActivity` (Android), que no usamos,
    // y NO agrega las <queries> de Custom Tabs. En iOS openAuthSessionAsync
    // usa ASWebAuthenticationSession y no requiere config extra. Igual
    // requiere build nativa nueva para el dev build / producción (Expo Go
    // ya trae expo-web-browser). Ver mobile/features/auth/social-sign-in.ts.
    //
    // TODO Android (Play Store launch): si en Android el Custom Tab no
    // resuelve por package-visibility de Android 11+, agregar <queries>
    // explícitas (el plugin no las provee).
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
    // photosPermission: string ES propio (el default del plugin queda en
    // inglés genérico, inconsistente con el resto del copy). Aparece en el
    // prompt nativo de fototeca del flujo de import OCR.
    [
      'expo-image-picker',
      {
        microphonePermission: false,
        photosPermission:
          'Manifiesto necesita acceso a tus fotos para importar capturas de movimientos y leer sus montos.',
      },
    ],
    // Fix build EAS 2026-06-12: GoogleSignIn 9.x declara
    // `AppCheckCore ~> 11.0` (flota). AppCheckCore 11.3.0 sumó la dep
    // RecaptchaInterop y dispara la validación de Swift-estático
    // contra GoogleUtilities/RecaptchaInterop, que no definen módulos
    // — `pod install` muere en EAS (local resolvió 11.2.0 y pasó).
    // El fix que sugiere el propio error: modular headers para esos
    // dos pods. Sobrevive a futuras versiones de AppCheckCore.
    [
      'expo-build-properties',
      {
        ios: {
          extraPods: [
            { name: 'GoogleUtilities', modular_headers: true },
            { name: 'RecaptchaInterop', modular_headers: true },
          ],
        },
      },
    ],
    // Share-to-import (2026-06-12): la Share Extension de iOS y los
    // intent-filters de Android los genera este plugin en prebuild.
    // iOS activa SOLO para imágenes y máximo 1 (decisión spec: una
    // captura por share en v1). Android queda configurado pero sin QA
    // hasta el launch de Play Store. Requiere build nativa nueva — un
    // OTA no alcanza para que Manifiesto aparezca en el share sheet.
    // Versión pineada ~5.1.1: la línea 5.x es la de SDK 54 (6=55, 7=56).
    [
      'expo-share-intent',
      {
        iosActivationRules: {
          NSExtensionActivationSupportsImageWithMaxCount: 1,
        },
        androidIntentFilters: ['image/*'],
      },
    ],
    // Suscripciones de Apple (StoreKit 2 vía expo-iap). Sin opciones:
    // NO usamos alternative billing / external purchase link (vamos con
    // IAP nativo puro). El plugin cablea el módulo nativo; la capability
    // "In-App Purchase" del App ID la administra EAS al firmar.
    // Requiere build nativa (como share-intent / ML Kit).
    'expo-iap',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Permite Face ID para desbloquear tu acceso guardado en Manifiesto.',
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
        // minSdk 29 (Android 10) — decisión owner 2026-07-17: el
        // vocabulario neumórfico del rediseño usa boxShadow inset, que
        // RN 0.81 sólo dibuja desde API 29 (outset desde 28), sin
        // fallback (se descarta en silencio en Android viejo). Fijar el
        // piso en 29 hace que TODAS las sombras rindan sin código
        // condicional. Costo: se dejan fuera Android 7–9 (cola
        // decreciente; app pre-launch, sin base instalada afectada).
        android: { minSdkVersion: 29 },
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
    // Apple Pay → Atajos (2026-08-08). El App Intent tiene que vivir en el
    // target PRINCIPAL, no en un Pod: los intents dentro de una librería
    // estática pueden no ser indexados por Apple y la acción no aparecería
    // en Atajos. Este plugin copia los .swift a ios/<App>/ y los agrega al
    // build phase en cada prebuild. Requiere build nativa (no sale por OTA).
    './plugins/with-apple-pay-intent.cjs',
    // Tamaño del texto (2026-08-14): el fontScale del OS rompía la UI, así
    // que el tamaño lo gobierna la preferencia in-app (Ajustes → Tamaño del
    // texto). Este plugin fija configuration.fontScale = 1 en MainActivity
    // como kill nativo de respaldo para el texto de libs de terceros que no
    // pasa por el wrapper de app-text. En iOS no hay contraparte (ver el
    // spec 2026-08-14-font-scale-app-design.md, sección 6).
    './plugins/with-fixed-font-scale.cjs',
  ],
  experiments: {
    typedRoutes: true,
  },
  ios: {
    // iPhone-only para v1.0 (2026-06-30): el binario universal (supportsTablet
    // true) obligaba a subir screenshots de iPad 13" en App Store Connect, y la
    // UI es phone-first (no está optimizada para iPad). Para el launch salimos
    // solo-iPhone. Volver a soportar iPad = poner true + assets de iPad + build
    // nuevo (es atributo del binario UIDeviceFamily, no se cambia desde ASC).
    supportsTablet: false,
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
    // Bump manual por release de TestFlight (appVersionSource: local;
    // con config dinámica el autoIncrement de EAS no puede escribir este
    // archivo). Build 7 (2026-06-19) = build 6 (suscripciones + rediseño
    // de familia + contador fluido + fix de notifs) + las tabs DINÁMICAS
    // de fijos (cada bucket vencidos/pendientes/pagados se muestra solo si
    // tiene items). El build 6 ya estaba en ASC → este es 8 (el número
    // debe ser único por versión). El OTA sigue bloqueado (la firma de
    // updates requiere EAS Enterprise) — todo cambio de JS requiere build.
    // Build 8 (2026-06-29): UI de fijos (nombre completo + íconos dark) +
    // paridad del cupo "Buen día" con el Home (cliente; el cron va aparte).
    // Build 9 (2026-06-30): build 8 ya subido a TestFlight → bump obligatorio
    // (CFBundleVersion único por versión). Incluye, sobre el 8: priming del
    // permiso de push (sheet + cooldown), notif de reactivación del asistente
    // ("dormido"), endurecimiento de validez del asistente, revokes de
    // seguridad (SECURITY DEFINER), reescritura del campo de luciérnagas del
    // splash y los fixes de CI (lint + guards).
    // Build 10 (2026-06-30): build 9 ya en TestFlight → bump. Incluye, sobre el 9:
    // jardín con auto-recuperación por escudo (reemplaza el plantado manual) +
    // íconos sticker de estados + cadencia de escudo semanal; auditoría de
    // seguridad backend (peek_family_invite sin datos financieros del hogar, etc.);
    // familia: invitar es owner-only + refresco de miembros del Home al unirse;
    // fix del ingreso del hogar (suma los aportes de todos los miembros).
    // Build 11 (2026-07-01): overhaul del saldo/cupo del ciclo. Sobre el 10:
    // (1) SALDO DEL MES = plata REAL (resta los fijos a medida que se pagan, no
    //     todos de una) + chip "$X de fijos por pagar"; el CUPO diario sigue
    //     reservando los fijos pendientes (protegido).
    // (2) Cupo diario consistente con el saldo (deja de re-ofrecer plata ya
    //     gastada con override) y el saldo resta TODO el gasto del ciclo (var_cycle).
    // (3) Asistente: cupo/velocity/nudge/income-volatility calculan sobre el
    //     override, no el sueldo base; y sin falsos positivos (las señales esperan
    //     a que cargue toda su data antes de mostrarse).
    // (Los cambios de SQL — cycle_disponible, velocity fallback — ya viven en prod.)
    // Build 12 (2026-07-02): fix del rechazo Apple 2.1(a) sobre 1.0(11)
    // ("connection error message after login"). Sobre el 11: resiliencia
    // post-login — retry con backoff en home_snapshot (un blip transitorio ya
    // no llega a pantalla de error), "Sin conexión" solo con offline
    // VERIFICADO (con internet real el error se surfacea como demora),
    // auto-recuperación del bridge-error (poll 5s) y Reintentar incondicional,
    // y re-señalización de DESTINATION_READY al reentrar a bridging.
    // Build 14 (2026-07-13, v1.2.0): quick wins del próximo build (FAB
    // tap→menú descubrible, metas de ahorro secuenciales con confeti,
    // fixes de categorías largas, desprogramado el check-in de mediodía)
    // + coalescing de push server-side (2+ notifs que caen juntas para un
    // usuario colapsan en 1) con code review en loop (6 pasadas hasta
    // convergencia). Sobre build 13 (2026-07-08, v1.1.0): jardín/racha
    // FAMILIAR, modo de INGRESO VARIABLE por ciclos, rating nativo, fix
    // del re-prompt de FaceID, + auditoría backend completa.
    // Build 15 (2026-08-08): captura de gastos desde Apple Pay vía Atajo de
    // iOS. App Intent nativo en el target principal (no sale por OTA: el
    // intent es código nativo). Al pagar con NFC la app guarda la captura en
    // background y avisa con una notificación local; el gasto se confirma en
    // el sheet de revisión, con la categoría sugerida a partir del historial.
    buildNumber: '15',
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
