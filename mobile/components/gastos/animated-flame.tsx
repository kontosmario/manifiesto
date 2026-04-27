import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { USE_NATIVE_DRIVER } from '@/lib/runtime-environment'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type FlameStatus = 'active' | 'at_risk' | 'broken'

interface AnimatedFlameProps {
  status: FlameStatus
  /** Width of the SVG (height matches — 1:1 viewBox ratio). */
  size?: number
}

// ─────────────────────────────────────────────────────────────
// Palette per status — the component is theme-agnostic; every
// color needed lives here so callers only pass status + size.
// ─────────────────────────────────────────────────────────────

export const FLAME_PALETTE = {
  active: {
    outer: '#4caf50',
    outerBase: '#2e7d32',
    inner: '#81c784',
    core: '#c8e6c9',
    ring: 'rgba(76,175,80,0.18)',
  },
  at_risk: {
    outer: '#f0a060',
    outerBase: '#bf360c',
    inner: '#ffcc80',
    core: '#fff9c4',
    ring: 'rgba(240,160,96,0.22)',
  },
  broken: {
    outer: '#5A5A5A',
    outerBase: '#3A3A3A',
    inner: '#6A6A6A',
    core: '#8A8A8A',
    ring: 'transparent',
  },
} as const

// Flame path — viewBox "0 0 16 16", from flame-svgrepo-com.svg.
const PATH_FLAME =
  'M9.13 15l-.53-.77a1.85 1.85 0 0 0-.28-2.54 3.51 3.51 0 0 1-1.19-2c-1.56 2.23-.75 3.46 0 4.55l-.55.76A4.4 4.4 0 0 1 3 10.46S2.79 8.3 5.28 6.19c0 0 2.82-2.61 1.84-4.54L7.83 1a6.57 6.57 0 0 1 2.61 6.94 2.57 2.57 0 0 0 .56-.81l.87-.07c.07.12 1.84 2.93.89 5.3A4.72 4.72 0 0 1 9.13 15zm-2-6.95l.87.39a3 3 0 0 0 .92 2.48 2.64 2.64 0 0 1 1 2.8A3.241 3.241 0 0 0 11.8 12a4.87 4.87 0 0 0-.41-3.63 1.85 1.85 0 0 1-1.84.86l-.35-.68a5.31 5.31 0 0 0-.89-5.8C8.17 4.87 6 6.83 5.93 6.94 3.86 8.7 4 10.33 4 10.4a3.47 3.47 0 0 0 1.59 3.14C5 12.14 5 10.46 7.16 8.05h-.03z'

// ─────────────────────────────────────────────────────────────
// Animation hooks
// ─────────────────────────────────────────────────────────────

