import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter, formatMoneyShort } from '@/utils/money'

/**
 * "Mi meta diaria" — opt-in self-binding goal that sits BELOW the real
 * cupo. Behaviour rules (locked in by product, not negotiable):
 *
 *  1. **One direction only — DOWN.** The user can lower their daily
 *     ceiling but never inflate it. Inflating would let recklessness
 *     hide as "I gave myself permission".
 *  2. **Floor at 60%.** Past that the goal stops being aspirational and
 *     starts being punitive — and a punitive goal is the fastest way
 *     to get someone to abandon a tracking app.
 *  3. **Show BOTH numbers.** Real cupo on the left, personal goal on
 *     the right. Keeping the real number visible at all times protects
 *     the user from quietly forgetting what they actually have.
 *  4. **Frame as GOAL, not budget/limit/restriction.** Words matter:
 *     "Mi meta" reads as ambition; "Restricción" reads as a cage.
 *  5. **Easy exit.** "Sin meta diaria" is one tap, no friction, no
 *     guilt-tripping copy. Self-binding only works if the user trusts
 *     they can leave.
 *
 * Persistence reuses the existing `daily_budget_buffer_*` columns —
 * the math (reserve a % of the cycle's variable budget) is identical
 * to a per-day goal, so we don't add a new column. The framing here is
 * what makes it a "goal" instead of a "buffer".
 */

// Step ordering matters: read left-to-right as "tighter → looser",
// with the "Off" / "Sin meta" sentinel pinned to the right edge so
// the affordance reads as "slide off" rather than "first option". The
// 60% floor (guardrail #2) anchors the leftmost step.
const STEPS: ReadonlyArray<{ pct: number; label: string }> = [
  { pct: 60, label: '60%' },
  { pct: 70, label: '70%' },
  { pct: 80, label: '80%' },
  { pct: 90, label: '90%' },
  { pct: 100, label: 'Sin meta' },
] as const

interface DailyGoalSheetProps {
  visible: boolean
  /** Daily cupo before any goal is applied (the "real" number). */
  realDailyCupo: number
  /** Days remaining in the cycle — drives the impact projection. */
  remainingCycleDays: number
  /** Current buffer settings (source of the user's existing goal). */
  initialBufferMode: 'none' | 'fixed' | 'percent'
  initialBufferPercent: number
  /** User-level statistics used to craft a stats-aware invitation
   *  copy. The subtitle reads as a personal observation ("Llevas N
   *  días bajo cupo, ¿probás un techo más ajustado?") instead of
   *  generic feature copy — the goal feels offered to *you*. */
  userStats: {
    /** Current consecutive days closing under cupo. */
    racha: number
    /** Closed days of the cycle (excludes today). */
    closedDays: number
    /** Days that closed at-or-under cupo this cycle. */
    diasGanadores: number
    /** Last-7 vs previous-7 spend ratio (1 = flat, <1 improved). */
    momentum: number
    /** No-spend days marked this cycle. */
    noSpendCount: number
  }
  isSaving: boolean
  onClose: () => void
  onSubmit: (input: {
    bufferMode: 'none' | 'percent'
    bufferPercent: number
  }) => void
  inline?: boolean
}

/**
 * Picks a stats-aware invitation copy for the sheet subtitle. The
 * intent is "we noticed you're doing well, here's the lever to
 * accelerate" — recognising existing discipline and offering the
 * goal as the next step, not as a constraint imposed on a struggling
 * user. Falls back to generic copy when no signal is strong enough.
 */
