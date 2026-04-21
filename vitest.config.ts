import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'mobile'),
      'react-native-reanimated': resolve(__dirname, 'tests/stubs/react-native-reanimated.ts'),
    },
  },
  test: {
    environment: 'node',
    exclude: [
      'dist/**',
      'ios/**',
      'legacy-web-src/**',
      'node_modules/**',
    ],
    include: ['tests/**/*.test.ts'],
  },
})
