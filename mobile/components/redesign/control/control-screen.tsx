/**
 * Kit presentacional de la vista CONTROL del rediseño
 * (design_handoff_control, 2026-08-03). A diferencia de fijos/gastos
 * (kit de un solo archivo), Control se parte en `parts/` — 6 componentes
 * con 4–6 estados cada uno hacían inmanejable el archivo único — y este
 * barrel es la cara pública: el view-model (`neo-control-view-model.ts`)
 * importa TIPOS de acá y el screen (`neo-control-screen.tsx`) importa
 * los componentes. Espaciados del layout final ensamblado (`<!--
 * LAYOUT-CONTROL -->` del .dc.html) exportados como constantes, mismo
 * mecanismo que `fijosHeaderHeroSpacing`.
 */
export * from '@/components/redesign/control/control-spec'
export * from '@/components/redesign/control/control-primitives'
export * from '@/components/redesign/control/parts/control-header'
export * from '@/components/redesign/control/parts/control-hero'
export * from '@/components/redesign/control/parts/control-comparativa'
export * from '@/components/redesign/control/parts/control-tendencia'
export * from '@/components/redesign/control/parts/control-patron'
export * from '@/components/redesign/control/parts/control-reparto'
export * from '@/components/redesign/control/parts/control-alcancia'

/** Header → hero: `margin-top:16px` (línea 5846 del markup). */
export const controlHeaderHeroSpacing = { marginTop: 16 } as const

/** Card → label de la sección siguiente: `margin-top:22px` (todas las
 *  secciones del layout final). */
export const controlSectionSpacing = { marginTop: 22 } as const

/** Label de sección → su card: `margin-top:12px`. */
export const controlLabelCardSpacing = { marginTop: 12 } as const

/** Delays de la entrada escalonada `ctlRise` del layout final (ms):
 *  header 0 · hero 60 · comparativa 140 · tendencia 200 · hábito 260 ·
 *  reparto 320 · meta 380 (animation-delay 0/.06/.14/.2/.26/.32/.38s). */
export const controlRiseDelays = {
  header: 0,
  hero: 60,
  comparativa: 140,
  tendencia: 200,
  patron: 260,
  reparto: 320,
  meta: 380,
} as const
