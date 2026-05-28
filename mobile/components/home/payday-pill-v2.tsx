import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { useAppTheme } from '@/theme/theme-provider'

interface PaydayPillV2Props {
  daysUntilPayday: number | null
  isPending?: boolean
  onPress?: () => void
}

/**
 * Payday status chip.
 *  - `isPending=true` — el día de cobro llegó y el usuario todavía no
 *    confirmó. Chip interactivo con énfasis peach + dot pulsante.
 *  - `daysUntilPayday === 0` aunque ya esté confirmado → también es
 *    interactivo: el usuario está sobre el día de cobro y podría
 *    querer reabrir el sheet para ajustar el monto recibido si
 *    cobró distinto a lo recurrente.
 *  - Resto (faltan días o ya pasó sin pendiente) → read-only.
 */
export function PaydayPillV2({ daysUntilPayday, isPending = false, onPress }: PaydayPillV2Props) {
  const { theme } = useAppTheme()
  if (daysUntilPayday == null) return null
  const label = isPending
    ? '¿Ya cobraste?'
    : daysUntilPayday === 0
      ? 'Sueldo hoy'
      : daysUntilPayday === 1
        ? 'Sueldo mañana'
        : `Sueldo en ${daysUntilPayday} días`

  // The pill emphasizes the action when there's something to do:
  // a real "pending" state OR the literal payday day. In both cases
  // we want the user to feel invited to tap.
  const isPaydayDay = daysUntilPayday === 0
  const isInteractive = isPending || isPaydayDay
  const showsAccent = isInteractive

  const pillStyle = [
    styles.pill,
    showsAccent
      ? {
          backgroundColor: 'rgba(242,167,140,0.14)',
          borderColor: 'rgba(242,167,140,0.45)',
        }
      : {
          // Dark mode: match the Home cards' muted surface
          // (surfaceMuted) so the read-only "sueldo en X días" chip
          // joins the same calm green family on the near-black canvas.
          // Light mode keeps creamCard. The accent (payday-pending)
          // state above keeps its peach tint — it's an intentional
          // call-to-action, not a neutral surface.
          backgroundColor: theme.isDark
            ? theme.colors.surfaceMuted
            : theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
  ]
  // V1 accent label: dark coral on light bg, soft coral on dark bg.
  // Both clear AA on the accent-300@0.14 chip surface in their mode.
  const accentLabel = theme.isDark ? '#F8D1C3' : '#B84014'
  const labelColor = showsAccent ? accentLabel : theme.colors.text
  const dotColor = showsAccent ? theme.colors.peach : theme.colors.textMuted

  const content = (
    <>
      {showsAccent ? (
        <BreatheDot size={6} color={dotColor} />
      ) : (
        <View style={[styles.staticDot, { backgroundColor: dotColor }]} />
      )}
      <Text style={[styles.label, { color: labelColor, fontWeight: showsAccent ? '700' : '600' }]}>
        {label}
      </Text>
      {/*
        Static chevron at the end whenever the pill is interactive —
        signals "tap me" before the user has to discover via press.
        Only rendered for the accent (interactive) variants so the
        read-only "Sueldo en N días" stays visually clean.
      */}
      {isInteractive ? (
        <MaterialIcons name="chevron-right" size={14} color={labelColor} />
      ) : null}
    </>
  )

  if (isInteractive && onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          pillStyle,
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={
          isPending
            ? 'Abre el diálogo para confirmar que cobraste'
            : 'Abre el diálogo para confirmar el monto que recibiste'
        }
      >
        {content}
      </Pressable>
    )
  }

  return (
    <View
      style={pillStyle}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {content}
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: 999,
  },
  label: { fontSize: 11, fontWeight: '600' },
  staticDot: { width: 6, height: 6, borderRadius: 3 },
})
