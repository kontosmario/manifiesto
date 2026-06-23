import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import Animated from 'react-native-reanimated'
import { useGarden } from '@/features/garden/use-garden'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import type { WeekDayState } from '@/features/garden/garden-model'

interface StreakWeekWidgetProps {
  familyId: string
  userId?: string
}

/**
 * Widget compacto de Home: tira semanal (L-M-M-J-V-S-D, un punto por día según
 * estado) + el número de racha inline. Refleja el jardín de forma glanceable;
 * tocarlo abre "Mi jardín". El brote se planta solo al registrar — el widget lee.
 * Diseñado para baja altura (se ve muchas veces al día → calmo y compacto).
 */
function StreakWeekWidgetImpl({ familyId, userId }: StreakWeekWidgetProps) {
  const { theme } = useAppTheme()
  const router = useRouter()
  const press = usePressScale({ pressedScale: 0.98 })
  const { data } = useGarden(familyId, userId)

  if (!data) return null

  const onPress = () => {
    void triggerHaptic('selection')
    router.push('/(app)/garden')
  }

  const dotColors = dotColorsFor(theme.isDark)

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`Tu jardín: racha de ${data.currentStreak} días. Abrir.`}
    >
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
            borderColor: theme.colors.line,
          },
          press.animatedStyle,
        ]}
      >
        <View style={styles.strip}>
          {data.weekStrip.map((day) => (
            <View key={day.iso} style={styles.dayCol}>
              <Text
                style={[
                  styles.letter,
                  {
                    color: day.isToday ? theme.colors.text : theme.colors.textMuted,
                    fontWeight: day.isToday ? '800' : '600',
                    opacity: day.state === 'future' ? 0.5 : 1,
                  },
                ]}
              >
                {day.letter}
              </Text>
              <View style={[styles.dot, dotStyle(day.state, dotColors)]} />
            </View>
          ))}
        </View>

        <View style={[styles.divider, { backgroundColor: theme.colors.line }]} />

        <View style={styles.count}>
          <Text style={[styles.countNumber, { color: theme.colors.text }]}>
            {data.currentStreak}
          </Text>
          <Text style={[styles.countLabel, { color: theme.colors.textMuted }]}>días</Text>
        </View>
      </Animated.View>
    </Pressable>
  )
}

interface DotColors {
  logged: string
  ring: string
  missed: string
  future: string
}

function dotColorsFor(isDark: boolean): DotColors {
  return {
    logged: isDark ? '#A6EF8F' : '#3C9A3D',
    ring: isDark ? '#A6EF8F' : '#3C9A3D',
    missed: isDark ? 'rgba(255,255,255,0.14)' : '#DAD6C8',
    future: isDark ? 'rgba(255,255,255,0.05)' : '#E7E5DA',
  }
}

function dotStyle(state: WeekDayState, c: DotColors) {
  switch (state) {
    case 'logged':
      return { backgroundColor: c.logged }
    case 'pending':
      return { backgroundColor: 'transparent', borderWidth: 2, borderColor: c.ring }
    case 'missed':
      return { backgroundColor: c.missed }
    case 'future':
    default:
      return { backgroundColor: c.future }
  }
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  strip: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: {
    alignItems: 'center',
    gap: 5,
  },
  letter: {
    fontSize: 10.5,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
  },
  count: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  countNumber: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  countLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
})

export const StreakWeekWidget = memo(StreakWeekWidgetImpl)
