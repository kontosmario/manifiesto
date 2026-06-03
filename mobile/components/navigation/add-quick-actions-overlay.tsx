import { useEffect, useRef, useState } from 'react'
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  Easing,
  Extrapolation,
  FadeInDown,
  FadeOutDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { BlurView } from 'expo-blur'
import { MaterialIcons } from '@expo/vector-icons'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import {
  motionDurations,
  motionEasings,
  motionSprings,
} from '@/lib/motion/tokens'
import { withAlpha } from '@/theme/color-utils'
import { useAppTheme } from '@/theme/theme-provider'

export interface QuickAction {
  key: 'expense' | 'fixed' | 'income' | 'no-spend' | 'import'
  label: string
  icon: keyof typeof MaterialIcons.glyphMap
  onPress: () => void
  /** Optional visual override. 'marked' tints the tile in a paler
   *  green to communicate "ya está hecho hoy" without removing it
   *  from the menu (so the user can toggle it off). */
  visualState?: 'default' | 'marked'
  /** Accent color used to tint the icon on secondary tiles. The
   *  primary tile ignores this — it's already brand-saturated. */
  accentColor?: string
  /** `'primary'` renders as the full-width top tile with brand fill;
   *  `'secondary'` (default) renders in the 2×2 grid below. Exactly
   *  one action should be marked primary per overlay. */
  tier?: 'primary' | 'secondary'
}

interface AddQuickActionsOverlayProps {
  visible: boolean
  onDismiss: () => void
  actions: QuickAction[]
}

const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)
// Card lives just above the FAB. Tab bar bottom (14) + tab bar
// half (44) + FAB lift (18) + FAB radius (28) + gap (18) ≈ 122.
const CARD_BOTTOM_OFFSET = 122
const CARD_HORIZONTAL_MARGIN = 16
const PRIMARY_TILE_HEIGHT = 76
const SECONDARY_TILE_HEIGHT = 84

/**
 * Hierarchical quick-actions card. Replaces the 5-petal radial fan
 * which felt disproportionate once the wizard import shipped — five
 * equal-sized petals gave the eye no hint about which action is the
 * default ("cargar un gasto"), and the labels crowded each other.
 *
 * Layout, top to bottom:
 *   1. Tiny eyebrow ("¿QUÉ CARGÁS?").
 *   2. Primary tile (full-width, brand fill, biggest icon + label).
 *      Reserved for the most-used action — typically "Gasto".
 *   3. 2×2 grid of secondary tiles. Filled in caller order, left to
 *      right, top to bottom. Up to 4 secondaries cleanly; more wraps
 *      gracefully.
 *
 * Card enters anchored to the FAB: spring-driven scale (0.85→1) +
 * translateY (40→0) + opacity (0→1), so it reads as the FAB
 * "blooming" into a card rather than a sheet sliding from the bottom.
 * Tiles stagger in with FadeInDown over the card's expansion. Dismiss
 * uses a faster timing reverse so the user's tap returns focus to the
 * underlying screen without lingering chrome.
 */
export function AddQuickActionsOverlay({
  visible,
  onDismiss,
  actions,
}: AddQuickActionsOverlayProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const progress = useSharedValue(0)
  const [mounted, setMounted] = useState(false)
  // Set right before triggering dismiss when the user taps a tile, so
  // the next render's effect skips the spring and unmounts the overlay
  // immediately. Selecting a tile hands focus off to the next route /
  // sheet; a slow card retraction would just fight that animation.
  const skipNextExitRef = useRef(false)

  const primary = actions.find((a) => a.tier === 'primary') ?? null
  const secondaries = actions.filter((a) => a.tier !== 'primary')

  useEffect(() => {
    if (reduced) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional sync of mount state when visible toggles
      setMounted(visible)
      progress.value = visible ? 1 : 0
      return
    }
    if (visible) {
      setMounted(true)
      progress.value = withSpring(1, motionSprings.radialEnter)
    } else if (skipNextExitRef.current) {
      skipNextExitRef.current = false
      progress.value = 0
      setMounted(false)
    } else {
      // Timing-based exit (not a spring) so the Modal unmounts in a
      // known, short window — the rest threshold on a critically-
      // damped spring leaves the Modal capturing touches long after
      // the card is visually gone. Same pattern as the old fan.
      progress.value = withTiming(
        0,
        {
          duration: motionDurations.exitTab,
          easing: motionEasings.exitStandard,
        },
        (finished) => {
          if (finished) {
            runOnJS(setMounted)(false)
          }
        },
      )
    }
  }, [visible, progress, reduced])

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }))

  const cardStyle = useAnimatedStyle(() => {
    const t = progress.value
    return {
      opacity: interpolate(t, [0, 0.4, 1], [0, 0.9, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(t, [0, 1], [40, 0], Extrapolation.CLAMP) },
        { scale: interpolate(t, [0, 1], [0.85, 1], Extrapolation.CLAMP) },
      ],
    }
  })

  const handleTileSelect = (action: QuickAction) => {
    void triggerHaptic('selection')
    skipNextExitRef.current = true
    onDismiss()
    action.onPress()
  }

  // Each tile's `entering` delay so the staggered reveal accelerates
  // top-to-bottom, primary first. Tied to wall clock (not progress)
  // because Reanimated layout-anim presets don't read shared values —
  // good enough since the card enter spring lasts ~280ms which the
  // stagger fits inside.
  const PRIMARY_DELAY = 60
  const SECONDARY_STAGGER = 60
  const SECONDARY_BASE_DELAY = 140

  return (
    <Modal
      transparent
      visible={mounted}
      onRequestClose={onDismiss}
      statusBarTranslucent
      animationType="none"
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        accessibilityLabel="Cerrar acciones"
        accessibilityRole="button"
      >
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
          <BlurView
            intensity={28}
            tint={theme.isDark ? 'dark' : 'systemChromeMaterialDark'}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: '#06120C', opacity: 0.44 },
            ]}
          />
        </Animated.View>
      </Pressable>

      <View style={styles.cardWrap} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            cardStyle,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.line,
            },
          ]}
        >
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            ¿Qué cargás?
          </Text>

          {primary ? (
            <Animated.View
              entering={
                reduced
                  ? undefined
                  : FadeInDown.duration(motionDurations.standard)
                      .delay(PRIMARY_DELAY)
                      .easing(EASE_IOS)
              }
            >
              <PrimaryTile
                action={primary}
                onSelect={handleTileSelect}
                primaryColor={theme.colors.primary}
                isDark={theme.isDark}
              />
            </Animated.View>
          ) : null}

          {secondaries.length > 0 ? (
            <View style={styles.grid}>
              {secondaries.map((action, idx) => (
                <Animated.View
                  key={action.key}
                  style={styles.gridCell}
                  entering={
                    reduced
                      ? undefined
                      : FadeInDown.duration(motionDurations.standard)
                          .delay(SECONDARY_BASE_DELAY + idx * SECONDARY_STAGGER)
                          .easing(EASE_IOS)
                  }
                  exiting={
                    reduced
                      ? undefined
                      : FadeOutDown.duration(motionDurations.quick).easing(
                          EASE_IOS,
                        )
                  }
                >
                  <SecondaryTile
                    action={action}
                    onSelect={handleTileSelect}
                    surfaceMuted={theme.colors.surfaceMuted}
                    line={theme.colors.line}
                    textColor={theme.colors.text}
                    mutedColor={theme.colors.textMuted}
                  />
                </Animated.View>
              ))}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  )
}

