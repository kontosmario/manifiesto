import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

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
    ],
    include: ['tests/**/*.test.ts'],
  },
})
