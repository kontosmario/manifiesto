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
      return `Si no bajas a ${args.newCupo} por día, el mes te va a cerrar ${args.overspend} más caro de lo que tenías pensado, y eso te complica el mes que viene.`
    case 'gain':
      return `Gastando menos de ${args.newCupo} por día estos ${args.diasRestantes} días, llegas a fin de mes sin pasarte.`
    default:
      return `Para llegar bien a fin de mes tendrías que gastar menos de ${args.newCupo} por día — es muy poco. Mejor baja un poco lo que quieres ahorrar, o corre algún pago grande para más adelante.`
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
  // `over` = cuántos pesos de más vas a gastar respecto a lo planeado (o null).
  if (!args.faster) {
    return args.over
      ? `Aunque vienes más tranquilo que otras veces, todavía vas ${args.over} arriba de lo que tenías pensado. Sigue cuidándote y llegas.`
      : `Vienes gastando más tranquilo que de costumbre — así llegas bien a fin de mes.`
  }
  switch (framing) {
    case 'loss':
      return args.over
        ? `Si sigues gastando así, el mes te va a cerrar ${args.over} más caro de lo que tenías pensado. Afloja un poco estos días y llegas bien.`
        : `Vas un poco acelerado para esta altura del mes, pero todavía llegas. Ojo con los próximos días.`
    case 'gain':
      return args.over
        ? `Gastando ${args.over} menos en lo que queda del mes, llegas justo a lo que tenías pensado.`
        : `Vas bien, dentro de lo que tenías pensado para este mes.`
    default:
      return args.over
        ? `A este paso, el mes te va a cerrar ${args.over} más caro de lo que tenías pensado. Baja un poco y llegas.`
        : `Si sigues así, llegas a fin de mes sin pasarte de lo que tenías pensado.`
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
      return `Tus pagos fijos (alquiler, servicios, suscripciones) se comen una parte muy grande del sueldo: si aparece un gasto inesperado, casi no te queda colchón. Bajar el más grande te libera ${args.excess} por mes.`
    case 'gain':
      return `Si bajas tus pagos fijos (alquiler, servicios, suscripciones), te quedan ${args.excess} más por mes para el día a día o para guardar. El más grande es el que más mueve la aguja.`
    default:
      return `Tus pagos fijos (alquiler, servicios, suscripciones) se llevan una parte muy grande del sueldo: te queda poco para comer, salir y ahorrar. Bajar el más grande te libera ${args.excess} por mes.`
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
        return `Si no la guardas ahora, esa plata que te va a sobrar (${args.sobra}) se va a ir en gastos del mes que viene. Pasa ${args.proposed} a "${args.goalTitle}" antes de que desaparezca.`
      case 'gain':
        return `Vas adelantado: a fin de mes te sobran ${args.sobra}. Aprovecha y pasa ${args.proposed} a "${args.goalTitle}".`
      default:
        return `Si sigues así, a fin de mes te sobran ${args.sobra}. Una buena: pasa ${args.proposed} a "${args.goalTitle}" y deja el resto guardado por las dudas.`
    }
  }
  switch (framing) {
    case 'loss':
      return `Te van a sobrar ${args.sobra} a fin de mes — fáciles de gastar sin querer. Mejor decide ya dónde guardarlos.`
    case 'gain':
      return `Buen mes: te sobran ${args.sobra}. Buen momento para arrancar una meta de ahorro.`
    default:
      return `Si sigues así, a fin de mes te sobran ${args.sobra}. Esa plata puede ir a una meta de ahorro o quedar guardada por las dudas.`
  }
}
