import { MaterialIcons } from '@expo/vector-icons'
import { currencyFormatter } from '@/utils/money'
import { type DerivedFixedExpense, type FixedExpenseCycleSummary } from '@/features/fixed-expenses/commitment-utils'
import { type FixedExpenseKind } from '@/features/fixed-expenses/fixed-expense-types'

export type FixedExpensesSectionKey = 'upcoming' | 'recurring' | 'installment' | 'debt'

export interface FixedExpensesSectionDescriptor {
  addLabel: string
  addSubmitLabel: string
  addTitle: string
  defaultKind?: FixedExpenseKind
  emptyIcon: keyof typeof MaterialIcons.glyphMap
  emptySubtitle: string
  emptyTitle: string
  items: DerivedFixedExpense[]
  key: FixedExpensesSectionKey
  label: string
  summary: string
  title: string
}

export interface FixedExpenseAddConfig {
  addLabel: string
  addSubmitLabel: string
  addTitle: string
  defaultKind?: FixedExpenseKind
  key: FixedExpensesSectionKey
  label: string
  title: string
}

export function resolveFixedExpensesSectionKey(
  value?: string | null,
): FixedExpensesSectionKey {
  switch (value) {
    case 'recurring':
    case 'installment':
    case 'debt':
      return value
    default:
      return 'upcoming'
  }
}

export function getFixedExpenseAddConfig(
  sectionKey: FixedExpensesSectionKey,
): FixedExpenseAddConfig {
  switch (sectionKey) {
    case 'recurring':
      return {
        addLabel: 'Agregar fijo',
        addSubmitLabel: 'Guardar gasto fijo',
        addTitle: 'Nuevo gasto fijo',
        defaultKind: 'recurring',
        key: 'recurring',
        label: 'Fijos',
        title: 'Recurrentes',
      }
    case 'installment':
      return {
        addLabel: 'Agregar cuota',
        addSubmitLabel: 'Guardar cuota',
        addTitle: 'Nueva cuota',
        defaultKind: 'installment',
        key: 'installment',
        label: 'Cuotas',
        title: 'Cuotas',
      }
    case 'debt':
      return {
        addLabel: 'Agregar deuda',
        addSubmitLabel: 'Guardar deuda',
        addTitle: 'Nueva deuda',
        defaultKind: 'debt',
        key: 'debt',
        label: 'Deudas',
        title: 'Deudas',
      }
    default:
      return {
        addLabel: 'Agregar gasto fijo',
        addSubmitLabel: 'Guardar gasto fijo',
        addTitle: 'Nuevo gasto fijo',
        key: 'upcoming',
        label: 'Ciclo',
        title: 'Este ciclo',
      }
  }
}

function formatCount(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`
}

function getScheduledTotal(items: DerivedFixedExpense[]) {
  return items.reduce((sum, item) => sum + item.scheduledAmount, 0)
}

function getRemainingInstallments(items: DerivedFixedExpense[]) {
  return items.reduce((sum, item) => sum + (item.remainingInstallments ?? 0), 0)
}

function getRemainingBalance(items: DerivedFixedExpense[]) {
  return items.reduce((sum, item) => sum + (item.remaining_balance ?? 0), 0)
}

export function buildFixedExpensesSections(
  commitmentSummary: FixedExpenseCycleSummary,
): FixedExpensesSectionDescriptor[] {
  const upcomingItems = commitmentSummary.upcomingItems
  const recurringItems = commitmentSummary.items.filter(
    (item) => item.kind === 'recurring' || item.kind === 'periodic',
  )
  const installmentItems = commitmentSummary.items.filter((item) => item.kind === 'installment')
  const debtItems = commitmentSummary.items.filter((item) => item.kind === 'debt')
  const upcomingConfig = getFixedExpenseAddConfig('upcoming')
  const recurringConfig = getFixedExpenseAddConfig('recurring')
  const installmentConfig = getFixedExpenseAddConfig('installment')
  const debtConfig = getFixedExpenseAddConfig('debt')

  return [
    {
      key: upcomingConfig.key,
      label: upcomingConfig.label,
      title: upcomingConfig.title,
      addLabel: upcomingConfig.addLabel,
      addTitle: upcomingConfig.addTitle,
      addSubmitLabel: upcomingConfig.addSubmitLabel,
      summary:
        upcomingItems.length > 0
          ? `${formatCount(upcomingItems.length, 'caso activo', 'casos activos')} · ${currencyFormatter.format(commitmentSummary.reservedTotal)} pendientes`
          : 'Sin pendientes por cubrir en este mes.',
      items: upcomingItems,
      emptyTitle: 'Mes en orden',
      emptySubtitle: 'No hay gastos fijos urgentes o pendientes para este mes.',
      emptyIcon: 'event-available',
    },
    {
      key: recurringConfig.key,
      label: recurringConfig.label,
      title: recurringConfig.title,
      addLabel: recurringConfig.addLabel,
      addTitle: recurringConfig.addTitle,
      addSubmitLabel: recurringConfig.addSubmitLabel,
      defaultKind: recurringConfig.defaultKind,
      summary:
        recurringItems.length > 0
          ? `${formatCount(recurringItems.length, 'gasto fijo', 'gastos fijos')} · ${currencyFormatter.format(getScheduledTotal(recurringItems))} programados`
          : 'Todavía no cargaste gastos fijos recurrentes.',
      items: recurringItems,
      emptyTitle: 'Sin recurrentes',
      emptySubtitle: 'Suma alquiler, servicios o pagos periódicos para ver la base estable del hogar.',
      emptyIcon: 'repeat',
    },
    {
      key: installmentConfig.key,
      label: installmentConfig.label,
      title: installmentConfig.title,
      addLabel: installmentConfig.addLabel,
      addTitle: installmentConfig.addTitle,
      addSubmitLabel: installmentConfig.addSubmitLabel,
      defaultKind: installmentConfig.defaultKind,
      summary:
        installmentItems.length > 0
          ? `${formatCount(installmentItems.length, 'plan activo', 'planes activos')} · ${getRemainingInstallments(installmentItems)} cuotas restantes`
          : 'No hay planes en cuotas activos.',
      items: installmentItems,
      emptyTitle: 'Sin cuotas',
      emptySubtitle: 'Registra compras financiadas para seguir cuánto falta pagar.',
      emptyIcon: 'payments',
    },
    {
      key: debtConfig.key,
      label: debtConfig.label,
      title: debtConfig.title,
      addLabel: debtConfig.addLabel,
      addTitle: debtConfig.addTitle,
      addSubmitLabel: debtConfig.addSubmitLabel,
      defaultKind: debtConfig.defaultKind,
      summary:
        debtItems.length > 0
          ? `${formatCount(debtItems.length, 'deuda activa', 'deudas activas')} · ${currencyFormatter.format(getRemainingBalance(debtItems))} de saldo vivo`
          : 'No hay deudas cargadas.',
      items: debtItems,
      emptyTitle: 'Sin deudas',
      emptySubtitle: 'Cuando aparezca una deuda nueva, registrala aquí para seguir saldo y pago planificado.',
      emptyIcon: 'account-balance-wallet',
    },
  ]
}
