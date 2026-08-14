// @ts-check
/**
 * Expo config plugin: neutraliza el `fontScale` del OS en Android.
 *
 * El fontScale del sistema rompía la UI; el tamaño del texto lo gobierna la
 * preferencia in-app (mobile/features/preferences/font-scale-provider.tsx,
 * 4 niveles persistidos). Este override es el kill nativo de respaldo:
 * cubre el texto que rendericen libs de terceros y no pase por el wrapper
 * de `mobile/components/ui/app-text.tsx`.
 *
 * DÓNDE VA EL OVERRIDE (y por qué en los DOS lados):
 *
 * - `MainApplication` es el que cubre el texto de React Native. RN NO mide
 *   el texto contra los Resources de la View: todo `<Text>` sale por
 *   `PixelUtil.toPixelFromSP()`, que lee el singleton
 *   `DisplayMetricsHolder.getWindowDisplayMetrics()`. Ese singleton se
 *   siembra SIEMPRE desde el contexto de APLICACIÓN, nunca desde la
 *   Activity: en bridgeless (newArchEnabled) `ReactInstance` lo inicializa
 *   con el `BridgelessReactContext`, que es `ReactApplicationContext(context)`
 *   → `ReactContext(context.applicationContext)`, y `ReactContext` no
 *   sobreescribe `getResources()`; en el path legacy `ReactRootView` pasa
 *   `getContext().getApplicationContext()` explícito. Wrappeando el base de
 *   la Application, `getResources().getDisplayMetrics().scaledDensity` queda
 *   en `density × 1` y el texto de terceros (que llega con
 *   `allowFontScaling` en su default true) deja de escalar. Efecto lateral
 *   buscado: `DeviceInfoModule` lee `reactContext.resources.configuration
 *   .fontScale` (también Application), así que `PixelRatio.getFontScale()` y
 *   `Dimensions.get('window').fontScale` devuelven 1.
 * - `MainActivity` cubre solo lo que se infla con el contexto de la Activity
 *   (diálogos y pickers nativos, títulos de Toolbar). Es marginal en una app
 *   RN, pero es el único camino para esos widgets.
 *
 * DELTA, NO COPIA — `createConfigurationContext` trata el argumento como un
 * override parcial y lo aplica con `Configuration.updateFrom()`, que copia
 * TODO campo seteado (fontScale>0, uiMode, orientation, locale, screenWidthDp,
 * densityDpi, layoutDirection...). Por eso el override es una `Configuration()`
 * vacía (setToDefaults deja todo en UNDEFINED) con solo `fontScale`. Pasar una
 * copia completa de la configuration del momento del attach la CONGELA para
 * siempre: el framework re-basea cada cambio de config contra ese mismo
 * snapshot almacenado, y el manifest declara
 * `configChanges="...|uiMode|locale|layoutDirection|orientation|screenSize"`,
 * o sea que esos cambios no recrean la Activity ni vuelven a correr
 * `attachBaseContext`. Con la copia completa, prender el modo oscuro del
 * sistema con la app en foreground dejaba la app en claro hasta matar el
 * proceso (el tema arranca en «Sistema»): `AppearanceModule` resuelve el
 * esquema leyendo `configuration.uiMode` de la Activity.
 *
 * En iOS NO hay contraparte: con la Nueva Arquitectura prendida el
 * multiplicador sale de `RCTFontSizeMultiplier()` (una tabla estática
 * sobre `preferredContentSizeCategory` que nunca consulta a
 * RCTAccessibilityManager), así que `setAccessibilityContentSizeMultipliers`
 * es inerte sobre el texto. Ver la sección 6 del spec
 * docs/superpowers/specs/2026-08-14-font-scale-app-design.md.
 *
 * android/ es gitignored (prebuild continuo): sin este plugin el override
 * se borraría en cada regeneración. Escrito como CommonJS .cjs (no .ts)
 * por la misma razón que with-android-backup-rules: el resolver de plugins
 * de Expo carga las entradas con `require` pelado, que no entiende
 * TypeScript, y el package.json del proyecto declara "type": "module"
 * (los .js serían ESM). Los tipos vienen de JSDoc + el @ts-check de arriba.
 */

