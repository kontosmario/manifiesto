import i18n from '@/lib/i18n'
import { getIntlLocale, getNumberFormat } from '@/lib/i18n/active-locale'
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
  /** Sentencia de soporte · ej "Frená el resto del día".
   *  `null` cuando la rama positiva ya está cubierta por el primary +
   *  LIBRE HOY + el chip de días al cobro abajo — no agregar ruido. */
  secondary: string | null
  /** Tone para color encoding · lime / amber / peach */
  status: 'positive' | 'caution' | 'urgent'
  /** El número destacado · drive del CountUp hero */
  primaryNumber: number
  /** Label arriba del número · ej "LIBRE HOY" */
  primaryLabel: string
  /** True cuando el primaryNumber es una cuenta de DÍAS (no dinero) —
   *  gobierna el formato/unidad del CountUp del hero. Reemplaza la
   *  comparación frágil contra el string del label (que ahora se traduce). */
  primaryIsDays?: boolean
}

export function resolveControlMessage(state: ControlHeroState): ControlMessage {
  // Dinámico: no hay "cobro" — los secondaries hablan de fin de ciclo.
  const isDynamic = state.incomeMode === 'dynamic'
  // 1. Exhausto · pasó del cupo total del ciclo
  if (state.alreadyExhausted) {
    const exceso = Math.max(0, Math.abs(state.libreHoy))
    return {
      primary: i18n.t('control:hero.exhausto.primary'),
      secondary: i18n.t(
        isDynamic
          ? 'control:hero.exhausto.secondaryDynamic'
          : 'control:hero.exhausto.secondary',
        { days: state.proximoSueldoEnDias },
      ),
      status: 'urgent',
      primaryNumber: exceso,
      primaryLabel: i18n.t('control:hero.exhausto.label'),
    }
  }

  // 2. No alcanza al cobro · proyección agota plata antes del próximo sueldo
  if (!state.alcanzaElMes) {
    const diasQueAguantas = Math.max(1, state.diaAgotamiento - state.diaActual)
    return {
      primary: i18n.t('control:hero.noAlcanza.primary', { count: diasQueAguantas }),
      secondary: i18n.t(
        isDynamic
          ? 'control:hero.noAlcanza.secondaryDynamic'
          : 'control:hero.noAlcanza.secondary',
      ),
      status: 'urgent',
      primaryNumber: diasQueAguantas,
      primaryLabel: i18n.t('control:hero.noAlcanza.label'),
      primaryIsDays: true,
    }
  }

  // 3. Crítico · libreHoy muy negativo · pasaste MUCHO el cupo completo
  // del día. Uso libreHoy (no delta pro-rated) para evitar falsos
  // positivos a primera hora: ej. cargar $15K a las 00:27 daba delta
  // = -$11K aunque libreHoy = +$168K (todo el día por delante).
  if (state.libreHoy < -state.cupoDiario * 0.5) {
    return {
      primary: i18n.t('control:hero.criticoHoy.primary', {
        amount: formatMoneyCompact(Math.abs(state.libreHoy)),
      }),
      secondary: i18n.t('control:hero.criticoHoy.secondary'),
      status: 'urgent',
      primaryNumber: Math.abs(state.libreHoy),
      primaryLabel: i18n.t('control:hero.criticoHoy.label'),
    }
  }

  // 4. Caution · libreHoy levemente negativo · sobrepasaste el cupo
  // completo pero por poco. Mismo motivo: solo fires con overspend
  // REAL (gastoHoy > cupoDiario), no con prorrateo de las primeras horas.
  if (state.libreHoy < 0) {
    return {
      primary: i18n.t('control:hero.cautionHoy.primary', {
        amount: formatMoneyCompact(Math.abs(state.libreHoy)),
      }),
      secondary: i18n.t('control:hero.cautionHoy.secondary'),
      status: 'caution',
      primaryNumber: Math.abs(state.libreHoy),
      primaryLabel: i18n.t('control:hero.cautionHoy.label'),
    }
  }

  // 4b. Meta diaria auto-impuesta · pasaste tu goal pero sigues bajo
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
      primary: i18n.t('control:hero.metaPasada.primary'),
      secondary: i18n.t('control:hero.metaPasada.secondary', {
        amount: formatMoneyCompact(excesoMeta),
      }),
      status: 'caution',
      primaryNumber: Math.max(0, state.libreHoy),
      primaryLabel: i18n.t('control:hero.metaPasada.label'),
    }
  }

  // 5. Adelantado · libreHoy alto. Sin secondary — la info "X días
  // al cobro" ya vive en el chip dedicado debajo del hero numérico.
  if (state.libreHoy > state.cupoDiario * 0.7) {
    return {
      primary: i18n.t('control:hero.adelantado.primary'),
      secondary: null,
      status: 'positive',
      primaryNumber: state.libreHoy,
      primaryLabel: i18n.t('control:hero.adelantado.label'),
    }
  }

  // 6. Default positive · sin secondary (igual que rama 5).
  return {
    primary: i18n.t('control:hero.bien.primary'),
    secondary: null,
    status: 'positive',
    primaryNumber: state.libreHoy,
    primaryLabel: i18n.t('control:hero.bien.label'),
  }
}

function formatMoneyCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) {
    const m = getNumberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 })
    return `$${m.format(n / 1_000_000)}M`
  }
  if (abs >= 10_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n).toLocaleString(getIntlLocale())}`
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
