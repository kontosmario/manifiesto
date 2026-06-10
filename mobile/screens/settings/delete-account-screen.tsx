import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import { useRouter } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { AppButton } from '@/components/ui/button'
import { PinPad } from '@/components/auth/pin-pad'
import { isPinComplete } from '@/components/auth/pin-pad-model'
import { Screen } from '@/components/ui/screen'
import { useRequestAccountDeletion } from '@/features/auth/use-delete-account'
import { useFamilyMemberStats } from '@/features/family/use-family-admin'
import { useMyFamilyRole } from '@/features/family/use-my-family-role'
import {
  authenticateBiometricAccess,
  getBiometricLoginState,
  type BiometricLoginState,
} from '@/lib/biometric-auth'
import { logoutSession } from '@/features/auth/logout'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { triggerHaptic } from '@/lib/haptics'
import { getPinLength, getPinLockState, verifyPin } from '@/lib/pin-lock'
import { supabase } from '@/lib/supabase'
import { DARK_TAB_CANVAS, radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { typography } from '@/theme/typography'
import { getErrorMessage } from '@/utils/error-message'

interface DeleteAccountScreenProps {
  userId: string
  familyId: string
}

type Step =
  | 'review'
  | 'confirm'
  | 'reauth-pin'
  | 'reauth-biometric'
  | 'reauth-password'

const CONFIRM_PHRASE = 'ELIMINAR'

/**
 * Pantalla dedicada de baja de cuenta (Apple guideline 5.1.1(v)).
 *
 * Flow:
 *   1. Review: disclaimer + comparativa "qué se borra / qué se preserva".
 *   2. Confirm: input case-sensitive con la frase "ELIMINAR".
 *   3. Re-auth: si el usuario tiene PIN, se le pide el PIN; si no, se
 *      intenta biometría. Si no hay ninguno, salteamos este paso (el
 *      auth.uid del JWT ya identifica al caller en el RPC).
 *   4. RPC `request_account_deletion`: agenda la baja en 30 días, borra
 *      push_subscriptions del user inmediatamente.
 *   5. Logout + redirect a `/` (que enruta a /welcome cuando no hay
 *      sesión).
 *
 * Nota intencional: NO usamos un hard-delete dedicado (`delete_my_account`)
 * porque el backend implementa soft-delete con gracia de 30 días via
 * `request_account_deletion`. Mantener el mismo path evita que tengamos
 * dos flujos divergentes; la gracia + cron processor ya está cableado
 * end-to-end y le da al usuario una ventana de arrepentimiento.
 */
export function DeleteAccountScreen({ userId, familyId }: DeleteAccountScreenProps) {
  const { theme } = useAppTheme()
  const router = useRouter()
  const inputRef = useRef<TextInput | null>(null)
  const passwordInputRef = useRef<TextInput | null>(null)

  const sessionQuery = useAuthSession()
  const accountEmail = sessionQuery.data?.user?.email ?? null

  const [step, setStep] = useState<Step>('review')
  const [phrase, setPhrase] = useState('')
  const [pinValue, setPinValue] = useState('')
  const [pinErrorToken, setPinErrorToken] = useState(0)
  const [pinLockoutMessage, setPinLockoutMessage] = useState<string | null>(null)
  const [isReauthChecking, setReauthChecking] = useState(false)
  const [pinIsSet, setPinIsSet] = useState(false)
  // Sprint J-Med · J-Med3 (2026-06-10): password fallback state when
  // user has neither PIN nor biometric configured. We require the
  // account password as a defense-in-depth reauth before scheduling
  // the 30-day deletion.
  const [passwordValue, setPasswordValue] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  // Sprint J · P0: dynamic PIN length so this re-auth path submits the
  // correct number of digits (4–8). Defaults to 4 for back-compat.
  const [pinLength, setPinLength] = useState<number>(4)
  const [biometricState, setBiometricState] =
    useState<BiometricLoginState | null>(null)

  const requestDeletion = useRequestAccountDeletion()
  const roleQuery = useMyFamilyRole(userId, familyId)
  const memberStatsQuery = useFamilyMemberStats()

  // Bloqueamos el flow si el user es owner de una familia con otros
  // miembros activos. El RPC también lo valida, pero anticipamos el
  // feedback acá para evitar un round-trip que termina en error.
  const otherActiveMembers = useMemo(() => {
    const rows = memberStatsQuery.data ?? []
    return rows.filter(
      (m) => m.userId !== userId && m.role !== 'blocked' && m.blockedAt === null,
    ).length
  }, [memberStatsQuery.data, userId])
  const isOwnerWithMembers =
    roleQuery.data === 'owner' && otherActiveMembers > 0

  // Cargamos estado de PIN + biometría al montar para decidir qué tipo
  // de re-auth ofrecer.
  useEffect(() => {
    let cancelled = false
    void getPinLockState().then((s) => {
      if (!cancelled) setPinIsSet(s.isSet)
    })
    void getBiometricLoginState().then((s) => {
      if (!cancelled) setBiometricState(s)
    })
    void getPinLength().then((len) => {
      if (!cancelled) setPinLength(len)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Auto-focus del input cuando entramos al paso de confirmación.
  useEffect(() => {
    if (step === 'confirm') {
      const handle = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(handle)
    }
    if (step === 'reauth-password') {
      const handle = setTimeout(() => passwordInputRef.current?.focus(), 100)
      return () => clearTimeout(handle)
    }
  }, [step])

  // CASE-SENSITIVE: tiene que ser exactamente "ELIMINAR" (mayúsculas).
  // El spec original pide validación case-sensitive para hacer la
  // confirmación más deliberada — no normalizamos como el sheet legacy.
  const matchesPhrase = phrase === CONFIRM_PHRASE

  const handleStartConfirm = useCallback(() => {
    void triggerHaptic('selection')
    setStep('confirm')
  }, [])

  const performRequestDeletion = useCallback(() => {
    requestDeletion.mutate(undefined, {
      onSuccess: () => {
        void triggerHaptic('success')
        // Sacamos al usuario inmediatamente para invalidar la sesión.
        // El flag `deletion_scheduled_at` queda en el profile y el cron
        // processor cierra el loop en T+30d.
        void logoutSession({
          onError: (error) => {
            Alert.alert(
              'No pudimos cerrar sesión',
              getErrorMessage(
                error,
                'Tu cuenta quedó agendada para baja pero hubo un problema al desloguear.',
              ),
            )
          },
          onSuccess: () => {
            router.replace('/')
          },
        })
      },
      onError: (error) => {
        void triggerHaptic('error')
        Alert.alert(
          'No pudimos programar la baja',
          getErrorMessage(
            error,
            'Probá nuevamente en un momento. Si el problema persiste, escribinos a soporte.',
          ),
        )
      },
    })
  }, [requestDeletion, router])

  const handleConfirmTyped = useCallback(() => {
    if (!matchesPhrase || requestDeletion.isPending) return
    void triggerHaptic('warning')
    // Decidimos qué re-auth ofrecer. PIN tiene precedencia (más
    // determinista que biometría que puede fallar por sensor).
    if (pinIsSet) {
      setStep('reauth-pin')
      return
    }
    if (biometricState?.isAvailable) {
      setStep('reauth-biometric')
      // Disparamos el prompt biométrico de inmediato — la "pantalla" de
      // reauth-biometric es solo un placeholder por si LocalAuth no
      // estuviera disponible al momento del render.
      void runBiometricChallenge()
      return
    }
    // Sprint J-Med · J-Med3 (2026-06-10): defense-in-depth — sin PIN
    // ni biometría, un atacante con el teléfono desbloqueado podría
    // tipear "ELIMINAR" y arrancar la cuenta regresiva de 30 días.
    // Pedimos la contraseña de la cuenta como reauth final. El RPC
    // funcionaría sin esto (auth.uid identifica al caller) pero el
    // prompt agrega fricción proporcional al daño potencial.
    setStep('reauth-password')
    setPasswordValue('')
    setPasswordError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runBiometricChallenge se define abajo
  }, [
    biometricState?.isAvailable,
    matchesPhrase,
    pinIsSet,
    requestDeletion.isPending,
  ])

  const handlePinChange = useCallback(
    (next: string) => {
      if (isReauthChecking) return
      setPinValue(next)
      if (!isPinComplete(next, pinLength)) return
      setReauthChecking(true)
      void verifyPin(next)
        .then((result) => {
          if (result.ok) {
            void triggerHaptic('success')
            setReauthChecking(false)
            setPinValue('')
            performRequestDeletion()
            return
          }
          if (result.lockedForMs > 0) {
            const seconds = Math.ceil(result.lockedForMs / 1000)
            setPinLockoutMessage(`Bloqueado ${seconds} seg`)
          } else {
            setPinLockoutMessage(null)
          }
          setPinErrorToken((t) => t + 1)
          setPinValue('')
          setReauthChecking(false)
        })
        .catch(() => {
          setPinErrorToken((t) => t + 1)
          setPinValue('')
          setReauthChecking(false)
        })
    },
    [isReauthChecking, performRequestDeletion, pinLength],
  )

  const handlePasswordSubmit = useCallback(async () => {
    if (isReauthChecking || requestDeletion.isPending) return
    const trimmedPassword = passwordValue
    if (!trimmedPassword) {
      setPasswordError('Ingresá tu contraseña para confirmar.')
      return
    }
    if (!accountEmail) {
      setPasswordError(
        'No pudimos identificar tu email. Reintentá en un momento.',
      )
      return
    }
    setReauthChecking(true)
    setPasswordError(null)
    try {
      // Sprint J-Med · J-Med3 (2026-06-10): verificamos la contraseña
      // re-autenticando contra Supabase Auth. signInWithPassword
      // refresca el JWT si es exitoso — eso es OK porque el siguiente
      // paso (request_account_deletion) usa el mismo session token.
      const { error } = await supabase.auth.signInWithPassword({
        email: accountEmail,
        password: trimmedPassword,
      })
      if (error) {
        setReauthChecking(false)
        // Mensaje genérico — no distinguimos entre "wrong password" y
        // "rate limit" para no leakear señal a un atacante.
        setPasswordError(
          'La contraseña no coincide. Probá nuevamente.',
        )
        void triggerHaptic('error')
        return
      }
      void triggerHaptic('success')
      setReauthChecking(false)
      setPasswordValue('')
      performRequestDeletion()
    } catch (error) {
      setReauthChecking(false)
      setPasswordError(
        getErrorMessage(error, 'No pudimos verificar la contraseña.'),
      )
    }
  }, [
    accountEmail,
    isReauthChecking,
    passwordValue,
    performRequestDeletion,
    requestDeletion.isPending,
  ])

  const runBiometricChallenge = useCallback(async () => {
    if (isReauthChecking || requestDeletion.isPending) return
    setReauthChecking(true)
    try {
      // Verificamos que efectivamente haya hardware + enrolamiento.
      // En Expo Go puede fallar silenciosamente.
      const hasHardware = await LocalAuthentication.hasHardwareAsync()
      const isEnrolled = await LocalAuthentication.isEnrolledAsync()
      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          'Biometría no disponible',
          'Configurá Face ID / huella en los ajustes del sistema para confirmar la baja.',
        )
        setReauthChecking(false)
        setStep('confirm')
        return
      }
      const result = await authenticateBiometricAccess({
        promptMessage: 'Confirmá la baja de tu cuenta',
      })
      if (result.success) {
        void triggerHaptic('success')
        setReauthChecking(false)
        performRequestDeletion()
        return
      }
      // Usuario canceló o falló — volvemos al confirm sin error,
      // permite reintentar el typed phrase o cancelar.
      setReauthChecking(false)
      setStep('confirm')
    } catch (error) {
      setReauthChecking(false)
      setStep('confirm')
      Alert.alert(
        'No pudimos confirmar',
        getErrorMessage(error, 'Probá nuevamente.'),
      )
    }
  }, [isReauthChecking, performRequestDeletion, requestDeletion.isPending])

  const handleCancel = useCallback(() => {
    if (requestDeletion.isPending) return
    router.back()
  }, [requestDeletion.isPending, router])

  const handleBackToReview = useCallback(() => {
    if (requestDeletion.isPending) return
    setStep('review')
    setPhrase('')
    setPinValue('')
    setPinErrorToken(0)
    setPinLockoutMessage(null)
    setPasswordValue('')
    setPasswordError(null)
  }, [requestDeletion.isPending])

  // ── Render: caso bloqueado (owner con miembros activos) ─────────
  if (isOwnerWithMembers) {
    return (
      <Screen
        backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
        canGoBack
        contentContainerStyle={styles.screenContent}
        subtitle="Antes de borrar tu cuenta, transferí el hogar a otro miembro."
        title="Eliminar cuenta"
      >
        <View style={styles.sectionStack}>
          {!theme.isDark ? <AmbientBackdrop variant="home" /> : null}
          <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />

          <View
            style={[
              styles.warningCard,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.warning,
              },
            ]}
          >
            <MaterialIcons
              color={theme.colors.warning}
              name="info-outline"
              size={28}
            />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[styles.warningTitle, { color: theme.colors.text }]}>
                No podés borrar tu cuenta todavía
              </Text>
              <Text style={[styles.warningBody, { color: theme.colors.textMuted }]}>
                Sos dueño de un hogar con otros miembros activos. Si te vas,
                el resto pierde acceso. Pasale el rol a otro miembro desde
                "Gestionar miembros" y volvé acá.
              </Text>
            </View>
          </View>
          <AppButton label="Entendido" onPress={handleCancel} variant="ghost" />
        </View>
      </Screen>
    )
  }

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      canGoBack
      contentContainerStyle={styles.screenContent}
      subtitle={
        step === 'review'
          ? 'Vas a programar la baja de tu cuenta.'
          : step === 'confirm'
            ? 'Escribí ELIMINAR para confirmar.'
            : step === 'reauth-pin'
              ? 'Ingresá tu PIN para confirmar.'
              : step === 'reauth-password'
                ? 'Ingresá la contraseña de tu cuenta.'
                : 'Confirmá con biometría para programar la baja.'
      }
      title="Eliminar cuenta"
    >
      <View style={styles.sectionStack}>
        {!theme.isDark ? <AmbientBackdrop variant="home" /> : null}
        <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />

        {step === 'review' ? (
          <>
            {/* DISCLAIMER fuerte */}
            <View
              style={[
                styles.warningCard,
                {
                  backgroundColor: theme.colors.surfaceMuted,
                  borderColor: theme.colors.danger,
                },
              ]}
            >
              <MaterialIcons
                color={theme.colors.danger}
                name="warning-amber"
                size={28}
              />
              <View style={{ flex: 1, gap: 6 }}>
                <Text
                  style={[styles.warningTitle, { color: theme.colors.text }]}
                >
                  Esta acción no es inmediata, pero es seria
                </Text>
                <Text
                  style={[styles.warningBody, { color: theme.colors.textMuted }]}
                >
                  Tu cuenta queda agendada para borrarse en 30 días. Durante
                  ese plazo podés cancelar la baja entrando de nuevo. Pasados
                  los 30 días, todos tus datos personales se borran
                  definitivamente.
                </Text>
              </View>
            </View>

            {/* Tabla "qué se borra / qué se preserva" */}
            <View
              style={[
                styles.tableCard,
                {
                  backgroundColor: theme.isDark
                    ? theme.colors.surfaceMuted
                    : theme.colors.creamCard,
                  borderColor: theme.colors.line,
                },
              ]}
            >
              <Text
                style={[styles.tableTitle, { color: theme.colors.text }]}
              >
                Qué se borra
              </Text>
              <ImpactRow
                color={theme.colors.danger}
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="delete-outline"
                label="Tu perfil, avatar y configuración personal."
              />
              <ImpactRow
                color={theme.colors.danger}
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="notifications-off"
                label="Tus suscripciones de notificaciones push."
              />
              <ImpactRow
                color={theme.colors.danger}
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="receipt-long"
                label="Tu suscripción al plan (si tenés activa)."
              />

              <View
                style={[styles.divider, { backgroundColor: theme.colors.line }]}
              />

              <Text
                style={[styles.tableTitle, { color: theme.colors.text }]}
              >
                Qué se preserva
              </Text>
              <ImpactRow
                color={theme.colors.primaryStrong}
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="history"
                label="El historial de gastos del hogar (con autor 'Anónimo')."
              />
              <ImpactRow
                color={theme.colors.primaryStrong}
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="group"
                label="La familia si quedan otros miembros activos."
              />
              <ImpactRow
                color={theme.colors.primaryStrong}
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="schedule"
                label="30 días de gracia para arrepentirte."
              />
            </View>

            <View style={styles.row}>
              <AppButton
                label="Cancelar"
                onPress={handleCancel}
                variant="ghost"
              />
              <AppButton
                label="Continuar"
                onPress={handleStartConfirm}
                variant="danger"
              />
            </View>
          </>
        ) : null}

        {step === 'confirm' ? (
          <>
            <View
              style={[
                styles.tableCard,
                {
                  backgroundColor: theme.isDark
                    ? theme.colors.surfaceMuted
                    : theme.colors.creamCard,
                  borderColor: theme.colors.line,
                },
              ]}
            >
              <Text
                style={[styles.confirmHelper, { color: theme.colors.textMuted }]}
              >
                Para destrabar el botón, escribí{' '}
                <Text style={{ color: theme.colors.danger, fontWeight: '800' }}>
                  {CONFIRM_PHRASE}
                </Text>{' '}
                en mayúsculas, exactamente como aparece.
              </Text>

              <TextInput
                ref={inputRef}
                accessibilityLabel={`Escribí ${CONFIRM_PHRASE} para confirmar`}
                autoCapitalize="characters"
                autoCorrect={false}
                onChangeText={setPhrase}
                placeholder={CONFIRM_PHRASE}
                placeholderTextColor={theme.colors.textSoft}
                returnKeyType="done"
                spellCheck={false}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.isDark
                      ? theme.colors.background
                      : theme.colors.surfaceMuted,
                    borderColor: matchesPhrase
                      ? theme.colors.danger
                      : theme.colors.line,
                    color: theme.colors.text,
                  },
                ]}
                value={phrase}
              />

              {phrase.length > 0 && !matchesPhrase ? (
                <Text style={[styles.errorText, { color: theme.colors.danger }]}>
                  Tiene que coincidir exactamente con {CONFIRM_PHRASE} (mayúsculas).
                </Text>
              ) : null}

              {pinIsSet ? (
                <Text style={[styles.helperHint, { color: theme.colors.textMuted }]}>
                  Al continuar, te vamos a pedir tu PIN para confirmar.
                </Text>
              ) : biometricState?.isAvailable ? (
                <Text style={[styles.helperHint, { color: theme.colors.textMuted }]}>
                  Al continuar, te vamos a pedir {biometricState.label} para
                  confirmar.
                </Text>
              ) : (
                <Text style={[styles.helperHint, { color: theme.colors.textMuted }]}>
                  Al continuar, te vamos a pedir la contraseña de tu cuenta
                  para confirmar.
                </Text>
              )}
            </View>

            <View style={styles.row}>
              <AppButton
                label="Volver"
                onPress={handleBackToReview}
                variant="ghost"
              />
              <AppButton
                disabled={!matchesPhrase || requestDeletion.isPending}
                label="Eliminar mi cuenta"
                loading={requestDeletion.isPending}
                onPress={handleConfirmTyped}
                variant="danger"
              />
            </View>
          </>
        ) : null}

        {step === 'reauth-pin' ? (
          <>
            <View
              style={[
                styles.tableCard,
                {
                  backgroundColor: theme.isDark
                    ? theme.colors.surfaceMuted
                    : theme.colors.creamCard,
                  borderColor: theme.colors.line,
                },
              ]}
            >
              <Text style={[styles.reauthTitle, { color: theme.colors.text }]}>
                Ingresá tu PIN
              </Text>
              <Text
                style={[styles.confirmHelper, { color: theme.colors.textMuted }]}
              >
                Pedimos tu PIN como última verificación antes de programar la baja.
              </Text>
              <View style={styles.pinPadWrap}>
                <PinPad
                  errorToken={pinErrorToken}
                  onChange={handlePinChange}
                  pinLength={pinLength}
                  value={pinValue}
                />
                {pinLockoutMessage ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[styles.lockoutText, { color: theme.colors.danger }]}
                  >
                    {pinLockoutMessage}
                  </Text>
                ) : null}
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={handleBackToReview}
              style={({ pressed }) => [
                styles.backLink,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.backLinkText, { color: theme.colors.textMuted }]}>
                Cancelar baja
              </Text>
            </Pressable>
          </>
        ) : null}

        {step === 'reauth-password' ? (
          <>
            <View
              style={[
                styles.tableCard,
                {
                  backgroundColor: theme.isDark
                    ? theme.colors.surfaceMuted
                    : theme.colors.creamCard,
                  borderColor: theme.colors.line,
                },
              ]}
            >
              <Text style={[styles.reauthTitle, { color: theme.colors.text }]}>
                Confirmá tu contraseña
              </Text>
              <Text
                style={[styles.confirmHelper, { color: theme.colors.textMuted }]}
              >
                Como no tenés PIN ni biometría configurados, pedimos la
                contraseña de tu cuenta como verificación final antes de
                programar la baja.
              </Text>
              {accountEmail ? (
                <Text style={[styles.helperHint, { color: theme.colors.textMuted }]}>
                  Cuenta: {accountEmail}
                </Text>
              ) : null}

              <TextInput
                ref={passwordInputRef}
                accessibilityLabel="Contraseña de tu cuenta"
                autoCapitalize="none"
                autoComplete="current-password"
                autoCorrect={false}
                editable={!isReauthChecking && !requestDeletion.isPending}
                onChangeText={(next) => {
                  setPasswordValue(next)
                  if (passwordError) setPasswordError(null)
                }}
                onSubmitEditing={() => void handlePasswordSubmit()}
                placeholder="Tu contraseña"
                placeholderTextColor={theme.colors.textSoft}
                returnKeyType="done"
                secureTextEntry
                spellCheck={false}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.isDark
                      ? theme.colors.background
                      : theme.colors.surfaceMuted,
                    borderColor: passwordError
                      ? theme.colors.danger
                      : theme.colors.line,
                    color: theme.colors.text,
                    letterSpacing: 0.5,
                  },
                ]}
                textContentType="password"
                value={passwordValue}
              />

              {passwordError ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[styles.errorText, { color: theme.colors.danger }]}
                >
                  {passwordError}
                </Text>
              ) : null}

              <AppButton
                disabled={
                  isReauthChecking ||
                  requestDeletion.isPending ||
                  passwordValue.length === 0
                }
                label="Eliminar mi cuenta"
                loading={isReauthChecking || requestDeletion.isPending}
                onPress={() => void handlePasswordSubmit()}
                variant="danger"
              />
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={handleBackToReview}
              style={({ pressed }) => [
                styles.backLink,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.backLinkText, { color: theme.colors.textMuted }]}>
                Cancelar baja
              </Text>
            </Pressable>
          </>
        ) : null}

        {step === 'reauth-biometric' ? (
          <>
            <View
              style={[
                styles.tableCard,
                {
                  backgroundColor: theme.isDark
                    ? theme.colors.surfaceMuted
                    : theme.colors.creamCard,
                  borderColor: theme.colors.line,
                },
              ]}
            >
              <MaterialIcons
                color={theme.colors.primaryStrong}
                name="fingerprint"
                size={36}
                style={{ alignSelf: 'center' }}
              />
              <Text style={[styles.reauthTitle, { color: theme.colors.text }]}>
                Confirmá con {biometricState?.label ?? 'biometría'}
              </Text>
              <Text
                style={[styles.confirmHelper, { color: theme.colors.textMuted }]}
              >
                Si no apareció el prompt, tocá "Reintentar".
              </Text>
              <AppButton
                disabled={isReauthChecking || requestDeletion.isPending}
                label="Reintentar"
                loading={isReauthChecking || requestDeletion.isPending}
                onPress={() => void runBiometricChallenge()}
                variant="danger"
              />
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={handleBackToReview}
              style={({ pressed }) => [
                styles.backLink,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.backLinkText, { color: theme.colors.textMuted }]}>
                Cancelar baja
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </Screen>
  )
}

interface ImpactRowProps {
  color: string
  colorMuted: string
  colorText: string
  icon: keyof typeof MaterialIcons.glyphMap
  label: string
}

function ImpactRow({ color, colorText, icon, label }: ImpactRowProps) {
  return (
    <View style={styles.impactRow}>
      <MaterialIcons color={color} name={icon} size={18} />
      <Text style={[styles.impactText, { color: colorText }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
  sectionStack: {
    gap: 18,
    position: 'relative',
  },
  warningCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  warningBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  tableCard: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: 16,
    gap: 12,
  },
  tableTitle: {
    ...typography.titleMedium,
    fontSize: 14,
  },
  impactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  impactText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  confirmHelper: {
    fontSize: 13,
    lineHeight: 18,
  },
  helperHint: {
    fontSize: 12,
    fontStyle: Platform.OS === 'ios' ? 'italic' : 'normal',
  },
  input: {
    borderRadius: radii.lg,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  errorText: {
    fontSize: 12,
  },
  reauthTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  pinPadWrap: {
    alignItems: 'center',
    gap: 12,
  },
  lockoutText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  backLink: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
})
