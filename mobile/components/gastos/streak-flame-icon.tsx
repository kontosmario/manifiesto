import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { AnimatedFlame, FLAME_PALETTE } from '@/components/gastos/animated-flame'
import {
  CIRCLE_BUTTON_RADIUS,
  CIRCLE_BUTTON_SHADOW,
  CIRCLE_BUTTON_SIZE,
  circleButtonSurface,
} from '@/components/ui/circle-button-chrome'
import { deriveStreak, type StreakData } from '@/features/streaks/use-streak'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'

interface StreakFlameIconProps {
  data: StreakData
  onPress: () => void
}

/**
 * Header button that replaces "+" in Gastos. Uses AnimatedFlame for
 * the glyph + aura and adds the theme-aware container chrome + day-count
 * badge around it.
 */
function StreakFlameIconImpl({ data, onPress }: StreakFlameIconProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const derived = deriveStreak(data)
  const palette = FLAME_PALETTE[derived.status]
  // Press scale Emil-grade. Antes el Pressable no tenía NINGÚN feedback
  // de tap (ni opacity, ni scale) — 44×44 tap-target en el header de
  // Gastos. 0.94 es ligeramente más pronunciado que el 0.97 default
  // para que el feedback se note en un tap-target chico.
  const press = usePressScale({ pressedScale: 0.94 })

  const badgeText = derived.status === 'broken' ? '0' : String(data.currentStreak)
  const badgeTextColor =
    derived.status === 'broken' ? theme.colors.textMuted : theme.colors.heroText
  // Neutral circular chrome shared with every other header button. The
  // streak STATE is still fully legible: the flame glyph itself ramps
  // colour by status (FLAME_PALETTE) and the day-count badge carries
  // the number — so the button joins the identical 38×38 circular
  // family without the bespoke status-tinted square it used before.
  // The badge border tracks the button surface so it reads as
  // "punched out" of the circle (same trick as the Home count badge).
  const surface = circleButtonSurface(theme.isDark, theme.colors)

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={t('gastos:streakSheet.flameIconA11y', {
        count: data.currentStreak,
        status: derived.status,
      })}
    >
      <Animated.View
        style={[
          styles.container,
          { backgroundColor: surface },
          press.animatedStyle,
        ]}
      >
        <AnimatedFlame status={derived.status} size={22} />
        <View
          style={[
            styles.badge,
            { backgroundColor: palette.outer, borderColor: surface },
          ]}
        >
          <Text style={[styles.badgeText, { color: badgeTextColor }]}>{badgeText}</Text>
        </View>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    width: CIRCLE_BUTTON_SIZE,
    height: CIRCLE_BUTTON_SIZE,
    borderRadius: CIRCLE_BUTTON_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    boxShadow: CIRCLE_BUTTON_SHADOW,
  },
  // Count badge — matches the Home header count badge chrome (16×16,
  // 1.5px punch-out border) so the two read as the same family.
  badge: {
    position: 'absolute',
    top: -2,
    right: -3,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },
})

/**
 * Memo wrap. StreakFlameIcon mountéa AnimatedFlame internamente con
 * ~23 useSharedValue + 5 useLoopAnimation. Sin memo, cada re-render
 * del parent disparaba re-evaluation de TODOS sus animation hooks.
 * Memo cierra eso — solo re-rendera cuando `data` cambia (lo cual
 * trigerea internamente el `useEffect` de los loops).
 */
export const StreakFlameIcon = memo(StreakFlameIconImpl)
