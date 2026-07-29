// Aritmética del indicador (surco) de la tab bar neo. Vive fuera del
// componente para poder testearse sin renderer: el entorno de tests es `node`
// y no monta React Native.
//
// Convención de coordenadas — la misma que reporta `onLayout`:
//   · `SlotRect.x` es RELATIVO al grupo que contiene al ítem.
//   · `GroupOffsets.left/right` son relativos a la barra.
// El centro absoluto de un slot es entonces `groupX + slot.x + slot.width / 2`.
import type { NeoTabKey } from '@/components/navigation/neo-tab-bar-route-map'

export interface SlotRect {
  x: number
  width: number
}

/** Mediciones por tab. Parcial: hasta el primer onLayout no hay ninguna. */
export type SlotRects = Partial<Record<NeoTabKey, SlotRect>>

export interface GroupOffsets {
  left: number
  right: number
}

/** Holgura horizontal del surco respecto del contenido del ítem. Reproduce el
 *  footprint de la píldora aprobada (paddingHorizontal 13) sobre un ítem que
 *  mide con padding 6, SIN que el ítem cambie de tamaño al activarse — que es
 *  lo que hacía moverse al FAB. */
export const NAV_WELL_PADDING_X = 7

/** Ancho del hueco central reservado al FAB. */
export const NAV_FAB_SLOT_WIDTH = 66

/** Calle a cada lado del FAB. Reproduce el aire que el layout viejo repartía
 *  entre el último ítem de un grupo y el disco: con `space-between` dentro de
 *  los grupos ese sobrante ya no se reparte, así que la calle es explícita.
 *  15 sale de medir el reparto original a 393pt en español. */
export const NAV_FAB_GUTTER_X = 15

/** Tabs de cada grupo, en orden visual. El surco cruza de un grupo al otro
 *  pasando por debajo del FAB. */
const LEFT_KEYS: readonly NeoTabKey[] = ['inicio', 'gastos']

export function slotCenterX(groupX: number, slot: SlotRect): number {
  return groupX + slot.x + slot.width / 2
}

/**
 * Ancho FIJO del surco (decisión de diseño): el del ítem más ancho más el
 * padding a ambos lados. Fijo para que el viaje sea `translateX` puro — animar
 * el ancho pagaría una pasada de layout por frame.
 */
export function resolveWellWidth(slots: SlotRects): number {
  let widest = 0
  for (const slot of Object.values(slots)) {
    if (slot && slot.width > widest) widest = slot.width
  }
  if (widest === 0) return 0
  return widest + NAV_WELL_PADDING_X * 2
}

/**
 * `x` del surco para la tab activa, o `null` cuando todavía no se puede
 * posicionar (falta la medición del slot, o no hay ancho). El caller trata el
 * null como "no dibujar el surco todavía" — nunca como 0, que lo plantaría en
 * el borde izquierdo por un frame.
 */
export function resolveIndicatorX(
  slots: SlotRects,
  groups: GroupOffsets,
  active: NeoTabKey,
  wellWidth: number,
): number | null {
  if (wellWidth <= 0) return null
  const slot = slots[active]
  if (!slot) return null
  const groupX = LEFT_KEYS.includes(active) ? groups.left : groups.right
  return slotCenterX(groupX, slot) - wellWidth / 2
}
