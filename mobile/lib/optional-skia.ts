import { Platform } from 'react-native'

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

  // Skia's web build requires a CanvasKit WASM bundle that Expo web
  // doesn't wire up out of the box. Loading the module triggers
  // runtime errors ("CanvasKit is not defined", "PictureRecorder"), so
  // we skip it entirely on web — every consumer already handles the
  // null return as a "no-skia" signal and renders an alternate view.
  if (Platform.OS === 'web') {
    cachedSkiaModule = null
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
