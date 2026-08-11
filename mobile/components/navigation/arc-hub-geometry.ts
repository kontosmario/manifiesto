/**
 * Geometría del hub de acciones "Arco".
 *
 * Módulo PURO (cero imports de RN / expo) para que vitest lo importe bajo
 * su entorno `node`, igual que `add-expense-tab-button-no-spend-decision.ts`.
 *
 * Una sola fuente de verdad: `ARC_ORDER`, `ARC_SPREAD`, el radio y la tabla
 * de tamaños. Ángulo, posición del puck, ancla del nombre, el surco, los
 * sectores del hit-test y el escalonado se DERIVAN de ahí — ningún puck
 * tiene coordenadas propias escritas a mano, así que el arco no puede
 * desalinearse del pivote.
 *
 * El pivote (`cx`, `cy`) NO vive acá: se mide del disco real del FAB en
 * tiempo de gesto y entra como parámetro.
 */

/**
 * Orden IZQUIERDA → DERECHA del abanico.
 *
 * `expense` va al centro por ser la acción dominante, y a sus lados quedan
 * las dos que le siguen en frecuencia real —`fixed` e `income`—, que son
 * además las otras dos que empujan una ruta de alta. Las puntas, que es
 * donde el pulgar llega peor, se reservan para lo ocasional: importar una
 * captura y marcar el día sin gasto.
 */
import {
  BROT_INK_BLEED_TOP,
  BROT_VIEWBOX_H,
} from '@/components/brot/brot-geometry'

export const ARC_ORDER = ['import', 'fixed', 'expense', 'income', 'no-spend'] as const

export type ArcActionKey = (typeof ARC_ORDER)[number]

/** Cantidad de pucks. Número suelto (no `ARC_ORDER.length`) porque el
 *  hit-test corre en worklet y ahí conviene capturar escalares. */
export const ARC_COUNT = 5

/** Apertura total del abanico en grados (±72 alrededor de la vertical). */
export const ARC_SPREAD = 144
/** Salto angular entre pucks contiguos. */
export const ARC_STEP = ARC_SPREAD / (ARC_COUNT - 1)
/** Radio nominal, idéntico para los cinco. Se recorta en pantallas
 *  angostas — ver `arcRadius`. */
export const ARC_BASE_RADIUS = 150
/** Radio del pozo central: soltar acá cancela. */
export const ARC_DEAD_ZONE = 56
/** Cuánto más allá del arco sigue siendo una elección válida. */
export const ARC_REACH_MARGIN = 92
/** Grados de sobra del surco a cada punta del abanico. */
export const ARC_TRACK_EXT = 6
/** Aire entre el borde superior del puck y su nombre. */
export const ARC_LABEL_GAP = 9
/** Apertura horizontal del nombre = `ARC_LABEL_OUT · sen(ang)`. */
export const ARC_LABEL_OUT = 13
/**
 * Ancho de la caja del nombre. En RN no existe `translate(-50%, -100%)`,
 * así que el nombre se centra dentro de una caja de ancho fijo anclada a
 * `lx`. La caja de las puntas se sale de la pantalla, pero el texto —
 * centrado y de ~44pt de ancho — queda entero adentro: lo que se recorta
 * es aire vacío.
 */
export const ARC_LABEL_BOX = 120
/** Alto de línea del nombre (11px · 1.25 ≈ 14). */
export const ARC_LABEL_LINE = 15
/** Alto del slot de Brot (el ancho lo deriva su viewBox 84×108). */
export const ARC_BROT_SIZE = 92

// ─── Globo de chat de Brot ──────────────────────────────────────
//
// Vive acá y no en el host porque el alto del conjunto ES geometría: de él
// sale el `top` del slot, y su contrato con el dibujo de Brot se puede
// testear sin device.

export const ARC_BUBBLE_LINE = 17
export const ARC_BUBBLE_PAD_V = 9
/** Alto total del globo. Sin aro: la separación la hace sólo el relieve. */
export const ARC_BUBBLE_BOX = ARC_BUBBLE_LINE + ARC_BUBBLE_PAD_V * 2

