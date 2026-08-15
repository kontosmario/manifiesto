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
 *      `@/components/ui/app-text`. Cubre también el acceso por namespace a
 *      react-native (`import * as RN from 'react-native'` + `<RN.Text>`),
 *      que esquiva a ESLint por el mismo motivo que el anterior: la regla
 *      restringe los NOMBRES importados, no el módulo.
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
 * Cómo se parsea: con el AST de `typescript`, no con un tokenizer propio.
 * La versión anterior blanqueaba strings y comentarios a mano y no conocía
 * los literales de expresión regular ni el texto JSX: una `'` adentro de un
 * `/[^\p{L}' -]/u` —o el apóstrofo de un copy— abría un string fantasma y
 * blanqueaba el resto del archivo, dejando el chequeo 1 CIEGO de ahí al EOF
 * (el único chequeo sin red de contención: ESLint no lo ve y no hay test
 * posible). El AST lo resuelve de raíz y encima da alias de import reales.
 * Si `typescript` no resuelve, el guard falla fuerte: nunca pasa en verde
 * por no haber podido mirar.
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

let ts
try {
  ts = (await import('typescript')).default
} catch {
  console.error(
    'font-scale guard: no se pudo resolver `typescript`. El guard parsea con su AST;\n' +
      'sin eso no puede mirar nada y NO va a pasar en verde. Instalá las dependencias.',
  )
  process.exit(1)
}

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
// El número es un TOPE, no un permiso: es la cuenta exacta de hallazgos de
// ese archivo en un checkout limpio de HEAD (mismo patrón que
// `scripts/motion-tokens-baseline.json`). El hallazgo número tope+1 BLOQUEA,
// así que un `Animated.Text` nuevo en una pantalla de la lista falla igual
// que en cualquier otra. Los topes solo bajan.
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
 * cambia la otra: son las mismas 26 entradas. El valor es el tope de
 * hallazgos por archivo en un checkout limpio de HEAD.
 */
const TRANSITIONAL_RAW_IMPORTS = new Map([
  ['mobile/components/billing/free-period-nudge.tsx', 1],
  ['mobile/components/home/animated/count-up-text.tsx', 1],
  ['mobile/components/home/home-dashboard.tsx', 1],
  ['mobile/components/redesign/control/control-primitives.tsx', 1],
  ['mobile/components/redesign/control/parts/control-header.tsx', 1],
  ['mobile/components/redesign/fijos/fijos-screen.tsx', 1],
  ['mobile/components/redesign/gastos/gastos-screen.tsx', 1],
  ['mobile/components/redesign/home/home-screen.tsx', 1],
  ['mobile/components/redesign/jardin/cierre-screen.tsx', 1],
  ['mobile/components/redesign/jardin/jardin-screen.tsx', 1],
  ['mobile/components/redesign/jardin/logros-screen.tsx', 1],
  ['mobile/components/ui/swipe-row.tsx', 1],
  ['mobile/components/wrapped/cycle-wrapped-modal.tsx', 1],
  // Está en las DOS listas a propósito: en HEAD importa `Text` crudo (línea 2,
  // eso lo ve ESLint) y además monta un `Animated.Text` (eso no lo ve nadie
  // más que este guard).
  ['mobile/components/wrapped/scenes/closing-scene.tsx', 1],
  ['mobile/components/wrapped/scenes/cover-scene.tsx', 1],
  ['mobile/components/wrapped/scenes/cycle-wrapped-cta.tsx', 1],
  ['mobile/components/wrapped/scenes/leftover-option-card.tsx', 1],
  ['mobile/components/wrapped/scenes/top-category-scene.tsx', 1],
  ['mobile/components/wrapped/scenes/top-expense-scene.tsx', 1],
  ['mobile/components/wrapped/scenes/verdict-scene.tsx', 1],
  ['mobile/screens/dev/cycle-wrapped-preview-screen.tsx', 1],
  ['mobile/screens/dev/redesign/redesign-home-preview-screen.tsx', 1],
  ['mobile/screens/home/neo/neo-fijos-screen.tsx', 1],
  ['mobile/screens/home/neo/neo-gastos-screen.tsx', 1],
  // Los 26 archivos traen un hallazgo cada uno salvo éste, que importa `Text`
  // y `TextInput` crudos (27 imports en total, los mismos que cuenta §6).
  ['mobile/screens/settings/delete-account-screen.tsx', 2],
  ['mobile/screens/settings/editions-screen.tsx', 1],
])

