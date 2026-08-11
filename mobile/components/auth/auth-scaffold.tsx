import { useEffect, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useTranslation } from 'react-i18next'
import Svg, { Path } from 'react-native-svg'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { Screen } from '@/components/ui/screen'
import { FernLogo } from '@/components/auth/fern-logo'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

interface AuthShellProps {
  onBack: () => void
  eyebrow: string
  title: string
  subtitle?: ReactNode
  children?: ReactNode
}

/**
 * Scaffold compartido de las pantallas de auth: top-nav (chevron back + logo
 * fern centrado + spacer) y hero centrado (eyebrow → title → sub) con entrada
 * staggered. Replica 1:1 la anatomía de login/forgot-password para que todas
 * las superficies de acceso se lean como una sola. Los hijos van en el bloque
 * de acciones (abajo), con el hero en el medio (space-between).
 */
export function AuthShell({ onBack, eyebrow, title, subtitle, children }: AuthShellProps) {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()

  return (
    <Screen contentContainerStyle={styles.screenContent} bodyStyle={styles.screenBody}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />

      <View style={styles.topNav}>
        <Pressable
          accessibilityLabel={t('auth:common.back')}
          accessibilityRole="button"
          hitSlop={DEFAULT_HIT_SLOP}
          onPress={onBack}
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

      <View style={styles.heroBlockOuter}>
        <View style={styles.heroBlock}>
          <FadeInUp reduced={reduced} delay={100}>
            <Text style={[styles.eyebrow, { color: theme.colors.textSoft }]}>{eyebrow}</Text>
          </FadeInUp>
          <FadeInUp reduced={reduced} delay={200}>
            <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          </FadeInUp>
          {subtitle ? (
            <FadeInUp reduced={reduced} delay={300}>
              <Text style={[styles.sub, { color: theme.colors.textSoft }]}>{subtitle}</Text>
            </FadeInUp>
          ) : null}
        </View>
      </View>

      <View style={styles.actionsStack}>{children}</View>
    </Screen>
  )
}

interface FadeInUpProps {
  delay?: number
  duration?: number
  reduced?: boolean
  style?: object
  children: ReactNode
}

/** Entrada staggered de auth (fade + rise sutil). Compartida por las shells. */
export function FadeInUp({ delay = 0, duration = 600, reduced, style, children }: FadeInUpProps) {
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

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 16,
    gap: 0,
  },
  // Top-packed (no space-between): el contenido va debajo del hero, como un form
  // normal. Con space-between los inputs caían al fondo de la pantalla, lejos
  // del título → se veían "desfasados". rowGap separa nav / hero / acciones.
  screenBody: {
    flex: 1,
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
    fontFamily: nunitoFamily('500'),
    letterSpacing: -0.2,
    marginBottom: 10,
    textAlign: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -1.5,
    textAlign: 'center',
  },
  sub: {
    marginTop: 18,
    fontSize: 14,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
    textAlign: 'center',
    lineHeight: 20,
  },
})
