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
import { RiseView } from '@/components/home/animated/rise-view'
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
}: ControlV2HeaderProps) {
  const { theme } = useAppTheme()
  const goalActive = dailyGoalAmount != null && dailyGoalAmount > 0
  const handlePress = () => {
    if (!goalEditable || !onPressGoal) return
    void triggerHaptic('selection')
    onPressGoal()
  }
  return (
    <RiseView>
      <View style={styles.root}>
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {controlV2Copy.title}
          </Text>
          <Text
            style={[styles.subtitle, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {controlV2Copy.subtitle}
          </Text>
          {goalActive ? (
            <Pressable
              onPress={handlePress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Mi meta diaria: ${formatMoneyShort(
                dailyGoalAmount as number,
              )}. Tocá para ajustarla.`}
              style={[
                styles.goalChip,
                {
                  backgroundColor: theme.colors.primarySurface,
                  borderColor: theme.colors.heroAccent,
                },
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
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={handlePress}
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
          />
        </Pressable>
      </View>
    </RiseView>
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
}: {
  score: number
  tone: string
  isDark: boolean
}) {
  // Translate the score into a visual cue:
  //   ≥ 65 trending-up,  35–64 trending-flat,  < 35 trending-down.
  // Matches the qualitative buckets the score adapter uses
  // (Excelente / Muy bien / Bien / Regular / Atención).
  const iconName: keyof typeof MaterialIcons.glyphMap =
    score >= 65 ? 'trending-up' : score >= 35 ? 'trending-flat' : 'trending-down'

  // ── Contrast strategy ──────────────────────────────────────────
  // The pill bg is tone @ 14% over the screen surface — close in
  // hue to the tone itself. Using `tone` directly for icon/text
  // would fail WCAG AA on light mode (audited 2.10–4.03 :1 across
  // green/yellow/red — see scripts/contrast-audit if regressing).
  //
  //   Light mode: derive a darker variant via HSL → L≈22 lifts the
  //                pair to 6.85:1 (green), 7.53:1 (yellow),
  //                10.24:1 (red). Comfortable AA across the board.
  //   Dark mode:  the input tones are already light enough on the
  //                forest-tinted bg (4.91–7.63 :1). Use as-is.
  const fg = isDark ? tone : darkenToneForText(tone)
  const bg = withAlpha(tone, 0x24)
  const border = withAlpha(tone, 0x60)

  // Compact form: icon + number only. The qualitative tag
  // ("MUY BIEN" etc.) was visually redundant with the trend icon and
  // pushed the pill width past 130pt — no room for a discoverability
  // pulse without clipping at the screen's right gutter. The
  // qualitative copy still lives in the parent Pressable's
  // accessibilityLabel for screen readers.
  return (
    <View
      style={[styles.pill, { backgroundColor: bg, borderColor: border }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <MaterialIcons name={iconName} size={14} color={fg} />
      <CountUpText
        value={score}
        duration={1000}
        format={(n) => String(n)}
        style={[styles.pillValue, { color: fg }]}
      />
    </View>
  )
}

// ─── Colour helpers ─────────────────────────────────────────────────

/**
 * Append a 1-byte alpha component to a 6-digit hex colour.
 * `withAlpha('#2E7D5B', 0x24)` → `#2E7D5B24` (≈ 14% opacity).
 * Returns the input unchanged when it isn't a recognised 6-digit hex
 * (rgba strings, named colours, etc. are passed through).
 */
function withAlpha(hex: string, alphaByte: number): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return hex
  const aa = alphaByte.toString(16).padStart(2, '0').toUpperCase()
  return `${hex}${aa}`
}

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
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  textCol: {
    flex: 1,
  },
  title: {
    // Match the Asistente header (26pt) so the two screens read as a
    // visual pair when the user toggles between Control and Asistente.
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
    maxWidth: 220,
  },
  // Compact score pill — icon + number only. Tighter padding (10/6
  // vs the previous 12/7) shrinks the footprint to ~58pt wide so
  // there's clear horizontal space for the discoverability pulse
  // before the screen's right safe area, and the visual weight
  // matches the more restrained role the pill now plays in the
  // header (no longer a multi-word badge).
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillValue: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
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
  pillPressable: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    // Right inset so the outer pulse ring (-6pt expansion) plus its
    // own border (1pt) clear the screen's right gutter without
    // clipping. The Screen component owns the screen-edge padding,
    // but iOS rounds slightly tighter on smaller devices and any
    // horizontal hairline shadow can graze the safe-area; an extra
    // 8pt inset gives consistent breathing room across devices.
    marginRight: 8,
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
