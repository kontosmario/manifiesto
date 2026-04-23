type SkiaModule = typeof import('@shopify/react-native-skia')

let cachedSkiaModule: SkiaModule | null | undefined
let cachedSkiaError: unknown
let hasLoggedSkiaFallback = false

function formatSkiaError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return 'Unknown error'
}

export function getOptionalSkiaModule() {
  if (cachedSkiaModule !== undefined) {
    return cachedSkiaModule
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedSkiaModule = require('@shopify/react-native-skia') as SkiaModule
    return cachedSkiaModule
  } catch (error) {
    cachedSkiaModule = null
    cachedSkiaError = error

    if (__DEV__ && !hasLoggedSkiaFallback) {
      hasLoggedSkiaFallback = true
      void formatSkiaError(error)
    }

    return cachedSkiaModule
  }
}

export function getOptionalSkiaError() {
  return cachedSkiaError
}
