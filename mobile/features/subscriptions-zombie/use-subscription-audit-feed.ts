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
        supabase
          .from('fixed_expense_payments')
          .select('id, fixed_expense_id, payment_period, amount, created_at')
          .eq('family_id', familyId),
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
          (r: any): FixedExpenseRow => ({
            id: r.id,
            familyId: r.family_id,
            name: r.name,
            amount: Number(r.amount),
            kind: r.kind,
            status: r.status,
            frequency: r.frequency,
            categoryId: r.category_id,
            categoryName: r.categories?.name ?? null,
            categoryScope: r.categories?.scope ?? null,
            nextDueOn: r.next_due_on,
            lastPaidAt: r.last_paid_at,
            createdAt: r.created_at,
          }),
        ),
        audits: (audits.data ?? []).map(
          (a: any): UsageAuditRecord => ({
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
          (i: any): ActionIntentRecord => ({
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
          (p: any): PaymentRow => ({
            id: p.id,
            fixedExpenseId: p.fixed_expense_id,
            paymentPeriod: p.payment_period,
            amount: Number(p.amount),
            createdAt: p.created_at,
          }),
        ),
        members: (members.data ?? []).map(
          (m: any): FamilyMemberRow => ({
            userId: m.user_id,
            name: m.profiles?.display_name ?? '',
          }),
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
