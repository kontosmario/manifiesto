import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import type { TextInput as RNTextInput } from 'react-native'
import { Text, TextInput } from '@/components/ui/app-text'
import * as LocalAuthentication from 'expo-local-authentication'
import { useRouter } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { NeoButton } from '@/components/ui/neo-button'
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
import { toast } from '@/lib/toast-bus'
import { triggerHaptic } from '@/lib/haptics'
import { getPinLength, getPinLockState, verifyPin } from '@/lib/pin-lock'
import { supabase } from '@/lib/supabase'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useAppTheme } from '@/theme/theme-provider'
import { neoInk } from '@/theme/neo-ink'
import { neoMaterial, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily, typography } from '@/theme/typography'
import { getErrorMessage } from '@/utils/error-message'

interface DeleteAccountScreenProps {
  userId: string
  /**
   * Hogar del usuario, si se conoce. Es OPCIONAL a propósito: la baja la
   * autoriza el `auth.uid()` del JWT en `request_account_deletion`, no la
   * familia — acá el id sólo sirve para leer el rol y avisarle al dueño
   * que primero tiene que traspasar el hogar. Sin id no hay rol, no hay
   * aviso y la baja sigue disponible.
   *
   * Que fuera obligatorio escondía la salida entera: el paywall del gate
   * duro la gateaba con `familyId`, que sale del home snapshot, así que
   * si el snapshot fallaba el usuario quedaba sin forma de darse de baja
   * dentro de la app (guideline 5.1.1(v) de Apple).
   */
  familyId?: string | null
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
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const cardMaterial = neoMaterial(theme.isDark ? 'dark' : 'light')
  const ink = neoInk(theme.isDark ? 'dark' : 'light')
  // Android < API 28 descarta el boxShadow OUTSET en silencio: sin relieve la
  // card queda del material del fondo y el bloque desaparece.
  const flatFallback = SUPPORTS_INSET_SHADOW
    ? null
    : { borderWidth: 1, borderColor: neo.sheetDivider }
  const { t } = useTranslation()
  const CONFIRM_PHRASE = t('settings:deleteAccount.confirmPhrase')
  const router = useRouter()
  const inputRef = useRef<RNTextInput | null>(null)
  const passwordInputRef = useRef<RNTextInput | null>(null)

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
  const roleQuery = useMyFamilyRole(userId, familyId ?? undefined)
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
            toast.error(getErrorMessage(
                error,
                t('settings:deleteAccount.logoutErrorMessage'),
              ))
          },
          onSuccess: () => {
            router.replace('/')
          },
        })
      },
      onError: (error) => {
        void triggerHaptic('error')
        toast.error(getErrorMessage(
            error,
            t('settings:deleteAccount.scheduleErrorMessage'),
          ))
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
        toast.error(t('settings:deleteAccount.biometricUnavailableMessage'))
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
      toast.error(getErrorMessage(error, t('settings:deleteAccount.tryAgain')))
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
        backgroundColor={neo.bg}
        titleColor={neo.text}
        canGoBack={!onClose}
        contentContainerStyle={styles.screenContent}
        subtitle={t('settings:deleteAccount.blockedSubtitle')}
        title={t('settings:deleteAccount.title')}
      >
        <View style={styles.sectionStack}>
          <View
            style={[
              styles.warningCard,
              {
                backgroundColor: neo.well,
                boxShadow: neo.shadows.insetMd,
                borderColor: ink.warn,
              },
            ]}
          >
            <MaterialIcons
              color={ink.warn}
              name="info-outline"
              size={28}
            />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[styles.warningTitle, { color: neo.text }]}>
                {t('settings:deleteAccount.blockedTitle')}
              </Text>
              <Text style={[styles.warningBody, { color: neo.textMuted }]}>
                {t('settings:deleteAccount.blockedBody')}
              </Text>
            </View>
          </View>
          <NeoButton
            block
            haptic="none"
            label={t('common:actions.understood')}
            onPress={handleCancel}
            variant="ghost"
          />
        </View>
      </Screen>
    )
  }

  return (
    <Screen
      backgroundColor={neo.bg}
      titleColor={neo.text}
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
        {step === 'review' ? (
          <>
            {/* DISCLAIMER fuerte */}
            <View
              style={[
                styles.warningCard,
                {
                  backgroundColor: neo.well,
                  boxShadow: neo.shadows.insetMd,
                  borderColor: ink.danger,
                },
              ]}
            >
              <MaterialIcons
                color={ink.danger}
                name="warning-amber"
                size={28}
              />
              <View style={{ flex: 1, gap: 6 }}>
                <Text
                  style={[styles.warningTitle, { color: neo.text }]}
                >
                  {t('settings:deleteAccount.disclaimerTitle')}
                </Text>
                <Text
                  style={[styles.warningBody, { color: neo.textMuted }]}
                >
                  {t('settings:deleteAccount.disclaimerBody')}
                </Text>
              </View>
            </View>

            {/* Tabla "qué se borra / qué se preserva" */}
            <View
              style={[
                styles.tableCard,
                cardMaterial,
                flatFallback,
              ]}
            >
              <Text
                style={[styles.tableTitle, { color: neo.text }]}
              >
                {t('settings:deleteAccount.deletedTitle')}
              </Text>
              <ImpactRow
                color={ink.danger}
                colorMuted={neo.textMuted}
                colorText={neo.text}
                icon="delete-outline"
                label={t('settings:deleteAccount.deletedProfile')}
              />
              <ImpactRow
                color={ink.danger}
                colorMuted={neo.textMuted}
                colorText={neo.text}
                icon="notifications-off"
                label={t('settings:deleteAccount.deletedPush')}
              />
              <ImpactRow
                color={ink.danger}
                colorMuted={neo.textMuted}
                colorText={neo.text}
                icon="receipt-long"
                label={t('settings:deleteAccount.deletedSubscription')}
              />

              <View
                style={[styles.divider, { backgroundColor: neo.sheetDivider }]}
              />

              <Text
                style={[styles.tableTitle, { color: neo.text }]}
              >
                {t('settings:deleteAccount.preservedTitle')}
              </Text>
              <ImpactRow
                color={ink.accent}
                colorMuted={neo.textMuted}
                colorText={neo.text}
                icon="history"
                label={t('settings:deleteAccount.preservedHistory')}
              />
              <ImpactRow
                color={ink.accent}
                colorMuted={neo.textMuted}
                colorText={neo.text}
                icon="group"
                label={t('settings:deleteAccount.preservedFamily')}
              />
              <ImpactRow
                color={ink.accent}
                colorMuted={neo.textMuted}
                colorText={neo.text}
                icon="schedule"
                label={t('settings:deleteAccount.preservedGrace')}
              />
            </View>

            <View style={styles.row}>
              <NeoButton
                block
                haptic="none"
                label={t('common:actions.cancel')}
                onPress={handleCancel}
                variant="ghost"
              />
              <NeoButton
                block
                haptic="warning"
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
                cardMaterial,
                flatFallback,
              ]}
            >
              <Text
                style={[styles.confirmHelper, { color: neo.textMuted }]}
              >
                {t('settings:deleteAccount.confirmHelperPrefix')}{' '}
                <Text style={{ color: ink.danger, fontWeight: '800', fontFamily: nunitoFamily('800') }}>
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
                placeholderTextColor={neo.textMuted}
                returnKeyType="done"
                spellCheck={false}
                style={[
                  styles.input,
                  {
                    backgroundColor: neo.well,
                    boxShadow: neo.shadows.insetLg,
                    borderColor: matchesPhrase ? ink.danger : 'transparent',
                    color: neo.text,
                  },
                ]}
                value={phrase}
              />

              {phrase.length > 0 && !matchesPhrase ? (
                <Text style={[styles.errorText, { color: ink.danger }]}>
                  {t('settings:deleteAccount.phraseMismatch', { phrase: CONFIRM_PHRASE })}
                </Text>
              ) : null}

              {pinIsSet ? (
                <Text style={[styles.helperHint, { color: neo.textMuted }]}>
                  {t('settings:deleteAccount.willAskPin')}
                </Text>
              ) : biometricState?.isAvailable ? (
                <Text style={[styles.helperHint, { color: neo.textMuted }]}>
                  {t('settings:deleteAccount.willAskBiometric', { method: biometricState.label })}
                </Text>
              ) : (
                <Text style={[styles.helperHint, { color: neo.textMuted }]}>
                  {t('settings:deleteAccount.willAskPassword')}
                </Text>
              )}
            </View>

            <View style={styles.row}>
              <NeoButton
                block
                haptic="none"
                label={t('common:actions.back')}
                onPress={handleBackToReview}
                variant="ghost"
              />
              <NeoButton
                block
                disabled={!matchesPhrase || requestDeletion.isPending}
                haptic="warning"
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
                cardMaterial,
                flatFallback,
              ]}
            >
              <Text style={[styles.reauthTitle, { color: neo.text }]}>
                {t('settings:deleteAccount.pinTitle')}
              </Text>
              <Text
                style={[styles.confirmHelper, { color: neo.textMuted }]}
              >
                {t('settings:deleteAccount.pinHelper')}
              </Text>
              <View style={styles.pinPadWrap}>
                {pinLength === null ? (
                  // Sprint K · Audit #4 K-4: gate PinPad render on the
                  // SecureStore read so a fast tap on a 6-digit PIN
                  // doesn't auto-submit a 4-digit slice.
                  <ActivityIndicator color={ink.accent} />
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
                    style={[styles.lockoutText, { color: ink.danger }]}
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
              <Text style={[styles.backLinkText, { color: neo.textMuted }]}>
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
                cardMaterial,
                flatFallback,
              ]}
            >
              <Text style={[styles.reauthTitle, { color: neo.text }]}>
                {t('settings:deleteAccount.passwordTitle')}
              </Text>
              <Text
                style={[styles.confirmHelper, { color: neo.textMuted }]}
              >
                {t('settings:deleteAccount.passwordHelper')}
              </Text>
              {accountEmail ? (
                <Text style={[styles.helperHint, { color: neo.textMuted }]}>
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
                placeholderTextColor={neo.textMuted}
                returnKeyType="done"
                secureTextEntry
                spellCheck={false}
                style={[
                  styles.input,
                  {
                    // Input = pozo en ambos temas. El ternario V1 existía
                    // porque `surfaceMuted` no servía en oscuro; `neo.well`
                    // tiene valor propio por tema y no lo necesita.
                    backgroundColor: neo.well,
                    boxShadow: neo.shadows.insetLg,
                    borderColor: passwordError ? ink.danger : 'transparent',
                    color: neo.text,
                    letterSpacing: 0.5,
                  },
                ]}
                textContentType="password"
                value={passwordValue}
              />

              {passwordError ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[styles.errorText, { color: ink.danger }]}
                >
                  {passwordError}
                </Text>
              ) : null}

              <NeoButton
                block
                disabled={
                  isReauthChecking ||
                  requestDeletion.isPending ||
                  passwordValue.length === 0
                }
                haptic="warning"
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
              <Text style={[styles.backLinkText, { color: neo.textMuted }]}>
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
                cardMaterial,
                flatFallback,
              ]}
            >
              <MaterialIcons
                color={ink.accent}
                name="fingerprint"
                size={36}
                style={{ alignSelf: 'center' }}
              />
              <Text style={[styles.reauthTitle, { color: neo.text }]}>
                {t('settings:deleteAccount.biometricTitle', {
                  method: biometricState?.label ?? t('settings:deleteAccount.biometricFallback'),
                })}
              </Text>
              <Text
                style={[styles.confirmHelper, { color: neo.textMuted }]}
              >
                {t('settings:deleteAccount.biometricRetryHelper')}
              </Text>
              <NeoButton
                block
                disabled={isReauthChecking || requestDeletion.isPending}
                haptic="warning"
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
              <Text style={[styles.backLinkText, { color: neo.textMuted }]}>
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
    borderRadius: neoRadii.card,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
  },
  warningBody: {
    fontSize: 13,
    fontFamily: nunitoFamily('400'),
    lineHeight: 18,
  },
  tableCard: {
    borderRadius: neoRadii.card,
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
    fontFamily: nunitoFamily('400'),
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
    fontFamily: nunitoFamily('400'),
    lineHeight: 18,
  },
  helperHint: {
    fontSize: 12,
    fontFamily: nunitoFamily('600'),
    fontStyle: Platform.OS === 'ios' ? 'italic' : 'normal',
  },
  input: {
    borderRadius: neoRadii.input,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 1.5,
  },
  errorText: {
    fontSize: 12,
    fontFamily: nunitoFamily('600'),
  },
  reauthTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
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
    fontFamily: nunitoFamily('600'),
    textAlign: 'center',
  },
  // `minHeight` y no `height`: con la tipografía del sistema al máximo el label
  // de 14px pasa de 44 y se desbordaba de la caja.
  backLink: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
  },
})
