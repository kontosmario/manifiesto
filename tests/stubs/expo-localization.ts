// Stub de expo-localization para vitest (env node). Sin esto, getLocales()
// devuelve el locale de la MÁQUINA (p.ej. en-US), i18n arranca en inglés y
// todos los tests de copy que esperan español fallan. Forzamos 'es' (el
// idioma default/fallback de la app) para que el test env sea determinístico.
export function getLocales() {
  return [
    {
      languageCode: 'es',
      languageTag: 'es-AR',
      regionCode: 'AR',
      currencyCode: 'ARS',
      currencySymbol: '$',
      decimalSeparator: ',',
      digitGroupingSeparator: '.',
      textDirection: 'ltr',
      measurementSystem: 'metric',
      temperatureUnit: 'celsius',
    },
  ]
}

export function getCalendars() {
  return [{ calendar: 'gregory', timeZone: 'America/Argentina/Buenos_Aires' }]
}
