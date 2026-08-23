import { useCallback, useEffect, useState } from 'react'
import * as LocalAuthentication from 'expo-local-authentication'
import { Redirect, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  Auth4cFaceId,
  type BiometricSensor,
} from '@/components/redesign/auth/auth-4c-faceid'
import { AuthLiveChrome, AuthScreenShell } from '@/components/redesign/auth/auth-kit'
import { PermissionPrimeSheet } from '@/components/permissions/permission-prime-sheet'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  activateBiometricForSession,
  type ActivateBiometricResult,
} from '@/features/auth/activate-biometric-for-session'
import { markBiometricSetupShown } from '@/features/auth/biometric-setup-flag'
import {
  getBiometricLoginState,
  resolveBiometricSensor,
  type BiometricLoginState,
} from '@/lib/biometric-auth'
import { triggerHaptic } from '@/lib/haptics'
import {
  markPrimeDismissed,
  shouldPrimePermission,
} from '@/lib/permission-prime-cooldown'
import { useThemeMode } from '@/theme/theme-provider'

/**
 * Activa Face ID LIVE del rediseño (Turno 4 · cableado 2026-07-17):
 * monta la réplica aprobada 4c con el chrome real (AuthLiveChrome) y la
 * MISMA lógica que la BiometricSetupScreen anterior:
 *
 *   - Modo A (`isAvailable=true`): Activar {label} / Usar un PIN / Ahora no
 *   - Modo B (`isAvailable=false`): candado + Crear un PIN / Ahora no
 *     (derivado de 4c vía `available=false` — la réplica solo dibuja A)
 *
 * CUALQUIER salida (activar OK, cancelado, "Ahora no", "Más tarde" del
 * priming) marca el flag per-user y hace replace a /(app)/onboarding;
 * "Usar un PIN" marca el flag y pasa por /(app)/pin-setup?next=onboarding.
 * El flag se marca incluso si el prompt falla — el usuario ya tomó la
 * decisión consciente de intentar. Igual que la real, un fallo NO
 * muestra error: háptico de warning y avanza (la activación se puede
 * retomar desde Ajustes → Seguridad).
 *
 * Session check manual (NO RequireAuth), como la real: RequireAuth
 * redirige a /(app)/onboarding cuando el onboarding está incompleto —
 * que es exactamente el usuario que cae acá, y loopearía.
 *
 * El priming (PermissionPrimeSheet + cooldown) se conserva EXACTO: el
 * sheet actual no está rediseñado y se reusa tal cual.
 */
export function NeoBiometricSetupScreen() {
  const { t } = useTranslation()
  const sessionQuery = useAuthSession()
  const session = sessionQuery.data ?? null
  const userId = session?.user.id
  // El email para activateBiometricForSession sale de la sesión (mismo
  // origen que la real); vacío → el activador devuelve 'unavailable'.
  const email = session?.user.email ?? ''

  if (sessionQuery.isLoading) {
    return <BlockingScreenView message={t('auth:biometricSetup.preparing')} />
  }

  if (!session || !userId) {
    return <Redirect href="/(auth)/welcome" />
  }

  return <NeoBiometricSetupBody userId={userId} email={email} />
}

/**
 * getBiometricLoginState resuelve el LABEL del sensor pero no expone el
 * TIPO — y la réplica 4c también quiere el ícono correcto (face vs
 * huella). Misma precedencia que resolveBiometricLabel
 * (lib/biometric-auth.ts): facial primero, después huella;
 * iris/desconocido caen en 'generic'.
 */
async function resolveBiometricSensorFromDevice(): Promise<BiometricSensor> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync()
    // Precedencia compartida con lib/biometric-auth (auditoría
    // 2026-08-21): en Android la huella gana aunque el hardware también
    // reporte face-unlock — acá la versión local priorizaba facial y un
    // S9+ mostraba cara en el setup mientras el usuario activaba huella.
    return resolveBiometricSensor(types)
  } catch {
    // Probe fallido → ícono genérico (el label ya degradó por su lado).
    return 'generic'
  }
}

