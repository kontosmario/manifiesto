import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoneyShort } from '@/utils/money'

type Mood = 'green' | 'yellow' | 'red' | null

interface ControlV2VsMesCardProps {
  hasPreviousMonth: boolean
  /** Display name of the closed cycle, e.g. "Marzo 2026". */
  mesPasadoNombre: string
  /** total_variable_spent at close. */
  mesPasadoTotal: number
  /** Days where the daily total stayed at/under the cupo. */
  mesPasadoDiasBajoCupo: number
  mesPasadoTopCatLabel: string
  mesPasadoTopCatAmount: number
  /** mood from `monthly_summaries.mood` — drives the chrome. */
  mesPasadoMood: Mood
  /** savings_delta del cierre — lo que NO se gastó. */
  mesPasadoSavingsDelta: number
  /** Most expensive single transaction last cycle. */
  mesPasadoTopExpense: { description: string; price: number } | null
  /** How much the user has already spent THIS cycle on the same
   *  category that was the top last cycle. */
  currentTopCatSpent: number
  /** Inclusive day range for the cycle ("15 mar – 14 abr"). Only
   *  rendered when the cycle is NOT calendar-aligned, so users with
   *  `salary_payment_day != 1` know exactly the comparison window.
   *  `null` for users on day-1 cobro (calendar matches cycle). */
  mesPasadoCycleRangeLabel: string | null
  /** Linear projection of variable spend at month-end. */
  proyectadoMes: number
  vsMesAhorro: number
  vsMesDeltaPct: number
  vsMesDiasBajoCupo: number
  vsMesMejor: boolean
  diasGanadores: number
  /** Current day of the active cycle (1-indexed). Used to hide or
   *  de-emphasize the projection when there isn't enough data yet —
   *  with <4 closed days a single outlier swings the linear project
   *  by hundreds of percent. */
  diaActual: number
}

/**
 * "Vs mes pasado" — auditada y conectada al rollup real.
 *
 * Backend pipeline:
 *   1. `close_monthly_cycle` rolls up each cycle into `monthly_summaries`
 *      (totals, breakdown, top expense, mood, daily curve, savings_delta).
 *   2. `try_close_previous_cycle` is invoked from two places:
 *        a) trigger on `family_finance.last_salary_confirmed_at` →
 *           the moment the user confirms the new salary, the prior
 *           cycle gets compacted.
 *        b) `cron_close_previous_cycles` (daily 03:00 UTC sweeper)
 *           covers users that don't open the app right after payday.
 *   3. `useControlV2Data` reads `monthly_summaries` (last 6) into
 *      `summaries[]`, the adapter exposes the freshest one as
 *      `data.mesPasado` with mood / savings / top-expense / current-
 *      top-cat-spend already crossed against this cycle's expenses.
 *
 * The card consumes that ready-made comparison and renders four
 * smart layers:
 *   · Mood chrome — border tinted by the rollup's `mood` field
 *     (green/yellow/red) so the silhouette already tells you how
 *     the closed cycle went.
 *   · Two-bar comparison — closed total vs projected total, each
 *     row carrying its own actionable sub (días bajo cupo, ahorro,
 *     proyección de delta).
 *   · Top-category cross-cycle alert — the single category that
 *     hurt most last cycle, and how this cycle is tracking
 *     against it. Three tiers (mejor / atento / urgente) drive
 *     copy + tone.
 *   · Smart actionable hint — surfaces savings won, top expense
 *     of last cycle, or the category to watch this cycle.
 *
 * Empty state explains the close lifecycle so first-cycle users
 * know exactly what unlocks the comparison.
 */
