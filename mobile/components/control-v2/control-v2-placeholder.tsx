import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

interface ControlV2PlaceholderProps {
  /** Short label of the card that's waiting for data. */
  title: string
  /** Current position within the cycle (1-based). */
  diaActual: number
  /** Days needed before the card unlocks. */
  minDias: number
  /** Optional one-line description of what the card will show later. */
  hint?: string
  /**
   * Enough cycle days have passed but there's no actual spending data
   * yet (e.g. a new account that joined mid-cycle). Switches from the
   * "faltan N días" countdown — which would be misleading, since the
   * days already elapsed — to a "cargá tu primer gasto" framing, and
   * drops the day-progress pill + bar (a count of elapsed days isn't
   * what's missing; real spend is).
   */
  noData?: boolean
  /**
   * Override the auto headline. Use when a card's activation condition
   * doesn't fit either the day-countdown or the "log one expense"
   * framing (e.g. "alcanza" needs a WEEK of closed days WITH spending,
   * so a single expense never activates it).
   */
  headline?: string
  /** Override the auto subtitle (pairs with `headline`). */
  message?: string
}

/**
 * Uniform placeholder rendered in place of Control cards that can't
 * produce meaningful insights yet. Two cases:
 *   · `noData=false` (default): fewer than `minDias` cycle days have
 *     closed — hold the card back until the floor is reached, showing a
 *     "Día X de N" countdown.
 *   · `noData=true`: enough days passed but no real spend to analyze —
 *     show a "log your first expense" framing instead of a countdown.
 * `headline`/`message` override the auto copy for cards whose real
 * condition is neither (e.g. "alcanza").
 */
export function ControlV2Placeholder({
  title,
  diaActual,
  minDias,
  hint,
  noData = false,
  headline,
  message,
}: ControlV2PlaceholderProps) {
  const { theme } = useAppTheme()
  const diasRestantes = Math.max(0, minDias - diaActual)
  const progressPct = Math.min(
    100,
    Math.max(0, Math.round((diaActual / Math.max(1, minDias)) * 100)),
  )

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={
        noData
          ? `${title}: sin gastos todavía`
          : `${title}: esperando más datos del ciclo`
      }
      style={[
        styles.card,
        {
          backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          {title.toUpperCase()}
        </Text>
        {noData ? null : (
          <View style={[styles.pill, { borderColor: theme.colors.line }]}>
            <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>
              Día {diaActual} de {minDias}
            </Text>
          </View>
        )}
      </View>

      <Text style={[styles.title, { color: theme.colors.text }]}>
        {headline ?? (noData ? 'Todavía no hay gastos' : 'Pronto disponible')}
      </Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        {message ??
          (noData
            ? 'Registra un gasto y esta tarjeta se activa.'
            : diasRestantes === 0
              ? 'Ya casi: registra un gasto para activarla.'
              : `Se activa el día ${minDias} del ciclo, con gastos registrados. ${diasRestantes === 1 ? 'Falta' : 'Faltan'} ${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'}.`)}
      </Text>
      {hint ? (
        <Text style={[styles.hint, { color: theme.colors.textSoft }]}>{hint}</Text>
      ) : null}

      {noData ? null : (
        <View style={[styles.track, { backgroundColor: theme.colors.line }]}>
          <View
            style={[
              styles.fill,
              {
                width: `${progressPct}%`,
                backgroundColor: theme.colors.text,
              },
            ]}
          />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginTop: 4 },
  subtitle: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  hint: { fontSize: 11, fontWeight: '500', lineHeight: 16, marginTop: 2 },
  track: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 8,
  },
  fill: { height: '100%', borderRadius: 999 },
})
