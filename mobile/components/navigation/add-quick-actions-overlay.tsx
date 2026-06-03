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
import { AddQuickActionIcon, type ActionKey } from './add-quick-action-icon'

export interface QuickAction {
  key: ActionKey
  label: string
  icon: keyof typeof MaterialIcons.glyphMap
  onPress: () => void
  /** Optional visual override. 'marked' tints the tile in a paler
   *  green to communicate "ya está hecho hoy" without removing it
   *  from the menu (so the user can toggle it off). */
  visualState?: 'default' | 'marked'
  /** Accent color used to tint the icon on secondary rows. The
   *  primary row ignores this — it's already brand-saturated. */
  accentColor?: string
  /** `'primary'` renders as the full-width top tile with brand fill;
   *  `'secondary'` (default) renders in the vertical list below. */
  tier?: 'primary' | 'secondary'
  /** Optional one-line context shown under the primary label (e.g.
   *  "lo más cargado"). Ignored on secondary rows. */
  subtitle?: string
}

interface AddQuickActionsOverlayProps {
  visible: boolean
  onDismiss: () => void
  actions: QuickAction[]
}

const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)
const CARD_BOTTOM_OFFSET = 122
const CARD_HORIZONTAL_MARGIN = 16
const PRIMARY_TILE_HEIGHT = 84
const SECONDARY_ROW_HEIGHT = 60

