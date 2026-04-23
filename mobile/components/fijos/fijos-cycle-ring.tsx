import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Line, Stop } from 'react-native-svg'
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

// react-native-svg's Circle and Defs are typed strictly; wrap them so
// children TypeScript-check without yelling about children prop.
const DefsFC = Defs as unknown as React.FC<{ children?: React.ReactNode }>
const SvgLinearGradientFC = SvgLinearGradient as unknown as React.FC<{
  id: string
  x1: string
  y1: string
  x2: string
  y2: string
  children?: React.ReactNode
}>

interface FijosCycleRingProps {
  paidPct: number // 0..100
  pendingPct: number
  overduePct: number
  size?: number
  thickness?: number
}

/**
 * Orbital ring for the Fijos hero — three animated arcs (paid →
 * pending → overdue) stacked around a common circumference, with 12
 * tick marks to read like a monthly dial. Each arc draws itself in
 * with a cubic-bezier stroke-dasharray tween on mount.
 */
export function FijosCycleRing({
  paidPct,
  pendingPct,
  overduePct,
  size = 200,
  thickness = 18,
}: FijosCycleRingProps) {
  const reduced = useReducedMotion()
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const cx = size / 2
  const cy = size / 2

  const paidLen = (paidPct / 100) * circumference
  const pendingLen = (pendingPct / 100) * circumference
  const overdueLen = (overduePct / 100) * circumference
  const paidOffset = 0
  const pendingOffset = paidLen
  const overdueOffset = paidLen + pendingLen

  const paidProgress = useSharedValue(reduced ? paidLen : 0)
  const pendingProgress = useSharedValue(reduced ? pendingLen : 0)
  const overdueProgress = useSharedValue(reduced ? overdueLen : 0)

  useEffect(() => {
    if (reduced) {
      paidProgress.value = paidLen
      pendingProgress.value = pendingLen
      overdueProgress.value = overdueLen
      return
    }
    paidProgress.value = 0
    pendingProgress.value = 0
    overdueProgress.value = 0
    paidProgress.value = withDelay(
      300,
      withTiming(paidLen, { duration: 1400, easing: Easing.bezier(0.2, 0.9, 0.2, 1) }),
    )
    pendingProgress.value = withDelay(
      600,
      withTiming(pendingLen, { duration: 1400, easing: Easing.bezier(0.2, 0.9, 0.2, 1) }),
    )
    overdueProgress.value = withDelay(
      900,
      withTiming(overdueLen, { duration: 1400, easing: Easing.bezier(0.2, 0.9, 0.2, 1) }),
    )
  }, [paidLen, pendingLen, overdueLen, reduced, paidProgress, pendingProgress, overdueProgress])

  const paidAnimatedProps = useAnimatedProps(() => ({
    strokeDasharray: `${paidProgress.value} ${circumference}`,
  }))
  const pendingAnimatedProps = useAnimatedProps(() => ({
    strokeDasharray: `${pendingProgress.value} ${circumference}`,
  }))
  const overdueAnimatedProps = useAnimatedProps(() => ({
    strokeDasharray: `${overdueProgress.value} ${circumference}`,
  }))

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <DefsFC>
          <SvgLinearGradientFC id="fj-paid" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#C7EE9C" />
            <Stop offset="1" stopColor="#6FE09A" />
          </SvgLinearGradientFC>
          <SvgLinearGradientFC id="fj-pending" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#F2B58A" />
            <Stop offset="1" stopColor="#E8976A" />
          </SvgLinearGradientFC>
          <SvgLinearGradientFC id="fj-overdue" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#D96A4F" />
            <Stop offset="1" stopColor="#B84F35" />
          </SvgLinearGradientFC>
        </DefsFC>

        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="rgba(246,251,239,0.08)"
          strokeWidth={thickness}
        />

        {/* Rotate -90° so arcs start at the top of the ring. */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="url(#fj-paid)"
          strokeWidth={thickness}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          strokeDashoffset={-paidOffset}
          animatedProps={paidAnimatedProps}
        />
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="url(#fj-pending)"
          strokeWidth={thickness}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          strokeDashoffset={-pendingOffset}
          animatedProps={pendingAnimatedProps}
        />
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="url(#fj-overdue)"
          strokeWidth={thickness}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          strokeDashoffset={-overdueOffset}
          animatedProps={overdueAnimatedProps}
        />

        {/* 12 tick marks around the inner edge. */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * 2 * Math.PI - Math.PI / 2
          const innerR = radius - thickness / 2 + 4
          const outerR = radius - thickness / 2 + 8
          return (
            <Line
              key={i}
              x1={cx + innerR * Math.cos(angle)}
              y1={cy + innerR * Math.sin(angle)}
              x2={cx + outerR * Math.cos(angle)}
              y2={cy + outerR * Math.sin(angle)}
              stroke="rgba(246,251,239,0.2)"
              strokeWidth={1}
              strokeLinecap="round"
            />
          )
        })}
      </Svg>
    </View>
  )
}

export const fijosCycleRingStyles = StyleSheet.create({})
