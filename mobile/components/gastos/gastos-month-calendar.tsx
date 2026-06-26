import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import type { GastosDayMood } from '@/features/gastos/gastos-aggregates.model'
import { useGatedLayout } from '@/hooks/use-layout-transition-gate'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoney } from '@/utils/money'

interface GastosMonthCalendarProps {
  dayMoods: Record<number, GastosDayMood>
  todayDay: number
  /** First date of the current pay cycle (local). */
  cycleStart: Date
  /** Total number of days in the cycle window. */
  cycleDays: number
  /**
   * Empty / preview mode (first-run onboarding). The calendar is
   * legitimately empty here — a real cycle grid with zero spend marks
   * is honest, not fabricated. This flag just makes the grid inert
   * (no tap-to-filter) so it reads as a still preview, and is rendered
   * at reduced opacity by the caller. Backwards-compatible default
   * `false`.
   */
  empty?: boolean
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
  /** When set, the day-detail shows a "Marcar día sin gastos" button
   *  on past-or-today days that have 0 expenses and aren't already
   *  marked. The callback receives the local Date. */
  onMarkNoSpend?: (date: Date) => void
  /** When set, the day-detail shows a "Revertir marca de sin gastos"
   *  button on days that ARE currently marked. */
  onUnmarkNoSpend?: (date: Date) => void
  /** Set of YYYY-MM-DD ISO date strings (in user-local tz) for days
   *  already marked. Drives which of the two actions is shown. */
  noSpendMarkedDates?: Set<string>
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
  onMarkNoSpend,
  onUnmarkNoSpend,
  noSpendMarkedDates,
  empty = false,
}: GastosMonthCalendarProps) {
  // Crossfade between grid and focus via Reanimated layout animations
  // (FadeIn on mount, FadeOut on unmount). Keyed by mode so switching
  // between them triggers both a fade-out of the old view AND a
  // fade-in of the new one — the transition reads as a single soft
  // dissolve instead of a hard swap.
  // Gateado: en el primer attach de la vista el FadeIn se omite (gate
  // cerrado → undefined) para que la grilla aparezca asentada sin fade;
  // el crossfade grid↔focus solo corre después (al seleccionar un día).
  const modeEntering = useGatedLayout(FadeIn.duration(220))
  // Empty preview always renders the grid (never focus mode) and is
  // inert — no tap-to-filter. The grid itself is honestly empty (no
  // spend marks), so nothing is fabricated.
  if (empty) {
    return (
      <GridMode
        dayMoods={{}}
        cycleStart={cycleStart}
        cycleDays={cycleDays}
        firstWeekdayOffset={firstWeekdayOffset}
        onSelectDay={onSelectDay}
        noSpendMarkedDates={noSpendMarkedDates}
        inert
      />
    )
  }

  return (
    <View>
      {selectedDay != null ? (
        <Animated.View
          key="focus"
          entering={modeEntering}
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
            onMarkNoSpend={
              onMarkNoSpend && selectedDayCount === 0
                ? () => {
                    const date = resolveCycleDate(cycleStart, cycleDays, selectedDay)
                    if (date) onMarkNoSpend(date)
                  }
                : undefined
            }
            onUnmarkNoSpend={
              onUnmarkNoSpend
                ? () => {
                    const date = resolveCycleDate(cycleStart, cycleDays, selectedDay)
                    if (date) onUnmarkNoSpend(date)
                  }
                : undefined
            }
            hasNoSpendMark={(() => {
              const date = resolveCycleDate(cycleStart, cycleDays, selectedDay)
              if (!date || !noSpendMarkedDates) return false
              // Local YYYY-MM-DD (not toISOString — that shifts to UTC
              // and can move the day by ±1 depending on tz offset).
              const y = date.getFullYear()
              const m = String(date.getMonth() + 1).padStart(2, '0')
              const d = String(date.getDate()).padStart(2, '0')
              return noSpendMarkedDates.has(`${y}-${m}-${d}`)
            })()}
          />
        </Animated.View>
      ) : (
        <Animated.View
          key="grid"
          entering={modeEntering}
          exiting={FadeOut.duration(160)}
        >
          <GridMode
            dayMoods={dayMoods}
            cycleStart={cycleStart}
            cycleDays={cycleDays}
            firstWeekdayOffset={firstWeekdayOffset}
            onSelectDay={onSelectDay}
            noSpendMarkedDates={noSpendMarkedDates}
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
  noSpendMarkedDates,
  inert = false,
}: {
  dayMoods: Record<number, GastosDayMood>
  cycleStart: Date
  cycleDays: number
  firstWeekdayOffset: number
  onSelectDay: (day: number) => void
  /** Set of YYYY-MM-DD ISO date strings (in user-local tz) for days
   *  already marked as no-spend. Drives the small leaf dot under
   *  the day number. */
  noSpendMarkedDates?: Set<string>
  /** Preview mode — cells render but aren't tappable. */
  inert?: boolean
}) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
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
        {
          backgroundColor: theme.isDark
            ? theme.colors.surfaceMuted
            : theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>{t('gastos:calendar.eyebrow')}</Text>
          <View style={styles.legend}>
            <LegendDot mood="green" label={t('gastos:calendar.legend.good')} theme={theme} />
            <LegendDot mood="amber" label={t('gastos:calendar.legend.warning')} theme={theme} />
            <LegendDot mood="red" label={t('gastos:calendar.legend.over')} theme={theme} />
          </View>
        </View>
        <Text style={[styles.hint, { color: theme.colors.textSoft }]}>
          {inert
            ? t('gastos:calendar.hintInert')
            : t('gastos:calendar.hintTap')}
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
                  // Empty leading cell — solo layout, sin chrome. Mantiene
                  // su flex:1 share del row para que el grid no se
                  // desalinee respecto a las cells reales.
                  return <View key={`e-${ri}-${ci}`} style={styles.dayCellLayout} />
                }
                const dayNum = cellDate.getDate()
                const cellMs = cellDate.getTime()
                const isToday = cellMs === todayMs
                const isPast = cellMs <= todayMs
                // Local YYYY-MM-DD (not toISOString — that shifts to
                // UTC and can move the day by ±1 depending on tz
                // offset). Same approach as the FocusMode lookup above.
                const yIso = cellDate.getFullYear()
                const mIso = String(cellDate.getMonth() + 1).padStart(2, '0')
                const dIso = String(cellDate.getDate()).padStart(2, '0')
                const cellIso = `${yIso}-${mIso}-${dIso}`
                const isNoSpendMarked = noSpendMarkedDates?.has(cellIso) ?? false
                return (
                  <DayCell
                    key={`${cellDate.getFullYear()}-${cellDate.getMonth()}-${dayNum}`}
                    day={dayNum}
                    mood={dayMoods[dayNum] ?? (isPast ? 'empty' : undefined)}
                    isToday={isToday}
                    isPast={isPast}
                    inert={inert}
                    isNoSpendMarked={isNoSpendMarked}
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
  mood,
  label,
  theme,
}: {
  mood: GastosDayMood
  label: string
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  // El dot toma el MISMO color que la celda de ese ánimo (theme-aware),
  // así legend y celdas quedan en lockstep y el dot pasa AA (>=3:1) sobre
  // la card en ambos modos.
  const color = getMoodStyle(mood, theme.isDark).color
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
  inert = false,
  isNoSpendMarked = false,
}: {
  day: number
  mood: GastosDayMood | undefined
  isToday: boolean
  isPast: boolean
  onPress: () => void
  /** Preview mode — render the cell chrome but disable interaction. */
  inert?: boolean
  /** Day is in the user's `no_spend_days_this_cycle` list — paints
   *  a small green leaf glyph below the day number. */
  isNoSpendMarked?: boolean
}) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const moodStyle = getMoodStyle(mood, theme.isDark)
  // In preview mode past cells are not tappable.
  const tappable = isPast && !inert
  const hasMoodFill = !!mood && mood !== 'empty'
  // Press scale Emil-grade. Solo aplica a cells past (isPast). Cells
  // future están disabled — el hook se setea igual pero el handler
  // no se conecta cuando disabled.
  const press = usePressScale({ pressedScale: 0.92 })

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
      onPress={tappable ? onPress : undefined}
      onPressIn={tappable ? press.onPressIn : undefined}
      onPressOut={tappable ? press.onPressOut : undefined}
      disabled={!tappable}
      accessibilityRole="button"
      accessibilityLabel={t('gastos:calendar.filterDayA11y', { day })}
      // Layout-affecting styles van EN el Pressable porque es el child
      // directo de `gridRow` (flexDirection: row, gap: 6). Sin `flex: 1`
      // aquí, la cell colapsa al tamaño del contenido y rompe el grid
      // (las empty cells `<View style={dayCell} />` retienen flex: 1
      // → mismatch de anchos por columna). El Animated.View interno
      // toma el visual chrome y la transformación de press scale.
      style={styles.dayCellLayout}
    >
      <Animated.View
        style={[
          styles.dayCellSurface,
          {
            backgroundColor: bg,
            borderStyle,
            borderColor,
            borderWidth,
          },
          isPast ? press.animatedStyle : undefined,
        ]}
      >
        <Text style={[styles.dayNumber, { color }]}>{day}</Text>
        {/* No-spend leaf dot — distinct from the mood-color fill and
            from the today breath dot. When a day is both Today AND
            marked, the leaf wins: the breath dot lives in the same
            slot and would overlap, and "marked as no-spend" is the
            stronger signal at a glance. Leaf path matches the eco
            glyph used in the FocusMode "Marcar día sin gastos" button
            for visual continuity. */}
        {isNoSpendMarked ? (
          <View style={styles.noSpendLeaf}>
            <Svg width={8} height={8} viewBox="0 0 24 24" fill="none">
              <Path
                d="M5 19c0-7 5-13 14-13-1 9-6 14-14 14M5 19c2-3 5-5 9-7"
                stroke={theme.colors.success}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
        ) : isToday ? (
          <View style={styles.todayDot}>
            {/* Today dot debe contrastar con el bg de la cell Today.
                En light bg = text #12211A (forest oscuro) → heroAccent
                lime se ve perfecto (~9:1). En dark bg = text #F2EAD3
                (cream) → heroAccent lime sobre cream colapsa a ~1.16:1
                (invisible). Switch a `canvas` en dark, que es forest
                deep #12211A — contraste alto sobre cream cell bg. */}
            <BreatheDot
              size={4}
              color={theme.isDark ? theme.colors.canvas : theme.colors.heroAccent}
              periodMs={1600}
            />
          </View>
        ) : null}
      </Animated.View>
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
  onMarkNoSpend,
  onUnmarkNoSpend,
  hasNoSpendMark = false,
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
  onMarkNoSpend?: () => void
  onUnmarkNoSpend?: () => void
  hasNoSpendMark?: boolean
}) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  // Tres press hooks Emil-grade — uno por cada Pressable inline en
  // FocusMode. Tap-targets distintos así que escalas matched al peso:
  //   - focusCenter (72pt day number, área grande): 0.97 sutil
  //   - registerForgottenBtn (botón mediano con border): 0.97
  //   - backChip (pill compacto con bg sólido): 0.95 más pronunciado
  const centerPress = usePressScale({ pressedScale: 0.97 })
  const registerPress = usePressScale({ pressedScale: 0.97 })
  const markPress = usePressScale({ pressedScale: 0.97 })
  const unmarkPress = usePressScale({ pressedScale: 0.97 })
  const backChipPress = usePressScale({ pressedScale: 0.95 })
  const isToday = day === todayDay
  const moodLabel =
    mood === 'green' ? t('gastos:calendar.mood.calm')
      : mood === 'amber' ? t('gastos:calendar.mood.warning')
      : mood === 'red' ? t('gastos:calendar.mood.over')
      : t('gastos:calendar.mood.none')
  const moodStyle = getMoodStyle(mood, theme.isDark)

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.isDark
            ? theme.colors.surfaceMuted
            : theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>{t('gastos:calendar.focusEyebrow')}</Text>
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
          <Pressable
            onPress={onClear}
            onPressIn={centerPress.onPressIn}
            onPressOut={centerPress.onPressOut}
            accessibilityRole="button"
            accessibilityLabel={t('gastos:calendar.backToCycleA11y')}
            // Pressable lleva el layout (flex:1 dentro de focusHero row).
            // Animated.View interno solo carga la transform de press
            // scale — sin doble flex:1 redundante.
            style={styles.focusCenter}
          >
            <Animated.View style={[styles.focusCenterInner, centerPress.animatedStyle]}>
              <Text style={[styles.focusDay, { color: theme.colors.text }]}>{day}</Text>
              <Text style={[styles.focusDaySub, { color: theme.colors.textMuted }]}>
                {cycleLabel}
                {isToday ? (
                  <Text style={{ color: theme.colors.success, fontWeight: '700' }}>{t('gastos:calendar.todaySuffix')}</Text>
                ) : null}
              </Text>
            </Animated.View>
          </Pressable>
          <ChevronBtn direction="next" onPress={onNext} disabled={!canGoNext} color={theme.colors.text} bg={theme.colors.canvas} border={theme.colors.line} />
        </View>

        <View style={[styles.focusStats, { borderTopColor: theme.colors.line }]}>
          <View>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{t('gastos:calendar.statSpent')}</Text>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>{formatMoney(total)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{t('gastos:calendar.statMovements')}</Text>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>{count}</Text>
          </View>
        </View>

        {onRegisterForgotten ? (
          <Pressable
            onPress={onRegisterForgotten}
            onPressIn={registerPress.onPressIn}
            onPressOut={registerPress.onPressOut}
            accessibilityRole="button"
            accessibilityLabel={t('gastos:calendar.registerForgottenA11y')}
          >
            <Animated.View
              style={[
                styles.registerForgottenBtn,
                {
                  backgroundColor: theme.colors.creamSoft,
                  borderColor: theme.colors.line,
                },
                registerPress.animatedStyle,
              ]}
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
                {t('gastos:calendar.registerForgotten')}
              </Text>
            </Animated.View>
          </Pressable>
        ) : null}

        {/* No-spend day actions: mutually exclusive with the
            forgotten-expense path. Mark shows only on empty past-or-
            today days; revert shows only on already-marked days. */}
        {onMarkNoSpend && !hasNoSpendMark ? (
          <Pressable
            onPress={onMarkNoSpend}
            onPressIn={markPress.onPressIn}
            onPressOut={markPress.onPressOut}
            accessibilityRole="button"
            accessibilityLabel={t('gastos:calendar.markNoSpendA11y')}
          >
            <Animated.View
              style={[
                styles.registerForgottenBtn,
                {
                  backgroundColor: theme.colors.creamSoft,
                  borderColor: theme.colors.line,
                },
                markPress.animatedStyle,
              ]}
            >
              {/* Leaf-ish glyph (eco). Inline SVG matches the
                  forgotten-expense button's plus icon pattern — no
                  MaterialIcons import in this file. */}
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M5 19c0-7 5-13 14-13-1 9-6 14-14 14M5 19c2-3 5-5 9-7"
                  stroke={theme.colors.success}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
              <Text style={[styles.registerForgottenText, { color: theme.colors.text }]}>
                {t('gastos:calendar.markNoSpend')}
              </Text>
            </Animated.View>
          </Pressable>
        ) : null}

        {onUnmarkNoSpend && hasNoSpendMark ? (
          <Pressable
            onPress={onUnmarkNoSpend}
            onPressIn={unmarkPress.onPressIn}
            onPressOut={unmarkPress.onPressOut}
            accessibilityRole="button"
            accessibilityLabel={t('gastos:calendar.unmarkNoSpendA11y')}
          >
            <Animated.View
              style={[
                styles.registerForgottenBtn,
                {
                  backgroundColor: theme.colors.creamSoft,
                  borderColor: theme.colors.line,
                },
                unmarkPress.animatedStyle,
              ]}
            >
              {/* Undo arrow — curved arrow pointing back. Inline SVG
                  matches the rest of the focus-mode glyph style. */}
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M9 14L4 9l5-5M4 9h11a5 5 0 015 5v0a5 5 0 01-5 5h-5"
                  stroke={theme.colors.textMuted}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
              <Text style={[styles.registerForgottenText, { color: theme.colors.text }]}>
                {t('gastos:calendar.unmarkNoSpend')}
              </Text>
            </Animated.View>
          </Pressable>
        ) : null}

        <View style={styles.focusBackRow}>
          <Pressable
            onPress={onClear}
            onPressIn={backChipPress.onPressIn}
            onPressOut={backChipPress.onPressOut}
            accessibilityRole="button"
            accessibilityLabel={t('gastos:calendar.backToCycleA11y')}
          >
            <Animated.View
              style={[
                styles.backChip,
                { backgroundColor: theme.colors.text },
                backChipPress.animatedStyle,
              ]}
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
                {t('gastos:calendar.fullCycle')}
              </Text>
            </Animated.View>
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
  const { t } = useTranslation()
  const d = direction === 'prev' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'
  // Press scale solo cuando no está disabled. Cuando lo está, el
  // opacity 0.35 sigue siendo el feedback visual de estado.
  const press = usePressScale({ pressedScale: 0.92 })
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={disabled ? undefined : press.onPressIn}
      onPressOut={disabled ? undefined : press.onPressOut}
      disabled={disabled}
      accessibilityState={{ disabled }}
      accessibilityRole="button"
      accessibilityLabel={direction === 'prev' ? t('gastos:calendar.prevDayA11y') : t('gastos:calendar.nextDayA11y')}
    >
      <Animated.View
        style={[
          styles.chevronBtn,
          {
            backgroundColor: bg,
            borderColor: border,
            opacity: disabled ? 0.35 : 1,
          },
          disabled ? undefined : press.animatedStyle,
        ]}
      >
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path d={d} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
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
  // Two-layer split (introducido en re-audit Sprint B hotfix):
  //
  // `dayCellLayout` va EN el Pressable wrapper (y en las empty cells
  // como View directo). Es responsable del layout dentro del row:
  // `flex: 1` para tomar 1/7 del row, `aspectRatio: 1` para que sea
  // cuadrada. Sin esto, el Pressable colapsa al tamaño del contenido
  // y rompe el grid (las empty cells siguen con flex:1 → mismatch).
  //
  // `dayCellSurface` va EN el Animated.View interno. Carga el visual
  // chrome (border, radius, alignment) y recibe la transform del
  // press scale. El `width/height: '100%'` lo hace llenar el
  // Pressable parent que ya está dimensionado por el layout.
  //
  // Todas las cells (real + empty) heredan el mismo border de 1px
  // (transparent por default) para que sus content-boxes alineen
  // exactamente — sin esto, RN Web's box-sizing desalinearía los
  // cells por 1px según tengan border o no.
  dayCellLayout: {
    flex: 1,
    aspectRatio: 1,
  },
  dayCellSurface: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    position: 'relative',
  },
  dayNumber: { fontSize: 13, fontWeight: '700' },
  todayDot: { position: 'absolute', bottom: 4, alignSelf: 'center' },
  // Shares the same slot as todayDot (4pt from the bottom, centered)
  // so the cell layout doesn't shift when a day toggles its marked
  // state. They're mutually exclusive at render time (see DayCell).
  noSpendLeaf: { position: 'absolute', bottom: 3, alignSelf: 'center' },
  moodPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  moodText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  focusHero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 4, paddingTop: 8 },
  focusCenter: { flex: 1, alignItems: 'center' },
  focusCenterInner: { alignItems: 'center' },
  focusDay: { fontSize: 72, fontWeight: '800', letterSpacing: -3, lineHeight: 70 },
  focusDaySub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  chevronBtn: {
    width: 36, height: 36, borderRadius: 999, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  focusStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  // Tabular nums en focus-mode stats (GASTADO + MOVIMIENTOS) — los
  // dos valores se renderean en columnas paralelas y deben alinear.
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
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
