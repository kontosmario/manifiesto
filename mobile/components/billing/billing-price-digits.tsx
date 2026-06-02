import { memo, useEffect, useState } from 'react'
import { StyleSheet, Text, type TextStyle, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { computeDigitColumns } from './digit-roll-math'

interface BillingPriceDigitsProps {
  /** Non-negative value to display. */
  value: number
  /** Number of fractional digits to render. Default 2. */
  fractionDigits?: number
  /** Style applied to each digit Text (font size, weight, color, letter-spacing). */
  digitStyle: TextStyle
  /** Optional decimal separator. Default '.'. */
  separator?: string
  /** Style applied to the separator Text. */
  separatorStyle?: TextStyle
  /** Optional accessibility label override for the whole price. */
  accessibilityLabel?: string
}

const DIGIT_DURATION_MS = 380
const STAGGER_MS = 60
// Approximate ratio between digit advance and font size for tabular-nums fonts.
// Used as fallback width before onLayout measures the real "8" glyph.
const FALLBACK_DIGIT_WIDTH_RATIO = 0.62

export const BillingPriceDigits = memo(function BillingPriceDigits({
  value,
  fractionDigits = 2,
  digitStyle,
  separator = '.',
  separatorStyle,
  accessibilityLabel,
}: BillingPriceDigitsProps) {
  const reduced = useReducedMotion()
  const cols = computeDigitColumns(value, fractionDigits)

  const fontSize = typeof digitStyle.fontSize === 'number' ? digitStyle.fontSize : 24
  const lineHeight = typeof digitStyle.lineHeight === 'number' ? digitStyle.lineHeight : fontSize * 1.1
  const fallbackWidth = Math.ceil(fontSize * FALLBACK_DIGIT_WIDTH_RATIO)

  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null)
  const digitWidth = measuredWidth ?? fallbackWidth

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? `${value.toFixed(fractionDigits).replace('.', ' con ')}`}
      style={styles.row}
    >
      {/* Hidden measurer — measures one tabular '8' glyph once for stable column width. */}
      <Text
        onLayout={(e) => {
          if (measuredWidth == null) setMeasuredWidth(Math.ceil(e.nativeEvent.layout.width))
        }}
        style={[digitStyle, styles.measurer]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        8
      </Text>

      {cols.integer.map((target, idx) => (
        <DigitColumn
          key={`int-${idx}`}
          target={target}
          delayMs={idx * STAGGER_MS}
          width={digitWidth}
          height={lineHeight}
          digitStyle={digitStyle}
          reduced={reduced}
        />
      ))}
      {cols.fraction.length > 0 ? (
        <Text style={[digitStyle, separatorStyle]} accessibilityElementsHidden importantForAccessibility="no">
          {separator}
        </Text>
      ) : null}
      {cols.fraction.map((target, idx) => (
        <DigitColumn
          key={`frac-${idx}`}
          target={target}
          delayMs={(cols.integer.length + idx) * STAGGER_MS}
          width={digitWidth}
          height={lineHeight}
          digitStyle={digitStyle}
          reduced={reduced}
        />
      ))}
    </View>
  )
})

interface DigitColumnProps {
  target: number // 0..9
  delayMs: number
  width: number
  height: number
  digitStyle: TextStyle
  reduced: boolean
}

const DigitColumn = memo(function DigitColumn({
  target,
  delayMs,
  width,
  height,
  digitStyle,
  reduced,
}: DigitColumnProps) {
  const offset = useSharedValue(-target * height)

  useEffect(() => {
    const targetOffset = -target * height
    if (reduced) {
      offset.value = targetOffset
      return
    }
    offset.value = withDelay(
      delayMs,
      withTiming(targetOffset, {
        duration: DIGIT_DURATION_MS,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
      }),
    )
  }, [target, height, reduced, offset, delayMs])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }))

  return (
    <View style={[styles.column, { width, height, overflow: 'hidden' }]}>
      <Animated.View style={animatedStyle}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <Text
            key={d}
            style={[digitStyle, { height, lineHeight: height, textAlign: 'center' }]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  )
})

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  measurer: {
    position: 'absolute',
    opacity: 0,
  },
  column: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
})
