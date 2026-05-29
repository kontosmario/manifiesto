import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { RiseView } from '@/components/home/animated/rise-view'
import { ControlV2Placeholder } from './control-v2-placeholder'
import { useAppTheme } from '@/theme/theme-provider'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { formatMoneyShort } from '@/utils/money'

interface ControlV2AlcanzaCardProps {
  alcanzaElMes: boolean
  alreadyExhausted: boolean
  hasReliableProjection: boolean
  closedDays: number
  diaAgotamiento: number
  diaActual: number
  diasMes: number
  sobrantePresupuestadoMes: number
  /** Daily cap = libreMes / diasMes. Used both for the "cupo" stat
   *  and for the recommended-reduction hint. */
  cupoDiario: number
  /** Average daily discretionary spend across closed cycle days —
   *  the "tu ritmo" number that drives the projection. */
  pacePromedio: number
  /** Money still un-spent of the cycle's discretionary budget.
   *  When negative, the user has already overshot. */
  restanteMes: number
  /** Days remaining in the cycle including today (≥1). */
  diasRestantes: number
  /** When the user has confirmed a starting balance for this cycle
   *  (mid-month corrections), surface it as context — the projection
   *  is still based on the average pace, but the user knows the math
   *  respects their actual cash-on-hand. */
  cycleStartingBalanceOverride?: number | null
}

const MIN_CLOSED_DAYS_FLOOR = 7

function safePct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

/**
 * "Hasta cuándo te alcanza" card — audited.
 *
 * Visual:
 *  · Cream surface + accent border (success when alcanza, warning
 *    otherwise) — same chrome as MetaCard / AlcanciaCard so the
 *    Control screen reads as one design family.
 *  · MaterialIcons throughout (no emojis).
 *  · Three-stat row (ritmo / cupo / sobrante) makes the projection
 *    legible at a glance — direct labelling instead of one big
 *    sentence.
 *  · Timeline preserved (it's the unique visual signature of this
 *    card) but recoloured with theme tokens.
 *
 * Smarter logic:
 *  · Computes a recommended **daily reduction** for the shortfall
 *    branch using `restanteMes / diasRestantes`. Says "baja $X/día"
 *    instead of just naming the day-of-runout.
 *  · Surfaces `cycleStartingBalanceOverride` when active, so the
 *    user always knows whether the projection is anchored to their
 *    full salary or the mid-month confirmed balance.
 *  · "Llegas cómodo / justito / no llega" tri-state derived from
 *    `sobrantePresupuestadoMes` + `restanteMes`, not just the binary
 *    `alcanzaElMes`.
 */
