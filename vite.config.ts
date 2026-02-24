import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function getNodeModulePackageName(moduleId: string): string | null {
  const normalizedId = moduleId.replace(/\\/g, '/')
  const marker = '/node_modules/'
  const markerIndex = normalizedId.lastIndexOf(marker)
  if (markerIndex < 0) {
    return null
  }

  const moduleSubpath = normalizedId.slice(markerIndex + marker.length)
  const segments = moduleSubpath.split('/')
  if (segments.length === 0) {
    return null
  }

  if (segments[0].startsWith('@') && segments.length >= 2) {
    return `${segments[0]}/${segments[1]}`
  }

  return segments[0]
}

function getVendorChunkName(moduleId: string): string | undefined {
  const packageName = getNodeModulePackageName(moduleId)
  if (!packageName) {
    return undefined
  }

  if (packageName === '@ionic/core' || packageName === '@stencil/core') {
    const normalizedId = moduleId.replace(/\\/g, '/')

    if (normalizedId.includes('/@ionic/core/components/')) {
      return 'vendor-ionic-components'
    }

    if (normalizedId.includes('/@ionic/core/dist/')) {
      return 'vendor-ionic-dist'
    }

    return 'vendor-ionic-core'
  }

  if (
    packageName === '@ionic/react' ||
    packageName === '@ionic/react-router' ||
    packageName === 'ionicons'
  ) {
    return 'vendor-ionic-react'
  }

  if (
    packageName === 'react' ||
    packageName === 'react-dom' ||
    packageName === 'react-router' ||
    packageName === 'react-router-dom' ||
    packageName === 'scheduler'
  ) {
    return 'vendor-react'
  }

  if (packageName.startsWith('@supabase/')) {
    return 'vendor-supabase'
  }

  if (packageName.startsWith('@tanstack/')) {
    return 'vendor-tanstack'
  }

  return undefined
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    base: env.VITE_BASE_PATH || '/',
    build: {
      rollupOptions: {
        output: {
          manualChunks(moduleId) {
            return getVendorChunkName(moduleId)
          },
        },
      },
    },
  }
})
