import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow, RuleScale, getSignalIcon } from './smart-alerts-helpers'
import type { HeroState } from './hero-states'

interface SmartAlertsBannerLiveProps {
  state: HeroState
}

/**
 * Variant E · Editorial banner. Una sola card con headline-summary
 * + 2-3 bullets. Genera una sentencia que resume TODO ("Esta semana:
 * 2 fijos subieron de precio + semana cargada con $182k") y abajo
 * lista los bullets para detalle. State-aware: si no hay alerts,
 * muestra un banner positivo ("Todo en orden, estás al 4° ciclo
 * sin atrasos").
 *
 * Reading flow: el lector lee el resumen en 1.5s y decide si baja a
 * los bullets. Match perfecto con la curva de atención editorial.
 */
export function SmartAlertsBannerLive({ state }: SmartAlertsBannerLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const totalAlerts = state.alerts.hikes.length + state.alerts.signals.length
  const summary = buildSummary(state, palette)

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <RiseRow delay={0}>
        <View style={styles.headerRow}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            ESTA SEMANA
          </Text>
          <Text style={[styles.headerCount, { color: theme.colors.textMuted }]}>
            {totalAlerts === 0
              ? 'sin novedades'
              : `${totalAlerts} ${totalAlerts === 1 ? 'aviso' : 'avisos'}`}
          </Text>
        </View>
      </RiseRow>

      <RuleScale color={summary.accent} delay={80} />

      <RiseRow delay={160}>
        <Text style={[styles.headline, { color: theme.colors.text }]}>
          {summary.headline}
        </Text>
      </RiseRow>

      {summary.bullets.length > 0 ? (
        <View style={styles.bullets}>
          {summary.bullets.map((b, idx) => (
            <RiseRow key={idx} delay={260 + idx * 80}>
              <View style={styles.bulletRow}>
                <MaterialIcons name={b.icon} size={14} color={b.accent} />
                <Text style={[styles.bulletText, { color: theme.colors.text }]}>
                  <Text style={[styles.bulletLabel, { color: b.accent }]}>
                    {b.label}
                  </Text>
                  {'  '}
                  {b.text}
                </Text>
              </View>
            </RiseRow>
          ))}
        </View>
      ) : null}

      {summary.footer ? (
        <RiseRow delay={260 + summary.bullets.length * 80}>
          <Text style={[styles.footer, { color: theme.colors.textMuted }]}>
            {summary.footer}
          </Text>
        </RiseRow>
      ) : null}
    </View>
  )
}

interface Summary {
  headline: string
  accent: string
  bullets: Array<{
    label: string
    text: string
    icon:
      | 'trending-up'
      | 'event-busy'
      | 'pie-chart'
      | 'whatshot'
      | 'check-circle'
    accent: string
  }>
  footer?: string
}

function buildSummary(
  state: HeroState,
  palette: ReturnType<typeof buildProximosPalette>,
): Summary {
  const { hikes, signals } = state.alerts
  const total = hikes.length + signals.length

  // No alerts: positive banner
  if (total === 0) {
    if (state.isEmpty) {
      return {
        headline: 'Sin fijos cargados todavía.',
        accent: palette.success,
        bullets: [],
        footer:
          'Una vez los configures, vamos a avisarte si suben de precio o si se acumulan.',
      }
    }
    return {
      headline: 'Tus fijos están estables esta semana.',
      accent: palette.success,
      bullets: [],
      footer:
        'Sin aumentos detectados y ningún cluster de vencimientos. Te avisamos si algo cambia.',
    }
  }

  // Build headline from counts
  const parts: string[] = []
  if (hikes.length > 0) {
    parts.push(
      `${hikes.length} ${hikes.length === 1 ? 'fijo subió de precio' : 'fijos subieron de precio'}`,
    )
  }
  const negativeSignals = signals.filter((s) => s.kind !== 'streak')
  if (negativeSignals.length > 0) {
    parts.push(
      `${negativeSignals.length} ${negativeSignals.length === 1 ? 'señal' : 'señales'} de contexto`,
    )
  }
  const positiveSignals = signals.filter((s) => s.kind === 'streak')

  let headline = ''
  if (positiveSignals.length > 0 && parts.length === 0) {
    headline = positiveSignals[0].title + '.'
  } else if (parts.length === 1) {
    headline = `Esta semana: ${parts[0]}.`
  } else if (parts.length > 1) {
    headline = `Esta semana: ${parts[0]} y ${parts[1]}.`
  } else {
    headline = 'Hay avisos para revisar.'
  }

  // Accent: si hay urgencia alta o múltiples hikes → strong; si solo
  // positivo → success; default → urgency neutral.
  const hasHighUrgency =
    signals.some((s) => s.urgency === 'alta') || hikes.length >= 2
  const accent = positiveSignals.length === total
    ? palette.success
    : hasHighUrgency
    ? palette.urgencyStrong
    : palette.urgency

  // Bullets — hikes first, then negative signals, then positive
  const bullets: Summary['bullets'] = []
  for (const h of hikes) {
    bullets.push({
      label: `+${h.deltaPct}%`,
      text: `${h.name} pasó de ${formatMoney(h.previousPrice)} a ${formatMoney(h.currentPrice)}.`,
      icon: 'trending-up',
      accent: palette.urgency,
    })
  }
  for (const s of negativeSignals) {
    bullets.push({
      label:
        s.kind === 'stress-week'
          ? 'CLUSTER'
          : s.kind === 'fijos-ratio'
          ? 'RATIO'
          : 'CREEP',
      text: s.body,
      icon: getSignalIcon(s.kind),
      accent: s.urgency === 'alta' ? palette.urgencyStrong : palette.urgency,
    })
  }
  for (const s of positiveSignals) {
    bullets.push({
      label: 'LOGRO',
      text: s.body,
      icon: 'whatshot',
      accent: palette.success,
    })
  }

  return { headline, accent, bullets }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  headerCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  headline: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 28,
    marginBottom: 14,
  },
  bullets: {
    gap: 8,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  footer: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    marginTop: 4,
    fontStyle: 'italic',
  },
})
