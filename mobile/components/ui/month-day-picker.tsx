import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn } from 'react-native-reanimated'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { NeoSurface } from '@/components/ui/neo-surface'
import { triggerHaptic } from '@/lib/haptics'
import { neoCalendar, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

interface MonthDayPickerProps {
  /** Currently selected day (1..31). */
  value: number
  /** Called with the new day when the user taps a cell. */
  onChange: (day: number) => void
  /**
   * Optional accent color for the selected cell. Defaults to the redesign
   * green (`neo.green`); pass a color FROM THE NEO PALETTE (p. ej. un tono
   * de categoría del rediseño) para mantener continuidad visual. La tinta
   * del número la resuelve `neoCalendar[mode].today.text`, que está
   * verificada contra el verde del sistema en ambos temas — un accent
   * arbitrario fuera de paleta puede romper ese contraste.
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
 *
 * Rediseño 2026-07: la card es una superficie `raisedLg` sin borde y cada
 * día es un POZO (`neo.well` + `insetSm`); el elegido SALE del pozo con
 * `raisedSm` y el par de tinta de `neoCalendar[mode].today`.
 */
export function MonthDayPicker({
  value,
  onChange,
  accent,
  footer,
  disabled = false,
}: MonthDayPickerProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const cal = neoCalendar[theme.mode]
  const { t } = useTranslation()
  const accentColor = accent ?? neo.green
  // La tinta del día elegido se invierte con el tema igual que el fill:
  // en claro el verde es profundo (#2E7C39) y el número va crema; en
  // oscuro el verde es luminoso (#A4E3A6) y el número va casi negro.
  // Ese par ya viene resuelto —y verificado— en `neoCalendar.today`.
  const selectedNumColor = cal.today.text
  const safeValue = Math.min(31, Math.max(1, Math.floor(value)))

  const handlePick = (day: number) => {
    if (disabled || day === safeValue) return
    void triggerHaptic('selection')
    onChange(day)
  }

  return (
    <NeoSurface variant="raisedLg" radius={neoRadii.card} style={styles.card}>
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
                accessibilityLabel={t('states:monthDayPicker.dayLabel', { day })}
                accessibilityState={{ selected: true, disabled }}
                style={styles.cell}
              >
                <Animated.View
                  entering={FadeIn.duration(220)}
                  style={[
                    styles.cellInner,
                    styles.cellSelected,
                    {
                      backgroundColor: accentColor,
                      boxShadow: neo.shadows.raisedSm,
                    },
                  ]}
                >
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
              accessibilityLabel={t('states:monthDayPicker.dayLabel', { day })}
              accessibilityState={{ selected: false, disabled }}
              style={({ pressed }) => [
                styles.cell,
                pressed && !disabled && styles.cellPressed,
              ]}
            >
              <View
                style={[
                  styles.cellInner,
                  {
                    backgroundColor: neo.well,
                    boxShadow: neo.shadows.insetSm,
                    // El pozo y la card comparten familia de tono: sin el
                    // relieve inset (Android < 29) las 31 celdas se
                    // aplanarían contra la card y no habría dónde tocar.
                    borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
                    borderColor: neo.sheetDivider,
                  },
                ]}
              >
                <Text style={[styles.cellNum, { color: neo.text }]}>{day}</Text>
              </View>
            </Pressable>
          )
        })}
      </View>
      <Text style={[styles.footer, { color: neo.textMuted }]}>
        {footer ?? (
          <>
            {t('states:monthDayPicker.footerPrefix')}
            <Text style={[styles.footerStrong, { color: neo.text }]}>
              {t('states:monthDayPicker.footerDay', { day: safeValue })}
            </Text>
            {t('states:monthDayPicker.footerSuffix')}
          </>
        )}
      </Text>
    </NeoSurface>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
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
    borderRadius: neoRadii.calendarCell,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // `visible` para que el relieve `raisedSm` del día elegido no se recorte.
  cellSelected: {
    overflow: 'visible',
  },
  cellNum: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  cellNumSelected: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    // color is set inline based on theme — see selectedNumColor.
  },
  footer: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    textAlign: 'center',
  },
  footerStrong: {
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
})
