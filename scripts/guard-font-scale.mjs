#!/usr/bin/env node
/**
 * Falla CI cuando algo del árbol se sale del sistema de escala de texto
 * propio de la app (docs/sistemas/font-scale.md).
 *
 * Por qué existe: el tamaño del texto lo gobierna la preferencia in-app
 * (Ajustes → Tamaño del texto), nunca el `fontScale` del OS. Todo el texto
 * pasa por el wrapper `mobile/components/ui/app-text.tsx`, que apaga
 * `allowFontScaling` y multiplica las métricas del style. La guardia de
 * ESLint (`@typescript-eslint/no-restricted-imports`) solo ve imports de
 * `'react-native'`: hay dos regresiones que se le escapan enteras y que
 * rompen el sistema en silencio. Este guard las ataja.
 *
 * Qué se chequea:
 *   1. `Animated.Text` / `Animated.TextInput` CRUDOS. Vienen de
 *      `react-native-reanimated`, así que ningún lint los toca. Un
 *      `<Animated.Text>` crudo conserva el default `allowFontScaling={true}`
 *      → en iOS ese texto sigue escalando con Dynamic Type (hasta 3.571×) e
 *      ignora la preferencia in-app. Usar `AnimatedText` de
 *      `@/components/ui/app-text`.
 *   2. El CONTRATO del wrapper: sus tres exports (`Text`, `AnimatedText`,
 *      `TextInput`) tienen que sacar `allowFontScaling` de las props por
 *      destructuring —para que no se filtre por el spread— y mandarle
 *      `allowFontScaling={false}` al componente nativo. Si alguien lo saca,
 *      TODO el sistema se cae en silencio y no hay test que lo cace: vitest
 *      corre en `env node`, sin renderer.
 *   3. Imports crudos de `Text`/`TextInput` de `'react-native'`. Redundante
 *      con ESLint app-wide, PERO el bloque transitorio de `eslint.config.js`
 *      los tiene en `warn` para una lista cerrada de archivos: para esos, el
 *      guard es la única señal dura de que no crezcan.
 *      Los `import type` siguen permitidos (tipar refs es legítimo).
 *
 * Allowlist: prefijar la línea (o la de arriba) con
 *   // @font-scale-allow: <razón>
 * Para los imports crudos vale también el `eslint-disable-next-line
 * @typescript-eslint/no-restricted-imports` que ya se usa en el repo, así no
 * hay que escribir dos comentarios para la misma excepción (la rama fluida de
 * `count-up-text.tsx`, que necesita el nativo crudo para
 * `createAnimatedComponent` y escala a mano con `useFontScaleFactor`).
 *
 * Excluidos:
 *   - mobile/components/ui/app-text.tsx (es el wrapper: envuelve los crudos)
 *   - *.test.ts(x) y *.spec.ts(x)
 *   - node_modules / dist
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.cwd())
const scanRoots = ['mobile', 'app'].map((d) => join(root, d))
const WRAPPER_FILE = join(root, 'mobile/components/ui/app-text.tsx')
const WRAPPER_REL = 'mobile/components/ui/app-text.tsx'

// ---------------------------------------------------------------------------
// TRANSITORIO — cola de la barrida de app-text que todavía no aterrizó.
//
// Mismo criterio y mismos paths que el bloque transitorio de
// `eslint.config.js` (el que baja `no-restricted-imports` a `warn`): la
// barrida migró todo el árbol, pero estos archivos caían encima de un cuerpo
// de trabajo ajeno en curso (Wrapped, ciclo extendido, fijos) —unos
// modificados, otros directamente borrados por ese trabajo—, así que su swap
// no se podía commitear sin llevárselo puesto. Viaja dentro de ese commit.
//
// Mientras tanto, en un checkout limpio del branch estos archivos siguen
// como estaban, y un guard que deja CI en rojo por trabajo en vuelo se
// termina desactivando. Se reportan como transitorios (no bloquean); todo el
// RESTO del árbol y cualquier archivo nuevo bloquean.
//
// Cómo se cierra: cuando el trabajo ajeno aterrice, borrar las dos listas de
// acá abajo y el bloque gemelo de `eslint.config.js`, y verificar que
// `npm run guard:font-scale` y `npm run lint` queden limpios.
// No agregar archivos nuevos: son listas CERRADAS, no allowlists.
// Ver docs/superpowers/plans/2026-08-14-font-scale-app.md.
// ---------------------------------------------------------------------------

/**
 * Imports crudos de Text/TextInput — espejo EXACTO (mismo criterio, mismos
 * paths) del bloque transitorio de eslint.config.js. Si una lista cambia,
 * cambia la otra: son las mismas 26 entradas.
 */