// ─── Tiles ──────────────────────────────────────────────────────

interface PrimaryTileProps {
  action: QuickAction
  onSelect: (a: QuickAction) => void
  primaryColor: string
  isDark: boolean
}

function PrimaryTile({
  action,
  onSelect,
  primaryColor,
  isDark,
}: PrimaryTileProps) {
  const pressScale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }))

  const baseBg =
    action.visualState === 'marked'
      ? withAlpha(primaryColor, isDark ? 0.55 : 0.45)
      : primaryColor
  // Foreground = darkest brand green on bright fills (legible across
  // both themes). Mirrors the petal contrast from the legacy fan.
  const fg = isDark ? '#0E1B14' : '#0F2D06'

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityLabel={action.label}
        accessibilityRole="button"
        onPress={() => onSelect(action)}
        onPressIn={() => {
          pressScale.value = withTiming(0.97, {
            duration: motionDurations.micro,
            easing: EASE_IOS,
          })
        }}
        onPressOut={() => {
          pressScale.value = withTiming(1, {
            duration: motionDurations.micro,
            easing: EASE_IOS,
          })
        }}
        style={({ pressed }) => [
          styles.primaryTile,
          {
            backgroundColor: baseBg,
            opacity: pressed ? 0.94 : 1,
            shadowColor: primaryColor,
          },
        ]}
      >
        <View style={[styles.primaryIcon, { backgroundColor: withAlpha(fg, 0.12) }]}>
          <MaterialIcons name={action.icon} size={26} color={fg} />
        </View>
        <View style={styles.primaryLabelCol}>
          <Text
            style={[styles.primaryLabel, { color: fg }]}
            numberOfLines={1}
          >
            {action.label}
          </Text>
        </View>
        <MaterialIcons name="arrow-forward" size={20} color={fg} />
      </Pressable>
    </Animated.View>
  )
}

interface SecondaryTileProps {
  action: QuickAction
  onSelect: (a: QuickAction) => void
  surfaceMuted: string
  line: string
  textColor: string
  mutedColor: string
}

function SecondaryTile({
  action,
  onSelect,
  surfaceMuted,
  line,
  textColor,
  mutedColor,
}: SecondaryTileProps) {
  const pressScale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }))

  const accent = action.accentColor ?? mutedColor
  const iconBg = withAlpha(accent, 0.16)
  const isMarked = action.visualState === 'marked'

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityLabel={action.label}
        accessibilityRole="button"
        onPress={() => onSelect(action)}
        onPressIn={() => {
          pressScale.value = withTiming(0.97, {
            duration: motionDurations.micro,
            easing: EASE_IOS,
          })
        }}
        onPressOut={() => {
          pressScale.value = withTiming(1, {
            duration: motionDurations.micro,
            easing: EASE_IOS,
          })
        }}
        style={({ pressed }) => [
          styles.secondaryTile,
          {
            backgroundColor: surfaceMuted,
            borderColor: isMarked ? accent : line,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.secondaryIcon,
            { backgroundColor: iconBg },
          ]}
        >
          <MaterialIcons name={action.icon} size={22} color={accent} />
        </View>
        <Text
          style={[styles.secondaryLabel, { color: textColor }]}
          numberOfLines={2}
        >
          {action.label}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

// ─── Styles ─────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width

const styles = StyleSheet.create({
  cardWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: CARD_BOTTOM_OFFSET,
    alignItems: 'center',
  },
  card: {
    width: Math.min(SCREEN_WIDTH - CARD_HORIZONTAL_MARGIN * 2, 480),
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 18,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    paddingLeft: 4,
  },
  primaryTile: {
    minHeight: PRIMARY_TILE_HEIGHT,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 10,
  },
  primaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabelCol: {
    flex: 1,
    gap: 2,
  },
  primaryLabel: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridCell: {
    width: '48.5%',
  },
  secondaryTile: {
    minHeight: SECONDARY_TILE_HEIGHT,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  secondaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 16,
  },
})
