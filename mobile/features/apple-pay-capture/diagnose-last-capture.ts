import type { LastApplePayCapture } from './apple-pay-last-capture-store'
import { parseShortcutAmount } from './parse-shortcut-amount'

/**
 * Lo que el bloque "¿Está funcionando?" tiene para decir sobre la última
 * captura. Es un estado discriminado y no un booleano porque cada caso se
 * arregla tocando otra cosa en Atajos, y el usuario necesita que le
 * digamos CUÁL.
 *
 *  - `ok`                → la captura llegó sana (o todavía no llegó nada):
 *                          el bloque no dice nada extra.
 *  - `same-value`        → el monto y el comercio traen EL MISMO texto.
 *  - `unreadable-amount` → el monto llegó, pero en un formato que no
 *                          pudimos leer; `raw` es el texto tal cual vino.
 *  - `missing-amount`    → el monto llegó vacío: no hay texto que mostrar.
 */
export type LastCaptureDiagnosis =
  | { kind: 'ok' }
  | { kind: 'same-value'; raw: string }
  | { kind: 'unreadable-amount'; raw: string }
  | { kind: 'missing-amount' }

/**
 * Comparación tolerante entre los dos campos: sin acentos, sin
 * mayúsculas, con los espacios colapsados (Atajos manda espacios
 * no-rompibles). No usa `normalizeMerchant` a propósito: ese normalizador
 * tira los tokens que son sólo dígitos, y acá justamente uno de los dos
 * lados puede ser un número.
 */
function normalizeForComparison(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Diagnostica la última captura recibida con los datos que ya guarda el
 * store, sin pedirle nada al usuario ni mirar nada de Atajos (no podemos:
 * su automatización es una app ajena que no exponemos).
 *
 * La trampa que esto caza es la más traicionera de las tres: en la acción
 * de Manifiesto el usuario insertó la variable en los dos campos pero
 * nunca eligió QUÉ propiedad de la transacción va en cada uno. Sin esa
 * elección, Atajos convierte el objeto entero a texto y manda lo mismo a
 * los dos campos — configuración que a la vista PARECE correcta, porque
 * hay una variable en cada campo.
 *
 * La señal es barata y de altísima confianza: el monto no se puede leer Y
 * coincide con el comercio. Que el monto no se lea alcanza para avisar
 * algo (el gasto entra en $0 igual), pero sin la coincidencia no sabemos
 * que la causa sea ésta, así que ahí el mensaje es más genérico y lo que
 * manda es el texto crudo.
 *
 * Se gatea siempre en que `parseShortcutAmount` falle: una captura cuyo
 * monto se lee bien NO produce ruido, aunque el comercio se le parezca.
 */
export function diagnoseLastCapture(capture: LastApplePayCapture | null): LastCaptureDiagnosis {
  if (capture === null) return { kind: 'ok' }
  if (parseShortcutAmount(capture.amountRaw) !== null) return { kind: 'ok' }

  const amount = capture.amountRaw.trim()
  if (amount === '') return { kind: 'missing-amount' }

  // Dos campos vacíos no son "el mismo valor": es el caso de arriba, y ya
  // salió por `missing-amount`.
  const normalizedAmount = normalizeForComparison(capture.amountRaw)
  if (normalizedAmount !== '' && normalizedAmount === normalizeForComparison(capture.merchantRaw)) {
    return { kind: 'same-value', raw: amount }
  }

  return { kind: 'unreadable-amount', raw: amount }
}
