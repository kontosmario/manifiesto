/**
 * Saludos para el hero del login cuando hay sesión previa
 * (`isReturningUser`). Todos en español rioplatense, sin adjetivos
 * que concuerden en género con la persona — el original
 * ("Bienvenida de vuelta") era estrictamente femenino. Aquí usamos
 * locuciones idiomáticas o tiempos verbales que no marcan género.
 *
 * El pool combina 47 saludos neutros (siempre disponibles) + 3-5
 * específicos para la franja horaria actual (mañana / tarde / noche),
 * así "Buenos días" solo aparece a la mañana, "Buenas tardes" después
 * del mediodía, y "Buenas noches" después de las 7pm.
 */

const NEUTRAL_GREETINGS = [
  'Qué bueno verte',
  'Volviste',
  'Hola de nuevo',
  'Te estábamos esperando',
  'Bueno verte por aquí',
  'Hola otra vez',
  'Llegaste',
  'Te extrañamos',
  'Qué alegría verte',
  'Aquí seguimos',
  'Hola, qué tal',
  'Adelante, te toca',
  'El plan sigue activo',
  'Tu espacio, tu ritmo',
  'Otra ronda, vamos',
  'Cuántas ganas de verte',
  'Llegó el momento',
  'Sigamos donde quedamos',
  'El control vuelve',
  'Manos a la obra',
  'Te tocaba volver',
  'Buen retorno',
  'Qué bueno tenerte',
  'Empecemos de nuevo',
  'Aquí te esperamos',
  'Tu turno',
  'Comenzamos',
  'Qué tal',
  'Vamos con todo',
  'Por fin',
  'Estamos en sintonía',
  'Una vuelta más',
  'Hola, hola',
  'Aquí seguimos juntos',
  'Tú y tu plan',
  'Cuánto tiempo',
  'Te extrañábamos',
  'Empecemos esto',
  'Sigamos',
  'Una rutina más',
  'Vuelves con todo',
  'Vuelves en hora',
  'Hola, ¿cómo andas?',
  'Te esperábamos',
  'Empezamos juntos',
  'El plan continúa',
  'Llegaste justo a tiempo',
  'Qué bueno verte de nuevo',
] as const

const MORNING_GREETINGS = [
  'Buen día',
  'Buenos días',
  'Hola, buen día',
  'El día arranca',
  'Buen comienzo de día',
] as const

const AFTERNOON_GREETINGS = [
  'Buenas tardes',
  'Buena tarde',
  'Linda tarde',
  'Hola, qué tal la tarde',
] as const

const NIGHT_GREETINGS = [
  'Buenas noches',
  'Buena noche',
  'Que tengas linda noche',
] as const

/**
 * Devuelve los saludos específicos para la franja horaria actual.
 *  · 5 – 11:59 → mañana
 *  · 12 – 18:59 → tarde
 *  · 19 – 4:59 → noche
 */
function getTimedGreetings(hour: number): readonly string[] {
  if (hour >= 5 && hour < 12) return MORNING_GREETINGS
  if (hour >= 12 && hour < 19) return AFTERNOON_GREETINGS
  return NIGHT_GREETINGS
}

/** Devuelve uno de los saludos al azar, hora-aware. */
export function pickReturningGreeting(now: Date = new Date()): string {
  const pool = [...NEUTRAL_GREETINGS, ...getTimedGreetings(now.getHours())]
  return pool[Math.floor(Math.random() * pool.length)]
}
