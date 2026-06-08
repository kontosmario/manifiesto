# Month-Close Leftover Decision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal**: Cuando un mes financiero cierra con sobrante > umbral, mostrar sheet con 3 opciones (meta de ahorro / acumular / reserva) o "skip". Persistir la decisión por (family, month) para no re-promptear.

**Architecture**: Nueva tabla `month_close_decisions`. Nueva columna `family_finance.monthly_reserve_amount`. Nuevo RPC `apply_month_close_decision(month_iso, sobrante, decision, meta_goal_id?)` que atomically:
- Inserta en `month_close_decisions`
- Para `meta`: llama internamente al patrón de `add_savings_contribution` 
- Para `acumular`: bumpea `current_cycle_starting_balance + current_cycle_anchor`
- Para `reserva`: bumpea `monthly_reserve_amount`
- Para `skip`: solo INSERT

**Tech**: Supabase plpgsql, TypeScript + Expo, Vitest unit + integration.

**Spec**: `docs/superpowers/specs/2026-06-05-month-close-leftover-decision-design.md`

**V1 MVP**: sheet + DB + decisión. Reserve display en Home + Settings → V2.

---

## Tasks

### Task 1: Migración SQL — tabla + columna + RLS + RPC

**File**: `supabase/migrations/20260605120000_month_close_decision.sql`

```sql
-- supabase/migrations/20260605120000_month_close_decision.sql
--
-- Spec B: cuando un mes cierra con sobrante, persistir la decisión del user.
-- Tabla month_close_decisions + columna monthly_reserve_amount + RPC atómico.

alter table public.family_finance
  add column if not exists monthly_reserve_amount numeric(12,2) not null default 0
    check (monthly_reserve_amount >= 0);

create table if not exists public.month_close_decisions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  month_iso text not null check (month_iso ~ '^\d{4}-\d{2}-\d{2}$'),
  sobrante numeric(12,2) not null check (sobrante >= 0),
  decision text not null check (decision in ('meta', 'acumular', 'reserva', 'skip')),
  meta_goal_id uuid null references public.savings_goals(id) on delete set null,
  decided_at timestamptz not null default now(),
  decided_by uuid not null references auth.users(id),
  unique(family_id, month_iso)
);

alter table public.month_close_decisions enable row level security;

drop policy if exists "month_close_decisions read" on public.month_close_decisions;
create policy "month_close_decisions read"
  on public.month_close_decisions for select
  using (
    exists (
      select 1 from public.family_members fm
      where fm.family_id = month_close_decisions.family_id
        and fm.user_id = auth.uid()
        and fm.role <> 'blocked'
    )
  );

drop policy if exists "month_close_decisions insert via rpc" on public.month_close_decisions;
-- INSERTs solo via RPC (security definer). RLS bloquea writes directos
-- desde el cliente para garantizar atomicidad con savings_goals etc.
create policy "month_close_decisions insert via rpc"
  on public.month_close_decisions for insert
  with check (false);

create or replace function public.apply_month_close_decision(
  p_family_id uuid,
  p_month_iso text,
  p_sobrante numeric,
  p_decision text,
  p_meta_goal_id uuid default null,
  p_new_cycle_anchor text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  if not exists (
    select 1 from public.family_members
    where family_id = p_family_id and user_id = v_user_id and role <> 'blocked'
  ) then
    raise exception 'Not a family member';
  end if;

  if p_decision not in ('meta', 'acumular', 'reserva', 'skip') then
    raise exception 'invalid decision';
  end if;

  if p_decision = 'meta' and p_meta_goal_id is null then
    raise exception 'meta decision requires meta_goal_id';
  end if;

  -- Atomicidad: la insertion en month_close_decisions es el lock.
  -- Si ya existe la unique constraint salta — no double-apply.
  insert into public.month_close_decisions (
    family_id, month_iso, sobrante, decision, meta_goal_id, decided_by
  ) values (
    p_family_id, p_month_iso, p_sobrante, p_decision, p_meta_goal_id, v_user_id
  );

  if p_decision = 'meta' then
    -- Aportar a la meta existente
    update public.savings_goals
       set current_amount = current_amount + p_sobrante,
           updated_at = now()
     where id = p_meta_goal_id and family_id = p_family_id;
  elsif p_decision = 'acumular' then
    if p_new_cycle_anchor is null then
      raise exception 'acumular decision requires new_cycle_anchor';
    end if;
    update public.family_finance
       set current_cycle_starting_balance =
             coalesce(current_cycle_starting_balance, 0) + p_sobrante,
           current_cycle_anchor = p_new_cycle_anchor,
           updated_at = now()
     where family_id = p_family_id;
  elsif p_decision = 'reserva' then
    update public.family_finance
       set monthly_reserve_amount = monthly_reserve_amount + p_sobrante,
           updated_at = now()
     where family_id = p_family_id;
  end if;
  -- 'skip' no requiere updates extras.
end;
$$;

revoke all on function public.apply_month_close_decision(uuid, text, numeric, text, uuid, text) from public;
grant execute on function public.apply_month_close_decision(uuid, text, numeric, text, uuid, text) to authenticated;
```

