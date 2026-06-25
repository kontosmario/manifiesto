/* global module */

module.exports = function (api) {
  api.cache(true)

  return {
    presets: ['babel-preset-expo'],
    // Backstop estructural: en builds de producción removemos console.log/info/
    // debug del bundle, para que ningún dato sensible (montos, tokens, PII)
    // llegue a logs por un console.* que se haya colado sin gate __DEV__.
    // Preservamos console.error y console.warn: hay diagnósticos intencionales
    // (ej. captcha-config) que deben sobrevivir a la minificación.
    env: {
      production: {
        plugins: [['transform-remove-console', { exclude: ['error', 'warn'] }]],
      },
    },
  }
}
