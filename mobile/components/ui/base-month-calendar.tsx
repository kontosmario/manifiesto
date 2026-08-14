import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { NeoSurface } from '@/components/ui/neo-surface'
import { triggerHaptic } from '@/lib/haptics'
import { neoCalendar, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Calendar-month grid para pickear una fecha específica.
 *
 * Chrome alineado con `MonthDayPicker` (misma card `raisedLg`, misma
 * cell math, mismo par fill/tinta para el día elegido) para que el picker
 * se sienta consistente cuando el user switchea entre tipos de ciclo
 * en `CycleConfigSection`.
 *
 * Diferencias vs MonthDayPicker:
 *   - Calendar-month (no 1..31), día 1 puede caer en cualquier columna.
 *   - Weekday headers (L/M/M/J/V/S/D) — al pickear una fecha el
 *     weekday importa.
 *   - Chevrons prev/next para navegar entre meses.
 *   - Devuelve ISO date strings via `onSelectDay`.
 *
 * Rediseño 2026-07: cada día es un POZO (`neo.well` + `insetSm`); el
 * elegido SALE del pozo (`raisedSm`) y "hoy" se marca con INVERSIÓN de
 * fill (`neoCalendar.today`), no con outline. Los días no seleccionables
 * pierden el fill y quedan en `neoCalendar.future`.
 */
export interface BaseMonthCalendarDay {
  isoDate: string
  dayOfMonth: number
  weekday: number
  isToday: boolean
  selectable: boolean
}

export interface BaseMonthCalendarProps {
  initialYear: number
  initialMonth: number // 0-11
  selectedIsoDate: string | null
  today: Date
  allowedRange?: { startIso: string; endIso: string }
  renderDayDecorator?: (day: BaseMonthCalendarDay) => React.ReactNode
  onSelectDay: (isoDate: string) => void
  /**
   * Fill del día elegido. Default: `neo.green`. Pasar SIEMPRE un color de
   * la paleta neo — la tinta del número sale de `neoCalendar.today.text`,
   * verificada contra el verde del sistema en ambos temas.
   */
  accent?: string
}

export function BaseMonthCalendar({
  initialYear,
  initialMonth,
  selectedIsoDate,
  today,
  allowedRange,
  renderDayDecorator,
  onSelectDay,
  accent,
}: BaseMonthCalendarProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const cal = neoCalendar[theme.mode]
  const { t } = useTranslation()
  const weekdays = t('states:calendar.weekdays', { returnObjects: true }) as string[]
  const monthNames = t('states:calendar.months', { returnObjects: true }) as string[]
  const accentColor = accent ?? neo.green
  const selectedNumColor = cal.today.text
  // Los chips de navegación son superficies elevadas: sin el boxShadow
  // (Android < 28/29) su fill queda casi al ras de la card, así que ahí
  // —y sólo ahí— cae a un hairline. Mismo patrón que `NeoButton` ghost.
  const reliefFallbackBorder = SUPPORTS_INSET_SHADOW ? 0 : 1

  const [{ year, month }, setView] = useState({
    year: initialYear,
    month: initialMonth,
  })

  const cells = buildMonthGrid(year, month, allowedRange)
  const todayIso = formatIso(today)

  const handlePick = (day: BaseMonthCalendarDay) => {
    if (!day.selectable) return
    void triggerHaptic('selection')
    onSelectDay(day.isoDate)
  }

  const goPrev = () => {
    void triggerHaptic('selection')
    setView((v) =>
      v.month === 0
        ? { year: v.year - 1, month: 11 }
        : { year: v.year, month: v.month - 1 },
    )
  }
  const goNext = () => {
    void triggerHaptic('selection')
    setView((v) =>
      v.month === 11
        ? { year: v.year + 1, month: 0 }
        : { year: v.year, month: v.month + 1 },
    )
  }

  const chevronSkin = {
    backgroundColor: neo.surface,
    boxShadow: neo.shadows.raisedSm,
    borderWidth: reliefFallbackBorder,
    borderColor: neo.sheetDivider,
  }

  return (
    <NeoSurface variant="raisedLg" radius={neoRadii.card} style={styles.card}>
      <View style={styles.header}>
        <Pressable
          onPress={goPrev}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('states:calendar.prevMonth')}
          style={({ pressed }) => [
            styles.chevron,
            chevronSkin,
            pressed && styles.chevronPressed,
          ]}
        >
          <MaterialIcons name="chevron-left" size={22} color={neo.text} />
        </Pressable>
        <Text style={[styles.monthLabel, { color: neo.text }]}>
          {monthNames[month]} {year}
        </Text>
        <Pressable
          onPress={goNext}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('states:calendar.nextMonth')}
          style={({ pressed }) => [
            styles.chevron,
            chevronSkin,
            pressed && styles.chevronPressed,
          ]}
        >
          <MaterialIcons name="chevron-right" size={22} color={neo.text} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {weekdays.map((w, idx) => (
          <View key={`h-${idx}`} style={styles.weekdayCell}>
            <Text style={[styles.weekdayText, { color: neo.textMuted }]}>{w}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, idx) => {
          if (!day) {
            return <View key={`spacer-${idx}`} style={styles.cell} />
          }
          const isSelected = day.isoDate === selectedIsoDate
          const isToday = day.isoDate === todayIso

          if (isSelected) {
            return (
              <Pressable
                key={day.isoDate}
                disabled={!day.selectable}
                onPress={() => handlePick(day)}
                accessibilityRole="button"
                accessibilityLabel={t('states:calendar.dayLabel', { day: day.dayOfMonth })}
                accessibilityState={{ selected: true, disabled: !day.selectable }}
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
                    {day.dayOfMonth}
                  </Text>
                </Animated.View>
                {renderDayDecorator?.(day)}
              </Pressable>
            )
          }

          // Tres estados restantes, todos tokenizados en `neoCalendar`:
          //  · hoy        → inversión de fill (sale del pozo, sin outline)
          //  · no elegible→ sin fill, tinta `future` (control deshabilitado)
          //  · resto      → pozo + tinta de contenido
          const isDisabled = !day.selectable
          const cellSurface = isToday
            ? {
                backgroundColor: cal.today.bg,
                boxShadow: neo.shadows.raisedSm,
              }
            : isDisabled
              ? { backgroundColor: 'transparent', boxShadow: neo.shadows.insetSm }
              : {
                  backgroundColor: neo.well,
                  boxShadow: neo.shadows.insetSm,
                  borderWidth: reliefFallbackBorder,
                  borderColor: neo.sheetDivider,
                }
          const numColor = isToday
            ? cal.today.text
            : isDisabled
              ? cal.future.text
              : neo.text
          const numWeight = isToday ? '800' : '700'

          return (
            <Pressable
              key={day.isoDate}
              disabled={isDisabled}
              onPress={() => handlePick(day)}
              accessibilityRole="button"
              accessibilityLabel={t('states:calendar.dayLabel', { day: day.dayOfMonth })}
              accessibilityState={{ selected: false, disabled: isDisabled }}
              style={({ pressed }) => [
                styles.cell,
                pressed && day.selectable && styles.cellPressed,
              ]}
            >
              <View style={[styles.cellInner, isToday && styles.cellSelected, cellSurface]}>
                <Text
                  style={[
                    styles.cellNum,
                    {
                      color: numColor,
                      fontWeight: numWeight,
                      fontFamily: nunitoFamily(numWeight),
                    },
                  ]}
                >
                  {day.dayOfMonth}
                </Text>
              </View>
              {renderDayDecorator?.(day)}
            </Pressable>
          )
        })}
      </View>
    </NeoSurface>
  )
}

