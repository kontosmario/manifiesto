import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

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