export function ControlV2VsMesCard({
  hasPreviousMonth,
  mesPasadoNombre,
  mesPasadoTotal,
  mesPasadoDiasBajoCupo,
  mesPasadoTopCatLabel,
  mesPasadoTopCatAmount,
  mesPasadoMood,
  mesPasadoSavingsDelta,
  mesPasadoTopExpense,
  currentTopCatSpent,
  mesPasadoCycleRangeLabel,
  proyectadoMes,
  vsMesAhorro,
  vsMesDeltaPct,
  vsMesDiasBajoCupo,
  vsMesMejor,
  diasGanadores,
  diaActual,
}: ControlV2VsMesCardProps) {
  const { theme } = useAppTheme()
  const isDark = theme.isDark
  // Linear projection volatility: with <4 elapsed days, a single
  // high-spend outlier blows the projected month-end into wild
  // territory. Below that threshold we soften the comparison copy
  // so the user understands the number is provisional.
  const projectionReliable = diaActual >= 4

  // Mood-driven palette — this card is the only place in Control v2
  // where the rollup's `mood` becomes a first-class visual signal.
  const moodPalette = (() => {
    switch (mesPasadoMood) {
      case 'green':
        return {
          fg: theme.colors.success,
          border: isDark
            ? 'rgba(122,216,163,0.36)'
            : 'rgba(28,126,58,0.28)',
          chipBg: isDark ? 'rgba(122,216,163,0.16)' : 'rgba(28,126,58,0.10)',
          chipBorder: isDark
            ? 'rgba(122,216,163,0.34)'
            : 'rgba(28,126,58,0.26)',
          calloutBg: isDark
            ? 'rgba(122,216,163,0.10)'
            : 'rgba(28,126,58,0.06)',
          calloutBorder: isDark
            ? 'rgba(122,216,163,0.26)'
            : 'rgba(28,126,58,0.18)',
          icon: 'check-circle' as const,
          canonical: 'Saludable',
          label: 'Cierre dentro del plan',
        }
      case 'yellow':
        return {
          fg: theme.colors.warning,
          border: isDark
            ? 'rgba(243,186,87,0.36)'
            : 'rgba(194,122,10,0.28)',
          chipBg: isDark ? 'rgba(243,186,87,0.16)' : 'rgba(194,122,10,0.10)',
          chipBorder: isDark
            ? 'rgba(243,186,87,0.34)'
            : 'rgba(194,122,10,0.26)',
          calloutBg: isDark
            ? 'rgba(243,186,87,0.10)'
            : 'rgba(194,122,10,0.06)',
          calloutBorder: isDark
            ? 'rgba(243,186,87,0.26)'
            : 'rgba(194,122,10,0.18)',
          icon: 'error-outline' as const,
          canonical: 'Atención',
          label: 'Cierre ajustado',
        }
      case 'red':
        return {
          fg: theme.colors.danger,
          border: isDark
            ? 'rgba(232,138,112,0.42)'
            : 'rgba(192,58,42,0.32)',
          chipBg: isDark ? 'rgba(232,138,112,0.18)' : 'rgba(192,58,42,0.12)',
          chipBorder: isDark
            ? 'rgba(232,138,112,0.42)'
            : 'rgba(192,58,42,0.30)',
          calloutBg: isDark
            ? 'rgba(232,138,112,0.12)'
            : 'rgba(192,58,42,0.08)',
          calloutBorder: isDark
            ? 'rgba(232,138,112,0.30)'
            : 'rgba(192,58,42,0.22)',
          icon: 'priority-high' as const,
          canonical: 'Crítico',
          label: 'Cierre por encima del plan',
        }
      default:
        return {
          fg: theme.colors.textMuted,
          border: theme.colors.line,
          chipBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,42,30,0.05)',
          chipBorder: isDark
            ? 'rgba(255,255,255,0.14)'
            : 'rgba(15,42,30,0.12)',
          calloutBg: isDark
            ? 'rgba(255,255,255,0.04)'
            : 'rgba(15,42,30,0.04)',
          calloutBorder: isDark
            ? 'rgba(255,255,255,0.10)'
            : 'rgba(15,42,30,0.10)',
          icon: 'history' as const,
          canonical: 'Sin datos',
          label: 'Sin clasificar',
        }
    }
  })()

  // ── Empty state ─────────────────────────────────────────────
  if (!hasPreviousMonth) {
    return (
      <RiseView delay={260}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.creamCard,
              borderColor: theme.colors.line,
            },
          ]}
        >
          <View style={styles.eyebrowRow}>
            <BreatheDot
              size={7}
              color={theme.colors.textMuted}
              glow={theme.colors.textMuted}
            />
            <Text
              style={[styles.eyebrow, { color: theme.colors.textMuted }]}
              numberOfLines={1}
            >
              VS MES PASADO
            </Text>
            <View
              style={[
                styles.statePill,
                {
                  backgroundColor: moodPalette.chipBg,
                  borderColor: moodPalette.chipBorder,
                },
              ]}
            >
              <MaterialIcons name="schedule" size={11} color={moodPalette.fg} />
              <Text
                style={[styles.statePillText, { color: moodPalette.fg }]}
                numberOfLines={1}
              >
                Sin cierre todavía
              </Text>
            </View>
          </View>

          <Text style={[styles.headline, { color: theme.colors.text }]}>
            Aún no hay un mes para comparar.
          </Text>
          <Text style={[styles.body, { color: theme.colors.textMuted }]}>
            Cuando confirmes tu próximo cobro, vamos a cerrar el ciclo
            actual automáticamente y vas a ver aquí cómo te fue contra
            el siguiente.
          </Text>

          <View
            style={[
              styles.callout,
              {
                backgroundColor: moodPalette.calloutBg,
                borderColor: moodPalette.calloutBorder,
              },
            ]}
            accessibilityLabel="Tip para activar la comparación"
          >
            <MaterialIcons
              name="auto-awesome"
              size={16}
              color={moodPalette.fg}
            />
            <Text style={[styles.calloutText, { color: theme.colors.text }]}>
              Sigue registrando tus gastos: una vez cerrado el ciclo,
              esta card se activa sola con totales, mood y la categoría
              que más pesó.
            </Text>
          </View>
        </View>
      </RiseView>
    )
  }

  const diffAbs = Math.abs(vsMesAhorro)
  const pctAbs = Math.abs(vsMesDeltaPct)
  const maxVal = Math.max(proyectadoMes, mesPasadoTotal, 1)
  const pctThis = (proyectadoMes / maxVal) * 100
  const pctLast = (mesPasadoTotal / maxVal) * 100

  // Tones for the comparison bars — match the headline mood so the
  // story is consistent: success bar when projected < closed, warn
  // when over.
  const closedBarColor = isDark
    ? 'rgba(255,255,255,0.20)'
    : 'rgba(15,42,30,0.20)'
  const projBarColor = vsMesMejor ? theme.colors.success : theme.colors.warning

  // ── Top-category cross-cycle tier ───────────────────────────
  // We compare currentTopCatSpent vs the prev cycle's top-cat
  // amount. Three tiers, each with its own copy and color so the
  // user sees instantly whether the same drain is repeating.
  const topCatRatio =
    mesPasadoTopCatAmount > 0
      ? currentTopCatSpent / mesPasadoTopCatAmount
      : 0
  const topCatTier: 'good' | 'watch' | 'urgent' =
    topCatRatio >= 1
      ? 'urgent'
      : topCatRatio >= 0.7
        ? 'watch'
        : 'good'
  const topCatTone = (() => {
    switch (topCatTier) {
      case 'good':
        return {
          fg: theme.colors.success,
          bg: isDark ? 'rgba(122,216,163,0.10)' : 'rgba(28,126,58,0.05)',
          border: isDark
            ? 'rgba(122,216,163,0.22)'
            : 'rgba(28,126,58,0.16)',
          icon: 'trending-down' as const,
        }
      case 'watch':
        return {
          fg: theme.colors.warning,
          bg: isDark ? 'rgba(243,186,87,0.10)' : 'rgba(194,122,10,0.05)',
          border: isDark
            ? 'rgba(243,186,87,0.24)'
            : 'rgba(194,122,10,0.18)',
          icon: 'trending-up' as const,
        }
      case 'urgent':
        return {
          fg: theme.colors.danger,
          bg: isDark ? 'rgba(232,138,112,0.12)' : 'rgba(192,58,42,0.08)',
          border: isDark
            ? 'rgba(232,138,112,0.30)'
            : 'rgba(192,58,42,0.22)',
          icon: 'priority-high' as const,
        }
    }
  })()

  // ── Smart hint cascade ──────────────────────────────────────
  // Pick the most useful insight given the current state. Order
  // matters: urgent top-cat alert wins over generic savings copy.
  const hint = (() => {
    if (mesPasadoTopCatAmount > 0 && topCatTier === 'urgent') {
      return {
        icon: 'priority-high' as const,
        text: `${mesPasadoTopCatLabel} ya superó lo gastado en ${mesPasadoNombre} ($${formatMoneyShort(mesPasadoTopCatAmount)}). Cuida esa categoría.`,
      }
    }
    if (mesPasadoTopCatAmount > 0 && topCatTier === 'watch') {
      return {
        icon: 'trending-up' as const,
        text: `Vas el ${Math.round(topCatRatio * 100)}% de tu ${mesPasadoTopCatLabel} de ${mesPasadoNombre}. Está cerca del límite.`,
      }
    }
    if (vsMesMejor && mesPasadoSavingsDelta > 0) {
      const projectedThisSavings = Math.max(0, mesPasadoSavingsDelta + vsMesAhorro)
      return {
        icon: 'savings' as const,
        text: `En ${mesPasadoNombre} ahorraste ${formatMoneyShort(mesPasadoSavingsDelta)}. Si mantienes el ritmo, este mes cierras cerca de ${formatMoneyShort(projectedThisSavings)}.`,
      }
    }
    if (vsMesMejor) {
      return {
        icon: 'trending-down' as const,
        text: `Vas a cerrar ${formatMoneyShort(diffAbs)} (~${pctAbs.toFixed(0)}%) abajo del mes pasado. Buen pulso.`,
      }
    }
    if (mesPasadoTopExpense != null) {
      return {
        icon: 'receipt-long' as const,
        text: `En ${mesPasadoNombre} tu gasto más caro fue "${mesPasadoTopExpense.description}" (${formatMoneyShort(mesPasadoTopExpense.price)}). Repetirlo te empuja arriba del cupo.`,
      }
    }
    return {
      icon: 'trending-up' as const,
      text: `Vas a gastar ${formatMoneyShort(diffAbs)} (~${pctAbs.toFixed(0)}%) más que en ${mesPasadoNombre}. Ajusta el ritmo si quieres cerrar más holgado.`,
    }
  })()

  return (
    <RiseView delay={260}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: moodPalette.border,
          },
        ]}
      >
        <View style={styles.eyebrowRow}>
          <BreatheDot size={7} color={moodPalette.fg} glow={moodPalette.fg} />
          <Text
            style={[styles.eyebrow, { color: moodPalette.fg }]}
            numberOfLines={1}
          >
            VS {mesPasadoNombre.toUpperCase()}
          </Text>
          <View
            style={[
              styles.statePill,
              {
                backgroundColor: moodPalette.chipBg,
                borderColor: moodPalette.chipBorder,
              },
            ]}
          >
            <MaterialIcons name={moodPalette.icon} size={11} color={moodPalette.fg} />
            <Text
              style={[styles.statePillText, { color: moodPalette.fg }]}
              numberOfLines={1}
            >
              {moodPalette.label}
            </Text>
          </View>
        </View>

        {mesPasadoCycleRangeLabel ? (
          <View style={styles.cycleRangeRow}>
            <MaterialIcons
              name="date-range"
              size={11}
              color={theme.colors.textMuted}
            />
            <Text
              style={[styles.cycleRangeText, { color: theme.colors.textMuted }]}
              numberOfLines={1}
            >
              Ciclo {mesPasadoCycleRangeLabel}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.headline, { color: theme.colors.text }]}>
          {vsMesMejor ? (
            <>
              Vas a{' '}
              <Text
                style={[
                  styles.headlineStrong,
                  { color: theme.colors.success },
                ]}
              >
                ahorrar {formatMoneyShort(diffAbs)}
              </Text>{' '}
              comparado con {mesPasadoNombre}.
            </>
          ) : (
            <>
              Vas a{' '}
              <Text
                style={[
                  styles.headlineStrong,
                  { color: theme.colors.warning },
                ]}
              >
                gastar {formatMoneyShort(diffAbs)} más
              </Text>{' '}
              que en {mesPasadoNombre}.
            </>
          )}
        </Text>

        <View style={styles.statsRow}>
          <SegmentStat
            dotColor={closedBarColor}
            label={mesPasadoNombre.toUpperCase()}
            value={formatMoneyShort(mesPasadoTotal)}
            sub={`${mesPasadoDiasBajoCupo} días bajo cupo`}
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
          <SegmentStat
            dotColor={projBarColor}
            label="ESTE MES"
            value={
              projectionReliable
                ? formatMoneyShort(proyectadoMes)
                : `~${formatMoneyShort(proyectadoMes)}`
            }
            sub={
              projectionReliable
                ? `${diasGanadores} días bajo cupo`
                : `proyección a día ${diaActual}`
            }
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
          <SegmentStat
            dotColor={vsMesMejor ? theme.colors.success : theme.colors.warning}
            label="DELTA"
            value={
              projectionReliable
                ? `${vsMesMejor ? '↓' : '↑'} ${formatMoneyShort(diffAbs)}`
                : '—'
            }
            sub={
              !projectionReliable
                ? 'esperando datos'
                : vsMesMejor
                  ? `${pctAbs.toFixed(0)}% menos`
                  : `${pctAbs.toFixed(0)}% más`
            }
            text={
              projectionReliable
                ? vsMesMejor
                  ? theme.colors.success
                  : theme.colors.warning
                : theme.colors.textMuted
            }
            muted={theme.colors.textMuted}
          />
        </View>

        <View
          style={[
            styles.barsFrame,
            {
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <ProportionBar
            label={`${mesPasadoNombre}`}
            sublabel="cerrado"
            pct={pctLast}
            fillColor={closedBarColor}
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
          <ProportionBar
            label="Este mes"
            sublabel="proyección"
            pct={pctThis}
            fillColor={projBarColor}
            text={theme.colors.text}
            muted={theme.colors.textMuted}
            highlight
          />
          {mesPasadoSavingsDelta > 0 ? (
            <View style={styles.barsFooter}>
              <MaterialIcons
                name="savings"
                size={12}
                color={theme.colors.textMuted}
              />
              <Text
                style={[styles.barsFooterText, { color: theme.colors.textMuted }]}
                numberOfLines={1}
              >
                En {mesPasadoNombre} ahorraste{' '}
                <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
                  {formatMoneyShort(mesPasadoSavingsDelta)}
                </Text>
              </Text>
            </View>
          ) : null}
        </View>

        {mesPasadoTopCatAmount > 0 ? (
          <View
            style={[
              styles.topCatBlock,
              {
                backgroundColor: topCatTone.bg,
                borderColor: topCatTone.border,
              },
            ]}
            accessibilityLabel={`Top categoría de ${mesPasadoNombre}: ${mesPasadoTopCatLabel}`}
          >
            <View style={styles.topCatHead}>
              <MaterialIcons
                name={topCatTone.icon}
                size={14}
                color={topCatTone.fg}
              />
              <Text
                style={[styles.topCatTitle, { color: topCatTone.fg }]}
                numberOfLines={1}
              >
                {mesPasadoTopCatLabel} · top de {mesPasadoNombre}
              </Text>
            </View>
            <View style={styles.topCatBars}>
              <View
                style={[
                  styles.topCatBarTrack,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255,255,255,0.10)'
                      : 'rgba(15,42,30,0.10)',
                  },
                ]}
              >
                <View
                  style={[
                    styles.topCatBarFill,
                    {
                      width: `${Math.min(100, topCatRatio * 100)}%`,
                      backgroundColor: topCatTone.fg,
                    },
                  ]}
                />
              </View>
            </View>
            <View style={styles.topCatMeta}>
              <Text
                style={[styles.topCatMetaText, { color: theme.colors.textMuted }]}
                numberOfLines={1}
              >
                {mesPasadoNombre}:{' '}
                <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
                  {formatMoneyShort(mesPasadoTopCatAmount)}
                </Text>
              </Text>
              <Text
                style={[styles.topCatMetaText, { color: theme.colors.textMuted }]}
                numberOfLines={1}
              >
                Hoy:{' '}
                <Text style={{ color: topCatTone.fg, fontWeight: '700' }}>
                  {formatMoneyShort(currentTopCatSpent)} ·{' '}
                  {Math.round(topCatRatio * 100)}%
                </Text>
              </Text>
            </View>
          </View>
        ) : null}

        <View
          style={[
            styles.callout,
            {
              backgroundColor: moodPalette.calloutBg,
              borderColor: moodPalette.calloutBorder,
            },
          ]}
          accessibilityLabel={hint.text}
        >
          <MaterialIcons name={hint.icon} size={16} color={moodPalette.fg} />
          <Text style={[styles.calloutText, { color: theme.colors.text }]}>
            {hint.text}
          </Text>
        </View>
      </View>
    </RiseView>
  )
}