- [ ] Step 1: crear migración con el SQL de arriba
- [ ] Step 2: `npx supabase db push --linked`
- [ ] Step 3: smoke contra DB:
  ```sql
  -- Verificar tabla
  select count(*) from month_close_decisions;
  -- Verificar columna
  select monthly_reserve_amount from family_finance limit 1;
  -- Verificar función existe
  select proname from pg_proc where proname = 'apply_month_close_decision';
  ```
- [ ] Step 4: commit
  ```bash
  git add supabase/migrations/20260605120000_month_close_decision.sql
  git commit -m "feat(db): month-close decisions table + monthly_reserve column + apply RPC"
  ```

---

### Task 2: Helper TS para computar sobrante + tests

**Files**:
- Create: `mobile/utils/month-close-sobrante.ts`
- Create: `tests/unit/month-close-sobrante.test.ts`

TDD pattern:

```ts
// tests/unit/month-close-sobrante.test.ts
import { describe, expect, it } from 'vitest'
import { computeMonthCloseSobrante } from '@/utils/month-close-sobrante'

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('computeMonthCloseSobrante', () => {
  const lastMonthStart = D(2026, 5, 1)
  const lastMonthEnd = D(2026, 6, 1)

  it('returns positive sobrante when expenses < income', () => {
    expect(computeMonthCloseSobrante({
      lastMonthStart, lastMonthEnd,
      monthlyIncome: 1_000_000,
      expenses: [
        { created_at: '2026-05-15T12:00:00Z', price: 300_000 } as any,
        { created_at: '2026-05-20T12:00:00Z', price: 200_000 } as any,
      ],
      savingsContributedThisMonth: 100_000,
    })).toBe(400_000) // 1M - 500k - 100k
  })

  it('clamps to zero when expenses exceed income', () => {
    expect(computeMonthCloseSobrante({
      lastMonthStart, lastMonthEnd,
      monthlyIncome: 100_000,
      expenses: [{ created_at: '2026-05-10T12:00:00Z', price: 500_000 } as any],
      savingsContributedThisMonth: 0,
    })).toBe(0)
  })

  it('ignores expenses outside the window', () => {
    expect(computeMonthCloseSobrante({
      lastMonthStart, lastMonthEnd,
      monthlyIncome: 1_000_000,
      expenses: [
        { created_at: '2026-04-30T12:00:00Z', price: 999_999 } as any, // antes
        { created_at: '2026-06-01T12:00:00Z', price: 999_999 } as any, // después
      ],
      savingsContributedThisMonth: 0,
    })).toBe(1_000_000)
  })
})
```

```ts
// mobile/utils/month-close-sobrante.ts
import type { Expense } from '@/features/expenses/expense-repository.model'

export interface MonthCloseSobranteInput {
  lastMonthStart: Date
  lastMonthEnd: Date // exclusive
  monthlyIncome: number
  expenses: Expense[]
  savingsContributedThisMonth: number
}

export function computeMonthCloseSobrante(input: MonthCloseSobranteInput): number {
  const startMs = input.lastMonthStart.getTime()
  const endMs = input.lastMonthEnd.getTime()
  const gastos = input.expenses.reduce((acc, e) => {
    const t = new Date(e.created_at).getTime()
    if (t >= startMs && t < endMs) return acc + Number(e.price)
    return acc
  }, 0)
  return Math.max(0, input.monthlyIncome - gastos - input.savingsContributedThisMonth)
}
```

- [ ] Step 1: tests RED
- [ ] Step 2: implementar utils file
- [ ] Step 3: tests GREEN — 3/3
- [ ] Step 4: commit
  ```bash
  git add mobile/utils/month-close-sobrante.ts tests/unit/month-close-sobrante.test.ts
  git commit -m "feat(utils): computeMonthCloseSobrante"
  ```

---

### Task 3: Hook `useMonthCloseDecision` — query + mutation

**File**: `mobile/features/month-close/use-month-close-decision.ts` (carpeta nueva).

Surface:
- Query: `useMonthCloseDecisionPending(familyId)` → devuelve `{ pending: boolean, sobrante: number, monthIso: string, lastMonth: { start, end } } | null`
- Mutation: `useApplyMonthCloseDecision(familyId)` → llama RPC con params.

