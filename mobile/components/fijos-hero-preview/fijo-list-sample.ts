import type { HeroState } from './hero-states'

export type FijoStatus = 'paid' | 'pending' | 'overdue'

export interface FijoItem {
  id: string
  name: string
  category: string
  categoryColor: string
  amount: number
  dayOfMonth: number
  /** Negativo = vencido hace N días. 0 = HOY. */
  daysUntil: number
  status: FijoStatus
  hikeDeltaPct?: number
}

const BASE: FijoItem[] = [
  { id: '1', name: 'Alquiler', category: 'Hogar', categoryColor: '#9FC9E4', amount: 145_000, dayOfMonth: 5, daysUntil: -12, status: 'paid' },
  { id: '2', name: 'Cable + Internet', category: 'Servicios', categoryColor: '#F2B58A', amount: 22_400, dayOfMonth: 8, daysUntil: -9, status: 'paid' },
  { id: '3', name: 'Auto seguro', category: 'Transporte', categoryColor: '#E5B6E5', amount: 35_000, dayOfMonth: 9, daysUntil: -8, status: 'paid' },
  { id: '4', name: 'Disney+', category: 'Entretenimiento', categoryColor: '#9FC9E4', amount: 4_800, dayOfMonth: 10, daysUntil: -7, status: 'paid' },
  { id: '5', name: 'Cobertura familiar', category: 'Salud', categoryColor: '#F06A6A', amount: 18_500, dayOfMonth: 14, daysUntil: -3, status: 'paid' },
  { id: '6', name: 'Netflix', category: 'Entretenimiento', categoryColor: '#E5B6E5', amount: 12_500, dayOfMonth: 20, daysUntil: 3, status: 'pending' },
  { id: '7', name: 'Spotify Familiar', category: 'Entretenimiento', categoryColor: '#A6EF8F', amount: 5_200, dayOfMonth: 25, daysUntil: 8, hikeDeltaPct: 12, status: 'pending' },
  { id: '8', name: 'Gimnasio', category: 'Salud', categoryColor: '#F2B58A', amount: 18_000, dayOfMonth: 29, daysUntil: 12, status: 'pending' },
  { id: '9', name: 'Prepaga médica', category: 'Salud', categoryColor: '#9FC9E4', amount: 78_900, dayOfMonth: 30, daysUntil: 13, hikeDeltaPct: 16, status: 'pending' },
  { id: '10', name: 'Préstamo personal', category: 'Finanzas', categoryColor: '#C9A6E0', amount: 88_500, dayOfMonth: 2, daysUntil: 16, status: 'pending' },
]

/**
 * Devuelve la lista de fijos para un HeroState. Si el state trae
 * `itemsOverride` (producción vía adaptControllerToHeroState), usa
 * esa. Si no, mockea según el preset id (dev / variants screens).
 */
export function buildFijoList(state: HeroState): FijoItem[] {
  if (Array.isArray(state.itemsOverride)) {
    return state.itemsOverride as FijoItem[]
  }
  if (state.isEmpty) return []

  if (state.id === 'inicio') {
    // Day 2 — nada pagado todavía, todo pending
    return BASE.map((f) => ({
      ...f,
      status: 'pending' as const,
      daysUntil: Math.max(1, f.daysUntil + 18),
    }))
  }

  if (state.id === 'todo_pagado' || state.id === 'fin_ciclo') {
    return BASE.map((f) => ({
      ...f,
      status: 'paid' as const,
      daysUntil: f.daysUntil - 5,
    }))
  }

  if (state.id === 'con_atraso') {
    // 3 paid + 5 pending + 2 overdue
    return BASE.map((f, idx) => {
      if (idx < 3) return { ...f, status: 'paid' as const }
      if (idx === 3 || idx === 4) {
        return {
          ...f,
          status: 'overdue' as const,
          daysUntil: idx === 3 ? -5 : -2,
        }
      }
      return { ...f, status: 'pending' as const }
    })
  }

  // al_dia default — 5 paid + 5 pending
  return BASE
}
