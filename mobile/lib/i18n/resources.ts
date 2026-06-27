/**
 * Ensambla los recursos de i18next desde los JSON por namespace.
 * Cada área de la app es dueña de su namespace (archivos disjuntos),
 * lo que permite traducir en paralelo sin colisiones de escritura.
 *
 * Mantener la lista en sync con `NAMESPACES` en `locale.ts`.
 */
import commonEs from './locales/es/common.json'
import statesEs from './locales/es/states.json'
import authEs from './locales/es/auth.json'
import errorsEs from './locales/es/errors.json'
import onboardingEs from './locales/es/onboarding.json'
import homeEs from './locales/es/home.json'
import gastosEs from './locales/es/gastos.json'
import fijosEs from './locales/es/fijos.json'
import controlEs from './locales/es/control.json'
import settingsEs from './locales/es/settings.json'
import billingEs from './locales/es/billing.json'
import gardenEs from './locales/es/garden.json'
import achievementsEs from './locales/es/achievements.json'
import insightsEs from './locales/es/insights.json'
import notificationsEs from './locales/es/notifications.json'

import commonEn from './locales/en/common.json'
import statesEn from './locales/en/states.json'
import authEn from './locales/en/auth.json'
import errorsEn from './locales/en/errors.json'
import onboardingEn from './locales/en/onboarding.json'
import homeEn from './locales/en/home.json'
import gastosEn from './locales/en/gastos.json'
import fijosEn from './locales/en/fijos.json'
import controlEn from './locales/en/control.json'
import settingsEn from './locales/en/settings.json'
import billingEn from './locales/en/billing.json'
import gardenEn from './locales/en/garden.json'
import achievementsEn from './locales/en/achievements.json'
import insightsEn from './locales/en/insights.json'
import notificationsEn from './locales/en/notifications.json'

export const resources = {
  es: {
    common: commonEs,
    states: statesEs,
    auth: authEs,
    errors: errorsEs,
    onboarding: onboardingEs,
    home: homeEs,
    gastos: gastosEs,
    fijos: fijosEs,
    control: controlEs,
    settings: settingsEs,
    billing: billingEs,
    garden: gardenEs,
    achievements: achievementsEs,
    insights: insightsEs,
    notifications: notificationsEs,
  },
  en: {
    common: commonEn,
    states: statesEn,
    auth: authEn,
    errors: errorsEn,
    onboarding: onboardingEn,
    home: homeEn,
    gastos: gastosEn,
    fijos: fijosEn,
    control: controlEn,
    settings: settingsEn,
    billing: billingEn,
    garden: gardenEn,
    achievements: achievementsEn,
    insights: insightsEn,
    notifications: notificationsEn,
  },
} as const
