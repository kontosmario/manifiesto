import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated'
import { AppSymbol } from '@/components/ui/app-symbol'
import { triggerHaptic } from '@/lib/haptics'
import { motionSprings } from '@/lib/motion'
import { brand, radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface PaydayChipProps {
  daysUntilPayday: number | null
  isPending: boolean
  onPressConfirm: () => void
}

export function PaydayChip({ daysUntilPayday, isPending, onPressConfirm }: PaydayChipProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const emphasis = useSharedValue(isPending ? 1 : 0)

  useEffect(() => {
    if (reduceMotion) {
      emphasis.value = isPending ? 1 : 0
      return
    }
    emphasis.value = withSpring(isPending ? 1 : 0, motionSprings.celebrate)
  }, [isPending, reduceMotion, emphasis])

  const wrapperStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  if (daysUntilPayday == null && !isPending) return null

  if (isPending) {
    return (
      <Animated.View style={wrapperStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Confirmar cobro del día"
          accessibilityHint="Abre una hoja para confirmar el cobro de este ciclo"
          onPressIn={() => {
            if (reduceMotion) return
            // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write
            scale.value = withSpring(0.97, motionSprings.press)
          }}
          onPressOut={() => {
            // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write
            scale.value = withSpring(1, motionSprings.press)
          }}
          onPress={() => {
            void triggerHaptic('light')
            onPressConfirm()
          }}
          style={[
            styles.chip,
            {
              backgroundColor: brand.bright,
              borderColor: brand.bright,
            },
          ]}
        >
          <AppSymbol name="clock.badge.checkmark.fill" fallback="check-circle" size={14} color={brand.deep} />
          <Text style={[typography.buttonCompact, styles.label, { color: brand.deep }]}>
            Llegó tu cobro · Confirmar
          </Text>
        </Pressable>
      </Animated.View>
    )
  }

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        daysUntilPayday === 0
          ? 'Hoy es tu día de cobro'
          : `Tu próximo cobro es en ${daysUntilPayday} día${daysUntilPayday === 1 ? '' : 's'}`
      }
      style={[
        styles.chip,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <AppSymbol name="clock.fill" fallback="schedule" size={14} color={theme.colors.textMuted} />
      <Text style={[typography.buttonCompact, styles.label, { color: theme.colors.textMuted }]}>
        {daysUntilPayday === 0
          ? 'Cobro hoy'
          : `Cobro en ${daysUntilPayday} día${daysUntilPayday === 1 ? '' : 's'}`}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
    minHeight: 32,
  },
  label: {
    lineHeight: 16,
  },
})
