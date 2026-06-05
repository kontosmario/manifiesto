import { memo, useMemo, type RefObject } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { RiseView } from '@/components/home/animated/rise-view'
import type { HomeMonthSummary } from '@/features/home/use-home-metrics'
import {
  formatTopCategoryShare,
  type TopCategoryFallback,
  type TopCategoryResult,
} from '@/components/home/home-top-category-helpers'
import {
  formatDaysUntilDue,
  type NextFixedResult,
} from '@/components/home/home-next-fixed-helpers'
import type { NextFixedFallback } from '@/components/home/home-next-fixed-fallback'
import { pickMaterialIconForCategory } from '@/features/gastos/category-icons'
import { formatMoneyShort } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface MonthSummaryCardProps {
  data: HomeMonthSummary
  /** Tap on the Variables panel head → unfiltered expenses list. */
  onPressVariable: () => void
  /** Tap on the Fijos panel head → unfiltered fijos list. */
  onPressFixed: () => void
  /** Top category for the current cycle. When non-null, it renders as
   *  the bottom band sub-row of the Variables panel and replaces the
   *  trend pill above. */
  topCategory: TopCategoryResult | null
  /** Tap on the Top category band → expenses filtered by category. */
  onPressTopCategory: (categoryId: string) => void
  /** Fallback for the Variables band when `topCategory` is null
   *  (early cycle, sparse cycle, or empty cycle). Keeps the band
   *  slot populated so both cards stay symmetric. */
  topCategoryFallback: TopCategoryFallback | null
  /** Tap handler for the actionable `empty` fallback (registers the
   *  user's first expense). For non-actionable kinds (`early`,
   *  `sparse`) the band is non-interactive and this prop is ignored. */
  onPressTopCategoryFallback: () => void
  /** Next fijo due. When non-null AND not all-paid, it renders as the
   *  bottom band of the Fijos panel and replaces the "X pendientes"
   *  pill above. */
  nextFixed: NextFixedResult | null
  /** Tap on the Próximo fijo band → fijos screen focused on that row. */
  onPressNextFixed: (fixedExpenseId: string) => void
  /** Fallback for the Fijos band when neither `nextFixed` nor the
   *  "all paid" state apply (i.e. the user hasn't added any fijos
   *  yet). Mirrors the Variables empty-state band so both panels
   *  stay symmetric. */
  nextFixedFallback: NextFixedFallback | null
  /** Tap handler for the actionable `empty` Fijos fallback (opens
   *  the add-fixed-expense flow). Ignored when `nextFixedFallback`
   *  is null. */
  onPressNextFixedFallback: () => void
  /**
   * Refs for the guided-tour to highlight each half of the card as
   * its own step. Optional — when omitted the card renders normally
   * and the tour skips these targets.
   */
  variableRef?: RefObject<View | null>
  fixedRef?: RefObject<View | null>
}

interface PanelTone {
  /** Color of the uppercase label ("VARIABLES" / "FIJOS"). */
  label: string
  /** Subtle border around the entire card (cream surface inside). */
  border: string
  /** Default tone for the bottom band fill. */
  bandBg: string
  /** Default tone for the icon circle inside the band. */
  bandIconBg: string
  /** Foreground color used for the icon stroke inside the band. */
  bandIconFg: string
  /** Pill colors for the "X pendientes" / "all paid" / trend states. */
  pillBg: string
  pillFg: string
}

interface PillTone {
  bg: string
  fg: string
}

/**
 * MonthSummary v2.
 *
 * Two side-by-side cards sit on a cream surface (no longer tinted as a
 * whole). Visual identity moves to two surfaces inside each card:
 *   1. The colored uppercase label at the top (peach for Variables,
 *      mint for Fijos).
 *   2. The full-width tinted band at the bottom that hosts the
 *      contextual sub-row (top category for Variables, next fijo
 *      for Fijos). The band's tone reflects the chip's intent:
 *      Variables stays mint (informational), Fijos turns peach when
 *      a fijo is imminent (≤ 1 day) and stays mint otherwise.
 *
 * Each card has two independent tap regions — the head (label + value
 * + sub + pill) navigates to the unfiltered list, the band sub-row
 * deep-links to the filtered detail. They sit in one container as
 * sibling Pressables, separated visually by the band's tinted fill
 * (no nested Pressables).
 */
