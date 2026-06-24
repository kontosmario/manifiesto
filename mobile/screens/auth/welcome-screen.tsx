import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import {
  AuroraLayer,
  ParticleLayer,
} from '@/components/auth/auth-launch-splash'
import { WelcomeCancelDeletionBanner } from '@/components/common/welcome-cancel-deletion-banner'
import { FernLogo } from '@/components/auth/fern-logo'
import { RiseView } from '@/components/home/animated/rise-view'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/lib/legal-urls'
import { authTokens } from '@/theme/palette'
import { motionDurations } from '@/lib/motion/tokens'

interface WelcomeScreenProps {
  onCreate: () => void
  onLogin: () => void
  isBusy?: boolean
}


/**
 * Welcome screen — the first thing an unauthenticated visitor sees in the
 * (auth) stack. Full-bleed dark green background with two breathing aurora
 * blobs and 8 drifting particle dots. Hero stack centered low: Fern logo,
 * "Manifiesto." wordmark with a peach period, tagline. Two CTAs at the
 * bottom (Empezar / Ya tengo cuenta) plus a fine-print footer.
 *
 * Animation budget:
 * - Fern logo: handled internally (`animate delay=300`).
 * - Wordmark / tagline / CTA block: RiseView staggered at 1100/1300/1500ms
 *   to match the design's `fade-in-up` keyframes.
 * - Aurora: 2 blobs translate+scale at 14s / 18s on a sine cycle.
 * - Particles: each translates Y on a 10–14s sine cycle.
 * All loops are disabled under `useReducedMotion`.
 */
export function WelcomeScreen({ onCreate, onLogin, isBusy = false }: WelcomeScreenProps) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const reduced = useReducedMotion()

  // Destino guest: la máquina auth-flow nunca muestra el bridge en el
  // camino a welcome (probes → guest → navigate), y LOGOUT la deja en
  // `guest` con el overlay escondido — no hay splash que dismissear acá.

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <AuroraLayer width={width} height={height} />
      <ParticleLayer width={width} height={height} reduced={reduced} />

      <View
        style={[
          styles.contentStack,
          // Ver comentario gemelo en auth-launch-splash.tsx: en web
          // hardcodeamos paddingTop=24 para evitar el race del
          // safe-area-provider que en native resuelve sync (insets
          // reales del notch) pero en web entrega 0 con un update
          // async que mid-fade del splash desalinea ambos hero
          // stacks. Native sigue usando insets.top.
          {
            paddingTop: Platform.OS === 'web' ? 24 : insets.top + 24,
            paddingBottom: 24,
          },
        ]}
      >
        <View style={styles.hero}>
          {/*
            The Fern v2 brand mark is horizontally symmetric — its
            stem sits at viewBox x≈405 (within 1.7% of the geometric
            centre). The asymmetric optical shift the v1 mark needed
            is no longer required; rendering the SVG with default flex
            centring puts the stem visually on-axis with the wordmark.
          */}
          <FernLogo size={220} palette="light" animate delay={300} />

          <RiseView delay={1100} duration={900} translateY={12}>
            <View style={styles.wordmarkRow}>
              <Text style={styles.wordmark}>Manifiesto</Text>
              <Text style={[styles.wordmark, styles.wordmarkDot]}>.</Text>
            </View>
          </RiseView>

          <RiseView delay={1300} duration={900} translateY={12}>
            <Text style={styles.tagline}>Finanzas para tu familia</Text>
          </RiseView>
        </View>

        <RiseView delay={1500} duration={900} translateY={12}>
          <View
            style={[
              styles.ctaBlock,
              { paddingBottom: Math.max(insets.bottom + 12, 24) },
            ]}
          >
            {/* J-Auth2: if the last-known user on this device has a
                pending account deletion, surface the warning + login
                CTA above the regular welcome controls so the rightful
                owner can sign back in and cancel. */}
            <WelcomeCancelDeletionBanner />
            <PrimaryCta busy={isBusy} label="Empezar" onPress={isBusy ? () => {} : onCreate} />
            <SecondaryCta label="Ya tengo cuenta" onPress={isBusy ? () => {} : onLogin} />

            <Text style={styles.dataDisclosure}>
              Solo guardamos tu email y lo que cargues acá (gastos, fijos, miembros del hogar). Nada se vende.
            </Text>
            <Text style={styles.fineprint}>
              Al continuar aceptas los{' '}
              <Text
                accessibilityRole="link"
                onPress={() => void Linking.openURL(TERMS_OF_SERVICE_URL)}
                style={styles.fineprintLink}
              >
                Términos
              </Text>{' '}
              y la{' '}
              <Text
                accessibilityRole="link"
                onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
                style={styles.fineprintLink}
              >
                Privacidad
              </Text>
            </Text>
          </View>
        </RiseView>
      </View>
    </View>
  )
}


