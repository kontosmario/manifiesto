import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useState } from 'react'
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import ReanimatedAnimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { RiseView } from '@/components/home/animated/rise-view'
import { ShineOverlay } from '@/components/home/animated/shine-overlay'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
import {
  AuthSegmentedControl,
  FeedbackPill,
  GradientActionButton,
} from '@/components/auth/login-primitives'
import { TextField } from '@/components/ui/text-field'
import { LoginPanelForm } from '@/components/auth/login-panel-form'
import type { AuthMode } from '@/features/auth/auth-flow'
import { triggerHaptic } from '@/lib/haptics'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { useAppTheme } from '@/theme/theme-provider'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const brandMark = require('../../../assets/brand/manifiesto-logo.png') as number

interface LoginPanelProps {
  displayName: string
  email: string
  emailInputRef: React.RefObject<TextInput | null>
  errorMessage: string | null
  helperCopy: {
    buttonLabel: string
    subtitle: string
    title: string
  }
  infoMessage: string | null
  isBusy: boolean
  isReducedMotionEnabled: boolean
  mode: AuthMode
  modeContentOpacity: Animated.Value
  modeContentTranslateY: Animated.Value
  nameInputRef: React.RefObject<TextInput | null>
  onFieldBlur: (field: 'name' | 'email' | 'password') => void
  onFieldFocus: (field: 'name' | 'email' | 'password') => void
  onForgotPassword?: () => void
  onPasswordChange: (value: string) => void
  onPasswordSubmit: () => void
  onSubmit: () => void
  onUpdateMode: (mode: AuthMode) => void
  onUpdateDisplayName: (value: string) => void
  onUpdateEmail: (value: string) => void
  panelWidth: number
  password: string
  passwordInputRef: React.RefObject<TextInput | null>
}

