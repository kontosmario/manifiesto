import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import {
  REINFORCEMENT_TASK_IDS,
  urgencyToState,
} from '@/theme/state-tokens'

/**
 * Conversational view of a signal — the "fusion" design renders each
 * task as a chat bubble. This adapter derives the extra display-only
 * fields the bubble needs (intro tag, headline, impact label, tier
 * label, type tones) from a regular `ControlAdvisorTask`.
 *
 * No new fields are added to the canonical task type — we keep that
 * close to the signal builder. Everything the UI needs to "humanize"
 * a task lives here so the design can evolve without churning the
 * data model.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export type BubbleType = 'critical' | 'warning' | 'positive' | 'insight'
export type ConfidenceTier = 'solid' | 'building' | 'early'

export interface BubbleTone {
  /** Foreground / primary text on the type's bg. */
  fg: string
  /** Filled background tile (icon + impact label). */
  bg: string
  /** Soft tint for the impact chip and active bubble background. */
  soft: string
  /** Strong accent — borders, gradients, focus glow. */
  accent: string
  /** Edge tone — softer divider/border on tinted surfaces. */
  edge: string
}

// ─── Type tones (LIGHT bubble surfaces against the dark panel) ────────────

export const TYPE_TONES: Record<BubbleType, BubbleTone> = {
  critical: { fg: '#B33A1F', bg: '#FFE2D6', soft: '#FFF3EC', accent: '#D14E2A', edge: '#F0BFA8' },
  warning:  { fg: '#9C6A12', bg: '#FCEAC4', soft: '#FFF7E6', accent: '#C28F1E', edge: '#EBD49A' },
  positive: { fg: '#1C7E3A', bg: '#D4F0BF', soft: '#EBF8DD', accent: '#2E9A5F', edge: '#B7DD9A' },
  insight:  { fg: '#3E5A4A', bg: '#E2EAE2', soft: '#F0F4EE', accent: '#5C7762', edge: '#C5D2C7' },
}

// ─── Type derivation ──────────────────────────────────────────────────────

/**
 * Map a task to its bubble type. Reinforcement signals (streak-ok,
 * cat-win, savings-over, positive-forecast) always render as
 * `positive` regardless of urgency. Otherwise we map urgency:
 * alta→critical, media→warning, baja→insight.
 */
export function bubbleType(task: ControlAdvisorTask): BubbleType {
  if (REINFORCEMENT_TASK_IDS.has(task.id)) return 'positive'
  const state = urgencyToState(task.urgency)
  if (state === 'critical') return 'critical'
  if (state === 'caution') return 'warning'
  return 'insight'
}

// ─── Confidence tiering ───────────────────────────────────────────────────

export function confidenceTier(c: number): ConfidenceTier {
  if (c >= 0.85) return 'solid'
  if (c >= 0.6) return 'building'
  return 'early'
}

const CONFIDENCE_LABEL: Record<ConfidenceTier, string> = {
  solid: 'Datos en vivo',
  building: 'Evidencia parcial',
  early: 'Señal temprana',
}

export function confidenceLabel(c: number): string {
  return CONFIDENCE_LABEL[confidenceTier(c)]
}

const CONFIDENCE_DOTS: Record<ConfidenceTier, string> = {
  solid: '●●●',
  building: '●●○',
  early: '●○○',
}

export function confidenceDots(c: number): string {
  return CONFIDENCE_DOTS[confidenceTier(c)]
}

// ─── Headline + intro (chat-style copy) ───────────────────────────────────

/**
 * Short uppercase headline that sits above the title in the bubble.
 * Derived from the signal id so it's stable per signal type.
 */
