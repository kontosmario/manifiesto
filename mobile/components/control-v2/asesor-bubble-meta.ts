import i18n from '@/lib/i18n'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import {
  REINFORCEMENT_TASK_IDS,
  urgencyToState,
} from '@/theme/state-tokens'

/**
 * Conversational view of a signal — the "fusion" design renders each
 * task as a chat bubble. This adapter derives the extra display-only
 * fields the bubble needs (intro tag, headline, impact label, tier
 * label) from a regular `ControlAdvisorTask`.
 *
 * Sólo SEMÁNTICA: el material con el que se pinta cada tipo (pastel del
 * tile, tinta del acento, partículas) vive en `asesor-neo-meta`.
 *
 * No new fields are added to the canonical task type — we keep that
 * close to the signal builder. Everything the UI needs to "humanize"
 * a task lives here so the design can evolve without churning the
 * data model.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export type BubbleType = 'critical' | 'warning' | 'positive' | 'insight'
export type ConfidenceTier = 'solid' | 'building' | 'early'

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

const CONFIDENCE_LABEL_KEY: Record<ConfidenceTier, string> = {
  solid: 'control:advisorBubble.confidenceSolid',
  building: 'control:advisorBubble.confidenceBuilding',
  early: 'control:advisorBubble.confidenceEarly',
}

export function confidenceLabel(c: number): string {
  return i18n.t(CONFIDENCE_LABEL_KEY[confidenceTier(c)])
}

// ─── Headline + intro (chat-style copy) ───────────────────────────────────

/**
 * Short uppercase headline that sits above the title in the bubble.
 * Derived from the signal id so it's stable per signal type.
 */
export function bubbleHeadline(task: ControlAdvisorTask): string {
  const id = task.id
  if (id === 'streak-ok') return i18n.t('control:advisorBubble.headlineStreakOk')
  if (id === 'cat-win') return i18n.t('control:advisorBubble.headlineCatWin')
  if (id === 'savings-over') return i18n.t('control:advisorBubble.headlineSavingsOver')
  if (id === 'savings-feasibility') return i18n.t('control:advisorBubble.headlineSavingsFeasibility')
  if (id === 'positive-forecast') return i18n.t('control:advisorBubble.headlinePositiveForecast')
  if (id === 'velocity') return i18n.t('control:advisorBubble.headlineVelocity')
  if (id === 'recovery-hard') return i18n.t('control:advisorBubble.headlineRecoveryHard')
  if (id === 'recovery-soft') return i18n.t('control:advisorBubble.headlineRecoverySoft')
  if (id === 'cat-accel') return i18n.t('control:advisorBubble.headlineCatAccel')
  if (id === 'small-leaks') return i18n.t('control:advisorBubble.headlineSmallLeaks')
  if (id === 'night-impulse') return i18n.t('control:advisorBubble.headlineNightImpulse')
  if (id === 'weekly-pattern') return i18n.t('control:advisorBubble.headlineWeeklyPattern')
  if (id === 'fijos-ratio') return i18n.t('control:advisorBubble.headlineFijosRatio')
  if (id === 'stress-week') return i18n.t('control:advisorBubble.headlineStressWeek')
  if (id === 'payday-proximity')
    return i18n.t(
      task.bubbleFrame === 'cycle'
        ? 'control:advisorBubble.headlineFinDeCiclo'
        : 'control:advisorBubble.headlinePaydayProximity',
    )
  if (id === 'start-splurge') return i18n.t('control:advisorBubble.headlineStartSplurge')
  if (id === 'end-acceleration') return i18n.t('control:advisorBubble.headlineEndAcceleration')
  if (id.startsWith('cap-')) return i18n.t('control:advisorBubble.headlineCap')
  if (id.startsWith('cat-dominance-')) return i18n.t('control:advisorBubble.headlineCatDominance')
  if (id.startsWith('zombie-')) return i18n.t('control:advisorBubble.headlineZombie')
  if (id.startsWith('hike-')) return i18n.t('control:advisorBubble.headlineHike')
  if (id.startsWith('undetected-sub-')) return i18n.t('control:advisorBubble.headlineUndetectedSub')
  if (id.startsWith('member-imbalance-')) return i18n.t('control:advisorBubble.headlineMemberImbalance')
  if (id.startsWith('income-volatility')) return i18n.t('control:advisorBubble.headlineIncomeVolatility')
  if (id.startsWith('sub-usage-')) return i18n.t('control:advisorBubble.headlineSubUsage')
  return task.cat || i18n.t('control:advisorBubble.headlineFallback')
}

