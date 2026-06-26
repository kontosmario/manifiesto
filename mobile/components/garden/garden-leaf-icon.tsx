import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { FernMark } from '@/components/billing/fern-mark'
import {
  CIRCLE_BUTTON_RADIUS,
  CIRCLE_BUTTON_SHADOW,
  CIRCLE_BUTTON_SIZE,
  circleButtonSurface,
} from '@/components/ui/circle-button-chrome'
import type { StreakData } from '@/features/streaks/use-streak'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'

interface GardenLeafIconProps {
  data: StreakData
  onPress: () => void
}

/**
 * Botón del header de Gastos — reemplaza la llama (StreakFlameIcon) por el
 * helecho de marca + badge con la racha. onPress navega a "Mi jardín".
 */
function GardenLeafIconImpl({ data, onPress }: GardenLeafIconProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const press = usePressScale({ pressedScale: 0.94 })
  const surface = circleButtonSurface(theme.isDark, theme.colors)
  const badgeText = String(data.currentStreak)

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={t('garden:leafIcon.a11y', { count: data.currentStreak })}
    >
      <Animated.View style={[styles.container, { backgroundColor: surface }, press.animatedStyle]}>
        <FernMark variant={theme.isDark ? 'mint' : 'forest'} size={24} />
        <View style={[styles.badge, { backgroundColor: theme.colors.primary, borderColor: surface }]}>
          <Text style={[styles.badgeText, { color: theme.isDark ? theme.colors.canvas : '#FFFFFF' }]}>
            {badgeText}
          </Text>
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

export const GardenLeafIcon = memo(GardenLeafIconImpl)
