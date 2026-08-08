// El flag "capturar pagos de Apple Pay" vive en el keychain, pero el App
// Intent corre en background —sin JS vivo— y sólo puede leer `UserDefaults`.
// Estos tests fijan el espejo: el store tiene que bajar el valor al nativo
// tanto al hidratar (cada arranque) como al tocar el switch. Sin eso Swift
// guardaba la captura y mandaba la notificación con la feature APAGADA, y
// nadie la drenaba porque el host de JS no se monta.

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

// El módulo nativo no existe bajo node: se stubea entero para poder
// espiar `setCaptureEnabled`, que es el puente que se está probando.
vi.mock('@/features/apple-pay-capture/native', () => ({
  isApplePayCaptureSupported: vi.fn(() => true),
  getPendingCaptures: vi.fn(() => []),
  clearCaptures: vi.fn(),
  setNotificationCopy: vi.fn(),
  setCaptureEnabled: vi.fn(),
}))

const KEY = 'apple_pay_capture_enabled'

// El store guarda estado a nivel módulo (snapshot + memo de hidratación),
// así que cada test arranca con el registro limpio.
async function loadStore() {
  const store = await import('@/features/apple-pay-capture/apple-pay-enabled-store')
  const { setCaptureEnabled } = await import('@/features/apple-pay-capture/native')
  return { store, setCaptureEnabled: vi.mocked(setCaptureEnabled) }
}

beforeEach(() => {
  keychain.clear()
  // `resetModules` limpia el registro de módulos pero NO las factories de
  // `vi.mock`: los espías son los mismos objetos toda la corrida y sin
  // esto las llamadas se acumulan entre tests.
  vi.clearAllMocks()
  vi.resetModules()
})

describe('apple-pay-enabled-store', () => {
  it('al hidratar con el flag prendido baja `true` al nativo', async () => {
    keychain.set(KEY, '1')
    const { store, setCaptureEnabled } = await loadStore()

    await store.hydrateApplePayCaptureEnabled()

    expect(setCaptureEnabled).toHaveBeenCalledWith(true)
  })

  it('al hidratar con el flag apagado baja `false` al nativo', async () => {
    keychain.set(KEY, '0')
    const { store, setCaptureEnabled } = await loadStore()

    await store.hydrateApplePayCaptureEnabled()

    expect(setCaptureEnabled).toHaveBeenCalledWith(false)
  })

  it('sin nada persistido baja `false` — instalación nueva arranca apagada', async () => {
    const { store, setCaptureEnabled } = await loadStore()

    await store.hydrateApplePayCaptureEnabled()

    expect(setCaptureEnabled).toHaveBeenCalledWith(false)
  })

  it('la hidratación es una sola por sesión aunque la llamen varios consumidores', async () => {
    keychain.set(KEY, '1')
    const { store, setCaptureEnabled } = await loadStore()

    await Promise.all([
      store.hydrateApplePayCaptureEnabled(),
      store.hydrateApplePayCaptureEnabled(),
      store.hydrateApplePayCaptureEnabled(),
    ])

    expect(setCaptureEnabled).toHaveBeenCalledTimes(1)
  })

  it('prender el switch avisa al nativo y persiste en el keychain', async () => {
    const { store, setCaptureEnabled } = await loadStore()

    store.setApplePayCaptureEnabled(true)

    expect(setCaptureEnabled).toHaveBeenCalledWith(true)
    // La escritura del keychain es fire-and-forget: se deja correr la
    // microtask antes de mirarla.
    await Promise.resolve()
    expect(keychain.get(KEY)).toBe('1')
  })

  it('apagar el switch avisa al nativo y persiste en el keychain', async () => {
    keychain.set(KEY, '1')
    const { store, setCaptureEnabled } = await loadStore()

    store.setApplePayCaptureEnabled(false)

    expect(setCaptureEnabled).toHaveBeenCalledWith(false)
    await Promise.resolve()
    expect(keychain.get(KEY)).toBe('0')
  })

  it('cada cambio del switch llega al nativo, no sólo el primero', async () => {
    const { store, setCaptureEnabled } = await loadStore()

    store.setApplePayCaptureEnabled(true)
    store.setApplePayCaptureEnabled(false)
    store.setApplePayCaptureEnabled(true)

    expect(setCaptureEnabled.mock.calls.map(([enabled]) => enabled)).toEqual([
      true,
      false,
      true,
    ])
  })
})