function ControlV2AlcanzaCardImpl({
  alcanzaElMes,
  alreadyExhausted,
  hasReliableProjection,
  closedDays,
  diaAgotamiento,
  diaActual,
  diasMes,
  sobrantePresupuestadoMes,
  cupoDiario,
  pacePromedio,
  restanteMes,
  diasRestantes,
  cycleStartingBalanceOverride,
}: ControlV2AlcanzaCardProps) {
  const { theme } = useAppTheme()
  const isDark = theme.isDark

  if (!hasReliableProjection) {
    // Dos motivos para no proyectar: faltan días cerrados (countdown) o
    // ya hay días pero todavía sin gastos para promediar (noData). Si ya
    // se llegó al piso de días, es lo segundo.
    const awaitingFirstSpend = closedDays >= MIN_CLOSED_DAYS_FLOOR
    return (
      <ControlV2Placeholder
        title="Hasta cuándo te alcanza"
        diaActual={Math.min(closedDays + 1, MIN_CLOSED_DAYS_FLOOR)}
        minDias={MIN_CLOSED_DAYS_FLOOR}
        noData={awaitingFirstSpend}
        hint="Sabrás hasta qué día del ciclo te alcanza el dinero libre, sin contar los fijos."
      />
    )
  }

  // ── Tri-state semantics ──────────────────────────────────────
  // `alcanzaElMes` is binary, but visually we want to differentiate
  // "sobra cómodo" from "llegas justo" so the user can act earlier.
  // A surplus under one daily cupo means "barely making it".
  const isComfortable =
    alcanzaElMes && sobrantePresupuestadoMes >= cupoDiario
  const isTight = alcanzaElMes && !isComfortable
  const tone: 'good' | 'warn' | 'critical' = alreadyExhausted
    ? 'critical'
    : isComfortable
      ? 'good'
      : isTight
        ? 'warn'
        : 'warn'

  const palette = (() => {
    switch (tone) {
      case 'good':
        return {
          fg: theme.colors.success,
          border: isDark ? 'rgba(122,216,163,0.36)' : 'rgba(28,126,58,0.28)',
          chipBg: isDark ? 'rgba(122,216,163,0.16)' : 'rgba(28,126,58,0.10)',
          chipBorder: isDark ? 'rgba(122,216,163,0.34)' : 'rgba(28,126,58,0.26)',
          calloutBg: isDark ? 'rgba(122,216,163,0.10)' : 'rgba(28,126,58,0.06)',
          calloutBorder: isDark
            ? 'rgba(122,216,163,0.26)'
            : 'rgba(28,126,58,0.18)',
          icon: 'check-circle' as const,
          canonical: 'Saludable',
          stateLabel: 'Saldo holgado',
          timelineFill: theme.colors.success,
        }
      case 'warn':
        return {
          fg: theme.colors.warning,
          border: isDark ? 'rgba(243,186,87,0.42)' : 'rgba(194,122,10,0.32)',
          chipBg: isDark ? 'rgba(243,186,87,0.16)' : 'rgba(194,122,10,0.10)',
          chipBorder: isDark
            ? 'rgba(243,186,87,0.34)'
            : 'rgba(194,122,10,0.26)',
          calloutBg: isDark
            ? 'rgba(243,186,87,0.10)'
            : 'rgba(194,122,10,0.06)',
          calloutBorder: isDark
            ? 'rgba(243,186,87,0.28)'
            : 'rgba(194,122,10,0.20)',
          icon: 'error-outline' as const,
          canonical: 'Atención',
          stateLabel: alcanzaElMes ? 'Saldo ajustado' : 'Saldo insuficiente',
          timelineFill: theme.colors.warning,
        }
      case 'critical':
        return {
          fg: theme.colors.danger,
          border: isDark ? 'rgba(232,138,112,0.45)' : 'rgba(192,58,42,0.32)',
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
          stateLabel: 'Saldo agotado',
          timelineFill: theme.colors.danger,
        }
    }
  })()

  // ── Recommended action ──────────────────────────────────────
  // For the "no llega" case, what daily-cap reduction would let the
  // user reach the next salary at the new pace? Derived from
  // remaining budget over remaining days. Never negative.
  const cupoRemaining = diasRestantes > 0 ? restanteMes / diasRestantes : 0
  const dailyReduction =
    !alcanzaElMes && !alreadyExhausted
      ? Math.max(0, pacePromedio - cupoRemaining)
      : 0

  const hint = (() => {
    if (alreadyExhausted) {
      return {
        icon: 'priority-high' as const,
        text:
          restanteMes >= 0
            ? `Quedan ${formatMoneyShort(Math.max(0, restanteMes))} hasta el próximo cobro. Cuida cada gasto.`
            : `Presupuesto libre agotado. Cuida el ritmo hasta el próximo cobro.`,
      }
    }
    if (!alcanzaElMes) {
      return {
        icon: 'trending-down' as const,
        text:
          dailyReduction > 0
            ? `Reduce ${formatMoneyShort(dailyReduction)}/día para llegar holgado al próximo cobro.`
            : `Reduce el ritmo los próximos ${Math.max(1, diasMes - diaAgotamiento)} días para no quedar corto.`,
      }
    }
    if (isTight) {
      return {
        icon: 'flag' as const,
        text: `Saldo ajustado — manteniendo el ritmo, el ciclo cierra con ${formatMoneyShort(Math.max(0, sobrantePresupuestadoMes))} de margen.`,
      }
    }
    return {
      icon: 'savings' as const,
      text: `Sobra ${formatMoneyShort(Math.max(0, sobrantePresupuestadoMes))}. Puedes mover parte a tu meta de ahorro.`,
    }
  })()

  // ── Headline copy ───────────────────────────────────────────
  const headline = alreadyExhausted
    ? `Presupuesto libre superado cerca del día ${Math.max(1, diaAgotamiento)} del ciclo.`
    : alcanzaElMes
      ? isComfortable
        ? 'El presupuesto alcanza todo el mes — con margen de sobra.'
        : 'Llega al próximo cobro, pero ajustado.'
      : `Al ritmo actual, el presupuesto se agota el día ${diaAgotamiento} del ciclo.`

  // ── Timeline math (forward-projection only) ─────────────────
  const safeDiasMes = diasMes > 0 ? diasMes : 1
  const todayPct = safePct((diaActual / safeDiasMes) * 100)
  const runoutPct = !alcanzaElMes
    ? safePct(((diaAgotamiento - diaActual) / safeDiasMes) * 100)
    : 0
  const runoutDotPct = safePct((diaAgotamiento / safeDiasMes) * 100)

  return (
    <RiseView delay={140}>
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
          <Text
            style={[styles.eyebrow, { color: palette.fg }]}
            numberOfLines={1}
          >
            HASTA CUÁNDO TE ALCANZA
          </Text>
          <View
            style={[
              styles.statePill,
              {
                backgroundColor: palette.chipBg,
                borderColor: palette.chipBorder,
              },
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

        <Text style={[styles.headline, { color: theme.colors.text }]}>
          {headline}
        </Text>

        {cycleStartingBalanceOverride != null ? (
          <View
            style={[
              styles.overrideRow,
              {
                // Dark: recede to the near-black canvas (inset well
                // below the surfaceMuted card).
                backgroundColor: theme.isDark
                  ? DARK_TAB_CANVAS
                  : theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <MaterialIcons
              name="info-outline"
              size={13}
              color={theme.colors.textMuted}
            />
            <Text
              style={[styles.overrideText, { color: theme.colors.textMuted }]}
            >
              Trabajando con{' '}
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
                {formatMoneyShort(cycleStartingBalanceOverride)}
              </Text>{' '}
              confirmados este ciclo.
            </Text>
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <Stat
            label="Ritmo"
            value={`${formatMoneyShort(pacePromedio)}/día`}
            sub={`promedio ${closedDays} días`}
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
          <Stat
            label="Cupo"
            value={`${formatMoneyShort(cupoDiario)}/día`}
            sub="presupuesto libre"
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
          <Stat
            label={alreadyExhausted ? 'Te queda' : 'Sobrante'}
            value={
              alreadyExhausted
                ? formatMoneyShort(Math.max(0, restanteMes))
                : `${sobrantePresupuestadoMes >= 0 ? '+' : ''}${formatMoneyShort(sobrantePresupuestadoMes)}`
            }
            sub={alreadyExhausted ? 'hasta cobrar' : 'al cierre'}
            text={
              alreadyExhausted
                ? palette.fg
                : sobrantePresupuestadoMes >= 0
                  ? palette.fg
                  : palette.fg
            }
            muted={theme.colors.textMuted}
          />
        </View>

        {alreadyExhausted ? null : (
          <View
            style={[
              styles.timelineFrame,
              {
                // Dark: recede to the near-black canvas (inset well
                // below the surfaceMuted card).
                backgroundColor: theme.isDark
                  ? DARK_TAB_CANVAS
                  : theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.timelineLabels}>
              <Text
                style={[styles.timelineLabel, { color: theme.colors.textMuted }]}
              >
                INICIO
              </Text>
              <Text
                style={[styles.timelineLabel, { color: theme.colors.textMuted }]}
              >
                HOY
              </Text>
              <Text
                style={[styles.timelineLabel, { color: theme.colors.textMuted }]}
              >
                PRÓX. SUELDO
              </Text>
            </View>
            <View style={styles.timelineTrack}>
              <View
                style={[
                  styles.timelineBase,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255,255,255,0.10)'
                      : 'rgba(15,42,30,0.10)',
                  },
                ]}
              />
              <View
                style={[
                  styles.timelineGood,
                  {
                    width: `${todayPct}%`,
                    backgroundColor: theme.colors.success,
                  },
                ]}
              />
              {!alcanzaElMes ? (
                <View
                  style={[
                    styles.timelineWarn,
                    {
                      left: `${todayPct}%`,
                      width: `${runoutPct}%`,
                      backgroundColor: palette.timelineFill,
                    },
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.todayDot,
                  {
                    left: `${todayPct}%`,
                    backgroundColor: theme.colors.text,
                    borderColor: theme.colors.surfaceMuted,
                  },
                ]}
              />
              {!alcanzaElMes ? (
                <View
                  style={[
                    styles.runoutDot,
                    {
                      left: `${runoutDotPct}%`,
                      backgroundColor: palette.timelineFill,
                      borderColor: theme.colors.surfaceMuted,
                    },
                  ]}
                >
                  <Text
                    style={[styles.runoutTag, { color: palette.fg }]}
                    numberOfLines={1}
                  >
                    día {diaAgotamiento}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

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

interface StatProps {
  label: string
  value: string
  sub: string
  text: string
  muted: string
}

function Stat({ label, value, sub, text, muted }: StatProps) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: muted }]} numberOfLines={1}>
        {label}
      </Text>
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
    maxWidth: 160,
  },
  statePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headline: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 22,
  },
  overrideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  overrideText: {
    fontSize: 11,
    flex: 1,
    lineHeight: 14,
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
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statSub: {
    fontSize: 10,
    marginTop: 2,
  },
  timelineFrame: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    paddingTop: 10,
  },
  timelineLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  timelineLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  timelineTrack: {
    position: 'relative',
    height: 24,
  },
  timelineBase: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
  },
  timelineGood: {
    position: 'absolute',
    top: 10,
    left: 0,
    height: 4,
    borderRadius: 2,
  },
  timelineWarn: {
    position: 'absolute',
    top: 10,
    height: 4,
    borderRadius: 2,
  },
  todayDot: {
    position: 'absolute',
    top: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    marginLeft: -8,
  },
  runoutDot: {
    position: 'absolute',
    top: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    marginLeft: -7,
  },
  runoutTag: {
    position: 'absolute',
    top: 18,
    left: -18,
    fontSize: 9,
    fontWeight: '800',
    width: 50,
    textAlign: 'center',
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

// Memo: Alcanza proyecta hasta cuándo llega la plata. Card de
// solo-lectura — el render entero se puede saltar si nada cambió.
export const ControlV2AlcanzaCard = memo(ControlV2AlcanzaCardImpl)
