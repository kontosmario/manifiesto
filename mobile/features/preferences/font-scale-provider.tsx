import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { NativeModules, Platform } from 'react-native'
import {
  FONT_SCALE_FACTORS,
  isFontScalePreference,
  type FontScalePreference,
} from '@/lib/font-scale'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'

const FONT_SCALE_PREFERENCE_KEY = 'manifiesto:font-scale-preference'

interface FontScaleContextValue {
  /** Lo que el usuario eligió en Settings. Default 'md' (= diseño actual). */
  preference: FontScalePreference
  /** Factor resuelto (0.9 · 1 · 1.1 · 1.2). */
  factor: number
  setPreference: (value: FontScalePreference) => void
}

const FontScaleContext = createContext<FontScaleContextValue | null>(null)

/**
 * iOS: pisa el multiplicador de Dynamic Type mapeando TODAS las
 * categorías del OS a 1.0. Cubre el texto que rendericen libs de
 * terceros fuera del wrapper de app-text (el texto propio ya viaja con
 * allowFontScaling=false). `RCTAccessibilityManager` es un módulo
 * legacy accesible vía interop bridgeless en RN 0.81; si el interop no
 * lo expone, el guard evita el crash y el wrapper sigue cubriendo el
 * 100% del texto propio.
 */
function neutralizeIosDynamicType(): void {
  if (Platform.OS !== 'ios') return
  try {
    NativeModules.AccessibilityManager?.setAccessibilityContentSizeMultipliers?.({
      extraSmall: 1,
      small: 1,
      medium: 1,
      large: 1,
      extraLarge: 1,
      extraExtraLarge: 1,
      extraExtraExtraLarge: 1,
      accessibilityMedium: 1,
      accessibilityLarge: 1,
      accessibilityExtraLarge: 1,
      accessibilityExtraExtraLarge: 1,
      accessibilityExtraExtraExtraLarge: 1,
    })
  } catch {
    // Sin módulo (interop apagado): el wrapper cubre el texto propio.
  }
}

/**
 * Escala de texto propia de la app — espejo de `language-provider`.
 * El tamaño del texto responde SOLO a esta preferencia, nunca al
 * fontScale del OS. Ver spec 2026-08-14-font-scale-app-design.md.
 */
export function FontScaleProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<FontScalePreference>('md')

  useEffect(() => {
    neutralizeIosDynamicType()
  }, [])

  // Hidratar la preferencia guardada (async, settle tras el primer render —
  // mismo trade-off aceptado que tema e idioma).
  useEffect(() => {
    let isMounted = true
    void (async () => {
      const stored = await getPersistentValue(FONT_SCALE_PREFERENCE_KEY)
      if (!isMounted) return
      if (isFontScalePreference(stored)) {
        setPreferenceState(stored)
      }
    })()
    return () => {
      isMounted = false
    }
  }, [])

  const setPreference = useCallback((next: FontScalePreference) => {
    setPreferenceState(next)
    void setPersistentValue(FONT_SCALE_PREFERENCE_KEY, next)
  }, [])

  const value = useMemo<FontScaleContextValue>(
    () => ({ preference, factor: FONT_SCALE_FACTORS[preference], setPreference }),
    [preference, setPreference],
  )

  return <FontScaleContext.Provider value={value}>{children}</FontScaleContext.Provider>
}

export function useFontScale(): FontScaleContextValue {
  const value = useContext(FontScaleContext)
  if (!value) {
    throw new Error('useFontScale must be used within FontScaleProvider.')
  }
  return value
}

/**
 * Solo el factor, SIN throw: el wrapper de Text es el primitivo más
 * caliente de la app y un Text montado fuera del provider (overlay
 * exótico, error boundary raíz) debe renderizar a escala 1, no crashear.
 */
export function useFontScaleFactor(): number {
  return useContext(FontScaleContext)?.factor ?? 1
}
