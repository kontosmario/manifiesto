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
}

/**
 * Uniform placeholder rendered in place of Control cards that can't
 * produce meaningful insights yet. Fires when `diaActual < minDias`:
 * trend/projection cards need several closed days of spend data to
 * avoid noise, so we hold them back until the floor is reached.
 */
export function ControlV2Placeholder({
  title,
  diaActual,
  minDias,
  hint,
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
      accessibilityLabel={`${title}: esperando más datos del ciclo`}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          {title.toUpperCase()}
        </Text>
        <View style={[styles.pill, { borderColor: theme.colors.line }]}>
          <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>
            Día {diaActual} de {minDias}
          </Text>
        </View>
      </View>

      <Text style={[styles.title, { color: theme.colors.text }]}>
        Esperando más datos
      </Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        {diasRestantes === 0
          ? 'Calculando con los días registrados…'
          : `Faltan ${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'} para tener suficiente historial.`}
      </Text>
      {hint ? (
        <Text style={[styles.hint, { color: theme.colors.textSoft }]}>{hint}</Text>
      ) : null}

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
