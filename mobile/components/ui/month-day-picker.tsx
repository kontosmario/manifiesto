import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { withAlpha } from '@/theme/color-utils'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

interface MonthDayPickerProps {
  /** Currently selected day (1..31). */
  value: number
  /** Called with the new day when the user taps a cell. */
  onChange: (day: number) => void
  /**
   * Optional accent color for the selected cell. Defaults to the
   * theme primary; pass a category color to keep visual continuity
   * with surfaces like add-fijo.
   */
  accent?: string
  /** Footer copy slot — pass a custom string to override the default. */
  footer?: string
  /** Disable interaction (read-only preview mode). */
  disabled?: boolean
}

/**
 * Day-of-month picker rendered as a 7-column calendar grid (1..31).
 *
 * Matches the visual language of the read-only `CalendarDropImpact`
 * preview in `add-fijo-v2-screen` so users see the same surface in
 * onboarding (salary day) and when adding a fixed expense — but here
 * every cell is a 44x44pt-equivalent tappable target. The weekday
 * header from the fixed-expense preview is intentionally omitted:
 * "día 12 de cada mes" has no weekday semantic, so showing L/M/M/J/V/S/D
 * would be misleading.
 */
export function MonthDayPicker({
  value,
  onChange,
  accent,
  footer,
  disabled = false,
}: MonthDayPickerProps) {
  const { theme } = useAppTheme()
  const accentColor = accent ?? theme.colors.primary
  // Selected-cell number color flips with theme: in light mode the
  // accent gradient is `brand.deep` (very dark green) so the number
  // needs to be light to read. In dark mode the gradient is
  // `brand.bright` (luminous green) so the number stays near-black.
  // Same pattern fijos-header uses for its add button glyph.
  const selectedNumColor = theme.isDark ? '#0A1410' : '#F6FBEF'
  const safeValue = Math.min(31, Math.max(1, Math.floor(value)))

  const handlePick = (day: number) => {
    if (disabled || day === safeValue) return
    void triggerHaptic('selection')
    onChange(day)
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
      ]}
    >
      <View style={styles.grid}>
        {Array.from({ length: 31 }).map((_, idx) => {
          const day = idx + 1
          const isSelected = day === safeValue

          if (isSelected) {
            return (
              <Pressable
                key={day}
                disabled={disabled}
                onPress={() => handlePick(day)}
                accessibilityRole="button"
                accessibilityLabel={`Día ${day}`}
                accessibilityState={{ selected: true, disabled }}
                style={styles.cell}
              >
                <Animated.View
                  entering={FadeIn.duration(220)}
                  style={[styles.cellInner, styles.cellSelected]}
                >
                  <LinearGradient
                    colors={[accentColor, withAlpha(accentColor, 0.85)] as unknown as readonly [string, string, ...string[]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        borderRadius: 8,
                        boxShadow: `0px 6px 12px -4px ${withAlpha(accentColor, 0.5)}`,
                      } as unknown as object,
                    ]}
                  />
                  <Text style={[styles.cellNumSelected, { color: selectedNumColor }]}>
                    {day}
                  </Text>
                </Animated.View>
              </Pressable>
            )
          }

          return (
            <Pressable
              key={day}
              disabled={disabled}
              onPress={() => handlePick(day)}
              accessibilityRole="button"
              accessibilityLabel={`Día ${day}`}
              accessibilityState={{ selected: false, disabled }}
              style={({ pressed }) => [
                styles.cell,
                pressed && !disabled && styles.cellPressed,
              ]}
            >
              <View
                style={[
                  styles.cellInner,
                  { backgroundColor: theme.colors.creamSoft },
                ]}
              >
                <Text style={[styles.cellNum, { color: theme.colors.textMuted }]}>
                  {day}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>
      <Text style={[styles.footer, { color: theme.colors.textMuted }]}>
        {footer ?? (
          <>
            Cobras el{' '}
            <Text style={{ color: theme.colors.text, fontWeight: '800' }}>día {safeValue}</Text>{' '}
            de cada mes
          </>
        )}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 6,
  },
  cell: {
    // 7-column grid → ~14.28% per cell. The inner View carries the
    // visual surface; the Pressable spans the full slot to maximize
    // the tappable area.
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 3,
  },
  cellPressed: {
    opacity: 0.7,
  },
  cellInner: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cellSelected: {
    overflow: 'visible',
  },
  cellNum: {
    fontSize: 13,
    fontWeight: '700',
  },
  cellNumSelected: {
    fontSize: 14,
    fontWeight: '800',
    // color is set inline based on theme — see selectedNumColor.
  },
  footer: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
})
