import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
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
import { useTranslation } from 'react-i18next'
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
  /** Cuando se monta como Modal anidado (p.ej. desde el paywall lockMode, que
   *  es un Modal nativo top-most donde no se puede navegar a la ruta), cancelar
   *  debe descartar ese Modal en vez de hacer router.back(). Si no se pasa, el
   *  comportamiento de ruta normal (router.back) se mantiene. */
  onClose?: () => void
}

type Step =
  | 'review'
  | 'confirm'
  | 'reauth-pin'
  | 'reauth-biometric'
  | 'reauth-password'

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
export function DeleteAccountScreen({ userId, familyId, onClose }: DeleteAccountScreenProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const CONFIRM_PHRASE = t('settings:deleteAccount.confirmPhrase')
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
  // correct number of digits (4–8).
  //
  // Sprint K · Audit #4 K-4 (2026-06-10): start as `null` and hide the
  // PinPad behind a spinner until SecureStore resolves. Defaulting to
  // 4 made a fast-typing user with a 6-digit PIN auto-submit a 4-digit
  // slice — burning a failed attempt and lockout budget on what should
  // have been the first real try.
  const [pinLength, setPinLength] = useState<number | null>(null)
  const [biometricState, setBiometricState] =
    useState<BiometricLoginState | null>(null)

  const requestDeletion = useRequestAccountDeletion()
  const roleQuery = useMyFamilyRole(userId, familyId)
  const memberStatsQuery = useFamilyMemberStats()

  // Bloqueamos el flow si el user es owner de una familia con otros
  // miembros activos. El RPC también lo valida, pero anticipamos el
  // feedback aquí para evitar un round-trip que termina en error.
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
              t('settings:deleteAccount.logoutErrorTitle'),
              getErrorMessage(
                error,
                t('settings:deleteAccount.logoutErrorMessage'),
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
          t('settings:deleteAccount.scheduleErrorTitle'),
          getErrorMessage(
            error,
            t('settings:deleteAccount.scheduleErrorMessage'),
          ),
        )
      },
    })
  }, [requestDeletion, router, t])

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
      // Sprint K · Audit #4 K-4: short-circuit until pinLength loads
      // so a fast tap can't submit a slice of a longer PIN.
      if (pinLength === null) return
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
            setPinLockoutMessage(t('settings:deleteAccount.pinLockout', { seconds }))
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
    [isReauthChecking, performRequestDeletion, pinLength, t],
  )

  const handlePasswordSubmit = useCallback(async () => {
    if (isReauthChecking || requestDeletion.isPending) return
    const trimmedPassword = passwordValue
    if (!trimmedPassword) {
      setPasswordError(t('settings:deleteAccount.passwordRequired'))
      return
    }
    if (!accountEmail) {
      setPasswordError(t('settings:deleteAccount.emailUnknown'))
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
        setPasswordError(t('settings:deleteAccount.passwordMismatch'))
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
        getErrorMessage(error, t('settings:deleteAccount.passwordVerifyError')),
      )
    }
  }, [
    accountEmail,
    isReauthChecking,
    passwordValue,
    performRequestDeletion,
    requestDeletion.isPending,
    t,
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
          t('settings:deleteAccount.biometricUnavailableTitle'),
          t('settings:deleteAccount.biometricUnavailableMessage'),
        )
        setReauthChecking(false)
        setStep('confirm')
        return
      }
      const result = await authenticateBiometricAccess({
        promptMessage: t('settings:deleteAccount.biometricPrompt'),
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
        t('settings:deleteAccount.confirmErrorTitle'),
        getErrorMessage(error, t('settings:deleteAccount.tryAgain')),
      )
    }
  }, [isReauthChecking, performRequestDeletion, requestDeletion.isPending, t])

  const handleCancel = useCallback(() => {
    if (requestDeletion.isPending) return
    if (onClose) {
      onClose()
      return
    }
    router.back()
  }, [requestDeletion.isPending, router, onClose])

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
        canGoBack={!onClose}
        contentContainerStyle={styles.screenContent}
        subtitle={t('settings:deleteAccount.blockedSubtitle')}
        title={t('settings:deleteAccount.title')}
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
                {t('settings:deleteAccount.blockedTitle')}
              </Text>
              <Text style={[styles.warningBody, { color: theme.colors.textMuted }]}>
                {t('settings:deleteAccount.blockedBody')}
              </Text>
            </View>
          </View>
          <AppButton label={t('common:actions.understood')} onPress={handleCancel} variant="ghost" />
        </View>
      </Screen>
    )
  }

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      canGoBack={!onClose}
      contentContainerStyle={styles.screenContent}
      subtitle={
        step === 'review'
          ? t('settings:deleteAccount.subtitleReview')
          : step === 'confirm'
            ? t('settings:deleteAccount.subtitleConfirm', { phrase: CONFIRM_PHRASE })
            : step === 'reauth-pin'
              ? t('settings:deleteAccount.subtitlePin')
              : step === 'reauth-password'
                ? t('settings:deleteAccount.subtitlePassword')
                : t('settings:deleteAccount.subtitleBiometric')
      }
      title={t('settings:deleteAccount.title')}
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
                  {t('settings:deleteAccount.disclaimerTitle')}
                </Text>
                <Text
                  style={[styles.warningBody, { color: theme.colors.textMuted }]}
                >
                  {t('settings:deleteAccount.disclaimerBody')}
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
                {t('settings:deleteAccount.deletedTitle')}
              </Text>
              <ImpactRow
                color={theme.colors.danger}
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="delete-outline"
                label={t('settings:deleteAccount.deletedProfile')}
              />
              <ImpactRow
                color={theme.colors.danger}
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="notifications-off"
                label={t('settings:deleteAccount.deletedPush')}
              />
              <ImpactRow
                color={theme.colors.danger}
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="receipt-long"
                label={t('settings:deleteAccount.deletedSubscription')}
              />

              <View
                style={[styles.divider, { backgroundColor: theme.colors.line }]}
              />

              <Text
                style={[styles.tableTitle, { color: theme.colors.text }]}
              >
                {t('settings:deleteAccount.preservedTitle')}
              </Text>
              <ImpactRow
                color={theme.colors.primaryStrong}
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="history"
                label={t('settings:deleteAccount.preservedHistory')}
              />
              <ImpactRow
                color={theme.colors.primaryStrong}
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="group"
                label={t('settings:deleteAccount.preservedFamily')}
              />
              <ImpactRow
                color={theme.colors.primaryStrong}
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="schedule"
                label={t('settings:deleteAccount.preservedGrace')}
              />
            </View>

            <View style={styles.row}>
              <AppButton
                label={t('common:actions.cancel')}
                onPress={handleCancel}
                variant="ghost"
              />
              <AppButton
                label={t('common:actions.continue')}
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
                {t('settings:deleteAccount.confirmHelperPrefix')}{' '}
                <Text style={{ color: theme.colors.danger, fontWeight: '800' }}>
                  {CONFIRM_PHRASE}
                </Text>{' '}
                {t('settings:deleteAccount.confirmHelperSuffix')}
              </Text>

              <TextInput
                ref={inputRef}
                accessibilityLabel={t('settings:deleteAccount.inputA11y', { phrase: CONFIRM_PHRASE })}
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
                  {t('settings:deleteAccount.phraseMismatch', { phrase: CONFIRM_PHRASE })}
                </Text>
              ) : null}

              {pinIsSet ? (
                <Text style={[styles.helperHint, { color: theme.colors.textMuted }]}>
                  {t('settings:deleteAccount.willAskPin')}
                </Text>
              ) : biometricState?.isAvailable ? (
                <Text style={[styles.helperHint, { color: theme.colors.textMuted }]}>
                  {t('settings:deleteAccount.willAskBiometric', { method: biometricState.label })}
                </Text>
              ) : (
                <Text style={[styles.helperHint, { color: theme.colors.textMuted }]}>
                  {t('settings:deleteAccount.willAskPassword')}
                </Text>
              )}
            </View>

            <View style={styles.row}>
              <AppButton
                label={t('common:actions.back')}
                onPress={handleBackToReview}
                variant="ghost"
              />
              <AppButton
                disabled={!matchesPhrase || requestDeletion.isPending}
                label={t('settings:deleteAccount.deleteCta')}
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
                {t('settings:deleteAccount.pinTitle')}
              </Text>
              <Text
                style={[styles.confirmHelper, { color: theme.colors.textMuted }]}
              >
                {t('settings:deleteAccount.pinHelper')}
              </Text>
              <View style={styles.pinPadWrap}>
                {pinLength === null ? (
                  // Sprint K · Audit #4 K-4: gate PinPad render on the
                  // SecureStore read so a fast tap on a 6-digit PIN
                  // doesn't auto-submit a 4-digit slice.
                  <ActivityIndicator color={theme.colors.primary} />
                ) : (
                  <PinPad
                    errorToken={pinErrorToken}
                    onChange={handlePinChange}
                    pinLength={pinLength}
                    value={pinValue}
                  />
                )}
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
                {t('settings:deleteAccount.cancelDeletion')}
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
                {t('settings:deleteAccount.passwordTitle')}
              </Text>
              <Text
                style={[styles.confirmHelper, { color: theme.colors.textMuted }]}
              >
                {t('settings:deleteAccount.passwordHelper')}
              </Text>
              {accountEmail ? (
                <Text style={[styles.helperHint, { color: theme.colors.textMuted }]}>
                  {t('settings:deleteAccount.accountLabel', { email: accountEmail })}
                </Text>
              ) : null}

              <TextInput
                ref={passwordInputRef}
                accessibilityLabel={t('settings:deleteAccount.passwordA11y')}
                autoCapitalize="none"
                autoComplete="current-password"
                autoCorrect={false}
                editable={!isReauthChecking && !requestDeletion.isPending}
                onChangeText={(next) => {
                  setPasswordValue(next)
                  if (passwordError) setPasswordError(null)
                }}
                onSubmitEditing={() => void handlePasswordSubmit()}
                placeholder={t('settings:deleteAccount.passwordPlaceholder')}
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
                label={t('settings:deleteAccount.deleteCta')}
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
                {t('settings:deleteAccount.cancelDeletion')}
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
                {t('settings:deleteAccount.biometricTitle', {
                  method: biometricState?.label ?? t('settings:deleteAccount.biometricFallback'),
                })}
              </Text>
              <Text
                style={[styles.confirmHelper, { color: theme.colors.textMuted }]}
              >
                {t('settings:deleteAccount.biometricRetryHelper')}
              </Text>
              <AppButton
                disabled={isReauthChecking || requestDeletion.isPending}
                label={t('common:actions.retry')}
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
                {t('settings:deleteAccount.cancelDeletion')}
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
