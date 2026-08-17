import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

const read = (relPath: string) => readFileSync(resolve(root, relPath), 'utf8')

/**
 * Patrones de exclusión de `.gitignore` IGNORANDO las negaciones (`!…`).
 *
 * A propósito NO se usa `git check-ignore`: git aplica las negaciones y
 * respondería "no ignorado" justo en el caso que rompe el build. El
 * empaquetador de EAS poda directorios sin volver a descender, así que lo que
 * hay que modelar es el patrón CRUDO.
 */
function rawExcludePatterns(): string[] {
  return readFileSync(resolve(root, '.gitignore'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#') && !l.startsWith('!'))
    .map((l) => l.replace(/\/$/, ''))
}

/** ¿Este patrón crudo poda el directorio `dir` (ruta relativa al root)? */
function prunes(pattern: string, dir: string): boolean {
  if (pattern.includes('*')) return false // globs: fuera de alcance de esta guarda
  if (pattern.startsWith('/')) return pattern.slice(1) === dir // anclado a la raíz
  // Sin anclar: matchea CUALQUIER segmento con ese nombre, a cualquier
  // profundidad. Este es exactamente el caso que rompió el build 2.0.0.
  return dir.split('/').includes(pattern)
}

/** Rutas de archivos que los config plugins copian al proyecto nativo. Se leen
 *  del propio plugin (no se duplican acá) para que agregar una fuente nueva
 *  quede cubierta sola. */
function pluginSourceFiles(): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const plugin = require(resolve(root, 'plugins/with-apple-pay-intent.cjs')) as {
    SOURCES?: Array<{ dir: string[]; file: string }>
  }
  return (plugin.SOURCES ?? []).map((s) => [...s.dir, s.file].join('/'))
}

/**
 * REGRESIÓN (build 2.0.0, 2026-08-17): el build de EAS moría con ENOENT en la
 * fase Prebuild mientras `npx expo prebuild` local pasaba perfecto.
 *
 * Causa: `.gitignore` traía `ios` SIN anclar, que matchea cualquier carpeta con
 * ese nombre a cualquier profundidad — incluida la del módulo Expo local
 * `modules/apple-pay-capture`. Estaba "resuelto" con una negación que git SÍ
 * respeta (los archivos figuran trackeados y `check-ignore` los da por no
 * ignorados), pero que el empaquetador de EAS NO: al armar el tarball podaba el
 * directorio padre y los .swift nunca llegaban al sandbox del build.
 *
 * La lección: que un archivo esté TRACKEADO no garantiza que llegue al build.
 * Lo que hay que garantizar es que NINGÚN ancestro esté excluido, porque las
 * implementaciones de ignore que podan directorios nunca descienden a
 * re-incluirlo.
 */
/**
 * REGRESIÓN (build 2.0.0 #16, 2026-08-17): App Store Connect rechazó el binario
 * DESPUÉS de subirlo, por mail, con
 *   `ITMS-90626: Invalid Siri Support — App Intent description
 *    'Guarda un pago de Apple Pay…' cannot contain 'apple'`
 *
 * La validación corre en los servidores de Apple, así que ni el build, ni la
 * firma, ni el submit la cazan: el ciclo completo (~20 min) se pierde y hay que
 * quemar un buildNumber. Este test la adelanta a los tests unitarios.
 */
describe('los metadatos del App Intent no usan palabras que Apple prohíbe', () => {
  const swift = read('plugins/apple-pay-intent/ManifiestoLogExpenseIntent.swift')

  /**
   * TODOS los strings literales del archivo, descartando comentarios (ahí SÍ
   * se puede —y conviene— nombrar la regla).
   *
   * A propósito NO se filtra por la línea que dice `description`/`title`: el
   * literal suele vivir en la línea SIGUIENTE a `IntentDescription(`, y una
   * primera versión de este test que miraba línea por línea pasaba en verde
   * con el string que Apple ya había rechazado. Este archivo solo contiene
   * metadatos del intent, así que revisarlos todos es lo correcto.
   */
  const userFacingStrings = swift
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .flatMap((l) => [...l.matchAll(/"([^"]*)"/g)].map((m) => m[1]))
    .filter((s) => s.trim() !== '')

  it('encuentra los strings user-facing del intent', () => {
    expect(userFacingStrings.length).toBeGreaterThan(0)
  })

  // 'apple' es la que nos rechazó; las otras dos son marcas de Apple que la
  // misma validación rechaza en metadatos de App Intents.
  for (const forbidden of ['apple', 'siri', 'iphone']) {
    it(`ninguno contiene "${forbidden}"`, () => {
      const offenders = userFacingStrings.filter((s) =>
        s.toLowerCase().includes(forbidden),
      )
      expect(offenders).toEqual([])
    })
  }
})

describe('los archivos que copian los config plugins llegan al build de EAS', () => {
  const files = pluginSourceFiles()

  it('el plugin declara sus fuentes de forma parseable', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    it(`${file} existe y está trackeado`, () => {
      expect(existsSync(resolve(root, file))).toBe(true)
      const tracked = execFileSync('git', ['ls-files', '--', file], {
        cwd: root,
        encoding: 'utf8',
      }).trim()
      expect(tracked).not.toBe('')
    })

    it(`${file} no tiene NINGÚN ancestro podado por un patrón de .gitignore`, () => {
      // Se recorre hacia arriba: basta con que un padre esté excluido para que
      // un empaquetador que poda directorios nunca vea el archivo, por más que
      // una negación posterior lo "re-incluya" (git la respeta, EAS no).
      const patterns = rawExcludePatterns()
      const pruned: string[] = []
      let dir = dirname(file)
      while (dir && dir !== '.' && dir !== '/') {
        for (const p of patterns) {
          if (prunes(p, dir)) pruned.push(`${dir} ← patrón "${p}"`)
        }
        dir = dirname(dir)
      }
      expect(pruned).toEqual([])
    })
  }
})