/**
 * Cuánto se sale el DIBUJO de Brot por encima de su caja de layout.
 *
 * No es un margen de cortesía: `BrotMascot` dibuja sobre un papel más grande
 * que su caja justamente para no guillotinar las hojas en las poses que
 * saltan, y en `cheer`/`radiant` la tinta llega a ~8,2dp por encima. Con el
 * aire medido sólo contra la caja, esas hojas se metían DENTRO del globo.
 *
 * Y no se ve venir revisando el prototipo: el componente web del handoff
 * recorta exacto al viewBox, así que ahí Brot nunca invade nada. Es un
 * defecto que sólo existe en device.
 */
export const ARC_BROT_INK_ABOVE =
  BROT_INK_BLEED_TOP * (ARC_BROT_SIZE / BROT_VIEWBOX_H)

/** Aire VISIBLE entre la base del globo y la tinta de Brot. */
export const ARC_BUBBLE_AIR = 5

/**
 * Aire entre la base del globo y la caja de Brot. DERIVADO, no elegido: sin
 * colita, lo único que hay que dejar pasar es la tinta que Brot saca fuera
 * de su caja. Que el globo quede CERCA es lo que lo hace suyo — no hay
 * conector que lo señale.
 */
export const ARC_BUBBLE_GAP = ARC_BROT_INK_ABOVE + ARC_BUBBLE_AIR
/** Aire entre el techo del nombre más alto y la base del slot de Brot. */
export const ARC_BROT_GAP = 18
/** Aire mínimo entre el puck de la punta y el borde de la pantalla. */
export const ARC_EDGE_MARGIN = 16
/** Por debajo del pivote no se elige (el dedo tapa el FAB, no el arco). */
export const ARC_MIN_DY = -12
/** Un toque más corto que esto, y sin desplazarse, deja el arco abierto. */
export const ARC_HOLD_MS = 300
/** Desplazamiento máximo que sigue contando como "tap seco". */
export const ARC_TAP_SLOP = 14

export const ARC_SIZES = { primary: 88, daily: 64, monthly: 56 } as const

export type ArcWeight = keyof typeof ARC_SIZES

/** Índice del centro del abanico. */
const ARC_CENTER_INDEX = (ARC_COUNT - 1) / 2

/**
 * La jerarquía aprobada (principal > diaria > mensual) la decide la
 * POSICIÓN, no la acción: centro principal, contiguos diarios, puntas
 * mensuales.
 *
 * Se DERIVA a propósito. Con la tabla escrita a mano por clave, mover una
 * acción hacia adentro la dejaba más chica que su vecina de la punta —la
 * jerarquía visual al revés— y además `OUTER_CLEARANCE`, que asume que las
 * puntas miden `monthly`, dejaba de valer y el abanico podía salirse de la
 * pantalla.
 */
export function arcWeightForIndex(index: number): ArcWeight {
  const distance = Math.abs(index - ARC_CENTER_INDEX)
  if (distance === 0) return 'primary'
  if (distance <= 1) return 'daily'
  return 'monthly'
}

export const ARC_WEIGHT: Record<ArcActionKey, ArcWeight> = Object.fromEntries(
  ARC_ORDER.map((key, index) => [key, arcWeightForIndex(index)]),
) as Record<ArcActionKey, ArcWeight>

const DEG = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
/** Seno de la mitad de la apertura — el factor que decide cuánto se
 *  aleja del pivote la punta del arco. */
const SIN_HALF_SPREAD = Math.sin((ARC_SPREAD / 2) * DEG)
/** Media punta + aire: lo que el radio tiene que dejar libre al costado. */
const OUTER_CLEARANCE = ARC_SIZES.monthly / 2 + ARC_EDGE_MARGIN
/** Piso del radio: por debajo de esto el puck principal pisaría el pozo. */
const MIN_RADIUS = ARC_DEAD_ZONE + ARC_SIZES.primary / 2

export function arcAngle(index: number): number {
  'worklet'
  return -ARC_SPREAD / 2 + index * ARC_STEP
}

/**
 * Radio efectivo. El nominal (150) entra cómodo en 393pt, pero en un
 * device angosto la punta del abanico se saldría de la pantalla, así que
 * el radio es función del semiancho útil y no un literal.
 */