```ts
import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'
import { computeMonthlyAccountingWindow } from '@/utils/monthly-accounting'
import { computeMonthCloseSobrante } from '@/utils/month-close-sobrante'
import { normalizeToStartOfDay, formatLocalDateKey } from '@/utils/pay-cycle'

const SOBRANTE_THRESHOLD = 1000 // pesos ARS — umbral para promptear

export const monthCloseDecisionQueryKey = (familyId?: string, monthIso?: string) =>
  ['month-close-decision', familyId, monthIso] as const

interface PendingDecision {
  monthIso: string
  sobrante: number
  lastMonthStart: Date
  lastMonthEnd: Date
}

/**
 * Detecta si hay un mes pasado sin decisión persistida y con sobrante
 * sobre el umbral. Devuelve null cuando no aplica.
 */
export function useMonthCloseDecisionPending(familyId?: string): PendingDecision | null {
  const finance = useFamilyFinance(familyId)
  const dashboard = useFamilyDashboard(familyId)
  const today = useMemo(() => normalizeToStartOfDay(new Date()), [])

  // Compute lastMonth window
  const lastMonth = useMemo(() => {
    const config = financeToCycleConfig(finance.data)
    // El mes pasado: monthlyAccounting de (today − 1 día respecto al inicio del mes actual)
    const currentMa = computeMonthlyAccountingWindow(config, today)
    const beforeCurrent = new Date(currentMa.start)
    beforeCurrent.setDate(beforeCurrent.getDate() - 1)
    return computeMonthlyAccountingWindow(config, beforeCurrent)
  }, [finance.data, today])

  const monthIso = formatLocalDateKey(lastMonth.start)

  // Query: ¿ya hay decisión persistida para este mes?
  const decisionQuery = useQuery({
    queryKey: monthCloseDecisionQueryKey(familyId, monthIso),
    enabled: Boolean(familyId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!familyId) return null
      const { data, error } = await supabase
        .from('month_close_decisions')
        .select('id, decision')
        .eq('family_id', familyId)
        .eq('month_iso', monthIso)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  if (decisionQuery.data) return null // ya decidió (o skipeó)

  const expenses = dashboard.expensesQuery.data ?? []
  const monthlyIncome = dashboard.familyFinanceQuery.data?.monthly_income ?? 0
  // V1: no trackeamos savings contribution per month aún. Asumimos 0.
  const savingsContributedThisMonth = 0
  const sobrante = computeMonthCloseSobrante({
    lastMonthStart: lastMonth.start,
    lastMonthEnd: lastMonth.end,
    monthlyIncome,
    expenses,
    savingsContributedThisMonth,
  })

  if (sobrante < SOBRANTE_THRESHOLD) return null
  return {
    monthIso,
    sobrante,
    lastMonthStart: lastMonth.start,
    lastMonthEnd: lastMonth.end,
  }
}

export interface ApplyDecisionInput {
  monthIso: string
  sobrante: number
  decision: 'meta' | 'acumular' | 'reserva' | 'skip'
  metaGoalId?: string
  newCycleAnchor?: string
}

export function useApplyMonthCloseDecision(familyId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ApplyDecisionInput) => {
      if (!familyId) throw new Error('familyId requerido')
      const { error } = await supabase.rpc('apply_month_close_decision', {
        p_family_id: familyId,
        p_month_iso: input.monthIso,
        p_sobrante: input.sobrante,
        p_decision: input.decision,
        p_meta_goal_id: input.metaGoalId ?? null,
        p_new_cycle_anchor: input.newCycleAnchor ?? null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['month-close-decision', familyId] }),
        queryClient.invalidateQueries({ queryKey: ['family-finance', familyId] }),
        queryClient.invalidateQueries({ queryKey: ['savings-goal', familyId] }),
      ])
    },
  })
}
```

- [ ] Step 1: crear file
- [ ] Step 2: typecheck + bundle
- [ ] Step 3: commit
  ```bash
  git add mobile/features/month-close/use-month-close-decision.ts
  git commit -m "feat(month-close): hook for pending decision detection + apply mutation"
  ```

---

### Task 4: Sheet UI `MonthCloseDecisionSheet`

**File**: `mobile/components/home/sheets/month-close-decision-sheet.tsx`

Patrón: `ModalCard` (como `EditCycleConfigSheet`).

API:
```tsx
interface Props {
  visible: boolean
  pending: PendingDecision
  activeGoal: { id: string; title: string; emoji: string } | null
  onApply: (decision: ApplyDecisionInput) => void | Promise<void>
  onSkip: () => void
  onClose: () => void
  isApplying: boolean
}
```

Contenido del sheet:
- Header: "Cerraste mayo con $X a favor"  (string: `Cerraste ${monthName} con ${formatMoney(sobrante)} a favor`)
- 3 cards de opciones (Pressable seleccionable):
  1. 🎯 `activeGoal ? "Sumar a ${title}" : "Crear meta nueva"`
  2. 📥 "Sumar al saldo de este mes"
  3. 🏦 "Guardar como reserva"
