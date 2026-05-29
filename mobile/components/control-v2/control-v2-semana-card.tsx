import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { RiseView } from '@/components/home/animated/rise-view'
import { ControlV2Placeholder } from '@/components/control-v2/control-v2-placeholder'
import { useAppTheme } from '@/theme/theme-provider'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { formatMoneyShort } from '@/utils/money'
import type { DayDetail } from '@/features/insights/control-v2-mock'

const MIN_DIAS = 7

interface ControlV2SemanaCardProps {
  last7: DayDetail[]
  cupoDiario: number
  avgU7: number
  avgP7: number
  momentum: number
  /** Days remaining in the cycle (≥1). Used to project the savings
   *  the user will accumulate at the current pace if they hold it
   *  through to the next salary. */
  diasRestantes: number
  diaActual?: number
  /** True when there's real discretionary spend to analyze. A new
   *  account mid-cycle (días transcurridos, gasto 0) gets the "sin
   *  gastos todavía" placeholder instead of $0 averages. */
  hasSpendData?: boolean
}

const DAY_NAMES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const

/**
 * "Cómo vienes esta semana" — auditada y alineada con la familia.
 *
 * Visual:
 *  · Cream surface + accent border tinted por mood (success cuando
 *    estás frenando, warning cuando acelerás, line neutro cuando
 *    estás estable). Mismo chrome que MetaCard / AlcanciaCard /
 *    AlcanzaCard — ya somos una familia.
 *  · MaterialIcons reemplazan flechas Unicode + emoji.
 *  · 3 stats arriba (promedio / vs semana anterior / días bajo
 *    cupo) hacen legible el resumen sin tener que leer el chart.
 *  · Bar chart preservado pero recoloreado con tokens de theme y
 *    con marcadores explícitos para días sin gastos (filled dot
 *    en lugar de barra vacía) y para HOY (color info).
 *
 * Lógica:
 *  · `momentum` se traduce a 3 estados (acelerando / estable /
 *    frenando) en vez de binario, con copy específica para cada uno.
 *  · El hint del pie es **accionable**: si vas por encima del cupo,
 *    dice exactamente cuánto bajar por día; si vas por debajo,
 *    proyecta el ahorro acumulado al cierre del ciclo (`delta ×
 *    diasRestantes`). Conecta con la lógica de Alcancía.
 */