export function arcRadius(width: number, cx: number): number {
  'worklet'
  const half = Math.min(cx, width - cx)
  const fit = (half - OUTER_CLEARANCE) / SIN_HALF_SPREAD
  return Math.max(MIN_RADIUS, Math.min(ARC_BASE_RADIUS, fit))
}

export interface ArcSlot {
  key: ArcActionKey
  index: number
  angle: number
  size: number
  /** Centro del puck, relativo al pivote. */
  dx: number
  dy: number
  /** Punto BOTTOM-CENTER del nombre, relativo al pivote. */
  lx: number
  ly: number
  /** 0 en el centro, 1 en las puntas. Ordena el escalonado. */
  stagger: number
}

/**
 * Los cinco pucks derivados. `dy` crece hacia abajo (convención de RN),
 * así que el arco vive en valores negativos.
 */
export function arcSlots(radius: number): ArcSlot[] {
  const slots: ArcSlot[] = []
  for (let index = 0; index < ARC_COUNT; index += 1) {
    const key = ARC_ORDER[index]
    const angle = arcAngle(index)
    const sin = Math.sin(angle * DEG)
    const cos = Math.cos(angle * DEG)
    const size = ARC_SIZES[arcWeightForIndex(index)]
    slots.push({
      key,
      index,
      angle,
      size,
      dx: radius * sin,
      dy: -radius * cos,
      lx: (radius + ARC_LABEL_OUT) * sin,
      ly: -radius * cos - size / 2 - ARC_LABEL_GAP,
      stagger: Math.abs(angle) / (ARC_SPREAD / 2),
    })
  }
  return slots
}

/**
 * Distancia del pivote a la base del slot de Brot. Se expresa relativa a
 * `cy` (no al alto de pantalla) para que el conjunto viaje entero con el
 * FAB en cualquier safe area.
 */
export function arcBrotBaseline(radius: number): number {
  return radius + ARC_SIZES.primary / 2 + ARC_LABEL_GAP + ARC_LABEL_LINE + ARC_BROT_GAP
}

/** Surco: arco al MISMO radio que los pucks, con sobra a cada punta. */
export function arcTrackPath(cx: number, cy: number, radius: number): string {
  const ext = (ARC_SPREAD / 2 + ARC_TRACK_EXT) * DEG
  const dx = radius * Math.sin(ext)
  const y = cy - radius * Math.cos(ext)
  return `M ${(cx - dx).toFixed(2)} ${y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${(cx + dx).toFixed(2)} ${y.toFixed(2)}`
}

/** Largo real del surco, para el `strokeDasharray` que lo dibuja. */
export function arcTrackLength(radius: number): number {
  return radius * (ARC_SPREAD + ARC_TRACK_EXT * 2) * DEG
}

/**
 * Hit-test angular. Sectores CONTIGUOS de `ARC_STEP` grados: no hay huecos
 * entre pucks, así que un dedo tembloroso siempre cae en alguno.
 *
 * Devuelve el índice en `ARC_ORDER`, o −1 (pozo, fuera de alcance, o por
 * debajo del pivote). Sólo `Math.*` — nada de `Intl` ni locale, que
 * crashean sin stack adentro de un worklet.
 */
export function arcHitTest(
  px: number,
  py: number,
  cx: number,
  cy: number,
  radius: number,
): number {
  'worklet'
  const dx = px - cx
  const dy = cy - py
  const dist = Math.sqrt(dx * dx + dy * dy)
  // `!(dist >= X)` y no `dist < X`: así también cae acá el NaN. El payload
  // del `onFinalize` de un gesto que nunca activó puede llegar sin
  // coordenadas, y con la comparación al derecho el NaN se escapaba de
  // TODAS las guardas —incluida la del rango de índices— y salía de la
  // función como si fuera un sector válido.
  if (!(dist >= ARC_DEAD_ZONE)) return -1
  if (dist > radius + ARC_REACH_MARGIN) return -1
  if (dy < ARC_MIN_DY) return -1
  const ang = Math.atan2(dx, dy) * RAD_TO_DEG
  if (Math.abs(ang) > ARC_SPREAD / 2 + ARC_STEP / 2) return -1
  const index = Math.round((ang + ARC_SPREAD / 2) / ARC_STEP)
  if (index < 0 || index >= ARC_COUNT) return -1
  return index
}
