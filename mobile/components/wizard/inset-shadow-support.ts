/**
 * ¿Este device dibuja `boxShadow` INSET?
 *
 * RN 0.81 traduce `boxShadow` a la API nativa de sombras de Android, que sólo
 * soporta inset desde API 29 (outset desde 28). En APIs anteriores el valor se
 * DESCARTA EN SILENCIO: no hay warning, no hay fallback.
 *
 * Importa acá porque los pozos del wizard (card de monto, input de
 * descripción) se dibujan SOLO con sombra inset y `borderWidth: 0`. En un
 * Android 9/10 eso deja un rectángulo `#F4F5EE` sobre un fondo `#E9EBE0`
 * (~1.06:1): el campo desaparece y el usuario no ve dónde tocar. Los consumidores
 * usan este flag para caer a un hairline cuando el relieve no va a existir.
 */
import { Platform } from 'react-native'

export const SUPPORTS_INSET_SHADOW =
  Platform.OS !== 'android' ||
  (typeof Platform.Version === 'number' && Platform.Version >= 29)
