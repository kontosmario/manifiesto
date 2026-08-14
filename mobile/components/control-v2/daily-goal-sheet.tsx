import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import i18n from '@/lib/i18n'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoSurface } from '@/components/ui/neo-surface'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { triggerHaptic } from '@/lib/haptics'
import { cssGradient, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
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
 *
 * Rediseño 2026-07: la carcasa la pinta `ModalCard skin="neo"` (hoja
 * `neo.sheet`, esquinas 34, sombra hacia arriba, píldora 44×5 y scrim del
 * tema). Este archivo sólo aporta el CONTENIDO.
 */

// Step ordering matters: read left-to-right as "tighter → looser",
// with the "Off" / "Sin meta" sentinel pinned to the right edge so
// the affordance reads as "slide off" rather than "first option". The
// 60% floor (guardrail #2) anchors the leftmost step.
// label === null → the "off" sentinel; its visible text comes from i18n
// (`control:dailyGoal.stepSinMeta`) at render time. The percent chips
// (60–90%) are locale-agnostic numeric labels.
const STEPS: ReadonlyArray<{ pct: number; label: string | null }> = [
  { pct: 60, label: '60%' },
  { pct: 70, label: '70%' },
  { pct: 80, label: '80%' },
  { pct: 90, label: '90%' },
  { pct: 100, label: null },
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
  /** 'dynamic' = ingreso variable: los footers hablan de "días de ciclo"
   *  y "cierras el ciclo con", no de "al cobro". */
  incomeMode?: 'fixed' | 'dynamic'
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
    return i18n.t('control:dailyGoal.subtitleRacha', { days: stats.racha })
  }
  if (stats.closedDays >= 5 && stats.diasGanadores / stats.closedDays >= 0.7) {
    const pct = Math.round((stats.diasGanadores / stats.closedDays) * 100)
    return i18n.t('control:dailyGoal.subtitleWinRate', { pct })
  }
  if (stats.momentum <= 0.85 && stats.closedDays >= 7) {
    const pct = Math.round((1 - stats.momentum) * 100)
    return i18n.t('control:dailyGoal.subtitleMomentum', { pct })
  }
  if (stats.noSpendCount >= 3) {
    return i18n.t('control:dailyGoal.subtitleNoSpend', { days: stats.noSpendCount })
  }
  return i18n.t('control:dailyGoal.subtitleDefault')
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
  incomeMode,
}: DailyGoalSheetProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const isDark = theme.mode === 'dark'
  const isDynamicIncome = incomeMode === 'dynamic'
  const { t } = useTranslation()
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

  // Tinta verde de TEXTO. `neo.green` es el verde de MATERIAL (relleno,
  // anillo, gradiente); como tinta sobre el tinte del hero/chip seleccionado
  // en claro se queda abajo de AA, así que ahí manda `greenDeep`. En oscuro el
  // verde claro ya cumple y `greenDeep` sería ilegible.
  const accentInk = isDark ? neo.green : neo.greenDeep

  // Android < API 28/29 descarta el boxShadow EN SILENCIO. El chip
  // seleccionado y el pozo del impacto se leen SÓLO por su relieve, así que
  // ahí — y sólo ahí — cae un hairline.
  const flatFallback = SUPPORTS_INSET_SHADOW
    ? null
    : { borderWidth: 1, borderColor: neo.sheetDivider }

  // ── Dynamic CTA copy ───────────────────────────────────────────
  // The single primary action shifts label based on intent so the
  // user always reads exactly what the next tap will do:
  //   · Saving: spinner state (loading prop owns the visual)
  //   · Not dirty: "Guardar" disabled (parking/landing state)
  //   · Going from active → 100% (turning meta off): "Quitar mi meta"
  //   · Going from inactive → active (first time): "Activa mi meta"
  //   · Adjusting an existing active meta: "Guardar mi meta"
  const ctaLabel = (() => {
    if (!dirty) return t('control:dailyGoal.ctaGuardar')
    if (selectedPct >= 100 && wasActive) return t('control:dailyGoal.ctaQuitar')
    if (!wasActive) return t('control:dailyGoal.ctaActivar')
    return t('control:dailyGoal.ctaGuardarMeta')
  })()

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      inline={inline}
      skin="neo"
      title={t('control:dailyGoal.title')}
      subtitle={subtitle}
    >
      <View style={styles.body}>
        {/* ── Hero card ─────────────────────────────────────────────
            META amount as the focal element — big mint number with
            "% del cupo" eyebrow that animates as the user picks a
            step. Cupo real + remaining cycle days sit demoted below
            as context refs so the user always sees the absolute
            ceiling alongside their personal one.
            Piel neo: card protagonista = relieve `raisedXl`, sin
            hairline. El estado activo se marca con el tinte verde del
            sistema, no invirtiendo el fill. */}
        <NeoSurface
          variant="raisedXl"
          radius={neoRadii.card}
          backgroundColor={isGoalActive ? neo.selectedTint : undefined}
          style={styles.hero}
        >
          <Animated.Text
            key={`hero-eyebrow-${selectedPct}`}
            entering={FadeIn.duration(180)}
            style={[
              styles.heroEyebrow,
              { color: isGoalActive ? accentInk : neo.textMuted },
            ]}
          >
            {isGoalActive
              ? t('control:dailyGoal.heroEyebrowMeta', { pct: selectedPct })
              : t('control:dailyGoal.heroEyebrowReal')}
          </Animated.Text>
          <Animated.Text
            key={`hero-amount-${goalAmount}`}
            entering={FadeIn.duration(220)}
            style={[
              styles.heroAmount,
              { color: isGoalActive ? accentInk : neo.text },
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
                <Text style={[styles.heroFootMuted, { color: neo.textMuted }]}>
                  {t('control:dailyGoal.heroCupoReal', {
                    amount: currencyFormatter.format(safeCupo),
                  })}
                </Text>
                <View style={[styles.heroFootDot, { backgroundColor: neo.textTertiary }]} />
                <Text style={[styles.heroFootMuted, { color: neo.textMuted }]}>
                  {t(
                    isDynamicIncome
                      ? 'control:dailyGoal.heroDiasCiclo'
                      : 'control:dailyGoal.heroDiasAlCobro',
                    { count: remainingCycleDays },
                  )}
                </Text>
              </>
            ) : (
              <Text style={[styles.heroFootMuted, { color: neo.textMuted }]}>
                {t('control:dailyGoal.heroSinMeta')}
              </Text>
            )}
          </View>
        </NeoSurface>

        {/* ── Step picker ─────────────────────────────────────────
            Discrete behavioural buckets (60/70/80/90/Off). Each chip
            is a chunky tap target — fontSize 14, paddingV 12 — so
            the row reads as a deliberate selection control, not a
            secondary helper. En neo el chip elegido NO se rellena de
            verde: se HUNDE con el anillo verde de 2.5px, que es el
            recurso de "presionado" del neumorfismo. */}
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
                    ? t('control:dailyGoal.stepperA11ySinMeta')
                    : t('control:dailyGoal.stepperA11yMeta', { pct: step.pct })
                }
                style={({ pressed }) => [
                  styles.stepperCell,
                  active
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
                        borderWidth: active ? 2.5 : 1,
                        borderColor: active ? neo.green : neo.sheetDivider,
                      }
                    : null,
                  { opacity: pressed ? 0.78 : 1 },
                ]}
              >
                <Text
                  style={[
                    styles.stepperLabel,
                    { color: active ? accentInk : neo.text },
                  ]}
                  numberOfLines={1}
                >
                  {step.label ?? t('control:dailyGoal.stepSinMeta')}
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
            the card frame. Icon badge anchors the section visually.
            Piel neo: bloque de lectura = POZO, no card con hairline.
            El material va en el propio `Animated.View` para no meter
            un nivel de anidación que rompa el `LinearTransition`. */}
        <Animated.View
          layout={LinearTransition.duration(260)}
          style={[
            styles.impact,
            {
              backgroundColor: neo.well,
              boxShadow: neo.shadows.insetMd,
            },
            flatFallback,
          ]}
        >
          <View
            style={[
              styles.impactIconBadge,
              isGoalActive
                ? { backgroundColor: neo.green }
                : {
                    // Sin meta el badge es un pozo apagado. El `border` como
                    // FONDO era un uso V1 sin equivalente en neo — y con la
                    // tinta encima no llegaba a 3:1 en oscuro.
                    backgroundColor: neo.well,
                    boxShadow: neo.shadows.insetSm,
                  },
            ]}
          >
            <MaterialIcons
              name={isGoalActive ? 'flag' : 'lightbulb-outline'}
              size={16}
              color={isGoalActive ? neo.ctaText : neo.textMuted}
            />
          </View>
          <View style={styles.impactBody}>
            {isGoalActive ? (
              <Animated.Text
                key={`impact-active-${projectedCycleSaving}`}
                entering={FadeIn.duration(220)}
                exiting={FadeOut.duration(140)}
                style={[styles.impactCopy, { color: neo.text }]}
              >
                {t(
                  isDynamicIncome
                    ? 'control:dailyGoal.impactActivePrefixDynamic'
                    : 'control:dailyGoal.impactActivePrefix',
                )}
                <Text style={[styles.impactStrong, { color: accentInk }]}>
                  {formatMoneyShort(projectedCycleSaving)}
                </Text>
                {t('control:dailyGoal.impactActiveSuffix', {
                  count: remainingCycleDays,
                  daily: currencyFormatter.format(dailySaving),
                })}
              </Animated.Text>
            ) : (
              <Animated.Text
                key="impact-empty"
                entering={FadeIn.duration(220)}
                exiting={FadeOut.duration(140)}
                style={[styles.impactCopy, { color: neo.textMuted }]}
              >
                {t('control:dailyGoal.impactEmpty')}
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
          <NeoButton
            variant="primary"
            block
            label={ctaLabel}
            busy={isSaving}
            disabled={!dirty}
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
              accessibilityLabel={t('control:dailyGoal.exitRampA11y')}
              style={styles.exitRamp}
            >
              <Text style={[styles.exitRampText, { color: neo.textMuted }]}>
                {t('control:dailyGoal.exitRamp')}
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
  // Hero card — focal element. Generous padding (20pt vertical). El
  // radio (neoRadii.card) y el relieve los pone `NeoSurface`; el borde
  // de 1px del V1 desaparece: en neo las superficies se separan con
  // sombra, nunca con hairline.
  hero: {
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  heroAmount: {
    fontSize: 40,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
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
    fontFamily: nunitoFamily('600'),
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
    borderRadius: neoRadii.chip,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  stepperLabel: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 0.2,
  },
  // Impact card — horizontal layout with an icon badge anchoring
  // the copy. Always visible (no longer toggling between active /
  // empty states with full-card colour swap). En neo es un POZO: el
  // bloque de conclusión se hunde respecto del hero.
  impact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: neoRadii.input,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  impactIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 999,
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
    fontFamily: nunitoFamily('500'),
  },
  impactStrong: {
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  // CTA stack — single full-width primary button followed by an
  // optional ghost-text exit ramp. Vertical gap is intentionally
  // small (8pt) so the link reads as a related secondary path of
  // the same action group, not an unrelated control.
  ctaStack: {
    gap: 8,
    alignItems: 'stretch',
  },
  exitRamp: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  exitRampText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    letterSpacing: 0.2,
    textDecorationLine: 'underline',
  },
})
