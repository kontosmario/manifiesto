import type { ReactNode } from 'react'

export type LeftoverOption = 'meta' | 'acumular' | 'reserva'

/** Opciones del plan de recuperación (rama EXCEDIDO del paso 06). */
export type RecoveryOption = 'cubrir' | 'ajustar' | 'revisar'

export interface SceneRenderArgs {
  /** La escena visible AHORA — gatea Brot, partículas, count-ups y toda
   *  entrada decorativa. Con N páginas bajo el mismo overlay, el foco de
   *  navegación da "enfocado" a todas: este flag es el gate real. */
  active: boolean
  reduced: boolean
  /**
   * Pantalla BAJA (menos alto útil que el frame del handoff): las escenas
   * comprimen su aire y sus bloques fijos.
   *
   * El mockup es 393×830 SIN safe areas; un iPhone SE (667pt − insets)
   * deja ~487pt de stage, así que el diseño no entra tal cual. Es el aire
   * lo que cede primero: el handoff ancla arriba con `margin-top` fijos y
   * manda el sobrante a un `margin-top:auto`, o sea el espaciado ya es
   * elástico por diseño. NO se usa ScrollView (clipea, y la tinta de Brot
   * sobresale de su caja) ni escala global (borronea el texto).
   */
  compact: boolean
}

/**
 * Escena del wrapped "La Edición" (rediseño 2026-08).
 *
 * A diferencia del contrato viejo, la escena NO declara material propio
 * (fondo/tintas/CTA): el shell por tema vive en `wrappedSpec(mode)` y
 * cada escena sólo dice cuántas partículas pide y qué acciones ofrece.
 * Navegación por BOTÓN: todas las páginas llevan CTA primario en el pie
 * (orden del owner 2026-08-13); sin auto-avance (README:20 regla 2); el
 * tap lateral y el swipe-down quedan de atajos.
 */
export interface WrappedScene {
  id: string
  /** Partículas de fondo (0 = la escena no las monta). */
  particleCount: number
  /** CTA primario del pie — presente en TODAS las páginas. */
  cta?: {
    label: string
    onPress: () => void
    disabled?: boolean
    busy?: boolean
  }
  /**
   * La zona derecha de tap NO avanza (paso 06 con decisión pendiente:
   * la única salida hacia adelante es el CTA de confirmación).
   */
  blockTapAdvance?: boolean
  render: (args: SceneRenderArgs) => ReactNode
}
