import {
  type ActionIntentRecord,
  type AuditFeedItem,
  type Classification,
  COOLDOWN_INDECISA_DAYS,
  COOLDOWN_INTENT_ABANDONED_DAYS,
  COOLDOWN_NO_ZOMBIE_DAYS,
  COOLDOWN_PARCIAL_DAYS,
  COOLDOWN_USO_DESIGUAL_DAYS,
  type EngineInput,
  type EngineResult,
  type FamilyMemberRow,
  type FixedExpenseRow,
  MIN_AGE_DAYS,
  type PaymentRow,
  POST_DUE_GRACE_DAYS,
  type UsageAuditRecord,
} from './types'
import { periodOf } from './period'
import { DAY_MS } from '@/utils/time'

const ALLOWED_FREQUENCIES = new Set(['weekly', 'biweekly', 'monthly'])

function ageDays(createdAtIso: string, now: Date): number {
  const created = Date.parse(createdAtIso)
  if (Number.isNaN(created)) return 0
  return Math.floor((now.getTime() - created) / DAY_MS)
}

function daysAgo(iso: string, now: Date): number {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return Infinity
  return Math.floor((now.getTime() - t) / DAY_MS)
}

export function isAuditCandidate(fijo: FixedExpenseRow, now: Date): boolean {
  if (fijo.kind !== 'recurring') return false
  if (fijo.status !== 'active') return false
  if (fijo.categoryName !== 'Suscripciones') return false
  if (fijo.categoryScope !== 'fixed_expense') return false
  if (!ALLOWED_FREQUENCIES.has(fijo.frequency)) return false
  if (ageDays(fijo.createdAt, now) < MIN_AGE_DAYS) return false
  return true
}

export function classifyAudit(
  audits: UsageAuditRecord[],
  members: FamilyMemberRow[],
): Classification {
  const totalMembers = Math.max(members.length, 1)
  const responseRate = audits.length / totalMembers
  if (responseRate < 0.5) return 'parcial'

  const levels = new Set(audits.map((a) => a.level))
  const hasMucho = levels.has('mucho')
  const hasAVeces = levels.has('a_veces')
  const hasCasiNunca = levels.has('casi_nunca')

  if (hasCasiNunca && (hasMucho || hasAVeces)) return 'uso_desigual'
  if (hasCasiNunca) return 'zombie_consensuado'
  if (hasMucho) return 'no_zombie'
  if (hasAVeces) return 'indecisa'
  return 'parcial'
}

function cooldownDaysFor(classification: Classification): number {
  switch (classification) {
    case 'no_zombie':
      return COOLDOWN_NO_ZOMBIE_DAYS
    case 'indecisa':
      return COOLDOWN_INDECISA_DAYS
    case 'uso_desigual':
      return COOLDOWN_USO_DESIGUAL_DAYS
    case 'parcial':
      return COOLDOWN_PARCIAL_DAYS
    case 'zombie_consensuado':
      return 0
  }
}

export function isInCooldown(
  audits: UsageAuditRecord[],
  intents: ActionIntentRecord[],
  now: Date,
  members: FamilyMemberRow[],
): boolean {
  const currentPeriod = periodOf(now)
  const closedAudits = audits.filter((a) => a.period !== currentPeriod)
  if (closedAudits.length > 0) {
    const periods = [...new Set(closedAudits.map((a) => a.period))].sort().reverse()
    const latestPeriod = periods[0]
    const group = closedAudits.filter((a) => a.period === latestPeriod)
    const classification = classifyAudit(group, members)
    const cooldown = cooldownDaysFor(classification)
    if (cooldown > 0) {
      const latestCreated = group.reduce(
        (max, a) => (a.createdAt > max ? a.createdAt : max),
        group[0].createdAt,
      )
      if (daysAgo(latestCreated, now) < cooldown) return true
    }
  }

  const abandonedIntent = intents
    .filter((i) => i.resolution === 'abandoned' && i.resolvedAt)
    .sort((a, b) => ((a.resolvedAt ?? '') < (b.resolvedAt ?? '') ? 1 : -1))[0]
  if (
    abandonedIntent?.resolvedAt &&
    daysAgo(abandonedIntent.resolvedAt, now) < COOLDOWN_INTENT_ABANDONED_DAYS
  ) {
    return true
  }

  return false
}

function nextDueDate(fijo: FixedExpenseRow): Date | null {
  if (!fijo.nextDueOn) return null
  const d = new Date(fijo.nextDueOn)
  return Number.isNaN(d.getTime()) ? null : d
}

function followUpKind(
  intent: ActionIntentRecord | null,
  fijo: FixedExpenseRow,
  payments: PaymentRow[],
  now: Date,
): AuditFeedItem['followUpKind'] {
  if (!intent || intent.resolvedAt) return null
  const declared = new Date(intent.declaredAt)
  const due = nextDueDate(fijo)
  const paymentAfterDeclared = payments
    .filter((p) => p.fixedExpenseId === fijo.id)
    .find((p) => Date.parse(p.createdAt) > declared.getTime())

  if (paymentAfterDeclared) return 'payment_recurred'
  if (due && now.getTime() > due.getTime() + POST_DUE_GRACE_DAYS * 86_400_000) {
    return 'no_payment_after_due'
  }
  return 'awaiting_post_due'
}

export function buildFeed(input: EngineInput): EngineResult {
  const { fixedExpenses, audits, intents, payments, members, now } = input
  const feed: AuditFeedItem[] = []
  const currentPeriod = periodOf(now)

  for (const fijo of fixedExpenses) {
    const fijoIntents = intents.filter((i) => i.fixedExpenseId === fijo.id)
    const openIntent = fijoIntents.find((i) => i.resolvedAt === null) ?? null

    // Open intents bypass the candidacy filter so we keep showing follow-ups
    // even after the fijo is paused/archived in unusual race scenarios.
    if (!openIntent && !isAuditCandidate(fijo, now)) continue

    const fijoAudits = audits.filter((a) => a.fixedExpenseId === fijo.id)

    if (!openIntent && isInCooldown(fijoAudits, fijoIntents, now, members)) continue

    const currentAudits = fijoAudits.filter((a) => a.period === currentPeriod)

    let classification: AuditFeedItem['classification']
    if (openIntent) {
      const intentPeriod = periodOf(new Date(openIntent.declaredAt))
      const intentAudits = fijoAudits.filter((a) => a.period === intentPeriod)
      classification = classifyAudit(intentAudits, members)
    } else if (currentAudits.length === 0) {
      classification = 'pending_audit'
    } else {
      classification = classifyAudit(currentAudits, members)
    }

    feed.push({
      fixedExpenseId: fijo.id,
      classification,
      audits: currentAudits,
      openIntent,
      followUpKind: openIntent ? followUpKind(openIntent, fijo, payments, now) : null,
    })
  }

  return { feed }
}
