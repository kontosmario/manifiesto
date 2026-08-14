import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import {
  FONT_SCALE_FACTORS,
  isFontScalePreference,
  type FontScalePreference,
} from '@/lib/font-scale'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'

// SIN dos puntos a propósito: expo-secure-store solo acepta claves que
// matcheen /^[\w.-]+$/ y tira `Invalid key provided to SecureStore` con
// cualquier otra — excepción que `persistent-kv` se traga en silencio, así
// que la preferencia nunca llegaría a persistir entre lanzamientos.
const FONT_SCALE_PREFERENCE_KEY = 'manifiesto.font-scale-preference'

interface FontScaleContextValue {
  /** Lo que el usuario eligió en Settings. Default 'md' (= diseño actual). */
  preference: FontScalePreference
  /** Factor resuelto (0.9 · 1 · 1.1 · 1.2). */
  factor: number
  setPreference: (value: FontScalePreference) => void
}

const FontScaleContext = createContext<FontScaleContextValue | null>(null)

/*
 * Por qué acá NO hay kill de Dynamic Type en iOS
 * ----------------------------------------------
 * `AccessibilityManager.setAccessibilityContentSizeMultipliers({...: 1})`
 * NO desactiva el escalado del texto en esta app: tenemos la Nueva
 * Arquitectura prendida (app.config.ts → `newArchEnabled: true`) y bajo
 * Fabric el multiplicador sale de `RCTFontSizeMultiplier()`
 * (React/Base/RCTUtils.mm), una tabla estática sobre
 * `preferredContentSizeCategory` que jamás consulta a
 * RCTAccessibilityManager — en RN 0.81.5 no queda una sola referencia al
 * módulo en React/Fabric ni en ReactCommon. Los únicos lectores de esos
 * multipliers son ViewManagers de la arquitectura vieja y RCTDeviceInfo,
 * así que la llamada solo lograba que `PixelRatio.getFontScale()` y
 * `Dimensions.get('window').fontScale` devolvieran 1 mientras el texto se
 * seguía dibujando a la escala del OS: un valor mentiroso, sin ganancia.
 *
 * El desacople real del texto propio lo hace el wrapper
 * `@/components/ui/app-text` (allowFontScaling={false} + escala in-app).
 * La contraparte iOS del config plugin de Android (fontScale = 1f) tiene
 * que ser un override nativo de la categoría de contenido; queda fuera de
 * este provider. Ver §6 del spec 2026-08-14-font-scale-app-design.md.
 */

/**
 * Escala de texto propia de la app — espejo de `language-provider`.
 * El tamaño del texto responde SOLO a esta preferencia, nunca al
 * fontScale del OS. Ver spec 2026-08-14-font-scale-app-design.md.
 */
export function FontScaleProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<FontScalePreference>('md')

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
