import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { formatMoneyShort } from '@/utils/money'
import { nunitoFamily } from '@/theme/typography'

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
  /** Días distintos con gasto en el ciclo. Solo se usa para el hint de
   *  progreso del estado empty ("Gasto en N de 7 días"); el gate de
   *  activación sigue siendo `hasReliableProjection`. */
  diasConGasto?: number
  /** When the user has confirmed a starting balance for this cycle
   *  (mid-month corrections), surface it as context — the projection
   *  is still based on the average pace, but the user knows the math
   *  respects their actual cash-on-hand. */
  cycleStartingBalanceOverride?: number | null
  /** 'dynamic' = ingreso variable: sin cobro — la timeline y los hints
   *  hablan de "fin de ciclo" en vez de "próximo sueldo/cobro". */
  incomeMode?: 'fixed' | 'dynamic'
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
  diasConGasto = 0,
  cycleStartingBalanceOverride,
  incomeMode,
}: ControlV2AlcanzaCardProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const isDark = theme.isDark
  const isDynamicIncome = incomeMode === 'dynamic'

  if (!hasReliableProjection) {
    // A diferencia de las otras tarjetas, "alcanza" NO se activa con un
    // solo gasto: proyecta a partir del PROMEDIO de días cerrados con
    // gasto (excluye hoy). Necesita ~una semana de días registrando para
    // tener un ritmo confiable. Por eso el empty muestra la silueta real
    // de la tarjeta (eyebrow + 3 stats + timeline + callout) pero inerte,
    // sin números, con el progreso real hacia la activación.
    return (
      <ControlV2AlcanzaCardEmpty
        diasConGasto={diasConGasto}
        isDynamicIncome={isDynamicIncome}
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
          stateLabel: t('control:alcanza.stateHolgado'),
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
          stateLabel: alcanzaElMes
            ? t('control:alcanza.stateAjustado')
            : t('control:alcanza.stateInsuficiente'),
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
          stateLabel: t('control:alcanza.stateAgotado'),
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
            ? t(
                isDynamicIncome
                  ? 'control:alcanza.hintExhaustoQuedanDynamic'
                  : 'control:alcanza.hintExhaustoQuedan',
                { amount: formatMoneyShort(Math.max(0, restanteMes)) },
              )
            : t(
                isDynamicIncome
                  ? 'control:alcanza.hintExhaustoAgotadoDynamic'
                  : 'control:alcanza.hintExhaustoAgotado',
              ),
      }
    }
    if (!alcanzaElMes) {
      return {
        icon: 'trending-down' as const,
        text:
          dailyReduction > 0
            ? t(
                isDynamicIncome
                  ? 'control:alcanza.hintReduceDiarioDynamic'
                  : 'control:alcanza.hintReduceDiario',
                { amount: formatMoneyShort(dailyReduction) },
              )
            : t('control:alcanza.hintReduceRitmo', {
                count: Math.max(1, diasMes - diaAgotamiento),
              }),
      }
    }
    if (isTight) {
      return {
        icon: 'flag' as const,
        text: t('control:alcanza.hintAjustado', {
          amount: formatMoneyShort(Math.max(0, sobrantePresupuestadoMes)),
        }),
      }
    }
    return {
      icon: 'savings' as const,
      text: t('control:alcanza.hintSobra', {
        amount: formatMoneyShort(Math.max(0, sobrantePresupuestadoMes)),
      }),
    }
  })()

  // ── Headline copy ───────────────────────────────────────────
  const headline = alreadyExhausted
    ? t('control:alcanza.headlineExhausto', { day: Math.max(1, diaAgotamiento) })
    : alcanzaElMes
      ? isComfortable
        ? t('control:alcanza.headlineComodo')
        : t(
            isDynamicIncome
              ? 'control:alcanza.headlineJustoDynamic'
              : 'control:alcanza.headlineJusto',
          )
      : t('control:alcanza.headlineNoAlcanza', { day: diaAgotamiento })

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
            {t('control:alcanza.eyebrow')}
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
              {t('control:alcanza.overrideWorkingWith', {
                amount: formatMoneyShort(cycleStartingBalanceOverride),
              })}
            </Text>
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <Stat
            label={t('control:alcanza.statRitmo')}
            value={t('control:alcanza.perDia', {
              amount: formatMoneyShort(pacePromedio),
            })}
            sub={t('control:alcanza.statRitmoSub', { days: closedDays })}
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
          <Stat
            label={t('control:alcanza.statCupo')}
            value={t('control:alcanza.perDia', {
              amount: formatMoneyShort(cupoDiario),
            })}
            sub={t('control:alcanza.statCupoSub')}
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
          <Stat
            label={alreadyExhausted ? t('control:alcanza.statTeQueda') : t('control:alcanza.statSobrante')}
            value={
              alreadyExhausted
                ? formatMoneyShort(Math.max(0, restanteMes))
                : `${sobrantePresupuestadoMes >= 0 ? '+' : ''}${formatMoneyShort(sobrantePresupuestadoMes)}`
            }
            sub={
              alreadyExhausted
                ? t(
                    isDynamicIncome
                      ? 'control:alcanza.statSubHastaCobrarDynamic'
                      : 'control:alcanza.statSubHastaCobrar',
                  )
                : t('control:alcanza.statSubAlCierre')
            }
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
                {t('control:alcanza.timelineInicio')}
              </Text>
              <Text
                style={[styles.timelineLabel, { color: theme.colors.textMuted }]}
              >
                {t('control:alcanza.timelineHoy')}
              </Text>
              <Text
                style={[styles.timelineLabel, { color: theme.colors.textMuted }]}
              >
                {t(isDynamicIncome ? 'control:alcanza.timelineFinDeCiclo' : 'control:alcanza.timelineProxSueldo')}
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
                    {t('control:alcanza.timelineDia', { day: diaAgotamiento })}
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

