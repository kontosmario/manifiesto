// @ts-check
/**
 * Expo config plugin: fija `configuration.fontScale = 1` en MainActivity.
 *
 * El fontScale del OS rompía la UI; el tamaño del texto lo gobierna la
 * preferencia in-app (mobile/features/preferences/font-scale-provider.tsx,
 * 4 niveles persistidos). Este override es el kill nativo de respaldo:
 * cubre el texto que rendericen libs de terceros y no pase por el wrapper
 * de `mobile/components/ui/app-text.tsx`.
 *
 * En iOS ese respaldo NO existe: con la Nueva Arquitectura prendida el
 * multiplicador sale de `RCTFontSizeMultiplier()` (una tabla estática
 * sobre `preferredContentSizeCategory` que nunca consulta a
 * RCTAccessibilityManager), así que `setAccessibilityContentSizeMultipliers`
 * es inerte sobre el texto. Ver la sección 6 del spec
 * docs/superpowers/specs/2026-08-14-font-scale-app-design.md.
 *
 * Es estático — nunca hay que recrear la Activity. `fontScale` no está en
 * el `android:configChanges` del manifest de Expo, así que un cambio de
 * tamaño de fuente en el sistema recrea la Activity y `attachBaseContext`
 * vuelve a correr con el override puesto.
 *
 * android/ es gitignored (prebuild continuo): sin este plugin el override
 * se borraría en cada regeneración. Escrito como CommonJS .cjs (no .ts)
 * por la misma razón que with-android-backup-rules: el resolver de plugins
 * de Expo carga las entradas con `require` pelado, que no entiende
 * TypeScript, y el package.json del proyecto declara "type": "module"
 * (los .js serían ESM). Los tipos vienen de JSDoc + el @ts-check de arriba.
 */

const { withMainActivity } = require('@expo/config-plugins')

// Los tipos de Android van fully-qualified adentro del override para no
// tener que editar la lista de imports del template: un anchor menos que
// se puede romper cuando Expo actualice la plantilla.
const OVERRIDE = `
  // Manifiesto: el fontScale del OS queda neutralizado; el tamaño del
  // texto lo gobierna la preferencia in-app (font-scale-provider).
  override fun attachBaseContext(newBase: android.content.Context) {
    val config = android.content.res.Configuration(newBase.resources.configuration)
    config.fontScale = 1f
    super.attachBaseContext(newBase.createConfigurationContext(config))
  }
`

const MARKER = 'config.fontScale = 1f'
const ANCHOR = 'class MainActivity : ReactActivity() {'

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withFixedFontScale = (config) => {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error(
        'with-fixed-font-scale: MainActivity no es Kotlin — revisar el template de Expo',
      )
    }

    const src = mod.modResults.contents
    if (src.includes(MARKER)) return mod

    if (!src.includes(ANCHOR)) {
      throw new Error(
        'with-fixed-font-scale: no encontré el anchor de MainActivity — revisar el template de Expo',
      )
    }

    mod.modResults.contents = src.replace(ANCHOR, `${ANCHOR}\n${OVERRIDE}`)
    return mod
  })
}

module.exports = withFixedFontScale
module.exports.default = withFixedFontScale
