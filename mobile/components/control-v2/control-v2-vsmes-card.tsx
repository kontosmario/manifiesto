import { memo, useEffect } from 'react'
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { RiseView } from '@/components/home/animated/rise-view'
import { motionDurations, motionEasings } from '@/lib/motion'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoneyShort } from '@/utils/money'
import type {
  MonthlyByMemberEntry,
  MonthlyCategoryBreakdownEntry,
} from '@/features/insights/control-v2-adapter'

type Mood = 'green' | 'yellow' | 'red' | null

interface ControlV2VsMesCardProps {
  hasPreviousMonth: boolean
  /** Count of "outlier" days excluded from the projection. The
   *  projection uses the typical daily rhythm (mean of days where
   *  gasto ≤ 3× median), so a single $885k spike doesn't extrapolate
   *  across the whole cycle. Null when robust algorithm didn't run
   *  (e.g. < 5 closed days). */
  outlierDaysExcluded?: number | null
  /** Sum of the outlier-day spending — paired with the count for the
   *  "Días atípicos descartados" chip. */
  outlierDaysTotal?: number | null
  /** Display name of the closed cycle, e.g. "Abril". */
  mesPasadoNombre: string
  /** total_variable_spent at close. */
  mesPasadoTotal: number
  mesPasadoDiasBajoCupo: number
  mesPasadoTopCatLabel: string
  mesPasadoTopCatAmount: number
  /** mood from `monthly_summaries.mood`. */
  mesPasadoMood: Mood
  /** savings_delta del cierre — lo que NO se gastó. */
  mesPasadoSavingsDelta: number
  mesPasadoTopExpense: { description: string; price: number } | null
  currentTopCatSpent: number
  /** Inclusive day range for the cycle ("15 mar – 14 abr"). `null` when
   *  calendar-aligned. */
  mesPasadoCycleRangeLabel: string | null
  /** Full category breakdown — kept available for richer variants. */
  mesPasadoCategorias: MonthlyCategoryBreakdownEntry[]
  /** Per-member spend — kept available for richer variants. */
  mesPasadoPorMiembro: MonthlyByMemberEntry[]
  /** Daily totals — kept available for richer variants. */
  mesPasadoDailyTotals: number[]
  /** Linear projection of variable spend at month-end. */
  proyectadoMes: number
  vsMesAhorro: number
  vsMesDeltaPct: number
  vsMesMejor: boolean
  diasGanadores: number
  /** Current day of the active cycle (1-indexed). */
  diaActual: number
  /** Launches the cinematic "Manifiesto Wrapped" recap of the closed
   *  cycle (the same animation that plays after confirming salary).
   *  Undefined when there's no closed cycle with spend to replay. */
  onVerCierre?: () => void
}

/**
 * "Cómo vas este mes" — minimal, comparison-first review wired to the
 * real `monthly_summaries` rollup.
 *
 * The card leads with the single most useful idea in plain language: how
 * this cycle is tracking against the closed one. Two bars and a one-line
 * recap support it. No charts to read, no jargon (no %, "proyección",
 * "delta", "cupo").
 *
 * The forward comparison needs current-cycle data. When the cycle is
 * still empty (e.g. right after a close), the card shows the SAME layout
 * filled with clearly-labelled example numbers ("Ejemplo") so the user
 * sees how it will look — never touching their data — and it swaps to
 * their real numbers the moment they start spending.
 */