interface ProportionBarProps {
  label: string
  sublabel: string
  pct: number
  fillColor: string
  text: string
  muted: string
  highlight?: boolean
}

function ProportionBar({
  label,
  sublabel,
  pct,
  fillColor,
  text,
  muted,
  highlight,
}: ProportionBarProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.barRow}>
      <View style={styles.barLabels}>
        <Text
          style={[
            styles.barLabelMain,
            { color: text, fontWeight: highlight ? '800' : '700' },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          style={[styles.barLabelSub, { color: muted }]}
          numberOfLines={1}
        >
          {sublabel}
        </Text>
      </View>
      <View
        style={[
          styles.barTrack,
          {
            backgroundColor: theme.isDark
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(15,42,30,0.08)',
          },
        ]}
      >
        <View
          style={[
            styles.barFill,
            { width: `${Math.max(2, pct)}%`, backgroundColor: fillColor },
          ]}
        />
      </View>
    </View>
  )
}

interface SegmentStatProps {
  dotColor: string
  label: string
  value: string
  sub: string
  text: string
  muted: string
}

function SegmentStat({
  dotColor,
  label,
  value,
  sub,
  text,
  muted,
}: SegmentStatProps) {
  return (
    <View style={styles.stat}>
      <View style={styles.statHead}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={[styles.statLabel, { color: muted }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.statValue, { color: text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.statSub, { color: muted }]} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '800',
    flex: 1,
  },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 180,
  },
  statePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  cycleRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: -4,
  },
  cycleRangeText: {
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  headline: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  headlineStrong: {
    fontWeight: '800',
  },
  body: {
    fontSize: 12,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stat: { flex: 1 },
  statHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statSub: {
    fontSize: 10,
    marginTop: 2,
  },
  barsFrame: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barLabels: {
    width: 80,
  },
  barLabelMain: {
    fontSize: 12,
  },
  barLabelSub: {
    fontSize: 10,
    marginTop: 1,
  },
  barTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  barsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  barsFooterText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
  },
  topCatBlock: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  topCatHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topCatTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
    flex: 1,
  },
  topCatBars: {
    gap: 4,
  },
  topCatBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  topCatBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  topCatMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  topCatMetaText: {
    fontSize: 11,
    fontWeight: '500',
  },
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  calloutText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
})
