import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { TabSectionHeader } from '@/components/ui/tab-section-header'
import {
  CIRCLE_BUTTON_RADIUS,
  CIRCLE_BUTTON_SHADOW,
  CIRCLE_BUTTON_SIZE,
  circleButtonSurface,
} from '@/components/ui/circle-button-chrome'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoneyShort } from '@/utils/money'
import { controlV2Copy } from './control-v2-tokens'

interface ControlV2HeaderProps {
  score: number
  scoreLabel: string
  scoreTone: string
  /** Daily goal amount in currency, or `null` when no goal is set. */
  dailyGoalAmount?: number | null
  /** Whether tapping the score pill should open the goal sheet.
   *  Disabled during streak recovery (guardrail #9 — don't pile a
   *  self-restriction on top of an already-broken streak). */
  goalEditable?: boolean
  /** Handler invoked when the user taps the pill or the goal chip. */
  onPressGoal?: () => void
  /** Launches the cycle-close "Manifiesto Wrapped". When provided, a
   *  circular button appears left of the score pill. */
  onPressWrapped?: () => void
  /** Pulses the wrapped button to signal an unseen cycle close. */
  wrappedUnseen?: boolean
}

/**
 * Control header — title + subtitle on the left, score pill on the
 * right. The pill mirrors the Asistente header's visual language
 * (chip with tinted bg, border, icon, value, suffix) so both
 * destinations feel like part of the same screen family. The 0–100
 * score number stays animated with CountUpText so progress is still
 * legible at a glance, while the qualitative tag ("MUY BIEN",
 * "REGULAR", etc.) carries the meaning.
 */
