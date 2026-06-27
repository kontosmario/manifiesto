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
  display_name: string | null
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
        // `family_members → profiles` has no PostgREST-discoverable
        // FK (the join lives at the auth.users level), so the canonical
        // pattern in this codebase is two queries: fetch member ids,
        // then resolve display names from `profiles` by id. See
        // `use-family-members-detail.ts` for the same shape.
        (async (): Promise<{
          data: FamilyMemberDbRow[] | null
          error: Error | null
        }> => {
          const m = await supabase
            .from('family_members')
            .select('user_id')
            .eq('family_id', familyId)
          if (m.error) return { data: null, error: m.error }
          const ids = (m.data ?? []).map((r) => r.user_id as string)
          if (ids.length === 0) return { data: [], error: null }
          const p = await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', ids)
          if (p.error) return { data: null, error: p.error }
          const nameById = new Map<string, string | null>(
            (p.data ?? []).map((row) => [
              row.id as string,
              typeof row.display_name === 'string' ? row.display_name : null,
            ]),
          )
          return {
            data: ids.map((user_id) => ({
              user_id,
              display_name: nameById.get(user_id) ?? null,
            })),
            error: null,
          }
        })(),
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
              // RAW name (no localizar): este campo SOLO alimenta el gate
              // del engine (categoryName === 'Suscripciones'), nunca se
              // muestra. Localizarlo rompía la feature en EN (en inglés el
              // display es 'Subscriptions' y el gate nunca matcheaba).
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
          (m: FamilyMemberDbRow): FamilyMemberRow => ({
            userId: m.user_id,
            name: m.display_name ?? '',
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
