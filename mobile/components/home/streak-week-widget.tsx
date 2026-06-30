import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'
import Animated from 'react-native-reanimated'
import { useGarden } from '@/features/garden/use-garden'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import type { WeekDayState, WeekStripDay } from '@/features/garden/garden-model'

interface StreakWeekWidgetProps {
  /** Requerido en Home; se omite en modo `preview` (pre-auth, sin familia). */
  familyId?: string
  userId?: string
  /**
   * Pre-auth onboarding PREVIEW: render the exact same widget with
   * illustrative week data instead of fetching the real garden. When
   * set, `useGarden` is called with empty args (its queries are gated
   * off → no network) and the row is non-interactive (there's no
   * `/(app)/garden` route before signup). Default `undefined` keeps the
   * real Home behaviour untouched.
   */
  preview?: { weekStrip: WeekStripDay[]; currentStreak: number }
}

/**
 * Widget compacto de Home: tira semanal (L-M-M-J-V-S-D, un punto por día según
 * estado) + chevron. Refleja el jardín de forma glanceable; tocarlo abre "Mi
 * jardín". El brote se planta solo al registrar — el widget lee. NO muestra el
 * número de racha (confundía: el jardín es indulgente con huecos). Diseñado
 * para baja altura (se ve muchas veces al día → calmo y compacto).
 */
function StreakWeekWidgetImpl({ familyId, userId, preview }: StreakWeekWidgetProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const router = useRouter()
  const press = usePressScale({ pressedScale: 0.98 })
  // En preview (pre-auth) pasamos args vacíos → useGarden no fetchea
  // (sus queries están gated por `enabled: Boolean(familyId && userId)`).
  const garden = useGarden(preview ? undefined : familyId, preview ? undefined : userId)
  const data = preview ?? garden.data

  if (!data) return null

  const onPress = preview
    ? undefined
    : () => {
        void triggerHaptic('selection')
        router.push('/(app)/garden')
      }

  const dotColors = dotColorsFor(theme.isDark)

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPress ? press.onPressIn : undefined}
      onPressOut={onPress ? press.onPressOut : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={t('home:streakWidget.accessibility', {
        count: data.currentStreak,
      })}
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
                    opacity: day.state === 'future' ? 0.7 : 1,
                  },
                ]}
              >
                {day.letter}
              </Text>
              <View style={[styles.dot, dotStyle(day.state, dotColors)]} />
            </View>
          ))}
        </View>

        {/* Sin número de racha (confundía): la tira semanal alcanza para el
            glance. El chevron indica que es tappable → abre "Mi jardín". */}
        {!preview ? (
          <MaterialIcons
            name="chevron-right"
            size={20}
            color={theme.colors.textMuted}
          />
        ) : null}
      </Animated.View>
    </Pressable>
  )
}

interface DotColors {
  logged: string
  ring: string
  missed: string
  recovered: string
  future: string
}

function dotColorsFor(isDark: boolean): DotColors {
  return {
    logged: isDark ? '#A6EF8F' : '#3C9A3D',
    ring: isDark ? '#A6EF8F' : '#3C9A3D',
    missed: isDark ? 'rgba(255,255,255,0.14)' : '#DAD6C8',
    // Coral = día que un escudo recuperó (espejo del brote 'recovered' del jardín).
    recovered: isDark ? '#F0B488' : '#E2935E',
    future: isDark ? 'rgba(255,255,255,0.05)' : '#E7E5DA',
  }
}

function dotStyle(state: WeekDayState, c: DotColors) {
  switch (state) {
    case 'logged':
      return { backgroundColor: c.logged }
    case 'pending':
      return { backgroundColor: 'transparent', borderWidth: 2, borderColor: c.ring }
    case 'recovered':
      return { backgroundColor: c.recovered }
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
})

export const StreakWeekWidget = memo(StreakWeekWidgetImpl)
