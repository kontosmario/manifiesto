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
  claimWeekCloseAutoShow,
  markWeekCloseSeen,
  weekCloseSeenKey,
  weekCloseShownKey,
} from '@/features/garden/use-week-close-seen'

const USER = 'u1'
const WEEK = '2026-08-03' // lunes de la semana cerrada
const NEXT_WEEK = '2026-08-10'

beforeEach(() => store.clear())

describe('claimWeekCloseAutoShow (el 1×/semana del bridge)', () => {
  it('la primera vez devuelve true y deja la marca de "shown"', async () => {
    expect(await claimWeekCloseAutoShow(USER, WEEK)).toBe(true)
    expect(store.get(weekCloseShownKey(USER))).toBe(WEEK)
  })

  it('la segunda vez de la MISMA semana devuelve false', async () => {
    await claimWeekCloseAutoShow(USER, WEEK)
    expect(await claimWeekCloseAutoShow(USER, WEEK)).toBe(false)
  })

  it('la semana siguiente vuelve a disparar', async () => {
    await claimWeekCloseAutoShow(USER, WEEK)
    expect(await claimWeekCloseAutoShow(USER, NEXT_WEEK)).toBe(true)
  })

  it('NO escribe el "visto": el auto-disparo no es haberlo visto', async () => {
    await claimWeekCloseAutoShow(USER, WEEK)
    expect(store.has(weekCloseSeenKey(USER))).toBe(false)
  })

  it('migración del contrato viejo: si la key legacy de "visto" ya tiene esta semana, no se re-dispara', async () => {
    // El bridge viejo escribía `seen` ANTES de mostrar: para esos usuarios el
    // auto-disparo de esta semana YA ocurrió.
    store.set(weekCloseSeenKey(USER), WEEK)
    expect(await claimWeekCloseAutoShow(USER, WEEK)).toBe(false)
    // y queda trasladada, para no volver a consultar la legacy.
    expect(store.get(weekCloseShownKey(USER))).toBe(WEEK)
  })

  it('la key legacy de una semana ANTERIOR no bloquea el disparo de la nueva', async () => {
    store.set(weekCloseSeenKey(USER), WEEK)
    expect(await claimWeekCloseAutoShow(USER, NEXT_WEEK)).toBe(true)
  })

  it('cada usuario tiene su propia marca', async () => {
    await claimWeekCloseAutoShow(USER, WEEK)
    expect(await claimWeekCloseAutoShow('u2', WEEK)).toBe(true)
  })
})

describe('markWeekCloseSeen', () => {
  it('guarda el id de la semana bajo la key de "visto"', async () => {
    await markWeekCloseSeen(USER, WEEK)
    expect(store.get(weekCloseSeenKey(USER))).toBe(WEEK)
    // Y no toca la del auto-disparo: son dos marcas independientes.
    expect(store.has(weekCloseShownKey(USER))).toBe(false)
  })
})