/**
 * `Animated.Text` crudo — los tres sitios que en un checkout limpio del
 * branch todavía no pasaron al wrapper (§5 de docs/sistemas/font-scale.md).
 * ESLint no los ve, así que no tienen bloque gemelo en eslint.config.js.
 */
const TRANSITIONAL_ANIMATED_TEXT = new Map([
  ['mobile/components/home/animated/count-up-text.tsx', 1],
  ['mobile/components/redesign/gastos/gastos-screen.tsx', 1],
  ['mobile/components/wrapped/scenes/closing-scene.tsx', 1],
])

/** Qué lista transitoria gatea cada tipo de hallazgo (el resto siempre bloquea). */
function baselineFor(kind) {
  if (kind === 'import-crudo') return TRANSITIONAL_RAW_IMPORTS
  if (kind === 'animated-text-crudo') return TRANSITIONAL_ANIMATED_TEXT
  return null
}

const ALLOW_COMMENT = /\/\/\s*@font-scale-allow/
const ESLINT_DISABLE_IMPORTS = /eslint-disable(-next-line)?[^\n]*no-restricted-imports/

const violations = []

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSource(path, content) {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  // setParentNodes: hace falta para distinguir el tag de cierre del de apertura.
  return ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, kind)
}

/** 1-indexed, como los reportes de lint y los números de línea del editor. */
function lineAt(sourceFile, pos) {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1
}

function forEachNode(node, visit) {
  visit(node)
  node.forEachChild((child) => forEachNode(child, visit))
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

/**
 * Nombres locales con los que este archivo alcanza a un módulo por acceso de
 * propiedad: el default import (`import Animated from 'x'`) y el namespace
 * (`import * as Animated from 'x'`). Sale del AST, así que el alias es el
 * real — el regex anterior corría sobre el código con los strings blanqueados
 * y no podía leer NUNCA el especificador del módulo, o sea que era código
 * muerto y solo funcionaba el literal `Animated` que venía sembrado.
 */
function moduleLocalNames(sourceFile, moduleName, seed = []) {
  const names = new Set(seed)
  for (const st of sourceFile.statements) {
    if (!ts.isImportDeclaration(st)) continue
    if (!ts.isStringLiteral(st.moduleSpecifier)) continue
    if (st.moduleSpecifier.text !== moduleName) continue
    const clause = st.importClause
    if (!clause || clause.isTypeOnly) continue
    if (clause.name) names.add(clause.name.text)
    const bindings = clause.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) names.add(bindings.name.text)
  }
  return names
}

// ---------------------------------------------------------------------------
// 1. `Animated.Text` / `Animated.TextInput` crudos (+ namespace de react-native)
// ---------------------------------------------------------------------------

