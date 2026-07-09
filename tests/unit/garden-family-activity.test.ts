import { describe, expect, it } from 'vitest'
import { familyActivityDays } from '@/features/garden/garden-model'

const TZ = 'America/Argentina/Buenos_Aires'

// Mediodía local (gotcha timestamptz off-by-one): 15:00Z = 12:00 en AR.
const at = (isoDate: string) => `${isoDate}T15:00:00.000Z`

describe('familyActivityDays — el jardín es del hogar', () => {
  it('cuenta gastos de CUALQUIER miembro, no solo del usuario actual', () => {
    const activity = familyActivityDays(
      [
        { created_at: at('2026-07-06'), created_by: 'yo' },
        { created_at: at('2026-07-07'), created_by: 'mi-pareja' },
      ],
      [],
      TZ,
    )
    expect(activity.has('2026-07-06')).toBe(true)
    expect(activity.has('2026-07-07')).toBe(true)
  })

  it('une los días marcados sin-gasto (de cualquier autor) con los gastos', () => {
    const activity = familyActivityDays(
      [{ created_at: at('2026-07-05'), created_by: 'yo' }],
      ['2026-07-04'],
      TZ,
    )
    expect(activity.has('2026-07-04')).toBe(true)
    expect(activity.has('2026-07-05')).toBe(true)
    expect(activity.size).toBe(2)
  })

  it('dedupea: dos miembros el mismo día = un solo brote', () => {
    const activity = familyActivityDays(
      [
        { created_at: at('2026-07-06'), created_by: 'yo' },
        { created_at: at('2026-07-06'), created_by: 'mi-pareja' },
      ],
      [],
      TZ,
    )
    expect(activity.size).toBe(1)
  })

  it('excluye gastos de autor borrado (created_by null) — espejo del server', () => {
    // El trigger de racha, recompute_family_streak y weekActivity ignoran
    // created_by NULL (cuenta eliminada, ON DELETE SET NULL): el jardín
    // no puede pintar brotes en días que la racha cuenta como huecos.
    const activity = familyActivityDays(
      [
        { created_at: at('2026-07-06'), created_by: null },
        { created_at: at('2026-07-07'), created_by: 'yo' },
      ],
      [],
      TZ,
    )
    expect(activity.has('2026-07-06')).toBe(false)
    expect(activity.has('2026-07-07')).toBe(true)
  })

  it('corta el día en la timezone local (gasto a la noche AR ≠ día UTC)', () => {
    // 23:30 en AR = 02:30Z del día siguiente.
    const activity = familyActivityDays(
      [{ created_at: '2026-07-07T02:30:00.000Z', created_by: 'mi-pareja' }],
      [],
      TZ,
    )
    expect(activity.has('2026-07-06')).toBe(true)
    expect(activity.has('2026-07-07')).toBe(false)
  })
})
