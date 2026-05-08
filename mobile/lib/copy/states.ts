/**
 * Canonical copy templates for UI states. Components (`<EmptyState>`,
 * `<LoadingBlock>`, `<ErrorState>`) accept keys from these maps. Hardcoded
 * state strings are banned by CI.
 */

interface EmptyStateCopy {
  title: string
  description: string
  action?: string
}

export const emptyStates = {
  expensesThisCycle: {
    title: 'Todavía no hay gastos este mes',
    description: 'Cuando registres tu primer gasto, vas a ver aquí cómo va tu presupuesto.',
    action: 'Registrar primer gasto',
  },
  debt: {
    title: 'Registra deudas',
    description: 'Para ver qué debes y cuándo pagas, suma una deuda aquí.',
    action: 'Sumar deuda',
  },
  fixedRecurring: {
    title: 'Sin recurrentes',
    description: 'Suma alquiler, servicios o pagos periódicos para ver la base estable del hogar.',
    action: 'Sumar gasto fijo',
  },
  fixedInstallments: {
    title: 'Sin cuotas',
    description: 'Registra compras financiadas para seguir cuánto falta pagar.',
    action: 'Sumar cuota',
  },
  cycleInOrder: {
    title: 'Ciclo en orden',
    description: 'No hay gastos fijos urgentes o pendientes para este ciclo.',
  },
  categories: {
    title: 'Todavía no hay categorías',
    description: 'Crea tu primera categoría para ordenar mejor el historial y el alta de movimientos.',
    action: 'Crear categoría',
  },
  notifications: {
    title: 'Todo tranquilo',
    description: 'Cuando haya novedades de tu familia, las vas a ver aquí.',
  },
  noData: {
    title: 'Sin datos', // @copy-allow — canonical definition in states.ts
    description: 'Todavía no hay información disponible para este período.',
  },
} as const satisfies Record<string, EmptyStateCopy>

export type EmptyStateKey = keyof typeof emptyStates

export const loadingLabels = {
  expenses:      'Cargando tus gastos',
  fixedExpenses: 'Cargando gastos fijos',
  control:       'Leyendo tu ciclo',
  home:          'Leyendo tu hogar',
  categories:    'Cargando categorías',
  notifications: 'Cargando novedades',
  settings:      'Cargando tus preferencias',
} as const

export const errorMessages = {
  network: 'No pudimos conectarnos. Revisá tu conexión.',
  server:  'Algo falló del lado del servidor. Prueba de nuevo.',
  data:    'Los datos llegaron incompletos. Actualiza para reintentar.',
  auth:    'Tu sesión venció. Volvé a iniciar sesión.',
} as const