function buildMonthGrid(
  year: number,
  month: number,
  allowedRange: { startIso: string; endIso: string } | undefined,
): (BaseMonthCalendarDay | null)[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  // 0=dom..6=sáb → convertir a "lunes primero" (0=lun..6=dom)
  const firstDayMondayIdx = (firstDay.getDay() + 6) % 7
  const grid: (BaseMonthCalendarDay | null)[] = Array(firstDayMondayIdx).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d)
    const iso = formatIso(date)
    const selectable = allowedRange
      ? iso >= allowedRange.startIso && iso <= allowedRange.endIso
      : true
    grid.push({
      isoDate: iso,
      dayOfMonth: d,
      weekday: date.getDay(),
      isToday: false,
      selectable,
    })
  }
  return grid
}

function formatIso(d: Date): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  chevron: {
    width: 32,
    height: 32,
    // 32/2 → circular. `neoRadii.pill` (22) dejaría de leerse como chip
    // redondo en una caja de 32pt.
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronPressed: { opacity: 0.5 },
  monthLabel: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
    textTransform: 'capitalize',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekdayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 6,
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 3,
  },
  cellPressed: { opacity: 0.7 },
  cellInner: {
    flex: 1,
    borderRadius: neoRadii.calendarCell,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // `visible` para que el relieve elevado (elegido / hoy) no se recorte.
  cellSelected: { overflow: 'visible' },
  cellNum: {
    fontSize: 13,
  },
  cellNumSelected: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
})
