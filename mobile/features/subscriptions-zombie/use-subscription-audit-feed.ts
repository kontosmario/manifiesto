import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subscriptionsZombieQueryKeys } from './query-keys'
import { buildFeed } from './subscription-audit-engine'
import type {
  ActionIntentRecord,
  EngineResult,
  FamilyMemberRow,
  FixedExpenseRow,
  PaymentRow,
  UsageAuditRecord,
} from './types'

interface RawData {
  fixedExpenses: FixedExpenseRow[]
  audits: UsageAuditRecord[]
  intents: ActionIntentRecord[]
  payments: PaymentRow[]
  members: FamilyMemberRow[]
}

interface FixedExpenseDbRow {
  id: string
  family_id: string
  name: string
  amount: number | string
  kind: string
  status: string
  frequency: string
  category_id: string | null
  next_due_on: string | null
  last_paid_at: string | null
  created_at: string
  // Supabase types nested selects as arrays even for to-one relations.
  categories: { name: string; scope: string }[] | { name: string; scope: string } | null
}

interface UsageAuditDbRow {
  id: string
  fixed_expense_id: string
  family_id: string
  user_id: string
  period: string
  level: 'mucho' | 'a_veces' | 'casi_nunca'
  created_at: string
}

interface ActionIntentDbRow {
  id: string
  fixed_expense_id: string
  family_id: string
  user_id: string | null
  intent: 'cancel' | 'pause' | 'downgrade'
  declared_at: string
  resolved_at: string | null
  resolution: 'completed' | 'abandoned' | null
  notes: string | null
}

interface PaymentDbRow {
  id: string
  fixed_expense_id: string
  created_at: string
}

interface FamilyMemberDbRow {
  user_id: string
  profiles:
    | { display_name: string | null }[]
    | { display_name: string | null }
    | null
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

interface FeedResult {
  data: EngineResult | undefined
  raw: RawData | undefined
  isLoading: boolean
  error: Error | null
}

export function useSubscriptionAuditFeed(familyId?: string): FeedResult {
  const query = useQuery<RawData>({
    queryKey: subscriptionsZombieQueryKeys.feed(familyId),
    enabled: Boolean(familyId),
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      if (!familyId) {
        return { fixedExpenses: [], audits: [], intents: [], payments: [], members: [] }
      }

      const [fijos, audits, intents, payments, members] = await Promise.all([
        supabase
          .from('fixed_expenses')
          .select(
            'id, family_id, name, amount, kind, status, frequency, category_id, next_due_on, last_paid_at, created_at, categories(name, scope)',
          )
          .eq('family_id', familyId),
        supabase
          .from('fixed_expense_usage_audit')
          .select('*')
          .eq('family_id', familyId),
        supabase
          .from('fixed_expense_action_intent')
          .select('*')
          .eq('family_id', familyId),
        // `fixed_expense_payments` has no `family_id` column — scope via
        // an inner join through `fixed_expenses` instead.
        supabase
          .from('fixed_expense_payments')
          .select('id, fixed_expense_id, created_at, fixed_expenses!inner(family_id)')
          .eq('fixed_expenses.family_id', familyId),
        supabase
          .from('family_members')
          .select('user_id, profiles(display_name)')
          .eq('family_id', familyId),
      ])

      if (fijos.error) throw fijos.error
      if (audits.error) throw audits.error
      if (intents.error) throw intents.error
      if (payments.error) throw payments.error
      if (members.error) throw members.error

      return {
        fixedExpenses: (fijos.data ?? []).map(
          (r: FixedExpenseDbRow): FixedExpenseRow => {
            const cat = pickOne(r.categories)
            return {
              id: r.id,
              familyId: r.family_id,
              name: r.name,
              amount: Number(r.amount),
              kind: r.kind,
              status: r.status,
              frequency: r.frequency,
              categoryId: r.category_id,
              categoryName: cat?.name ?? null,
              categoryScope: cat?.scope ?? null,
              nextDueOn: r.next_due_on,
              lastPaidAt: r.last_paid_at,
              createdAt: r.created_at,
            }
          },
        ),
        audits: (audits.data ?? []).map(
          (a: UsageAuditDbRow): UsageAuditRecord => ({
            id: a.id,
            fixedExpenseId: a.fixed_expense_id,
            familyId: a.family_id,
            userId: a.user_id,
            period: a.period,
            level: a.level,
            createdAt: a.created_at,
          }),
        ),
        intents: (intents.data ?? []).map(
          (i: ActionIntentDbRow): ActionIntentRecord => ({
            id: i.id,
            fixedExpenseId: i.fixed_expense_id,
            familyId: i.family_id,
            userId: i.user_id,
            intent: i.intent,
            declaredAt: i.declared_at,
            resolvedAt: i.resolved_at,
            resolution: i.resolution,
            notes: i.notes,
          }),
        ),
        payments: (payments.data ?? []).map(
          (p: PaymentDbRow): PaymentRow => ({
            id: p.id,
            fixedExpenseId: p.fixed_expense_id,
            createdAt: p.created_at,
          }),
        ),
        members: (members.data ?? []).map(
          (m: FamilyMemberDbRow): FamilyMemberRow => {
            const profile = pickOne(m.profiles)
            return {
              userId: m.user_id,
              name: profile?.display_name ?? '',
            }
          },
        ),
      }
    },
  })

  const feed = useMemo<EngineResult | undefined>(() => {
    if (!query.data) return undefined
    return buildFeed({ ...query.data, now: new Date() })
  }, [query.data])

  return {
    data: feed,
    raw: query.data,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  }
}
