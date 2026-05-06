// Persona-aware copy variants for critical signals.
//
// The default body in each builder uses neutral framing (analytical /
// data-forward), which is what the `'planner'` persona (default and
// majority bucket) responds to best. For users inferred as
// `'firefighter'`, `'avoider'` or `'optimizer'` we substitute one of
// the variants below — same data, different psychological framing.
//
// We start narrow: only the three critical builders (recovery-hard,
// velocity, fijos-ratio) and the high-signal positive (positive-
// forecast). Other signals continue using their default body until we
// have evidence they're worth segmenting too.

import type { CopyFraming } from '@/features/insights/persona'

interface RecoveryHardCopyArgs {
  newCupo: string
  diasRestantes: number
  overspend: string
}

export function recoveryHardBody(
  framing: CopyFraming,
  args: RecoveryHardCopyArgs,
): string {
  switch (framing) {
    case 'loss':
      return `Sin recortar a ${args.newCupo}/día, el cierre del mes vas a perderlo: el sobregiro de ${args.overspend} se acumula y arrastra al próximo ciclo.`
    case 'gain':
      return `Recortando a ${args.newCupo}/día durante ${args.diasRestantes} días recuperás el ritmo y cierras dentro del presupuesto.`
    default:
      return `Para recuperar el ritmo habría que gastar menos de ${args.newCupo}/día los próximos ${args.diasRestantes} días — es muy difícil. Mejor reajustar la meta o reordenar algún gasto fijo.`
  }
}

interface VelocityCopyArgs {
  forecast: string
  momentumPct: number
  faster: boolean
  over: string | null
}

export function velocityBody(
  framing: CopyFraming,
  args: VelocityCopyArgs,
): string {
  const base = args.faster
    ? `Es ${args.momentumPct}% más rápido que el promedio del ciclo.`
    : 'El ritmo bajó respecto al promedio del ciclo.'
  switch (framing) {
    case 'loss':
      return args.over
        ? `Si no frenas, el cierre estimado es ${args.forecast}: te vas ${args.over} por encima del presupuesto. ${base}`
        : `Cierre estimado a este ritmo: ${args.forecast}. ${base}`
    case 'gain':
      return args.over
        ? `Si bajas el ritmo ${args.over} en lo que queda, el cierre vuelve a presupuesto. ${base}`
        : `Estás dentro de margen. ${base}`
    default:
      return `Al ritmo de los últimos 7 días, el cierre estimado es ${args.forecast}. ${base}`
  }
}

interface FijosRatioCopyArgs {
  ratioPct: number
  excess: string
  comprometidoPct: number
}

export function fijosRatioBody(
  framing: CopyFraming,
  args: FijosRatioCopyArgs,
): string {
  switch (framing) {
    case 'loss':
      return `Estás perdiendo flexibilidad: con fijos al ${args.ratioPct}% del ingreso, cada imprevisto pega más fuerte. Excedente saludable comprometido: ${args.excess}.`
    case 'gain':
      return `Bajando los fijos al 50% del ingreso recuperás ${args.excess}/mes para gasto variable o ahorro. Vale renegociar el más grande.`
    default:
      return `Lo saludable es ≤50%. Hoy, de cada $100 que entran, $${args.comprometidoPct} ya están comprometidos.`
  }
}

interface PositiveForecastCopyArgs {
  sobra: string
  proposed: string | null
  goalTitle: string | null
  diasRestantes: number
}

export function positiveForecastBody(
  framing: CopyFraming,
  args: PositiveForecastCopyArgs,
): string {
  if (args.goalTitle && args.proposed) {
    switch (framing) {
      case 'loss':
        return `Si no mueves el excedente ahora, ${args.sobra} se diluyen el próximo ciclo. Sugerencia: pasar ${args.proposed} a "${args.goalTitle}" antes que se evapore.`
      case 'gain':
        return `Vas adelantado: en ${args.diasRestantes} días el ciclo cierra con ${args.sobra} a favor. Mover ${args.proposed} a "${args.goalTitle}" capitaliza el momentum.`
      default:
        return `Si el ritmo se mantiene los ${args.diasRestantes} días que quedan, el ciclo cierra con saldo a favor. Sugerencia: mover ${args.proposed} a "${args.goalTitle}" ahora y dejar el resto como reserva.`
    }
  }
  switch (framing) {
    case 'loss':
      return `El excedente proyectado de ${args.sobra} es fácil de perder si no lo destinás antes del cierre.`
    case 'gain':
      return `Cierre del ciclo con ${args.sobra} a favor — buen momento para definir una meta de ahorro y capitalizar la racha.`
    default:
      return `Si el ritmo se mantiene los ${args.diasRestantes} días que quedan, el ciclo cierra con saldo a favor. Ese excedente puede ir a una meta de ahorro o quedar como reserva.`
  }
}
