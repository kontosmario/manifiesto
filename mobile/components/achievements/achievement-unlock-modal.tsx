import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { triggerHaptic } from '@/lib/haptics'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { AuroraBloom } from '@/components/ui/aurora-bloom'
import { DrawRing } from '@/components/ui/draw-ring'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionSprings } from '@/lib/motion'
import type { AchievementViewItem, AchievementTier } from '@/features/achievements/use-achievements'
import { useAppTheme } from '@/theme/theme-provider'

interface AchievementUnlockModalProps {
  /** The unlocked item to celebrate. `null` keeps the modal hidden. */
  item: AchievementViewItem | null
  onDismiss: () => void
}

// Per-tier celebration tones. `to` drives the drawn ring stroke + the
// tier pill text; `ring` drives the aurora bloom + pill background.
//
// Theme-aware on purpose: in light mode the metallic endpoints read on
// the cream card. In DARK the celebration card is the forest creamCard
// (#305A47), where the light dark-endpoints muddy out — legendary's
// #329315 nearly vanished into the card. Following the color-palette
// rule "use the brighter shade in dark", dark uses the LUMINOUS end of
// each tier so the ring + pill pop as distinct, premium metallics
// against the near-black/forest celebration surface.
type TierTone = { to: string; ring: string }

const TIER_RING_LIGHT: Record<AchievementTier, TierTone> = {
  bronze: { to: '#E07A3F', ring: 'rgba(242,181,138,0.40)' },
  silver: { to: '#A0A8B8', ring: 'rgba(216,220,230,0.45)' },
  gold: { to: '#C29D2A', ring: 'rgba(244,210,107,0.45)' },
  legendary: { to: '#329315', ring: 'rgba(166,239,143,0.55)' },
}

const TIER_RING_DARK: Record<AchievementTier, TierTone> = {
  bronze: { to: '#F0B486', ring: 'rgba(240,180,134,0.32)' },
  silver: { to: '#CBD2DE', ring: 'rgba(203,210,222,0.32)' },
  gold: { to: '#F2D173', ring: 'rgba(242,209,115,0.34)' },
  legendary: { to: '#B6F0A0', ring: 'rgba(166,239,143,0.42)' },
}

function resolveTierTone(tier: AchievementTier, isDark: boolean): TierTone {
  return (isDark ? TIER_RING_DARK : TIER_RING_LIGHT)[tier]
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
    // Sequence: scrim+card enter, then the icon spring-pops in. The
    // tier ring draws itself around the bubble (DrawRing) and the
    // AuroraBloom breathes behind — both self-driven on their own
    // mounts, so this effect only owns the card entrance + icon pop.
    if (reduced) {
      t.value = 1
      iconScale.value = 1
      return
    }
    t.value = 0
    iconScale.value = 0.85
    // @motion-allow: 380ms card entrance — designer-tuned para el unlock celebrate; entre standard (240) y slow (480), curva ease-out-expo da el "land" pop.
    t.value = withTiming(1, {
      duration: 380,
      easing: Easing.bezier(0.16, 1, 0.30, 1),
    })
    // Spring pop — feels alive, interruptible (Emil: springs for elements
    // that should feel "alive"). celebrate token: mass 0.8, damping 14,
    // stiffness 260 — gives a snappy but slightly overshooting pop.
    iconScale.value = withDelay(120, withSpring(1, motionSprings.celebrate))
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

  const tier = resolveTierTone(item.tier, theme.isDark)

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
          {/* Aurora bloom — soft, breathing radial glow in the tier
              tone behind the icon. Supersedes the old single-shot halo
              pulse with a perpetual, low-amplitude breath. */}
          <AuroraBloom color={tier.ring} size={200} intensity={0.55} />
          {/* Tier ring that DRAWS itself as the celebration lands —
              full circle, starting just after the card enters.
              Absolutely centered so it wraps the bubble without
              displacing it in the layout flow. */}
          <View style={styles.iconRing} pointerEvents="none">
            <DrawRing
              size={120}
              strokeWidth={4}
              color={tier.to}
              progress={1}
              delay={120}
            />
          </View>
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
    alignItems: 'center',
    justifyContent: 'center',
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