const { withMainActivity, withMainApplication } = require('@expo/config-plugins')

// Los tipos de Android van fully-qualified adentro del override para no
// tener que editar la lista de imports del template: un anchor menos que
// se puede romper cuando Expo actualice la plantilla.
/** @param {string} scope Qué cubre este override, para el comentario del fuente. */
const overrideFor = (scope) => `
  // Manifiesto (font-scale): el fontScale del OS queda neutralizado; el
  // tamaño del texto lo gobierna la preferencia in-app (font-scale-provider).
  // ${scope}
  // La Configuration va VACÍA salvo fontScale: createConfigurationContext la
  // aplica como delta (Configuration.updateFrom copia todo campo seteado), y
  // una copia completa congelaría uiMode/locale/orientación para siempre.
  override fun attachBaseContext(newBase: android.content.Context) {
    val fontScaleOverride = android.content.res.Configuration()
    fontScaleOverride.fontScale = 1f
    super.attachBaseContext(newBase.createConfigurationContext(fontScaleOverride))
  }`

const ATTACH_BASE_CONTEXT = 'override fun attachBaseContext('

// Matchea CUALQUIER override inyectado por este plugin, incluidas versiones
// viejas: sin esto, un android/ ya generado con la variante anterior se
// quedaba con el bug (el marcador de idempotencia la daba por buena) o
// terminaba con dos `attachBaseContext` y no compilaba. Se come también los
// saltos de línea que quedan detrás para que reinyectar sea byte a byte igual
// (si no, cada prebuild sumaba una línea en blanco).
const PREVIOUS_OVERRIDE =
  /\n[ \t]*\/\/ Manifiesto[^\n]*fontScale[\s\S]*?override fun attachBaseContext\([\s\S]*?\n[ \t]*\}\n+/

/**
 * @param {string} src Fuente Kotlin del archivo generado.
 * @param {string} anchor Declaración de la clase donde se inyecta.
 * @param {string} override Bloque Kotlin a insertar.
 * @param {string} file Nombre del archivo, solo para los mensajes de error.
 * @returns {string}
 */
const injectOverride = (src, anchor, override, file) => {
  const stripped = src.replace(PREVIOUS_OVERRIDE, '\n')

  if (stripped.includes(ATTACH_BASE_CONTEXT)) {
    throw new Error(
      `with-fixed-font-scale: ${file} ya declara attachBaseContext por fuera de este plugin — revisar el template de Expo`,
    )
  }

  if (!stripped.includes(anchor)) {
    throw new Error(
      `with-fixed-font-scale: no encontré el anchor de ${file} — revisar el template de Expo`,
    )
  }

  return stripped.replace(anchor, () => `${anchor}\n${override}`)
}

const ACTIVITY_ANCHOR = 'class MainActivity : ReactActivity() {'
const APPLICATION_ANCHOR = 'class MainApplication : Application(), ReactApplication {'

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withFixedFontScale = (config) => {
  const withActivity = withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error(
        'with-fixed-font-scale: MainActivity no es Kotlin — revisar el template de Expo',
      )
    }

    mod.modResults.contents = injectOverride(
      mod.modResults.contents,
      ACTIVITY_ANCHOR,
      overrideFor('Alcanza a las vistas nativas infladas con el contexto de la Activity.'),
      'MainActivity',
    )
    return mod
  })

  return withMainApplication(withActivity, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error(
        'with-fixed-font-scale: MainApplication no es Kotlin — revisar el template de Expo',
      )
    }

    mod.modResults.contents = injectOverride(
      mod.modResults.contents,
      APPLICATION_ANCHOR,
      overrideFor('Este es el que alcanza al texto de React Native (DisplayMetricsHolder).'),
      'MainApplication',
    )
    return mod
  })
}

module.exports = withFixedFontScale
module.exports.default = withFixedFontScale
