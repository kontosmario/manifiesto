/**
 * Los mensajitos de Brot del hub Arco.
 *
 * Uno por apertura, distinto cada vez. Brot ya NO cambia de pose según la
 * acción apuntada: se elige una sola vez al abrir y se sostiene toda la
 * interacción, así el arco deja de tener una mascota que salta.
 *
 * Módulo PURO: sólo importa el TIPO de la pose (`import type` se borra en
 * compilación), así que vitest lo carga bajo su entorno `node` sin arrastrar
 * Skia — igual que `arc-hub-geometry` y `arc-hub-machine`.
 *
 * La copy NO vive acá: cada entrada aporta el `id` y la pose, y el texto sale
 * de `states:arcHub.brot.<id>` en los dos idiomas. Emparejar pose y mensaje
 * por objeto (y no por dos arrays paralelos) es lo que deja reordenar el
 * catálogo sin desalinear a Brot de lo que dice.
 */

import type { BrotPose } from '@/components/brot'

export interface ArcBrotMessage {
  /** Sufijo de la clave de copy: `states:arcHub.brot.<id>`. */
  id: string
  pose: BrotPose
}

export const ARC_BROT_MESSAGES: readonly ArcBrotMessage[] = [
  { id: 'que-bueno-verte', pose: 'wave' },
  { id: 'raiz-dormida', pose: 'shy' },
  { id: 'sin-prisa', pose: 'zen' },
  { id: 'tu-fotosintetizas', pose: 'cool' },
  { id: 'anota-con-calma', pose: 'coach' },
  { id: 'caracol-saludo', pose: 'wow' },
  { id: 'aqui-estoy-sin-juzgar', pose: 'love' },
  { id: 'modo-jardin', pose: 'cool' },
  { id: 'me-regue-encima', pose: 'shy' },
  { id: 'dia-pesado', pose: 'think' },
  { id: 'dos-hojas-energia', pose: 'cheer' },
  { id: 'maceta-grande', pose: 'seed' },
  { id: 'pensaba-en-la-lluvia', pose: 'think' },
  { id: 'hola-otra-vez', pose: 'wave' },
  { id: 'somos-dos-y-uno-es-planta', pose: 'laugh' },
  { id: 'sol-aqui-adentro', pose: 'radiant' },
  { id: 'toca-sin-miedo', pose: 'wave' },
  { id: 'hoja-izquierda-bosteza', pose: 'idle' },
  { id: 'crecer-cosquillas', pose: 'laugh' },
  { id: 'tierra-tibia', pose: 'seed' },
  { id: 'no-se-sumar-soy-planta', pose: 'shy' },
  { id: 'que-plantamos-hoy', pose: 'think' },
  { id: 'viento-despeino', pose: 'sproutA' },
  { id: 'nadie-te-pide-nada', pose: 'shy' },
  { id: 'casi-todo-agua', pose: 'idle' },
  { id: 'seguimos-cuando-quieras', pose: 'radiant' },
  { id: 'sombra-un-rato', pose: 'love' },
  { id: 'recien-salgo-tierra', pose: 'sproutA' },
  { id: 'practique-este-saludo', pose: 'wave' },
  { id: 'hojas-contentas', pose: 'cheer' },
  { id: 'pesa-el-globo-o-soy-yo', pose: 'wow' },
  { id: 'tu-ritmo-tu-manera', pose: 'cool' },
  { id: 'poquito-de-agua', pose: 'idle' },
  { id: 'ningun-gasto-te-define', pose: 'love' },
  { id: 'me-estire-saludar', pose: 'sprout' },
  { id: 'risa-una-hormiga', pose: 'laugh' },
  { id: 'regamos-el-jardin', pose: 'sprout' },
  { id: 'hoy-basta-estar-aqui', pose: 'sproutA' },
  { id: 'elige-yo-espero', pose: 'zen' },
  { id: 'cinco-caminos-un-brote', pose: 'wow' },
]

export const ARC_BROT_COUNT = ARC_BROT_MESSAGES.length

export interface ArcBrotPicker {
  /** Índice de la próxima entrada. */
  next(): number
}

/**
 * Selector "de bolsa": reparte los índices en orden aleatorio y no vuelve a
 * repetir hasta agotarlos todos.
 *
 * Un `Math.random()` suelto NO alcanza para "que sea uno distinto": con 40
 * entradas, la probabilidad de ver un repetido en las primeras diez tiradas
 * es de más de un 70%, y repetir es justo lo que se nota. La bolsa garantiza
 * las 40 antes de que se repita ninguna, y al recargarse evita que la última
 * de una vuelta quede pegada a la primera de la siguiente — el único borde
 * donde el barajado puede delatar la costura.
 */
export function createArcBrotPicker(
  count: number,
  random: () => number = Math.random,
): ArcBrotPicker {
  let bag: number[] = []
  let last = -1

  function refill(): void {
    bag = Array.from({ length: count }, (_, index) => index)
    // Fisher-Yates.
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1))
      const swap = bag[i]
      bag[i] = bag[j]
      bag[j] = swap
    }
    // Se saca del final; si ahí quedó el último entregado, se lo permuta con
    // el principio para no repetir a caballo entre dos vueltas.
    if (count > 1 && bag[bag.length - 1] === last) {
      const swap = bag[bag.length - 1]
      bag[bag.length - 1] = bag[0]
      bag[0] = swap
    }
  }

  return {
    next(): number {
      if (count <= 0) return 0
      if (count === 1) return 0
      if (bag.length === 0) refill()
      const index = bag.pop() as number
      last = index
      return index
    },
  }
}
