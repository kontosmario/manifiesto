// @ts-check
/**
 * Expo config plugin: inicialización NATIVA del SDK de Meta en el
 * AppDelegate de iOS.
 *
 * Por qué existe
 * --------------
 * react-native-fbsdk-next (13.4.3) no trae hook de `didFinishLaunching` ni
 * toca el AppDelegate: en Expo su único camino de init es
 * `Settings.initializeSDK()` desde JS. Pero el SDK de iOS (FBSDKCoreKit 18,
 * ApplicationDelegate.swift) sólo loguea `fb_mobile_activate_app` desde su
 * observer de `applicationDidBecomeActive`. Si la inicialización llega con la
 * app YA activa — siempre, cuando viene de JS —, el activate del arranque en
 * frío se pierde hasta el próximo background → foreground. Para atribución de
 * instalaciones ese es exactamente el evento que importa.
 *
 * El setup oficial de Meta es llamar a
 * `ApplicationDelegate.shared.application(_:didFinishLaunchingWithOptions:)`
 * desde el AppDelegate: el SDK existe antes del primer didBecomeActive y el
 * activate sale en cada apertura. El `Settings.initializeSDK()` de JS queda
 * idempotente (el SDK guarda `hasInitializeBeenCalled`) y sigue siendo el
 * camino en Android.
 *
 * `ios/` está gitignoreado (prebuild continuo): sin este plugin la línea se
 * perdería en cada regeneración. Requiere build nativa: no sale por OTA.
 *
 * CommonJS `.cjs` por la misma razón que los otros plugins del proyecto: el
 * resolver de Expo carga las entradas con `require` pelado y el package.json
 * declara `"type": "module"`.
 */

const { withAppDelegate } = require('@expo/config-plugins')
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode')

const PLUGIN = 'with-meta-sdk-app-delegate'

/** Línea del template de Expo tras la cual va el `import FBSDKCoreKit`. */
const IMPORT_ANCHOR = /^import Expo$/m
/**
 * El `return super.application(...)` que cierra `didFinishLaunchingWithOptions`
 * en el template de Expo SDK 54. La llamada al delegate de Meta se inserta
 * justo ANTES, con `application` y `launchOptions` ya en scope.
 */
const LAUNCH_RETURN_ANCHOR =
  /^\s*return super\.application\(application, didFinishLaunchingWithOptions: launchOptions\)/m

const IMPORT_LINE = 'import FBSDKCoreKit'
/**
 * Bloque que va antes del `return super.application(...)`.
 *
 * Los logging behaviors van SÓLO en builds de desarrollo (`#if DEBUG`, que el
 * compilador de Swift resuelve en cada configuración: en Release el bloque
 * no existe en el binario). Con ellos el SDK escribe en la consola del
 * proceso cada evento que loguea (`fb_mobile_activate_app`, ...) y cada
 * request/respuesta al Graph API — es la única forma de verificar desde el
 * device que el evento salió, sin depender del lag de Events Manager.
 * Se lee con `xcrun devicectl device process launch --console` (ver
 * docs/operaciones/meta-sdk-atribucion.md).
 */
const LAUNCH_LINE = [
  '#if DEBUG',
  '    Settings.shared.enableLoggingBehavior(.appEvents)',
  '    Settings.shared.enableLoggingBehavior(.networkRequests)',
  '#endif',
  '    ApplicationDelegate.shared.application(application, didFinishLaunchingWithOptions: launchOptions)',
].join('\n')

/**
 * Transformación pura del `AppDelegate.swift`. Idempotente: `mergeContents`
 * marca los bloques con `@generated begin/end <tag>` y no los duplica.
 *
 * @param {string} contents
 * @returns {string}
 */
function applyMetaSdkToAppDelegate(contents) {
  if (!IMPORT_ANCHOR.test(contents) || !LAUNCH_RETURN_ANCHOR.test(contents)) {
    throw new Error(
      `[${PLUGIN}] el AppDelegate.swift no tiene las anclas esperadas ` +
        '(`import Expo` y `return super.application(application, didFinishLaunchingWithOptions: launchOptions)`). ' +
        'Cambió el template de Expo: actualizar este plugin antes de buildear. ' +
        'Si se saltea, el SDK de Meta no se inicializa en el arranque y fb_mobile_activate_app queda mudo.',
    )
  }

  let out = mergeContents({
    tag: 'meta-sdk-import',
    src: contents,
    newSrc: IMPORT_LINE,
    anchor: IMPORT_ANCHOR,
    offset: 1,
    comment: '//',
  }).contents

  out = mergeContents({
    tag: 'meta-sdk-launch',
    src: out,
    newSrc: LAUNCH_LINE,
    anchor: LAUNCH_RETURN_ANCHOR,
    offset: 0,
    comment: '//',
  }).contents

  return out
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withMetaSdkAppDelegate = (config) =>
  withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error(
        `[${PLUGIN}] esperaba un AppDelegate en Swift (Expo SDK 53+) y encontré "${cfg.modResults.language}".`,
      )
    }
    cfg.modResults.contents = applyMetaSdkToAppDelegate(cfg.modResults.contents)
    return cfg
  })

module.exports = withMetaSdkAppDelegate
module.exports.default = withMetaSdkAppDelegate
// Exportada para el test de regresión contra el template real del SDK
// instalado (tests/unit/with-meta-sdk-app-delegate.test.ts).
module.exports.applyMetaSdkToAppDelegate = applyMetaSdkToAppDelegate
