// @ts-check
/**
 * Expo config plugin: mete el App Intent de Apple Pay en el TARGET
 * PRINCIPAL de iOS.
 *
 * Por qué no vive en el módulo Expo
 * ---------------------------------
 * Los módulos Expo compilan como Pod, o sea como librería estática. Un
 * App Intent dentro de una librería estática puede no ser indexado por el
 * `appintentsmetadataprocessor` de Apple, y entonces la acción NUNCA
 * aparece en la app Atajos. Es el riesgo #1 del diseño, así que el `.swift`
 * del intent se copia a `ios/<App>/` y se suma al build phase de Sources
 * del target de la app.
 *
 * Por qué el store se copia desde `modules/`
 * ------------------------------------------
 * `ManifiestoCaptureStore.swift` tiene que compilar en los DOS lados: en el
 * target principal (lo usa el intent, que ESCRIBE) y en el Pod del módulo
 * Expo (lo usa el puente a JS, que LEE). Swift no cruza módulos hacia
 * arriba — un Pod no puede importar el módulo de la app — así que no
 * alcanza con tenerlo en un solo target. En disco hay UN SOLO archivo (el
 * del módulo, que es el que versiona git); esta copia es la que le da su
 * segunda compilación al target principal. Si hubiera dos archivos, las
 * claves de `UserDefaults` se desincronizarían y la feature se rompería en
 * silencio.
 *
 * `ios/` está gitignoreado (prebuild continuo), así que sin este plugin las
 * copias se perderían en cada regeneración. Requiere build nativa: no sale
 * por OTA.
 *
 * Escrito como CommonJS `.cjs` (no `.ts`) porque el resolver de plugins de
 * Expo carga las entradas con `require` pelado, que no entiende TypeScript.
 * La extensión `.cjs` es obligatoria porque el `package.json` del proyecto
 * declara `"type": "module"`.
 */

const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins')
const fs = require('node:fs')
const path = require('node:path')

/**
 * Fuentes Swift que van al target principal, con la carpeta de origen de
 * cada una (relativa a la raíz del proyecto).
 * @type {{ dir: string[]; file: string }[]}
 */
const SOURCES = [
  {
    dir: ['plugins', 'apple-pay-intent'],
    file: 'ManifiestoLogExpenseIntent.swift',
  },
  {
    dir: ['modules', 'apple-pay-capture', 'ios'],
    file: 'ManifiestoCaptureStore.swift',
  },
]

/**
 * El pbxproj guarda nombres con comillas cuando tienen espacios o
 * caracteres raros. Comparar sin normalizar da falsos negativos.
 * @param {unknown} value
 * @returns {string | null}
 */
const unquote = (value) => {
  if (typeof value !== 'string') return null
  return value.replace(/^"(.*)"$/, '$1')
}

/**
 * El grupo del target de la app. OJO: hay MÁS DE UN `PBXGroup` llamado
 * como la app — Expo genera otro bajo `ExpoModulesProviders` que sólo
 * contiene `ExpoModulesProvider.swift`. `findPBXGroupKey({ name })`
 * devuelve el primero que encuentra, que hoy es el bueno pero depende del
 * orden del archivo. Acá desempatamos por contenido: el grupo bueno es el
 * que tiene el `AppDelegate.swift`.
 *
 * @param {any} project
 * @param {string} appName
 * @returns {string | null}
 */
const findAppGroupKey = (project, appName) => {
  const groups = project.hash?.project?.objects?.PBXGroup ?? {}
  let fallback = null

  for (const [key, group] of Object.entries(groups)) {
    if (key.endsWith('_comment') || !group || typeof group !== 'object') continue
    // @ts-expect-error — el hash del pbxproj no está tipado.
    const name = unquote(group.name) ?? unquote(group.path)
    if (name !== appName) continue

    // @ts-expect-error — idem.
    const children = Array.isArray(group.children) ? group.children : []
    const hasAppDelegate = children.some((child) =>
      String(child?.comment ?? '').endsWith('AppDelegate.swift'),
    )
    if (hasAppDelegate) return key
    fallback ??= key
  }

  return fallback
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withApplePayIntent = (config) => {
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const destDir = path.join(
        cfg.modRequest.platformProjectRoot,
        cfg.modRequest.projectName ?? '',
      )
      fs.mkdirSync(destDir, { recursive: true })

      for (const source of SOURCES) {
        const src = path.join(cfg.modRequest.projectRoot, ...source.dir, source.file)
        fs.copyFileSync(src, path.join(destDir, source.file))
      }

      return cfg
    },
  ])

  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults
    const appName = cfg.modRequest.projectName
    if (!appName) {
      throw new Error('[apple-pay-intent] no se pudo resolver el nombre del proyecto iOS.')
    }

    const targetKey = project.findTargetKey(appName) ?? project.getFirstTarget()?.uuid
    if (!targetKey) {
      throw new Error(`[apple-pay-intent] no se encontró el target nativo "${appName}".`)
    }

    const groupKey = findAppGroupKey(project, appName)
    if (!groupKey) {
      throw new Error(`[apple-pay-intent] no se encontró el PBXGroup "${appName}".`)
    }

    for (const source of SOURCES) {
      // Las rutas del pbxproj son relativas a `ios/`, y el grupo de la app
      // no tiene `path` propio, así que se escribe `<App>/<archivo>.swift`
      // igual que el `AppDelegate.swift`.
      const relative = `${appName}/${source.file}`
      // Idempotencia: un prebuild sin `--clean` reusa el pbxproj existente
      // y volveríamos a agregar el mismo archivo en cada corrida.
      if (project.hasFile(relative)) continue
      project.addSourceFile(relative, { target: targetKey }, groupKey)
    }

    return cfg
  })

  return config
}

module.exports = withApplePayIntent
module.exports.default = withApplePayIntent
// Exportado para que el test de regresión verifique que estas rutas llegan al
// sandbox del build de EAS. No basta con que estén trackeadas: si un ancestro
// matchea un patrón de .gitignore, el empaquetador poda el directorio y el
// prebuild muere con ENOENT (pasó con `modules/*/ios/` el 2026-08-17).
// Ver tests/unit/plugin-sources-reach-build.test.ts.
module.exports.SOURCES = SOURCES
