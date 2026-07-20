import { useCallback, useContext, useSyncExternalStore } from 'react'
import { Platform } from 'react-native'
import { NavigationContext } from '@react-navigation/native'

/** Tipo del módulo Skia cuando está disponible (lo que devuelve
 *  getOptionalSkiaModule cuando no es null). Compartido por los
 *  componentes que consumen el módulo opcional. */
export type SkiaModule = typeof import('@shopify/react-native-skia')

let cachedSkiaModule: SkiaModule | null | undefined
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

/**
 * Foco de navegación "opcional" para gatear loops decorativos de Skia
 * (brot-mascot / brot-particles): las pantallas de un stack de expo-router
 * quedan MONTADAS al ser tapadas, así que sin este gate los frame callbacks
 * seguirían grabando SkPictures a 60fps en pantallas invisibles.
 *
 * Equivale a `useIsFocused()` de @react-navigation, pero NO explota si el
 * componente se renderiza fuera de un navigator (previews, tests): lee el
 * NavigationContext de forma opcional y sin contexto asume "enfocado".
 */
export function useOptionalIsFocused(): boolean {
  const navigation = useContext(NavigationContext)

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (navigation === undefined) {
        return () => {}
      }
      const unsubscribeFocus = navigation.addListener('focus', onStoreChange)
      const unsubscribeBlur = navigation.addListener('blur', onStoreChange)
      return () => {
        unsubscribeFocus()
        unsubscribeBlur()
      }
    },
    [navigation],
  )

  const getIsFocused = useCallback(
    () => (navigation === undefined ? true : navigation.isFocused()),
    [navigation],
  )

  return useSyncExternalStore(subscribe, getIsFocused, getIsFocused)
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

    if (__DEV__ && !hasLoggedSkiaFallback) {
      hasLoggedSkiaFallback = true
      void formatSkiaError(error)
    }

    return cachedSkiaModule
  }
}
