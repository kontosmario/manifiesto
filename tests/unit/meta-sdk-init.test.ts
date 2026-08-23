import { describe, expect, it, vi } from 'vitest'

import {
  createMetaSdkInitializer,
  runMetaSdkInit,
  type MetaSdkEnv,
  type MetaSdkIo,
} from '@/features/attribution/meta-sdk-init'

type Overrides = Partial<MetaSdkIo> & { status?: string }

function makeIo(overrides: Overrides = {}) {
  const calls: string[] = []
  const { status = 'granted', ...rest } = overrides
  const io: MetaSdkIo = {
    waitForActiveApp: vi.fn(async () => {
      calls.push('waitForActiveApp')
    }),
    requestTrackingPermission: vi.fn(async () => {
      calls.push('requestTrackingPermission')
      return { status }
    }),
    initializeSDK: vi.fn(() => {
      calls.push('initializeSDK')
    }),
    setAdvertiserTrackingEnabled: vi.fn(async (enabled: boolean) => {
      calls.push(`setAdvertiserTrackingEnabled:${enabled}`)
      return true
    }),
    setAutoLogAppEventsEnabled: vi.fn((enabled: boolean) => {
      calls.push(`setAutoLogAppEventsEnabled:${enabled}`)
    }),
    onError: vi.fn(),
    ...rest,
  }
  return { io, calls }
}

const IOS: MetaSdkEnv = { platform: 'ios', isExpoGo: false }
const ANDROID: MetaSdkEnv = { platform: 'android', isExpoGo: false }

describe('runMetaSdkInit — política de arranque del SDK de Meta', () => {
  it('en web no toca nada: el SDK no existe ahí', async () => {
    const { io, calls } = makeIo()
    const result = await runMetaSdkInit(io, { platform: 'web', isExpoGo: false })
    expect(result).toEqual({ outcome: 'skipped', reason: 'web' })
    expect(calls).toEqual([])
  })

  it('en Expo Go no toca nada: el módulo nativo no está linkeado', async () => {
    const { io, calls } = makeIo()
    const result = await runMetaSdkInit(io, { platform: 'ios', isExpoGo: true })
    expect(result).toEqual({ outcome: 'skipped', reason: 'expo-go' })
    expect(calls).toEqual([])
  })

  it('iOS con ATT concedido: espera foreground → pide ATT → init → ATE=true → autolog', async () => {
    const { io, calls } = makeIo({ status: 'granted' })
    const result = await runMetaSdkInit(io, IOS)
    expect(calls).toEqual([
      'waitForActiveApp',
      'requestTrackingPermission',
      'initializeSDK',
      'setAdvertiserTrackingEnabled:true',
      'setAutoLogAppEventsEnabled:true',
    ])
    expect(result).toEqual({
      outcome: 'initialized',
      trackingStatus: 'granted',
      advertiserTrackingEnabled: true,
    })
  })

  it('iOS con ATT denegado: el SDK igual arranca (SKAdNetwork no necesita IDFA) con ATE=false', async () => {
    const { io, calls } = makeIo({ status: 'denied' })
    const result = await runMetaSdkInit(io, IOS)
    expect(calls).toContain('initializeSDK')
    expect(calls).toContain('setAdvertiserTrackingEnabled:false')
    expect(calls).toContain('setAutoLogAppEventsEnabled:true')
    expect(result).toEqual({
      outcome: 'initialized',
      trackingStatus: 'denied',
      advertiserTrackingEnabled: false,
    })
  })

  it('Android corre el mismo flujo (expo devuelve granted sin prompt)', async () => {
    const { io, calls } = makeIo()
    const result = await runMetaSdkInit(io, ANDROID)
    expect(calls).toContain('initializeSDK')
    expect(result.outcome).toBe('initialized')
  })

  it('si el pedido de ATT falla, se trata como NO concedido y el SDK arranca igual', async () => {
    const { io, calls } = makeIo({
      requestTrackingPermission: vi.fn(async () => {
        throw new Error('ATT unavailable')
      }),
    })
    const result = await runMetaSdkInit(io, IOS)
    expect(calls).toEqual([
      'waitForActiveApp',
      'initializeSDK',
      'setAdvertiserTrackingEnabled:false',
      'setAutoLogAppEventsEnabled:true',
    ])
    expect(result).toEqual({
      outcome: 'initialized',
      trackingStatus: 'unavailable',
      advertiserTrackingEnabled: false,
    })
    expect(io.onError).toHaveBeenCalledTimes(1)
  })

  it('si el SDK nativo explota, NUNCA propaga: reporta y devuelve failed', async () => {
    const boom = new Error('FBSettings is null')
    const { io } = makeIo({
      initializeSDK: vi.fn(() => {
        throw boom
      }),
    })
    const result = await runMetaSdkInit(io, IOS)
    expect(result).toEqual({ outcome: 'failed', error: boom })
    expect(io.onError).toHaveBeenCalledWith(boom)
    expect(io.setAutoLogAppEventsEnabled).not.toHaveBeenCalled()
  })
})

describe('createMetaSdkInitializer — una sola vez por runtime', () => {
  it('dos llamadas (remount, StrictMode, hot reload) ejecutan la IO UNA vez y comparten el resultado', async () => {
    const { io } = makeIo()
    const init = createMetaSdkInitializer(io, IOS)
    const [a, b] = await Promise.all([init(), init()])
    const c = await init()
    expect(io.requestTrackingPermission).toHaveBeenCalledTimes(1)
    expect(io.initializeSDK).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    expect(a).toBe(c)
  })

  it('un runtime que saltea (web) también queda memoizado sin reintentar', async () => {
    const { io } = makeIo()
    const init = createMetaSdkInitializer(io, { platform: 'web', isExpoGo: false })
    await init()
    await init()
    expect(io.waitForActiveApp).not.toHaveBeenCalled()
  })
})
