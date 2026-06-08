import { useState } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useUnboundedLoopAnimation } from '@/hooks/use-unbounded-loop-animation'
import { getOptionalSkiaModule } from '@/lib/optional-skia'
import { useAppTheme } from '@/theme/theme-provider'

interface HeroAuroraProps {
  radius?: number
}

export function HeroAurora({ radius = 28 }: HeroAuroraProps) {
  const { theme } = useAppTheme()
  const skia = getOptionalSkiaModule()
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  const a = useSharedValue(0)
  const b = useSharedValue(0)
  const c = useSharedValue(0)

  // Aurora drives Skia shader uniforms — `useUnboundedLoopAnimation`
  // (no focus gating) instead of `useLoopAnimation`. With focus
  // gating, navigating away from Home and back caused the loops to
  // get cancelled and not always restart cleanly (combined with the
  // Stack's `freezeOnBlur: true`). Ambient background animations
  // should never pause from the user's perspective.
  useUnboundedLoopAnimation(
    () => {
      const loop = (sv: SharedValue<number>, period: number) => {
        sv.value = withRepeat(
          withSequence(
            withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: period, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          false,
        )
      }
      loop(a, 4500)
      loop(b, 5500)
      loop(c, 6500)
    },
    [a, b, c],
  )

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    if (!size || size.width !== width || size.height !== height) {
      setSize({ width, height })
    }
  }

  return (
    <View
      onLayout={onLayout}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}
    >
      {skia && size ? (
        <SkiaAurora
          a={a}
          b={b}
          c={c}
          colorA={theme.colors.auroraA}
          colorB={theme.colors.auroraB}
          colorC={theme.colors.auroraC}
          height={size.height}
          width={size.width}
        />
      ) : (
        <FallbackAurora
          colorA={theme.colors.auroraA}
          colorB={theme.colors.auroraB}
          colorC={theme.colors.auroraC}
        />
      )}
      {/*
        ParticleField (22 Reanimated nodes — one per particle) was the
        single biggest contributor to the Home steady-state UI thread
        budget. The Skia aurora circles already provide enough soft
        motion at the hero, so the particles were near-invisible at
        steady state. Removed entirely; if a richer effect is desired
        in the future, it should land as a single Skia draw call (one
        canvas pintando todas las partículas en una pasada), not as
        N independent Animated.Views.
      */}
    </View>
  )
}

interface SkiaAuroraProps {
  a: SharedValue<number>
  b: SharedValue<number>
  c: SharedValue<number>
  colorA: string
  colorB: string
  colorC: string
  height: number
  width: number
}

function SkiaAurora({ a, b, c, colorA, colorB, colorC, height, width }: SkiaAuroraProps) {
  const cxA = useDerivedValue(() => width - 60 - 20 * a.value)
  const cyA = useDerivedValue(() => -20 + 30 * a.value)
  const rA = useDerivedValue(() => 110 + 16 * a.value)

  const cxB = useDerivedValue(() => 60 + 30 * b.value)
  const cyB = useDerivedValue(() => height - 40 - 20 * b.value)
  const rB = useDerivedValue(() => 100 + 18 * b.value)

  const cxC = useDerivedValue(() => width * 0.45 - 25 * c.value)
  const cyC = useDerivedValue(() => 100 - 15 * c.value)
  const rC = useDerivedValue(() => 80 + 22 * c.value)

  const skia = getOptionalSkiaModule()
  if (!skia) return null
  const { BlurMask, Canvas, Circle } = skia

  return (
    <Canvas style={{ width, height }}>
      <Circle color={colorA} cx={cxA} cy={cyA} r={rA} opacity={0.85}>
        <BlurMask blur={42} style="normal" />
      </Circle>
      <Circle color={colorB} cx={cxB} cy={cyB} r={rB} opacity={0.85}>
        <BlurMask blur={46} style="normal" />
      </Circle>
      <Circle color={colorC} cx={cxC} cy={cyC} r={rC} opacity={0.75}>
        <BlurMask blur={38} style="normal" />
      </Circle>
    </Canvas>
  )
}

function FallbackAurora({
  colorA,
  colorB,
  colorC,
}: {
  colorA: string
  colorB: string
  colorC: string
}) {
  return (
    <>
      <View
        style={[
          styles.fallbackBlob,
          { top: -40, right: -40, width: 200, height: 200, backgroundColor: colorA },
        ]}
      />
      <View
        style={[
          styles.fallbackBlob,
          { bottom: -50, left: -30, width: 180, height: 180, backgroundColor: colorB },
        ]}
      />
      <View
        style={[
          styles.fallbackBlob,
          { top: 60, left: '40%', width: 140, height: 140, backgroundColor: colorC },
        ]}
      />
    </>
  )
}

// ParticleField / buildParticleSpecs / Particle were removed: the
// hero card's particle layer now lives in `components/ui/card-particles.tsx`,
// which uses `useUnboundedLoopAnimation` so it never pauses on blur.
// HeroAurora keeps just the Skia aurora circles at the background.

const styles = StyleSheet.create({
  fallbackBlob: {
    position: 'absolute',
    borderRadius: 9999,
    opacity: 0.7,
  },
})
