import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import i18n from '@/lib/i18n'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'
import {
  isLanguagePreference,
  resolveLanguage,
  type AppLanguage,
  type LanguagePreference,
} from '@/lib/i18n/locale'

const LANGUAGE_PREFERENCE_KEY = 'manifiesto:language-preference'

interface LanguageContextValue {
  /** Lo que el usuario eligió: 'system' | 'es' | 'en'. */
  preference: LanguagePreference
  /** El idioma efectivo ya resuelto ('es' | 'en'). */
  language: AppLanguage
  setPreference: (value: LanguagePreference) => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

/**
 * Provider de idioma. Espeja exactamente el patrón de `theme-provider`:
 * default = sistema, override manual persistido, hidratación async al
 * montar. Mantiene a i18next sincronizado vía `changeLanguage`.
 *
 * El idioma resuelto se sincroniza a `profiles.preferred_language`
 * (ver `useLanguageSync`) para que el servidor pueda localizar las push
 * notifications cuando el usuario no está en la app.
 */
export function LanguageProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<LanguagePreference>('system')

  const language = resolveLanguage(preference)

  // Mantener i18next en el idioma resuelto.
  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language)
    }
  }, [language])

  // Hidratar la preferencia guardada (async, settle tras el primer render).
  useEffect(() => {
    let isMounted = true
    void (async () => {
      const stored = await getPersistentValue(LANGUAGE_PREFERENCE_KEY)
      if (!isMounted) return
      if (isLanguagePreference(stored)) {
        setPreferenceState(stored)
      }
    })()
    return () => {
      isMounted = false
    }
  }, [])

  const setPreference = useCallback((nextPreference: LanguagePreference) => {
    setPreferenceState(nextPreference)
    void setPersistentValue(LANGUAGE_PREFERENCE_KEY, nextPreference)
  }, [])

  const value = useMemo<LanguageContextValue>(
    () => ({ preference, language, setPreference }),
    [preference, language, setPreference],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext)
  if (!value) {
    throw new Error('useLanguage must be used within LanguageProvider.')
  }
  return value
}
