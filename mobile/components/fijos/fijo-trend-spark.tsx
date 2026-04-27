import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

interface FijoTrendSparkProps {
  points: number[]
  width?: number
  height?: number
}

/**
 * Tiny trendline sparkline — takes a series of prices (oldest → newest)
 * and draws a smooth path. Color shifts to match direction: up → peach,
 * down → green, flat → muted. Designed to sit at the right edge of a
 * Fijo row.
 */
export function FijoTrendSpark({ points, width = 56, height = 22 }: FijoTrendSparkProps) {
  if (points.length < 2) {
    return <View style={{ width, height }} />
  }

  const first = points[0]!
  const last = points[points.length - 1]!
  const diff = last - first
  const pctChange = first > 0 ? (diff / first) * 100 : 0
  const stroke =
    pctChange >= 1.5 ? '#C25A3E' : pctChange <= -1.5 ? '#2E7D5B' : '#8A8A8A'

  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const padY = 3
  const padX = 2
  const innerW = width - padX * 2
  const innerH = height - padY * 2
  const stepX = innerW / (points.length - 1)
  const coords = points.map((p, i) => ({
    x: padX + i * stepX,
    y: padY + innerH - ((p - min) / range) * innerH,
  }))

  // Cubic smoothing — each segment gets a control point derived from
  // the previous segment's midpoint, giving the subtle curve seen in the
  // design.
  const d = coords.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`
    const prev = coords[i - 1]!
    const midX = (prev.x + pt.x) / 2
    return `${acc} Q ${midX.toFixed(2)} ${prev.y.toFixed(2)} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`
  }, '')

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  )
}
