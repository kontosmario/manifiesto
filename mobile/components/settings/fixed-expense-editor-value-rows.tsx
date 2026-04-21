import { StyleSheet, View } from 'react-native'
import { AppButton } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import type { FixedExpenseKind } from '@/features/fixed-expenses/fixed-expense-types'
import { formatPriceInputValue, normalizePriceInput } from '@/utils/money'

interface FixedExpenseAmountRowProps {
  amount: string
  isAmountFocused: boolean
  kind: FixedExpenseKind
  nextDueOn: string
  onAmountChange: (value: string) => void
  onAmountFocusChange: (focused: boolean) => void
  onNextDueOnChange: (value: string) => void
}

export function FixedExpenseAmountRow({
  amount,
  isAmountFocused,
  kind,
  nextDueOn,
  onAmountChange,
  onAmountFocusChange,
  onNextDueOnChange,
}: FixedExpenseAmountRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <TextField
          keyboardType="decimal-pad"
          label={kind === 'debt' ? 'Pago planificado' : 'Monto'}
          onBlur={() => onAmountFocusChange(false)}
          onChangeText={(value) => onAmountChange(normalizePriceInput(value))}
          onFocus={() => onAmountFocusChange(true)}
          placeholder="$ 0"
          value={formatPriceInputValue(amount, isAmountFocused)}
        />
      </View>
      <View style={styles.field}>
        <TextField
          autoCapitalize="none"
          autoCorrect={false}
          helper="Formato: DD/MM/AAAA"
          label="Próximo vencimiento"
          maxLength={10}
          onChangeText={onNextDueOnChange}
          placeholder="25/04/2026"
          value={nextDueOn}
        />
      </View>
    </View>
  )
}

interface FixedExpenseInstallmentRowProps {
  installmentsPaid: string
  installmentsTotal: string
  onInstallmentsPaidChange: (value: string) => void
  onInstallmentsTotalChange: (value: string) => void
}

export function FixedExpenseInstallmentRow({
  installmentsPaid,
  installmentsTotal,
  onInstallmentsPaidChange,
  onInstallmentsTotalChange,
}: FixedExpenseInstallmentRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <TextField
          keyboardType="number-pad"
          label="Cuotas totales"
          onChangeText={onInstallmentsTotalChange}
          placeholder="12"
          value={installmentsTotal}
        />
      </View>
      <View style={styles.field}>
        <TextField
          keyboardType="number-pad"
          label="Cuotas ya pagadas"
          onChangeText={onInstallmentsPaidChange}
          placeholder="0"
          value={installmentsPaid}
        />
      </View>
    </View>
  )
}

interface FixedExpenseDebtRowProps {
  isRemainingBalanceFocused: boolean
  lenderName: string
  remainingBalance: string
  onLenderNameChange: (value: string) => void
  onRemainingBalanceChange: (value: string) => void
  onRemainingBalanceFocusChange: (focused: boolean) => void
}

export function FixedExpenseDebtRow({
  isRemainingBalanceFocused,
  lenderName,
  remainingBalance,
  onLenderNameChange,
  onRemainingBalanceChange,
  onRemainingBalanceFocusChange,
}: FixedExpenseDebtRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <TextField
          keyboardType="decimal-pad"
          label="Saldo pendiente"
          onBlur={() => onRemainingBalanceFocusChange(false)}
          onChangeText={(value) => onRemainingBalanceChange(normalizePriceInput(value))}
          onFocus={() => onRemainingBalanceFocusChange(true)}
          placeholder="$ 0"
          value={formatPriceInputValue(remainingBalance, isRemainingBalanceFocused)}
        />
      </View>
      <View style={styles.field}>
        <TextField
          autoCapitalize="words"
          autoCorrect={false}
          label="Acreedor"
          maxLength={60}
          onChangeText={onLenderNameChange}
          placeholder="Ej: Banco / Familiar"
          value={lenderName}
        />
      </View>
    </View>
  )
}

interface FixedExpenseActionsProps {
  canSubmit: boolean
  isBusy: boolean
  onClose?: () => void
  onSubmit: () => Promise<void> | void
  showCancel?: boolean
  submitLabel: string
}

export function FixedExpenseActions({
  canSubmit,
  isBusy,
  onClose,
  onSubmit,
  showCancel = true,
  submitLabel,
}: FixedExpenseActionsProps) {
  return (
    <View style={styles.actions}>
      <AppButton disabled={!canSubmit} label={submitLabel} loading={isBusy} onPress={onSubmit} />
      {showCancel && onClose ? (
        <AppButton label="Cancelar" onPress={onClose} size="compact" variant="ghost" />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  field: {
    flex: 1,
  },
  actions: {
    gap: 10,
  },
})
