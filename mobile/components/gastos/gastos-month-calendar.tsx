import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import type { GastosDayMood } from '@/features/gastos/gastos-aggregates.model'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoney } from '@/utils/money'

interface GastosMonthCalendarProps {
  dayMoods: Record<number, GastosDayMood>
  todayDay: number
  /** First date of the current pay cycle (local). */
  cycleStart: Date
  /** Total number of days in the cycle window. */
  cycleDays: number
  firstWeekdayOffset?: number // 0 = Monday first column
  selectedDay: number | null
  selectedDayTotal?: number
  selectedDayCount?: number
  /** Short label for the cycle range, e.g. "20 abr → 20 may". */
  cycleLabel?: string
  onSelectDay: (day: number) => void
  onClearDay: () => void
  onPrevDay?: () => void
  onNextDay?: () => void
  /** Disable the prev chevron when the selected day is the cycle's
   *  first day. Caller computes (selection vs. cycle bounds). */
  canGoPrev?: boolean
  /** Disable the next chevron when the selected day is today OR the
   *  last day of the cycle — can't navigate to future or off-cycle. */
  canGoNext?: boolean
  /**
   * Fired when the user taps "Registrar gasto olvidado" in focus mode
   * on a PAST day of the cycle. Receives the concrete Date so the
   * caller can back-date the new movement. Today's selection doesn't
   * offer this option (regular add-expense flow covers it).
   */
  onRegisterForgottenExpense?: (date: Date) => void
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/**
 * Finds the concrete Date for a calendar day-of-month within the
 * current cycle window. Since a cycle spans at most 2 adjacent
 * months, `dayOfMonth` is unique — we iterate the cycle dates and
 * return the first match.
 */
function resolveCycleDate(
  cycleStart: Date,
  cycleDays: number,
  dayOfMonth: number,
): Date | null {
  for (let i = 0; i < cycleDays; i++) {
    const d = new Date(
      cycleStart.getFullYear(),
      cycleStart.getMonth(),
      cycleStart.getDate() + i,
    )
    if (d.getDate() === dayOfMonth) return d
  }
  return null
}

/**
 * Calendar for Gastos — 7-col grid of the current month with a heatmap
 * tint per day (green / amber / red) driven by daily spend vs the
 * running average. Tapping a day enters FOCUS MODE (big day number +
 * prev/next chevrons + stats + "volver" chip).
 */
export function GastosMonthCalendar({
  dayMoods,
  todayDay,
  cycleStart,
  cycleDays,
  firstWeekdayOffset = 0,
  selectedDay,
  selectedDayTotal = 0,
  selectedDayCount = 0,
  cycleLabel = '',
  onSelectDay,
  onClearDay,
  onPrevDay,
  onNextDay,
  canGoPrev = true,
  canGoNext = true,
  onRegisterForgottenExpense,
}: GastosMonthCalendarProps) {
  // Crossfade between grid and focus via Reanimated layout animations
  // (FadeIn on mount, FadeOut on unmount). Keyed by mode so switching
  // between them triggers both a fade-out of the old view AND a
  // fade-in of the new one — the transition reads as a single soft
  // dissolve instead of a hard swap.
  return (
    <View>
      {selectedDay != null ? (
        <Animated.View
          key="focus"
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(160)}
        >
          <FocusMode
            day={selectedDay}
            todayDay={todayDay}
            mood={dayMoods[selectedDay] ?? 'empty'}
            total={selectedDayTotal}
            count={selectedDayCount}
            cycleLabel={cycleLabel}
            onClear={onClearDay}
            onPrev={onPrevDay}
            onNext={onNextDay}
            canGoPrev={canGoPrev}
            canGoNext={canGoNext}
            onRegisterForgotten={
              onRegisterForgottenExpense && selectedDay !== todayDay
                ? () => {
                    const date = resolveCycleDate(cycleStart, cycleDays, selectedDay)
                    if (date) onRegisterForgottenExpense(date)
                  }
                : undefined
            }
          />
        </Animated.View>
      ) : (
        <Animated.View
          key="grid"
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(160)}
        >
          <GridMode
            dayMoods={dayMoods}
            cycleStart={cycleStart}
            cycleDays={cycleDays}
            firstWeekdayOffset={firstWeekdayOffset}
            onSelectDay={onSelectDay}
          />
        </Animated.View>
      )}
    </View>
  )
}

