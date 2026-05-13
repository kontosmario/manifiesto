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

  // Próximo item (single, para hero "PRÓXIMO" line)
  nextItem: { name: string; days: number; amount: number; dayOfWeek: string } | null

  // Top 3 upcoming items (para componente "Próximos" editorial).
  // Cuando hay vencidos, los más vencidos van primero con isOverdue=true.
  // `days` negativo = vencido hace N días.
  upcoming: Array<{
    id: string
    name: string
    days: number
    amount: number
    categoryColor: string
    hikeDeltaPct?: number
    isOverdue?: boolean
  }>

  // Smart alerts (3er componente del refactor — siguiente a Próximos).
  // hikes: fijos que subieron de precio detectados +5% o más
  // signals: contexto (semana cargada, ratio fijos/sueldo alto, streak)
  alerts: {
    hikes: Array<{
      id: string
      name: string
      previousPrice: number
      currentPrice: number
      deltaPct: number
      categoryColor: string
    }>
    signals: Array<{
      id: string
      kind: 'stress-week' | 'fijos-ratio' | 'streak' | 'cycle-creep'
      title: string
      body: string
      urgency: 'alta' | 'media' | 'baja'
    }>
  }

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
    upcoming: [
      { id: 'alquiler', name: 'Alquiler', days: 3, amount: 145_000, categoryColor: '#A6EF8F' },
      { id: 'cable', name: 'Cable + Internet', days: 6, amount: 22_400, categoryColor: '#F2B58A' },
      { id: 'personal', name: 'Préstamo personal', days: 8, amount: 88_500, categoryColor: '#9FC9E4' },
    ],
    alerts: {
      hikes: [],
      signals: [],
    },
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
    upcoming: [
      { id: 'netflix', name: 'Netflix', days: 3, amount: 12_500, categoryColor: '#E5B6E5' },
      { id: 'spotify', name: 'Spotify Familiar', days: 8, amount: 5_200, categoryColor: '#A6EF8F', hikeDeltaPct: 12 },
      { id: 'gym', name: 'Gimnasio', days: 12, amount: 18_000, categoryColor: '#F2B58A' },
    ],
    alerts: {
      hikes: [
        { id: 'h-spotify', name: 'Spotify Familiar', previousPrice: 4_640, currentPrice: 5_200, deltaPct: 12, categoryColor: '#A6EF8F' },
        { id: 'h-prepaga', name: 'Prepaga médica', previousPrice: 68_000, currentPrice: 78_900, deltaPct: 16, categoryColor: '#9FC9E4' },
      ],
      signals: [
        { id: 's-stress', kind: 'stress-week', title: 'Semana cargada', body: 'Cuatro fijos vencen entre el 14 y el 17 de abril. Sumá $182.000 en 4 días.', urgency: 'media' },
      ],
    },
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
    upcoming: [
      { id: 'expensa', name: 'Expensas', days: -5, amount: 28_000, categoryColor: '#F06A6A', isOverdue: true },
      { id: 'cable', name: 'Cable + Internet', days: -2, amount: 22_400, categoryColor: '#F06A6A', isOverdue: true },
      { id: 'cable_today', name: 'Cobertura médica', days: 0, amount: 18_500, categoryColor: '#9FC9E4' },
    ],
    alerts: {
      hikes: [
        { id: 'h-cable', name: 'Cable + Internet', previousPrice: 19_900, currentPrice: 22_400, deltaPct: 13, categoryColor: '#F2B58A' },
      ],
      signals: [
        { id: 's-ratio', kind: 'fijos-ratio', title: 'Ratio fijos/sueldo alto', body: 'Tus fijos consumen el 42% del sueldo. Recomendado <35%.', urgency: 'alta' },
        { id: 's-creep', kind: 'cycle-creep', title: 'Tus fijos crecen', body: 'Subieron $24.000 en los últimos 3 ciclos. Acumulado +6%.', urgency: 'media' },
      ],
    },
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
    upcoming: [],
    alerts: {
      hikes: [],
      signals: [
        { id: 's-streak', kind: 'streak', title: 'Cuarto ciclo sin atrasos', body: 'Pagaste todo en hora 4 ciclos seguidos. Mantené el ritmo.', urgency: 'baja' },
      ],
    },
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
    upcoming: [],
    alerts: {
      hikes: [],
      signals: [],
    },
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
    upcoming: [],
    alerts: {
      hikes: [],
      signals: [
        { id: 's-streak', kind: 'streak', title: 'Cuarto ciclo sin atrasos', body: 'Pagaste todo en hora 4 ciclos seguidos. Mantené el ritmo.', urgency: 'baja' },
      ],
    },
    isAllPaid: true,
  },
]
