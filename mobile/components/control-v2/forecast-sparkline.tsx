// Forecast sparkline — 7-day mini chart with three trajectories.
//
// Pessimistic (top), baseline (middle), optimistic (bottom). The
// optimistic curve is the visible "good case" reference, baseline is
// the projected path, pessimistic is the warning ceiling. Inflection
// days are marked with a small dot.
//
// Design notes:
//  - SVG-only, no Reanimated. The chart is a glanceable header element;
//    motion would compete with the chat content below.
//  - The Y axis is normalized to the pessimistic max so the three
//    tracks share a comparable scale; the baseline number is shown
//    next to the chart so the magnitudes aren't lost.
//  - Width is responsive (parent passes `width`). Height is fixed.

import { memo, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg'
import type { Forecast7Day } from '@/features/insights/forecast-engine'

interface ForecastSparklineProps {
  forecast: Forecast7Day
  width: number
  /** Height defaults to 56 — fits the asistente header without crowding. */
  height?: number
  /** Tone aligned to the asistente header's mint accents. */
  accentColor?: string
}

const BASELINE_COLOR = 'rgba(199, 238, 156, 0.95)'
const PESSIMISTIC_COLOR = 'rgba(255, 200, 174, 0.85)'
const OPTIMISTIC_COLOR = 'rgba(199, 238, 156, 0.35)'
const INFLECTION_COLOR = '#F2C58A'
const GRID_COLOR = 'rgba(255, 255, 255, 0.06)'

const DOW_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const

export const ForecastSparkline = memo(function ForecastSparkline({
  forecast,
  width,
  height = 56,
  accentColor = BASELINE_COLOR,
}: ForecastSparklineProps) {
  const chartPaths = useMemo(() => {
    const series = [
      forecast.pessimistic.daily,
      forecast.baseline.daily,
      forecast.optimistic.daily,
    ]
    let max = 0
    for (const arr of series) {
      for (const v of arr) if (v > max) max = v
    }
    if (max <= 0) max = 1
    const pad = 6
    const innerW = Math.max(0, width - pad * 2)
    const innerH = Math.max(0, height - pad * 2 - 12) // reserve 12px for dow labels

    function pointsFor(arr: number[]): string {
      const last = arr.length - 1
      return arr
        .map((v, i) => {
          const x = pad + (last === 0 ? innerW / 2 : (i / last) * innerW)
          const y = pad + innerH - (v / max) * innerH
          return `${x.toFixed(1)},${y.toFixed(1)}`
        })
        .join(' ')
    }

    function pathArea(arr: number[]): string {
      // Filled area under the optimistic curve — nice "positive zone".
      const last = arr.length - 1
      if (last < 1) return ''
      const tops = arr.map((v, i) => {
        const x = pad + (i / last) * innerW
        const y = pad + innerH - (v / max) * innerH
        return [x, y] as const
      })
      const startY = pad + innerH
      const head = `M ${tops[0][0].toFixed(1)} ${startY.toFixed(1)} L ${tops[0][0].toFixed(1)} ${tops[0][1].toFixed(1)}`
      const lines = tops
        .slice(1)
        .map((p) => `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
        .join(' ')
      const tail = `L ${tops[last][0].toFixed(1)} ${startY.toFixed(1)} Z`
      return `${head} ${lines} ${tail}`
    }

    // Mirror the engine: forecast tracks start at `startOfDay(now+1d)`,
    // so day-zero of the chart is *that* date. Computing labels off
    // `generatedAt + 24h` (without rounding to midnight) drifts at the
    // calendar boundary when the forecast was generated late at night.
    const tomorrowDate = new Date(forecast.generatedAt)
    tomorrowDate.setDate(tomorrowDate.getDate() + 1)
    const tomorrowMs0 = new Date(
      tomorrowDate.getFullYear(),
      tomorrowDate.getMonth(),
      tomorrowDate.getDate(),
    ).getTime()
    const DAY_MS = 24 * 60 * 60 * 1000

    const dowLetters: { x: number; letter: string }[] = []
    if (forecast.baseline.daily.length > 1) {
      const last = forecast.baseline.daily.length - 1
      for (let i = 0; i < forecast.baseline.daily.length; i++) {
        const dayMs = tomorrowMs0 + i * DAY_MS
        const projectDow = (new Date(dayMs).getDay() + 6) % 7
        dowLetters.push({
          x: pad + (i / last) * innerW,
          letter: DOW_LABELS[projectDow],
        })
      }
    }

    const inflectionMarks: { x: number; y: number }[] = []
    if (forecast.baseline.daily.length > 1 && forecast.inflectionDays.length > 0) {
      const last = forecast.baseline.daily.length - 1
      for (const ev of forecast.inflectionDays) {
        const evMs = new Date(`${ev.day}T00:00:00`).getTime()
        const i = Math.round((evMs - tomorrowMs0) / DAY_MS)
        if (i < 0 || i > last) continue
        const dayValue = forecast.baseline.daily[i] ?? 0
        const x = pad + (i / last) * innerW
        const y = pad + innerH - (dayValue / max) * innerH
        inflectionMarks.push({ x, y })
      }
    }

    return {
      pessimistic: pointsFor(forecast.pessimistic.daily),
      baseline: pointsFor(forecast.baseline.daily),
      optimistic: pointsFor(forecast.optimistic.daily),
      optimisticArea: pathArea(forecast.optimistic.daily),
      gridY: pad + innerH,
      dowLetters,
      inflectionMarks,
      labelY: height - 4,
    }
  }, [forecast, width, height])

  if (width <= 0) return null

  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height}>
        {/* Baseline grid line */}
        <Rect
          x={6}
          y={chartPaths.gridY}
          width={width - 12}
          height={1}
          fill={GRID_COLOR}
        />
        {/* Optimistic area (positive zone) */}
        {chartPaths.optimisticArea ? (
          <Path d={chartPaths.optimisticArea} fill={OPTIMISTIC_COLOR} />
        ) : null}
        {/* Pessimistic top line — dashed */}
        <Polyline
          points={chartPaths.pessimistic}
          fill="none"
          stroke={PESSIMISTIC_COLOR}
          strokeWidth={1.4}
          strokeDasharray="3 3"
          strokeLinejoin="round"
        />
        {/* Baseline center line */}
        <Polyline
          points={chartPaths.baseline}
          fill="none"
          stroke={accentColor}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        {/* Inflection marks on baseline */}
        {chartPaths.inflectionMarks.map((m, i) => (
          <Circle
            key={i}
            cx={m.x}
            cy={m.y}
            r={2.6}
            fill={INFLECTION_COLOR}
            stroke="#0F2A1E"
            strokeWidth={1}
          />
        ))}
      </Svg>
      <View
        style={[
          styles.labelsRow,
          { width, position: 'absolute', bottom: 0, paddingHorizontal: 6 },
        ]}
      >
        {chartPaths.dowLetters.map((d, i) => (
          <Text
            key={i}
            style={[
              styles.dowLetter,
              {
                position: 'absolute',
                left: d.x - 4,
              },
            ]}
          >
            {d.letter}
          </Text>
        ))}
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  labelsRow: {
    height: 12,
  },
  dowLetter: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.45)',
    letterSpacing: 0.4,
  },
})

