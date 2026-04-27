import { useMemo, useState } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
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

  useLoopAnimation(
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
      style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden', pointerEvents: 'none' }]}
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
      {size ? <ParticleField height={size.height} width={size.width} /> : null}
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

interface ParticleSpec {
  baseX: number
  baseY: number
  driftX: number
  driftY: number
  size: number
  period: number
  delay: number
  baseOpacity: number
}

const PARTICLE_COUNT = 22

function buildParticleSpecs(width: number, height: number): ParticleSpec[] {
  const specs: ParticleSpec[] = []
  let seed = 0xa1b2c3
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return (seed & 0xfffffff) / 0xfffffff
  }
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    specs.push({
      baseX: rand() * width,
      baseY: rand() * height,
      driftX: (rand() * 2 - 1) * 18,
      driftY: -(8 + rand() * 22),
      size: 1.5 + rand() * 2.5,
      period: 4200 + rand() * 4800,
      delay: rand() * 3000,
      baseOpacity: 0.18 + rand() * 0.32,
    })
  }
  return specs
}

function ParticleField({ height, width }: { height: number; width: number }) {
  const { theme } = useAppTheme()
  const specs = useMemo(() => buildParticleSpecs(width, height), [width, height])
  const tint = theme.isDark ? '#FFFFFF' : '#FFFFFF'
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {specs.map((spec, i) => (
        <Particle key={i} color={tint} spec={spec} />
      ))}
    </View>
  )
}

function Particle({ color, spec }: { color: string; spec: ParticleSpec }) {
  const t = useSharedValue(0)

  useLoopAnimation(
    () => {
      t.value = withDelay(
        spec.delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: spec.period, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: spec.period, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          false,
        ),
      )
    },
    [t],
  )

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: spec.driftX * t.value },
      { translateY: spec.driftY * t.value },
    ],
    opacity: spec.baseOpacity * (0.35 + 0.65 * t.value),
  }))

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: spec.baseX,
          top: spec.baseY,
          width: spec.size,
          height: spec.size,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  fallbackBlob: {
    position: 'absolute',
    borderRadius: 9999,
    opacity: 0.7,
  },
  particle: {
    position: 'absolute',
    borderRadius: 9999,
  },
})
