// El bloque "¿Está funcionando?" de Ajustes es la única forma que tiene el
// usuario de saber si su automatización de Atajos quedó bien armada: si no
// ve un pago suyo ahí, la configuración falló en silencio. Estos tests
// fijan las tres propiedades de las que depende esa lectura:
//
//  · se guarda la captura RECIBIDA, no la registrada (el bloque responde
//    "¿llega el dato?", no "¿lo confirmaste?");
//  · el registro es MONÓTONO, porque una captura sin resolver se re-ofrece
//    en cada vuelta a foreground y haría retroceder la pantalla a un pago
//    viejo justo después de pagar;
//  · lo que vuelve del keychain se valida, porque es texto plano.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const keychain = new Map<string, string>()

vi.mock('@/lib/persistent-kv', () => ({
  getPersistentValue: vi.fn(async (key: string) => keychain.get(key) ?? null),
  setPersistentValue: vi.fn(async (key: string, value: string) => {
    keychain.set(key, value)
  }),
  deletePersistentValue: vi.fn(async (key: string) => {
    keychain.delete(key)
  }),
}))

const KEY = 'apple_pay_last_capture'

function capture(id: string, capturedAt: string, merchantRaw = 'Merpago*job', amountRaw = '$ 8.160,00') {
  return { id, capturedAt, merchantRaw, amountRaw }
}

// El store guarda estado a nivel módulo (snapshot + memo de hidratación),
// así que cada test lo carga de cero.
async function loadStore() {
  return import('@/features/apple-pay-capture/apple-pay-last-capture-store')
}

/** `recordApplePayCaptures` es fire-and-forget encadenado a la hidratación. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  keychain.clear()
  vi.clearAllMocks()
  vi.resetModules()
})

describe('apple-pay-last-capture-store', () => {
  it('hidratar sin nada persistido no inventa un recibo ni escribe', async () => {
    const store = await loadStore()

    await store.hydrateApplePayLastCapture()
    await settle()
    expect(keychain.get(KEY)).toBeUndefined()

    // Y sin recibo previo cualquier captura entra, por vieja que sea.
    store.recordApplePayCaptures([
      capture('vieja', '2020-01-01T10:00:00.000Z', 'Starbucks', '$ 4.400,00'),
    ])
    await settle()
    expect(JSON.parse(keychain.get(KEY) ?? 'null').merchantRaw).toBe('Starbucks')
  })

  it('guarda la captura recibida con comercio, monto y fecha', async () => {
    const store = await loadStore()

    store.recordApplePayCaptures([capture('a', '2026-08-08T15:00:00.000Z')])
    await settle()

    expect(JSON.parse(keychain.get(KEY) ?? 'null')).toEqual({
      capturedAt: '2026-08-08T15:00:00.000Z',
      merchantRaw: 'Merpago*job',
      amountRaw: '$ 8.160,00',
    })
  })

  it('de una tanda con varias se queda con la MÁS RECIENTE', async () => {
    const store = await loadStore()

    store.recordApplePayCaptures([
      capture('vieja', '2026-08-08T10:00:00.000Z', 'Starbucks', '$ 4.400,00'),
      capture('nueva', '2026-08-08T15:00:00.000Z'),
      capture('media', '2026-08-08T12:00:00.000Z', 'Kiosco', '$ 900'),
    ])
    await settle()

    const stored = JSON.parse(keychain.get(KEY) ?? 'null')
    expect(stored.merchantRaw).toBe('Merpago*job')
    expect(stored.capturedAt).toBe('2026-08-08T15:00:00.000Z')
  })

  it('una tanda posterior con una captura VIEJA no pisa a la nueva', async () => {
    const store = await loadStore()

    store.recordApplePayCaptures([capture('nueva', '2026-08-08T15:00:00.000Z')])
    await settle()
    // La vieja seguía pendiente porque el usuario nunca la resolvió: el
    // gate se la vuelve a entregar al host en la próxima vuelta a
    // foreground, ya sola.
    store.recordApplePayCaptures([
      capture('vieja', '2026-08-06T10:00:00.000Z', 'Starbucks', '$ 4.400,00'),
    ])
    await settle()

    expect(JSON.parse(keychain.get(KEY) ?? 'null').merchantRaw).toBe('Merpago*job')
  })

  it('una captura más nueva sí reemplaza a la anterior', async () => {
    const store = await loadStore()

    store.recordApplePayCaptures([capture('vieja', '2026-08-06T10:00:00.000Z')])
    await settle()
    store.recordApplePayCaptures([
      capture('nueva', '2026-08-08T15:00:00.000Z', 'Kiosco', '$ 900'),
    ])
    await settle()

    expect(JSON.parse(keychain.get(KEY) ?? 'null').merchantRaw).toBe('Kiosco')
  })

  it('una tanda vacía no escribe nada', async () => {
    const store = await loadStore()

    store.recordApplePayCaptures([])
    await settle()

    expect(keychain.get(KEY)).toBeUndefined()
  })

  it('compara contra lo YA persistido aunque nadie haya hidratado antes', async () => {
    keychain.set(
      KEY,
      JSON.stringify({
        capturedAt: '2026-08-08T15:00:00.000Z',
        merchantRaw: 'Merpago*job',
        amountRaw: '$ 8.160,00',
      }),
    )
    const store = await loadStore()

    store.recordApplePayCaptures([
      capture('vieja', '2026-08-06T10:00:00.000Z', 'Starbucks', '$ 4.400,00'),
    ])
    await settle()

    expect(JSON.parse(keychain.get(KEY) ?? 'null').merchantRaw).toBe('Merpago*job')
  })

  it('un valor corrupto en el keychain se ignora en vez de romper', async () => {
    keychain.set(KEY, 'no-es-json')
    const store = await loadStore()

    await store.hydrateApplePayLastCapture()
    store.recordApplePayCaptures([capture('a', '2026-08-08T15:00:00.000Z')])
    await settle()

    expect(JSON.parse(keychain.get(KEY) ?? 'null').merchantRaw).toBe('Merpago*job')
  })

  it('un JSON con el shape equivocado se ignora', async () => {
    keychain.set(KEY, JSON.stringify({ capturedAt: 42 }))
    const store = await loadStore()

    store.recordApplePayCaptures([
      capture('vieja', '2026-08-06T10:00:00.000Z', 'Starbucks', '$ 4.400,00'),
    ])
    await settle()

    // Sin captura válida previa, hasta la vieja sirve de recibo.
    expect(JSON.parse(keychain.get(KEY) ?? 'null').merchantRaw).toBe('Starbucks')
  })

  it('una fecha ilegible sirve de recibo, pero pierde contra una válida', async () => {
    const store = await loadStore()

    store.recordApplePayCaptures([capture('rota', 'no-es-fecha', 'Starbucks', '$ 4.400,00')])
    await settle()
    expect(JSON.parse(keychain.get(KEY) ?? 'null').merchantRaw).toBe('Starbucks')

    store.recordApplePayCaptures([capture('buena', '2026-08-06T10:00:00.000Z')])
    await settle()
    expect(JSON.parse(keychain.get(KEY) ?? 'null').merchantRaw).toBe('Merpago*job')
  })
})
