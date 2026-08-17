/**
 * Geometría del tooltip del tour. Módulo PURO (sin React ni Reanimated) para
 * poder testear la decisión sin device — que es justamente donde se rompía.
 *
 * ── El bug (QA del owner, 2026-08-17: "mal posicionado") ──────────────
 * La versión anterior decidía el lado con `roomAbove > roomBelow` y anclaba
 * usando una CONSTANTE de 220pt como alto del tooltip. Ese número quedó viejo:
 * con los copys del rediseño hay 12 de 30 textos que rinden 221-242pt, y con
 * la escala de texto de la app en «Máxima» (×1.2) TODOS superan 220 y llegan a
 * ~298. Consecuencias medidas:
 *   · colocado «arriba», el tooltip se le montaba encima al recuadro que
 *     estaba explicando (hasta 62pt de solape);
 *   · colocado «abajo», el clamp lo empujaba hasta 78pt por debajo del área
 *     usable y la fila «Anterior / Siguiente» quedaba tras la tab bar.
 * Elegir por «cuál hueco es más grande» tampoco alcanza: el hueco más grande
 * puede seguir siendo más chico que el tooltip.
 *
 * Acá se decide con el alto REAL (medido por onLayout) y contra los insets
 * REALES del device, no contra 50/110 hardcodeados.
 */

export interface TooltipPlacementInput {
  /** Rect del elemento resaltado, en coordenadas de ventana. */
  targetY: number
  targetH: number
  /** Alto de la ventana. */
  screenH: number
  /** Alto REAL del tooltip (medido). Antes de la primera medición se pasa la
   *  semilla, y el segundo layout corrige. */
  tooltipH: number
  /** Zona no usable de arriba (status bar / isla) y de abajo (tab bar + home
   *  indicator), derivadas de los insets reales. */
  usableTop: number
  usableBottom: number
  /** Aire entre el recuadro y el tooltip. */
  gap: number
}

export interface TooltipPlacement {
  placement: 'above' | 'below'
  top: number
  /** Cuando no entra entero en ningún lado, el tooltip se vuelve scrolleable
   *  con este tope. `null` = entra sin recortar. Sin esto, con escala de texto
   *  grande el usuario nunca llegaba a los botones. */
  maxHeight: number | null
}

/** Alto de arranque mientras el tooltip no midió todavía. Es solo una semilla:
 *  el layout real lo corrige en el frame siguiente. */
export const TOOLTIP_HEIGHT_SEED = 220

export function resolveTooltipPlacement(
  input: TooltipPlacementInput,
): TooltipPlacement {
  const { targetY, targetH, tooltipH, usableTop, usableBottom, gap } = input

  const roomAbove = targetY - usableTop - gap
  const roomBelow = usableBottom - (targetY + targetH) - gap

  const fitsAbove = roomAbove >= tooltipH
  const fitsBelow = roomBelow >= tooltipH

  // La decisión es «¿DÓNDE ENTRA?», no «¿qué hueco es más grande?». Se prefiere
  // abajo (el flujo natural de lectura) cuando entra en los dos.
  let placement: 'above' | 'below'
  if (fitsBelow) placement = 'below'
  else if (fitsAbove) placement = 'above'
  else placement = roomBelow >= roomAbove ? 'below' : 'above'

  // Si no entra entero, se recorta al hueco disponible y el contenido scrollea.
  const fits = placement === 'below' ? fitsBelow : fitsAbove
  const room = placement === 'below' ? roomBelow : roomAbove
  const maxHeight = fits ? null : Math.max(120, room)
  const effectiveH = maxHeight ?? tooltipH

  const top =
    placement === 'below'
      ? targetY + targetH + gap
      : targetY - gap - effectiveH

  // Clamp final: nunca detrás de la status bar ni de la tab bar.
  const clamped = Math.min(
    Math.max(usableTop, top),
    Math.max(usableTop, usableBottom - effectiveH),
  )

  return { placement, top: clamped, maxHeight }
}
