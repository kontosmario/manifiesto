import type { HomeHeroDaypart, HomeHeroState } from './home-hero-states'

/**
 * Daypart palette · drive del cielo del Reloj de Sol y de copy
 * editorial state-aware. Tonos cream/peach/cobalt elegidos para
 * mantener contraste AA sobre el forest deep del gradient.
 */
export interface DaypartTint {
  /** Tinte del cielo (top de un gradient) */
  skyTop: string
  /** Tinte horizonte */
  skyMid: string
  /** Sun/moon color */
  orb: string
  /** Halo glow */
  halo: string
  /** Greeting state-aware ("Buen día", "Buenas tardes", etc) */
  greeting: string
}

export function daypartTint(d: HomeHeroDaypart): DaypartTint {
  switch (d) {
    case 'dawn':
      return {
        skyTop: '#3A4A5E',
        skyMid: '#E8B58A',
        orb: '#F8D1A1',
        halo: 'rgba(248,209,161,0.45)',
        greeting: 'Madrugada',
      }
    case 'morning':
      return {
        skyTop: '#7AAACD',
        skyMid: '#F4D89E',
        orb: '#F9E08C',
        halo: 'rgba(249,224,140,0.5)',
        greeting: 'Buen día',
      }
    case 'noon':
      return {
        skyTop: '#9DD4F0',
        skyMid: '#E9F4FF',
        orb: '#FFF1A8',
        halo: 'rgba(255,241,168,0.55)',
        greeting: 'Mediodía',
      }
    case 'afternoon':
      return {
        skyTop: '#FCB97C',
        skyMid: '#F88C5C',
        orb: '#F8D1C3',
        halo: 'rgba(248,140,92,0.55)',
        greeting: 'Buenas tardes',
      }
    case 'evening':
      return {
        skyTop: '#C36F73',
        skyMid: '#5B3A6E',
        orb: '#F2A78C',
        halo: 'rgba(242,167,140,0.5)',
        greeting: 'Buenas noches',
      }
    case 'night':
    default:
      return {
        skyTop: '#0E1B2E',
        skyMid: '#1F2A40',
        orb: '#E8E0CD',
        halo: 'rgba(232,224,205,0.35)',
        greeting: 'Noche',
      }
  }
}

/**
 * Editorial copy state-aware · genera headline para variantes que lo
 * usan (Diario, Manifiesto). El copy varía con el momento del ciclo
 * + signal de proyección.
 */
export function resolveHomeHeadline(state: HomeHeroState): string {
  if (!state.incomeConfigured) return 'Configurá tu ingreso.'
  if (state.paydayPending) {
    return state.paydayDaysOverdue <= 0 ? 'Llegó el cobro.' : 'Sin confirmar.'
  }
  if (!state.projectionReliable) return 'Arrancando el ciclo.'
  if (state.projectedClose < 0) return 'Va a faltar plata.'
  if (state.cycleDay >= state.cycleTotalDays - 4) {
    return state.projectedClose > 0 ? 'Cierre histórico en marcha.' : 'Cierre justo.'
  }
  if (state.projectedCloseTrend != null && state.projectedCloseTrend < -0.1) {
    return 'Vas mejor que el ciclo pasado.'
  }
  if (state.projectedClose > state.monthlyIncome * 0.1) return 'Holgura clara.'
  return 'Vas en línea.'
}

/**
 * Saldo "en palabras" para la variante Manifiesto. Convierte el
 * monto a su lectura en español rioplatense. Solo soporta el rango
 * realista (0 — 9_999_999) — fuera de eso devuelve el número.
 */
export function moneyInWords(n: number): string {
  if (n < 0) return `menos ${moneyInWords(Math.abs(n))}`
  if (n === 0) return 'cero'
  if (n >= 10_000_000) return `${Math.round(n).toLocaleString('es-AR')}`

  const units = [
    '',
    'uno',
    'dos',
    'tres',
    'cuatro',
    'cinco',
    'seis',
    'siete',
    'ocho',
    'nueve',
    'diez',
    'once',
    'doce',
    'trece',
    'catorce',
    'quince',
    'dieciséis',
    'diecisiete',
    'dieciocho',
    'diecinueve',
    'veinte',
    'veintiuno',
    'veintidós',
    'veintitrés',
    'veinticuatro',
    'veinticinco',
    'veintiséis',
    'veintisiete',
    'veintiocho',
    'veintinueve',
  ]
  const tens = [
    '',
    '',
    'veinte',
    'treinta',
    'cuarenta',
    'cincuenta',
    'sesenta',
    'setenta',
    'ochenta',
    'noventa',
  ]
  const hundreds = [
    '',
    'ciento',
    'doscientos',
    'trescientos',
    'cuatrocientos',
    'quinientos',
    'seiscientos',
    'setecientos',
    'ochocientos',
    'novecientos',
  ]

  const speakLt100 = (x: number): string => {
    if (x < 30) return units[x] ?? ''
    const t = Math.floor(x / 10)
    const u = x % 10
    if (u === 0) return tens[t]
    return `${tens[t]} y ${units[u]}`
  }
  const speakLt1000 = (x: number): string => {
    if (x === 100) return 'cien'
    const h = Math.floor(x / 100)
    const r = x % 100
    const hStr = h === 0 ? '' : hundreds[h]
    if (r === 0) return hStr
    return `${hStr} ${speakLt100(r)}`.trim()
  }

  const ints = Math.round(n)
  const millions = Math.floor(ints / 1_000_000)
  const thousands = Math.floor((ints % 1_000_000) / 1_000)
  const rest = ints % 1_000

  const parts: string[] = []
  if (millions > 0) {
    parts.push(millions === 1 ? 'un millón' : `${speakLt1000(millions)} millones`)
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mil' : `${speakLt1000(thousands)} mil`)
  }
  if (rest > 0) parts.push(speakLt1000(rest))
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Money short formatter sin el `$` (lo agregan las variantes ellas
 * mismas). Mismo style que `formatMoneyShort` del util principal.
 */
export function moneyShort(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1_000)}k`
  return `${sign}${Math.round(abs).toLocaleString('es-AR')}`
}

/** Δ% con signo y rounding · "+8%" / "-12%" / "=" */
export function deltaPctLabel(t: number | null): string {
  if (t == null) return '—'
  const pct = Math.round(t * 100)
  if (pct === 0) return '='
  return pct > 0 ? `+${pct}%` : `${pct}%`
}

/**
 * Cycle progress 0..1 · útil para barras y arcs. Clampeado a [0, 1].
 */
export function cycleProgress(state: HomeHeroState): number {
  const total = Math.max(1, state.cycleTotalDays)
  return Math.max(0, Math.min(1, state.cycleDay / total))
}

/**
 * Daypart phase 0..1 · cómo de avanzado va el día (hora). Útil para
 * el Reloj de Sol y headers de algunas variantes.
 */
export function dayPhase(state: HomeHeroState): number {
  return Math.max(0, Math.min(1, state.horaActual / 24))
}
