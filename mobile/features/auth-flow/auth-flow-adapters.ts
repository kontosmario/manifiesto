// Adapters REALES del driver. Reúnen el IO que antes vivía repartido
// en AppEntryGate / UnlockScreen / login controllers. El slow-path de
// restauración de sesión preserva la decisión documentada: NO borrar
// credenciales cuando el refresh token expiró (solo logout explícito).

import { router } from 'expo-router'
import { isExpoGo } from '@/lib/runtime-environment'
import { authFlowLog } from '@/lib/auth-flow-logger'
import i18n from '@/lib/i18n'
import { queryClient } from '@/lib/query-client'
import { supabase } from '@/lib/supabase'
import { triggerHaptic } from '@/lib/haptics'
import {
  authenticateBiometricAccess,
  clearBiometricCredentials,
  getBiometricCredentials,
  getBiometricLoginState,
  updateStoredRefreshToken,
} from '@/lib/biometric-auth'
import { getPinLockState } from '@/lib/pin-lock'
import { isAppUnlocked, markAppUnlocked, resetAppLock } from '@/features/auth/app-lock-state'
import { getBiometricSetupShown } from '@/features/auth/biometric-setup-flag'
import { getIntroSeen } from '@/features/onboarding-intro/intro-seen'
import { shouldShowBiometricSetup } from '@/features/auth/should-show-biometric-setup'
import { prefetchHomeSnapshot } from '@/features/home/use-home-snapshot'
import { profileQueryKey, type Profile } from '@/features/profile/use-profile'
import { familyQueryKey, type FamilyInfo } from '@/features/family/use-family'
import { resolveDestination } from '@/features/auth-flow/resolve-destination'
import type { AuthFlowAdapters } from '@/features/auth-flow/auth-flow-controller'

async function getSessionUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export const realAuthFlowAdapters: AuthFlowAdapters = {
  async runProbes() {
    const [{ data }, bio, pin, introSeen] = await Promise.all([
      supabase.auth.getSession(),
      getBiometricLoginState(),
      getPinLockState(),
      getIntroSeen(),
    ])
    // EXPO GO: el "prompt biométrico" degrada a la sheet de passcode
    // del sistema (el host no tiene NSFaceIDUsageDescription). Lo
    // dejamos ACTIVO a pedido del owner (2026-06-11): el viaje de
    // unlock comparte el mismo código que el build real, así que
    // probarlo en Expo Go (aunque la sheet sea fea) ejercita las mismas
    // invariantes — p.ej. la soberanía del cold-start splash.
    if (isExpoGo && bio.isAvailable && bio.hasSavedCredentials) {
      authFlowLog(
        'adapter',
        'Expo Go: el prompt biométrico será la sheet de passcode del sistema (Face ID real solo en dev-client/EAS)',
      )
    }
    return {
      hasSession: Boolean(data.session),
      shouldUseBiometric: bio.isAvailable && bio.hasSavedCredentials,
      pinSet: pin.isSet,
      hasSavedCredentials: bio.hasSavedCredentials,
      isUnlocked: isAppUnlocked(),
      introSeen,
    }
  },

  async promptBiometric() {
    authFlowLog('adapter', 'promptBiometric → mostrando prompt')
    const result = await authenticateBiometricAccess({
      promptMessage: i18n.t('auth:biometric.unlockPrompt'),
      disableDeviceFallback: true,
    })
    authFlowLog('adapter', 'promptBiometric resolvió', {
      success: result.success,
      ...(result.success ? {} : { error: result.error }),
    })
    return result.success ? { success: true } : { success: false, error: result.error }
  },

  async prefetchSnapshot() {
    const startedAt = Date.now()
    const userId = await getSessionUserId()
    if (!userId) {
      authFlowLog('adapter', 'prefetchSnapshot SKIP (sin userId)')
      return
    }
    authFlowLog('adapter', 'prefetchSnapshot start')
    await prefetchHomeSnapshot(queryClient, userId)
    authFlowLog('adapter', 'prefetchSnapshot done', { ms: Date.now() - startedAt })
  },

  async confirmSession() {
    // FAST PATH (99%): sesión activa en el cliente (auto-refresh corrió
    // en background). NO llamar refreshSession aquí — el token del
    // Keychain puede estar invalidated por una rotación previa.
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      authFlowLog('adapter', 'confirmSession ok (fast path)')
      return 'ok'
    }
    authFlowLog('adapter', 'confirmSession SLOW PATH (sin sesión activa)')
    // SLOW PATH: restaurar desde el refresh token del Keychain (app
    // killed por iOS, auto-refresh falló, storage limpio).
    const credentials = await getBiometricCredentials()
    if (!credentials) {
      // Keychain inconsistente: limpiar para que el login re-arme.
      await clearBiometricCredentials()
      return 'login-required'
    }
    const refresh = await supabase.auth.refreshSession({
      refresh_token: credentials.refreshToken,
    })
    if (refresh.error || !refresh.data.session) {
      // Token expirado/revocado: NO limpiar creds (el login con password
      // las re-arma solo — ver use-auth-biometric-controller).
      return 'login-required'
    }
    // Supabase rota el refresh token en cada refresh exitoso.
    const nextToken = refresh.data.session.refresh_token
    if (nextToken && nextToken !== credentials.refreshToken) {
      await updateStoredRefreshToken(nextToken)
    }
    return 'ok'
  },

  async resolveDestinationRoute() {
    const userId = await getSessionUserId()
    if (!userId) return '/(auth)/welcome'
    // Los caches fueron sembrados por el prefetch del snapshot.
    const profile = queryClient.getQueryData<Profile | null>(profileQueryKey(userId)) ?? null
    const family = queryClient.getQueryData<FamilyInfo | null>(familyQueryKey(userId)) ?? null
    const onboardingCompletedAt = profile?.onboarding_completed_at ?? null
    let showBiometricSetup = false
    if (!onboardingCompletedAt) {
      const shown = await getBiometricSetupShown(userId)
      showBiometricSetup = shouldShowBiometricSetup({
        sessionUserId: userId,
        onboardingCompletedAt,
        biometricSetupShown: shown,
        biometricSetupFlagLoaded: true,
      })
    }
    return resolveDestination({
      onboardingCompletedAt,
      hasFamily: Boolean(family),
      showBiometricSetup,
    })
  },

  navigate(to) {
    authFlowLog('adapter', `navigate → ${to}`)
    router.replace(to as never)
  },

  haptic(feedback) {
    void triggerHaptic(feedback)
  },

  markAppUnlocked,
  resetAppLock,

  schedule(_timer, ms, cb) {
    const id = setTimeout(cb, ms)
    return () => clearTimeout(id)
  },

  log(message, extra) {
    authFlowLog('machine', message, extra)
  },
}
