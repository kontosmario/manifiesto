import { useEffect, useMemo, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion/tokens'
import { cssGradient, neoRadii } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { weekdayShort } from '@/utils/date-format'
import { buildCycleDays, type CycleDay } from '@/features/import-review/cycle-date-math'
import { useImportReviewNeo } from './import-review-neo'

const TILE_WIDTH = 48
const TILE_HEIGHT = 58
const TILE_GAP = 6
const TILE_TOTAL_WIDTH = TILE_WIDTH + TILE_GAP

// Abreviatura del día indexada por Date.getDay() (0=Domingo … 6=Sábado),
// derivada del idioma activo (NO un array ES fijo). 2024-01-07 fue domingo,
// así que sumar el índice da el día correcto.
const weekdayLabel = (dowSunday0: number): string =>
  weekdayShort(new Date(2024, 0, 7 + dowSunday0))

interface Props {
  /** Selected day ISO (YYYY-MM-DD). */
  value: string
  cycleStart: Date
  cycleDays: number
  /** Today ISO for the "today" dot indicator. */
  today: string
  onChange: (iso: string) => void
}

/**
 * Riel de días del ciclo: una PISTA hundida sobre la que el día elegido se
 * extruye como una perilla. El relieve es lo que comunica la selección — no
 * un fill de color —, que es el recurso del vocabulario para "esto está
 * puesto acá".
 */
export function CycleDateSlider({
  value,
  cycleStart,
  cycleDays,
  today,
  onChange,
}: Props) {
  const { neo, ink, softInk, wellFallback } = useImportReviewNeo()
  const { t } = useTranslation()
  const scrollRef = useRef<ScrollView>(null)

  const days = useMemo(
    () => buildCycleDays(cycleStart, cycleDays, today),
    [cycleStart, cycleDays, today],
  )

  const selectedIndex = useMemo(
    () => days.findIndex((d) => d.iso === value),
    [days, value],
  )

  // Center the strip on the selected day. We only auto-scroll when the
  // selection changes externally (e.g., row patched) — the user's own
  // free-swipe is left untouched so they can scan dates without the
  // strip jumping under them.
  useEffect(() => {
    if (selectedIndex < 0) return
    const node = scrollRef.current
    if (!node) return
    const x = selectedIndex * TILE_TOTAL_WIDTH
    requestAnimationFrame(() => {
      node.scrollTo({ x, animated: true })
    })
  }, [selectedIndex])

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: neo.well, boxShadow: neo.shadows.insetMd },
        wellFallback,
      ]}
      accessibilityRole="adjustable"
      accessibilityLabel={t('gastos:import.dateSlider.a11yLabel')}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        // Snap keeps the strip visually tidy when the user lets go after
        // a free swipe, but we DON'T fire selection on momentum-end. The
        // user told us that auto-selecting on swipe felt wrong — swipe
        // should let them browse dates without committing; tap commits.
        snapToInterval={TILE_TOTAL_WIDTH}
        decelerationRate="fast"
        snapToAlignment="center"
        contentContainerStyle={styles.scrollContent}
      >
        {days.map((d, idx) => (
          <DayTile
            key={d.iso}
            day={d}
            isSelected={d.iso === value}
            onPress={() => {
              // Un gasto no puede ser futuro — el tile está atenuado y
              // este guard es la red de seguridad.
              if (d.isFuture || d.iso === value) return
              void triggerHaptic('selection')
              onChange(d.iso)
              scrollRef.current?.scrollTo({
                x: idx * TILE_TOTAL_WIDTH,
                animated: true,
              })
            }}
            accentInk={ink.accent}
            textColor={neo.text}
            // `softInk`, no `textMuted`: la abreviatura del día mide 10px y
            // sobre el pozo el muted se queda en 3.73:1.
            mutedColor={softInk}
            raisedGradientCss={neo.raisedGradientCss}
            raisedFallback={neo.surface}
            raisedShadow={neo.shadows.raisedSm}
            selectedTint={neo.selectedTint}
          />
        ))}
      </ScrollView>
    </View>
  )
}

interface TileProps {
  day: CycleDay
  isSelected: boolean
  onPress: () => void
  accentInk: string
  textColor: string
  mutedColor: string
  raisedGradientCss: string
  raisedFallback: string
  raisedShadow: string
  selectedTint: string
}

function DayTile({
  day,
  isSelected,
  onPress,
  accentInk,
  textColor,
  mutedColor,
  raisedGradientCss,
  raisedFallback,
  raisedShadow,
  selectedTint,
}: TileProps) {
  const { t } = useTranslation()
  const press = useSharedValue(1)
  // Días futuros: no seleccionables (un gasto no puede ser de mañana).
  const disabled = day.isFuture

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }))

  return (
    <Animated.View style={[styles.tileWrap, animatedStyle]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => {
          if (disabled) return
          press.value = withTiming(0.94, {
            duration: motionDurations.micro,
            easing: Easing.bezier(0.32, 0.72, 0, 1),
          })
        }}
        onPressOut={() => {
          if (disabled) return
          press.value = withTiming(1, {
            duration: motionDurations.micro,
            easing: Easing.bezier(0.32, 0.72, 0, 1),
          })
        }}
        accessibilityRole="button"
        accessibilityLabel={
          disabled
            ? t('gastos:import.dateSlider.dayA11yFuture', { day: day.day })
            : t('gastos:import.dateSlider.dayA11y', { day: day.day })
        }
        accessibilityState={{ selected: isSelected, disabled }}
        hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
        style={[
          styles.tile,
          isSelected
            ? {
                ...cssGradient(raisedGradientCss, raisedFallback),
                boxShadow: raisedShadow,
              }
            : null,
          disabled ? styles.tileDisabled : null,
        ]}
      >
        <Text
          style={[styles.weekday, { color: isSelected ? accentInk : mutedColor }]}
        >
          {weekdayLabel(day.weekday)}
        </Text>
        <View
          style={[
            styles.dayPill,
            isSelected ? { backgroundColor: selectedTint } : null,
          ]}
        >
          <Text
            style={[
              styles.dayNum,
              {
                color: isSelected ? accentInk : textColor,
                fontWeight: isSelected ? '900' : '700',
                fontFamily: nunitoFamily(isSelected ? '900' : '700'),
              },
            ]}
          >
            {day.day}
          </Text>
        </View>
        {day.isToday ? (
          <View style={[styles.todayDot, { backgroundColor: accentInk }]} />
        ) : (
          <View style={styles.todayDotSpacer} />
        )}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: neoRadii.pill,
  },
  // El riel recorta a sus bordes: el padding tiene que contener el alcance
  // de la sombra `raisedSm` del tile (offset 5 + blur 10 → 10pt) o el primero
  // y el último quedan con el relieve cortado a filo.
  scrollContent: {
    paddingHorizontal: 11,
    paddingVertical: 11,
    gap: TILE_GAP,
    alignItems: 'center',
  },
  tileWrap: {
    width: TILE_WIDTH,
  },
  tile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: neoRadii.tile,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 4,
  },
  tileDisabled: {
    opacity: 0.32,
  },
  // El `fontFamily` viaja con el peso: cada peso de Nunito es un face
  // estático propio, así que sin él el 800 se renderiza como regular.
  weekday: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.6,
    textTransform: 'lowercase',
  },
  dayPill: {
    minWidth: 32,
    height: 26,
    borderRadius: 999,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
  },
  todayDotSpacer: {
    width: 4,
    height: 4,
  },
})
