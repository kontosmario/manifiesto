import { getLocales } from 'expo-localization'

/**
 * Manifiesto soporta exactamente 2 idiomas: Español (LATAM) e Inglés.
 * `es` es el fallback (cualquier idioma del sistema que no sea inglés cae acá).
 */
export const SUPPORTED_LANGUAGES = ['es', 'en'] as const
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const FALLBACK_LANGUAGE: AppLanguage = 'es'

/** Lo que el usuario elige en Ajustes: seguir el sistema, o forzar un idioma. */
export type LanguagePreference = 'system' | AppLanguage

/**
 * Namespaces de i18next (un JSON por namespace y por idioma en
 * `locales/<lang>/<ns>.json`). Mantener en sync con `resources.ts`.
 */
export const NAMESPACES = [
  'common',
  'states',
  'auth',
  'errors',
  'onboarding',
  'home',
  'gastos',
  'fijos',
  'control',
  'settings',
  'billing',
  'garden',
  'achievements',
  'insights',
  'notifications',
] as const

export type Namespace = (typeof NAMESPACES)[number]

/** Lee el idioma del sistema y lo mapea a 'es' | 'en' (default 'es'). */
export function detectSystemLanguage(): AppLanguage {
  try {
    const code = getLocales()?.[0]?.languageCode?.toLowerCase()
    return code === 'en' ? 'en' : 'es'
  } catch {
    return FALLBACK_LANGUAGE
  }
}

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'es' || value === 'en'
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || isAppLanguage(value)
}

/** Resuelve la preferencia ('system' → idioma real del dispositivo). */
export function resolveLanguage(preference: LanguagePreference): AppLanguage {
  return preference === 'system' ? detectSystemLanguage() : preference
}
