import { memo, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { formatMoneyShort } from '@/utils/money'
import type { DowBucket } from '@/features/insights/control-v2-mock'

const MIN_DIAS = 14
// Patrón sincero por día de la semana: necesita ~dos semanas de registro
// real, así que se activa con gasto en 14 días distintos (cada día de la
// semana visto ~2 veces). Con menos no hay patrón estadístico.
const MIN_SPEND_DAYS = 14

interface ControlV2PatronCardProps {
  dows: DowBucket[]
  peorDow: DowBucket
  mejorDow: DowBucket
  globalAvg: number
  diaActual?: number
  /** Días distintos con gasto en el ciclo. La tarjeta se activa con
   *  ≥ MIN_SPEND_DAYS para que el patrón sea real (1-2 gastos no son un
   *  patrón). */
  diasConGasto?: number
}

/**
 * "Tu patrón semanal" — auditada y alineada con la familia.
 *
 * Visual:
 *  · Cream surface + accent border tinted por la severidad del patrón
 *    (warning si hay un día claramente peor, line neutral si la
 *    distribución es plana). Mismo chrome que MetaCard / AlcanciaCard
 *    / AlcanzaCard / SemanaCard / CoberturaCard.
 *  · MaterialIcons + BreatheDot — sin emojis, sin gradients
 *    decorativos.
 *  · 3 stats horizontales (peor / mejor / promedio) hacen explícita
 *    la matemática que sostiene el chart.
 *  · Indicador "HOY ▾" sobre el DoW actual — conecta el patrón con
 *    el día en curso.
 *  · Promedio dibujado como horizontal dashed line sobre el chart
 *    (anclaje visual para leer "por arriba/abajo del promedio").
 *
 * Lógica:
 *  · Tri-state según severidad: `fuerte` (ratio > 1.5), `leve`
 *    (1.2-1.5), `plano` (≤1.2). Cada uno con copy distinto y
 *    proyección de ahorro real (usa `peorDow.count` — instancias
 *    reales del DoW en el ciclo, no `× 4`).
 *  · Si hoy es el peor día, agrega callout secundario "Hoy es X,
 *    tu día más caro — cuidalo".
 */
function ControlV2PatronCardImpl({
  dows,
  peorDow,
  mejorDow,
  globalAvg,
  diaActual = 999,
  diasConGasto = 999,
}: ControlV2PatronCardProps) {
  const { theme } = useAppTheme()
  const isDark = theme.isDark

  // Today's day-of-week mapped to the mock convention (0=Mon..6=Sun).
  // Computed once per render in a useMemo so it's stable inside the
  // component, but doesn't add a hook overhead.
  const todayDow = useMemo(() => {
    const jsDow = new Date().getDay() // 0=Sun..6=Sat
    return (jsDow + 6) % 7
  }, [])

  // Hasta tener gasto en suficientes días distintos no hay un patrón
  // estadístico real (1-2 gastos no son patrón). Mostramos la silueta
  // real — eyebrow + 3 stats + chart de 7 columnas con línea de
  // promedio — pero inerte, sin números, con el progreso a la activación.
  if (diaActual < MIN_DIAS || diasConGasto < MIN_SPEND_DAYS) {
    return <ControlV2PatronCardEmpty diasConGasto={diasConGasto} />
  }

  // ── Severity tri-state ──────────────────────────────────────
  const ratio = Number.isFinite(peorDow.ratio) ? peorDow.ratio : 1
  const severity: 'fuerte' | 'leve' | 'plano' =
    ratio > 1.5 ? 'fuerte' : ratio > 1.2 ? 'leve' : 'plano'
  const mejorMatters =
    mejorDow.avg > 0 && mejorDow.name !== peorDow.name && severity !== 'plano'

  const palette = (() => {
    switch (severity) {
      case 'fuerte':
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
          icon: 'trending-up' as const,
          canonical: 'Atención',
          stateLabel: `${dowFullName(peorDow.name)} intenso`,
        }
      case 'leve':
        return {
          fg: theme.colors.warning,
          border: isDark ? 'rgba(243,186,87,0.30)' : 'rgba(194,122,10,0.22)',
          chipBg: isDark ? 'rgba(243,186,87,0.12)' : 'rgba(194,122,10,0.08)',
          chipBorder: isDark
            ? 'rgba(243,186,87,0.28)'
            : 'rgba(194,122,10,0.20)',
          calloutBg: isDark
            ? 'rgba(243,186,87,0.08)'
            : 'rgba(194,122,10,0.05)',
          calloutBorder: isDark
            ? 'rgba(243,186,87,0.22)'
            : 'rgba(194,122,10,0.16)',
          icon: 'trending-up' as const,
          canonical: 'Atención',
          stateLabel: `${dowFullName(peorDow.name)} alto`,
        }
      case 'plano':
        return {
          fg: theme.colors.success,
          border: isDark ? 'rgba(122,216,163,0.30)' : 'rgba(28,126,58,0.22)',
          chipBg: isDark ? 'rgba(122,216,163,0.14)' : 'rgba(28,126,58,0.08)',
          chipBorder: isDark
            ? 'rgba(122,216,163,0.30)'
            : 'rgba(28,126,58,0.22)',
          calloutBg: isDark
            ? 'rgba(122,216,163,0.08)'
            : 'rgba(28,126,58,0.05)',
          calloutBorder: isDark
            ? 'rgba(122,216,163,0.22)'
            : 'rgba(28,126,58,0.16)',
          icon: 'trending-flat' as const,
          canonical: 'Saludable',
          stateLabel: 'Distribución pareja',
        }
    }
  })()

  // Bar tones — peor warns, mejor sucede, neutral muted.
  const tones = {
    peor: theme.colors.warning,
    mejor: theme.colors.success,
    neutral: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,42,30,0.14)',
    avgLine: isDark ? 'rgba(255,255,255,0.30)' : 'rgba(15,42,30,0.32)',
    todayMarker: theme.colors.text,
  }

  const maxAvg = Math.max(...dows.map((d) => d.avg), 1)
  const avgLinePct = (globalAvg / maxAvg) * 100

  // Real-cycle savings projection — uses the actual instance count
  // of the worst DoW that the engine recorded for the cycle, not the
  // approximation `× 4`.
  const peorInstances = Math.max(1, peorDow.count)
  const ahorroProyectado = Math.max(
    0,
    (peorDow.avg - globalAvg) * peorInstances,
  )
  const todayIsPeor = todayDow === dowIndexFromName(peorDow.name)

  // Smart hint copy.
  const hint = (() => {
    if (severity === 'plano') {
      return {
        icon: 'check-circle' as const,
        text: 'Tu gasto está balanceado a lo largo de la semana. No hay un día que se dispare.',
      }
    }
    if (severity === 'leve') {
      return {
        icon: 'trending-up' as const,
        text: `Los ${dowPlural(peorDow.name)} tienden a ser más caros (${ratio.toFixed(1)}×). Vale la pena prestarles atención.`,
      }
    }
    return {
      icon: 'savings' as const,
      text: `Si los ${dowPlural(peorDow.name)} bajan al promedio, ahorras ~${formatMoneyShort(ahorroProyectado)} en este mes.`,
    }
  })()

  return (
    <RiseView delay={300}>
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
            TU PATRÓN SEMANAL
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

        <Text style={[styles.headline, { color: theme.colors.text }]}>
          {severity === 'plano' ? (
            <>
              No hay un día que se dispare. Tu gasto está{' '}
              <Text style={[styles.headlineStrong, { color: palette.fg }]}>
                balanceado
              </Text>
              .
            </>
          ) : (
            <>
              Los{' '}
              <Text style={[styles.headlineStrong, { color: tones.peor }]}>
                {dowPlural(peorDow.name)}
              </Text>{' '}
              gastas{' '}
              <Text style={[styles.headlineStrong, { color: tones.peor }]}>
                {ratio.toFixed(1)}×
              </Text>{' '}
              más que tu promedio
              {mejorMatters ? (
                <>
                  ; los{' '}
                  <Text
                    style={[styles.headlineStrong, { color: tones.mejor }]}
                  >
                    {dowPlural(mejorDow.name)}
                  </Text>{' '}
                  eres el más ahorrativo
                </>
              ) : null}
              .
            </>
          )}
        </Text>

        <View style={styles.statsRow}>
          <SegmentStat
            dotColor={tones.peor}
            label="Peor día"
            value={dowFullName(peorDow.name)}
            sub={formatMoneyShort(peorDow.avg)}
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
          <SegmentStat
            dotColor={mejorDow.avg > 0 ? tones.mejor : tones.neutral}
            label="Mejor día"
            value={mejorDow.avg > 0 ? dowFullName(mejorDow.name) : '—'}
            sub={
              mejorDow.avg > 0 ? formatMoneyShort(mejorDow.avg) : 'sin datos'
            }
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
          <SegmentStat
            dotColor={tones.neutral}
            label="Promedio"
            value={`${formatMoneyShort(globalAvg)}/día`}
            sub={`últimos ${diaActual >= 28 ? '28' : diaActual} días`}
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
        </View>

        <View
          style={[
            styles.chartFrame,
            {
              // Dark: recede to the near-black canvas (inset well below
              // the surfaceMuted card). The avgTag / todayCallout on top
              // keep surfaceMuted so they pop above this well.
              backgroundColor: theme.isDark
                ? DARK_TAB_CANVAS
                : theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.barsRow}>
            {globalAvg > 0 ? (
              <View
                style={[
                  styles.avgLine,
                  {
                    bottom: `${avgLinePct}%`,
                    borderTopColor: tones.avgLine,
                  },
                ]}
              >
                <View
                  style={[
                    styles.avgTag,
                    {
                      backgroundColor: theme.colors.surfaceMuted,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.avgTagText, { color: theme.colors.textMuted }]}
                  >
                    PROM
                  </Text>
                </View>
              </View>
            ) : null}
            {dows.map((d, idx) => {
              const pct = d.avg > 0 ? d.avg / maxAvg : 0
              const isPeor = d.name === peorDow.name && severity !== 'plano'
              const isMejor =
                d.name === mejorDow.name && d.avg > 0 && severity !== 'plano'
              const fill = isPeor
                ? tones.peor
                : isMejor
                  ? tones.mejor
                  : tones.neutral
              return (
                <View key={d.name} style={styles.barCol}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${Math.max(2, pct * 100)}%`,
                        backgroundColor: fill,
                      },
                    ]}
                  />
                  {idx === todayDow ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.todayMarker,
                        { borderTopColor: tones.todayMarker },
                      ]}
                    />
                  ) : null}
                </View>
              )
            })}
          </View>
          <View style={styles.labelsRow}>
            {dows.map((d, idx) => {
              const isPeor = d.name === peorDow.name && severity !== 'plano'
              const isMejor =
                d.name === mejorDow.name && d.avg > 0 && severity !== 'plano'
              const isToday = idx === todayDow
              const color = isToday
                ? theme.colors.text
                : isPeor
                  ? tones.peor
                  : isMejor
                    ? tones.mejor
                    : theme.colors.textMuted
              return (
                <Text
                  key={d.name}
                  style={[
                    styles.dayLabel,
                    {
                      color,
                      fontWeight: isPeor || isMejor || isToday ? '800' : '600',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {d.name}
                  {isToday ? ' ·' : ''}
                </Text>
              )
            })}
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

        {todayIsPeor && severity !== 'plano' ? (
          <View
            style={[
              styles.todayCallout,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: palette.chipBorder,
              },
            ]}
            accessibilityLabel="Hoy es tu día más caro"
          >
            <MaterialIcons name="today" size={14} color={palette.fg} />
            <Text
              style={[styles.todayCalloutText, { color: theme.colors.text }]}
            >
              Hoy es {dowFullName(peorDow.name)} — cuida el ritmo.
            </Text>
          </View>
        ) : null}
      </View>
    </RiseView>
  )
}

// Etiquetas de día y alturas fijas para las columnas inertes del estado
// empty. Pura geometría — no representan ningún gasto real, solo dan la
// silueta del chart por día de la semana.
const EMPTY_DOW_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const
const EMPTY_DOW_HEIGHTS = [48, 36, 60, 44, 72, 54, 40] as const

/**
 * Empty-state twin de "Tu patrón semanal". Misma chrome (surface, border
 * `line`, eyebrow + BreatheDot + título UPPERCASE) y la misma silueta —
 * 3 stats + chart de 7 columnas por día con línea de promedio — pero
 * inerte: columnas neutras de alturas variadas, línea de promedio
 * neutra sin tag con monto, sin valores. El pill dice "Pronto" en
 * textMuted; el callout comunica la activación + el progreso. Recesado
 * (opacity 0.86), sin shimmer.
 */
function ControlV2PatronCardEmpty({ diasConGasto }: { diasConGasto: number }) {
  const { theme } = useAppTheme()
  const isDark = theme.isDark
  const ph = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,42,30,0.06)'
  const avgLineColor = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,42,30,0.16)'
  const progreso = Math.max(0, Math.min(diasConGasto, MIN_SPEND_DAYS))
  const cardBg = isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  return (
    <RiseView delay={300}>
      <View
        accessibilityRole="text"
        accessibilityLabel="Tu patrón semanal: esperando más días con gasto"
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
            TU PATRÓN SEMANAL
          </Text>
          <View style={[styles.emptyPill, { borderColor: theme.colors.line }]}>
            <Text style={[styles.emptyPillText, { color: theme.colors.textMuted }]}>
              Pronto
            </Text>
          </View>
        </View>

        {/* Headline silhouette. */}
        <View style={[styles.emptyBar, { width: '88%', height: 14, backgroundColor: ph }]} />

        <View style={styles.statsRow}>
          {(['Peor día', 'Mejor día', 'Promedio'] as const).map((label) => (
            <View key={label} style={styles.stat}>
              <View style={styles.statHead}>
                <View style={[styles.dot, { backgroundColor: ph }]} />
                <Text
                  style={[styles.statLabel, { color: theme.colors.textMuted }]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </View>
              <Text style={[styles.statValue, { color: theme.colors.textMuted }]}>
                —
              </Text>
              <View
                style={[styles.emptyBar, { width: 44, height: 8, backgroundColor: ph, marginTop: 4 }]}
              />
            </View>
          ))}
        </View>

        {/* Chart inerte — 7 columnas + línea de promedio neutra. */}
        <View
          style={[
            styles.chartFrame,
            {
              backgroundColor: isDark ? DARK_TAB_CANVAS : theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.barsRow}>
            <View
              pointerEvents="none"
              style={[styles.avgLine, { bottom: '52%', borderTopColor: avgLineColor }]}
            />
            {EMPTY_DOW_HEIGHTS.map((h, i) => (
              <View key={i} style={styles.barCol}>
                <View style={[styles.bar, { height: `${h}%`, backgroundColor: ph }]} />
              </View>
            ))}
          </View>
          <View style={styles.labelsRow}>
            {EMPTY_DOW_LABELS.map((d) => (
              <Text
                key={d}
                style={[styles.dayLabel, { color: theme.colors.textMuted, fontWeight: '600' }]}
                numberOfLines={1}
              >
                {d}
              </Text>
            ))}
          </View>
        </View>

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
              Registra gastos en al menos {MIN_SPEND_DAYS} días distintos para
              detectar en qué día de la semana gastas más.
            </Text>
            <Text style={[styles.emptyProgress, { color: theme.colors.textMuted }]}>
              Gasto en {progreso} de {MIN_SPEND_DAYS} días.
            </Text>
          </View>
        </View>
      </View>
    </RiseView>
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

// Map mock DoW name (Lun..Dom) back to the 0..6 index used in the
// `today` calculation. Defensive: returns -1 if the name doesn't
// match, which means todayIsPeor stays false.
function dowIndexFromName(name: string): number {
  const map: Record<string, number> = {
    Lun: 0,
    Mar: 1,
    Mié: 2,
    Jue: 3,
    Vie: 4,
    Sáb: 5,
    Dom: 6,
  }
  return map[name] ?? -1
}

// Plural form for the narrative copy, capitalised so the day reads
// as a proper label inside the inline text ("Los Viernes gastas...",
// "los Lunes sos el más ahorrativo"). Lun/Mar/Mié/Jue/Vie share form
// in singular and plural in Spanish, so the "s" only attaches to
// Sáb/Dom.
const DOW_PLURALS: Record<string, string> = {
  Lun: 'Lunes',
  Mar: 'Martes',
  Mié: 'Miércoles',
  Jue: 'Jueves',
  Vie: 'Viernes',
  Sáb: 'Sábados',
  Dom: 'Domingos',
}

function dowPlural(name: string): string {
  return DOW_PLURALS[name] ?? name
}

// Capitalised singular for headers / pills ("Viernes intenso",
// "Sábado alto"). Falls back to the abbrev when the name doesn't
// match the table.
const DOW_FULL: Record<string, string> = {
  Lun: 'Lunes',
  Mar: 'Martes',
  Mié: 'Miércoles',
  Jue: 'Jueves',
  Vie: 'Viernes',
  Sáb: 'Sábado',
  Dom: 'Domingo',
}

function dowFullName(name: string): string {
  return DOW_FULL[name] ?? name
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
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  headlineStrong: {
    fontWeight: '800',
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
  chartFrame: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 10,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 90,
    gap: 6,
    position: 'relative',
  },
  avgLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    zIndex: 1,
  },
  avgTag: {
    position: 'absolute',
    right: 0,
    top: -10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
  },
  avgTagText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  barCol: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'relative',
    zIndex: 2,
  },
  bar: {
    width: '100%',
    borderRadius: 4,
  },
  todayMarker: {
    position: 'absolute',
    bottom: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  labelsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
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
  todayCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  todayCalloutText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
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
  emptyPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  calloutBody: { flex: 1, gap: 4 },
  emptyProgress: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
})

// Memo: Patron evalúa día predominante de gastos + insights. Sin
// memo cada render reevaluaba el cálculo y el array de tiles.
export const ControlV2PatronCard = memo(ControlV2PatronCardImpl)
