import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  {
    ignores: ['node_modules', '.expo', 'dist', 'ios', 'android'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ['app/**/*.{ts,tsx}', 'mobile/**/*.{ts,tsx}', 'app.config.ts'],
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
    },
  },
])
