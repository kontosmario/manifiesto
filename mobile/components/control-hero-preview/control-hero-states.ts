/**
 * Estados representativos del día/ciclo del usuario para alimentar las
 * 6 variantes del hero card de Control. Cada estado modela un momento
 * que el usuario va a encontrar al abrir Control.
 *
 *   al_dia_temprano      mañana · gasté poquito · todo en orden
 *   al_dia_tarde         tarde · vas en línea con el prorrateo
 *   adelantado           gastaste menos que el prorrateo, tienes margen
 *   atrasado_leve        gastaste un poco más que el ritmo de la hora
 *   atrasado_critico     gastaste mucho más que el cupo de hoy
 *   no_alcanza           a este ritmo no llegás al cobro
 *   exhausto             ya te pasaste del cupo total del ciclo
 *   inicio_ciclo         día 1-2 del ciclo, métricas sin sentido aún
 *
 * @i18n-ignore (dev preview): `CONTROL_HERO_STATES` es un fixture de
 * SOLO desarrollo — no tiene consumidor en runtime de producción (sólo
 * el TYPE `ControlHeroState` se usa en la app real, vía
 * control-v2-hero.tsx). Los `label`/`description`/`diaLabel`/`scoreLabel`
 * de cada estado son rótulos internos del preview, nunca renderizados al
 * usuario final, así que no se extraen al namespace de i18n.
 */

export interface ControlHeroState {
  id: string
  label: string
  description: string

  // Cupo del día
  cupoDiario: number
  gastoHoy: number
  libreHoy: number // = cupoDiario - gastoHoy
  delta: number // cupoHastaAhora - gastoHoy (positivo = adelantado)
  estaOk: boolean
  alreadyExhausted: boolean

  // Tiempo
  diaLabel: string
  diaActual: number
  diasMes: number
  diasRestantes: number
  proximoSueldoEnDias: number
  /** Régimen de ingreso — en 'dynamic' el countdown es "fin de ciclo"
   *  (no hay cobro) y los labels eligen la variante _dynamic. Opcional:
   *  los estados de preview del design-lab no lo setean (= 'fixed'). */
  incomeMode?: 'fixed' | 'dynamic'
  horaActual: number
  minActual: number
  horaF: number

  // Proyección
  alcanzaElMes: boolean
  diaAgotamiento: number // si sigues el ritmo, te quedás sin plata el día X
  proyectadoMes: number

  // Motivación
  racha: number
  diasGanadores: number
  closedDays: number
  momentum: number // ratio last-7 vs prev-7
  noSpendCount: number
  /** Cantidad de días explícitamente marcados como "sin gastos" este
   *  ciclo (provenientes de `home_snapshot.no_spend_days_count_cycle`,
   *  que cuenta filas en `streak_marked_days`). Distinto de
   *  `noSpendCount`, que es el count derivado client-side de días con
   *  gasto $0 en el ciclo. `null` cuando el snapshot no lo provee.
   *  Renderiza el stat 🌱 en el footer SOLO cuando > 0 (la métrica
   *  no aparece como cero, solo cuando hay algo que celebrar). */
  noSpendDaysCount?: number | null

  /** Meta diaria auto-impuesta. `null` si el user no configuró goal.
   *  Cuando hay goal, pasa a ser el threshold "positive → caution"
   *  antes del cupo real (typical: 80% del cupo real). */
  dailyGoalAmount?: number | null
  /** Score 0–100 del adapter · drive del badge en el masthead. */
  score: number
  scoreLabel: string
  /** Próximo fijo a pagar (de la tab Fijos) — útil para chip "Netflix
   *  en 3d" en el hero. `null` cuando no hay próximos. */
  proximoFijo?: { name: string; days: number; amount: number } | null
  /** Cantidad de fijos vencidos del ciclo actual. */
  fijosVencidos?: number

