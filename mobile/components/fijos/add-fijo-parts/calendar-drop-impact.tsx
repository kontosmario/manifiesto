// Day-of-month picker del step 2 del wizard add-fijo. Render 1-31 sin
// weekday alignment (el day recurre todos los meses, atar el layout a
// un mes específico sería misleading). El selected cell muestra el
// emoji de la categoría centrado con el day number badged en la
// esquina. La card pulsea con el `primary` cuando no hay día elegido
// (visual cue replace "elegiste el día" copy).
//
// Extraído de `add-fijo-v2-screen.tsx` para mantener el screen como
// orquestador.
import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { CategoryIcon } from '@/components/category/category-icon'
import { hexAlpha } from '@/features/fixed-expenses/add-fijo-helpers'
import { useFijosSkin } from '@/components/fijos/fijos-skin'
import { useAppTheme } from '@/theme/theme-provider'

export interface CalendarDropImpactProps {
  day: number | null
  onChangeDay: (next: number) => void
  category: { id: string; name: string; color: string }
}

export function CalendarDropImpact({
  day,
  onChangeDay,
  category,
}: CalendarDropImpactProps) {
  const { theme } = useAppTheme()
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  // category.name es el nombre CRUDO de la categoría. CategoryIcon rendea
  // el sticker si hay slug mapeado, sino cae al emoji.
  const color = category.color
  const TOTAL_DAYS = 31

  // Pulsea el border de la card + el prompt text mientras no haya día
  // elegido. Para cuando el user elige uno. Visual cue replace "se te
  // olvidó elegir un día" copy / error state.
  const pulse = useSharedValue(0)
  useEffect(() => {
    if (day != null || reduceMotion) {
      pulse.value = 0
      return
    }
    // ease-in-out sin curve da un soft breathing rhythm — linear
    // timing se sentía mecánico y el color saltaba en cada boundary.
    pulse.value = withRepeat(
      withSequence(
        // @motion-allow: 950ms breathing pulse half-cycle with sin in/out for organic day-picker rhythm
        withTiming(1, { duration: 950, easing: Easing.inOut(Easing.sin) }),
        // @motion-allow: 950ms breathing pulse half-cycle with sin in/out for organic day-picker rhythm
        withTiming(0, { duration: 950, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    )
    return () => {
      // El modal se puede cerrar mid-pulse; cancela el worklet driver
      // así no sigue corriendo en el UI runtime post-unmount.
      cancelAnimation(pulse)
    }
  }, [day, reduceMotion, pulse])

  // Mantenemos borderWidth fijo (set en styles.calendarCard) y SÓLO
  // animamos el color. Animar borderWidth cambiaría el inner content
  // rect 2px en cada pulse, refireando onLayout en el grid y resizando
  // visiblemente las day cells al ritmo del pulse — el calendario
  // parecería "respirar".
  const cardPulseStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      pulse.value,
      [0, 1],
      [theme.colors.line, theme.colors.primary],
    ),
  }))

  return (
    <Animated.View
      style={[
        styles.calendarCard,
        { backgroundColor: theme.colors.creamCard },
        cardPulseStyle,
      ]}
    >
      <View style={styles.calendarGrid}>
        {Array.from({ length: TOTAL_DAYS }).map((_, idx) => {
          const n = idx + 1
          const isTarget = n === day

          return (
            <View key={`d-${n}`} style={styles.calendarCellWrap}>
              {isTarget ? (
                <Pressable
                  onPress={() => onChangeDay(n)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: true }}
                  accessibilityLabel={t('fijos:wizard.calendar.daySelectedA11y', { day: n })}
                  style={styles.calendarCell}
                >
                  <LinearGradient
                    colors={[color, hexAlpha(color, 0.82)] as unknown as readonly [string, string, ...string[]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        borderRadius: neo ? 11 : 8,
                        boxShadow: neo
                          ? '0px 5px 11px rgba(46,116,52,0.4)'
                          : `0px 4px 10px -3px ${hexAlpha(color, 0.55)}`,
                      } as unknown as object,
                    ]}
                  />
                  <CategoryIcon
                    name={category.name}
                    scope="fixed_expense"
                    size={24}
                    emojiStyle={styles.calendarCellEmoji}
                  />
                  <View
                    style={[
                      styles.calendarCellDayBadge,
                      { backgroundColor: 'rgba(255,255,255,0.85)' },
                    ]}
                  >
                    <Text style={styles.calendarCellDayBadgeText}>{n}</Text>
                  </View>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => onChangeDay(n)}
                  accessibilityRole="button"
                  accessibilityLabel={t('fijos:wizard.calendar.dayA11y', { day: n })}
                  style={({ pressed }) => [
                    styles.calendarCell,
                    {
                      backgroundColor: theme.colors.creamSoft,
                      opacity: pressed ? 0.7 : 1,
                    },
                    // Handoff: cada día es un POZO (r11, inset 3/3/7), no una
                    // celda plana. El seleccionado sale del pozo y se eleva.
                    neo
                      ? {
                          backgroundColor: neo.add.well.background,
                          borderRadius: 11,
                          boxShadow: neo.chip.shadow,
                        }
                      : null,
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.calendarCellNum,
                      { color: theme.colors.text },
                      neo ? { fontSize: 12.5, fontWeight: '800' as const, color: neo.ink.title } : null,
                    ]}
                  >
                    {n}
                  </Text>
                </Pressable>
              )}
            </View>
          )
        })}
      </View>

      {day != null ? (
        <Text style={[styles.calendarFoot, { color: theme.colors.textMuted }]}>
          {t('fijos:wizard.calendar.footSelected', { day })}
        </Text>
      ) : (
        <Text
          style={[
            styles.calendarFoot,
            styles.calendarFootPrompt,
            { color: theme.colors.primary },
          ]}
        >
          {t('fijos:wizard.calendar.footPrompt')}
        </Text>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  calendarCard: {
    padding: 14,
    borderRadius: 16,
    // Fixed width así la pulse animation sólo cambia color, no size.
    // Animar borderWidth haría re-measure del inner grid y bouncear las
    // day cells.
    borderWidth: 2,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Contra el cell-wrap padding así los outer edges del grid quedan
    // flush con el inner padding de la card.
    marginHorizontal: -3,
    marginVertical: -3,
  },
  // El wrap toma exactly 1/7 del grid width (no measurement needed).
  // Padding interno actúa como el gap entre cells, manteniendo el
  // layout pixel-perfect cross device-widths y immune al re-measurement
  // durante border animations.
  calendarCellWrap: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 3,
  },
  calendarCell: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  calendarCellNum: {
    fontSize: 13,
    fontWeight: '600',
  },
  calendarCellEmoji: {
    textAlign: 'center',
    includeFontPadding: false,
    fontSize: 18,
    lineHeight: 22,
  },
  calendarCellDayBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCellDayBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0A1410',
  },
  calendarFoot: {
    marginTop: 12,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  calendarFootPrompt: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
})
