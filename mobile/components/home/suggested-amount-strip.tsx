import { ScrollView, StyleSheet } from 'react-native'
import { Chip } from '@/components/ui/chip'
import { currencyFormatter } from '@/utils/money'

interface SuggestedAmountStripProps {
  amounts: number[]
  currentAmount: number
  onSelect: (value: number) => void
}

export function SuggestedAmountStrip({
  amounts,
  currentAmount,
  onSelect,
}: SuggestedAmountStripProps) {
  const rounded = Math.round(currentAmount)

  return (
    <ScrollView
      contentContainerStyle={styles.row}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {amounts.map((amount) => (
        <Chip
          key={amount}
          compact
          isActive={rounded === amount}
          label={currencyFormatter.format(amount)}
          onPress={() => onSelect(amount)}
        />
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingHorizontal: 2,
  },
})
