import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gardenActivityWindowStartIso } from '@/features/garden/garden-activity-window'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

/**
 * INVARIANTE DEL JARDÍN (bug 2026-08-17): la racha es del HÁBITO, no del CICLO.
 *
 * `close_monthly_cycle` marca `archived_at` sobre TODOS los gastos del período
 * cerrado, y `useExpenses` filtra archivados por diseño (su cache la siembra
 * `home_snapshot` ya filtrada — sacarle el filtro hace oscilar el saldo del
 * Home). Cuando el jardín se colgaba de esa fuente, confirmar un ciclo
 * reescribía semanas enteras como "no cargaste": 8 familias de prod y 44
 * días visibles afectados.
 *
 * El servidor ya define el día con actividad SIN mirar `archived_at`
 * (`recompute_family_streak`); estas guardas obligan al cliente a espejarlo.
 */
describe('el jardín no puede leer de una fuente acotada al ciclo', () => {
  it('use-garden.ts no consume useExpenses (filtra archivados)', () => {
    const src = read('mobile/features/garden/use-garden.ts')
    expect(src).not.toMatch(/from '@\/features\/expenses\/use-expenses'/)
    expect(src).toMatch(/useGardenActivity/)
  })

  it('use-streak.ts no consume useExpenses para derivar actividad', () => {
    const src = read('mobile/features/streaks/use-streak.ts')
    expect(src).not.toMatch(/from '@\/features\/expenses\/use-expenses'/)
    expect(src).toMatch(/useGardenActivity/)
  })

  it('la fuente del jardín NO filtra archivados', () => {
    const src = read('mobile/features/garden/garden-activity-repository.ts')
    // Se mira la LLAMADA, no la palabra: el docblock nombra `archived_at`
    // justamente para explicar por qué no se filtra.
    expect(src).not.toMatch(/\.is\(\s*['"]archived_at['"]/)
    expect(src).not.toMatch(/excludeArchived/)
    // …y tiene que venir acotada por ventana para no traerse años de historial.
    expect(src).toMatch(/gardenActivityWindowStartIso/)
  })

  it('sync-after-mutation invalida la key del jardín al registrar un gasto', () => {
    const src = read('mobile/lib/sync-after-mutation.ts')
    expect(src).toMatch(/gardenActivityQueryKey/)
  })
})

describe('gardenActivityWindowStartIso', () => {
  it('cubre holgadamente las 5 semanas que pinta la grilla', () => {
    const start = gardenActivityWindowStartIso(new Date('2026-08-17T12:00:00Z'))
    // 5 semanas = 35 días; la ventana tiene que exceder eso con margen.
    const days = (Date.parse('2026-08-17') - Date.parse(start)) / 86_400_000
    expect(days).toBeGreaterThanOrEqual(70)
  })

  it('devuelve un ISO YYYY-MM-DD estable', () => {
    expect(gardenActivityWindowStartIso(new Date('2026-08-17T12:00:00Z'))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    )
  })

  it('no depende de la hora del día (mismo día → misma ventana)', () => {
    const a = gardenActivityWindowStartIso(new Date('2026-08-17T00:30:00Z'))
    const b = gardenActivityWindowStartIso(new Date('2026-08-17T23:30:00Z'))
    expect(a).toBe(b)
  })
})
