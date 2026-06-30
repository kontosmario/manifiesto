import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock se hoistea sobre los `const` → definimos los mocks con
// vi.hoisted para que estén disponibles dentro de las factories.
const {
  openSettings,
  getNotificationPermission,
  requestNotificationPermissions,
  setupPushNotifications,
  markPrimeDismissed,
  shouldPrimePermission,
} = vi.hoisted(() => ({
  openSettings: vi.fn(),
  getNotificationPermission: vi.fn(),
  requestNotificationPermissions: vi.fn(),
  setupPushNotifications: vi.fn(),
  markPrimeDismissed: vi.fn(),
  shouldPrimePermission: vi.fn(),
}))

// El stub de react-native no exporta Linking → lo mockeamos.
vi.mock('react-native', () => ({ Linking: { openSettings } }))
vi.mock('@/lib/runtime-environment', () => ({ canUseNativePushNotifications: true }))
vi.mock('@/lib/push-notifications', () => ({
  getNotificationPermission,
  requestNotificationPermissions,
  setupPushNotifications,
}))
vi.mock('@/lib/permission-prime-cooldown', () => ({
  markPrimeDismissed,
  shouldPrimePermission,
}))

import {
  applyPushPermissionAllow,
  applyPushPermissionDismiss,
  isPushPrimeEligible,
} from '@/features/push/push-permission-actions'

const UNDETERMINED = { status: 'undetermined', canAskAgain: true }
const HARD_DENIED = { status: 'denied', canAskAgain: false }

beforeEach(() => {
  vi.clearAllMocks()
  markPrimeDismissed.mockResolvedValue(undefined)
  setupPushNotifications.mockResolvedValue({ status: 'ok' })
  openSettings.mockResolvedValue(undefined)
})

describe('isPushPrimeEligible', () => {
  it('false cuando ya concedió el permiso (sin tocar el cooldown)', async () => {
    getNotificationPermission.mockResolvedValue({ status: 'granted', canAskAgain: true })
    expect(await isPushPrimeEligible()).toBe(false)
    expect(shouldPrimePermission).not.toHaveBeenCalled()
  })

  it('false cuando el build no soporta push (unsupported)', async () => {
    getNotificationPermission.mockResolvedValue({ status: 'unsupported', canAskAgain: false })
    expect(await isPushPrimeEligible()).toBe(false)
  })

  it('false cuando el cooldown está activo', async () => {
    getNotificationPermission.mockResolvedValue(UNDETERMINED)
    shouldPrimePermission.mockResolvedValue(false)
    expect(await isPushPrimeEligible()).toBe(false)
  })

  it('true cuando sin permiso + cooldown vencido', async () => {
    getNotificationPermission.mockResolvedValue({ status: 'denied', canAskAgain: true })
    shouldPrimePermission.mockResolvedValue(true)
    expect(await isPushPrimeEligible()).toBe(true)
  })

  it('fail-closed: si leer el estado tira error devuelve false (no propaga)', async () => {
    getNotificationPermission.mockRejectedValue(new Error('native boom'))
    await expect(isPushPrimeEligible()).resolves.toBe(false)
  })
})

