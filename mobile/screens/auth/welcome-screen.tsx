import { useEffect } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
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
import { FernLogo } from '@/components/auth/fern-logo'
import { RiseView } from '@/components/home/animated/rise-view'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { markAuthTransitionLoaded } from '@/lib/auth-transition-splash'
import { authTokens } from '@/theme/palette'
import { motionDurations } from '@/lib/motion/tokens'

interface WelcomeScreenProps {
  onCreate: () => void
  onLogin: () => void
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
export function WelcomeScreen({ onCreate, onLogin }: WelcomeScreenProps) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const reduced = useReducedMotion()

  // ─── TEMP DEBUG (web layout shift investigation 2026-05-09) ─────────
  // Cada tick imprime el `top` del único wordmark inline (no como obj).
  // Detecta y loggea con [SHIFT] cualquier cambio de posición.
  // Tambien capturamos top de FernLogo (svg) y de ctaBlock (texto del
  // primer botón "Empezar") para ver QUÉ se está moviendo.
  useEffect(() => {
    if (Platform.OS !== 'web') return
    if (typeof document === 'undefined') return
    const startedAt = Date.now()
    let lastWordmarkTop: number | null = null
    let lastEmpezarTop: number | null = null
    let lastSvgTop: number | null = null

    const measure = () => {
      let wordmarkTop: number | null = null
      let empezarTop: number | null = null
      let svgTop: number | null = null
      document.querySelectorAll('div, span, svg').forEach((el) => {
        const tag = el.tagName.toLowerCase()
        const text = el.textContent
        const h = (el as HTMLElement).offsetHeight ?? 0
        if (h === 0) return
        if (tag === 'svg' && svgTop === null) {
          const r = (el as SVGElement).getBoundingClientRect()
          if (r.height > 100) svgTop = Math.round(r.top)
        }
        if (text === 'Manifiesto' && el.children.length === 0 && wordmarkTop === null) {
          wordmarkTop = Math.round((el as HTMLElement).getBoundingClientRect().top)
        }
        if (text === 'Empezar' && el.children.length === 0 && empezarTop === null) {
          empezarTop = Math.round((el as HTMLElement).getBoundingClientRect().top)
        }
      })
      return { wordmarkTop, empezarTop, svgTop }
    }

    const log = (tickNo: number) => {
      const { wordmarkTop, empezarTop, svgTop } = measure()
      const t = ((Date.now() - startedAt) / 1000).toFixed(2)
      const shifts: string[] = []
      if (lastWordmarkTop !== null && wordmarkTop !== lastWordmarkTop) {
        shifts.push(`WORDMARK ${lastWordmarkTop}→${wordmarkTop} (Δ${(wordmarkTop ?? 0) - lastWordmarkTop})`)
      }
      if (lastEmpezarTop !== null && empezarTop !== lastEmpezarTop) {
        shifts.push(`EMPEZAR ${lastEmpezarTop}→${empezarTop} (Δ${(empezarTop ?? 0) - lastEmpezarTop})`)
      }
      if (lastSvgTop !== null && svgTop !== lastSvgTop) {
        shifts.push(`SVG ${lastSvgTop}→${svgTop} (Δ${(svgTop ?? 0) - lastSvgTop})`)
      }
      const shiftStr = shifts.length > 0 ? ` ⚠ SHIFT: ${shifts.join(' | ')}` : ''
      console.log(
        `[t=${t}s tick=${tickNo}] wordmarkTop=${wordmarkTop} empezarTop=${empezarTop} svgTop=${svgTop} insets.top=${insets.top} dims=${width}x${height} reduced=${reduced}${shiftStr}`,
      )
      lastWordmarkTop = wordmarkTop
      lastEmpezarTop = empezarTop
      lastSvgTop = svgTop
    }
    log(0)
    const intervals: ReturnType<typeof setTimeout>[] = []
    for (let i = 1; i <= 30; i++) {
      intervals.push(setTimeout(() => log(i), i * 500))
    }
    return () => intervals.forEach(clearTimeout)
  }, [insets.top, insets.bottom, width, height, reduced])
  // ─── /TEMP DEBUG ────────────────────────────────────────────────────

  // This is a destination route reached after `router.replace` from
  // logout (and from the cold-start cascade when there's no session).
  // Hide the auth-transition splash on mount so the overlay fades out
  // and the user sees the CTAs underneath. Without this, the overlay
  // stays visible forever on the welcome screen because no guard
  // wraps this route to clear the flag.
  useEffect(() => {
    // Welcome rendered means we've reached a destination — let the
    // splash module decide whether to hide now (min visible elapsed)
    // or buffer until it does.
    markAuthTransitionLoaded()
  }, [])

  return (
    <View style={styles.root}>
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
            <PrimaryCta label="Empezar" onPress={onCreate} />
            <SecondaryCta label="Ya tengo cuenta" onPress={onLogin} />

            <Text style={styles.fineprint}>
              Al continuar aceptas los{' '}
              <Text style={styles.fineprintLink}>Términos</Text> y la{' '}
              <Text style={styles.fineprintLink}>Privacidad</Text>
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
function PrimaryCta({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
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
          <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
            <Path
              d="M5 3l5 5-5 5"
              stroke={authTokens.welcomeBg}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
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
    borderColor: 'rgba(255,251,242,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryCtaLabel: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
    color: '#FFFBF2',
  },
  fineprint: {
    marginTop: 22,
    fontSize: 11,
    fontWeight: '400',
    color: 'rgba(255,251,242,0.38)',
    textAlign: 'center',
  },
  fineprintLink: {
    textDecorationLine: 'underline',
    color: 'rgba(255,251,242,0.38)',
  },
})

export default WelcomeScreen
