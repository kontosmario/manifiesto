import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { RiseView } from '@/components/home/animated/rise-view'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import type { GastosDayMood } from '@/features/gastos/gastos-aggregates.model'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoney } from '@/utils/money'

interface GastosMonthCalendarProps {
  dayMoods: Record<number, GastosDayMood>
  todayDay: number
  daysInMonth: number
  firstWeekdayOffset?: number // 0 = Monday first column
  selectedDay: number | null
  selectedDayTotal?: number
  selectedDayCount?: number
  monthLabel?: string // e.g. "abril"
  onSelectDay: (day: number) => void
  onClearDay: () => void
  onPrevDay?: () => void
  onNextDay?: () => void
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/**
 * Calendar for Gastos — 7-col grid of the current month with a heatmap
 * tint per day (green / amber / red) driven by daily spend vs the
 * running average. Tapping a day enters FOCUS MODE (big day number +
 * prev/next chevrons + stats + "volver" chip).
 */
export function GastosMonthCalendar({
  dayMoods,
  todayDay,
  daysInMonth,
  firstWeekdayOffset = 0,
  selectedDay,
  selectedDayTotal = 0,
  selectedDayCount = 0,
  monthLabel = '',
  onSelectDay,
  onClearDay,
  onPrevDay,
  onNextDay,
}: GastosMonthCalendarProps) {
  if (selectedDay != null) {
    return (
      <FocusMode
        day={selectedDay}
        todayDay={todayDay}
        mood={dayMoods[selectedDay] ?? 'empty'}
        total={selectedDayTotal}
        count={selectedDayCount}
        monthLabel={monthLabel}
        onClear={onClearDay}
        onPrev={onPrevDay}
        onNext={onNextDay}
      />
    )
  }
  return (
    <GridMode
      dayMoods={dayMoods}
      todayDay={todayDay}
      daysInMonth={daysInMonth}
      firstWeekdayOffset={firstWeekdayOffset}
      onSelectDay={onSelectDay}
    />
  )
}

function GridMode({
  dayMoods,
  todayDay,
  daysInMonth,
  firstWeekdayOffset,
  onSelectDay,
}: {
  dayMoods: Record<number, GastosDayMood>
  todayDay: number
  daysInMonth: number
  firstWeekdayOffset: number
  onSelectDay: (day: number) => void
}) {
  const { theme } = useAppTheme()
  // Build the week rows: lead with `firstWeekdayOffset` blanks, then the
  // month's days, then pad the trailing row so every row is 7 cells.
  const rows: Array<Array<number | null>> = []
  let current: Array<number | null> = []
  for (let i = 0; i < firstWeekdayOffset; i++) current.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    current.push(d)
    if (current.length === 7) {
      rows.push(current)
      current = []
    }
  }
  if (current.length > 0) {
    while (current.length < 7) current.push(null)
    rows.push(current)
  }

  return (
    <RiseView delay={300}>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
        ]}
      >
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>TU MES EN UN VISTAZO</Text>
          <View style={styles.legend}>
            <LegendDot color="#6FE09A" label="bien" theme={theme} />
            <LegendDot color="#F2B58A" label="alerta" theme={theme} />
            <LegendDot color="#D96A4F" label="exceso" theme={theme} />
          </View>
        </View>
        <Text style={[styles.hint, { color: theme.colors.textSoft }]}>
          Tocá un día para filtrar sus gastos
        </Text>
        <View style={styles.weekdaysRow}>
          {WEEKDAYS.map((d, i) => (
            <View key={i} style={styles.weekdayCell}>
              <Text style={[styles.weekdayText, { color: theme.colors.textSoft }]}>{d}</Text>
            </View>
          ))}
        </View>
        <View style={styles.grid}>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.gridRow}>
              {row.map((n, ci) =>
                n == null ? (
                  <View key={`e-${ri}-${ci}`} style={styles.dayCell} />
                ) : (
                  <DayCell
                    key={n}
                    day={n}
                    mood={dayMoods[n] ?? (n <= todayDay ? 'empty' : undefined)}
                    isToday={n === todayDay}
                    isPast={n <= todayDay}
                    onPress={() => onSelectDay(n)}
                  />
                ),
              )}
            </View>
          ))}
        </View>
      </View>
    </RiseView>
  )
}

