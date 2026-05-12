import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { triggerHaptic } from '@/lib/haptics'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import type { AchievementViewItem, AchievementTier } from '@/features/achievements/use-achievements'
import { useAppTheme } from '@/theme/theme-provider'

interface AchievementUnlockModalProps {
  /** The unlocked item to celebrate. `null` keeps the modal hidden. */
  item: AchievementViewItem | null
  onDismiss: () => void
}

const TIER_RING: Record<AchievementTier, { from: string; to: string; ring: string }> = {
  bronze: { from: '#F2B58A', to: '#E07A3F', ring: 'rgba(242,181,138,0.40)' },
  silver: { from: '#D8DCE6', to: '#A0A8B8', ring: 'rgba(216,220,230,0.45)' },
  gold: { from: '#F4D26B', to: '#C29D2A', ring: 'rgba(244,210,107,0.45)' },
  legendary: { from: '#A6EF8F', to: '#329315', ring: 'rgba(166,239,143,0.55)' },
}

/**
 * Full-screen unlock celebration. Mounts on top of everything when an
 * achievement is earned. Combines:
 *   - A semi-opaque scrim (cream-on-dark or dark-on-cream depending
 *     on theme) that fades in.
 *   - A pill card with the icon (big), title, body, and a tier ring.
 *   - A ConfettiBurst pulse aimed at the icon's vertical center.
 *
 * Tap anywhere → dismiss. Auto-dismiss after 4s if the user leaves
 * the screen alone. Triggers a `success` haptic on appear.
 */
export function AchievementUnlockModal({
  item,
  onDismiss,
}: AchievementUnlockModalProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()

  // Modal-level animation values. The card scales + lifts in; the
  // scrim fades. Both anchor on a single `t` driver so they stay in
  // phase across slow devices.
  const t = useSharedValue(0)
  const iconScale = useSharedValue(0.85)

  useEffect(() => {
    if (!item) return
    void triggerHaptic('success')
    // Sequence: scrim+card enter, icon bounce, then auto-dismiss timer.
    if (reduced) {
      t.value = 1
      iconScale.value = 1
      return
    }
    t.value = 0
    iconScale.value = 0.85
    t.value = withTiming(1, {
      duration: 380,
      easing: Easing.bezier(0.16, 1, 0.30, 1),
    })
    iconScale.value = withDelay(
      120,
      withSequence(
        withTiming(1.12, { duration: 280, easing: Easing.bezier(0.34, 1.56, 0.64, 1) }),
        withTiming(1, { duration: 200, easing: Easing.bezier(0.45, 0, 0.55, 1) }),
      ),
    )
  }, [item, reduced, t, iconScale])

  // Auto-dismiss timer (4 seconds). User can also tap to dismiss
  // earlier. Cleared on unmount + on item change.
  useEffect(() => {
    if (!item) return
    const id = setTimeout(onDismiss, 4000)
    return () => clearTimeout(id)
  }, [item, onDismiss])

  const scrimStyle = useAnimatedStyle(() => ({ opacity: t.value }))
  const cardStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [
      { translateY: (1 - t.value) * 16 },
      { scale: 0.94 + t.value * 0.06 },
    ],
  }))
  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }))

  if (!item) return null

  const tier = TIER_RING[item.tier]

  return (
    <Animated.View
      pointerEvents={item ? 'auto' : 'none'}
      style={[styles.scrim, scrimStyle]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar celebración"
        onPress={onDismiss}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: theme.colors.line,
            shadowColor: '#000',
          },
          cardStyle,
        ]}
      >
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          LOGRO DESBLOQUEADO
        </Text>

        <View style={styles.iconWrap}>
          <View
            style={[
              styles.iconRing,
              {
                backgroundColor: tier.ring,
                shadowColor: tier.to,
              },
            ]}
          />
          <Animated.View style={[styles.iconBubble, iconAnimatedStyle]}>
            <Text style={styles.iconGlyph}>{item.icon}</Text>
          </Animated.View>
        </View>

        <Text style={[styles.title, { color: theme.colors.text }]}>{item.title}</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>{item.body}</Text>

        <View style={[styles.tierPill, { backgroundColor: tier.ring }]}>
          <Text style={[styles.tierPillText, { color: tier.to }]}>
            {tierLabel(item.tier)}
          </Text>
        </View>

        <Text style={[styles.hint, { color: theme.colors.textSoft }]}>
          tocá para cerrar
        </Text>

        {/* Confetti centered on the icon. originY=110 lands the burst
            just above the title — the user's eye follows the icon's
            bounce-in and the particles spawn at the same focal point. */}
        <ConfettiBurst pulseToken={1} originY={110} />
      </Animated.View>
    </Animated.View>
  )
}

function tierLabel(tier: AchievementTier): string {
  switch (tier) {
    case 'bronze': return 'BRONCE'
    case 'silver': return 'PLATA'
    case 'gold': return 'ORO'
    case 'legendary': return 'LEYENDA'
  }
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(8, 34, 26, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 28,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.32,
    shadowRadius: 36,
    elevation: 16,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 20,
  },
  iconWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  iconRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
  },
  iconBubble: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFFBF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: { fontSize: 54 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
    marginBottom: 18,
  },
  tierPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 14,
  },
  tierPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  hint: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
})
