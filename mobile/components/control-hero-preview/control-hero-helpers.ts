import type { ControlHeroState } from './control-hero-states'

/**
 * Decision tree del "asistente que te dice lo más importante sin
 * vueltas". Mapea el state del usuario a una sola sentencia + un
 * número destacado. Lo usan las 6 variantes para tener consistencia
 * en el copy.
 */
export interface ControlMessage {
  /** Sentencia principal · ej "Vas $6.000 arriba del ritmo" */
  primary: string
  /** Sentencia de soporte · ej "Frená el resto del día" */
  secondary: string
  /** Tone para color encoding · lime / amber / peach */
  status: 'positive' | 'caution' | 'urgent'
  /** El número destacado · drive del CountUp hero */
  primaryNumber: number
  /** Label arriba del número · ej "LIBRE HOY" */
  primaryLabel: string
}

export function resolveControlMessage(state: ControlHeroState): ControlMessage {
  // 1. Exhausto · pasó del cupo total del ciclo
  if (state.alreadyExhausted) {
    const exceso = Math.max(0, Math.abs(state.libreHoy))
    return {
      primary: 'Te pasaste del ciclo.',
      secondary: `Faltan ${state.proximoSueldoEnDias} días al cobro. Cuidá lo que queda.`,
      status: 'urgent',
      primaryNumber: exceso,
      primaryLabel: 'POR ENCIMA',
    }
  }

  // 2. No alcanza al cobro · proyección agota plata antes del próximo sueldo
  if (!state.alcanzaElMes) {
    const diasQueAguantas = Math.max(1, state.diaAgotamiento - state.diaActual)
    return {
      primary: `Te quedás sin plata en ${diasQueAguantas} ${diasQueAguantas === 1 ? 'día' : 'días'}.`,
      secondary: `Bajá el ritmo o llegás justo al cobro.`,
      status: 'urgent',
      primaryNumber: diasQueAguantas,
      primaryLabel: 'DÍAS HASTA AGOTAR',
    }
  }

  // 3. Crítico · delta muy negativo · gastaste mucho más del ritmo
  if (state.delta < -state.cupoDiario * 0.5) {
    return {
      primary: `Vas ${formatMoneyCompact(Math.abs(state.delta))} arriba del ritmo.`,
      secondary: 'Si seguís así, el cupo de hoy no alcanza.',
      status: 'urgent',
      primaryNumber: Math.abs(state.libreHoy),
      primaryLabel: state.libreHoy < 0 ? 'POR ENCIMA HOY' : 'LIBRE HOY',
    }
  }

  // 4. Caution · delta levemente negativo
  if (!state.estaOk) {
    return {
      primary: `Vas un poco arriba del ritmo.`,
      secondary: `Te quedan ${formatMoneyCompact(Math.max(0, state.libreHoy))} para el resto del día.`,
      status: 'caution',
      primaryNumber: Math.max(0, state.libreHoy),
      primaryLabel: 'LIBRE HOY',
    }
  }

  // 4b. Meta diaria auto-impuesta · pasaste tu goal pero seguís bajo
  //     el cupo real. Soft warning — el user opted into el goal, hay
  //     que respetarlo como threshold primario antes que el cupo del
  //     sistema.
  if (
    state.dailyGoalAmount != null &&
    state.gastoHoy > state.dailyGoalAmount &&
    state.gastoHoy <= state.cupoDiario
  ) {
    const excesoMeta = state.gastoHoy - state.dailyGoalAmount
    return {
      primary: 'Pasaste tu meta diaria.',
      secondary: `Seguís bajo el cupo, pero superaste tu meta por ${formatMoneyCompact(excesoMeta)}.`,
      status: 'caution',
      primaryNumber: Math.max(0, state.libreHoy),
      primaryLabel: 'LIBRE HOY',
    }
  }

  // 5. Adelantado · delta positivo amplio
  if (state.delta > state.cupoDiario * 0.3) {
    return {
      primary: 'Vas adelantado.',
      secondary: `Tenés margen extra: ${formatMoneyCompact(state.delta)} sobre el ritmo.`,
      status: 'positive',
      primaryNumber: state.libreHoy,
      primaryLabel: 'LIBRE HOY',
    }
  }

  // 6. Default positive · en línea con el prorrateo
  return {
    primary: 'Vas bien hoy.',
    secondary: `${formatMoneyCompact(state.libreHoy)} para el resto del día · ${state.proximoSueldoEnDias} ${state.proximoSueldoEnDias === 1 ? 'día' : 'días'} al cobro.`,
    status: 'positive',
    primaryNumber: state.libreHoy,
    primaryLabel: 'LIBRE HOY',
  }
}

function formatMoneyCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

/**
 * Paleta de los hero variants · theme-aware con tones por status.
 *
 * Contraste verificado sobre el heroGradient forest:
 *   positive · lime A6EF8F sobre forest deep · 7.4:1 AAA
 *   caution  · amber F3BA57 sobre forest deep · 5.8:1 AA
 *   urgent   · peach F2A78C sobre forest deep · 4.9:1 AA
 */
export interface ControlHeroPalette {
  positive: string
  caution: string
  urgent: string
  trackMuted: string
  trackBg: string
}

export function buildControlHeroPalette(): ControlHeroPalette {
  return {
    positive: '#A6EF8F',
    caution: '#F3BA57',
    urgent: '#F2A78C',
    trackMuted: 'rgba(242,234,211,0.22)',
    trackBg: 'rgba(242,234,211,0.10)',
  }
}

export function statusColor(
  status: 'positive' | 'caution' | 'urgent',
  palette: ControlHeroPalette,
): string {
  if (status === 'positive') return palette.positive
  if (status === 'caution') return palette.caution
  return palette.urgent
}