function LegendDot({
  color,
  label,
  theme,
}: {
  color: string
  label: string
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  )
}

function DayCell({
  day,
  mood,
  isToday,
  isPast,
  onPress,
}: {
  day: number
  mood: GastosDayMood | undefined
  isToday: boolean
  isPast: boolean
  onPress: () => void
}) {
  const { theme } = useAppTheme()
  const moodStyle = getMoodStyle(mood, theme.isDark)
  const hasMoodFill = !!mood && mood !== 'empty'

  // Three visual states:
  //   1. Today         → ink fill + cream number + accent dot underneath
  //   2. Past w/ spend → mood-tinted fill + mood-tinted number
  //   3. Past empty    → plain number, no tile
  //   4. Future        → dashed border tile, muted number
  let bg: string = 'transparent'
  let color: string = theme.colors.textSoft
  let borderWidth = 0
  let borderStyle: 'solid' | 'dashed' = 'solid'
  let borderColor: string = 'transparent'
  if (isToday) {
    bg = theme.colors.text
    color = theme.colors.creamCard
  } else if (isPast) {
    if (hasMoodFill) {
      bg = moodStyle.bg
      color = moodStyle.color
    } else {
      bg = 'transparent'
      color = theme.colors.textSoft
    }
  } else {
    // future
    bg = 'transparent'
    color = theme.colors.textSoft
    borderWidth = 1
    borderStyle = 'dashed'
    borderColor = theme.isDark ? 'rgba(246,251,239,0.14)' : 'rgba(15,42,30,0.16)'
  }

  return (
    <Pressable
      onPress={isPast ? onPress : undefined}
      disabled={!isPast}
      style={[
        styles.dayCell,
        {
          backgroundColor: bg,
          borderStyle,
          borderColor,
          borderWidth,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Filtrar día ${day}`}
    >
      <Text style={[styles.dayNumber, { color }]}>{day}</Text>
      {isToday ? (
        <View style={styles.todayDot}>
          <BreatheDot size={4} color={theme.colors.heroAccent} periodMs={1600} />
        </View>
      ) : null}
    </Pressable>
  )
}

function getMoodStyle(mood: GastosDayMood | undefined, isDark: boolean): { bg: string; color: string } {
  switch (mood) {
    case 'green':
      return { bg: isDark ? '#1E3A28' : '#DDEFE3', color: isDark ? '#C7EE9C' : '#2E7D5B' }
    case 'amber':
      return { bg: isDark ? '#3A2A22' : '#FADFC8', color: isDark ? '#F2B58A' : '#6B3A4F' }
    case 'red':
      return { bg: isDark ? '#3A241E' : '#F5C6B6', color: isDark ? '#E8976A' : '#A3452A' }
    default:
      return { bg: 'transparent', color: isDark ? '#6A7A70' : '#9AA39D' }
  }
}

function FocusMode({
  day,
  todayDay,
  mood,
  total,
  count,
  monthLabel,
  onClear,
  onPrev,
  onNext,
}: {
  day: number
  todayDay: number
  mood: GastosDayMood
  total: number
  count: number
  monthLabel: string
  onClear: () => void
  onPrev?: () => void
  onNext?: () => void
}) {
  const { theme } = useAppTheme()
  const isToday = day === todayDay
  const moodLabel =
    mood === 'green' ? 'Día tranquilo'
      : mood === 'amber' ? 'Día de alerta'
      : mood === 'red' ? 'Día de exceso'
      : 'Sin movimientos'
  const moodStyle = getMoodStyle(mood, theme.isDark)

  return (
    <RiseView delay={0}>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
        ]}
      >
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>DÍA SELECCIONADO</Text>
          <View
            style={[
              styles.moodPill,
              { backgroundColor: moodStyle.bg },
            ]}
          >
            <Text style={[styles.moodText, { color: moodStyle.color }]}>{moodLabel}</Text>
          </View>
        </View>

        <View style={styles.focusHero}>
          <ChevronBtn direction="prev" onPress={onPrev} color={theme.colors.text} bg={theme.colors.canvas} border={theme.colors.line} />
          <Pressable onPress={onClear} style={styles.focusCenter} accessibilityRole="button" accessibilityLabel="Volver al mes completo">
            <Text style={[styles.focusDay, { color: theme.colors.text }]}>{day}</Text>
            <Text style={[styles.focusDaySub, { color: theme.colors.textMuted }]}>
              {monthLabel}
              {isToday ? (
                <Text style={{ color: theme.colors.success, fontWeight: '700' }}>{' · hoy'}</Text>
              ) : null}
            </Text>
          </Pressable>
          <ChevronBtn direction="next" onPress={onNext} color={theme.colors.text} bg={theme.colors.canvas} border={theme.colors.line} />
        </View>

        <View style={[styles.focusStats, { borderTopColor: theme.colors.line }]}>
          <View>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>GASTADO</Text>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>{formatMoney(total)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>MOVIMIENTOS</Text>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>{count}</Text>
          </View>
        </View>

        <View style={styles.focusBackRow}>
          <Pressable
            onPress={onClear}
            style={[styles.backChip, { backgroundColor: theme.colors.text }]}
            accessibilityRole="button"
            accessibilityLabel="Volver al mes completo"
          >
            <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
              <Path
                d="M6 6l12 12M18 6L6 18"
                stroke={theme.colors.creamCard}
                strokeWidth={2.2}
                strokeLinecap="round"
              />
            </Svg>
            <Text style={[styles.backChipText, { color: theme.colors.creamCard }]}>
              {capitalize(monthLabel)} completo
            </Text>
          </Pressable>
        </View>
      </View>
    </RiseView>
  )
}

function ChevronBtn({
  direction,
  onPress,
  color,
  bg,
  border,
}: {
  direction: 'prev' | 'next'
  onPress?: () => void
  color: string
  bg: string
  border: string
}) {
  const d = direction === 'prev' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chevronBtn, { backgroundColor: bg, borderColor: border }]}
      accessibilityRole="button"
      accessibilityLabel={direction === 'prev' ? 'Día anterior' : 'Día siguiente'}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path d={d} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  )
}

function capitalize(s: string): string {
  if (!s) return s
  return s[0].toUpperCase() + s.slice(1)
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 14, borderWidth: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
  legend: { flexDirection: 'row', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendLabel: { fontSize: 9, fontWeight: '600' },
  hint: { fontSize: 10, fontWeight: '500', marginBottom: 8 },
  weekdaysRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayCell: { flex: 1, alignItems: 'center', paddingBottom: 2 },
  weekdayText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  grid: { gap: 6 },
  gridRow: { flexDirection: 'row', gap: 6 },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    position: 'relative',
  },
  dayNumber: { fontSize: 13, fontWeight: '700' },
  todayDot: { position: 'absolute', bottom: 4, alignSelf: 'center' },
  moodPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  moodText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  focusHero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 4, paddingTop: 8 },
  focusCenter: { flex: 1, alignItems: 'center' },
  focusDay: { fontSize: 72, fontWeight: '800', letterSpacing: -3, lineHeight: 70 },
  focusDaySub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  chevronBtn: {
    width: 36, height: 36, borderRadius: 999, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  focusStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  statValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4, marginTop: 2 },
  focusBackRow: { marginTop: 12, alignItems: 'center' },
  backChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  backChipText: { fontSize: 12, fontWeight: '700' },
})
