import { StyleSheet, Text, View } from 'react-native'
import { AmountCard } from '@/components/home/amount-card'
import { RiseView } from '@/components/home/animated/rise-view'
import { MonthDayPicker } from '@/components/ui/month-day-picker'
import { parsePrice } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface StepIncomeProps {
  monthlyIncomeRaw: string
  salaryPaymentDay: number
  onRequestNumpad: () => void
  onChangeSalaryDay: (value: number) => void
  /** True while the InAppNumpad is open targeting this card.
   *  Drives the AmountCard's focus border animation. */
  isNumpadActive?: boolean
  /** Callback ref for the AmountCard wrapper. Parent uses it to
   *  measure the card and scroll it into view when the numpad opens. */
  amountCardRef?: (node: View | null) => void
}

export function StepIncome({
  monthlyIncomeRaw,
  salaryPaymentDay,
  onRequestNumpad,
  onChangeSalaryDay,
  isNumpadActive = false,
  amountCardRef,
}: StepIncomeProps) {
  const { theme } = useAppTheme()
  const parsed = parsePrice(monthlyIncomeRaw)
  const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0

  return (
    <View style={styles.stack}>
      <RiseView>
        <Text style={[styles.title, { color: theme.colors.text }]}>Tu sueldo base</Text>
        <Text style={[styles.subcopy, { color: theme.colors.textMuted }]}>
          Lo usamos para calcular tu presupuesto del día.
        </Text>
      </RiseView>

      <RiseView delay={80}>
        <View ref={amountCardRef}>
          <AmountCard
            amount={amount}
            isActive={isNumpadActive}
            onPress={onRequestNumpad}
            label="Sueldo mensual"
          />
        </View>
      </RiseView>

      <RiseView delay={140}>
        <Text style={[styles.eyebrow, styles.dayEyebrow, { color: theme.colors.textMuted }]}>
          DÍA DE COBRO
        </Text>
        <MonthDayPicker
          value={salaryPaymentDay}
          onChange={onChangeSalaryDay}
        />
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
          Siempre puedes editarlo desde Ajustes.
        </Text>
      </RiseView>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  subcopy: { fontSize: 13, marginTop: 4 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  dayEyebrow: { marginBottom: 8 },
  hint: { marginTop: 10, fontSize: 12 },
})
