export type UsageLevel = 'mucho' | 'a_veces' | 'casi_nunca'

export type IntentKind = 'cancel' | 'pause' | 'downgrade'

export type IntentResolution = 'completed' | 'abandoned'

export type Classification =
  | 'zombie_consensuado'
  | 'no_zombie'
  | 'indecisa'
  | 'uso_desigual'
  | 'parcial'

export interface UsageAuditRecord {
  id: string
  fixedExpenseId: string
  familyId: string
  userId: string
  period: string
  level: UsageLevel
  createdAt: string
}

export interface ActionIntentRecord {
  id: string
  fixedExpenseId: string
  familyId: string
  userId: string | null
  intent: IntentKind
  declaredAt: string
  resolvedAt: string | null
  resolution: IntentResolution | null
  notes: string | null
}

export interface FixedExpenseRow {
  id: string
  familyId: string
  name: string
  amount: number
  kind: string
  status: string
  frequency: string
  categoryId: string | null
  categoryName: string | null
  categoryScope: string | null
  nextDueOn: string | null
  lastPaidAt: string | null
  createdAt: string
}

export interface FamilyMemberRow {
  userId: string
  name: string
}

export interface PaymentRow {
  id: string
  fixedExpenseId: string
  createdAt: string
}

export interface AuditFeedItem {
  fixedExpenseId: string
  classification: Classification | 'pending_audit'
  audits: UsageAuditRecord[]
  openIntent: ActionIntentRecord | null
  followUpKind: 'awaiting_post_due' | 'payment_recurred' | 'no_payment_after_due' | null
}

export interface EngineInput {
  fixedExpenses: FixedExpenseRow[]
  audits: UsageAuditRecord[]
  intents: ActionIntentRecord[]
  payments: PaymentRow[]
  members: FamilyMemberRow[]
  now: Date
}

export interface EngineResult {
  feed: AuditFeedItem[]
}

export const MIN_AGE_DAYS = 60
export const AUDIT_OPEN_DAYS = 14
export const POST_DUE_GRACE_DAYS = 5
export const COOLDOWN_NO_ZOMBIE_DAYS = 180
export const COOLDOWN_INDECISA_DAYS = 90
export const COOLDOWN_USO_DESIGUAL_DAYS = 180
export const COOLDOWN_PARCIAL_DAYS = 60
export const COOLDOWN_INTENT_ABANDONED_DAYS = 180