function pickGoalSubtitle(stats: DailyGoalSheetProps['userStats']): string {
  if (stats.racha >= 5) {
    return `Llevas ${stats.racha} días seguidos cerrando bajo cupo. Tu disciplina ya es real — ¿pruebas un techo un poco más ajustado y ves cómo se acelera tu meta del mes?`
  }
  if (stats.closedDays >= 5 && stats.diasGanadores / stats.closedDays >= 0.7) {
    const pct = Math.round((stats.diasGanadores / stats.closedDays) * 100)
    return `${pct}% de los días del mes los cierras dentro del cupo. Tú ya tienes el control — ponerte una meta más exigente te da el empuje para que el progreso se sienta más rápido.`
  }
  if (stats.momentum <= 0.85 && stats.closedDays >= 7) {
    const pct = Math.round((1 - stats.momentum) * 100)
    return `Tu gasto bajó ${pct}% vs la semana anterior. Buen momento para fijar un techo personal y consolidar el cambio antes de que se afloje.`
  }
  if (stats.noSpendCount >= 3) {
    return `Llevas ${stats.noSpendCount} días sin gasto este mes. Una meta diaria un toque más ajustada te ayuda a sumar más días así, casi sin esfuerzo.`
  }
  return 'Tu cupo real no cambia — esto es un techo personal que tú eliges para acelerar tu meta del mes.'
}

function clampPercentToStep(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 100
  // Snap to the nearest 10% step within the supported range.
  const snapped = Math.round((100 - percent) / 10) * 10
  const goalPct = Math.max(60, Math.min(100, 100 - snapped))
  return goalPct
}