export function bubbleHeadline(task: ControlAdvisorTask): string {
  const id = task.id
  if (id === 'streak-ok') return 'Racha sostenida'
  if (id === 'cat-win') return 'Categoría a favor'
  if (id === 'savings-over') return 'Adelantado al plan'
  if (id === 'savings-feasibility') return 'Plan de meta'
  if (id === 'positive-forecast') return 'Excedente proyectado'
  if (id === 'velocity') return 'Ritmo crítico'
  if (id === 'recovery-hard') return 'Recuperación urgente'
  if (id === 'recovery-soft') return 'Recuperación moderada'
  if (id === 'cat-accel') return 'Aceleración categoría'
  if (id === 'small-leaks') return 'Filtraciones chicas'
  if (id === 'night-impulse') return 'Impulsos nocturnos'
  if (id === 'weekly-pattern') return 'Patrón semanal'
  if (id === 'fijos-ratio') return 'Fijos altos'
  if (id === 'stress-week') return 'Semana cargada'
  if (id === 'payday-proximity') return 'Hasta cobro'
  if (id === 'start-splurge') return 'Arranque del ciclo'
  if (id === 'end-acceleration') return 'Cierre acelerando'
  if (id.startsWith('cap-')) return 'Tope de categoría'
  if (id.startsWith('cat-dominance-')) return 'Categoría dominante'
  if (id.startsWith('zombie-')) return 'Suscripción zombie'
  if (id.startsWith('hike-')) return 'Suba de precio'
  if (id.startsWith('undetected-sub-')) return 'Posible suscripción'
  if (id.startsWith('member-imbalance-')) return 'Balance familiar'
  if (id.startsWith('income-volatility')) return 'Variación de ingresos'
  return task.cat || 'Insight'
}

/**
 * Chat-style intro tag ("⚠️ Una urgente", "Algo raro encontré"). Adds
 * personality to the conversation without being cute.
 */
export function bubbleIntro(task: ControlAdvisorTask): string {
  const type = bubbleType(task)
  if (type === 'critical') return '⚠️ Una urgente'
  if (type === 'positive') {
    if (task.id === 'streak-ok') return '¡Ey!'
    return '✨ Buenas noticias'
  }
  if (task.id.startsWith('zombie-') || task.id.startsWith('undetected-sub-')) {
    return 'Algo raro encontré'
  }
  if (type === 'warning') return 'Mirá esto'
  return 'Patrón observado'
}

// ─── Impact chip copy ─────────────────────────────────────────────────────

/**
 * Label for the impact chip ("Sobregiro proyectado", "Ahorro anual",
 * "Si bajás 10%"). Falls back to a generic label when the signal id
 * isn't recognized.
 */
export function impactChipLabel(task: ControlAdvisorTask): string {
  const id = task.id
  if (id === 'recovery-hard' || id === 'recovery-soft') return 'Recorte requerido'
  if (id === 'velocity') return 'Sobregiro proyectado'
  if (id === 'positive-forecast') return 'Movimiento sugerido'
  if (id === 'savings-over') return 'Adelanto del plan'
  if (id === 'savings-feasibility') return 'Falta este mes'
  if (id === 'streak-ok') return 'Refuerzo'
  if (id === 'cat-win') return 'Ahorro vs histórico'
  if (id === 'cat-accel') return 'Si volvés al promedio'
  if (id === 'small-leaks') return 'Total filtraciones'
  if (id === 'night-impulse') return 'Si bajás 20%'
  if (id === 'weekly-pattern') return 'Premium semanal'
  if (id === 'fijos-ratio') return 'Exceso vs umbral'
  if (id === 'stress-week') return 'A reservar'
  if (id === 'payday-proximity') return 'Hasta cobro'
  if (id === 'start-splurge') return 'Sobre-gasto inicial'
  if (id === 'end-acceleration') return 'Aceleración cierre'
  if (id.startsWith('zombie-')) return 'Ahorro anual'
  if (id.startsWith('hike-')) return 'Suba mensual'
  if (id.startsWith('cap-')) return 'Excedente'
  if (id.startsWith('cat-dominance-')) return 'Si bajás 10%'
  if (id.startsWith('undetected-sub-')) return 'Suscripción anual'
  if (id.startsWith('member-imbalance-')) return 'Carga del miembro'
  if (id.startsWith('income-volatility')) return 'Delta ingreso'
  return 'Impacto mensual'
}