export function ControlV2Header({
  score,
  scoreLabel,
  scoreTone,
  dailyGoalAmount = null,
  goalEditable = true,
  onPressGoal,
  onPressWrapped,
  wrappedUnseen = false,
}: ControlV2HeaderProps) {
  const { theme } = useAppTheme()
  const goalActive = dailyGoalAmount != null && dailyGoalAmount > 0
  const handlePress = () => {
    if (!goalEditable || !onPressGoal) return
    void triggerHaptic('selection')
    onPressGoal()
  }
  // Two press scales — el goal chip (chico, 24pt height) usa 0.94
  // más pronunciado; el score pill (mediano) usa 0.96 sutil para no
  // competir con el ScorePillPulse breathing.
  const goalChipPress = usePressScale({ pressedScale: 0.94 })
  const scorePillPress = usePressScale({ pressedScale: 0.96 })
  return (
    <TabSectionHeader
      title={controlV2Copy.title}
      subtitle={controlV2Copy.subtitle}
      subtitleNumberOfLines={1}
      rightClearance={8}
      right={
        <View style={styles.rightRow}>
          {onPressWrapped ? (
            <WrappedButton
              unseen={wrappedUnseen}
              onPress={onPressWrapped}
              surface={circleButtonSurface(theme.isDark, theme.colors)}
              accent={theme.colors.primary}
            />
          ) : null}
          <Pressable
            onPress={handlePress}
          onPressIn={goalEditable && onPressGoal ? scorePillPress.onPressIn : undefined}
          onPressOut={goalEditable && onPressGoal ? scorePillPress.onPressOut : undefined}
          disabled={!goalEditable || !onPressGoal}
          hitSlop={6}
          accessibilityRole={goalEditable && onPressGoal ? 'button' : 'text'}
          accessibilityLabel={`Score ${score}, ${scoreLabel}${
            goalEditable && onPressGoal ? '. Tocá para ajustar tu meta diaria.' : ''
          }`}
          accessibilityHint={
            goalEditable && onPressGoal
              ? 'Abre el ajuste de cupo personal'
              : undefined
          }
          style={styles.pillPressable}
        >
          <Animated.View
            style={goalEditable && onPressGoal ? scorePillPress.animatedStyle : undefined}
          >
            {/* Discoverability pulse — only fires when the user CAN
                configure a goal but hasn't yet. Once a goal exists,
                the chip below already screams "tappable" and the pulse
                becomes redundant noise. Disabled flat when streak
                recovery blocks the editor (no false promise of an
                interaction the gate will refuse). */}
            <ScorePillPulse
              tone={scoreTone}
              visible={Boolean(goalEditable && onPressGoal && !goalActive)}
            />
            <ScorePill
              score={score}
              tone={scoreTone}
              isDark={theme.isDark}
              surface={circleButtonSurface(theme.isDark, theme.colors)}
            />
          </Animated.View>
          </Pressable>
        </View>
      }
    >
      {goalActive ? (
        <Pressable
          onPress={handlePress}
          onPressIn={goalChipPress.onPressIn}
          onPressOut={goalChipPress.onPressOut}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Mi meta diaria: ${formatMoneyShort(
            dailyGoalAmount as number,
          )}. Tocá para ajustarla.`}
        >
          <Animated.View
            style={[
              styles.goalChip,
              {
                backgroundColor: theme.colors.primarySurface,
                borderColor: theme.colors.heroAccent,
              },
              goalChipPress.animatedStyle,
            ]}
          >
            <MaterialIcons
              name="flag"
              size={11}
              color={theme.isDark ? theme.colors.heroAccent : theme.colors.primaryStrong}
            />
            <Text
              style={[
                styles.goalChipText,
                {
                  color: theme.isDark
                    ? theme.colors.heroAccent
                    : theme.colors.primaryStrong,
                },
              ]}
              numberOfLines={1}
            >
              Mi meta · {formatMoneyShort(dailyGoalAmount as number)}/día
            </Text>
          </Animated.View>
        </Pressable>
      ) : null}
    </TabSectionHeader>
  )
}

/**
 * Circular header button that launches the cycle-close "Manifiesto
 * Wrapped". A sonar halo pulses behind it while the latest close hasn't
 * been seen, then goes quiet once viewed. Shares the neutral circle
 * chrome with the score pill so both read as one button family.
 */
function WrappedButton({
  unseen,
  onPress,
  surface,
  accent,
}: {
  unseen: boolean
  onPress: () => void
  surface: string
  accent: string
}) {
  const press = usePressScale({ pressedScale: 0.94 })
  const handle = () => {
    void triggerHaptic('selection')
    onPress()
  }
  return (
    <Pressable
      onPress={handle}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Ver el resumen del cierre de mes"
      accessibilityHint="Abre la animación del cierre del ciclo anterior"
      style={styles.wrappedPressable}
    >
      <Animated.View style={press.animatedStyle}>
        <WrappedPulse visible={unseen} tone={accent} />
        <View style={[styles.scoreCircle, { backgroundColor: surface }]}>
          <MaterialIcons name="slideshow" size={18} color={accent} />
        </View>
      </Animated.View>
    </Pressable>
  )
}

/**
 * Sonar pulse — a ring that expands and fades out from the wrapped
 * button to signal "there's a new close to watch". Loops while
 * `visible`; under reduced-motion it holds a static soft ring instead of
 * animating. Unmounts entirely once seen.
 */
function WrappedPulse({ visible, tone }: { visible: boolean; tone: string }) {
  const reducedMotion = useReducedMotion()
  const wave = useSharedValue(0)

  useEffect(() => {
    if (!visible || reducedMotion) {
      wave.value = 0
      return
    }
    wave.value = withRepeat(
      // @motion-allow: sonar de discoverability, ~1.8s por ciclo
      withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    )
    return () => cancelAnimation(wave)
  }, [visible, reducedMotion, wave])

  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(wave.value, [0, 0.7, 1], [0.5, 0.14, 0]),
    transform: [{ scale: interpolate(wave.value, [0, 1], [1, 1.65]) }],
  }))

  if (!visible) return null

  // Reduced motion: a static soft ring so the cue survives without movement.
  if (reducedMotion) {
    return (
      <Animated.View
        pointerEvents="none"
        style={[styles.wrappedPulseRing, { borderColor: tone, opacity: 0.4 }]}
      />
    )
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrappedPulseRing, { borderColor: tone }, ring]}
    />
  )
}

/**
 * Soft halo that breathes behind the score pill to invite a first
 * tap. Single fixed-size ring at a small negative inset (-4pt each
 * side) hugging the pill — no `scale` transform, just a slow
 * opacity breath that respects the pill's exact bounds.
 *
 * Why a single ring (vs. two phase-offset rings):
 * the previous double-ring stack read as a "double-pulse" rhythm —
 * fine for an alarm cue, too aggressive for a discoverability hint
 * that lives beside live content. A single, slower, lower-amplitude
 * breath fades in and out in 3.2s with a soft sine easing, sitting
 * in the corner of the user's attention without competing with the
 * card body. Once the user taps and configures a goal, the host
 * sets `visible=false` and the ring unmounts entirely.
 *
 * Stops cold when `visible=false`. Respects reduced-motion: ring
 * stays at its mid-opacity rest state, never animates.
 */
function ScorePillPulse({
  tone,
  visible,
}: {
  tone: string
  visible: boolean
}) {
  const reducedMotion = useReducedMotion()
  const wave = useSharedValue(0)

  useEffect(() => {
    if (!visible || reducedMotion) {
      wave.value = 0
      return
    }
    wave.value = withRepeat(
      // @motion-allow: ciclo de respiración subliminal, bajo el umbral de blinking (3.2s vs breath token 2.8s)
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
      -1,
      false,
    )
    return () => cancelAnimation(wave)
  }, [visible, reducedMotion, wave])

  // Single soft breath: 0 → 0.45 → 0 alpha across one cycle.
  // Lower peak (was 0.65) keeps it subliminal; longer cycle (3.2s
  // vs 2.2s) lowers the rhythm below "blinking" threshold so the
  // eye reads it as ambient light, not a pulse alarm.
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(wave.value, [0, 0.5, 1], [0.05, 0.45, 0.05]),
  }))

  if (!visible) return null

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pillPulseRingInner, { borderColor: tone }, ring]}
    />
  )
}

function ScorePill({
  score,
  tone,
  isDark,
  surface,
}: {
  score: number
  tone: string
  isDark: boolean
  surface: string
}) {
  // ── Contrast strategy ──────────────────────────────────────────
  // The number sits on the neutral circular surface (shared with every
  // other header button). The score's QUALITY is carried by the digit
  // colour (green / yellow / red tone).
  //   Light mode: derive a darker tone variant via HSL → L≈22 so the
  //                number passes WCAG AA on the cream surface.
  //   Dark mode:  the input tones are already light enough on the
  //                muted dark surface. Use as-is.
  const fg = isDark ? tone : darkenToneForText(tone)

  // 38×38 neutral circle — identical chrome to the Home / Fijos /
  // Gastos header buttons. The score number is centred; the trend icon
  // and the tone-tinted pill were dropped so Control's affordance joins
  // the one circular family. The qualitative tag still lives in the
  // parent Pressable's accessibilityLabel for screen readers.
  return (
    <View
      style={[styles.scoreCircle, { backgroundColor: surface }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <CountUpText
        value={score}
        duration={1000}
        format={(n) => String(n)}
        style={[styles.scoreValue, { color: fg }]}
      />
    </View>
  )
}

// ─── Colour helpers ─────────────────────────────────────────────────

/**
 * Derive an AA-passing text colour for the score pill in light mode.
 * Pulls the tone's lightness down to L=22 in HSL space (and bumps
 * saturation slightly so the dark variant doesn't look muddy).
 *
 * Verified contrast on a `tone @ 14%` blend over `#FFFBF2`:
 *   #2E7D5B (green)  → #1A573C  → 6.85 : 1
 *   #C9A23A (yellow) → #5D4914  → 7.53 : 1
 *   #D96A4F (red)    → #611F0F  → 10.24 : 1
 */
function darkenToneForText(hex: string): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return hex
  const { h, s } = rgbToHsl(hexToRgb(hex))
  return rgbToHex(hslToRgb({ h, s: Math.min(95, s + 8), l: 22 }))
}

interface RGB { r: number; g: number; b: number }
interface HSL { h: number; s: number; l: number }

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }: RGB): string {
  return (
    '#' +
    [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()
  )
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
    else if (max === gn) h = ((bn - rn) / d + 2) / 6
    else h = ((rn - gn) / d + 4) / 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToRgb({ h, s, l }: HSL): RGB {
  const hn = h / 360
  const sn = s / 100
  const ln = l / 100
  if (sn === 0) {
    const v = Math.round(ln * 255)
    return { r: v, g: v, b: v }
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn
  const p = 2 * ln - q
  const hue2rgb = (t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return {
    r: Math.round(hue2rgb(hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(hn) * 255),
    b: Math.round(hue2rgb(hn - 1 / 3) * 255),
  }
}

const styles = StyleSheet.create({
  // Title / subtitle / row geometry now live in TabSectionHeader so
  // Control's header matches Home, Gastos and Fijos exactly (34px
  // display title, shared right-slot alignment).
  // 38×38 neutral score circle — identical chrome to the Home / Fijos
  // / Gastos header buttons (shared circle-button-chrome). The score
  // number is centred and tone-coloured; no pill, no border.
  scoreCircle: {
    width: CIRCLE_BUTTON_SIZE,
    height: CIRCLE_BUTTON_SIZE,
    borderRadius: CIRCLE_BUTTON_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: CIRCLE_BUTTON_SHADOW,
  },
  scoreValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  goalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  goalChipText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Wraps the pulse rings + the pill so they share a positioning
  // context. `position: relative` is the default flexbox in RN, but
  // the rings need to be absolutely positioned around the pill
  // bounds, so we make the wrapping element explicit.
  // Right slot holds the wrapped button + score pill side by side.
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wrappedPressable: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sonar ring — fills the 38×38 circle bounds and scales/fades out.
  wrappedPulseRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  pillPressable: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    // The right-gutter clearance for the pulse ring now comes from the
    // shell's `rightClearance={8}` (TabSectionHeader right slot), so it
    // matches the spacing logic shared with the other tab headers.
  },
  // Pulse ring — fixed bounds so it never scales beyond the screen
  // gutter. Single hairline border at -4pt inset that only animates
  // its opacity, keeping the visual footprint deterministic.
  pillPulseRingInner: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 999,
    borderWidth: 1.25,
  },
})