export const MonthSummaryCard = memo(function MonthSummaryCard({
  data,
  onPressVariable,
  onPressFixed,
  topCategory,
  onPressTopCategory,
  topCategoryFallback,
  onPressTopCategoryFallback,
  nextFixed,
  onPressNextFixed,
  nextFixedFallback,
  onPressNextFixedFallback,
  variableRef,
  fixedRef,
}: MonthSummaryCardProps) {
  const { theme } = useAppTheme()
  const allPaid = data.fixedCount > 0 && data.fixedPaid === data.fixedCount

  // Tone for variables card. The label color is peach; the band's
  // default tint is mint (top-category is informational, not urgent).
  const variablesTone = useMemo<PanelTone>(
    () => ({
      label: theme.isDark ? '#F8D1C3' : '#B84014',
      border: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,42,30,0.06)',
      bandBg: theme.isDark ? 'rgba(166,239,143,0.12)' : 'rgba(166,239,143,0.12)',
      bandIconBg: theme.isDark ? 'rgba(166,239,143,0.22)' : 'rgba(166,239,143,0.20)',
      bandIconFg: theme.isDark ? '#A6EF8F' : '#297811',
      pillBg: 'transparent',
      pillFg: 'transparent',
    }),
    [theme.isDark],
  )

  // Tone for fijos card. The label color is mint; the band defaults to
  // mint too, but flips to peach when the next fijo is imminent.
  const fijosTone = useMemo<PanelTone>(
    () => ({
      label: theme.isDark ? '#A6EF8F' : '#297811',
      border: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,42,30,0.06)',
      bandBg: theme.isDark ? 'rgba(166,239,143,0.12)' : 'rgba(166,239,143,0.12)',
      bandIconBg: theme.isDark ? 'rgba(166,239,143,0.22)' : 'rgba(166,239,143,0.20)',
      bandIconFg: theme.isDark ? '#A6EF8F' : '#297811',
      pillBg: 'transparent',
      pillFg: 'transparent',
    }),
    [theme.isDark],
  )

  // ─── Variables: pill vs chip resolution ──────────────────────────
  // Trend pill — mint when spending dropped (good signal), peach when
  // it climbed (bad signal). The chip below replaces the pill when
  // there's a top-category to surface. Without trend data we hide the
  // pill entirely so the head doesn't carry an empty slot.
  const variablesChip = topCategory
  const trendUp = (data.variableTrend ?? 0) > 0
  const variablesTrendPct =
    data.variableTrend != null
      ? `${trendUp ? '+' : data.variableTrend < 0 ? '−' : ''}${Math.abs(Math.round(data.variableTrend * 100))}% vs prev`
      : null
  const variablesPillTone: PillTone | null =
    !variablesChip && variablesTrendPct
      ? trendUp
        ? {
            bg: theme.isDark ? 'rgba(242,167,140,0.20)' : 'rgba(242,167,140,0.16)',
            fg: theme.isDark ? '#F8D1C3' : '#B84014',
          }
        : {
            bg: theme.isDark ? 'rgba(166,239,143,0.20)' : 'rgba(166,239,143,0.16)',
            fg: theme.isDark ? '#A6EF8F' : '#297811',
          }
      : null

  // ─── Fijos: pill vs chip resolution ──────────────────────────────
  // The bottom band is the symmetry anchor for both cards — we keep
  // it populated whenever there's any meaningful state to surface:
  //   • next-due fijo within reach    → "Próximo fijo" band (peach if
  //                                      ≤1 day, mint otherwise).
  //   • allPaid (success state)       → "✓ Todos pagados" band
  //                                      (non-interactive, mint).
  //   • fixedCount === 0 (no fijos)   → no band; sub already says
  //                                      "Sin fijos cargados".
  // The `X pendientes` pill only renders when there's no chip AND no
  // allPaid (a transitional state that's hard to hit since
  // `computeNextFixed` has no horizon — any pending fijo becomes the
  // chip — but we keep it as a defensive fallback).
  const fijosChip = nextFixed
  const showAllPaidBand = allPaid && data.fixedCount > 0
  const fijosPillText =
    data.fixedCount === 0
      ? null
      : !fijosChip && !showAllPaidBand
        ? `${data.fixedCount - data.fixedPaid} pendientes`
        : null
  const fijosPillTone: PillTone | null = fijosPillText
    ? {
        bg: theme.isDark ? 'rgba(242,167,140,0.20)' : 'rgba(242,167,140,0.16)',
        fg: theme.isDark ? '#F8D1C3' : '#B84014',
      }
    : null

  // Imminent fijos (≤1 day) flip the band tone to peach so the urgency
  // reads at a glance without a separate icon swap inside the band.
  const fijosBandTone =
    fijosChip && fijosChip.daysUntil <= 1
      ? {
          bg: theme.isDark ? 'rgba(242,167,140,0.16)' : 'rgba(242,167,140,0.14)',
          iconBg: theme.isDark ? 'rgba(242,167,140,0.26)' : 'rgba(242,167,140,0.22)',
          iconFg: theme.isDark ? '#F8D1C3' : '#B84014',
        }
      : {
          bg: fijosTone.bandBg,
          iconBg: fijosTone.bandIconBg,
          iconFg: fijosTone.bandIconFg,
        }

  return (
    <RiseView delay={220}>
      <View style={styles.grid}>
        <View ref={variableRef} collapsable={false} style={styles.gridCol}>
        <SummaryPanel
          tone={variablesTone}
          label="VARIABLES"
          value={formatMoneyShort(data.variableTotal)}
          sub={`${data.variableCount} ${data.variableCount === 1 ? 'mov' : 'movs'}`}
          onPressHead={onPressVariable}
          headA11yLabel="Ver gastos variables"
          pillText={!variablesChip ? variablesTrendPct : null}
          pillTone={variablesPillTone}
          pillIcon={
            !variablesChip && variablesTrendPct
              ? trendUp
                ? 'trending-up'
                : 'trending-down'
              : null
          }
          band={
            variablesChip
              ? {
                  iconName: pickMaterialIconForCategory(variablesChip.name),
                  bandBg: variablesTone.bandBg,
                  iconBg: variablesTone.bandIconBg,
                  iconFg: variablesTone.bandIconFg,
                  primary: variablesChip.name,
                  secondary: `${formatTopCategoryShare(variablesChip.share)} · ${formatMoneyShort(variablesChip.total)}`,
                  a11yLabel: `${variablesChip.name} lidera el ciclo: ${formatTopCategoryShare(variablesChip.share)} del gasto, ${formatMoneyShort(variablesChip.total)}.`,
                  a11yHint: 'Abre los gastos filtrados por esta categoría',
                  onPress: () => onPressTopCategory(variablesChip.categoryId),
                }
              : topCategoryFallback
                ? {
                    // Empty state is the only actionable kind — a tap
                    // shortcuts the user into the add-expense flow.
                    // Early/sparse are informational waiting states.
                    iconName:
                      topCategoryFallback.kind === 'empty'
                        ? 'add-circle-outline'
                        : 'auto-awesome',
                    bandBg: variablesTone.bandBg,
                    iconBg: variablesTone.bandIconBg,
                    iconFg: variablesTone.bandIconFg,
                    primary: topCategoryFallback.primary,
                    secondary: topCategoryFallback.secondary,
                    a11yLabel: `${topCategoryFallback.primary}. ${topCategoryFallback.secondary}`,
                    a11yHint:
                      topCategoryFallback.kind === 'empty'
                        ? 'Abre la pantalla para registrar un gasto'
                        : undefined,
                    onPress:
                      topCategoryFallback.kind === 'empty'
                        ? onPressTopCategoryFallback
                        : null,
                  }
                : null
          }
        />
        </View>

        <View ref={fixedRef} collapsable={false} style={styles.gridCol}>
        <SummaryPanel
          tone={fijosTone}
          label="FIJOS"
          value={formatMoneyShort(data.fixedTotal)}
          sub={
            data.fixedCount === 0
              ? 'Sin fijos cargados'
              : `${data.fixedPaid} de ${data.fixedCount} pagados`
          }
          onPressHead={onPressFixed}
          headA11yLabel="Ver gastos fijos"
          pillText={fijosPillText}
          pillTone={fijosPillTone}
          pillIcon={null}
          band={
            fijosChip
              ? {
                  iconName: 'event',
                  bandBg: fijosBandTone.bg,
                  iconBg: fijosBandTone.iconBg,
                  iconFg: fijosBandTone.iconFg,
                  primary: fijosChip.name,
                  secondary: `${formatDaysUntilDue(fijosChip.daysUntil).toLowerCase()} · ${formatMoneyShort(fijosChip.amount)}`,
                  a11yLabel: `Próximo fijo: ${fijosChip.name}, ${formatMoneyShort(fijosChip.amount)}, ${formatDaysUntilDue(fijosChip.daysUntil).toLowerCase()}.`,
                  a11yHint: 'Abre la pantalla de gastos fijos',
                  onPress: () => onPressNextFixed(fijosChip.id),
                }
              : showAllPaidBand
                ? {
                    iconName: 'check-circle',
                    bandBg: fijosTone.bandBg,
                    iconBg: fijosTone.bandIconBg,
                    iconFg: fijosTone.bandIconFg,
                    primary: 'Todos pagados',
                    a11yLabel: `Los ${data.fixedCount} gastos fijos del mes están pagados.`,
                    onPress: null,
                  }
                : nextFixedFallback
                  ? {
                      iconName: 'add-circle-outline',
                      bandBg: fijosTone.bandBg,
                      iconBg: fijosTone.bandIconBg,
                      iconFg: fijosTone.bandIconFg,
                      primary: nextFixedFallback.primary,
                      secondary: nextFixedFallback.secondary,
                      a11yLabel: `${nextFixedFallback.primary}. ${nextFixedFallback.secondary}`,
                      a11yHint: 'Abre la pantalla para registrar un gasto fijo',
                      onPress: onPressNextFixedFallback,
                    }
                  : null
          }
        />
        </View>
      </View>
    </RiseView>
  )
})

