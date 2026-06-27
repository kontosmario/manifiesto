import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useTranslation } from 'react-i18next'
import { LinearGradient } from 'expo-linear-gradient'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter, formatMoneyShort } from '@/utils/money'
import { motionDurations, motionEasings } from '@/lib/motion/tokens'

interface QuickAddSavingsSheetProps {
  visible: boolean
  goalTitle: string
  remaining: number
  isSaving: boolean
  /** Reference "100%" amount used to bound the slider and seed the
   *  starting position. When omitted the sheet falls back to `remaining`
   *  so the user can still pick how much of "lo que falta" aportar. */
  initialAmount?: number
  onClose: () => void
  onSubmit: (amount: number) => void
  /** When true, the sheet renders inline (no native `<Modal>`). Use
   *  when the host screen is already a stack-modal — see ModalCard. */
  inline?: boolean
}

const PRESET_PERCENTAGES = [25, 50, 75, 100] as const
const SLIDER_GRADIENT: readonly [string, string, ...string[]] = [
  '#6FE09A',
  '#F2B58A',
]
const THUMB_SIZE = 28

/**
 * Quick "agregar ahorro" flow — slider-first composer.
 *
 *  · Big amount + percentage display at the top so the slider's
 *    feedback is the focal element.
 *  · Custom Reanimated slider (gesture-driven, snaps to whole
 *    hundreds). The fill is the same green→peach gradient that
 *    powers the meta progress bar — visual continuity across the
 *    savings surface.
 *  · Preset chips (25 / 50 / 75 / 100) snap the slider to fixed
 *    proportions in one tap.
 *  · `AppButton` save at the bottom — primary path stays visible
 *    above the safe-area + keyboard inset that ModalCard manages.
 */