/**
 * Chat-style intro tag ("⚠️ Una urgente", "Algo raro encontré"). Adds
 * personality to the conversation without being cute.
 */
export function bubbleIntro(task: ControlAdvisorTask): string {
  const type = bubbleType(task)
  if (type === 'critical') return i18n.t('control:advisorBubble.introCritical')
  if (type === 'positive') {
    if (task.id === 'streak-ok') return i18n.t('control:advisorBubble.introStreakOk')
    return i18n.t('control:advisorBubble.introPositive')
  }
  if (task.id.startsWith('zombie-') || task.id.startsWith('undetected-sub-')) {
    return i18n.t('control:advisorBubble.introSubscription')
  }
  if (type === 'warning') return i18n.t('control:advisorBubble.introWarning')
  return i18n.t('control:advisorBubble.introNeutral')
}

// ─── Impact chip copy ─────────────────────────────────────────────────────

/**
 * Label for the impact chip ("Sobregiro proyectado", "Ahorro anual",
 * "Si bajas 10%"). Falls back to a generic label when the signal id
 * isn't recognized.
 */
export function impactChipLabel(task: ControlAdvisorTask): string {
  const id = task.id
  if (id === 'recovery-hard' || id === 'recovery-soft') return i18n.t('control:advisorBubble.impactRecorteRequerido')
  if (id === 'velocity') return i18n.t('control:advisorBubble.impactSobregiroProyectado')
  if (id === 'positive-forecast') return i18n.t('control:advisorBubble.impactMovimientoSugerido')
  if (id === 'savings-over') return i18n.t('control:advisorBubble.impactAdelantoPlan')
  if (id === 'savings-feasibility') return i18n.t('control:advisorBubble.impactFaltaEsteMes')
  if (id === 'streak-ok') return i18n.t('control:advisorBubble.impactRefuerzo')
  if (id === 'cat-win') return i18n.t('control:advisorBubble.impactAhorroHistorico')
  if (id === 'cat-accel') return i18n.t('control:advisorBubble.impactSiVuelvesPromedio')
  if (id === 'small-leaks') return i18n.t('control:advisorBubble.impactTotalFiltraciones')
  if (id === 'night-impulse') return i18n.t('control:advisorBubble.impactSiBajas20')
  if (id === 'weekly-pattern') return i18n.t('control:advisorBubble.impactPremiumSemanal')
  if (id === 'fijos-ratio') return i18n.t('control:advisorBubble.impactExcesoUmbral')
  if (id === 'stress-week') return i18n.t('control:advisorBubble.impactAReservar')
  if (id === 'payday-proximity')
    return i18n.t(
      task.bubbleFrame === 'cycle'
        ? 'control:advisorBubble.impactHastaFinDeCiclo'
        : 'control:advisorBubble.impactHastaCobro',
    )
  if (id === 'start-splurge') return i18n.t('control:advisorBubble.impactSobreGastoInicial')
  if (id === 'end-acceleration') return i18n.t('control:advisorBubble.impactAceleracionCierre')
  if (id.startsWith('zombie-')) return i18n.t('control:advisorBubble.impactAhorroAnual')
  if (id.startsWith('hike-')) return i18n.t('control:advisorBubble.impactSubaMensual')
  if (id.startsWith('cap-')) return i18n.t('control:advisorBubble.impactExcedente')
  if (id.startsWith('cat-dominance-')) return i18n.t('control:advisorBubble.impactSiBajas10')
  if (id.startsWith('undetected-sub-')) return i18n.t('control:advisorBubble.impactSuscripcionAnual')
  if (id.startsWith('member-imbalance-')) return i18n.t('control:advisorBubble.impactCargaMiembro')
  if (id.startsWith('income-volatility')) return i18n.t('control:advisorBubble.impactDeltaIngreso')
  if (id.startsWith('sub-usage-')) return i18n.t('control:advisorBubble.impactCostoMensual')
  return i18n.t('control:advisorBubble.impactFallback')
}
