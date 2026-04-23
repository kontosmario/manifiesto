import { useEffect, useMemo, useRef } from 'react'
import { View } from 'react-native'
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg'
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { BreatheDot } from '@/components/home/animated/breathe-dot'

const AnimatedPath = Animated.createAnimatedComponent(Path)

interface HeroSparklineProps {
  data: number[]
  width?: number
  height?: number
  color: string
  fillColor: string
  delayMs?: number
}

export function HeroSparkline({ data, width = 320, height = 58, color, fillColor, delayMs = 400 }: HeroSparklineProps) {
  const reduced = useReducedMotion()
  const pad = 4
  const { path, area, end, length } = useMemo(() => buildPath(data, width, height, pad), [data, width, height])
  const progress = useSharedValue(reduced ? 0 : length)

  useEffect(() => {
    if (reduced) {
      progress.value = 0
      return
    }
    progress.value = length
    progress.value = withDelay(delayMs, withTiming(0, { duration: 1400, easing: Easing.out(Easing.cubic) }))
  }, [length, delayMs, reduced, progress])

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: progress.value }))

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="hsl-g" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={fillColor} stopOpacity={1} />
            <Stop offset="1" stopColor={fillColor} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#hsl-g)" opacity={0.9} />
        <AnimatedPath
          d={path}
          stroke={color}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={length}
          animatedProps={animatedProps}
        />
        <Circle cx={end.x} cy={end.y} r={4} fill={color} />
      </Svg>
      <BreatheDot
        size={10}
        color={color}
        glow={color}
        style={{ position: 'absolute', left: end.x - 5, top: end.y - 5 }}
      />
    </View>
  )
}

function buildPath(data: number[], w: number, h: number, pad: number) {
  if (data.length === 0) return { path: '', area: '', end: { x: pad, y: h - pad }, length: 0 }
  const max = Math.max(...data)
  const min = Math.min(...data)
  const points = data.map((v, i) => {
    const x = pad + (i / Math.max(1, data.length - 1)) * (w - 2 * pad)
    const y = pad + (1 - (v - min) / Math.max(1, max - min)) * (h - 2 * pad)
    return { x, y }
  })
  const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ')
  const area = `${path} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`
  let length = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    length += Math.sqrt(dx * dx + dy * dy)
  }
  return { path, area, end: points[points.length - 1], length }
}
