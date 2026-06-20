// Recuperar acceso — alineada 1:1 con la anatomía del login (decisión
// owner 2026-06-11): mismo topNav (chevron icónico + FernLogo entero +
// spacer), mismo hero centrado (eyebrow 13/500 → title 34/800 → sub
// 14/500) con entrada staggered FadeInUp, mismas métricas de columna
// (paddingHorizontal 28, gap 14). El "Volver" literal murió: el back
// vive en el header como en login/signup.
//
// Dos estados con el mismo esqueleto:
//   form  → email + CTA "Enviar link"
//   sent  → confirmación con el email destino + CTA "Volver a login"

import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import Svg, { Path } from 'react-native-svg'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { AppButton } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import { Screen } from '@/components/ui/screen'
import { FeedbackPill } from '@/components/auth/auth-feedback-pill'
import { CodeInput } from '@/components/auth/code-input'
import { FernLogo } from '@/components/auth/fern-logo'
import { RequireGuest } from '@/components/guards'
import { normalizeEmail } from '@/features/auth/auth-flow'
import { usePasswordReset } from '@/features/auth/use-auth-actions'
import { useCaptcha } from '@/features/auth/use-captcha'
import { CaptchaModal } from '@/components/auth/captcha-modal'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { useNumpadOffset } from '@/lib/numpad-visibility'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

export function ForgotPasswordScreen() {
  const router = useRouter()
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const passwordReset = usePasswordReset()
  const captcha = useCaptcha()
  const [email, setEmail] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  // Cuando el numpad (InAppNumpad) está abierto, su altura llega por acá. La
  // usamos para subir el contenido (flex-start + padding) y que las celdas + la
  // acción no queden tapadas por el sheet.
  const numpadOffset = useNumpadOffset()

  const handleBack = useCallback(() => {
    void triggerHaptic('light')
    if (router.canGoBack()) router.back()
    else router.replace('/(auth)/login')
  }, [router])

  const handleSubmit = useCallback(async () => {
    const normalized = normalizeEmail(email)
    if (!normalized.includes('@')) {
      setErrorMessage('Ingresá un email válido.')
      await triggerHaptic('warning')
      return
    }
    setErrorMessage(null)
    try {
      // Captcha gate (sprint B · B3). Mismo patrón que signup —
      // skipea si no hay site key configurada.
      let captchaToken: string | undefined
      if (captcha.isConfigured) {
        const token = await captcha.request()
        if (!token) {
          await triggerHaptic('warning')
          setErrorMessage('No pudimos verificar el captcha. Probá de nuevo.')
          return
        }
        captchaToken = token
      }
      await passwordReset.mutateAsync({ email: normalized, captchaToken })
      await triggerHaptic('success')
      setSentTo(normalized)
    } catch (error) {
      await triggerHaptic('error')
      setErrorMessage(getErrorMessage(error, 'No pudimos enviar el email.'))
    }
  }, [captcha, email, passwordReset])

  // Fallback por código: navega a reset-password con email+otp. La verificación
  // (verifyOtp) + el gate seguro viven en reset-password — acá solo pasamos el
  // código tipeado. Funciona en Expo Go / dev / TestFlight (no usa deep-link).
  const handleVerifyCode = useCallback(() => {
    if (!sentTo || code.length !== 6) return
    void triggerHaptic('light')
    router.replace({
      pathname: '/auth/reset-password',
      params: { email: sentTo, otp: code },
    })
  }, [code, router, sentTo])

  // Top nav compartido por ambos estados — idéntico al del login.
  const topNav = (
    <View style={styles.topNav}>
      <Pressable
        accessibilityLabel="Volver"
        accessibilityRole="button"
        hitSlop={DEFAULT_HIT_SLOP}
        onPress={handleBack}
        style={styles.navButton}
      >
        <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
          <Path
            d="M11 4l-5 5 5 5"
            stroke={theme.colors.text}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
      <FernLogo size={28} palette={theme.isDark ? 'light' : 'dark'} />
      <View style={styles.navSpacer} />
    </View>
  )

  if (sentTo) {
    return (
      <RequireGuest allowFamilylessSession>
        <Screen
          contentContainerStyle={[
            styles.screenContent,
            numpadOffset > 0 ? { paddingBottom: 16 + numpadOffset } : null,
          ]}
          bodyStyle={[
            styles.screenBody,
            numpadOffset > 0 ? styles.screenBodyNumpad : null,
          ]}
        >
          <StatusBar style={theme.isDark ? 'light' : 'dark'} />
          {topNav}

          <View style={styles.heroBlockOuter}>
            <View style={styles.heroBlock}>
              <FadeInUp reduced={reduced} delay={100}>
                <Text style={[styles.eyebrow, { color: theme.colors.textSoft }]}>
                  Listo, ya salió
                </Text>
              </FadeInUp>
              <FadeInUp reduced={reduced} delay={200}>
                <Text style={[styles.title, { color: theme.colors.text }]}>
                  Revisá tu mail
                </Text>
              </FadeInUp>
              <FadeInUp reduced={reduced} delay={300}>
                <Text style={[styles.sub, { color: theme.colors.textSoft }]}>
                  Te mandamos un mail a{' '}
                  <Text style={[styles.subStrong, { color: theme.colors.text }]}>
                    {sentTo}
                  </Text>{' '}
                  con un link y un código. Tocá el link, o si no te abre la app,
                  ingresá el código de 6 dígitos acá abajo. Vale por una hora.
                </Text>
              </FadeInUp>
            </View>
          </View>

          <View style={styles.actionsStack}>
            <FadeInUp reduced={reduced} delay={400}>
              <Text style={[styles.codeLabel, { color: theme.colors.textSoft }]}>
                ¿El link no te abrió la app? Ingresá el código del mail
              </Text>
              <CodeInput
                value={code}
                onChangeText={setCode}
                onComplete={handleVerifyCode}
              />
            </FadeInUp>
            <FadeInUp reduced={reduced} delay={500}>
              <AppButton
                disabled={code.length !== 6}
                label="Ingresar con el código"
                onPress={handleVerifyCode}
              />
            </FadeInUp>
            <FadeInUp reduced={reduced} delay={600}>
              <AppButton
                label="Volver a login"
                onPress={() => router.replace('/(auth)/login')}
                variant="ghost"
              />
            </FadeInUp>
          </View>
        </Screen>
      </RequireGuest>
    )
  }

  return (
    <RequireGuest allowFamilylessSession>
      <Screen
        contentContainerStyle={styles.screenContent}
        bodyStyle={styles.screenBody}
      >
        <StatusBar style={theme.isDark ? 'light' : 'dark'} />
        {topNav}

        <View style={styles.heroBlockOuter}>
          <View style={styles.heroBlock}>
            <FadeInUp reduced={reduced} delay={100}>
              <Text style={[styles.eyebrow, { color: theme.colors.textSoft }]}>
                Tranquilo, lo resolvemos
              </Text>
            </FadeInUp>
            <FadeInUp reduced={reduced} delay={200}>
              <Text style={[styles.title, { color: theme.colors.text }]}>
                Recuperar acceso
              </Text>
            </FadeInUp>
            <FadeInUp reduced={reduced} delay={300}>
              <Text style={[styles.sub, { color: theme.colors.textSoft }]}>
                Decinos el email de tu cuenta y te mandamos un link para crear
                una contraseña nueva.
              </Text>
            </FadeInUp>
          </View>
        </View>

        <View style={styles.actionsStack}>
          <FadeInUp reduced={reduced} delay={400}>
            <TextField
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              label="Email de tu cuenta"
              onChangeText={setEmail}
              placeholder="nombre@correo.com"
              returnKeyType="go"
              textContentType="emailAddress"
              value={email}
              onSubmitEditing={() => void handleSubmit()}
            />
          </FadeInUp>
          {errorMessage ? (
            <FeedbackPill intent="error" message={errorMessage} />
          ) : null}
          <FadeInUp reduced={reduced} delay={500}>
            <AppButton
              label={passwordReset.isPending ? 'Enviando…' : 'Enviar link'}
              loading={passwordReset.isPending}
              onPress={() => void handleSubmit()}
            />
          </FadeInUp>
        </View>
      </Screen>
      <CaptchaModal visible={captcha.visible} onComplete={captcha.onComplete} />
    </RequireGuest>
  )
}