export function QuickAddSavingsSheet({
  visible,
  goalTitle,
  remaining,
  isSaving,
  initialAmount,
  onClose,
  onSubmit,
  inline,
}: QuickAddSavingsSheetProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const isDark = theme.isDark

  // The slider's "100%" reference. Prefer the suggested amount,
  // otherwise fall back to whatever's still missing on the goal so
  // the slider always has a finite, meaningful range.
  const maxAmount = useMemo(() => {
    if (initialAmount && initialAmount > 0) return Math.round(initialAmount)
    if (remaining > 0) return Math.round(remaining)
    return 100000 // last-resort floor — virtually unreachable in practice
  }, [initialAmount, remaining])

  const [amount, setAmount] = useState<number>(maxAmount)
  // Track width measured at runtime — needed to translate touch X
  // into a 0..1 ratio in the gesture worklet without a JS round-trip.
  const [trackWidth, setTrackWidth] = useState(0)
  const trackWidthShared = useSharedValue(0)
  const fillRatio = useSharedValue(maxAmount > 0 ? 1 : 0)

  // Reset on every open: start at 100% of the suggested amount.
  useEffect(() => {
    if (!visible) return
     
    setAmount(maxAmount)
    // @motion-allow: 360ms initial fill on sheet open; slightly slower than deliberate (320) for an unhurried setup feel
    fillRatio.value = withTiming(1, {
      duration: 360,
      easing: motionEasings.decelerate,
    })
  }, [visible, maxAmount, fillRatio])

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width
    if (w <= 0) return
    setTrackWidth(w)
    trackWidthShared.value = w
  }

  // Snap to whole hundreds so the displayed amount stays clean
  // ("$43.700" instead of "$43.682"). Adapts to the magnitude:
  // larger ranges snap to thousands so dragging feels coarse-grained
  // but not jittery.
  const snapAmount = useCallback(
    (raw: number): number => {
      const clamped = Math.max(0, Math.min(maxAmount, raw))
      const step = maxAmount >= 500_000 ? 1000 : maxAmount >= 50_000 ? 100 : 10
      return Math.round(clamped / step) * step
    },
    [maxAmount],
  )

  const commitFromRatio = useCallback(
    (ratio: number) => {
      const next = snapAmount(maxAmount * ratio)
      setAmount(next)
    },
    [maxAmount, snapAmount],
  )

  // Animate the bar + thumb fill ratio when the user picks a chip
  // (smooth) — drag updates jump immediately because that's what
  // the user expects from a thumb tracking their finger.
  const animateRatio = (ratio: number) => {
    fillRatio.value = withTiming(ratio, {
      duration: motionDurations.standard,
      easing: motionEasings.decelerate,
    })
  }

  const handlePickPercentage = (pct: number) => {
    const ratio = pct / 100
    animateRatio(ratio)
    commitFromRatio(ratio)
  }

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        // minDistance 0 + no active-offset gates → the gesture
        // activates the moment the finger lands, so a pure tap on
        // the track jumps the thumb (no need for a separate Tap
        // handler). The parent ModalCard pan disambiguates via its
        // own `activeOffsetY(8) / failOffsetX([-16, 16])`.
        .minDistance(0)
        .onBegin((event) => {
          'worklet'
          if (trackWidthShared.value <= 0) return
          const ratio = Math.max(
            0,
            Math.min(1, event.x / trackWidthShared.value),
          )
          fillRatio.value = ratio
          runOnJS(commitFromRatio)(ratio)
        })
        .onUpdate((event) => {
          'worklet'
          if (trackWidthShared.value <= 0) return
          const ratio = Math.max(
            0,
            Math.min(1, event.x / trackWidthShared.value),
          )
          fillRatio.value = ratio
          runOnJS(commitFromRatio)(ratio)
        }),
    [trackWidthShared, fillRatio, commitFromRatio],
  )

  // Use `transform: scaleX` instead of `width: %` so the fill bar
  // animates on the compositor (transform-only, no per-frame layout
  // pass). The fill view is laid out at full track width (`width:
  // '100%'` in styles.fill) and the X scale shrinks it from the left.
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: fillRatio.value }],
  }))
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          fillRatio.value * Math.max(0, trackWidth - THUMB_SIZE / 2) -
          THUMB_SIZE / 2,
      },
    ],
  }))

  // Which preset chip (if any) currently matches the amount.
  const selectedPct = useMemo<number | null>(() => {
    if (maxAmount <= 0) return null
    for (const pct of PRESET_PERCENTAGES) {
      const target = snapAmount((maxAmount * pct) / 100)
      if (Math.abs(amount - target) <= 1) return pct
    }
    return null
  }, [amount, maxAmount, snapAmount])

  const accentFg = theme.colors.success
  const trackBg = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,42,30,0.10)'
  const inactiveChipBg = isDark
    ? 'rgba(255,255,255,0.05)'
    : 'rgba(15,42,30,0.04)'
  const inactiveChipBorder = isDark
    ? 'rgba(255,255,255,0.10)'
    : 'rgba(15,42,30,0.10)'
  const activeChipBg = isDark
    ? 'rgba(122,216,163,0.20)'
    : 'rgba(28,126,58,0.12)'
  const activeChipBorder = isDark
    ? 'rgba(122,216,163,0.50)'
    : 'rgba(28,126,58,0.36)'
  const thumbBg = isDark ? '#FFFBF2' : '#FFFFFF'
  const thumbBorder = accentFg

  const isValid = amount > 0
  const exceedsRemaining = isValid && remaining > 0 && amount > remaining
  const pctLabel =
    maxAmount > 0
      ? t('home:quickAddSavings.pctOfSuggested', {
          pct: Math.round((amount / maxAmount) * 100),
        })
      : ''

  const helper = !isValid
    ? t('home:quickAddSavings.helperPick')
    : exceedsRemaining
      ? t('home:quickAddSavings.helperExceeds', {
          remaining: formatMoneyShort(remaining),
        })
      : t('home:quickAddSavings.helperAdding', {
          amount: currencyFormatter.format(amount),
          goalTitle,
        })

  const saveLabel = isValid
    ? t('home:quickAddSavings.saveAmount', { amount: formatMoneyShort(amount) })
    : t('home:quickAddSavings.saveToGoal')

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      inline={inline}
      title={t('home:quickAddSavings.title', { goalTitle })}
      subtitle={t('home:quickAddSavings.subtitle')}
    >
      <View style={styles.body}>
        <View
          style={[
            styles.amountCard,
            {
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.amountEyebrow, { color: theme.colors.textMuted }]}>
            {t('home:quickAddSavings.contributionEyebrow')}
          </Text>
          <Text
            style={[styles.amountValue, { color: theme.colors.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            // Without a floor, iOS's `adjustsFontSizeToFit` happily
            // shrinks the amount to ~4pt when the rendered string
            // (with letterSpacing + bold weight) exceeds the
            // measured container width by even a few px. The screen
            // ended up showing a microscopic "$74.000" at 6pt. The
            // floor pins it to 70% of the base size (≈ 33.6pt at the
            // 48pt baseline) so we never fall below "comfortable
            // bold-display" territory; truly-too-long amounts will
            // ellipsize via `numberOfLines={1}` instead.
            minimumFontScale={0.7}
            allowFontScaling
          >
            {currencyFormatter.format(amount)}
          </Text>
          <Text style={[styles.amountSub, { color: accentFg }]}>{pctLabel}</Text>
        </View>

        <View style={styles.sliderBlock}>
          <GestureDetector gesture={panGesture}>
            <View
              style={styles.sliderHitArea}
              accessibilityRole="adjustable"
              accessibilityLabel={t('home:quickAddSavings.sliderAccessibility', {
                amount: formatMoneyShort(amount),
                max: formatMoneyShort(maxAmount),
              })}
              accessibilityValue={{
                min: 0,
                max: maxAmount,
                now: amount,
                text: t('home:quickAddSavings.sliderValue', {
                  pct: Math.round((amount / Math.max(1, maxAmount)) * 100),
                }),
              }}
            >
              <View
                onLayout={handleTrackLayout}
                style={[styles.track, { backgroundColor: trackBg }]}
              >
                <Animated.View style={[styles.fill, fillStyle]}>
                  <LinearGradient
                    colors={SLIDER_GRADIENT}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.thumb,
                    {
                      backgroundColor: thumbBg,
                      borderColor: thumbBorder,
                    },
                    thumbStyle,
                  ]}
                />
              </View>
            </View>
          </GestureDetector>
          <View style={styles.scaleRow}>
            <Text style={[styles.scaleText, { color: theme.colors.textMuted }]}>
              $0
            </Text>
            <Text style={[styles.scaleText, { color: theme.colors.textMuted }]}>
              {formatMoneyShort(maxAmount)}
            </Text>
          </View>
        </View>

        <View style={styles.chipsRow}>
          {PRESET_PERCENTAGES.map((pct) => {
            const slice = snapAmount((maxAmount * pct) / 100)
            const isActive = selectedPct === pct
            return (
              <Pressable
                key={pct}
                onPress={() => handlePickPercentage(pct)}
                accessibilityRole="button"
                accessibilityLabel={t('home:quickAddSavings.chipAccessibility', {
                  pct,
                  amount: formatMoneyShort(slice),
                })}
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: isActive ? activeChipBg : inactiveChipBg,
                    borderColor: isActive ? activeChipBorder : inactiveChipBorder,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipPct,
                    { color: isActive ? accentFg : theme.colors.text },
                  ]}
                >
                  {pct}%
                </Text>
                <Text
                  style={[
                    styles.chipAmount,
                    {
                      color: isActive ? accentFg : theme.colors.textMuted,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {formatMoneyShort(slice)}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <Text
          style={[
            styles.helper,
            {
              color: exceedsRemaining
                ? theme.colors.warning
                : theme.colors.textMuted,
            },
          ]}
        >
          {helper}
        </Text>

        <AppButton
          variant="primary"
          label={saveLabel}
          loading={isSaving}
          disabled={!isValid}
          onPress={() => {
            if (!isValid) return
            onSubmit(amount)
          }}
        />
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 16,
  },
  amountCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  amountEyebrow: {
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: '800',
    marginBottom: 4,
  },
  amountValue: {
    // The aporte is the focal element of the sheet. Earlier
    // versions used 38pt with `lineHeight: 42` and tight tracking,
    // which made `adjustsFontSizeToFit` shrink the text down to
    // ~5pt on iOS — `minimumFontScale` is silently ignored when the
    // shrink decision is driven by a too-tight `lineHeight` rather
    // than by horizontal width. Fix: drop `lineHeight` entirely so
    // RN derives it from the font's natural metrics, leaving the
    // shrink logic to fall back to its width-based path (where
    // `minimumFontScale={0.7}` actually applies). Tracking kept
    // gentle for the same reason.
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  amountSub: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  sliderBlock: {
    gap: 8,
  },
  sliderHitArea: {
    paddingVertical: 14,
    justifyContent: 'center',
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'visible',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    // Lay out at the full track width so the animated `scaleX` shrinks
    // from 1.0 → ratio without animating layout. Origin pinned to the
    // left edge so the bar fills toward the right (matches the thumb
    // travel direction).
    width: '100%',
    transformOrigin: 'left' as const,
    borderRadius: 999,
    overflow: 'hidden',
  },
  thumb: {
    position: 'absolute',
    top: -10,
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scaleText: {
    fontSize: 11,
    fontWeight: '600',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  chipPct: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  chipAmount: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  helper: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
})