export function LoginPanel({
  displayName,
  email,
  emailInputRef,
  errorMessage,
  helperCopy,
  infoMessage,
  isBusy,
  isReducedMotionEnabled,
  mode,
  modeContentOpacity,
  modeContentTranslateY,
  nameInputRef,
  onFieldBlur,
  onFieldFocus,
  onForgotPassword,
  onPasswordChange,
  onPasswordSubmit,
  onSubmit,
  onUpdateDisplayName,
  onUpdateEmail,
  onUpdateMode,
  panelWidth,
  password,
  passwordInputRef,
}: LoginPanelProps) {
  const { theme } = useAppTheme()
  const [showPassword, setShowPassword] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  // Soft breathing scale for the brand mark.
  const breath = useSharedValue(1)
  useLoopAnimation(
    () => {
      if (isReducedMotionEnabled) {
        breath.value = 1
        return
      }
      breath.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      )
    },
    [breath],
    [isReducedMotionEnabled],
  )
  const brandStyle = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }))

  // Keep confirm password cleared when leaving sign-up.
  useEffect(() => {
    if (mode !== 'sign-up') {
      setConfirmPassword('')
      setLocalError(null)
    }
  }, [mode])

  const composedError = errorMessage ?? localError

  const handleSubmit = () => {
    if (mode === 'sign-up') {
      if (password !== confirmPassword) {
        setLocalError('Las contraseñas no coinciden.')
        void triggerHaptic('warning')
        return
      }
    }
    setLocalError(null)
    onSubmit()
  }

  const handlePasswordSubmitEditing = () => {
    if (mode === 'sign-up') {
      // Move focus down — but we don't have a confirm ref slot in form.
      // Just submit on go from confirm field instead. Trigger nothing here.
      return
    }
    onPasswordSubmit()
  }

  return (
    <LinearGradient
      colors={
        [...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]
      }
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.shell, { width: panelWidth, borderColor: 'rgba(199,238,156,0.12)' }]}
    >
      <ShineOverlay
        width={520}
        height={360}
        tint={theme.colors.shineOverlay}
        delayMs={1100}
        periodMs={4400}
      />

      <Animated.View
        style={[
          styles.flow,
          {
            opacity: modeContentOpacity,
            transform: [{ translateY: modeContentTranslateY }],
          },
        ]}
      >
        {/* Hero block: brand mark + eyebrow + title + subtitle */}
        <RiseView delay={0}>
          <View style={styles.brandWrap}>
            <ReanimatedAnimated.View style={brandStyle}>
              <Image
                accessibilityIgnoresInvertColors
                source={brandMark}
                resizeMode="contain"
                style={styles.brandMark}
              />
            </ReanimatedAnimated.View>
          </View>
        </RiseView>

        <RiseView delay={80}>
          <View style={styles.eyebrowRow}>
            <BreatheDot
              size={6}
              color={theme.colors.heroAccent}
              glow={theme.colors.heroAccent}
            />
            <Text style={[styles.eyebrow, { color: theme.colors.heroAccent }]}>MANIFIESTO</Text>
          </View>
          <Text style={[styles.title, { color: theme.colors.heroText }]}>{helperCopy.title}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.heroMuted }]}>
            {helperCopy.subtitle}
          </Text>
        </RiseView>

        {/* Form card — translucent surface within the same gradient family */}
        <RiseView delay={160}>
          <View style={styles.card}>
            <AuthSegmentedControl
              compact
              disabled={isBusy}
              onChange={onUpdateMode}
              options={[
                { label: 'Iniciar sesión', value: 'sign-in' },
                { label: 'Crear cuenta', value: 'sign-up' },
              ]}
              reducedMotion={isReducedMotionEnabled}
              value={mode}
            />

            {composedError ? (
              <FeedbackPill intent="error" message={composedError} />
            ) : !errorMessage && infoMessage ? (
              <FeedbackPill intent="info" message={infoMessage} />
            ) : null}

            <RiseView delay={220}>
              <LoginPanelForm
                displayName={displayName}
                email={email}
                emailInputRef={emailInputRef}
                isReducedMotionEnabled={isReducedMotionEnabled}
                mode={mode}
                nameInputRef={nameInputRef}
                onFieldBlur={onFieldBlur}
                onFieldFocus={onFieldFocus}
                onPasswordChange={onPasswordChange}
                onPasswordSubmit={handlePasswordSubmitEditing}
                onUpdateDisplayName={onUpdateDisplayName}
                onUpdateEmail={onUpdateEmail}
                password={password}
                passwordInputRef={passwordInputRef}
                showPassword={showPassword}
                onTogglePasswordVisibility={() => setShowPassword((v) => !v)}
                useReferenceSignInLayout
              />
            </RiseView>

            {mode === 'sign-up' ? (
              <RiseView delay={280}>
                <TextField
                  autoCapitalize="none"
                  autoComplete="new-password"
                  autoCorrect={false}
                  label="Confirmar contraseña"
                  onChangeText={setConfirmPassword}
                  onSubmitEditing={handleSubmit}
                  placeholder="••••••••"
                  returnKeyType="go"
                  secureTextEntry={!showPassword}
                  spellCheck={false}
                  textContentType="newPassword"
                  value={confirmPassword}
                />
              </RiseView>
            ) : null}

            {mode === 'sign-in' ? (
              <RiseView delay={300}>
                <Pressable
                  accessibilityLabel="Recuperar contraseña"
                  accessibilityRole="link"
                  hitSlop={DEFAULT_HIT_SLOP}
                  onPress={() => {
                    void triggerHaptic('selection')
                    onForgotPassword?.()
                  }}
                  pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
                  style={({ pressed }) => [
                    styles.forgotRow,
                    pressed && styles.forgotRowPressed,
                  ]}
                >
                  <Text style={[styles.forgotLabel, { color: theme.colors.heroAccent }]}>
                    ¿Olvidaste tu contraseña?
                  </Text>
                </Pressable>
              </RiseView>
            ) : null}

            <RiseView delay={360}>
              <GradientActionButton
                disabled={isBusy}
                label={isBusy ? 'Procesando...' : helperCopy.buttonLabel}
                onPress={handleSubmit}
              />
            </RiseView>
          </View>
        </RiseView>

        <RiseView delay={420}>
          <Text style={[styles.finePrint, { color: theme.colors.heroMuted2 }]}>
            Al continuar aceptás los términos del servicio.
          </Text>
        </RiseView>
      </Animated.View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 22,
  },
  flow: {
    width: '100%',
    gap: 16,
  },
  brandWrap: {
    width: '100%',
    alignItems: 'center',
  },
  brandMark: {
    width: 88,
    height: 88,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1.1,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    fontWeight: '500',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(199,238,156,0.18)',
    backgroundColor: 'rgba(246,251,239,0.06)',
    padding: 16,
    gap: 14,
  },
  forgotRow: {
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  forgotRowPressed: {
    opacity: 0.78,
  },
  forgotLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  finePrint: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    fontWeight: '500',
    paddingHorizontal: 12,
    marginTop: 4,
  },
})
