import { StyleSheet, Text, View } from 'react-native'
import { AnimatedAmount } from '@/components/ui/animated-amount'
import { AppButton } from '@/components/ui/button'
import { terms } from '@/lib/copy/glossary'
import { brand, radii } from '@/theme/palette'
import { typography } from '@/theme/typography'

interface HomeHeroCardProps {
  availableToday: number
  projectedMargin: number
  onPressAddExpense: () => void
}

export function HomeHeroCard({
  availableToday,
  projectedMargin,
  onPressAddExpense,
}: HomeHeroCardProps) {
  const marginSign = projectedMargin >= 0 ? '+' : ''
  const marginText = `${marginSign}$${Math.abs(Math.round(projectedMargin)).toLocaleString('es-AR')}`

  return (
    <View style={styles.card}>
      <Text style={[typography.eyebrow, styles.eyebrow]}>Disponible hoy</Text>
      <AnimatedAmount
        value={availableToday}
        variant="hero"
        hapticOnChange
        color="#FFFFFF"
        style={styles.value}
      />
      <Text style={[typography.bodySmall, styles.context]}>
        {terms.margin} del mes{' '}
        <Text style={[styles.contextEmphasis, { color: brand.bright }]}>{marginText}</Text>
      </Text>
      <View style={styles.ctaRow}>
        <AppButton
          variant="accent"
          label="＋ Registrar gasto"
          size="compact"
          fullWidth={false}
          onPress={onPressAddExpense}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: brand.deep,
    borderRadius: radii['2xl'],
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: brand.deep,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 4,
  },
  eyebrow: {
    color: brand.bright,
  },
  value: {
    marginTop: 4,
    color: '#FFFFFF',
  },
  context: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.7)',
  },
  contextEmphasis: {
    fontWeight: '700',
  },
  ctaRow: {
    marginTop: 16,
  },
})