const TRANSITIONAL_RAW_IMPORTS = new Set([
  'mobile/components/billing/free-period-nudge.tsx',
  'mobile/components/home/animated/count-up-text.tsx',
  'mobile/components/home/home-dashboard.tsx',
  'mobile/components/redesign/control/control-primitives.tsx',
  'mobile/components/redesign/control/parts/control-header.tsx',
  'mobile/components/redesign/fijos/fijos-screen.tsx',
  'mobile/components/redesign/gastos/gastos-screen.tsx',
  'mobile/components/redesign/home/home-screen.tsx',
  'mobile/components/redesign/jardin/cierre-screen.tsx',
  'mobile/components/redesign/jardin/jardin-screen.tsx',
  'mobile/components/redesign/jardin/logros-screen.tsx',
  'mobile/components/ui/swipe-row.tsx',
  'mobile/components/wrapped/cycle-wrapped-modal.tsx',
  // Está en las DOS listas a propósito: en HEAD importa `Text` crudo (línea 2,
  // eso lo ve ESLint) y además monta un `Animated.Text` (eso no lo ve nadie
  // más que este guard).
  'mobile/components/wrapped/scenes/closing-scene.tsx',
  'mobile/components/wrapped/scenes/cover-scene.tsx',
  'mobile/components/wrapped/scenes/cycle-wrapped-cta.tsx',
  'mobile/components/wrapped/scenes/leftover-option-card.tsx',
  'mobile/components/wrapped/scenes/top-category-scene.tsx',
  'mobile/components/wrapped/scenes/top-expense-scene.tsx',
  'mobile/components/wrapped/scenes/verdict-scene.tsx',
  'mobile/screens/dev/cycle-wrapped-preview-screen.tsx',
  'mobile/screens/dev/redesign/redesign-home-preview-screen.tsx',
  'mobile/screens/home/neo/neo-fijos-screen.tsx',
  'mobile/screens/home/neo/neo-gastos-screen.tsx',
  'mobile/screens/settings/delete-account-screen.tsx',
  'mobile/screens/settings/editions-screen.tsx',
])

/**
 * `Animated.Text` crudo — los tres sitios que en un checkout limpio del
 * branch todavía no pasaron al wrapper (§5 de docs/sistemas/font-scale.md).
 * ESLint no los ve, así que no tienen bloque gemelo en eslint.config.js.
 */
const TRANSITIONAL_ANIMATED_TEXT = new Set([
  'mobile/components/home/animated/count-up-text.tsx',
  'mobile/components/redesign/gastos/gastos-screen.tsx',
  'mobile/components/wrapped/scenes/closing-scene.tsx',
])

const ALLOW_COMMENT = /\/\/\s*@font-scale-allow/
const ESLINT_DISABLE_IMPORTS = /eslint-disable(-next-line)?[^\n]*no-restricted-imports/

const violations = []

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reemplaza por espacios el contenido de los comentarios —y, con
 * `blankStrings`, también el de los strings de comilla simple/doble—
 * preservando longitud y saltos de línea: los offsets y los números de línea
 * no se mueven.
 *
 * Dos variantes porque los dos chequeos necesitan cosas distintas:
 *   - `Animated.Text` se busca con los strings blanqueados, para no cazar la
 *     mención dentro del texto de un mensaje o de un test fixture.
 *   - los imports se buscan con los strings intactos (el especificador
 *     `'react-native'` ES un string); ahí el falso positivo se evita anclando
 *     el `import` a la columna 0.
 *
 * Los template literals nunca se blanquean: adentro puede haber `${}` con
 * código real y blanquearlos escondería un hallazgo de verdad.
 */
function blank(content, blankStrings) {
  const out = content.split('')
  let i = 0
  let inString = null
  while (i < content.length) {
    const c = content[i]
    const next = content[i + 1]
    if (inString) {
      const erase = blankStrings && inString !== '`'
      if (c === '\\') {
        if (erase) {
          out[i] = ' '
          if (content[i + 1] !== '\n') out[i + 1] = ' '
        }
        i += 2
        continue
      }
      if (c === inString) {
        inString = null
        i += 1
        continue
      }
      if (erase && c !== '\n') out[i] = ' '
      i += 1
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = c
      i += 1
      continue
    }
    if (c === '/' && next === '/') {
      while (i < content.length && content[i] !== '\n') {
        out[i] = ' '
        i += 1
      }
      continue
    }
    if (c === '/' && next === '*') {
      out[i] = ' '
      out[i + 1] = ' '
      i += 2
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) {
        if (content[i] !== '\n') out[i] = ' '
        i += 1
      }
      if (i < content.length) {
        out[i] = ' '
        out[i + 1] = ' '
        i += 2
      }
      continue
    }
    i += 1
  }
  return out.join('')
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length
}