// Entrada staggered — copia local del FadeInUp de login/signup (tercer
// uso: candidato a extraerse a components/auth/ en un cleanup futuro).
interface FadeInUpProps {
  delay?: number
  duration?: number
  reduced?: boolean
  style?: object
  children: React.ReactNode
}

function FadeInUp({ delay = 0, duration = 600, reduced, style, children }: FadeInUpProps) {
  const y = useSharedValue(reduced ? 0 : 8)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) {
      y.value = 0
      opacity.value = 1
      return
    }
    y.value = withDelay(delay, withTiming(0, { duration, easing: Easing.out(Easing.cubic) }))
    opacity.value = withDelay(delay, withTiming(1, { duration }))
  }, [delay, duration, opacity, reduced, y])
  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }))
  return <Animated.View style={[style, animated]}>{children}</Animated.View>
}

// Métricas espejadas de login-screen.tsx — cualquier cambio allá debe
// reflejarse acá para que las tres superficies de auth lean como una.
const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 16,
    gap: 0,
  },
  screenBody: {
    flex: 1,
    justifyContent: 'space-between',
  },
  // Con el numpad abierto: empaquetar arriba (en vez de space-between) para que
  // las celdas + la acción suban y queden por encima del sheet.
  screenBodyNumpad: {
    justifyContent: 'flex-start',
    rowGap: 28,
  },
  topNav: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 0,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    padding: 8,
    margin: -8,
  },
  navSpacer: {
    width: 24,
  },
  heroBlockOuter: {
    paddingHorizontal: 28,
  },
  heroBlock: {
    alignItems: 'center',
  },
  actionsStack: {
    paddingHorizontal: 28,
    paddingTop: 12,
    gap: 14,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.2,
    marginBottom: 10,
    textAlign: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.5,
    textAlign: 'center',
  },
  sub: {
    marginTop: 18,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  subStrong: {
    fontWeight: '700',
  },
  codeLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
})