function ControlV2VsMesCardImpl({
  hasPreviousMonth,
  mesPasadoNombre,
  mesPasadoTotal,
  mesPasadoTopCatLabel,
  mesPasadoTopCatAmount,
  mesPasadoSavingsDelta,
  proyectadoMes,
  vsMesAhorro,
  vsMesMejor,
  diaActual,
  outlierDaysExcluded,
  outlierDaysTotal,
  onVerCierre,
}: ControlV2VsMesCardProps) {
  const { theme } = useAppTheme()
  const isDark = theme.isDark
  const reduceMotion = useReducedMotion() ?? false

  // ── Empty state: no closed cycle yet ────────────────────────
  if (!hasPreviousMonth) {
    const neutralFg = theme.colors.textMuted
    return (
      <RiseView delay={260}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
              borderColor: theme.colors.line,
            },
          ]}
        >
          <View style={styles.eyebrowRow}>
            <BreatheDot size={7} color={neutralFg} glow={neutralFg} />
            <Text style={[styles.eyebrow, { color: neutralFg }]} numberOfLines={1}>
              CÓMO VAS ESTE MES
            </Text>
            <View
              style={[
                styles.statePill,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,42,30,0.05)',
                  borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,42,30,0.12)',
                },
              ]}
            >
              <MaterialIcons name="schedule" size={11} color={neutralFg} />
              <Text style={[styles.statePillText, { color: neutralFg }]} numberOfLines={1}>
                Sin cierre todavía
              </Text>
            </View>
          </View>

          <Text style={[styles.headline, { color: theme.colors.text }]}>
            Todavía no cerraste un mes.
          </Text>
          <Text style={[styles.body, { color: theme.colors.textMuted }]}>
            Cuando confirmes tu próximo cobro, vamos a cerrar el mes y vas a ver
            aquí cómo vas gastando comparado con el mes anterior.
          </Text>
        </View>
      </RiseView>
    )
  }

  // ── Comparison: siempre data real del ciclo actual ──
  const esteMes = proyectadoMes
  const hasSpend = proyectadoMes > 0
  // Con <4 días de ciclo la proyección lineal es volátil (un solo día
  // outlier la dispara), así que recién ahí afirmamos la comparación.
  // Antes mostramos el avance real, sin prometer un cierre.
  const reliable = diaActual >= 4 && hasSpend
  const diff = Math.abs(vsMesAhorro)
  const positive = vsMesMejor

  // Tono: verde si vas por debajo del mes pasado, ámbar si por encima,
  // neutro mientras el ciclo recién arranca (sin datos suficientes).
  const accentFg = !reliable
    ? theme.colors.textMuted
    : positive
      ? theme.colors.success
      : theme.colors.warning
  // Relleno de la barra "Este mes": visible pero neutro cuando aún no es
  // confiable, para no insinuar un resultado.
  const barFg = !reliable
    ? isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,42,30,0.45)'
    : positive
      ? theme.colors.success
      : theme.colors.warning
  const cardBorder = !reliable
    ? theme.colors.line
    : positive
      ? isDark ? 'rgba(122,216,163,0.34)' : 'rgba(28,126,58,0.26)'
      : isDark ? 'rgba(243,186,87,0.34)' : 'rgba(194,122,10,0.26)'

  // CTA fill = brand primary (mint on dark / forest on light); text is the
  // opposite end so it stays AA either way.
  const ctaFg = isDark ? '#0B1F12' : '#FFFBF2'

  // Status pill: verdict real cuando hay datos confiables; neutro mientras
  // el ciclo arranca.
  const pill = !reliable
    ? {
        text: hasSpend ? 'Primeros días' : 'Recién arranca',
        fg: theme.colors.textMuted,
        bg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,42,30,0.05)',
        border: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,42,30,0.12)',
        icon: 'schedule' as const,
      }
    : positive
      ? {
          text: 'Vas bien',
          fg: theme.colors.success,
          bg: isDark ? 'rgba(122,216,163,0.16)' : 'rgba(28,126,58,0.10)',
          border: isDark ? 'rgba(122,216,163,0.34)' : 'rgba(28,126,58,0.26)',
          icon: 'trending-down' as const,
        }
      : {
          text: 'Ojo este mes',
          fg: theme.colors.warning,
          bg: isDark ? 'rgba(243,186,87,0.16)' : 'rgba(194,122,10,0.10)',
          border: isDark ? 'rgba(243,186,87,0.34)' : 'rgba(194,122,10,0.26)',
          icon: 'trending-up' as const,
        }

  const maxVal = Math.max(esteMes, mesPasadoTotal, 1)
  const showTopCat = mesPasadoTopCatAmount > 0 && Boolean(mesPasadoTopCatLabel)

  return (
    <RiseView delay={260}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
            borderColor: cardBorder,
          },
        ]}
      >
        {/* ── Header ── */}
        <View style={styles.eyebrowRow}>
          <BreatheDot size={7} color={accentFg} glow={accentFg} />
          <Text style={[styles.eyebrow, { color: accentFg }]} numberOfLines={1}>
            CÓMO VAS ESTE MES
          </Text>
          <View style={[styles.statePill, { backgroundColor: pill.bg, borderColor: pill.border }]}>
            <MaterialIcons name={pill.icon} size={11} color={pill.fg} />
            <Text style={[styles.statePillText, { color: pill.fg }]} numberOfLines={1}>
              {pill.text}
            </Text>
          </View>
        </View>

        {/* ── Headline: estado real del ciclo, en una frase ── */}
        <Text style={[styles.headline, { color: theme.colors.text }]}>
          {!hasSpend ? (
            <>Todavía no registraste gastos este mes.</>
          ) : !reliable ? (
            <>
              Llevas{' '}
              <Text style={styles.headlineStrong}>{formatMoneyShort(esteMes)}</Text>{' '}
              gastado. En unos días te comparo con {mesPasadoNombre}.
            </>
          ) : (
            <>
              Vas gastando{' '}
              <Text style={styles.headlineStrong}>{formatMoneyShort(esteMes)}</Text>,{' '}
              <Text style={[styles.headlineStrong, { color: accentFg }]}>
                {formatMoneyShort(diff)} {positive ? 'menos' : 'más'}
              </Text>{' '}
              que en {mesPasadoNombre}.
            </>
          )}
        </Text>

        {/* ── Las dos barras ── */}
        <View style={styles.bars}>
          <CompareBar
            label={mesPasadoNombre}
            value={formatMoneyShort(mesPasadoTotal)}
            pct={(mesPasadoTotal / maxVal) * 100}
            fillColor={isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,42,30,0.22)'}
            text={theme.colors.text}
            muted={theme.colors.textMuted}
            reduceMotion={reduceMotion}
            delay={140}
          />
          <CompareBar
            label="Este mes"
            value={formatMoneyShort(esteMes)}
            pct={(esteMes / maxVal) * 100}
            fillColor={barFg}
            text={theme.colors.text}
            muted={theme.colors.textMuted}
            reduceMotion={reduceMotion}
            delay={220}
            highlight
          />
        </View>

        {/* ── Mini recap del mes pasado ── */}
        <View
          style={[
            styles.recap,
            { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,42,30,0.08)' },
          ]}
        >
          <View style={styles.recapRow}>
            <MaterialIcons name="event-available" size={13} color={theme.colors.textMuted} />
            <Text style={[styles.recapText, { color: theme.colors.textMuted }]} numberOfLines={1}>
              En {mesPasadoNombre} gastaste{' '}
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
                {formatMoneyShort(mesPasadoTotal)}
              </Text>
              {mesPasadoSavingsDelta > 0 ? (
                <>
                  {' '}y ahorraste{' '}
                  <Text style={{ color: theme.colors.success, fontWeight: '700' }}>
                    {formatMoneyShort(mesPasadoSavingsDelta)}
                  </Text>
                </>
              ) : null}
            </Text>
          </View>
          {showTopCat ? (
            <View style={styles.recapRow}>
              <MaterialIcons name="local-mall" size={13} color={theme.colors.textMuted} />
              <Text style={[styles.recapText, { color: theme.colors.textMuted }]} numberOfLines={1}>
                Donde más gastaste:{' '}
                <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
                  {mesPasadoTopCatLabel}
                </Text>
              </Text>
            </View>
          ) : null}
          {outlierDaysExcluded != null && outlierDaysExcluded > 0 ? (
            // Surfaces what the robust projection dropped. The
            // projection extrapolates from the calm-day rhythm, so a
            // single $885k Mercado run doesn't multiply across the
            // remaining cycle. The chip is transparency: we're not
            // hiding the spending — we're noting that those days were
            // outliers and excluded from the "ritmo típico" math.
            <View style={styles.recapRow}>
              <MaterialIcons name="info-outline" size={13} color={theme.colors.textMuted} />
              <Text
                style={[styles.recapText, { color: theme.colors.textMuted }]}
                numberOfLines={2}
              >
                {outlierDaysExcluded === 1 ? 'Día atípico' : 'Días atípicos'} fuera del
                ritmo típico:{' '}
                <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
                  {outlierDaysExcluded}
                </Text>
                {outlierDaysTotal != null && outlierDaysTotal > 0 ? (
                  <>
                    {' '}(suman{' '}
                    <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
                      {formatMoneyShort(outlierDaysTotal)}
                    </Text>
                    ).
                  </>
                ) : (
                  <>.</>
                )}{' '}
                La proyección los excluye para no inflar el cierre.
              </Text>
            </View>
          ) : null}
          {/* Scope disclaimer — la comparativa usa total_variable_spent
              en ambos lados. Los fijos están planos mes a mes (alquiler,
              luz, internet) y diluirían la señal del comportamiento real.
              Antes el user no veía el matiz y podía leer el monto como
              "total del mes". Owner feedback 2026-06-08. */}
          <View style={styles.recapRow}>
            <MaterialIcons name="info-outline" size={13} color={theme.colors.textMuted} />
            <Text
              style={[styles.recapText, { color: theme.colors.textMuted }]}
              numberOfLines={2}
            >
              Compara solo gastos variables — los fijos no entran.
            </Text>
          </View>
        </View>

        {/* ── Ver el cierre del mes (Manifiesto Wrapped) ── */}
        {onVerCierre ? (
          <Pressable
            onPress={() => {
              void triggerHaptic('selection')
              onVerCierre()
            }}
            accessibilityRole="button"
            accessibilityLabel={`Ver el cierre de ${mesPasadoNombre} con animación`}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: theme.colors.primary,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <MaterialIcons name="slideshow" size={16} color={ctaFg} />
            <Text style={[styles.ctaText, { color: ctaFg }]} numberOfLines={1}>
              Ver el cierre de {mesPasadoNombre}
            </Text>
            <MaterialIcons name="chevron-right" size={18} color={ctaFg} />
          </Pressable>
        ) : null}
      </View>
    </RiseView>
  )
}