  // Summary fields pulled from other Control detail cards · alimentan
  // chips y el insight line de la hero. Todos optional para no romper
  // los mocks heredados — adapter `control-v2-hero.tsx` los pasa.
  /** Δ% proyectado vs mes pasado · drive del chip vs mes en footer. */
  vsMesDeltaPct?: number
  /** True cuando vamos mejor que el mes pasado. */
  vsMesMejor?: boolean
  /** Acumulado del ciclo (Alcancía) · drive del insight line cuando
   *  el monto es relevante. */
  vault?: number
  /** Nombre del mejor DOW · drive del insight cuando hoy ES ese DOW. */
  mejorDowName?: string | null
}

const HORA_F = (h: number, m: number): number => h + m / 60

export const CONTROL_HERO_STATES: ControlHeroState[] = [
  {
    id: 'al_dia_temprano',
    // @i18n-ignore (dev preview)
    label: 'Al día (mañana)',
    // @i18n-ignore (dev preview)
    description: 'Día 10/30 · 09:30 · gastaste poquito hoy, recién arrancas el día',
    cupoDiario: 32_000,
    gastoHoy: 2_500,
    libreHoy: 29_500,
    delta: HORA_F(9, 30) / 24 * 32_000 - 2_500, // ~10k positive (adelantado)
    estaOk: true,
    alreadyExhausted: false,
    diaLabel: 'HOY · MARTES 14',
    diaActual: 10,
    diasMes: 30,
    diasRestantes: 20,
    proximoSueldoEnDias: 20,
    horaActual: 9,
    minActual: 30,
    horaF: HORA_F(9, 30),
    alcanzaElMes: true,
    diaAgotamiento: 30,
    proyectadoMes: 880_000,
    racha: 3,
    diasGanadores: 7,
    closedDays: 9,
    momentum: 0.95,
    noSpendCount: 2,
    dailyGoalAmount: 25_600, // 80% del cupo · el user opted into el goal
    score: 82,
    scoreLabel: 'Muy bien',
    proximoFijo: { name: 'Netflix', days: 3, amount: 12_500 },
    fijosVencidos: 0,
    vsMesDeltaPct: -8,
    vsMesMejor: true,
    vault: 42_000,
    mejorDowName: 'Mar',
  },
  {
    id: 'al_dia_tarde',
    // @i18n-ignore (dev preview)
    label: 'Al día (tarde)',
    // @i18n-ignore (dev preview)
    description: 'Día 14/30 · 18:00 · vas en línea con el prorrateo del día',
    cupoDiario: 32_000,
    gastoHoy: 22_000,
    libreHoy: 10_000,
    delta: HORA_F(18, 0) / 24 * 32_000 - 22_000, // ~2k positive
    estaOk: true,
    alreadyExhausted: false,
    diaLabel: 'HOY · MIÉRCOLES 22',
    diaActual: 14,
    diasMes: 30,
    diasRestantes: 16,
    proximoSueldoEnDias: 16,
    horaActual: 18,
    minActual: 0,
    horaF: HORA_F(18, 0),
    alcanzaElMes: true,
    diaAgotamiento: 30,
    proyectadoMes: 940_000,
    racha: 4,
    diasGanadores: 9,
    closedDays: 13,
    momentum: 1.02,
    noSpendCount: 3,
    dailyGoalAmount: 25_600,
    score: 76,
    scoreLabel: 'Muy bien',
    proximoFijo: { name: 'Netflix', days: 3, amount: 12_500 },
    fijosVencidos: 0,
    vsMesDeltaPct: -4,
    vsMesMejor: true,
    vault: 38_000,
    mejorDowName: 'Mar',
  },
  {
    id: 'adelantado',
    label: 'Adelantado',
    // @i18n-ignore (dev preview)
    description: 'Día 14/30 · 20:00 · gastaste menos del prorrateo, tienes margen',
    cupoDiario: 32_000,
    gastoHoy: 14_000,
    libreHoy: 18_000,
    delta: HORA_F(20, 0) / 24 * 32_000 - 14_000, // ~13k positive
    estaOk: true,
    alreadyExhausted: false,
    diaLabel: 'HOY · MIÉRCOLES 22',
    diaActual: 14,
    diasMes: 30,
    diasRestantes: 16,
    proximoSueldoEnDias: 16,
    horaActual: 20,
    minActual: 0,
    horaF: HORA_F(20, 0),
    alcanzaElMes: true,
    diaAgotamiento: 30,
    proyectadoMes: 860_000,
    racha: 5,
    diasGanadores: 11,
    closedDays: 13,
    momentum: 0.88,
    noSpendCount: 4,
    dailyGoalAmount: 25_600,
    score: 91,
    scoreLabel: 'Excelente',
    proximoFijo: { name: 'Spotify', days: 5, amount: 5_200 },
    fijosVencidos: 0,
    vsMesDeltaPct: -16,
    vsMesMejor: true,
    vault: 86_000,
    mejorDowName: 'Mié',
  },
  {
    id: 'atrasado_leve',
    label: 'Atrasado leve',
    // @i18n-ignore (dev preview)
    description: 'Día 14/30 · 14:00 · gastaste un poco arriba del ritmo de la hora',
    cupoDiario: 32_000,
    gastoHoy: 25_000,
    libreHoy: 7_000,
    delta: HORA_F(14, 0) / 24 * 32_000 - 25_000, // ~-6k (atrasado leve)
    estaOk: false,
    alreadyExhausted: false,
    diaLabel: 'HOY · MIÉRCOLES 22',
    diaActual: 14,
    diasMes: 30,
    diasRestantes: 16,
    proximoSueldoEnDias: 16,
    horaActual: 14,
    minActual: 0,
    horaF: HORA_F(14, 0),
    alcanzaElMes: true,
    diaAgotamiento: 30,
    proyectadoMes: 960_000,
    racha: 2,
    diasGanadores: 8,
    closedDays: 13,
    momentum: 1.12,
    noSpendCount: 2,
    dailyGoalAmount: 25_600, // pasó la meta auto-impuesta
    score: 58,
    scoreLabel: 'Bien',
    proximoFijo: { name: 'Cable', days: 6, amount: 22_400 },
    fijosVencidos: 0,
    vsMesDeltaPct: 6,
    vsMesMejor: false,
    vault: 14_000,
    mejorDowName: 'Lun',
  },
  {
    id: 'atrasado_critico',
    // @i18n-ignore (dev preview)
    label: 'Atrasado crítico',
    // @i18n-ignore (dev preview)
    description: 'Día 14/30 · 11:00 · ya gastaste más del cupo de TODO el día',
    cupoDiario: 32_000,
    gastoHoy: 41_000,
    libreHoy: -9_000,
    delta: HORA_F(11, 0) / 24 * 32_000 - 41_000, // ~-26k atrasado
    estaOk: false,
    alreadyExhausted: false,
    diaLabel: 'HOY · MIÉRCOLES 22',
    diaActual: 14,
    diasMes: 30,
    diasRestantes: 16,
    proximoSueldoEnDias: 16,
    horaActual: 11,
    minActual: 0,
    horaF: HORA_F(11, 0),
    alcanzaElMes: true,
    diaAgotamiento: 28,
    proyectadoMes: 980_000,
    racha: 0,
    diasGanadores: 6,
    closedDays: 13,
    momentum: 1.34,
    noSpendCount: 1,
    dailyGoalAmount: null, // sin goal · cupo real es el threshold
    score: 38,
    scoreLabel: 'Regular',
    proximoFijo: { name: 'Cable', days: 0, amount: 22_400 },
    fijosVencidos: 1,
    vsMesDeltaPct: 22,
    vsMesMejor: false,
    vault: 6_000,
    mejorDowName: 'Jue',
  },
  {
    id: 'no_alcanza',
    label: 'No alcanza al cobro',
    // @i18n-ignore (dev preview)
    description: 'Día 14/30 · vienes gastando mucho · te quedas sin plata el día 24',
    cupoDiario: 32_000,
    gastoHoy: 38_000,
    libreHoy: -6_000,
    delta: HORA_F(15, 0) / 24 * 32_000 - 38_000,
    estaOk: false,
    alreadyExhausted: false,
    diaLabel: 'HOY · MIÉRCOLES 22',
    diaActual: 14,
    diasMes: 30,
    diasRestantes: 16,
    proximoSueldoEnDias: 16,
    horaActual: 15,
    minActual: 0,
    horaF: HORA_F(15, 0),
    alcanzaElMes: false,
    diaAgotamiento: 24,
    proyectadoMes: 1_120_000,
    racha: 0,
    diasGanadores: 4,
    closedDays: 13,
    momentum: 1.42,
    noSpendCount: 0,
    dailyGoalAmount: null,
    score: 22,
    scoreLabel: 'Atención',
    proximoFijo: { name: 'Cable', days: 0, amount: 22_400 },
    fijosVencidos: 2,
    vsMesDeltaPct: 38,
    vsMesMejor: false,
    vault: 0,
    mejorDowName: 'Lun',
  },
  {
    id: 'exhausto',
    label: 'Exhausto (pasado del mes)',
    // @i18n-ignore (dev preview)
    description: 'Día 22/30 · ya gastaste $145k MÁS que el cupo total del mes',
    cupoDiario: 32_000,
    gastoHoy: 45_000,
    libreHoy: -13_000,
    delta: -50_000,
    estaOk: false,
    alreadyExhausted: true,
    diaLabel: 'HOY · JUEVES 30',
    diaActual: 22,
    diasMes: 30,
    diasRestantes: 8,
    proximoSueldoEnDias: 8,
    horaActual: 16,
    minActual: 0,
    horaF: HORA_F(16, 0),
    alcanzaElMes: false,
    diaAgotamiento: 20, // ya pasado
    proyectadoMes: 1_280_000,
    racha: 0,
    diasGanadores: 5,
    closedDays: 21,
    momentum: 1.65,
    noSpendCount: 0,
    dailyGoalAmount: null,
    score: 8,
    scoreLabel: 'Atención',
    proximoFijo: null,
    fijosVencidos: 3,
    vsMesDeltaPct: 64,
    vsMesMejor: false,
    vault: 0,
    mejorDowName: 'Mar',
  },
  {
    id: 'inicio_ciclo',
    label: 'Inicio de ciclo',
    // @i18n-ignore (dev preview)
    description: 'Día 2/30 · recién arrancaste, casi sin métricas todavía',
    cupoDiario: 32_000,
    gastoHoy: 8_500,
    libreHoy: 23_500,
    delta: HORA_F(13, 0) / 24 * 32_000 - 8_500, // ~9k positive
    estaOk: true,
    alreadyExhausted: false,
    diaLabel: 'HOY · LUNES 10',
    diaActual: 2,
    diasMes: 30,
    diasRestantes: 28,
    proximoSueldoEnDias: 28,
    horaActual: 13,
    minActual: 0,
    horaF: HORA_F(13, 0),
    alcanzaElMes: true,
    diaAgotamiento: 30,
    proyectadoMes: 880_000,
    racha: 1,
    diasGanadores: 1,
    closedDays: 1,
    momentum: 1.0,
    noSpendCount: 0,
    dailyGoalAmount: null,
    score: 65,
    scoreLabel: 'Bien',
    proximoFijo: { name: 'Alquiler', days: 3, amount: 145_000 },
    fijosVencidos: 0,
    vsMesDeltaPct: 0,
    vsMesMejor: true,
    vault: 5_000,
    mejorDowName: null,
  },
]
