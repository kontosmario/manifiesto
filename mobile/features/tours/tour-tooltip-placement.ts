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

export interface HighlightHeightInput {
  /** Y del cutout, con el padding del paso ya aplicado. */
  targetY: number
  /** Alto natural del cutout (alto del ancla + padding × 2). */
  naturalH: number
  /** Cuánto se PIDE estirar hacia abajo (`highlight.extendBelow`). 0 = nada. */
  extendBelow: number
  /** Fondo de la superficie de scroll en coordenadas de ventana, o `null` si
   *  no hay superficie registrada. */
  scrollBottom: number | null
  /** Fondo usable de la pantalla (por encima de la barra de tabs). */
  usableBottom: number
  /** Espacio que hay que dejarle al tooltip debajo del recuadro: su alto REAL
   *  más el aire que lo separa. */
  tooltipReserve: number
}

/**
 * Alto del cutout para los pasos que resaltan una SECCIÓN (encabezado + lo que
 * sigue) en vez de un elemento suelto.
 *
 * Nace del QA del owner (2026-08-17) sobre el paso `list` de Gastos: con
 * `extendToScrollEnd` el recuadro se estira hasta el fondo del scroll —que en
 * edge-to-edge pasa POR DEBAJO de la barra de tabs— y terminaba abarcando media
 * pantalla más la navegación. Acá el estirado es ACOTADO y, sobre todo, nunca
 * invade el lugar donde el tooltip tiene que aterrizar: si lo hiciera,
 * `resolveTooltipPlacement` se quedaría sin hueco abajo y mandaría el tooltip
 * arriba (o lo recortaría), que es exactamente el desorden que se está
 * arreglando.
 *
 * Devuelve SIEMPRE al menos el alto natural: un tope chico nunca puede
 * encoger el recuadro por debajo del elemento que ancla el paso.
 */
export function resolveHighlightHeight(input: HighlightHeightInput): number {
  const {
    targetY,
    naturalH,
    extendBelow,
    scrollBottom,
    usableBottom,
    tooltipReserve,
  } = input
  if (extendBelow <= 0) return naturalH
  // El fondo pedido, contra los dos topes duros.
  let bottom = Math.min(
    targetY + naturalH + extendBelow,
    usableBottom - tooltipReserve,
  )
  // 4pt de aire para que el recuadro no bese el borde del scroll.
  if (scrollBottom != null) bottom = Math.min(bottom, scrollBottom - 4)
  return Math.max(naturalH, bottom - targetY)
}