export function DailyGoalSheet({
  visible,
  realDailyCupo,
  remainingCycleDays,
  initialBufferMode,
  initialBufferPercent,
  userStats,
  isSaving,
  onClose,
  onSubmit,
  inline,
}: DailyGoalSheetProps) {
  const { theme } = useAppTheme()
  const subtitle = useMemo(() => pickGoalSubtitle(userStats), [userStats])

  // Resolve the initial selection from the existing buffer settings.
  // `bufferMode === 'percent'` with X% reduction → goalPct = 100 - X.
  const resolvedInitialPct = useMemo(() => {
    if (initialBufferMode !== 'percent') return 100
    return clampPercentToStep(100 - initialBufferPercent)
  }, [initialBufferMode, initialBufferPercent])

  const [selectedPct, setSelectedPct] = useState(resolvedInitialPct)

  useEffect(() => {
    if (!visible) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate selection when the sheet opens
    setSelectedPct(resolvedInitialPct)
  }, [visible, resolvedInitialPct])

  const safeCupo = Math.max(0, Math.round(realDailyCupo))
  const goalAmount = Math.max(0, Math.round((safeCupo * selectedPct) / 100))
  const dailySaving = Math.max(0, safeCupo - goalAmount)
  const projectedCycleSaving = Math.max(0, dailySaving * Math.max(1, remainingCycleDays))
  const isGoalActive = selectedPct < 100
  const wasActive = resolvedInitialPct < 100
  const dirty = selectedPct !== resolvedInitialPct

  // ── Dynamic CTA copy ───────────────────────────────────────────
  // The single primary action shifts label based on intent so the
  // user always reads exactly what the next tap will do:
  //   · Saving: spinner state (loading prop owns the visual)
  //   · Not dirty: "Guardar" disabled (parking/landing state)
  //   · Going from active → 100% (turning meta off): "Quitar mi meta"
  //   · Going from inactive → active (first time): "Activa mi meta"
  //   · Adjusting an existing active meta: "Guardar mi meta"
  const ctaLabel = (() => {
    if (!dirty) return 'Guardar'
    if (selectedPct >= 100 && wasActive) return 'Quitar mi meta'
    if (!wasActive) return 'Activa mi meta'
    return 'Guardar mi meta'
  })()

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      inline={inline}
      title="Mi meta diaria"
      subtitle={subtitle}
    >
      <View style={styles.body}>
        {/* ── Hero card ─────────────────────────────────────────────
            META amount as the focal element — big mint number with
            "% del cupo" eyebrow that animates as the user picks a
            step. Cupo real + remaining cycle days sit demoted below
            as context refs so the user always sees the absolute
            ceiling alongside their personal one. */}
        <View
          style={[
            styles.hero,
            {
              backgroundColor: isGoalActive
                ? theme.colors.primarySurface
                : theme.colors.surfaceMuted,
              borderColor: isGoalActive
                ? theme.colors.primary
                : theme.colors.border,
            },
          ]}
        >
          <Animated.Text
            key={`hero-eyebrow-${selectedPct}`}
            entering={FadeIn.duration(180)}
            style={[
              styles.heroEyebrow,
              {
                color: isGoalActive
                  ? theme.colors.primary
                  : theme.colors.textMuted,
              },
            ]}
          >
            {isGoalActive ? `MI META · ${selectedPct}% DEL CUPO` : 'CUPO REAL DIARIO'}
          </Animated.Text>
          <Animated.Text
            key={`hero-amount-${goalAmount}`}
            entering={FadeIn.duration(220)}
            style={[
              styles.heroAmount,
              {
                color: isGoalActive
                  ? theme.colors.primary
                  : theme.colors.text,
              },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {currencyFormatter.format(goalAmount)}
          </Animated.Text>
          <View style={styles.heroFootRow}>
            {isGoalActive ? (
              <>
                <Text style={[styles.heroFootMuted, { color: theme.colors.textMuted }]}>
                  Cupo real {currencyFormatter.format(safeCupo)}
                </Text>
                <View style={[styles.heroFootDot, { backgroundColor: theme.colors.textMuted }]} />
                <Text style={[styles.heroFootMuted, { color: theme.colors.textMuted }]}>
                  {remainingCycleDays} {remainingCycleDays === 1 ? 'día' : 'días'} al cobro
                </Text>
              </>
            ) : (
              <Text style={[styles.heroFootMuted, { color: theme.colors.textMuted }]}>
                Sin meta extra · juegas con todo tu cupo
              </Text>
            )}
          </View>
        </View>

        {/* ── Step picker ─────────────────────────────────────────
            Discrete behavioural buckets (60/70/80/90/Off). Each chip
            is a chunky tap target — fontSize 14, paddingV 12 — so
            the row reads as a deliberate selection control, not a
            secondary helper. Active chip fills with mint and pops
            forward via a small scale (visible on press as well). */}
        <View style={styles.stepper}>
          {STEPS.map((step) => {
            const active = selectedPct === step.pct
            const isOff = step.pct === 100
            return (
              <Pressable
                key={step.pct}
                onPress={() => {
                  if (selectedPct === step.pct) return
                  void triggerHaptic('selection')
                  setSelectedPct(step.pct)
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={
                  isOff
                    ? 'Sin meta diaria'
                    : `Meta diaria al ${step.pct}% del cupo real`
                }
                style={({ pressed }) => [
                  styles.stepperCell,
                  {
                    backgroundColor: active
                      ? theme.colors.primary
                      : theme.colors.surfaceMuted,
                    borderColor: active
                      ? theme.colors.primary
                      : theme.colors.border,
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.stepperLabel,
                    {
                      color: active
                        ? theme.colors.background
                        : theme.colors.text,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {step.label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* ── Impact card ─────────────────────────────────────────
            Always visible — coupling to outcome (guardrail #6) is
            the lever that turns "−20%" into "$312k extra". The
            crossfade (key=projectedCycleSaving) keeps the projection
            text feeling alive between step taps without remounting
            the card frame. Icon badge anchors the section visually. */}
        <Animated.View
          layout={LinearTransition.duration(260)}
          style={[
            styles.impact,
            {
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.impactIconBadge,
              {
                backgroundColor: isGoalActive
                  ? theme.colors.primary
                  : theme.colors.border,
              },
            ]}
          >
            <MaterialIcons
              name={isGoalActive ? 'flag' : 'lightbulb-outline'}
              size={16}
              color={isGoalActive ? theme.colors.background : theme.colors.text}
            />
          </View>
          <View style={styles.impactBody}>
            {isGoalActive ? (
              <Animated.Text
                key={`impact-active-${projectedCycleSaving}`}
                entering={FadeIn.duration(220)}
                exiting={FadeOut.duration(140)}
                style={[styles.impactCopy, { color: theme.colors.text }]}
              >
                Si cierras cada día con tu meta, llegas al cobro con{' '}
                <Text style={[styles.impactStrong, { color: theme.colors.primary }]}>
                  {formatMoneyShort(projectedCycleSaving)}
                </Text>{' '}
                extra para tu ahorro ({currencyFormatter.format(dailySaving)}/día ×{' '}
                {remainingCycleDays}{' '}
                {remainingCycleDays === 1 ? 'día' : 'días'}).
              </Animated.Text>
            ) : (
              <Animated.Text
                key="impact-empty"
                entering={FadeIn.duration(220)}
                exiting={FadeOut.duration(140)}
                style={[styles.impactCopy, { color: theme.colors.textMuted }]}
              >
                Activa una meta diaria un poco más exigente y vas a ver
                cómo el ahorro del mes se acelera.
              </Animated.Text>
            )}
          </View>
        </Animated.View>

        {/* ── Primary CTA + exit ramp ──────────────────────────────
            One big full-width primary action — the point of the
            sheet collapses into a single, scannable tap. Label is
            dynamic so the user always reads exactly what's about to
            happen. The "Sin meta diaria" exit ramp lives below as a
            tiny ghost text link (only when a goal is currently
            active) — present but visually subordinate, satisfying
            guardrail #8 without competing with the primary path. */}
        <View style={styles.ctaStack}>
          <AppButton
            variant="primary"
            label={ctaLabel}
            loading={isSaving}
            disabled={!dirty}
            fullWidth
            onPress={() => {
              if (!dirty) return
              if (selectedPct >= 100) {
                onSubmit({ bufferMode: 'none', bufferPercent: 0 })
              } else {
                onSubmit({
                  bufferMode: 'percent',
                  bufferPercent: 100 - selectedPct,
                })
              }
            }}
          />
          {wasActive && selectedPct < 100 ? (
            <Pressable
              onPress={() => {
                void triggerHaptic('selection')
                setSelectedPct(100)
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Quitar mi meta diaria"
              style={styles.exitRamp}
            >
              <Text style={[styles.exitRampText, { color: theme.colors.textMuted }]}>
                Sin meta diaria
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 18,
  },
  // Hero card — focal element. Generous padding (20pt vertical)
  // and a 18pt radius for a "card-within-card" feel that sits
  // confidently above the stepper row. Border colour switches
  // to mint when a goal is active so the user reads "this is yours
  // now".
  hero: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: '800',
  },
  heroAmount: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  heroFootRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  heroFootMuted: {
    fontSize: 11,
    fontWeight: '600',
  },
  heroFootDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.6,
  },
  // Step picker — chunky single-row chips. fontSize 14 + paddingV
  // 12 is deliberately bigger than the previous design (was 10 +
  // paddingV 10) so the row reads as a primary control, not a
  // helper strip.
  stepper: {
    flexDirection: 'row',
    gap: 6,
  },
  stepperCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  stepperLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  // Impact card — horizontal layout with an icon badge anchoring
  // the copy. Always visible (no longer toggling between active /
  // empty states with full-card colour swap). Background stays
  // muted so the hero card above keeps the spotlight.
  impact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  impactIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  impactBody: {
    flex: 1,
  },
  impactCopy: {
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '500',
  },
  impactStrong: {
    fontWeight: '800',
  },
  // CTA stack — single full-width primary button followed by an
  // optional ghost-text exit ramp. Vertical gap is intentionally
  // small (8pt) so the link reads as a related secondary path of
  // the same action group, not an unrelated control.
  ctaStack: {
    gap: 8,
    alignItems: 'center',
  },
  exitRamp: {
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  exitRampText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    textDecorationLine: 'underline',
  },
})