/**
 * Hierarchical FAB action menu. Replaces the legacy 5-petal radial
 * fan + (briefly) a 2×2 card grid, both of which read as "identical
 * card grid" once we had five actions. New composition:
 *
 *   [eyebrow]
 *   [PRIMARY full-width tile — brand fill, pulsing icon]
 *   [vertical list of secondary rows — accent-tinted icons]
 *
 * Each row carries a signature entrance animation via `AddQuickActionIcon`
 * so individual actions announce themselves (the "+" rotates in, the
 * scanner pass sweeps, the trending-up arrow climbs, the leaf wiggles,
 * the loop rotates). Combined with the tile-level FadeInDown stagger,
 * opening the overlay becomes a tiny choreography moment instead of a
 * generic "five buttons appear".
 *
 * Card bloom enters anchored to the FAB (spring scale 0.85→1,
 * translateY 40→0, opacity 0→1) so it reads as the FAB unfurling.
 * Exit uses timing (not a spring) to keep the Modal's touch-capture
 * window short — the rest threshold on a critically-damped spring
 * left the Modal grabbing taps long after the card was visually gone.
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

  // Choreography timing: primary tile enters at 80ms, then each
  // secondary at +70ms. The ActionIcon's signature animation runs
  // with the SAME delay (offset from mount) so the icon's identity
  // play lands just as the row's tile fade-in completes.
  const PRIMARY_DELAY = 80
  const SECONDARY_STAGGER = 70
  const SECONDARY_BASE_DELAY = 180

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
          {/* Theme-aware dim on top of the blur. The palette's `overlay`
              token is the canonical "dim while a sheet is open" value
              (rgba forest-green at 0.32 in light, near-black 0.52 in
              dark). Stacking it on the BlurView keeps bright underlying
              content from leaking through while honoring the brand
              tint instead of a hardcoded carbon. */}
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: theme.colors.overlay },
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
              // `borderStrong` instead of `line` so the card edge stays
              // visible against the dark scrim — the regular `line`
              // token in dark mode is `rgba(255,255,255,0.06)`, which
              // makes the dark card blend into the scrim. `borderStrong`
              // doubles that to 0.12, giving the card a clean rim on
              // both themes.
              borderColor: theme.colors.borderStrong,
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
                active={mounted}
                signatureDelay={PRIMARY_DELAY + 60}
                onSelect={handleTileSelect}
                primaryColor={theme.colors.primary}
                isDark={theme.isDark}
              />
            </Animated.View>
          ) : null}

          {secondaries.length > 0 ? (
            <View
              style={[
                styles.list,
                {
                  // `line` straight (no extra alpha multiplier): in
                  // dark it's already `rgba(255,255,255,0.06)`; halving
                  // it further made the list container invisible.
                  borderColor: theme.colors.line,
                },
              ]}
            >
              {secondaries.map((action, idx) => {
                const rowDelay = SECONDARY_BASE_DELAY + idx * SECONDARY_STAGGER
                return (
                  <Animated.View
                    key={action.key}
                    entering={
                      reduced
                        ? undefined
                        : FadeInDown.duration(motionDurations.standard)
                            .delay(rowDelay)
                            .easing(EASE_IOS)
                    }
                  >
                    <SecondaryRow
                      action={action}
                      active={mounted}
                      signatureDelay={rowDelay + 40}
                      isLast={idx === secondaries.length - 1}
                      onSelect={handleTileSelect}
                      surfaceMuted={theme.colors.surfaceMuted}
                      line={theme.colors.line}
                      textColor={theme.colors.text}
                      mutedColor={theme.colors.textMuted}
                    />
                  </Animated.View>
                )
              })}
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
  active: boolean
  signatureDelay: number
  onSelect: (a: QuickAction) => void
  primaryColor: string
  isDark: boolean
}

function PrimaryTile({
  action,
  active,
  signatureDelay,
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
  // Light theme primary is `#297811` (deep brand green) — we need a
  // bright foreground for AA contrast. White lands at ~6.5:1; the
  // previous dark-green `#0F2D06` failed at ~1.5:1. Dark theme primary
  // is `#A6EF8F` (bright brand) so a near-black foreground is correct
  // there (~9:1).
  const fg = isDark ? '#0E1B14' : '#FFFFFF'
  const iconBg = withAlpha(fg, isDark ? 0.14 : 0.18)

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityLabel={action.label}
        accessibilityHint={action.subtitle}
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
        <AddQuickActionIcon
          actionKey={action.key}
          icon={action.icon}
          size={28}
          color={fg}
          bgColor={iconBg}
          delay={signatureDelay}
          active={active}
        />
        <View style={styles.primaryLabelCol}>
          <Text style={[styles.primaryLabel, { color: fg }]} numberOfLines={1}>
            {action.label}
          </Text>
          {action.subtitle ? (
            <Text
              style={[styles.primarySubtitle, { color: withAlpha(fg, 0.7) }]}
              numberOfLines={1}
            >
              {action.subtitle}
            </Text>
          ) : null}
        </View>
        <MaterialIcons name="arrow-forward" size={22} color={fg} />
      </Pressable>
    </Animated.View>
  )
}

interface SecondaryRowProps {
  action: QuickAction
  active: boolean
  signatureDelay: number
  isLast: boolean
  onSelect: (a: QuickAction) => void
  surfaceMuted: string
  line: string
  textColor: string
  mutedColor: string
}

function SecondaryRow({
  action,
  active,
  signatureDelay,
  isLast,
  onSelect,
  surfaceMuted,
  line,
  textColor,
  mutedColor,
}: SecondaryRowProps) {
  const pressScale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }))

  const accent = action.accentColor ?? mutedColor
  const iconBg = withAlpha(accent, 0.18)
  const isMarked = action.visualState === 'marked'

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityLabel={action.label}
        accessibilityRole="button"
        onPress={() => onSelect(action)}
        onPressIn={() => {
          pressScale.value = withTiming(0.98, {
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
          styles.secondaryRow,
          {
            backgroundColor: isMarked
              ? withAlpha(accent, 0.08)
              : pressed
                ? surfaceMuted
                : 'transparent',
            borderBottomColor: line,
            borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        <AddQuickActionIcon
          actionKey={action.key}
          icon={action.icon}
          size={20}
          color={accent}
          bgColor={iconBg}
          delay={signatureDelay}
          active={active}
        />
        <Text
          style={[styles.secondaryLabel, { color: textColor }]}
          numberOfLines={1}
        >
          {action.label}
        </Text>
        <MaterialIcons name="chevron-right" size={20} color={mutedColor} />
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
    paddingBottom: 10,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.32,
    shadowRadius: 28,
    elevation: 22,
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
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.36,
    shadowRadius: 18,
    elevation: 12,
  },
  primaryLabelCol: {
    flex: 1,
    gap: 2,
  },
  primaryLabel: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  primarySubtitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  list: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryRow: {
    minHeight: SECONDARY_ROW_HEIGHT,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  secondaryLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
})
