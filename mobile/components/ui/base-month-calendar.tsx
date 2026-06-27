import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { withAlpha } from '@/theme/color-utils'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Calendar-month grid para pickear una fecha específica.
 *
 * Chrome alineado con `MonthDayPicker` (cream-card container, misma
 * cell math, mismo selected-cell gradient + shadow) para que el picker
 * se sienta consistente cuando el user switchea entre tipos de ciclo
 * en `CycleConfigSection`.
 *
 * Diferencias vs MonthDayPicker:
 *   - Calendar-month (no 1..31), día 1 puede caer en cualquier columna.
 *   - Weekday headers (L/M/M/J/V/S/D) — al pickear una fecha el
 *     weekday importa.
 *   - Chevrons prev/next para navegar entre meses.
 *   - Devuelve ISO date strings via `onSelectDay`.
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
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const weekdays = t('states:calendar.weekdays', { returnObjects: true }) as string[]
  const monthNames = t('states:calendar.months', { returnObjects: true }) as string[]
  const accentColor = accent ?? theme.colors.primary
  const selectedNumColor = theme.isDark ? '#0A1410' : '#F6FBEF'

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

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={goPrev}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('states:calendar.prevMonth')}
          style={({ pressed }) => [styles.chevron, pressed && styles.chevronPressed]}
        >
          <MaterialIcons name="chevron-left" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.monthLabel, { color: theme.colors.text }]}>
          {monthNames[month]} {year}
        </Text>
        <Pressable
          onPress={goNext}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('states:calendar.nextMonth')}
          style={({ pressed }) => [styles.chevron, pressed && styles.chevronPressed]}
        >
          <MaterialIcons name="chevron-right" size={22} color={theme.colors.text} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {weekdays.map((w, idx) => (
          <View key={`h-${idx}`} style={styles.weekdayCell}>
            <Text style={[styles.weekdayText, { color: theme.colors.textMuted }]}>{w}</Text>
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
                    {day.dayOfMonth}
                  </Text>
                </Animated.View>
                {renderDayDecorator?.(day)}
              </Pressable>
            )
          }

          return (
            <Pressable
              key={day.isoDate}
              disabled={!day.selectable}
              onPress={() => handlePick(day)}
              accessibilityRole="button"
              accessibilityLabel={t('states:calendar.dayLabel', { day: day.dayOfMonth })}
              accessibilityState={{ selected: false, disabled: !day.selectable }}
              style={({ pressed }) => [
                styles.cell,
                pressed && day.selectable && styles.cellPressed,
              ]}
            >
              <View
                style={[
                  styles.cellInner,
                  {
                    backgroundColor: theme.colors.creamSoft,
                    opacity: day.selectable ? 1 : 0.35,
                  },
                  isToday && [
                    styles.cellTodayBorder,
                    { borderColor: accentColor },
                  ],
                ]}
              >
                <Text
                  style={[
                    styles.cellNum,
                    {
                      color: isToday ? accentColor : theme.colors.textMuted,
                      fontWeight: isToday ? '800' : '700',
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
    </View>
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
    borderRadius: 18,
    borderWidth: 1,
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
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronPressed: { opacity: 0.5 },
  monthLabel: {
    fontSize: 14,
    fontWeight: '800',
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
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cellSelected: { overflow: 'visible' },
  cellTodayBorder: {
    borderWidth: 1.5,
  },
  cellNum: {
    fontSize: 13,
  },
  cellNumSelected: {
    fontSize: 14,
    fontWeight: '800',
  },
})
