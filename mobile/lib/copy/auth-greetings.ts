/**
 * Saludos para el hero del login cuando hay sesión previa
 * (`isReturningUser`). El copy vive en el namespace i18n `auth`
 * (`auth:greetings.*`) para que ES y EN se mantengan sincronizados; este
 * módulo solo conserva la lógica de selección por franja horaria.
 *
 * El pool combina los saludos neutros (siempre disponibles) + los
 * específicos para la franja horaria actual (mañana / tarde / noche),
 * así "Buenos días" solo aparece a la mañana, "Buenas tardes" después
 * del mediodía, y "Buenas noches" después de las 7pm.
 */

import i18n from '@/lib/i18n'

type TimeBand = 'morning' | 'afternoon' | 'night'

/**
 * Devuelve la franja horaria actual.
 *  · 5 – 11:59 → mañana
 *  · 12 – 18:59 → tarde
 *  · 19 – 4:59 → noche
 */
function getTimeBand(hour: number): TimeBand {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 19) return 'afternoon'
  return 'night'
}

/** Lee un array de saludos del namespace i18n (defensivo ante formas raras). */
function readGreetingPool(key: string): string[] {
  const value = i18n.t(key, { returnObjects: true })
  return Array.isArray(value) ? (value as string[]).filter((s) => typeof s === 'string') : []
}

/** Devuelve uno de los saludos al azar, hora-aware. */
export function pickReturningGreeting(now: Date = new Date()): string {
  const neutral = readGreetingPool('auth:greetings.neutral')
  const timed = readGreetingPool(`auth:greetings.${getTimeBand(now.getHours())}`)
  const pool = [...neutral, ...timed]
  if (pool.length === 0) return ''
  return pool[Math.floor(Math.random() * pool.length)]
}
