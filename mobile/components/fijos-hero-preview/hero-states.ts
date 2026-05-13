/**
 * Estados representativos del ciclo de Fijos para la preview live de
 * las 3 direcciones (Titular / Pasaje / Manifiesto). Cada estado modela
 * un momento clave que cualquier usuario va a encontrar:
 *
 *  inicio      día 2/30 — cero pagos, cero atrasos, todo por delante
 *  al_dia      día 15/30 — 50% pagado, on-pace, cero atrasos
 *  con_atraso  día 15/30 — 2 vencidos pesados + pendientes
 *  todo_pagado día 20/30 — 100% pagado, queda calendario
 *  sin_fijos   no hay fijos cargados (empty state)
 *  fin_ciclo   día 29/30 — todo pagado, 1 día al cobro
 */

export interface HeroState {
  id: string
  label: string
  description: string

  // Cycle geometry
  cycleLabel: string
  monthLong: string
  monthShort: string
  monthShortNext: string
  daysRemaining: number
  cycleDays: number
  todayDay: number
  cycleDayIndex: number

  // Money aggregates
  totalFijos: number
  montoPagado: number
  montoPendiente: number
  montoVencido: number
  montoPorPagarTotal: number // pendiente + vencido
  cantidadFijos: number
  cantidadPagados: number
  cantidadPendientes: number
  cantidadVencidos: number
  cantidadPorPagarTotal: number
  dineroLibre: number
  pctSueldo: number
  paidPct: number

  // Próximo item
  nextItem: { name: string; days: number; amount: number; dayOfWeek: string } | null

  // Special flags
  isEmpty?: boolean
  isAllPaid?: boolean
}

export const HERO_STATES: HeroState[] = [
  {
    id: 'inicio',
    label: 'Inicio',
    description: 'Día 2/30. Recién cobraste. Nada pagado, nada vencido, todo por delante.',
    cycleLabel: '5 abr → 5 may',
    monthLong: 'Abril',
    monthShort: 'ABR',
    monthShortNext: 'MAY',
    daysRemaining: 28,
    cycleDays: 30,
    todayDay: 6,
    cycleDayIndex: 2,
    totalFijos: 425_000,
    montoPagado: 0,
    montoPendiente: 425_000,
    montoVencido: 0,
    montoPorPagarTotal: 425_000,
    cantidadFijos: 10,
    cantidadPagados: 0,
    cantidadPendientes: 10,
    cantidadVencidos: 0,
    cantidadPorPagarTotal: 10,
    dineroLibre: 380_000,
    pctSueldo: 42,
    paidPct: 0,
    nextItem: { name: 'Alquiler', days: 3, amount: 145_000, dayOfWeek: 'lunes' },
  },
  {
    id: 'al_dia',
    label: 'Al día',
    description: 'Día 15/30. 50% del ciclo, 50% pagado. On-pace. Cero atrasos.',
    cycleLabel: '5 abr → 5 may',
    monthLong: 'Abril',
    monthShort: 'ABR',
    monthShortNext: 'MAY',
    daysRemaining: 15,
    cycleDays: 30,
    todayDay: 20,
    cycleDayIndex: 15,
    totalFijos: 425_000,
    montoPagado: 215_000,
    montoPendiente: 210_000,
    montoVencido: 0,
    montoPorPagarTotal: 210_000,
    cantidadFijos: 10,
    cantidadPagados: 5,
    cantidadPendientes: 5,
    cantidadVencidos: 0,
    cantidadPorPagarTotal: 5,
    dineroLibre: 380_000,
    pctSueldo: 42,
    paidPct: 51,
    nextItem: { name: 'Netflix', days: 3, amount: 12_500, dayOfWeek: 'viernes' },
  },
  {
    id: 'con_atraso',
    label: 'Con atraso',
    description: 'Día 15/30. Solo 30% pagado, dos fijos vencidos hace días. Urgencia.',
    cycleLabel: '5 abr → 5 may',
    monthLong: 'Abril',
    monthShort: 'ABR',
    monthShortNext: 'MAY',
    daysRemaining: 15,
    cycleDays: 30,
    todayDay: 20,
    cycleDayIndex: 15,
    totalFijos: 425_000,
    montoPagado: 125_000,
    montoPendiente: 260_000,
    montoVencido: 40_000,
    montoPorPagarTotal: 300_000,
    cantidadFijos: 10,
    cantidadPagados: 3,
    cantidadPendientes: 5,
    cantidadVencidos: 2,
    cantidadPorPagarTotal: 7,
    dineroLibre: 380_000,
    pctSueldo: 42,
    paidPct: 29,
    nextItem: { name: 'Cable', days: 0, amount: 18_500, dayOfWeek: 'hoy' },
  },
  {
    id: 'todo_pagado',
    label: 'Todo pagado',
    description: 'Día 20/30. Pagaste todos los fijos antes de tiempo. Pura tranquilidad.',
    cycleLabel: '5 abr → 5 may',
    monthLong: 'Abril',
    monthShort: 'ABR',
    monthShortNext: 'MAY',
    daysRemaining: 10,
    cycleDays: 30,
    todayDay: 25,
    cycleDayIndex: 20,
    totalFijos: 425_000,
    montoPagado: 425_000,
    montoPendiente: 0,
    montoVencido: 0,
    montoPorPagarTotal: 0,
    cantidadFijos: 10,
    cantidadPagados: 10,
    cantidadPendientes: 0,
    cantidadVencidos: 0,
    cantidadPorPagarTotal: 0,
    dineroLibre: 380_000,
    pctSueldo: 42,
    paidPct: 100,
    nextItem: null,
    isAllPaid: true,
  },
  {
    id: 'sin_fijos',
    label: 'Sin fijos',
    description: 'Empty state. El usuario no cargó fijos todavía.',
    cycleLabel: '5 abr → 5 may',
    monthLong: 'Abril',
    monthShort: 'ABR',
    monthShortNext: 'MAY',
    daysRemaining: 18,
    cycleDays: 30,
    todayDay: 17,
    cycleDayIndex: 12,
    totalFijos: 0,
    montoPagado: 0,
    montoPendiente: 0,
    montoVencido: 0,
    montoPorPagarTotal: 0,
    cantidadFijos: 0,
    cantidadPagados: 0,
    cantidadPendientes: 0,
    cantidadVencidos: 0,
    cantidadPorPagarTotal: 0,
    dineroLibre: 900_000,
    pctSueldo: 0,
    paidPct: 0,
    nextItem: null,
    isEmpty: true,
  },
  {
    id: 'fin_ciclo',
    label: 'Fin de ciclo',
    description: 'Día 29/30. Todo pagado. Mañana cobrás. El ciclo cierra.',
    cycleLabel: '5 abr → 5 may',
    monthLong: 'Abril',
    monthShort: 'ABR',
    monthShortNext: 'MAY',
    daysRemaining: 1,
    cycleDays: 30,
    todayDay: 4,
    cycleDayIndex: 29,
    totalFijos: 425_000,
    montoPagado: 425_000,
    montoPendiente: 0,
    montoVencido: 0,
    montoPorPagarTotal: 0,
    cantidadFijos: 10,
    cantidadPagados: 10,
    cantidadPendientes: 0,
    cantidadVencidos: 0,
    cantidadPorPagarTotal: 0,
    dineroLibre: 380_000,
    pctSueldo: 42,
    paidPct: 100,
    nextItem: null,
    isAllPaid: true,
  },
]
