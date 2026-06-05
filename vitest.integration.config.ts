import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Vitest config dedicado para tests de integración (E2E headless).
 *
 * Diferencias clave vs `vitest.config.ts`:
 *   - Sólo corre `tests/integration/**`.
 *   - Carga `.env.supabase` antes de la suite (setup file).
 *   - Timeouts más altos (real network).
 *   - Pool=forks + concurrency=1 para evitar contención del
 *     `auth.admin.createUser` (rate-limited) y choques de fixtures.
 *
 * Comando: `npm run test:integration`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'mobile'),
      'react-native-reanimated': resolve(__dirname, 'tests/stubs/react-native-reanimated.ts'),
      'react-native': resolve(__dirname, 'tests/stubs/react-native.ts'),
      'expo-secure-store': resolve(__dirname, 'tests/stubs/expo-secure-store.ts'),
      '@react-navigation/native': resolve(__dirname, 'tests/stubs/react-navigation-native.ts'),
      'expo-modules-core': resolve(__dirname, 'tests/stubs/expo-modules-core.ts'),
    },
  },
  define: {
    __DEV__: true,
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/integration/_setup.ts'],
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
