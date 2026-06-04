import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useAppTheme } from '@/theme/theme-provider'

export interface BaseMonthCalendarDay {
  /** ISO YYYY-MM-DD (local tz) */
  isoDate: string
  /** Día del mes (1-31) */
  dayOfMonth: number
  /** 0=domingo, 6=sábado (JavaScript Date.getDay()) */
  weekday: number
  /** True si este día es "hoy" según el prop `today` */
  isToday: boolean
  /** True si está dentro del rango permitido (selectable) */
  selectable: boolean
}

export interface BaseMonthCalendarProps {
  /** Año del mes a renderizar (ej 2026) */
  year: number
  /** Mes 0-11 */
  month: number
  /** ISO YYYY-MM-DD del día seleccionado, o null */
  selectedIsoDate: string | null
  /** "Hoy" del user (Date en local tz) — usado solo para marcar el día con
   *  styling especial; NO restringe la selección. */
  today: Date
  /**
   * Rango opcional de fechas seleccionables (inclusive ambos extremos,
   * comparado como string ISO). Días fuera quedan deshabilitados al tap.
   */
  allowedRange?: { startIso: string; endIso: string }
  /** 0 = lunes primero (default), 1 = domingo primero */
  firstWeekdayOffset?: number
  /** Render opcional por día para overlays (moods, marks, etc) */
  renderDayDecorator?: (day: BaseMonthCalendarDay) => React.ReactNode
  /** Callback cuando el user toca un día selectable */
  onSelectDay: (isoDate: string) => void
}

export function BaseMonthCalendar({
  year,
  month,
  selectedIsoDate,
  today,
  allowedRange,
  firstWeekdayOffset = 0,
  renderDayDecorator,
  onSelectDay,
}: BaseMonthCalendarProps) {
  const { theme } = useAppTheme()
  const headers = weekdayHeaders(firstWeekdayOffset)
  const cells = buildMonthGrid(year, month, today, allowedRange, firstWeekdayOffset)

  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.grid}>
      {headers.map((label, idx) => (
        <View key={`h-${idx}`} style={styles.headerCell}>
          <Text style={[styles.headerText, { color: theme.colors.textMuted }]}>{label}</Text>
        </View>
      ))}
      {cells.map((day, idx) => {
        if (!day) {
          return <View key={`spacer-${idx}`} style={styles.cell} />
        }
        const isSelected = day.isoDate === selectedIsoDate
        return (
          <Pressable
            key={day.isoDate}
            onPress={() => day.selectable && onSelectDay(day.isoDate)}
            disabled={!day.selectable}
            style={({ pressed }) => [
              styles.cell,
              isSelected && [styles.selectedCell, { backgroundColor: theme.colors.primary }],
              pressed && day.selectable && !isSelected && { opacity: 0.6 },
              !day.selectable && styles.disabled,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: !day.selectable }}
            accessibilityLabel={`${day.dayOfMonth}`}
          >
            <Text
              style={[
                styles.cellText,
                {
                  color: isSelected
                    ? theme.colors.background
                    : day.isToday
                      ? theme.colors.primary
                      : theme.colors.text,
                  fontWeight: day.isToday || isSelected ? '700' : '500',
                },
              ]}
            >
              {day.dayOfMonth}
            </Text>
            {renderDayDecorator ? renderDayDecorator(day) : null}
          </Pressable>
        )
      })}
    </Animated.View>
  )
}

function weekdayHeaders(firstWeekdayOffset: number): string[] {
  if (firstWeekdayOffset === 1) {
    // Domingo primero
    return ['D', 'L', 'M', 'M', 'J', 'V', 'S']
  }
  // Lunes primero (default)
  return ['L', 'M', 'M', 'J', 'V', 'S', 'D']
}

function buildMonthGrid(
  year: number,
  month: number,
  today: Date,
  allowedRange: { startIso: string; endIso: string } | undefined,
  firstWeekdayOffset: number,
): (BaseMonthCalendarDay | null)[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const todayIso = formatIso(today)
  // Padding al inicio (cuántas celdas vacías antes del día 1)
  const dayOfWeekZeroIsSunday = firstDay.getDay() // 0=dom..6=sáb
  const padCount = firstWeekdayOffset === 0
    ? (dayOfWeekZeroIsSunday === 0 ? 6 : dayOfWeekZeroIsSunday - 1)
    : dayOfWeekZeroIsSunday
  const grid: (BaseMonthCalendarDay | null)[] = Array(padCount).fill(null)
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
      isToday: iso === todayIso,
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

const CELL_WIDTH_PCT = 100 / 7 - 0.5

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  headerCell: {
    width: `${CELL_WIDTH_PCT}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  cell: {
    width: `${CELL_WIDTH_PCT}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: 14 },
  selectedCell: { borderRadius: 12 },
  disabled: { opacity: 0.25 },
})
