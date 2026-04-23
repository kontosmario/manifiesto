import { Pressable, StyleSheet, Text, View } from 'react-native'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { useAppTheme } from '@/theme/theme-provider'

interface PaydayPillV2Props {
  daysUntilPayday: number | null
  isPending?: boolean
  onPress?: () => void
}

export function PaydayPillV2({ daysUntilPayday, isPending = false, onPress }: PaydayPillV2Props) {
  const { theme } = useAppTheme()
  if (daysUntilPayday == null) return null
  const label = isPending
    ? 'Confirmar cobro'
    : daysUntilPayday === 0
      ? 'Cobro hoy'
      : `${daysUntilPayday} días al cobro`

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <BreatheDot size={6} color={theme.colors.peach} />
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
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
})
