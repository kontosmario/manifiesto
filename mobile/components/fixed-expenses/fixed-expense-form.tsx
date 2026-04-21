import { StyleSheet } from 'react-native'
import {
  FixedExpenseActions,
  FixedExpenseAmountRow,
  FixedExpenseCategorySection,
  FixedExpenseDebtRow,
  FixedExpenseFrequencySection,
  FixedExpenseInstallmentRow,
  FixedExpenseKindSection,
  FixedExpenseStatusSection,
} from '@/components/settings/fixed-expense-editor-sections'
import { TextField } from '@/components/ui/text-field'
import type { Category } from '@/features/categories/use-categories'
import { type FixedExpenseEditorValues } from '@/features/fixed-expenses/fixed-expense-editor-model'

interface FixedExpenseFormProps {
  canSubmit: boolean
  categories: Category[]
  isAmountFocused: boolean
  isBusy?: boolean
  isRemainingBalanceFocused: boolean
  onAmountFocusChange: (focused: boolean) => void
  onCancel?: () => void
  onFieldChange: <K extends keyof FixedExpenseEditorValues>(
    key: K,
    value: FixedExpenseEditorValues[K],
  ) => void
  onRemainingBalanceFocusChange: (focused: boolean) => void
  onSubmit: () => Promise<void> | void
  showCancelAction?: boolean
  showStatusSection?: boolean
  submitLabel: string
  values: FixedExpenseEditorValues
}

export function FixedExpenseForm({
  canSubmit,
  categories,
  isAmountFocused,
  isBusy = false,
  isRemainingBalanceFocused,
  onAmountFocusChange,
  onCancel,
  onFieldChange,
  onRemainingBalanceFocusChange,
  onSubmit,
  showCancelAction = false,
  showStatusSection = false,
  submitLabel,
  values,
}: FixedExpenseFormProps) {
  const {
    amount,
    categoryId,
    endsOn,
    frequency,
    installmentsPaid,
    installmentsTotal,
    kind,
    lenderName,
    name,
    nextDueOn,
    notes,
    remainingBalance,
    status,
  } = values

  return (
    <>
      <FixedExpenseKindSection kind={kind} onChange={(value) => onFieldChange('kind', value)} />

      <TextField
        autoCapitalize="sentences"
        autoCorrect={false}
        label="Nombre"
        maxLength={60}
        onChangeText={(value) => onFieldChange('name', value)}
        placeholder={kind === 'debt' ? 'Ej: Préstamo familiar' : 'Ej: Alquiler'}
        returnKeyType="done"
        value={name}
      />

      <FixedExpenseCategorySection
        categories={categories}
        categoryId={categoryId}
        onChange={(value) => onFieldChange('categoryId', value)}
      />

      <FixedExpenseAmountRow
        amount={amount}
        isAmountFocused={isAmountFocused}
        kind={kind}
        nextDueOn={nextDueOn}
        onAmountChange={(value) => onFieldChange('amount', value)}
        onAmountFocusChange={onAmountFocusChange}
        onNextDueOnChange={(value) => onFieldChange('nextDueOn', value)}
      />

      <FixedExpenseFrequencySection
        frequency={frequency}
        onChange={(value) => onFieldChange('frequency', value)}
      />

      {kind === 'installment' ? (
        <FixedExpenseInstallmentRow
          installmentsPaid={installmentsPaid}
          installmentsTotal={installmentsTotal}
          onInstallmentsPaidChange={(value) => onFieldChange('installmentsPaid', value)}
          onInstallmentsTotalChange={(value) => onFieldChange('installmentsTotal', value)}
        />
      ) : null}

      {kind === 'debt' ? (
        <FixedExpenseDebtRow
          isRemainingBalanceFocused={isRemainingBalanceFocused}
          lenderName={lenderName}
          remainingBalance={remainingBalance}
          onLenderNameChange={(value) => onFieldChange('lenderName', value)}
          onRemainingBalanceChange={(value) => onFieldChange('remainingBalance', value)}
          onRemainingBalanceFocusChange={onRemainingBalanceFocusChange}
        />
      ) : null}

      {kind === 'recurring' || kind === 'periodic' ? (
        <TextField
          autoCapitalize="none"
          autoCorrect={false}
          helper="Opcional. Úsalo si este gasto fijo no dura para siempre."
          label="Fecha de fin"
          maxLength={10}
          onChangeText={(value) => onFieldChange('endsOn', value)}
          placeholder="31/12/2026"
          value={endsOn}
        />
      ) : null}

      {showStatusSection ? (
        <FixedExpenseStatusSection
          status={status}
          onChange={(value) => onFieldChange('status', value)}
        />
      ) : null}

      <TextField
        autoCapitalize="sentences"
        autoCorrect={false}
        helper="Opcional. Sirve para aclarar tarjeta, cuota, vencimiento o contexto."
        label="Notas"
        maxLength={140}
        multiline
        onChangeText={(value) => onFieldChange('notes', value)}
        placeholder="Ej: Resumen Visa hogar / se corta en diciembre"
        style={styles.notesField}
        value={notes}
      />

      <FixedExpenseActions
        canSubmit={canSubmit}
        isBusy={isBusy}
        onClose={onCancel}
        onSubmit={onSubmit}
        showCancel={showCancelAction}
        submitLabel={submitLabel}
      />
    </>
  )
}

const styles = StyleSheet.create({
  notesField: {
    minHeight: 96,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
})
