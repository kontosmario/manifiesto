import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  {
    ignores: ['node_modules', '.expo', 'dist', 'ios', 'android', 'legacy-web-src'],
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
  },
])
