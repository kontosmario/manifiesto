import type { AvatarSlug } from '@/assets/avatars'
import type { Onb5dIngresosState } from './onb-5d-ingresos'
import type { OnbMetaValue } from './onb-5e2-meta'

/**
 * Estado demo del flujo de onboarding del rediseño (Turno 5).
 * Solo para el preview interactivo — al cablear a producción este
 * estado se mapea al onboarding real (decisión owner: convive con el
 * wizard actual detrás de un flag).
 */

/** Pasos del ramal CREADOR (yo solo / crear hogar). */
export type OnbStep = '5a' | '5b' | '5c' | '5d' | '5e' | '5e2' | '5f'
/** Pasos exclusivos del ramal JOINER (unirse con código): aporte + confirmar. */
export type OnbJoinerStep = '5g' | '5h' | '5i'
/** Cualquier paso del flujo (creador o joiner). */
export type OnbAnyStep = OnbStep | OnbJoinerStep

/** Orden del ramal CREADOR. Intacto — lo consume el sub-índice de aprobación. */
export const ONB_STEP_ORDER: OnbStep[] = ['5a', '5b', '5c', '5d', '5e', '5e2', '5f']
/**
 * Orden del ramal JOINER: tras 5c se desvía a aporte → confirmar (NO
 * pasa por 5d/5e/5e2/5f — esos son del creador). 5a/5b/5c se comparten.
 */
export const ONB_JOINER_STEP_ORDER: OnbAnyStep[] = ['5a', '5b', '5c', '5g', '5h', '5i']
/**
 * Secuencia visual monotónica de TODOS los pasos — se usa SOLO para
 * decidir la dirección de la transición (adelante/atrás), nunca para
 * navegar. Los pasos joiner van al final para que 5c→5g lea "adelante"
 * y 5g→5c "atrás" con el mismo criterio de índice creciente.
 */
export const ONB_ALL_STEPS: OnbAnyStep[] = ['5a', '5b', '5c', '5d', '5e', '5e2', '5f', '5g', '5h', '5i']

/**
 * Ramal del hogar, fijado en 5c. 'solo'/'created' siguen el orden del
 * creador; 'joined' (unirse con código) desvía al ramal joiner.
 */
export type OnbFamilyMode = 'solo' | 'created' | 'joined'

export interface OnbFlowState {
  name: string
  /** Slug del avatar animal elegido (pack SVG real de la app). */
  avatar: AvatarSlug
  /** El mockup 5c arranca con "Yo solo" seleccionado. */
  hogar: 'solo' | 'familia'
  /** Ramal elegido en 5c — fija la navegación posterior a 5c. */
  familyMode: OnbFamilyMode
  /** Estado de ingresos con la forma del 5d (fuente: mockups 5d–5d5). */
  income: Onb5dIngresosState
  /** % de ahorro (chips del mockup 5e: 0/5/10/20/30). */
  ahorroPct: number
  /** Meta opcional elegida (null = "Empezar sin meta"). */
  meta: OnbMetaValue | null
  /** Joiner (5g): ¿el usuario aporta al ingreso del hogar? (null = sin elegir). */
  contributesIncome: boolean | null
  /** Joiner (5g): aporte mensual del usuario al total de la familia (pesos). */
  contribution: number
}

/**
 * Monto MENSUAL derivado del income por-período del 5d. Los montos
 * demo del doc normalizan todos a $2.500.000: mensual 2,5M ·
 * quincenal 1,25M×2 · semanal 625k×4 · custom 830k×(30/10)≈2,49M.
 * Variable no tiene monto confirmado (mockup 5d5 lo modela con 0).
 */
export function monthlyFromIncome(income: Onb5dIngresosState): number {
  if (income.tipo === 'variable') return 0
  switch (income.cicloTipo) {
    case 'quincenal':
      return income.monto * 2
    case 'semanal':
      return income.monto * 4
    case 'custom':
      return Math.round(income.monto * (30 / Math.max(1, income.cicloN)))
    default:
      return income.monto
  }
}

/**
 * Estado inicial del flujo.
 *
 * Ingresos arranca VACÍO para que 5d revele sus secciones en
 * secuencia (decisión owner 2026-07-15: primero el paso 1, elegir
 * revela el 2, etc. — la vista no llega cargada). Excepción: si se
 * entra por deep-link DESPUÉS de 5d (5e/5e2/5f), se siembra el income
 * demo del doc (caso A: $2.500.000 mensual, día 1) para que esas
 * pantallas se vean idénticas a su mockup.
 *
 * Entrar directo a un paso JOINER (5g/5h) siembra el ramal 'joined'
 * para que la navegación (5c↔5g↔5h) funcione; 5h además llega con un
 * aporte demo para verse poblado igual que su hermano 5g.
 */
export function buildInitialOnbState(entryStep?: OnbAnyStep): OnbFlowState {
  const pastIncome = entryStep === '5e' || entryStep === '5e2' || entryStep === '5f'
  const joinerEntry = entryStep === '5g' || entryStep === '5h' || entryStep === '5i'
  return {
    name: 'Marcos',
    // El default del mockup es el guacamayo (🦜 → slug real del pack).
    avatar: 'macaw',
    hogar: joinerEntry ? 'familia' : 'solo',
    familyMode: joinerEntry ? 'joined' : 'solo',
    income: pastIncome
      ? {
          tipo: 'fijo',
          cicloTipo: 'mensual',
          cicloN: 10,
          monto: 2_500_000,
          diaCobro: 1,
          diaSemana: null,
        }
      : {
          tipo: null,
          cicloTipo: null,
          cicloN: 10,
          monto: 2_500_000,
          diaCobro: null,
          diaSemana: null,
        },
    ahorroPct: 10,
    meta: null,
    // Seed base: sin elegir / sin aporte. 5h/5i por deep-link llegan
    // poblados (el resumen joiner necesita un aporte para verse).
    contributesIncome: entryStep === '5h' || entryStep === '5i' ? true : null,
    contribution: entryStep === '5h' || entryStep === '5i' ? 2_500_000 : 0,
  }
}
