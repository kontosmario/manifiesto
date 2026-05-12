import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { AnimatedFlame, FLAME_PALETTE } from '@/components/gastos/animated-flame'
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
  const derived = deriveStreak(data)
  const palette = FLAME_PALETTE[derived.status]
  // Press scale Emil-grade. Antes el Pressable no tenía NINGÚN feedback
  // de tap (ni opacity, ni scale) — 44×44 tap-target en el header de
  // Gastos. 0.94 es ligeramente más pronunciado que el 0.97 default
  // para que el feedback se note en un tap-target chico.
  const press = usePressScale({ pressedScale: 0.94 })

  // Hour-of-day urgency ramp for the at_risk button — green/amber/
  // orange/red echoes the sheet hero, so the header tells the user the
  // same story even before they open the streak.
  const atRiskRamp = {
    calm: { bg: 'rgba(73,214,31,0.12)', border: 'rgba(73,214,31,0.35)' },
    gentle: { bg: 'rgba(243,186,87,0.16)', border: 'rgba(243,186,87,0.42)' },
    urgent: { bg: 'rgba(236,122,81,0.16)', border: 'rgba(236,122,81,0.45)' },
    critical: { bg: 'rgba(240,106,106,0.16)', border: 'rgba(240,106,106,0.45)' },
  } as const
  const atRiskRampStyle =
    derived.status === 'at_risk' && derived.atRiskIntensity
      ? atRiskRamp[derived.atRiskIntensity]
      : null

  const bgByStatus = {
    active: 'rgba(73,214,31,0.12)',
    at_risk: atRiskRampStyle?.bg ?? 'rgba(236,122,81,0.14)',
    broken: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(18,33,26,0.04)',
  } as const
  const borderByStatus = {
    active: 'rgba(73,214,31,0.35)',
    at_risk: atRiskRampStyle?.border ?? 'rgba(236,122,81,0.45)',
    broken: theme.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,33,26,0.12)',
  } as const
  const badgeText = derived.status === 'broken' ? '0' : String(data.currentStreak)
  // Borde + texto del badge usan tokens del tema en vez de hex
  // hardcodeados (audit §13). Pageant + heroText cubren los modos
  // light y dark con buena legibilidad sobre el fondo del flame.
  const badgeBorder = theme.colors.pageBg
  const badgeTextColor = derived.status === 'broken' ? theme.colors.textMuted : theme.colors.heroText

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`Racha: ${data.currentStreak} días, estado ${derived.status}`}
    >
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: bgByStatus[derived.status],
            borderColor: borderByStatus[derived.status],
          },
          press.animatedStyle,
        ]}
      >
        <AnimatedFlame status={derived.status} size={26} />
        <View
          style={[
            styles.badge,
            { backgroundColor: palette.outer, borderColor: badgeBorder },
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
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 2,
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