// ─────────────────────────────────────────────────────────────
// CTAs
// ─────────────────────────────────────────────────────────────
function PrimaryCta({
  label,
  onPress,
  busy = false,
}: {
  label: string
  onPress: () => void
  busy?: boolean
}) {
  const scale = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy }}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.98, { duration: motionDurations.micro })
      }}
      onPressOut={() => {
        // @motion-allow: 160ms press-out scale; sits between micro (120) and quick (180) for snappy release
        scale.value = withTiming(1, { duration: 160 })
      }}
      hitSlop={8}
    >
      <Animated.View style={[styles.primaryCta, style]}>
        <Text style={styles.primaryCtaLabel}>{label}</Text>
        <View style={styles.primaryCtaArrow}>
          {busy ? (
            // Feedback del path "EMPEZAR con sesión colgada": mientras
            // logoutSession limpia el device, la flecha gira en spinner
            // (mismo chip, cero salto de layout).
            <ActivityIndicator size="small" color={authTokens.welcomeBg} />
          ) : (
            <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
              <Path
                d="M5 3l5 5-5 5"
                stroke={authTokens.welcomeBg}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          )}
        </View>
      </Animated.View>
    </Pressable>
  )
}

function SecondaryCta({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  const opacity = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => {
        opacity.value = withTiming(0.6, { duration: motionDurations.micro })
      }}
      onPressOut={() => {
        // @motion-allow: 160ms press-out opacity; sits between micro (120) and quick (180) for snappy release
        opacity.value = withTiming(1, { duration: 160 })
      }}
      hitSlop={8}
    >
      <Animated.View style={[styles.secondaryCta, style]}>
        <Text style={styles.secondaryCtaLabel}>{label}</Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: authTokens.welcomeBg,
    overflow: 'hidden',
  },
  contentStack: {
    flex: 1,
    paddingHorizontal: 28,
    zIndex: 2,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    // Center vertically AND push the stack downward so the Fern logo
    // itself lands near the visual middle of the screen — not just
    // the middle of the area above the CTAs (which would feel "too
    // high"). The wordmark sits as a caption immediately below.
    justifyContent: 'center',
    paddingTop: 120,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    // Tighter gap: the wordmark reads as a label for the logo
    // rather than a separate element floating below it.
    marginTop: 24,
  },
  wordmark: {
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -2,
    color: '#FFFBF2',
  },
  wordmarkDot: {
    color: authTokens.peach,
  },
  tagline: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.2,
    color: 'rgba(255,251,242,0.55)',
    textAlign: 'center',
  },
  // ⚠ Cualquier cambio de altura en este bloque (CTAs, disclosure,
  // fineprint, márgenes) DEBE espejarse en el ctaReserve invisible de
  // auth-launch-splash.tsx — si las alturas divergen, el fern del
  // welcome aterriza a distinta Y que el del splash y el handoff salta
  // (bug del 2026-06-11: el dataDisclosure se agregó solo acá y el
  // hero quedó ~20px más arriba).
  ctaBlock: {
    paddingTop: 8,
  },
  primaryCta: {
    width: '100%',
    height: 56,
    borderRadius: 18,
    backgroundColor: authTokens.surfaceCream,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: authTokens.softShadow,
  },
  primaryCtaLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: authTokens.welcomeBg,
  },
  primaryCtaArrow: {
    marginLeft: 8,
  },
  secondaryCta: {
    width: '100%',
    height: 52,
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,251,242,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryCtaLabel: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
    color: '#FFFBF2',
  },
  dataDisclosure: {
    marginTop: 22,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '400',
    color: 'rgba(255,251,242,0.55)',
    textAlign: 'center',
  },
  fineprint: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '400',
    color: 'rgba(255,251,242,0.62)',
    textAlign: 'center',
  },
  fineprintLink: {
    textDecorationLine: 'underline',
    color: 'rgba(255,251,242,0.74)',
  },
})

export default WelcomeScreen