/**
 * Empty-state twin de "Hasta cuándo te alcanza". Misma chrome (surface,
 * border `line`, eyebrow + BreatheDot + título UPPERCASE) y la misma
 * silueta interna — 3 stats (Ritmo / Cupo / Sobrante), timeline
 * INICIO/HOY/PRÓX. SUELDO, callout — pero TODO inerte: barras y dashes
 * neutros, sin números, sin colores de estado. El pill dice "Pronto" en
 * textMuted (no es un estado), y el callout comunica la activación real
 * + el progreso hacia ella. Recesado (opacity 0.86), sin shimmer.
 */
function ControlV2AlcanzaCardEmpty({
  diasConGasto,
  isDynamicIncome = false,
}: {
  diasConGasto: number
  isDynamicIncome?: boolean
}) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const isDark = theme.isDark
  const ph = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,42,30,0.06)'
  // Clamp del progreso mostrado: nunca por encima del umbral aunque el
  // ciclo tenga más días con gasto que el piso (el gate real no se cumplió).
  const progreso = Math.max(0, Math.min(diasConGasto, MIN_CLOSED_DAYS_FLOOR))
  const cardBg = isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  return (
    <RiseView delay={140}>
      <View
        accessibilityRole="text"
        accessibilityLabel={t('control:alcanza.empty.a11y')}
        style={[
          styles.card,
          styles.emptyCard,
          { backgroundColor: cardBg, borderColor: theme.colors.line },
        ]}
      >
        <View style={styles.eyebrowRow}>
          <BreatheDot size={7} color={theme.colors.textMuted} glow={theme.colors.textMuted} />
          <Text
            style={[styles.eyebrow, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {t('control:alcanza.eyebrow')}
          </Text>
          <View style={[styles.emptyPill, { borderColor: theme.colors.line }]}>
            <Text style={[styles.emptyPillText, { color: theme.colors.textMuted }]}>
              {t('control:alcanza.empty.soon')}
            </Text>
          </View>
        </View>

        {/* Headline silhouette — una barra neutra ancha en lugar del
            titular state-aware. */}
        <View style={[styles.emptyBar, { width: '82%', height: 18, backgroundColor: ph }]} />

        {/* 3 stats inertes — labels reales, valores como dashes/barras. */}
        <View style={styles.statsRow}>
          {(
            [
              ['statRitmo', t('control:alcanza.statRitmo')],
              ['statCupo', t('control:alcanza.statCupo')],
              ['statSobrante', t('control:alcanza.statSobrante')],
            ] as const
          ).map(([key, label]) => (
            <View key={key} style={styles.stat}>
              <Text
                style={[styles.statLabel, { color: theme.colors.textMuted }]}
                numberOfLines={1}
              >
                {label}
              </Text>
              <Text style={[styles.statValue, { color: theme.colors.textMuted }]}>
                —
              </Text>
              <View
                style={[styles.emptyBar, { width: 44, height: 8, backgroundColor: ph, marginTop: 4 }]}
              />
            </View>
          ))}
        </View>

        {/* Timeline inerte — labels reales, track neutro sin marcadores. */}
        <View
          style={[
            styles.timelineFrame,
            {
              backgroundColor: isDark ? DARK_TAB_CANVAS : theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.timelineLabels}>
            <Text style={[styles.timelineLabel, { color: theme.colors.textMuted }]}>
              {t('control:alcanza.timelineInicio')}
            </Text>
            <Text style={[styles.timelineLabel, { color: theme.colors.textMuted }]}>
              {t('control:alcanza.timelineHoy')}
            </Text>
            <Text style={[styles.timelineLabel, { color: theme.colors.textMuted }]}>
              {t(isDynamicIncome ? 'control:alcanza.timelineFinDeCiclo' : 'control:alcanza.timelineProxSueldo')}
            </Text>
          </View>
          <View style={styles.timelineTrack}>
            <View style={[styles.timelineBase, { backgroundColor: ph }]} />
          </View>
        </View>

        {/* Callout — activación real + progreso hacia ella. */}
        <View
          style={[
            styles.callout,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,42,30,0.04)',
              borderColor: theme.colors.line,
            },
          ]}
        >
          <MaterialIcons name="schedule" size={16} color={theme.colors.textMuted} />
          <View style={styles.calloutBody}>
            <Text style={[styles.calloutText, { color: theme.colors.text }]}>
              {t('control:alcanza.empty.callout', { days: MIN_CLOSED_DAYS_FLOOR })}
            </Text>
            <Text style={[styles.emptyProgress, { color: theme.colors.textMuted }]}>
              {t('control:alcanza.empty.progress', {
                progress: progreso,
                days: MIN_CLOSED_DAYS_FLOOR,
              })}
            </Text>
          </View>
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
    fontFamily: nunitoFamily('800'),
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
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.2,
  },
  headline: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
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
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
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
    fontFamily: nunitoFamily('800'),
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
    fontFamily: nunitoFamily('800'),
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
    fontFamily: nunitoFamily('600'),
    lineHeight: 16,
  },
  // ── Empty-state silhouette ──────────────────────────────────
  emptyCard: { opacity: 0.86 },
  emptyBar: { borderRadius: 4 },
  emptyPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  emptyPillText: { fontSize: 10, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 0.4 },
  calloutBody: { flex: 1, gap: 4 },
  emptyProgress: { fontSize: 11, fontWeight: '700', fontFamily: nunitoFamily('700'), letterSpacing: 0.2 },
})

// Memo: Alcanza proyecta hasta cuándo llega la plata. Card de
// solo-lectura — el render entero se puede saltar si nada cambió.
export const ControlV2AlcanzaCard = memo(ControlV2AlcanzaCardImpl)