interface BandPayload {
  iconName: keyof typeof MaterialIcons.glyphMap
  bandBg: string
  iconBg: string
  iconFg: string
  primary: string
  /** Optional secondary line. When omitted the band collapses to a
   *  single-line layout (used by the success "Todos pagados" state). */
  secondary?: string
  a11yLabel: string
  /** Optional — only used when the band is interactive. */
  a11yHint?: string
  /** When `null`, the band renders as a non-interactive status row
   *  (used for the success "Todos pagados" state to avoid two taps
   *  leading to the same destination). */
  onPress: (() => void) | null
}

interface SummaryPanelProps {
  tone: PanelTone
  label: string
  value: string
  sub: string
  onPressHead: () => void
  headA11yLabel: string
  pillText: string | null
  pillTone: PillTone | null
  pillIcon: keyof typeof MaterialIcons.glyphMap | null
  band: BandPayload | null
}

function SummaryPanel({
  tone,
  label,
  value,
  sub,
  onPressHead,
  headA11yLabel,
  pillText,
  pillTone,
  pillIcon,
  band,
}: SummaryPanelProps) {
  const { theme } = useAppTheme()
  return (
    <View
      style={[
        styles.panel,
        {
          // Dark mode: match the ACTIVIDAD empty-state card's muted
          // surface (surfaceMuted) instead of the brighter creamCard
          // forest green, so the Home cards read as one calm family at
          // night. Light mode keeps creamCard unchanged.
          backgroundColor: theme.isDark
            ? theme.colors.surfaceMuted
            : theme.colors.creamCard,
          borderColor: tone.border,
          // Match ACTIVIDAD's 1px edge at night; the hairline read as
          // edgeless on the dark canvas. Light keeps the hairline.
          borderWidth: theme.isDark ? 1 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Pressable
        onPress={onPressHead}
        accessibilityRole="button"
        accessibilityLabel={headA11yLabel}
        style={({ pressed }) => [
          styles.headRegion,
          { opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <View style={styles.panelHead}>
          <Text style={[styles.label, { color: tone.label }]} numberOfLines={1}>
            {label}
          </Text>
          <MaterialIcons
            name="chevron-right"
            size={18}
            color={theme.colors.textMuted}
          />
        </View>

        <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
        <Text style={[styles.sub, { color: theme.colors.textMuted }]}>{sub}</Text>

        {pillText && pillTone ? (
          <View style={[styles.pill, { backgroundColor: pillTone.bg }]}>
            {pillIcon ? (
              <MaterialIcons name={pillIcon} size={11} color={pillTone.fg} />
            ) : null}
            <Text style={[styles.pillText, { color: pillTone.fg }]}>
              {pillText}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {band ? (
        band.onPress ? (
          <Pressable
            onPress={band.onPress}
            accessibilityRole="button"
            accessibilityLabel={band.a11yLabel}
            accessibilityHint={band.a11yHint}
            style={({ pressed }) => [
              styles.bandRegion,
              { backgroundColor: band.bandBg, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <BandContent band={band} hasChevron />
          </Pressable>
        ) : (
          <View
            accessibilityRole="text"
            accessibilityLabel={band.a11yLabel}
            style={[styles.bandRegion, { backgroundColor: band.bandBg }]}
          >
            <BandContent band={band} hasChevron={false} />
          </View>
        )
      ) : null}
    </View>
  )
}

function BandContent({ band, hasChevron }: { band: BandPayload; hasChevron: boolean }) {
  const { theme } = useAppTheme()
  return (
    <>
      <View style={[styles.bandIcon, { backgroundColor: band.iconBg }]}>
        <MaterialIcons name={band.iconName} size={14} color={band.iconFg} />
      </View>
      <View style={styles.bandText}>
        <Text
          style={[styles.bandPrimary, { color: theme.colors.text }]}
          maxFontSizeMultiplier={1.4}
          numberOfLines={1}
        >
          {band.primary}
        </Text>
        {band.secondary ? (
          <Text
            style={[styles.bandSecondary, { color: theme.colors.textMuted }]}
            maxFontSizeMultiplier={1.4}
            numberOfLines={1}
          >
            {band.secondary}
          </Text>
        ) : null}
      </View>
      {hasChevron ? (
        <MaterialIcons
          name="chevron-right"
          size={16}
          color={theme.colors.textMuted}
        />
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  // Grid stretches both cards to share the height of the taller one.
  // Combined with `flex: 1` on each headRegion below, this pushes the
  // optional band to the bottom and lets the head absorb any extra
  // vertical space — so a Variables-with-band + Fijos-without-band
  // grid still ends at the same bottom edge.
  grid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  gridCol: {
    // Each column wraps a SummaryPanel; the `flex: 1` keeps the
    // two halves at equal width inside the row. Wrappers exist so
    // the guided tour can target each half independently.
    flex: 1,
  },
  panel: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  headRegion: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  value: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  sub: {
    fontSize: 12,
    marginTop: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 10,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  bandRegion: {
    // minHeight matches the natural height of a two-line band
    // (icon 28 + paddings 24 = 52, two-line text content ≈ 30 + 24
    // = 54). Forcing both branches to ≥56 keeps single-line bands
    // ("Todos pagados") visually identical in height to two-line
    // bands ("Restaurantes · 31% · $226k") regardless of which branch
    // each card lands on. Two-line bands at high Dynamic Type scaling
    // can still grow beyond 56pt — that's fine, both grow together.
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  bandIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandText: {
    flex: 1,
    gap: 1,
  },
  bandPrimary: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  bandSecondary: {
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
})
