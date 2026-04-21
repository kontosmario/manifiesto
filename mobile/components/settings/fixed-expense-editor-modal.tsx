import { ModalCard } from '@/components/ui/modal-card'
import { FixedExpenseForm } from '@/components/fixed-expenses/fixed-expense-form'
import type { Category } from '@/features/categories/use-categories'
import { type FixedExpenseEditorValues } from '@/features/fixed-expenses/fixed-expense-editor-model'

interface FixedExpenseEditorModalProps {
  canSubmit: boolean
  categories: Category[]
  isAmountFocused: boolean
  isBusy?: boolean
  isRemainingBalanceFocused: boolean
  onAmountFocusChange: (focused: boolean) => void
  onClose: () => void
  onFieldChange: <K extends keyof FixedExpenseEditorValues>(
    key: K,
    value: FixedExpenseEditorValues[K],
  ) => void
  onRemainingBalanceFocusChange: (focused: boolean) => void
  onSubmit: () => Promise<void> | void
  showStatusSection?: boolean
  submitLabel: string
  title: string
  values: FixedExpenseEditorValues
  visible: boolean
}

export function FixedExpenseEditorModal({
  canSubmit,
  categories,
  isAmountFocused,
  isBusy = false,
  isRemainingBalanceFocused,
  onAmountFocusChange,
  onClose,
  onFieldChange,
  onRemainingBalanceFocusChange,
  onSubmit,
  showStatusSection = false,
  submitLabel,
  title,
  values,
  visible,
}: FixedExpenseEditorModalProps) {
  return (
    <ModalCard
      visible={visible}
      title={title}
      subtitle="Definí gastos fijos que impactan el ciclo: recurrentes, periódicos, cuotas o deuda."
      onClose={onClose}
    >
      <FixedExpenseForm
        canSubmit={canSubmit}
        categories={categories}
        isAmountFocused={isAmountFocused}
        isBusy={isBusy}
        isRemainingBalanceFocused={isRemainingBalanceFocused}
        onAmountFocusChange={onAmountFocusChange}
        onCancel={onClose}
        onFieldChange={onFieldChange}
        onRemainingBalanceFocusChange={onRemainingBalanceFocusChange}
        onSubmit={onSubmit}
        showCancelAction
        showStatusSection={showStatusSection}
        submitLabel={submitLabel}
        values={values}
      />
    </ModalCard>
  )
}
