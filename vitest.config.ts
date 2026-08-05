import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'mobile'),
      'react-native-reanimated': resolve(__dirname, 'tests/stubs/react-native-reanimated.ts'),
      'react-native': resolve(__dirname, 'tests/stubs/react-native.ts'),
      'expo-secure-store': resolve(__dirname, 'tests/stubs/expo-secure-store.ts'),
      'expo-linking': resolve(__dirname, 'tests/stubs/expo-linking.ts'),
      '@react-navigation/native': resolve(__dirname, 'tests/stubs/react-navigation-native.ts'),
      'expo-modules-core': resolve(__dirname, 'tests/stubs/expo-modules-core.ts'),
      'expo-constants': resolve(__dirname, 'tests/stubs/expo-constants.ts'),
      'expo-localization': resolve(__dirname, 'tests/stubs/expo-localization.ts'),
    },
  },
  define: {
    // expo-modules-core / RN runtime check this global. Without it
    // any test file that transitively imports those modules crashes
    // with "ReferenceError: __DEV__ is not defined" before user code
    // runs.
    __DEV__: true,
  },
  test: {
    environment: 'node',
    exclude: [
      'dist/**',
      'ios/**',
      'node_modules/**',
      // Los tests de integración hablan con un Supabase REAL: necesitan
      // credenciales, red, y crean/borran datos. Corriendo acá se colaban en
      // `npm test` y en `npm run validate` — y como el destino sale de
      // `.env.supabase`, escribían en PRODUCCIÓN.
      // Tienen su propio comando y su propia config, apuntando a staging:
      //   npm run test:integration
      // Ver docs/operaciones/ambiente-dev.md
      'tests/integration/**',
    ],
    include: ['tests/**/*.test.ts'],
  },
})
