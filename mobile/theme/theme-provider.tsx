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
import {
  resolveCategoryHue,
  resolveCategoryHueByName,
  type CategoryHueVariant,
} from '@/theme/category-hues'

const THEME_PREFERENCE_KEY = 'manifiesto:theme-preference'

interface ThemeModeContextValue {
  preference: ThemePreference
  setPreference: (value: ThemePreference) => void
  resolvedMode: 'light' | 'dark'
}

// Theme split: `ThemeMode` changes when the user toggles
// preference (rare). `ThemeTokens` is a frozen palette derived from
// the mode. Splitting lets hot-path subscribers (row components
// re-rendered hundreds of times) consume only the tokens — flipping
// preference invalidates the mode context, the tokens context
// recomputes once, but components subscribed to `useThemeTokens()`
// only re-render once (not on every parent state change that
// happens to bubble through `useAppTheme()`).
const ThemeModeContext = createContext<ThemeModeContextValue | null>(null)
const ThemeTokensContext = createContext<AppTheme | null>(null)

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useColorScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>('system')

  useEffect(() => {
    let isMounted = true
    void (async () => {
      const storedPreference = await getPersistentValue(THEME_PREFERENCE_KEY)
      if (!isMounted) return
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

  const resolvedMode: 'light' | 'dark' =
    preference === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : preference

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference)
    void setPersistentValue(THEME_PREFERENCE_KEY, nextPreference)
  }, [])

  const modeValue = useMemo<ThemeModeContextValue>(
    () => ({ preference, setPreference, resolvedMode }),
    [preference, setPreference, resolvedMode],
  )
  const tokens = useMemo<AppTheme>(() => buildTheme(resolvedMode), [resolvedMode])

  return (
    <ThemeModeContext.Provider value={modeValue}>
      <ThemeTokensContext.Provider value={tokens}>{children}</ThemeTokensContext.Provider>
    </ThemeModeContext.Provider>
  )
}

export function useThemeMode(): ThemeModeContextValue {
  const value = useContext(ThemeModeContext)
  if (!value) {
    throw new Error('useThemeMode must be used within AppThemeProvider.')
  }
  return value
}

export function useThemeTokens(): AppTheme {
  const value = useContext(ThemeTokensContext)
  if (!value) {
    throw new Error('useThemeTokens must be used within AppThemeProvider.')
  }
  return value
}

// Backwards-compat shim. New code (especially hot-path row
// components) should consume `useThemeTokens()` directly to avoid
// re-rendering when only the preference changes.
export function useAppTheme(): {
  preference: ThemePreference
  setPreference: (value: ThemePreference) => void
  theme: AppTheme
} {
  const mode = useThemeMode()
  const theme = useThemeTokens()
  return useMemo(
    () => ({ preference: mode.preference, setPreference: mode.setPreference, theme }),
    [mode.preference, mode.setPreference, theme],
  )
}

export function useCategoryHue(categoryKeyOrId: string): CategoryHueVariant {
  const theme = useThemeTokens()
  const hue = resolveCategoryHue(categoryKeyOrId)
  return theme.isDark ? hue.dark : hue.light
}

export function useCategoryHueByName(name: string): CategoryHueVariant {
  const theme = useThemeTokens()
  const hue = resolveCategoryHueByName(name)
  return theme.isDark ? hue.dark : hue.light
}
