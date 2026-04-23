import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { AppSymbol } from '@/components/ui/app-symbol'
import { triggerHaptic } from '@/lib/haptics'
import { motionSprings } from '@/lib/motion'
import { withAlpha } from '@/theme/color-utils'
import { brand, radii } from '@/theme/palette'
import { typography } from '@/theme/typography'

interface PaydayPillProps {
  daysUntilPayday: number | null
  cycleProgress: number | null
  isPending: boolean
  onPressConfirm: () => void
}

// Proximity tiers — ink/bg pairs readable on the dark hero card surface.
const TIERS = {
  far: { ink: '#F3A5A5', bg: 'rgba(240,106,106,0.22)' },
  mid: { ink: '#F3BA57', bg: 'rgba(243,186,87,0.22)' },
  near: { ink: brand.bright, bg: withAlpha(brand.bright, 0.22) },
}

function resolveTier(progress: number | null) {
  if (progress == null || !Number.isFinite(progress)) return TIERS.mid
  if (progress < 0.34) return TIERS.far
  if (progress < 0.67) return TIERS.mid
  return TIERS.near
}

function resolveLabel(days: number) {
  if (days === 0) return 'Cobro hoy'
  if (days === 1) return 'Cobro mañana'
  return `Cobro en ${days} días`
}

export function PaydayPill({
  daysUntilPayday,
  cycleProgress,
  isPending,
  onPressConfirm,
}: PaydayPillProps) {
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)

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
          style={[styles.pill, { backgroundColor: brand.bright }]}
        >
          <AppSymbol
            name="clock.badge.checkmark.fill"
            fallback="check-circle"
            size={12}
            color={brand.deep}
          />
          <Text style={[typography.caption, styles.pendingLabel, { color: brand.deep }]}>
            Llegó · Confirmar
          </Text>
        </Pressable>
      </Animated.View>
    )
  }

  const tier = resolveTier(cycleProgress)
  const label = resolveLabel(daysUntilPayday ?? 0)
  const accessibilityLabel =
    daysUntilPayday === 0
      ? 'Hoy es tu día de cobro'
      : `Faltan ${daysUntilPayday} día${daysUntilPayday === 1 ? '' : 's'} para tu próximo cobro`

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={[styles.pill, { backgroundColor: tier.bg }]}
    >
      <AppSymbol name="clock.fill" fallback="schedule" size={12} color={tier.ink} />
      <Text style={[typography.caption, styles.label, { color: tier.ink }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.3,
    lineHeight: 14,
  },
  pendingLabel: {
    fontWeight: '800',
    letterSpacing: 0.3,
    lineHeight: 14,
  },
})