function NeoBiometricSetupBody({
  userId,
  email,
}: {
  userId: string
  email: string
}) {
  const router = useRouter()
  const mode = useThemeMode().resolvedMode

  const [biometric, setBiometric] = useState<BiometricLoginState | null>(null)
  const [sensor, setSensor] = useState<BiometricSensor>('face')
  const [isWorking, setWorking] = useState(false)
  // Priming sheet — pre-prompt antes del modal nativo de biometric.
  // Si el cooldown ya expiró (o nunca se mostró), arrancamos en true
  // cuando el user tapea "Activar". Si el cooldown está activo
  // (dismissed hace <7d), saltamos directo al prompt nativo.
  const [primeVisible, setPrimeVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([getBiometricLoginState(), resolveBiometricSensorFromDevice()]).then(
      ([state, sensorType]) => {
        if (cancelled) return
        setSensor(sensorType)
        setBiometric(state)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const advanceToOnboarding = useCallback(async () => {
    await markBiometricSetupShown(userId)
    router.replace('/(app)/onboarding')
  }, [router, userId])

  // Llamada "real" al activador biometric. Separada de `handleActivate`
  // para poder dispararla tanto desde el botón directo (cooldown
  // activo, sin priming) como desde el "Permitir" del priming sheet.
  // Los hápticos de RESULTADO son de la pantalla (el 'selection' del
  // press ya lo puso AuthCta).
  const runActivateFlow = useCallback(async () => {
    if (isWorking) return
    setWorking(true)
    try {
      const result: ActivateBiometricResult = await activateBiometricForSession(email)
      if (result === 'activated') {
        void triggerHaptic('success')
      } else if (result === 'cancelled') {
        void triggerHaptic('warning')
      }
      await advanceToOnboarding()
    } finally {
      setWorking(false)
    }
  }, [advanceToOnboarding, email, isWorking])

  const handleActivate = useCallback(async () => {
    if (isWorking) return
    // Si todavía no le mostramos el priming (o pasaron 7d desde que
    // tapeó "Más tarde"), abrimos el sheet primero. El prompt nativo
    // solo se dispara cuando el user tap "Permitir" en nuestro sheet.
    const shouldPrime = await shouldPrimePermission('biometric')
    if (shouldPrime) {
      setPrimeVisible(true)
      return
    }
    await runActivateFlow()
  }, [isWorking, runActivateFlow])

  const handlePrimeAllow = useCallback(async () => {
    setPrimeVisible(false)
    // No marcamos cooldown — el user dijo SI a nuestro sheet, queda en
    // manos del prompt nativo del OS si termina activado o no. Si más
    // adelante quiere intentar otra vez, no le bloqueamos el priming.
    await runActivateFlow()
  }, [runActivateFlow])

  const handlePrimeDismiss = useCallback(async () => {
    setPrimeVisible(false)
    await markPrimeDismissed('biometric')
    void triggerHaptic('selection')
    // Tratamos "Más tarde" del priming como skip: el user explícitamente
    // dijo no quiero activar ahora, así que avanzamos al onboarding.
    await markBiometricSetupShown(userId)
    router.replace('/(app)/onboarding')
  }, [router, userId])

  // Skip / PIN: el háptico de press ya lo pone AuthLink ('light') — acá
  // solo el guard de doble tap y la salida (a diferencia de la pantalla
  // vieja, que era dueña de sus Pressables y de sus hápticos).
  const handleSkip = useCallback(async () => {
    if (isWorking) return
    setWorking(true)
    try {
      await advanceToOnboarding()
    } finally {
      setWorking(false)
    }
  }, [advanceToOnboarding, isWorking])

  const handleUsePin = useCallback(async () => {
    if (isWorking) return
    setWorking(true)
    try {
      await markBiometricSetupShown(userId)
      router.replace('/(app)/pin-setup?next=onboarding')
    } finally {
      setWorking(false)
    }
  }, [isWorking, userId, router])

  // While biometric state is loading, render an empty themed canvas
  // (no spinner — the read is fast and a spinner here would flash).
  const isLoading = biometric === null

  const label = biometric?.label ?? 'Face ID'
  const isAvailable = biometric?.isAvailable ?? false

  return (
    <AuthLiveChrome>
      {isLoading ? (
        <AuthScreenShell mode={mode} />
      ) : (
        <Auth4cFaceId
          mode={mode}
          sensor={sensor}
          label={label}
          available={isAvailable}
          busy={isWorking}
          onActivate={() => {
            void handleActivate()
          }}
          onUsePin={() => {
            void handleUsePin()
          }}
          onSkip={() => {
            void handleSkip()
          }}
        />
      )}

      <PermissionPrimeSheet
        visible={primeVisible}
        type="biometric"
        biometricLabel={label}
        onAllow={() => {
          void handlePrimeAllow()
        }}
        onDismiss={() => {
          void handlePrimeDismiss()
        }}
      />
    </AuthLiveChrome>
  )
}
