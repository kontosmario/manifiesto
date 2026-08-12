import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: vi.fn(async (k: string, v: string) => {
      store.set(k, v)
    }),
    removeItem: vi.fn(async (k: string) => {
      store.delete(k)
    }),
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
  },
}))

import {
  achievementsSeenKey,
  markAchievementsSeen,
  readAchievementsSeen,
  unseenFrom,
} from '@/features/achievements/use-achievements-seen'

const USER = 'u1'

beforeEach(() => store.clear())

describe('unseenFrom (el número que prende el dot ④2)', () => {
  it('sin marca previa no afirma nada — el llamador ancla', () => {
    expect(unseenFrom(null, 7)).toBeNull()
  })

  it('sin conteo real (catálogo cargando) tampoco afirma', () => {
    expect(unseenFrom(3, null)).toBeNull()
  })

  it('cuenta los desbloqueados posteriores a la última visita', () => {
    expect(unseenFrom(5, 7)).toBe(2)
  })

  it('sin novedades da 0 (el dot queda apagado)', () => {
    expect(unseenFrom(7, 7)).toBe(0)
  })

  it('nunca negativo: si el conteo real BAJA, no hay nada nuevo', () => {
    // Un code desactivado en el catálogo baja el earned real; "-1 logros
    // nuevos" no significa nada para la UI.
    expect(unseenFrom(8, 7)).toBe(0)
  })

  it('usuario nuevo: 0 de 0 no es novedad (④5)', () => {
    expect(unseenFrom(0, 0)).toBe(0)
  })
})

describe('persistencia del conteo visto', () => {
  it('guarda y relee el conteo bajo la key del usuario', async () => {
    await markAchievementsSeen(USER, 7)
    expect(store.get(achievementsSeenKey(USER))).toBe('7')
    expect(await readAchievementsSeen(USER)).toBe(7)
  })

  it('sin marca devuelve null (no 0): "no sé" no es "ninguno"', async () => {
    expect(await readAchievementsSeen(USER)).toBeNull()
  })

  it('un valor corrupto se lee como sin marca', async () => {
    store.set(achievementsSeenKey(USER), 'ocho')
    expect(await readAchievementsSeen(USER)).toBeNull()
  })

  it('cada usuario tiene su propia marca', async () => {
    await markAchievementsSeen(USER, 7)
    expect(await readAchievementsSeen('u2')).toBeNull()
  })
})
