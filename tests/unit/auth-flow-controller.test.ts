import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  configureAuthFlow,
  dispatchAuthFlow,
  getAuthFlowState,
  resetAuthFlowForTesting,
  type AuthFlowAdapters,
} from '@/features/auth-flow/auth-flow-controller'

function makeAdapters(overrides: Partial<AuthFlowAdapters> = {}): AuthFlowAdapters {
  return {
    runProbes: vi.fn(async () => ({
      hasSession: true, shouldUseBiometric: true, pinSet: false, hasSavedCredentials: true, isUnlocked: false, introSeen: true,
    })),
    promptBiometric: vi.fn(async () => ({ success: true as const })),
    prefetchSnapshot: vi.fn(async () => {}),
    confirmSession: vi.fn(async () => 'ok' as const),
    resolveDestinationRoute: vi.fn(async () => '/(app)/(tabs)/home'),
    navigate: vi.fn(),
    haptic: vi.fn(),
    markAppUnlocked: vi.fn(),
    resetAppLock: vi.fn(),
    schedule: vi.fn(() => () => {}),
    log: vi.fn(),
    ...overrides,
  }
}

// flush de microtasks para que los efectos async del driver terminen
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('auth-flow-controller', () => {
  beforeEach(() => resetAuthFlowForTesting())

  it('V1: BOOT → probes → prompt+prefetch en paralelo → navigate solo tras BRIDGE_OPAQUE', async () => {
    const adapters = makeAdapters()
    configureAuthFlow(adapters)
    dispatchAuthFlow({ type: 'BOOT' })
    await flush()
    expect(adapters.prefetchSnapshot).toHaveBeenCalled()
    expect(adapters.promptBiometric).toHaveBeenCalled()
    // promptBiometric success → FACE_ID_OK auto-dispatch → bridging
    expect(getAuthFlowState().phase).toBe('bridging')
    expect(adapters.navigate).not.toHaveBeenCalled() // invariante 1
    dispatchAuthFlow({ type: 'BRIDGE_OPAQUE' })
    await flush()
    expect(adapters.confirmSession).toHaveBeenCalled()
    expect(adapters.markAppUnlocked).toHaveBeenCalled()
    expect(adapters.navigate).toHaveBeenCalledWith('/(app)/(tabs)/home')
    // NAVIGATED auto-dispatch
    expect(getAuthFlowState()).toMatchObject({ phase: 'bridging', navigated: true })
  })

  it('V2: prompt cancel → fallback-login → navigate login', async () => {
    const adapters = makeAdapters({
      promptBiometric: vi.fn(async () => ({ success: false as const, error: 'user_cancel' })),
    })
    configureAuthFlow(adapters)
    dispatchAuthFlow({ type: 'BOOT' })
    await flush()
    expect(getAuthFlowState().phase).toBe('fallback-login')
    expect(adapters.navigate).toHaveBeenCalledWith('/(auth)/login')
  })

  it('sesión irrecuperable → SESSION_RESTORE_FAILED → login', async () => {
    const adapters = makeAdapters({
      confirmSession: vi.fn(async () => 'login-required' as const),
    })
    configureAuthFlow(adapters)
    dispatchAuthFlow({ type: 'BOOT' })
    await flush()
    dispatchAuthFlow({ type: 'BRIDGE_OPAQUE' })
    await flush()
    expect(getAuthFlowState().phase).toBe('fallback-login')
  })

  it('los timers agendados dispatchean su evento', async () => {
    const timerCallbacks: Record<string, () => void> = {}
    const adapters = makeAdapters({
      schedule: vi.fn((timer: string, _ms: number, cb: () => void) => {
        timerCallbacks[timer] = cb
        return () => delete timerCallbacks[timer]
      }),
    })
    configureAuthFlow(adapters)
    dispatchAuthFlow({ type: 'BOOT' })
    await flush()
    dispatchAuthFlow({ type: 'BRIDGE_OPAQUE' })
    await flush()
    dispatchAuthFlow({ type: 'DESTINATION_READY' })
    timerCallbacks['min-hold']!()
    expect(getAuthFlowState().phase).toBe('revealing')
    timerCallbacks['reveal-done']!()
    expect(getAuthFlowState().phase).toBe('ready')
  })

  it('timer starved (JS thread bloqueado): el próximo dispatch lo flushea por wall-clock', async () => {
    // schedule que NUNCA dispara su callback — simula setTimeout
    // encolado detrás de un JS thread bloqueado (Metro bundling).
    const adapters = makeAdapters({ schedule: vi.fn(() => () => {}) })
    configureAuthFlow(adapters)
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    try {
      dispatchAuthFlow({ type: 'BOOT' })
      await flush()
      dispatchAuthFlow({ type: 'BRIDGE_OPAQUE' })
      await flush()
      // El min-hold (550ms) venció hace rato por wall-clock…
      nowSpy.mockReturnValue(1_003_000)
      // …así que este dispatch lo adelanta y el reveal arranca ya.
      dispatchAuthFlow({ type: 'DESTINATION_READY' })
      expect(getAuthFlowState().phase).toBe('revealing')
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('prefetch que rechaza dispatchea LOAD_FAILED(network)', async () => {
    const adapters = makeAdapters({
      prefetchSnapshot: vi.fn(async () => { throw new Error('fetch failed') }),
    })
    configureAuthFlow(adapters)
    dispatchAuthFlow({ type: 'BOOT' })
    await flush()
    dispatchAuthFlow({ type: 'BRIDGE_OPAQUE' })
    await flush()
    expect(getAuthFlowState().phase).toBe('bridge-error')
  })

  it('subscribe notifica en cambios de estado', async () => {
    const adapters = makeAdapters()
    configureAuthFlow(adapters)
    const listener = vi.fn()
    const { subscribeAuthFlow } = await import('@/features/auth-flow/auth-flow-controller')
    const unsubscribe = subscribeAuthFlow(listener)
    dispatchAuthFlow({ type: 'BOOT' })
    expect(listener).toHaveBeenCalled()
    unsubscribe()
  })
})
