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
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoSurface } from '@/components/ui/neo-surface'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { neoInk } from '@/theme/neo-ink'
import { cssGradient, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
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
const THUMB_SIZE = 28

/**
 * Quick "agregar ahorro" flow — slider-first composer.
 *
 *  · Big amount + percentage display at the top so the slider's
 *    feedback is the focal element.
 *  · Custom Reanimated slider (gesture-driven, snaps to whole
 *    hundreds). Physics untouched by the neo migration — only the
 *    material changed: the track is now a sunken well (`insetSm`) and
 *    the thumb a raised tile (`raisedSm`) with a green ring.
 *  · Preset chips (25 / 50 / 75 / 100) snap the slider to fixed
 *    proportions in one tap: raised tiles when idle, `ringSelected`
 *    when picked.
 *  · `NeoButton` save at the bottom — primary path stays visible above
 *    the safe-area + keyboard inset that ModalCard manages.
 *
 * Rediseño 2026-07: la carcasa la pinta `ModalCard skin="neo"` (hoja
 * `neo.sheet`, radio 34, sombra hacia arriba, píldora 44×5, scrim del
 * tema). Este archivo sólo aporta el CONTENIDO.
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
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()

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
        // own `activeOffsetY(8) / failOffsetX([-16, 16])` — la piel
        // neo NO cambia esa negociación: sigue siendo el MISMO
        // `ModalCard`, sólo repintado.
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

  // Barra de progreso: verde de acción → cálido, el MISMO par que pinta
  // la barra de la meta (continuidad deliberada con `meta-card` /
  // `control-v2-alcancia-card`, que siguen en V1 — ver notas).
  const sliderGradient = useMemo<readonly [string, string, ...string[]]>(
    () => [neo.green, neo.warm],
    [neo],
  )

  const ink = neoInk(theme.mode)
  const accentInk = ink.accent
  const warnInk = ink.warn

  // Android < API 28/29 descarta el boxShadow EN SILENCIO. El pozo del
  // monto, el riel y los chips se leen SÓLO por su relieve (su fill es
  // casi el de la hoja), así que ahí — y sólo ahí — cae un hairline.
  const flatFallback = SUPPORTS_INSET_SHADOW
    ? null
    : { borderWidth: 1, borderColor: neo.sheetDivider }

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
      skin="neo"
      title={t('home:quickAddSavings.title', { goalTitle })}
      subtitle={t('home:quickAddSavings.subtitle')}
    >
      <View style={styles.body}>
        {/* El display del aporte es un POZO, no una card elevada. */}
        <NeoSurface
          variant="insetLg"
          radius={neoRadii.input}
          backgroundColor={neo.well}
          style={[styles.amountCard, flatFallback]}
        >
          <Text style={[styles.amountEyebrow, { color: neo.textMuted }]}>
            {t('home:quickAddSavings.contributionEyebrow')}
          </Text>
          <Text
            style={[styles.amountValue, { color: neo.text }]}
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
          <Text style={[styles.amountSub, { color: accentInk }]}>{pctLabel}</Text>
        </NeoSurface>

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
                style={[
                  styles.track,
                  {
                    backgroundColor: neo.well,
                    boxShadow: neo.shadows.insetSm,
                  },
                  flatFallback,
                ]}
              >
                <Animated.View style={[styles.fill, fillStyle]}>
                  <LinearGradient
                    colors={sliderGradient}
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
                      backgroundColor: neo.surface,
                      // El anillo del pulgar es SOMBRA, no borde (mismo
                      // recurso que `ringSelected`). El borde sólo
                      // aparece donde el sistema descarta el boxShadow:
                      // sin él, en claro el pulgar (#E9EBE0) queda del
                      // mismo color exacto que el riel y desaparece.
                      boxShadow: `${neo.shadows.raisedSm}, 0 0 0 2.5px ${neo.green}`,
                      borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 3,
                      borderColor: neo.green,
                    },
                    thumbStyle,
                  ]}
                />
              </View>
            </View>
          </GestureDetector>
          {/* Los extremos de la escala se quedan en `textMuted` y NO bajan
              a `textTertiary`: sobre la hoja clara (#F0EFE3) el terciario
              (#9AA694) da 2.20:1 y en oscuro 4.19:1 — los dos por debajo de
              AA para 11pt semibold. `textMuted` da 3.89:1 / 5.53:1. Mismo
              criterio que el radio de `month-close-decision-sheet`. */}
          <View style={styles.scaleRow}>
            <Text style={[styles.scaleText, { color: neo.textMuted }]}>
              $0
            </Text>
            <Text style={[styles.scaleText, { color: neo.textMuted }]}>
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
                  // Sin selección = tile extruido (gradiente raised del
                  // tema); seleccionado = pozo + anillo verde 2.5px
                  // sobre el tinte del sistema. En neo la separación la
                  // da el relieve, nunca un borde de 1px.
                  isActive
                    ? {
                        backgroundColor: neo.selectedTint,
                        boxShadow: neo.shadows.ringSelected,
                      }
                    : {
                        ...cssGradient(neo.raisedGradientCss, neo.surface),
                        boxShadow: neo.shadows.raisedSm,
                      },
                  flatFallback
                    ? {
                        borderWidth: 1,
                        borderColor: isActive ? neo.green : neo.sheetDivider,
                      }
                    : null,
                  { opacity: pressed ? 0.72 : 1 },
                ]}
              >
                <Text
                  style={[
                    styles.chipPct,
                    { color: isActive ? accentInk : neo.text },
                  ]}
                >
                  {pct}%
                </Text>
                <Text
                  style={[
                    styles.chipAmount,
                    {
                      color: isActive ? accentInk : neo.textMuted,
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
            { color: exceedsRemaining ? warnInk : neo.textMuted },
          ]}
        >
          {helper}
        </Text>

        <NeoButton
          variant="primary"
          block
          label={saveLabel}
          busy={isSaving}
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
    // El radio lo pone `NeoSurface` (neoRadii.input). Sin borde: la
    // profundidad la da `shadows.insetLg`.
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  amountEyebrow: {
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
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
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.6,
  },
  amountSub: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
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
    borderRadius: neoRadii.pill,
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
    borderRadius: neoRadii.pill,
    overflow: 'hidden',
  },
  thumb: {
    position: 'absolute',
    top: -10,
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scaleText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: neoRadii.chip,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  chipPct: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.2,
  },
  chipAmount: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    marginTop: 2,
  },
  helper: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
  },
})