function GridMode({
  dayMoods,
  cycleStart,
  cycleDays,
  firstWeekdayOffset,
  onSelectDay,
}: {
  dayMoods: Record<number, GastosDayMood>
  cycleStart: Date
  cycleDays: number
  firstWeekdayOffset: number
  onSelectDay: (day: number) => void
}) {
  const { theme } = useAppTheme()
  // Build the week rows: lead with `firstWeekdayOffset` blanks, then the
  // cycle's days rendered with their real calendar day-of-month
  // (so a 20→20 cycle shows 20,21,22…30,1,2…19). Each cycle day
  // remains unique because a cycle spans at most two adjacent months.
  const todayNormalized = new Date()
  todayNormalized.setHours(0, 0, 0, 0)
  const todayMs = todayNormalized.getTime()
  const cycleDates: Date[] = []
  for (let i = 0; i < cycleDays; i++) {
    cycleDates.push(
      new Date(
        cycleStart.getFullYear(),
        cycleStart.getMonth(),
        cycleStart.getDate() + i,
      ),
    )
  }
  const rows: Array<Array<Date | null>> = []
  let current: Array<Date | null> = []
  for (let i = 0; i < firstWeekdayOffset; i++) current.push(null)
  for (const d of cycleDates) {
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
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
      ]}
    >
      <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>TU MES EN UN VISTAZO</Text>
          <View style={styles.legend}>
            <LegendDot color="#49D61F" label="bien" theme={theme} />
            <LegendDot color="#EC7A51" label="alerta" theme={theme} />
            <LegendDot color="#D96A4F" label="exceso" theme={theme} />
          </View>
        </View>
        <Text style={[styles.hint, { color: theme.colors.textSoft }]}>
          Toca un día para filtrar sus gastos
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
              {row.map((cellDate, ci) => {
                if (cellDate == null) {
                  return <View key={`e-${ri}-${ci}`} style={styles.dayCell} />
                }
                const dayNum = cellDate.getDate()
                const cellMs = cellDate.getTime()
                const isToday = cellMs === todayMs
                const isPast = cellMs <= todayMs
                return (
                  <DayCell
                    key={`${cellDate.getFullYear()}-${cellDate.getMonth()}-${dayNum}`}
                    day={dayNum}
                    mood={dayMoods[dayNum] ?? (isPast ? 'empty' : undefined)}
                    isToday={isToday}
                    isPast={isPast}
                    onPress={() => onSelectDay(dayNum)}
                  />
                )
              })}
            </View>
          ))}
        </View>
    </View>
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

  // Four visual states:
  //   1. Today         → ink fill + cream number + accent dot underneath
  //   2. Past w/ spend → mood-tinted fill + mood-tinted number
  //   3. Past empty    → plain number, no tile
  //   4. Future        → dashed border tile, muted number
  //
  // Every cell carries `borderWidth: 1` (transparent for non-future
  // states) so the inner content area stays identical across states —
  // otherwise the future dashed cells would render 2px smaller than
  // their filled neighbors, producing a visible jitter row-by-row.
  let bg: string = 'transparent'
  let color: string = theme.colors.textSoft
  const borderWidth = 1
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
    borderStyle = 'dashed'
    borderColor = theme.isDark ? 'rgba(242,234,211,0.14)' : 'rgba(18,33,26,0.16)'
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
  // V1 heat-tone mapping (calendar cells, AA verified on each pair):
  //   green  → primary family (low spend / good)
  //   amber  → accent soft (moderate)
  //   red    → accent stronger (high — but coral, not "danger red")
  switch (mood) {
    case 'green':
      return {
        bg:    isDark ? '#244235' : '#EAFBE4',  // surface-900 / primary-100
        color: isDark ? '#A6EF8F' : '#297811',  // primary-300 / primary-800
      }
    case 'amber':
      return {
        bg:    isDark ? '#5C200A' : '#FCEAE3',  // accent-900 / accent-100
        color: isDark ? '#F2A78C' : '#7C2B0E',  // accent-300 / accent-800
      }
    case 'red':
      return {
        bg:    isDark ? '#2E1005' : '#F8D1C3',  // accent-950 / accent-200
        color: isDark ? '#F8D1C3' : '#5C200A',  // accent-200 / accent-900
      }
    default:
      return {
        bg:    'transparent',
        color: isDark ? '#A6EF8F' : '#3B6D57',  // primary-300 / surface-700 (textMuted family)
      }
  }
}