describe('applyPushPermissionAllow', () => {
  it('hard-deny previo → abre Ajustes y NO vuelve a pedir el prompt', async () => {
    getNotificationPermission.mockResolvedValue(HARD_DENIED)
    await applyPushPermissionAllow({ userId: 'u1', familyId: 'f1' })
    expect(openSettings).toHaveBeenCalledTimes(1)
    expect(requestNotificationPermissions).not.toHaveBeenCalled()
    expect(markPrimeDismissed).toHaveBeenCalledWith('notifications')
  })

  it('concede → registra el token y NO abre Ajustes; marca cooldown tras la respuesta', async () => {
    getNotificationPermission.mockResolvedValue(UNDETERMINED)
    requestNotificationPermissions.mockResolvedValue({ granted: true, canAskAgain: true })
    await applyPushPermissionAllow({ userId: 'u1', familyId: 'f1' })
    expect(setupPushNotifications).toHaveBeenCalledWith({ userId: 'u1', familyId: 'f1' })
    expect(openSettings).not.toHaveBeenCalled()
    expect(markPrimeDismissed).toHaveBeenCalledWith('notifications')
  })

  it('deny FRESCO (recién prompteado) NO abre Ajustes, pero marca cooldown', async () => {
    getNotificationPermission.mockResolvedValue(UNDETERMINED)
    requestNotificationPermissions.mockResolvedValue({ granted: false, canAskAgain: false })
    await applyPushPermissionAllow({ userId: 'u1', familyId: 'f1' })
    expect(openSettings).not.toHaveBeenCalled()
    expect(setupPushNotifications).not.toHaveBeenCalled()
    expect(markPrimeDismissed).toHaveBeenCalledWith('notifications')
  })

  it('concede pero falta familyId → NO registra', async () => {
    getNotificationPermission.mockResolvedValue(UNDETERMINED)
    requestNotificationPermissions.mockResolvedValue({ granted: true, canAskAgain: true })
    await applyPushPermissionAllow({ userId: 'u1', familyId: null })
    expect(setupPushNotifications).not.toHaveBeenCalled()
  })

  it('si el prompt nativo tira error → NO marca cooldown (re-pregunta) y no propaga', async () => {
    getNotificationPermission.mockResolvedValue(UNDETERMINED)
    requestNotificationPermissions.mockRejectedValue(new Error('boom'))
    await expect(
      applyPushPermissionAllow({ userId: 'u1', familyId: 'f1' }),
    ).resolves.toBeUndefined()
    expect(markPrimeDismissed).not.toHaveBeenCalled()
  })

  it('si leer el estado tira error → no propaga', async () => {
    getNotificationPermission.mockRejectedValue(new Error('native boom'))
    await expect(
      applyPushPermissionAllow({ userId: 'u1', familyId: 'f1' }),
    ).resolves.toBeUndefined()
  })

  it('denied PERO canAskAgain=true → re-pregunta (no es hard-deny)', async () => {
    getNotificationPermission.mockResolvedValue({ status: 'denied', canAskAgain: true })
    requestNotificationPermissions.mockResolvedValue({ granted: true, canAskAgain: true })
    await applyPushPermissionAllow({ userId: 'u1', familyId: 'f1' })
    expect(requestNotificationPermissions).toHaveBeenCalledTimes(1)
    expect(openSettings).not.toHaveBeenCalled()
    expect(setupPushNotifications).toHaveBeenCalledWith({ userId: 'u1', familyId: 'f1' })
  })

  it('concede pero el registro del token falla → no propaga y el cooldown queda marcado', async () => {
    getNotificationPermission.mockResolvedValue(UNDETERMINED)
    requestNotificationPermissions.mockResolvedValue({ granted: true, canAskAgain: true })
    setupPushNotifications.mockRejectedValue(new Error('network down'))
    await expect(
      applyPushPermissionAllow({ userId: 'u1', familyId: 'f1' }),
    ).resolves.toBeUndefined()
    expect(markPrimeDismissed).toHaveBeenCalledWith('notifications')
  })

  it('si abrir Ajustes falla en hard-deny → no propaga', async () => {
    getNotificationPermission.mockResolvedValue(HARD_DENIED)
    openSettings.mockRejectedValue(new Error('cannot open settings'))
    await expect(
      applyPushPermissionAllow({ userId: 'u1', familyId: 'f1' }),
    ).resolves.toBeUndefined()
  })
})

describe('applyPushPermissionDismiss', () => {
  it('marca el cooldown de notificaciones', async () => {
    await applyPushPermissionDismiss()
    expect(markPrimeDismissed).toHaveBeenCalledWith('notifications')
  })

  it('no propaga si la escritura del cooldown falla', async () => {
    markPrimeDismissed.mockRejectedValue(new Error('securestore down'))
    await expect(applyPushPermissionDismiss()).resolves.toBeUndefined()
  })
})