function scanAnimatedText(rel, sourceFile, rawLines) {
  // `Animated` va sembrado: es el nombre por convención en todo el repo y
  // cubre los re-exports internos que no declaran el import acá.
  const reanimated = moduleLocalNames(sourceFile, 'react-native-reanimated', ['Animated'])
  const reactNative = moduleLocalNames(sourceFile, 'react-native')

  forEachNode(sourceFile, (node) => {
    if (!ts.isPropertyAccessExpression(node)) return
    if (!ts.isIdentifier(node.expression)) return
    const member = node.name.text
    if (member !== 'Text' && member !== 'TextInput') return
    const local = node.expression.text
    const fromReanimated = reanimated.has(local)
    const fromReactNative = reactNative.has(local)
    if (!fromReanimated && !fromReactNative) return
    // El tag de cierre (`</Animated.Text>`) es el mismo hallazgo que su
    // apertura: se reporta una sola vez, en la línea del `<`.
    if (node.parent && ts.isJsxClosingElement(node.parent)) return
    const line = lineAt(sourceFile, node.getStart(sourceFile))
    if (isAllowedAt(rawLines, line, ALLOW_COMMENT)) return
    violations.push({
      file: rel,
      line,
      kind: fromReanimated ? 'animated-text-crudo' : 'rn-namespace-crudo',
      detail: `${local}.${member}`,
      hint: fromReanimated
        ? 'Usá `AnimatedText` de @/components/ui/app-text: apaga el allowFontScaling nativo y aplica la escala in-app. Un Animated.Text crudo sigue escalando con Dynamic Type en iOS e ignora la preferencia.'
        : `Usá ${member} de @/components/ui/app-text. Alcanzar el primitivo por el namespace del módulo (${local}.${member}) esquiva a ESLint —la regla restringe los nombres importados, no el módulo— y deja el texto colgado del fontScale del OS.`,
    })
  })
}

// ---------------------------------------------------------------------------
// 2. Imports crudos de Text/TextInput desde 'react-native'
// ---------------------------------------------------------------------------

