import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { useColorScheme } from 'react-native'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'
import { buildTheme, type AppTheme, type ThemePreference } from '@/theme/palette'
import { resolveCategoryHue, type CategoryHueVariant } from '@/theme/category-hues'

const THEME_PREFERENCE_KEY = 'manifiesto:theme-preference'

interface ThemeContextValue {
  preference: ThemePreference
  setPreference: (value: ThemePreference) => void
  theme: AppTheme
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useColorScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>('system')

  useEffect(() => {
    let isMounted = true

    void (async () => {
      const storedPreference = await getPersistentValue(THEME_PREFERENCE_KEY)
      if (!isMounted) {
        return
      }

      if (
        storedPreference === 'system' ||
        storedPreference === 'light' ||
        storedPreference === 'dark'
      ) {
        setPreferenceState(storedPreference)
      }
    })()

    return () => {
      isMounted = false
    }
  }, [])

  const resolvedMode =
    preference === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : preference
  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference)
    void setPersistentValue(THEME_PREFERENCE_KEY, nextPreference)
  }, [])

  const value = useMemo<ThemeContextValue>(() => {
    return {
      preference,
      setPreference,
      theme: buildTheme(resolvedMode),
    }
  }, [preference, resolvedMode, setPreference])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useAppTheme() {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error('useAppTheme must be used within AppThemeProvider.')
  }

  return value
}

/**
 * Resolves the per-mode hue variant for a category by slug or id.
 * Known slugs (comida, transporte, casa, salud, ocio, servicios, ropa, otros)
 * return their canonical hue. Any other string hashes deterministically onto
 * one of the canonical hues.
 */
export function useCategoryHue(categoryKeyOrId: string): CategoryHueVariant {
  const { theme } = useAppTheme()
  const hue = resolveCategoryHue(categoryKeyOrId)
  return theme.isDark ? hue.dark : hue.light
}
