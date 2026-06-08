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
      primary: 'Te pasaste del mes.',
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

  // 3. Crítico · libreHoy muy negativo · pasaste MUCHO el cupo completo
  // del día. Uso libreHoy (no delta pro-rated) para evitar falsos
  // positivos a primera hora: ej. cargar $15K a las 00:27 daba delta
  // = -$11K aunque libreHoy = +$168K (todo el día por delante).
  if (state.libreHoy < -state.cupoDiario * 0.5) {
    return {
      primary: `Vas ${formatMoneyCompact(Math.abs(state.libreHoy))} arriba del cupo.`,
      secondary: 'Pasaste el cupo del día — corregí mañana.',
      status: 'urgent',
      primaryNumber: Math.abs(state.libreHoy),
      primaryLabel: 'POR ENCIMA HOY',
    }
  }

  // 4. Caution · libreHoy levemente negativo · sobrepasaste el cupo
  // completo pero por poco. Mismo motivo: solo fires con overspend
  // REAL (gastoHoy > cupoDiario), no con prorrateo de las primeras horas.
  if (state.libreHoy < 0) {
    return {
      primary: `Pasaste el cupo de hoy por ${formatMoneyCompact(Math.abs(state.libreHoy))}.`,
      secondary: `Acomodá el ritmo para los días que quedan.`,
      status: 'caution',
      primaryNumber: Math.abs(state.libreHoy),
      primaryLabel: 'POR ENCIMA HOY',
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

  // 5. Adelantado · libreHoy alto (gastoHoy bajo respecto del cupo
  // diario completo). Antes usaba delta pro-rated por hora —
  // engañoso en horas tempranas (mismo trap que el SOBREGIRO falso
  // pero en sentido positivo). Ahora usa libreHoy directo:
  // "Vas adelantado" si gastoHoy <= 30% del cupo del día.
  if (state.libreHoy > state.cupoDiario * 0.7) {
    return {
      primary: 'Vas adelantado.',
      secondary: `Te quedan ${formatMoneyCompact(state.libreHoy)} para hoy.`,
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