function scanRawImports(rel, sourceFile, rawLines) {
  for (const st of sourceFile.statements) {
    if (!ts.isImportDeclaration(st)) continue
    if (!ts.isStringLiteral(st.moduleSpecifier)) continue
    if (st.moduleSpecifier.text !== 'react-native') continue
    const clause = st.importClause
    if (!clause) continue
    if (clause.isTypeOnly) continue // `import type { Text }` — legítimo (tipar refs).
    const bindings = clause.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue // `{ type TextStyle }` — inline type.
      const imported = (element.propertyName ?? element.name).text
      if (imported !== 'Text' && imported !== 'TextInput') continue
      const line = lineAt(sourceFile, element.getStart(sourceFile))
      if (isAllowedAt(rawLines, line, ALLOW_COMMENT)) continue
      if (isAllowedAt(rawLines, line, ESLINT_DISABLE_IMPORTS)) continue
      violations.push({
        file: rel,
        line,
        kind: 'import-crudo',
        detail: imported,
        hint: `Usá ${imported} de @/components/ui/app-text: escala con la preferencia de la app y apaga el fontScale del OS. Excepción única: createAnimatedComponent necesita el nativo crudo (eslint-disable con justificación + escala manual vía useFontScaleFactor).`,
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
      hint: 'El wrapper es la pieza central del sistema de escala. Si se movió, actualizar este guard, eslint.config.js y docs/sistemas/font-scale.md.',
    })
    return
  }
  const sourceFile = parseSource(WRAPPER_FILE, content)

  const exported = new Map()
  for (const st of sourceFile.statements) {
    if (!ts.isVariableStatement(st)) continue
    const isExported = st.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
    if (!isExported) continue
    for (const decl of st.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) exported.set(decl.name.text, decl)
    }
  }

  for (const name of WRAPPER_EXPORTS) {
    const decl = exported.get(name)
    if (!decl) {
      violations.push({
        file: WRAPPER_REL,
        line: 1,
        kind: 'wrapper-export-faltante',
        detail: `export const ${name}`,
        hint: `El wrapper tiene que exportar ${WRAPPER_EXPORTS.join(', ')}. Sin ese export, los consumidores caen al primitivo crudo y el texto vuelve a escalar con el OS.`,
      })
      continue
    }
    const line = lineAt(sourceFile, decl.getStart(sourceFile))

    // Sobre el AST: `{ allowFontScaling, ... } = props` (o renombrado) y el
    // `allowFontScaling={false}` literal en el JSX. Nada de regex sobre texto:
    // un string del cuerpo no puede fingir que el contrato está.
    let hasDestructuring = false
    let hasKill = false
    forEachNode(decl, (node) => {
      if (ts.isObjectBindingPattern(node)) {
        for (const element of node.elements) {
          const key = element.propertyName ?? element.name
          if (ts.isIdentifier(key) && key.text === 'allowFontScaling') hasDestructuring = true
        }
        return
      }
      if (!ts.isJsxAttribute(node)) return
      if (!ts.isIdentifier(node.name) || node.name.text !== 'allowFontScaling') return
      const init = node.initializer
      if (!init || !ts.isJsxExpression(init) || !init.expression) return
      if (init.expression.kind === ts.SyntaxKind.FalseKeyword) hasKill = true
    })

    if (!hasDestructuring) {
      violations.push({
        file: WRAPPER_REL,
        line,
        kind: 'wrapper-sin-destructuring',
        detail: `export const ${name}`,
        hint: 'Sacá `allowFontScaling` de las props por destructuring. Si viaja en el `...rest`, el valor del consumidor pisa el `allowFontScaling={false}` del wrapper y el texto vuelve a escalar con el OS.',
      })
    }
    if (!hasKill) {
      violations.push({
        file: WRAPPER_REL,
        line,
        kind: 'wrapper-sin-kill',
        detail: `export const ${name}`,
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
  const sourceFile = parseSource(path, content)
  scanAnimatedText(rel, sourceFile, rawLines)
  scanRawImports(rel, sourceFile, rawLines)
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

// Cuenta por (tipo, archivo) para contrastar contra el tope de la lista.
const currentCounts = new Map()
for (const v of violations) {
  const key = `${v.kind} ${v.file}`
  currentCounts.set(key, (currentCounts.get(key) ?? 0) + 1)
}

const blocking = []
const transitional = []
const regressed = []
for (const v of violations) {
  const baseline = baselineFor(v.kind)
  const cap = baseline?.get(v.file)
  if (cap === undefined) {
    blocking.push(v)
    continue
  }
  const current = currentCounts.get(`${v.kind} ${v.file}`) ?? 0
  if (current > cap) {
    if (!regressed.some((r) => r.file === v.file && r.kind === v.kind)) {
      regressed.push({ file: v.file, kind: v.kind, cap, current })
    }
    blocking.push(v)
    continue
  }
  transitional.push(v)
}

const listedFiles = new Set([...TRANSITIONAL_RAW_IMPORTS.keys(), ...TRANSITIONAL_ANIMATED_TEXT.keys()])

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
      `font-scale guard: 0 new violations. ${transitional.length} transitional violation(s) dentro del tope de la lista cerrada de la barrida de app-text (no bloquean).`,
    )
  }
  process.exit(0)
}

console.error(
  `font-scale guard: ${blocking.length} blocking violation(s) (${transitional.length} transitorias dentro de tope).\n`,
)
for (const r of regressed) {
  console.error(
    `  ${r.file}  [${r.kind}]  el tope de la lista transitoria es ${r.cap} y hay ${r.current}.`,
  )
  console.error(
    `    Los topes son de la barrida vieja y solo BAJAN: migrá el hallazgo nuevo al wrapper. No subas el número.\n`,
  )
}
for (const v of blocking) {
  console.error(`  ${v.file}:${v.line}  [${v.kind}]  ${v.detail}`)
  console.error(`    ${v.hint}`)
  if (v.kind === 'animated-text-crudo' || v.kind === 'import-crudo' || v.kind === 'rn-namespace-crudo') {
    console.error(
      `    Para permitir este caso puntual, agregá  // @font-scale-allow: <razón>  en el callsite.`,
    )
  }
  console.error('')
}
console.error('Sistema: docs/sistemas/font-scale.md\n')
process.exit(1)