- CTA `<AppButton label="Confirmar" disabled={no selección o isApplying}>`
- Pressable texto chico abajo: "Decidir más tarde" → triggera `onSkip`

Selected state: borde + bg con tinte primary.

Para opción meta sin goal activo:
- Tap sobre la card expande inputs inline (título + monto objetivo + meses).
- En "Confirmar" se requiere primero crear la meta vía mutation existente `useUpsertSavingsGoal`, después aplicar la decisión con `meta_goal_id` retornado. La sheet maneja eso internamente.

- [ ] Step 1: implementar
- [ ] Step 2: typecheck + bundle
- [ ] Step 3: commit
  ```bash
  git add mobile/components/home/sheets/month-close-decision-sheet.tsx
  git commit -m "feat(ui): MonthCloseDecisionSheet — 3 opciones + skip"
  ```

---

### Task 5: Wirear al Home — `useMonthCloseDecisionPrompt`

**Files**:
- Modify: `mobile/components/home/home-dashboard.tsx`

En el body del componente:

```tsx
import { useMonthCloseDecisionPending, useApplyMonthCloseDecision } from '@/features/month-close/use-month-close-decision'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { MonthCloseDecisionSheet } from '@/components/home/sheets/month-close-decision-sheet'
import { formatLocalDateKey } from '@/utils/pay-cycle'

// dentro de HomeDashboard:
const pendingDecision = useMonthCloseDecisionPending(familyId)
const savingsGoalQuery = useSavingsGoal(familyId)
const applyDecision = useApplyMonthCloseDecision(familyId)
const [decisionSheetOpen, setDecisionSheetOpen] = useState(false)

useEffect(() => {
  if (pendingDecision && !decisionSheetOpen) {
    setDecisionSheetOpen(true)
  }
}, [pendingDecision])

const handleApplyDecision = useCallback(async (input: ApplyDecisionInput) => {
  await applyDecision.mutateAsync(input)
  setDecisionSheetOpen(false)
}, [applyDecision])

const handleSkipDecision = useCallback(async () => {
  if (!pendingDecision) return
  await applyDecision.mutateAsync({
    monthIso: pendingDecision.monthIso,
    sobrante: pendingDecision.sobrante,
    decision: 'skip',
  })
  setDecisionSheetOpen(false)
}, [applyDecision, pendingDecision])

// en el JSX:
{pendingDecision ? (
  <MonthCloseDecisionSheet
    visible={decisionSheetOpen}
    pending={pendingDecision}
    activeGoal={
      savingsGoalQuery.data && savingsGoalQuery.data.isActive
        ? { id: savingsGoalQuery.data.id, title: savingsGoalQuery.data.title, emoji: savingsGoalQuery.data.emoji }
        : null
    }
    onApply={handleApplyDecision}
    onSkip={handleSkipDecision}
    onClose={() => setDecisionSheetOpen(false)}
    isApplying={applyDecision.isPending}
  />
) : null}
```

(Adapt según signature real del `useSavingsGoal`.)

- [ ] Step 1: edit
- [ ] Step 2: typecheck + bundle
- [ ] Step 3: commit
  ```bash
  git add mobile/components/home/home-dashboard.tsx
  git commit -m "feat(home): mount MonthCloseDecisionSheet con auto-trigger on pending detection"
  ```

---

### Task 6: Integration test E2E

**File**: `tests/integration/month-close-decision-flow.test.ts`

Cubrir las 4 decisiones (meta / acumular / reserva / skip) end-to-end:

1. Seed family con monthly_income, expenses por monto controlado en el mes pasado
2. Llamar RPC `apply_month_close_decision` para cada uno de los 4
3. Verificar las consecuencias en DB (savings_goals.current_amount / current_cycle_starting_balance / monthly_reserve_amount)
4. Verificar que un segundo call con mismo (family, month) falla con violación unique

- [ ] Step 1: crear test
- [ ] Step 2: `npm run test:integration -- tests/integration/month-close-decision-flow.test.ts` → 4-5/4-5 PASS
- [ ] Step 3: commit

---

### Task 7: Verification + merge

- [ ] Step 1: full suite
- [ ] Step 2: smoke manual con cuenta forzada al cierre (manipular `lastSalaryConfirmedAt` para simular cierre)
- [ ] Step 3: merge a main

---

## Self-Review

- Spec coverage: 9 sections del spec mapean a Tasks 1-7 ✓
- Placeholders: ninguno ✓
- Type consistency: `ApplyDecisionInput` definido en hook, consumido en sheet + dashboard ✓
- V1 limitation documentada: `savingsContributedThisMonth=0` en hook (V2 lo agrega vía tracking)