function FocusMode({
  day,
  todayDay,
  mood,
  total,
  count,
  cycleLabel,
  onClear,
  onPrev,
  onNext,
  canGoPrev = true,
  canGoNext = true,
  onRegisterForgotten,
}: {
  day: number
  todayDay: number
  mood: GastosDayMood
  total: number
  count: number
  cycleLabel: string
  onClear: () => void
  onPrev?: () => void
  onNext?: () => void
  canGoPrev?: boolean
  canGoNext?: boolean
  onRegisterForgotten?: () => void
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
          <ChevronBtn direction="prev" onPress={onPrev} disabled={!canGoPrev} color={theme.colors.text} bg={theme.colors.canvas} border={theme.colors.line} />
          <Pressable onPress={onClear} style={styles.focusCenter} accessibilityRole="button" accessibilityLabel="Volver al ciclo completo">
            <Text style={[styles.focusDay, { color: theme.colors.text }]}>{day}</Text>
            <Text style={[styles.focusDaySub, { color: theme.colors.textMuted }]}>
              {cycleLabel}
              {isToday ? (
                <Text style={{ color: theme.colors.success, fontWeight: '700' }}>{' · hoy'}</Text>
              ) : null}
            </Text>
          </Pressable>
          <ChevronBtn direction="next" onPress={onNext} disabled={!canGoNext} color={theme.colors.text} bg={theme.colors.canvas} border={theme.colors.line} />
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

        {onRegisterForgotten ? (
          <Pressable
            onPress={onRegisterForgotten}
            style={[
              styles.registerForgottenBtn,
              {
                backgroundColor: theme.colors.creamSoft,
                borderColor: theme.colors.line,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Registrar gasto olvidado en este día"
          >
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 5v14M5 12h14"
                stroke={theme.colors.text}
                strokeWidth={2.4}
                strokeLinecap="round"
              />
            </Svg>
            <Text style={[styles.registerForgottenText, { color: theme.colors.text }]}>
              Registrar gasto olvidado
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.focusBackRow}>
          <Pressable
            onPress={onClear}
            style={[styles.backChip, { backgroundColor: theme.colors.text }]}
            accessibilityRole="button"
            accessibilityLabel="Volver al ciclo completo"
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
              Ciclo completo
            </Text>
          </Pressable>
        </View>
    </View>
  )
}

function ChevronBtn({
  direction,
  onPress,
  disabled = false,
  color,
  bg,
  border,
}: {
  direction: 'prev' | 'next'
  onPress?: () => void
  disabled?: boolean
  color: string
  bg: string
  border: string
}) {
  const d = direction === 'prev' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityState={{ disabled }}
      style={[
        styles.chevronBtn,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: disabled ? 0.35 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={direction === 'prev' ? 'Día anterior' : 'Día siguiente'}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path d={d} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  )
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
  // Must share the same gap as gridRow so weekday labels sit exactly
  // above their day cells — otherwise the 6px column gap in the grid
  // shifts every day one pixel to the right of its header.
  weekdaysRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  weekdayCell: { flex: 1, alignItems: 'center', paddingBottom: 2 },
  weekdayText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  grid: { gap: 6 },
  gridRow: { flexDirection: 'row', gap: 6 },
  // Every cell — real day cells and trailing empties alike — carries a
  // 1px (transparent-by-default) border so their content-boxes are
  // identical. Without it, RN Web's box-sizing shifts the layout by 1px
  // between states that have a border and states that don't.
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
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
  registerForgottenBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  registerForgottenText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
})