/** Allow si la línea del hallazgo —o la de arriba— trae el comentario. */
function isAllowedAt(rawLines, line, pattern) {
  const idx = line - 1
  if (rawLines[idx] && pattern.test(rawLines[idx])) return true
  if (idx > 0 && rawLines[idx - 1] && pattern.test(rawLines[idx - 1])) return true
  return false
}

function isExcluded(path) {
  if (path === WRAPPER_FILE) return true
  if (/\.(test|spec)\.tsx?$/.test(path)) return true
  if (path.includes('/node_modules/')) return true
  if (path.includes('/dist/')) return true
  return false
}

// ---------------------------------------------------------------------------
// 1. `Animated.Text` / `Animated.TextInput` crudos
// ---------------------------------------------------------------------------

/**
 * Nombre local del default import de react-native-reanimated (casi siempre
 * `Animated`, pero puede venir aliaseado). Se chequea ese y `Animated` a
 * secas, que es el nombre por convención en todo el repo.
 */
function reanimatedLocalNames(code) {
  const names = new Set(['Animated'])
  const re = /import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s*['"]react-native-reanimated['"]/g
  let m
  while ((m = re.exec(code)) !== null) names.add(m[1])
  return [...names]
}

function scanAnimatedText(rel, code, rawLines) {
  for (const local of reanimatedLocalNames(code)) {
    const re = new RegExp(`\\b${local}\\.(Text|TextInput)\\b`, 'g')
    let m
    while ((m = re.exec(code)) !== null) {
      // El tag de cierre (`</Animated.Text>`) es el mismo hallazgo que su
      // apertura: se reporta una sola vez, en la línea del `<`.
      if (code.slice(m.index - 2, m.index) === '</') continue
      const line = lineOf(code, m.index)
      if (isAllowedAt(rawLines, line, ALLOW_COMMENT)) continue
      violations.push({
        file: rel,
        line,
        kind: 'animated-text-crudo',
        detail: `${local}.${m[1]}`,
        transitional: TRANSITIONAL_ANIMATED_TEXT.has(rel),
        hint: 'Usá `AnimatedText` de @/components/ui/app-text: apaga el allowFontScaling nativo y aplica la escala in-app. Un Animated.Text crudo sigue escalando con Dynamic Type en iOS e ignora la preferencia.',
      })
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Imports crudos de Text/TextInput desde 'react-native'
// ---------------------------------------------------------------------------

function scanRawImports(rel, code, rawLines) {
  // Anclado a la columna 0: los imports reales son statements top-level, y el
  // ancla es lo que evita cazar la mención del import dentro de un string.
  const re = /^import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]react-native['"]/gm
  let m
  while ((m = re.exec(code)) !== null) {
    if (m[1]) continue // `import type { Text }` — legítimo (tipar refs).
    const bodyStart = m.index + m[0].indexOf('{') + 1
    const body = m[2]
    // Cursor propio en vez de `body.indexOf(spec)`: en un import multilínea
    // `{ TextInput, Text }`, buscar "Text" cazaría el de "TextInput" y
    // reportaría la línea equivocada.
    let cursor = 0
    for (const rawSpec of body.split(',')) {
      const chunkStart = cursor
      cursor += rawSpec.length + 1 // +1 por la coma que consumió el split.
      const spec = rawSpec.trim()
      if (!spec) continue
      if (/^type\s/.test(spec)) continue // `{ type TextStyle }` — inline type.
      const name = spec.split(/\s+as\s+/)[0].trim()
      if (name !== 'Text' && name !== 'TextInput') continue
      const offset = bodyStart + chunkStart + rawSpec.indexOf(spec)
      const line = lineOf(code, offset)
      if (isAllowedAt(rawLines, line, ALLOW_COMMENT)) continue
      if (isAllowedAt(rawLines, line, ESLINT_DISABLE_IMPORTS)) continue
      violations.push({
        file: rel,
        line,
        kind: 'import-crudo',
        detail: name,
        transitional: TRANSITIONAL_RAW_IMPORTS.has(rel),
        hint: `Usá ${name} de @/components/ui/app-text: escala con la preferencia de la app y apaga el fontScale del OS. Excepción única: createAnimatedComponent necesita el nativo crudo (eslint-disable con justificación + escala manual vía useFontScaleFactor).`,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Contrato del wrapper
// ---------------------------------------------------------------------------

const WRAPPER_EXPORTS = ['Text', 'AnimatedText', 'TextInput']

function checkWrapperContract() {
  let content
  try {
    content = readFileSync(WRAPPER_FILE, 'utf8')
  } catch {
    violations.push({
      file: WRAPPER_REL,
      line: 1,
      kind: 'wrapper-ausente',
      detail: 'no existe',
      transitional: false,
      hint: 'El wrapper es la pieza central del sistema de escala. Si se movió, actualizar este guard, eslint.config.js y docs/sistemas/font-scale.md.',
    })
    return
  }
  const code = blank(content, true)

  // Corte por export: el cuerpo de cada uno va hasta el próximo `export const`.
  const starts = []
  const re = /export\s+const\s+(\w+)/g
  let m
  while ((m = re.exec(code)) !== null) starts.push({ name: m[1], index: m.index })

  for (const name of WRAPPER_EXPORTS) {
    const at = starts.findIndex((s) => s.name === name)
    if (at === -1) {
      violations.push({
        file: WRAPPER_REL,
        line: 1,
        kind: 'wrapper-export-faltante',
        detail: `export const ${name}`,
        transitional: false,
        hint: `El wrapper tiene que exportar ${WRAPPER_EXPORTS.join(', ')}. Sin ese export, los consumidores caen al primitivo crudo y el texto vuelve a escalar con el OS.`,
      })
      continue
    }
    const from = starts[at].index
    const to = at + 1 < starts.length ? starts[at + 1].index : code.length
    const body = code.slice(from, to)
    const line = lineOf(code, from)

    if (!/const\s*\{[^}]*\ballowFontScaling\b/.test(body)) {
      violations.push({
        file: WRAPPER_REL,
        line,
        kind: 'wrapper-sin-destructuring',
        detail: `export const ${name}`,
        transitional: false,
        hint: 'Sacá `allowFontScaling` de las props por destructuring. Si viaja en el `...rest`, el valor del consumidor pisa el `allowFontScaling={false}` del wrapper y el texto vuelve a escalar con el OS.',
      })
    }
    if (!/allowFontScaling=\{false\}/.test(body)) {
      violations.push({
        file: WRAPPER_REL,
        line,
        kind: 'wrapper-sin-kill',
        detail: `export const ${name}`,
        transitional: false,
        hint: 'El componente nativo tiene que recibir `allowFontScaling={false}`: ES el desacople del fontScale del OS, en las dos plataformas. Sin eso todo el sistema se cae en silencio (no hay test que lo cace: vitest corre en env node, sin renderer).',
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Recorrido
// ---------------------------------------------------------------------------

function scanFile(path) {
  const content = readFileSync(path, 'utf8')
  const rel = relative(root, path)
  const rawLines = content.split('\n')
  scanAnimatedText(rel, blank(content, true), rawLines)
  scanRawImports(rel, blank(content, false), rawLines)
}

function walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    if (entry === 'node_modules' || entry === 'dist') continue
    const path = join(dir, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) {
      walk(path)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    if (entry.endsWith('.d.ts')) continue
    if (isExcluded(path)) continue
    scanFile(path)
  }
}

for (const dir of scanRoots) {
  walk(dir)
}
checkWrapperContract()

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

const blocking = violations.filter((v) => !v.transitional)
const transitional = violations.filter((v) => v.transitional)
const listedFiles = new Set([...TRANSITIONAL_RAW_IMPORTS, ...TRANSITIONAL_ANIMATED_TEXT])

if (blocking.length === 0) {
  if (transitional.length === 0) {
    console.log('font-scale guard: 0 violations.')
    if (listedFiles.size > 0) {
      console.log(
        `font-scale guard: las listas transitorias (${listedFiles.size} archivos) ya no cazan nada — si el trabajo ajeno aterrizó, borrarlas junto con el bloque gemelo de eslint.config.js.`,
      )
    }
  } else {
    console.log(
      `font-scale guard: 0 new violations. ${transitional.length} transitional violation(s) en la lista cerrada de la barrida de app-text (no bloquean).`,
    )
  }
  process.exit(0)
}

console.error(
  `font-scale guard: ${blocking.length} blocking violation(s) (${transitional.length} transitorias en la lista cerrada).\n`,
)
for (const v of blocking) {
  console.error(`  ${v.file}:${v.line}  [${v.kind}]  ${v.detail}`)
  console.error(`    ${v.hint}`)
  if (v.kind === 'animated-text-crudo' || v.kind === 'import-crudo') {
    console.error(
      `    Para permitir este caso puntual, agregá  // @font-scale-allow: <razón>  en el callsite.`,
    )
  }
  console.error('')
}
console.error('Sistema: docs/sistemas/font-scale.md\n')
process.exit(1)
