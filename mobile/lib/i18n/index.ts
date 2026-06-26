/**
 * Inicialización de i18next para Manifiesto (ES-LATAM + EN).
 *
 * - Arranca en el idioma del sistema (expo-localization), fallback 'es'.
 * - El `LanguageProvider` (features/preferences/language-provider) cambia el
 *   idioma en runtime cuando el usuario lo togglea en Ajustes, vía
 *   `i18n.changeLanguage`.
 * - Importar este módulo una sola vez en el árbol (lo hace el provider) para
 *   garantizar que i18next quede inicializado antes del primer `useTranslation`.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { resources } from './resources'
import { detectSystemLanguage, FALLBACK_LANGUAGE, NAMESPACES } from './locale'

export const DEFAULT_NS = 'common'

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: detectSystemLanguage(),
    fallbackLng: FALLBACK_LANGUAGE,
    ns: NAMESPACES as unknown as string[],
    defaultNS: DEFAULT_NS,
    interpolation: {
      // React ya escapa; i18next no debe re-escapar.
      escapeValue: false,
    },
    // Sin valores null/'' colgados: caen al fallback de idioma o a la key.
    returnNull: false,
    returnEmptyString: false,
  })
}

export default i18n
