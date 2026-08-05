import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated'
import { useUnboundedLoopAnimation } from '@/hooks/use-unbounded-loop-animation'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Ambient background blobs.
 *
 * `tone`:
 *   · 'aurora' (default) — the warm mint/peach aurora glows. Used on
 *     light surfaces and any screen that still wants the lively
 *     ambience.
 *   · 'calm' — soft forest-green halos at low opacity, tuned for the
 *     Home near-black dark canvas. After the "too green" feedback we
 *     dropped the bright aurora in dark; these reintroduce gentle
 *     depth that echoes the card surface (surfaceMuted #0F2E1F /
 *     creamCard #305A47) without the saturated mint/peach that tired
 *     the eye. Monochromatic green, large + faint = barely audible.
 */
type AmbientTone = 'aurora' | 'calm'

interface AmbientBlobsProps {
  tone?: AmbientTone
}

// Calm-tone palette: forest greens between surfaceMuted (#0F2E1F) and
// creamCard (#305A47). Alpha is applied via the `opacity` field below,
// so these stay solid hex for easy tuning.
const CALM_GREEN = '#2B5641'
const CALM_GREEN_DEEP = '#1C3A29'

export const AmbientBlobs = memo(function AmbientBlobs({ tone = 'aurora' }: AmbientBlobsProps) {
  const { theme } = useAppTheme()
  const a = useSharedValue(0)
  const b = useSharedValue(0)
  const c = useSharedValue(0)
  // Ambient background blobs — never pause, even on blur. See the
  // matching comment in hero-aurora.tsx for the rationale.
  useUnboundedLoopAnimation(
    () => {
      const loop = (sv: typeof a, period: number) => {
        sv.value = withRepeat(
          withSequence(
            withTiming(-10, { duration: period / 2, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: period / 2, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          false,
        )
      }
      loop(a, 9000)
      loop(b, 11000)
      loop(c, 13000)
    },
    [a, b, c],
  )
  const aStyle = useAnimatedStyle(() => ({ transform: [{ translateY: a.value }] }))
  const bStyle = useAnimatedStyle(() => ({ transform: [{ translateY: b.value }] }))
  const cStyle = useAnimatedStyle(() => ({ transform: [{ translateY: c.value }] }))

  const isCalm = tone === 'calm'
  // Per-blob (color, opacity). Calm keeps the same drift + positions as
  // aurora but swaps to faint forest greens so the near-black canvas
  // gains depth without the saturated glow.
  const blobA = isCalm
    ? { color: CALM_GREEN, opacity: 0.22 }
    : { color: theme.colors.auroraA, opacity: 0.55 }
  const blobB = isCalm
    ? { color: CALM_GREEN_DEEP, opacity: 0.18 }
    : { color: theme.colors.auroraB, opacity: 0.32 }
  const blobC = isCalm
    ? { color: CALM_GREEN, opacity: 0.12 }
    : { color: theme.colors.auroraC, opacity: 0.35 }

  return (
    // overflow hidden es load-bearing en web: los blobs cuelgan fuera del
    // borde (right/left negativos) y sin clip ensanchan el scrollWidth del
    // contenedor de screens — un scrollIntoView del navegador (focus de un
    // input) lo scrollea y TODA la pantalla queda corrida. En nativo no
    // cambia nada: esas zonas ya caían fuera del viewport.
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
      <Animated.View style={[styles.blob, { top: -70, right: -50, width: 240, height: 240, backgroundColor: blobA.color, opacity: blobA.opacity }, aStyle]} />
      <Animated.View style={[styles.blob, { top: 440, left: -80, width: 240, height: 240, backgroundColor: blobB.color, opacity: blobB.opacity }, bStyle]} />
      <Animated.View style={[styles.blob, { top: 1000, right: -60, width: 260, height: 260, backgroundColor: blobC.color, opacity: blobC.opacity }, cStyle]} />
    </View>
  )
})

const styles = StyleSheet.create({
  blob: { position: 'absolute', borderRadius: 9999 },
  clip: { overflow: 'hidden' },
})