// ── Grow reveal — scales a bar in from its left edge on mount ────────
interface GrowRevealProps {
  reduceMotion: boolean
  delay?: number
  style?: ViewStyle | ViewStyle[]
  children?: React.ReactNode
}

function GrowReveal({ reduceMotion, delay = 0, style, children }: GrowRevealProps) {
  const scaleX = useSharedValue(reduceMotion ? 1 : 0)

  useEffect(() => {
    if (reduceMotion) {
      scaleX.value = 1
      return
    }
    scaleX.value = withDelay(
      delay,
      withTiming(1, { duration: motionDurations.slow, easing: motionEasings.enterSmooth }),
    )
  }, [reduceMotion, delay, scaleX])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: scaleX.value }],
  }))

  return (
    <Animated.View style={[{ transformOrigin: 'left' } as ViewStyle, style, animatedStyle]}>
      {children}
    </Animated.View>
  )
}

// ── Comparison bar ──────────────────────────────────────────────────
interface CompareBarProps {
  label: string
  value: string
  pct: number
  fillColor: string
  text: string
  muted: string
  reduceMotion: boolean
  delay?: number
  highlight?: boolean
}

function CompareBar({
  label,
  value,
  pct,
  fillColor,
  text,
  muted,
  reduceMotion,
  delay,
  highlight,
}: CompareBarProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.barRow}>
      <Text
        style={[styles.barLabel, { color: highlight ? text : muted, fontWeight: highlight ? '800' : '700' }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View
        style={[
          styles.barTrack,
          { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,42,30,0.08)' },
        ]}
      >
        <GrowReveal
          reduceMotion={reduceMotion}
          delay={delay}
          style={[styles.barFill, { width: `${Math.max(3, pct)}%`, backgroundColor: fillColor }]}
        />
      </View>
      <Text style={[styles.barValue, { color: text }]} numberOfLines={1}>
        {value}
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
  headline: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 23,
    letterSpacing: -0.3,
  },
  headlineStrong: {
    fontWeight: '800',
  },
  // Bars
  bars: {
    gap: 8,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barLabel: {
    width: 64,
    fontSize: 12,
  },
  barTrack: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 7,
  },
  barValue: {
    width: 56,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'right',
  },
  // Recap
  recap: {
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  recapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recapText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  // Launch CTA
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginTop: 2,
  },
  ctaText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  // Empty state
  body: {
    fontSize: 12,
    lineHeight: 18,
  },
})

// Memo: barras animadas + frases; sin memo el parent reevaluaba el árbol
// completo aunque la data del cierre no cambiara.
export const ControlV2VsMesCard = memo(ControlV2VsMesCardImpl)
