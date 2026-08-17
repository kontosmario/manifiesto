import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

const FONT_WEIGHT = 'fontWeight'
const FONT_FAMILY = 'fontFamily'
const FONT_HELPER = 'nunitoFamily'

function propertyName(node) {
  if (node.type !== 'Property') return null
  if (node.computed) return null
  if (node.key.type === 'Identifier') return node.key.name
  if (node.key.type === 'Literal') return String(node.key.value)
  return null
}

/**
 * React Native no hereda `fontFamily`: un estilo que declara sólo
 * `fontSize`/`fontWeight` se dibuja con la fuente del sistema (SF Pro en
 * iOS, Roboto en Android) al lado de las filas en Nunito. El bug es
 * invisible en el simulador para quien no conoce las dos tipografías,
 * así que lo ataja el lint.
 *
 * Un objeto con spread queda fuera: la familia puede venir del objeto
 * esparcido y el lint no puede resolverlo.
 */
const requireFontFamilyWithWeight = {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'Exige fontFamily junto a fontWeight para que el texto no caiga a la fuente del sistema',
    },
    schema: [],
    messages: {
      missing:
        'Estilo con fontWeight y sin fontFamily: en React Native cae a la fuente del sistema. Agregá `fontFamily: nunitoFamily(<peso>)` de @/theme/typography.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()
    // El autofix sólo corre donde `nunitoFamily` ya está importado: un
    // fixer que escriba una llamada a un símbolo ausente deja el archivo
    // sin compilar. Sin import, la regla reporta y el fix es manual.
    // Se resuelve sobre los ImportDeclaration, no sobre el texto: una
    // mención en un comentario habilitaría un fix que rompe el archivo.
    let hasHelper = false

    return {
      ImportDeclaration(node) {
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier' && spec.imported?.name === FONT_HELPER) {
            hasHelper = true
          }
        }
      },
      ObjectExpression(node) {
        let weight = null
        let hasFamily = false
        let hasSpread = false
        for (const prop of node.properties) {
          if (prop.type === 'SpreadElement') {
            hasSpread = true
            continue
          }
          const name = propertyName(prop)
          if (name === FONT_WEIGHT) weight = prop
          else if (name === FONT_FAMILY) hasFamily = true
        }
        if (!weight || hasFamily || hasSpread) return
        if (weight.shorthand || weight.kind !== 'init') return

        context.report({
          node: weight,
          messageId: 'missing',
          fix: hasHelper
            ? (fixer) => {
                const call = `fontFamily: nunitoFamily(${sourceCode.getText(weight.value)})`
                const lineStart = sourceCode.getIndexFromLoc({
                  line: weight.loc.start.line,
                  column: 0,
                })
                const before = sourceCode
                  .getText()
                  .slice(lineStart, weight.range[0])
                // `fontWeight` solo en su línea → la familia va en una línea
                // nueva con la misma sangría; si comparte línea, al lado.
                const ownLine = before.trim() === ''
                return fixer.insertTextAfter(
                  weight,
                  ownLine ? `,\n${before}${call}` : `, ${call}`,
                )
              }
            : undefined,
        })
      },
    }
  },
}

const manifiestoPlugin = {
  rules: {
    'require-font-family-with-weight': requireFontFamilyWithWeight,
  },
}

export default defineConfig([
  {
    ignores: ['node_modules', '.expo', 'dist', 'ios', 'android'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ['app/**/*.{ts,tsx}', 'mobile/**/*.{ts,tsx}', 'app.config.ts'],
    plugins: { manifiesto: manifiestoPlugin },
    languageOptions: {
      ecmaVersion: 2023,
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      // The React Compiler rules that ship with eslint-plugin-react-hooks
      // are too strict for our React-Native + Reanimated patterns:
      //
      //   ▸ `react-hooks/immutability` flags `sharedValue.value = X`,
      //     which is the canonical Reanimated v4 update pattern.
      //   ▸ `react-hooks/refs` flags ref reads/writes during pressable
      //     callbacks that aren't actually inside render.
      //   ▸ `react-hooks/purity` flags `Date.now()` / `Math.random()`
      //     used inside callbacks, useEffect bodies, and worklets where
      //     impurity is intentional.
      //   ▸ `react-hooks/component-hook-factories` flags Animated/SVG
      //     factories like `Animated.createAnimatedComponent`, which are
      //     module-level and not a real "component-during-render" bug.
      //
      // These produce a high false-positive rate; we trust typecheck +
      // RN-specific patterns over the React Compiler heuristics here.
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/component-hook-factories': 'off',
      // Permitir vars prefijadas con _ (convención de "unused on purpose")
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      // El compiler no puede preservar memoización cuando las deps son
      // específicas por propiedad (e.g. finance?.cycle_type). Es un pattern
      // intencional para evitar re-renders cuando otras props del objeto cambian.
      // Lo bajamos a warning para no bloquear CI.
      'react-hooks/preserve-manual-memoization': 'warn',
      'manifiesto/require-font-family-with-weight': 'error',
      // El tamaño del texto lo gobierna la preferencia de la app, nunca el
      // fontScale del OS: todo el texto tiene que pasar por el wrapper de
      // `@/components/ui/app-text`, que apaga `allowFontScaling` y aplica
      // la escala in-app.
      // Ver docs/superpowers/specs/2026-08-14-font-scale-app-design.md.
      // Los `import type` siguen permitidos: el tipo de instancia
      // (`useRef<TextInput>`) es el del componente nativo, que es el que el
      // wrapper forwardea.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text', 'TextInput'],
              allowTypeImports: true,
              message:
                'Usá Text/TextInput de @/components/ui/app-text: escalan con la preferencia de la app y apagan el fontScale del OS. Excepción única: createAnimatedComponent necesita el nativo crudo (eslint-disable con justificación + escala manual vía useFontScaleFactor).',
            },
            // Import-trap catalogado (root cause del jank Android gama baja):
            // el useReducedMotion de reanimated suscribe un listener de
            // accesibilidad POR CALL SITE. El hook propio lee el contexto de
            // ReducedMotionProvider (un único listener + heurístico de
            // hardware + preferencia del usuario). La barrida 2026-08-16
            // dejó el árbol en cero; esta regla evita que vuelva.
            {
              name: 'react-native-reanimated',
              importNames: ['useReducedMotion'],
              message:
                'Usá useReducedMotion de @/hooks/use-reduced-motion: el de reanimated registra un listener de accesibilidad por call site (jank en Android gama baja) y no conoce el toggle in-app.',
            },
          ],
        },
      ],
    },
  },
  {
    // El wrapper es el único lugar que puede importar los primitivos crudos:
    // es justamente el que los envuelve.
    files: ['mobile/components/ui/app-text.tsx'],
    rules: { '@typescript-eslint/no-restricted-imports': 'off' },
  },
])