function useBreath(status: FlameStatus) {
  const scaleX = useRef(new Animated.Value(1)).current
  const scaleY = useRef(new Animated.Value(1)).current
  const translateY = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (status === 'broken') {
      scaleX.setValue(1)
      scaleY.setValue(1)
      translateY.setValue(0)
      return
    }
    const duration = status === 'active' ? 2800 : 1600
    const sx = status === 'active' ? 1.04 : 1.06
    const sy = status === 'active' ? 1.07 : 1.09
    const ty = status === 'active' ? -3 : -4

    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleX, { toValue: sx, duration: duration * 0.4, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(scaleY, { toValue: sy, duration: duration * 0.4, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(translateY, { toValue: ty, duration: duration * 0.4, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
        ]),
        Animated.parallel([
          Animated.timing(scaleX, { toValue: 0.97, duration: duration * 0.3, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(scaleY, { toValue: 1.03, duration: duration * 0.3, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(translateY, { toValue: -1, duration: duration * 0.3, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
        ]),
        Animated.parallel([
          Animated.timing(scaleX, { toValue: 1, duration: duration * 0.3, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(scaleY, { toValue: 1, duration: duration * 0.3, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(translateY, { toValue: 0, duration: duration * 0.3, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
        ]),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [status, scaleX, scaleY, translateY])

  return { scaleX, scaleY, translateY }
}

function useFlicker(status: FlameStatus) {
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (status !== 'at_risk') {
      opacity.setValue(status === 'broken' ? 0.55 : 1)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.75, duration: 180, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: 1, duration: 360, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: 0.6, duration: 150, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: 0.95, duration: 300, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: 0.7, duration: 120, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [status, opacity])
  return opacity
}

function useInnerDance(status: FlameStatus) {
  const scaleX = useRef(new Animated.Value(1)).current
  const scaleY = useRef(new Animated.Value(1)).current
  const translateY = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (status === 'broken') return
    const duration = status === 'active' ? 2800 : 1300
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleX, { toValue: 1.08, duration: duration * 0.35, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(scaleY, { toValue: 0.94, duration: duration * 0.35, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(translateY, { toValue: 2, duration: duration * 0.35, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
        ]),
        Animated.parallel([
          Animated.timing(scaleX, { toValue: 0.93, duration: duration * 0.3, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(scaleY, { toValue: 1.06, duration: duration * 0.3, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(translateY, { toValue: -2, duration: duration * 0.3, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
        ]),
        Animated.parallel([
          Animated.timing(scaleX, { toValue: 1, duration: duration * 0.35, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(scaleY, { toValue: 1, duration: duration * 0.35, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(translateY, { toValue: 0, duration: duration * 0.35, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
        ]),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [status, scaleX, scaleY, translateY])
  return { scaleX, scaleY, translateY }
}

function usePulseRing(status: FlameStatus) {
  const scale = useRef(new Animated.Value(1)).current
  const opacity = useRef(new Animated.Value(0.6)).current
  useEffect(() => {
    if (status === 'broken') {
      scale.setValue(1)
      opacity.setValue(0)
      return
    }
    const duration = status === 'active' ? 2400 : 1400
    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.2, duration, easing: Easing.out(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: 0, duration, easing: Easing.out(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
    )
    loop.start()
    return () => {
      loop.stop()
      scale.setValue(1)
      opacity.setValue(0.6)
    }
  }, [status, scale, opacity])
  return { scale, opacity }
}

function useDimPulse(status: FlameStatus) {
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (status !== 'broken') {
      opacity.setValue(1)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: 0.35, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [status, opacity])
  return opacity
}

// ─────────────────────────────────────────────────────────────
// Flame SVG — static path, wrappers handle transforms.
// ─────────────────────────────────────────────────────────────

interface FlamePalette {
  outer: string
  outerBase: string
  inner: string
  core: string
  ring: string
}

function FlameSVG({
  palette,
  width,
  height,
  flicker,
  innerDance,
  dimPulse,
}: {
  palette: FlamePalette
  width: number
  height: number
  flicker: Animated.Value
  innerDance: { scaleX: Animated.Value; scaleY: Animated.Value; translateY: Animated.Value }
  dimPulse: Animated.Value
}) {
  return (
    <Animated.View style={{ opacity: dimPulse }}>
      <Animated.View style={{ opacity: flicker }}>
        <Svg viewBox="0 0 16 16" width={width} height={height}>
          <Path d={PATH_FLAME} fill={palette.outerBase} />
          <Path d={PATH_FLAME} fill={palette.outer} opacity={0.92} />
        </Svg>
      </Animated.View>

      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [
              { scaleX: innerDance.scaleX },
              { scaleY: innerDance.scaleY },
              { translateY: innerDance.translateY },
            ],
          },
        ]}
      >
        <Svg viewBox="0 0 16 16" width={width} height={height}>
          <Path d={PATH_FLAME} fill={palette.inner} opacity={0.7} />
          <Path d={PATH_FLAME} fill={palette.core} opacity={0.75} />
        </Svg>
      </Animated.View>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────
// Public component — just the flame + aura ring. Badge/container
// chrome is handled by the caller so it can adapt to the theme.
// ─────────────────────────────────────────────────────────────

export function AnimatedFlame({ status, size = 42 }: AnimatedFlameProps) {
  const palette = FLAME_PALETTE[status]
  const breath = useBreath(status)
  const flicker = useFlicker(status)
  const innerDance = useInnerDance(status)
  const ring = usePulseRing(status)
  const dimPulse = useDimPulse(status)

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            width: size * 0.95,
            height: size * 0.95,
            borderRadius: size * 0.475,
            backgroundColor: palette.ring,
            transform: [{ scale: ring.scale }],
            opacity: ring.opacity,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.flameWrap,
          {
            width: size,
            height: size,
            transform: [
              { scaleX: breath.scaleX },
              { scaleY: breath.scaleY },
              { translateY: breath.translateY },
            ],
          },
        ]}
      >
        <FlameSVG
          palette={palette}
          width={size}
          height={size}
          flicker={flicker}
          innerDance={innerDance}
          dimPulse={dimPulse}
        />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ring: {
    position: 'absolute',
    alignSelf: 'center',
  },
  flameWrap: {
    position: 'relative',
  },
})
