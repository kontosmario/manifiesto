import type { LastApplePayCapture } from './apple-pay-last-capture-store'
import type { LastCaptureDiagnosis } from './diagnose-last-capture'

/**
 * Los tres motivos por los que la captura NO está disponible le dicen
 * cosas DISTINTAS al usuario ("cambiá de teléfono" / "actualizá la app" /
 * "actualizá iOS"), así que se resuelven por separado.
 *
 * El tipo vive acá y no en la pantalla porque `resolveApplePaySetupPhase`
 * es su consumidor principal y tiene que poder testearse sin arrastrar
 * React Native. Quien lo RESUELVE (mirando `Platform` y el módulo nativo)
 * sigue siendo la pantalla.
 */
export type ApplePayGate = 'ok' | 'not-ios' | 'needs-app-update' | 'needs-ios-17'

/**
 * En qué momento del camino está el usuario. La pantalla de Ajustes ES el
 * producto —Apple no expone ninguna API para armar la automatización por
 * él— y hasta 2026-08-11 mostraba TODO siempre: la guía, los avisos y el
 * diagnóstico, sin importar si acababa de descubrir la función o si ya
 * llevaba semanas capturando pagos. Esta fase es lo que le da un solo
 * protagonista a cada momento.
 *
 *  - `unavailable`     → el gate no dejó pasar: no hay nada que configurar.
 *  - `off`             → el switch está apagado: todavía no decidió usarlo.
 *  - `waiting-first`   → prendida, pero jamás llegó una captura: la guía
 *                        es lo único que importa.
 *  - `working`         → prendida y la última captura llegó sana: el
 *                        protagonista es la prueba de que anda.
 *  - `broken-capture`  → prendida y la última captura llegó mal: el
 *                        diagnóstico y su arreglo van al frente.
 */
export type ApplePaySetupPhase =
  | 'unavailable'
  | 'off'
  | 'waiting-first'
  | 'working'
  | 'broken-capture'

export interface ApplePaySetupInput {
  gate: ApplePayGate
  enabled: boolean
  /** El último recibo del store, o `null` si nunca llegó ninguno. */
  lastCapture: LastApplePayCapture | null
  /** Lo que `diagnoseLastCapture` concluyó sobre ese mismo recibo. */
  diagnosis: LastCaptureDiagnosis
}

/**
 * Precedencias, todas deliberadas:
 *
 *  1. `unavailable` gana a TODO. Manda el gate y no el flag persistido
 *     —que igual puede seguir en `true` de antes de que el gate se
 *     cerrara— porque las otras cuatro fases dan por sentada una
 *     plataforma que acá no existe: sin el módulo nativo y sin el
 *     disparador de iOS 17 no hay guía que se pueda completar ni captura
 *     que pueda llegar, así que el resto no describiría nada.
 *     (El flag NO viaja entre teléfonos: `persistent-kv` lo guarda con
 *     `WHEN_UNLOCKED_THIS_DEVICE_ONLY` justamente para que no migre por
 *     backup de iCloud.)
 *  2. `off` gana a cualquier captura vieja. Un recibo de la semana pasada
 *     no es un estado actual si la captura está apagada.
 *  3. Sin captura mandan las ganas de configurar (`waiting-first`), aunque
 *     llegue un diagnóstico distinto de `ok`: sin recibo no hay nada roto
 *     que arreglar. (`diagnoseLastCapture(null)` ya devuelve `ok`, pero la
 *     fase no depende de esa coincidencia.)
 *  4. `broken-capture` gana a `working`. El dato LLEGÓ, así que el usuario
 *     vería un tilde verde y se quedaría tranquilo mientras sus gastos
 *     entran en $0 — que es exactamente el modo de falla silenciosa que
 *     esta pantalla existe para atrapar.
 */
export function resolveApplePaySetupPhase({
  gate,
  enabled,
  lastCapture,
  diagnosis,
}: ApplePaySetupInput): ApplePaySetupPhase {
  if (gate !== 'ok') return 'unavailable'
  if (!enabled) return 'off'
  if (lastCapture === null) return 'waiting-first'
  if (diagnosis.kind !== 'ok') return 'broken-capture'
  return 'working'
}
