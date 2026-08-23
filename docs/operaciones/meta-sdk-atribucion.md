# SDK de Meta (Facebook) — atribución de app ads + SKAdNetwork

Integrado el 2026-08-23. **Sólo medición**: el SDK auto-loguea la activación
(`fb_mobile_activate_app`) y participa de SKAdNetwork. No hay login con Facebook,
no hay eventos propios, no se toca StoreKit ni la lógica de negocio.

| Dato | Valor |
|---|---|
| App ID de Meta | `1962126855190791` |
| URL scheme | `fb1962126855190791` |
| Paquetes | `react-native-fbsdk-next@13.4.3` (FBSDKCoreKit 18.1) · `expo-tracking-transparency@6.0.8` (SDK 54) |
| SKAdNetwork IDs | `v9wttpbfk9.skadnetwork`, `n38lu8286q.skadnetwork` (verificados contra <https://developers.facebook.com/docs/SKAdNetwork>) |
| Prompt ATT | "Usamos este permiso para medir el rendimiento de nuestros anuncios y mejorar Manifiesto." |

El App ID y el client token **no son secretos** (Meta los diseña para ir en el
binario); viven en `app.config.ts` como constantes.

## Dónde vive cada cosa

| Pieza | Archivo | Qué hace |
|---|---|---|
| Config nativa | `app.config.ts` → plugin `react-native-fbsdk-next` | Info.plist: `FacebookAppID`, `FacebookClientToken`, `FacebookDisplayName`, `FacebookAutoLogAppEventsEnabled`, `FacebookAdvertiserIDCollectionEnabled`, URL scheme `fb<appID>`, `LSApplicationQueriesSchemes`, `SKAdNetworkItems` (dedupea contra `ios.infoPlist`). Android: meta-data `com.facebook.sdk.*`, `FacebookActivity`, `CustomTabActivity`, `INTERNET`. |
| ATT | `app.config.ts` → `ios.infoPlist.NSUserTrackingUsageDescription` + plugin `expo-tracking-transparency` | El texto del prompt; en Android, el permiso `com.google.android.gms.permission.AD_ID`. |
| Privacy manifest | `app.config.ts` → `ios.privacyManifests.NSPrivacyTracking: true` | La app pide ATT y comparte el IDFA → "tracking" para Apple. Los dominios los declara el manifest propio de FBSDKCoreKit. |
| Init nativo iOS | `plugins/with-meta-sdk-app-delegate.cjs` | Inyecta `import FBSDKCoreKit` y `ApplicationDelegate.shared.application(_:didFinishLaunchingWithOptions:)` en `AppDelegate.swift`. **Sin esto el activate del arranque en frío no se loguea** (ver abajo). Test: `tests/unit/with-meta-sdk-app-delegate.test.ts`. |
| Init en runtime | `mobile/features/attribution/meta-sdk.ts` (+ política pura en `meta-sdk-init.ts`) | Una vez por runtime, desde `root-layout-shell.tsx` después del primer render: espera foreground → `requestTrackingPermissionsAsync()` → `Settings.initializeSDK()` → `setAdvertiserTrackingEnabled(status === 'granted')` → `setAutoLogAppEventsEnabled(true)`. Web y Expo Go saltean. Test: `tests/unit/meta-sdk-init.test.ts`. |

### Por qué hay init nativo además del de JS

`react-native-fbsdk-next` no trae hook de `didFinishLaunching` ni toca el
AppDelegate; en Expo su único camino es `Settings.initializeSDK()` desde JS. Pero
el SDK de iOS (`ApplicationDelegate.swift`) sólo llama a `activateApp()` desde su
observer de `applicationDidBecomeActive`; si se inicializa con la app ya activa
(siempre, desde JS), el `fb_mobile_activate_app` del arranque en frío se pierde
hasta el próximo background → foreground — justo el evento que atribuye la
instalación. El plugin del AppDelegate es el setup oficial de Meta; el
`initializeSDK()` de JS queda idempotente en iOS (`hasInitializeBeenCalled`) y es
el camino de Android (`FacebookSdk.fullyInitialize()`).

`isAutoInitEnabled: true` en el plugin: el default (`false`) escribe
`com.facebook.sdk.AutoInitEnabled=false` en Android y apaga el
`FacebookInitProvider`; el SDK arrancaría con la Activity ya resumida y el
activate también se perdería. En iOS el SDK ≥ 9 ignora esa clave.

## Comandos

Todo esto es **código nativo: requiere build nueva, no sale por OTA.**

### Development build local en un iPhone (el camino de QA)

```bash
npm run dev:ios
```

(= `expo run:ios --device` contra `.env.dev`; `ios/` se regenera con prebuild si
no existe). Si la build termina bien pero la instalación muere con
`LockdowndClient.startSession TypeError`, instalar con las herramientas de
Apple — el `.app` ya quedó en DerivedData:

```bash
xcrun devicectl list devices
```

```bash
xcrun devicectl device install app --device <UDID> ~/Library/Developer/Xcode/DerivedData/Manifiesto-*/Build/Products/Debug-iphoneos/Manifiesto.app
```

Trampas vistas el 2026-08-23 (iPhone 16 Pro, iOS 26.6):

- `expo run:ios --device <id>` quiere el **UDID clásico** (`00008140-…`, el que
  lista `xcrun xctrace list devices`), no el identificador CoreDevice que
  imprime `devicectl list devices` (`466BCACD-…`): con ese falla con "No device
  UDID or name matching". `devicectl` acepta cualquiera de los dos.
- `pod install` desde un shell no interactivo muere con `Unicode Normalization
  not appropriate for ASCII-8BIT`: exportar `LANG=en_US.UTF-8` antes.
- Con Metro ya levantado, agregar `--no-bundler` para no chocar en el 8081.

Para ver los logs del SDK (qué evento loguea y qué responde Meta) la build de
desarrollo activa `appEvents` + `networkRequests` en el `AppDelegate` bajo
`#if DEBUG`. Se leen lanzando la app con la consola adjunta:

```bash
xcrun devicectl device process launch --console --terminate-existing --device <UDID> com.manifiesto.mobile.ZKYQF7UNYA
```

**Al soltar esa consola (Ctrl-C / kill) `devicectl` mata la app** (`signal 15`):
es para una sesión de QA, no para dejar la app corriendo. Sin `--console` la
app queda abierta y el comando vuelve enseguida.

### Development build por EAS

```bash
eas build --profile development-device --platform ios
```

**No usar `--profile development`:** en `eas.json` ese perfil es `simulator: true`,
y en Apple Silicon la app no corre en simulador (ML Kit sólo trae arm64 de
device). Después, Metro para el dev client:

```bash
npm run dev:start
```

### Release

`buildNumber` + `versionCode` se bumpean a mano como siempre; el flujo de
release no cambia.

## Verificación en device (criterio de éxito)

1. iPhone real con **Ajustes → Privacidad y seguridad → Rastreo → "Permitir que
   las apps soliciten rastrearte" = ON**. Si está apagado, el prompt nunca
   aparece y el estado es `denied` directo (el SDK arranca igual, sin IDFA).
2. Abrir la app: con el splash en pantalla aparece el prompt de ATT. Aceptar.
3. Meta **Events Manager → Fuentes de datos → la app (1962126855190791)**:
   `fb_mobile_activate_app` (y `fb_sdk_initialize`) en "Eventos de prueba" u
   "Overview". Poner el rango en **"Hoy"** (el default termina AYER y muestra
   cero aunque el evento haya llegado). En el QA del 2026-08-23 el Resumen tardó
   ~25 min en reflejar "Activación de la app" e "Instalaciones de la app"
   (ambos "SDK de Facebook"); con `success = 1` en la consola del device, esa
   espera es lag de Meta y no un bug. Para que el evento de prueba se asocie al
   device, la app de Facebook del teléfono también tiene que tener ATT
   permitido (requisito de Meta para test events).
4. Background → foreground loguea otro activate; matar y reabrir también.

Si no aparece nada:

- Dashboard de Meta → **Configuración → Básica → iOS**: el Bundle ID
  (`com.manifiesto.mobile.ZKYQF7UNYA`) y el App Store ID (`6776033487`) cargados,
  y los toggles **"Registrar eventos in-app automáticamente"** y **"Compartir
  datos de eventos con Meta"** en Sí. El SDK baja esa configuración del
  servidor y **un "No" ahí pisa el `FacebookAutoLogAppEventsEnabled` del plist**.
- En dev, `[meta-sdk]` en la consola de Metro: la política loguea con
  `console.warn` si el pedido de ATT o el módulo nativo fallan.
- Que la build sea nativa nueva (el dev client viejo no trae FBSDKCoreKit).
- Con la consola adjunta (arriba), a los ~2 s del arranque tiene que aparecer
  `FBSDKLog: … /1962126855190791/ios_skadnetwork_conversion_config` (el SDK
  nativo vivo, con el App ID correcto) y después las líneas de `appEvents`
  con `fb_mobile_activate_app` y el `POST …/activities` de `networkRequests`.
  Si el evento se ve ahí y no en Events Manager, el problema está del lado
  de la configuración del dashboard, no de la app.

## Pendientes del owner (App Store Connect / Meta)

- ~~Label de App Privacy en ASC~~ **HECHO 2026-08-23.** Quedó: *ID del
  dispositivo* (Publicidad de terceros + Análisis + Funcionalidad), *Interacción
  con el producto* (Publicidad de terceros + Análisis) e *Historial de compras*
  (Publicidad de terceros + Análisis; existe porque el dashboard de Meta tiene
  encendido el log automático de compras/suscripciones vía App Store — si se
  apaga ese toggle, sacar el tipo del label), los tres vinculados y "usados
  para rastrearte" = Sí. Trampa de ASC: al **editar** un tipo ya existente, el
  radio "vinculado = Sí" viene preseleccionado pero si no se clickea explícito
  los usos nuevos se guardan como *no vinculados* (aparece una sección "Datos
  no vinculados contigo" en la vista previa). Marcar No → Sí a mano. Los cambios
  del label se publican al instante, sin versión nueva; con
  `NSPrivacyTracking=true` en el binario y el label diciendo que no se rastrea,
  App Review rechaza.
- Meta → Events Manager → **SKAdNetwork**: configurar el esquema de conversión
  cuando arranquen las campañas (hasta entonces los postbacks llegan sin valor).
- Android: la config del plugin queda escrita (meta-data, activities, `AD_ID`),
  pero **sin QA en device** — entra en el lote de paridad Android junto con el
  Data safety de Play (advertising ID → "Publicidad", compartido con Meta).

## QA abierto

- Convivencia del prompt de ATT con el Face ID del arranque (los dos son UI de
  sistema; iOS los encola). Si molesta, la política acepta mover el `await
  waitForActiveApp()` a "después del unlock" sin tocar el resto.