function ControlV2SemanaCardImpl({
  last7,
  cupoDiario,
  avgU7,
  avgP7,
  momentum,
  diasRestantes,
  diaActual = 999,
  hasSpendData = true,
}: ControlV2SemanaCardProps) {
  const { theme } = useAppTheme()
  const isDark = theme.isDark

  if (diaActual < MIN_DIAS) {
    return (
      <ControlV2Placeholder
        title="Cómo va esta semana"
        diaActual={diaActual}
        minDias={MIN_DIAS}
        hint="Necesitamos 7 días del ciclo para comparar tu ritmo."
      />
    )
  }

  // Ya pasaron suficientes días del ciclo pero no hay gasto real para
  // promediar (ej. cuenta nueva que entró a mitad de ciclo): sin esto
  // mostraría "promedio $0/día" como dato.
  if (!hasSpendData) {
    return (
      <ControlV2Placeholder
        title="Cómo va esta semana"
        diaActual={diaActual}
        minDias={MIN_DIAS}
        noData
        hint="Cuando registres gastos vas a ver tu ritmo y la comparación con la semana anterior."
      />
    )
  }

  // Mood derivation. Tri-state instead of binary so the visual + copy
  // can speak about "acelerando" vs "estable" vs "frenando" with the
  // same precision as the rest of the cards.
  const mood: 'good' | 'warn' | 'neutral' =
    momentum > 1.1 ? 'warn' : momentum < 0.9 ? 'good' : 'neutral'
  const momentumPct = Math.round(Math.abs(momentum - 1) * 100)

  const palette = (() => {
    switch (mood) {
      case 'good':
        return {
          fg: theme.colors.success,
          border: isDark ? 'rgba(122,216,163,0.36)' : 'rgba(28,126,58,0.28)',
          chipBg: isDark ? 'rgba(122,216,163,0.16)' : 'rgba(28,126,58,0.10)',
          chipBorder: isDark ? 'rgba(122,216,163,0.34)' : 'rgba(28,126,58,0.26)',
          icon: 'trending-down' as const,
          canonical: 'Saludable',
          stateLabel: 'Ritmo descendente',
          calloutBg: isDark ? 'rgba(122,216,163,0.10)' : 'rgba(28,126,58,0.06)',
          calloutBorder: isDark
            ? 'rgba(122,216,163,0.26)'
            : 'rgba(28,126,58,0.18)',
        }
      case 'warn':
        return {
          fg: theme.colors.warning,
          border: isDark ? 'rgba(243,186,87,0.42)' : 'rgba(194,122,10,0.32)',
          chipBg: isDark ? 'rgba(243,186,87,0.16)' : 'rgba(194,122,10,0.10)',
          chipBorder: isDark
            ? 'rgba(243,186,87,0.34)'
            : 'rgba(194,122,10,0.26)',
          icon: 'trending-up' as const,
          canonical: 'Atención',
          stateLabel: 'Ritmo acelerado',
          calloutBg: isDark
            ? 'rgba(243,186,87,0.10)'
            : 'rgba(194,122,10,0.06)',
          calloutBorder: isDark
            ? 'rgba(243,186,87,0.28)'
            : 'rgba(194,122,10,0.20)',
        }
      case 'neutral':
        return {
          fg: theme.colors.textMuted,
          border: theme.colors.line,
          chipBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,42,30,0.05)',
          chipBorder: isDark
            ? 'rgba(255,255,255,0.14)'
            : 'rgba(15,42,30,0.12)',
          icon: 'trending-flat' as const,
          canonical: 'Saludable',
          stateLabel: 'Ritmo estable',
          calloutBg: isDark
            ? 'rgba(255,255,255,0.04)'
            : 'rgba(15,42,30,0.04)',
          calloutBorder: isDark
            ? 'rgba(255,255,255,0.10)'
            : 'rgba(15,42,30,0.10)',
        }
    }
  })()

  // Bar layout math.
  const maxDisplay = Math.max(
    cupoDiario * 1.4,
    ...last7.map((d) => d.gasto),
    1,
  )
  const cupoLinePct = (cupoDiario / maxDisplay) * 100

  // Closed-day stats — we exclude `inProgress` (today) so partial
  // hours don't bias the "bajo cupo" tally or the comparison line.
  const closed = last7.filter((d) => !d.inProgress)
  const closedCount = closed.length
  const daysUnderCupo = closed.filter((d) => d.gasto <= cupoDiario).length
  const noSpendDays = closed.filter((d) => d.gasto === 0).length

  // Actionable hint — pick the most useful nudge given mood + spend.
  // `hasPriorWeek` distinguishes "no comparison data yet" (cycle days
  // 7–13) from "real comparison" (≥14 closed days). Without this
  // guard, momentum-based hints reference "la semana anterior" even
  // though `avgP7` was synthesized from `avgU7` as a fallback.
  const dailyDeltaVsCupo = avgU7 - cupoDiario // positive = over cupo
  const hasPriorWeek = closedCount >= 14
  const hint = (() => {
    if (avgU7 > cupoDiario && diasRestantes > 0) {
      return {
        icon: 'trending-down' as const,
        text: `Reduce ${formatMoneyShort(Math.max(0, dailyDeltaVsCupo))}/día para volver al cupo.`,
      }
    }
    if (avgU7 < cupoDiario) {
      const projectedSavings = Math.max(
        0,
        Math.abs(dailyDeltaVsCupo) * diasRestantes,
      )
      return {
        icon: 'savings' as const,
        text:
          projectedSavings > 0
            ? `${formatMoneyShort(Math.abs(dailyDeltaVsCupo))}/día por debajo del cupo. Suma ~${formatMoneyShort(projectedSavings)} al cierre.`
            : `Ritmo sostenido en el cupo. Buen pulso.`,
      }
    }
    if (mood === 'warn' && hasPriorWeek) {
      return {
        icon: 'priority-high' as const,
        text: `Aceleración del ${momentumPct}% — cuida los próximos días.`,
      }
    }
    if (mood === 'good' && hasPriorWeek) {
      return {
        icon: 'savings' as const,
        text: `Reducción del ${momentumPct}% vs la semana anterior. Camino al ahorro.`,
      }
    }
    if (!hasPriorWeek) {
      // First week of the cycle — no real comparison base yet. Avoid
      // the "vs la semana anterior" copy that misleads the user into
      // thinking we're comparing against actual prior data.
      return {
        icon: 'trending-flat' as const,
        text: 'Recién arrancas el ciclo. La comparación vs. tu semana anterior aparece a partir del día 14.',
      }
    }
    return {
      icon: 'trending-flat' as const,
      text: 'Tu ritmo está parejo con la semana anterior.',
    }
  })()

  // Stat tone for "vs prev". Rendered with the mood color so the sign
  // and the chip agree visually + via the icon. When there's no real
  // prior week of data, show "—" instead of "0%" so the user doesn't
  // misread a synthetic momentum=1 as a real comparison.
  const vsPrevText = !hasPriorWeek
    ? '—'
    : momentum > 1
      ? `+${momentumPct}%`
      : momentum < 1
        ? `−${momentumPct}%`
        : '0%'
  const vsPrevColor =
    mood === 'warn'
      ? palette.fg
      : mood === 'good'
        ? palette.fg
        : theme.colors.textMuted

  // Bar fill colors — theme-aware semantic mapping.
  const barColors = {
    today: isDark ? '#AFCDE8' : '#6B9AD6',
    over: theme.colors.warning,
    under: theme.colors.success,
    noSpendDot: isDark ? 'rgba(122,216,163,0.65)' : 'rgba(28,126,58,0.55)',
  }
  const cupoLineColor = isDark
    ? 'rgba(255,255,255,0.38)'
    : 'rgba(15,42,30,0.32)'

  return (
    <RiseView delay={220}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
            borderColor: palette.border,
          },
        ]}
      >
        <View style={styles.eyebrowRow}>
          <BreatheDot size={7} color={palette.fg} glow={palette.fg} />
          <Text style={[styles.eyebrow, { color: palette.fg }]} numberOfLines={1}>
            CÓMO VA · ÚLTIMOS 7 DÍAS
          </Text>
          <View
            style={[
              styles.statePill,
              { backgroundColor: palette.chipBg, borderColor: palette.chipBorder },
            ]}
          >
            <MaterialIcons name={palette.icon} size={11} color={palette.fg} />
            <Text
              style={[styles.statePillText, { color: palette.fg }]}
              numberOfLines={1}
            >
              {palette.stateLabel}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <Stat
            label="Promedio"
            value={`${formatMoneyShort(avgU7)}/día`}
            sub={`prev: ${formatMoneyShort(avgP7)}/día`}
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
          <Stat
            label="vs Semana"
            value={vsPrevText}
            sub="ritmo diario"
            text={vsPrevColor}
            muted={theme.colors.textMuted}
            valueWeight="800"
          />
          <Stat
            label="Bajo cupo"
            value={`${daysUnderCupo}/${closedCount}`}
            sub={
              noSpendDays > 0
                ? `${noSpendDays} sin gastar`
                : 'días respetados'
            }
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
        </View>

        <View
          style={[
            styles.chartFrame,
            {
              // Dark: recede to the near-black canvas (inset well below
              // the surfaceMuted card). The cupoTag on top keeps
              // surfaceMuted so it pops above this well.
              backgroundColor: theme.isDark
                ? DARK_TAB_CANVAS
                : theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.chartZone}>
            <View style={styles.barsRow}>
              <View
                style={[styles.cupoLineWrap, { bottom: `${cupoLinePct}%` }]}
                pointerEvents="none"
              >
                <View
                  style={[styles.cupoLineDot, { backgroundColor: cupoLineColor }]}
                />
                <DashedLine color={cupoLineColor} />
              </View>
              {last7.map((d, i) => {
                const pct = Math.min(1, d.gasto / maxDisplay)
                const isToday = d.inProgress
                const isNoSpend = !isToday && d.gasto === 0
                const over = !isToday && d.gasto > cupoDiario
                const fill = isToday
                  ? barColors.today
                  : over
                    ? barColors.over
                    : barColors.under
                return (
                  <View key={`${d.dia}-${i}`} style={styles.barCol}>
                    {isNoSpend ? (
                      <View
                        style={[styles.noSpendDot, { backgroundColor: barColors.noSpendDot }]}
                        accessibilityLabel="Día sin gastos"
                      />
                    ) : (
                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${Math.max(2, pct * 100)}%`,
                            backgroundColor: fill,
                            borderColor: isToday
                              ? theme.colors.text
                              : 'transparent',
                            borderWidth: isToday ? 1 : 0,
                          },
                        ]}
                      />
                    )}
                  </View>
                )
              })}
            </View>
            <View style={styles.axisZone}>
              <View
                style={[
                  styles.cupoTag,
                  {
                    bottom: `${cupoLinePct}%`,
                    backgroundColor: theme.colors.surfaceMuted,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.cupoTagLabel, { color: theme.colors.textMuted }]}
                  numberOfLines={1}
                >
                  CUPO
                </Text>
                <Text
                  style={[styles.cupoTagValue, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  {formatMoneyShort(cupoDiario)}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.dayLabelsRow}>
            <View style={styles.dayLabels}>
              {last7.map((d, i) => {
                const dowLetter = DAY_NAMES[d.dow] ?? ''
                return (
                  <Text
                    key={`${d.dia}-${i}`}
                    style={[
                      styles.dayLabel,
                      {
                        color: d.inProgress ? theme.colors.text : theme.colors.textMuted,
                        fontWeight: d.inProgress ? '800' : '600',
                      },
                    ]}
                  >
                    {dowLetter}
                  </Text>
                )
              })}
            </View>
            <View style={styles.axisZoneSpacer} />
          </View>
        </View>

        <View
          style={[
            styles.callout,
            {
              backgroundColor: palette.calloutBg,
              borderColor: palette.calloutBorder,
            },
          ]}
          accessibilityLabel={hint.text}
        >
          <MaterialIcons name={hint.icon} size={16} color={palette.fg} />
          <Text style={[styles.calloutText, { color: theme.colors.text }]}>
            {hint.text}
          </Text>
        </View>
      </View>
    </RiseView>
  )
}

function DashedLine({ color }: { color: string }) {
  return (
    <View style={styles.dashedLine}>
      {Array.from({ length: 22 }).map((_, i) => (
        <View key={i} style={[styles.dash, { backgroundColor: color }]} />
      ))}
    </View>
  )
}

interface StatProps {
  label: string
  value: string
  sub: string
  text: string
  muted: string
  valueWeight?: '700' | '800'
}

function Stat({
  label,
  value,
  sub,
  text,
  muted,
  valueWeight = '800',
}: StatProps) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.statValue, { color: text, fontWeight: valueWeight }]}
        numberOfLines={1}
      >
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
    maxWidth: 160,
  },
  statePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    letterSpacing: -0.3,
  },
  statSub: {
    fontSize: 10,
    marginTop: 2,
  },
  chartFrame: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 10,
  },
  chartZone: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  barsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 96,
    gap: 8,
    position: 'relative',
  },
  cupoLineWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    height: 8,
    marginBottom: -4,
    zIndex: 3,
  },
  cupoLineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginRight: 4,
    opacity: 0.8,
  },
  dashedLine: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 8,
  },
  dash: {
    width: 4,
    height: 1.5,
    borderRadius: 1,
  },
  axisZone: {
    width: 52,
    marginLeft: 8,
    position: 'relative',
  },
  axisZoneSpacer: {
    width: 52,
    marginLeft: 8,
  },
  cupoTag: {
    position: 'absolute',
    right: 0,
    left: 0,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: -11,
  },
  cupoTagLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  cupoTagValue: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginTop: 1,
  },
  barCol: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    height: '100%',
    zIndex: 2,
  },
  bar: {
    width: '100%',
    borderRadius: 6,
  },
  noSpendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 2,
  },
  dayLabelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  dayLabels: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
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

// Memo: Semana muestra gastado vs presupuesto semanal con barras
// y BreatheDot. Sin memo cada render del parent reevaluaba todo.
export const ControlV2SemanaCard = memo(ControlV2SemanaCardImpl)
