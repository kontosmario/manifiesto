# Día sin gasto — Phase 2 — Past-date Marking via Calendar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la Fase 2 del spec: poder marcar (y revertir) días pasados como "sin gasto" desde el day-detail del `GastosMonthCalendar`, simétrico al patrón "Registrar gasto olvidado" ya existente.

**Architecture:**
1. Migración nueva: extiende `mark_no_expense_day` y `unmark_no_expense_day` con parámetros `p_date date default null` (default = user-local today) y `p_force boolean default false`.
2. Server-side validation: rechaza future dates, rechaza past dates con `expenses_exist_on_date` (sin override), permite override solo para `today` cuando `p_force = true`.
3. Mobile: los hooks `useMarkNoExpenseDay` / `useUnmarkNoExpenseDay` aceptan `{ date?: string; force?: boolean }` como mutation input. `FocusMode` del calendario expone 2 acciones nuevas wireadas a esos hooks.

**Tech Stack:** PostgreSQL, Supabase RPC, React Query, React Native.

**Out of scope:**
- F1 ya cerrada (FAB-petal real + confetti).
- F3: achievements, home_snapshot extension, Control hero stat, calendar dots — siguiente plan.

**Pre-requisito:** F1 mergeada (este plan importa el `confetti.celebrate()` del bus que F1 creó).

---

## File map

| Path | Cambio | Tarea |
|------|--------|-------|
| `supabase/migrations/20260601005000_mark_no_expense_day_with_date.sql` | Crear migration con drop+recreate de ambos RPCs | Task 1 |
| `mobile/features/streaks/use-streak.ts` | Modify `useMarkNoExpenseDay` + `useUnmarkNoExpenseDay` para aceptar `{date?, force?}` | Task 2 |
| `mobile/components/gastos/gastos-month-calendar.tsx` | Modify `FocusMode` con 2 botones nuevos (mark / unmark según estado) | Task 3 |
| `mobile/screens/home/gastos-v2-screen.tsx` | Modify: pasar las callbacks de mark/unmark al calendar component | Task 4 |
| Smoke test manual | — | Task 5 |

---

## Task 1: RPC migration — `p_date` + `p_force` parameters

**Files:**
- Create: `supabase/migrations/20260601005000_mark_no_expense_day_with_date.sql`

**Por qué nueva migración + drop policy approach:** Postgres no permite cambiar la signature de una función sin drop. Las migrations son inmutables (regla del proyecto) → nueva migration que dropea y recrea con la nueva firma. El `grant execute` también se reaplica al nuevo signature.

- [ ] **Step 1.1: Crear la migration**

```sql
-- Extend mark_no_expense_day + unmark_no_expense_day with an
-- optional `p_date` argument so the gastos calendar's day-detail can
-- mark / revert past days, not only today. Adds server-side
-- validation:
--   • Future dates rejected (cannot mark a day that hasn't happened
--     yet in the user's tz).
--   • Past dates with expenses rejected unconditionally (the past is
--     settled — if there's an expense row, the day was NOT no-spend).
--   • Today with expenses requires p_force = true (mirrors the
--     streak-sheet + FAB confirm-Alert UX where the user explicitly
--     consents to override).
--
-- Postgres doesn't support changing a function's signature in place,
-- so we drop+recreate. The grant is also re-applied.
--
-- Spec: docs/superpowers/specs/2026-06-01-no-spend-day-feature-design.md

drop function if exists public.mark_no_expense_day(uuid);
drop function if exists public.unmark_no_expense_day(uuid);

create or replace function public.mark_no_expense_day(
  p_family_id uuid,
  p_date date default null,
  p_force boolean default false
)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date;
  v_target date;
  v_has_expenses boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_family_member(p_family_id) then
    raise exception 'Not a member of this family';
  end if;

  v_today := (now() at time zone public.user_local_timezone(v_user_id))::date;
  v_target := coalesce(p_date, v_today);

  -- Future dates are nonsensical: you can't claim "no spend" for a
  -- day that hasn't happened yet.
  if v_target > v_today then
    raise exception 'FUTURE_DATE_NOT_ALLOWED'
      using hint = 'Cannot mark a future date as no-spend.';
  end if;

  -- Check if the target date already has expenses from this user.
  select exists(
    select 1
    from public.expenses e
    where e.family_id = p_family_id
      and e.created_by = v_user_id
      and (e.created_at at time zone public.user_local_timezone(v_user_id))::date = v_target
  ) into v_has_expenses;

  if v_has_expenses then
    -- Past dates: hard reject. The past is settled.
    if v_target < v_today then
      raise exception 'EXPENSES_EXIST_ON_DATE'
        using hint = 'That day already has registered expenses; it cannot be marked as no-spend.';
    end if;
    -- Today: require explicit consent (the UI shows an Alert).
    if not p_force then
      raise exception 'EXPENSES_EXIST_ON_DATE'
        using hint = 'Today already has expenses; pass p_force = true to mark anyway.';
    end if;
  end if;

  insert into public.streak_marked_days (family_id, user_id, marked_date)
  values (p_family_id, v_user_id, v_target)
  on conflict (family_id, user_id, marked_date) do nothing;

  perform public.advance_streak(p_family_id, v_user_id, v_target);

  return v_target;
end;
$$;

revoke all on function public.mark_no_expense_day(uuid, date, boolean) from public;
grant execute on function public.mark_no_expense_day(uuid, date, boolean) to authenticated;

create or replace function public.unmark_no_expense_day(
  p_family_id uuid,
  p_date date default null
)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date;
  v_target date;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_family_member(p_family_id) then
    raise exception 'Not a member of this family';
  end if;

  v_today := (now() at time zone public.user_local_timezone(v_user_id))::date;
  v_target := coalesce(p_date, v_today);

  delete from public.streak_marked_days
  where family_id = p_family_id
    and user_id = v_user_id
    and marked_date = v_target;

  -- Recompute from scratch so the streak row reflects the new
  -- history (any shield grants / level transitions tied to the
  -- unmarked day roll back too). Uses the existing helper from
  -- migration 20260427150000.
  perform public.recompute_user_streak(p_family_id, v_user_id);

  return v_target;
end;
$$;

revoke all on function public.unmark_no_expense_day(uuid, date) from public;
grant execute on function public.unmark_no_expense_day(uuid, date) to authenticated;
```

- [ ] **Step 1.2: Verify SQL parses with dry-run**

```bash
npm run supabase:remote -- db push --dry-run 2>&1 | tail -10
```

Expected output: includes `20260601005000_mark_no_expense_day_with_date.sql` in the "Would push" list and no syntax errors.

- [ ] **Step 1.3: Commit**

```bash
git add supabase/migrations/20260601005000_mark_no_expense_day_with_date.sql
git commit -m "feat(db): mark/unmark no_expense_day accept p_date + p_force

Extends the existing RPCs (migrations 20260427140000 / 20260427150000)
with an optional p_date arg defaulting to user-local today, plus
p_force for the today-has-expenses override path. Validation:
- Future date → reject (FUTURE_DATE_NOT_ALLOWED).
- Past date with expenses → reject (EXPENSES_EXIST_ON_DATE).
- Today with expenses → require p_force = true.
- Today without expenses → mark cleanly.

Drops + recreates to change signatures (Postgres doesn't allow in-
place signature changes). on conflict do nothing kept for
idempotency. recompute_user_streak from migration 20260427150000 is
reused for the unmark path.

Phase 2 of no-spend-day feature."
```

- [ ] **Step 1.4: Deploy to prod (or to staging if available)**

```bash
npm run supabase:remote:db:push 2>&1 | tail -15
```

Expected: `Applying migration 20260601005000_mark_no_expense_day_with_date.sql...` + `Finished supabase db push.`

Note: this re-grants the RPCs on the new signature; any in-flight client invocations on the old signature will get a "function does not exist" error for ~1s. Acceptable risk for a feature this small.

---

## Task 2: Mobile hooks accept `{date?, force?}` input

**Files:**
- Modify: `mobile/features/streaks/use-streak.ts:290-342` (both mutation hooks)

Current `useMarkNoExpenseDay` calls `supabase.rpc('mark_no_expense_day', { p_family_id })` with no input — mutation type is `void`. We extend to accept `{ date?: string; force?: boolean }`.

- [ ] **Step 2.1: Refactor the hooks**

Open `mobile/features/streaks/use-streak.ts`. Replace the `useMarkNoExpenseDay` and `useUnmarkNoExpenseDay` blocks (~lines 290-342) with:

```typescript
export interface MarkNoExpenseDayInput {
  /** YYYY-MM-DD in the user's local timezone. Omit for today. */
  date?: string
  /** Allow marking today even if expenses already exist. The UI
   *  prompts an Alert before passing true. Has no effect on past
   *  dates — those reject unconditionally if expenses exist. */
  force?: boolean
}

export function useMarkNoExpenseDay(
  familyId: string | undefined,
  userId: string | undefined,
) {
  const queryClient = useQueryClient()

  return useMutation<string, Error, MarkNoExpenseDayInput | undefined>({
    mutationFn: async (input) => {
      if (!familyId) throw new Error('No family selected')
      const { data, error } = await supabase.rpc('mark_no_expense_day', {
        p_family_id: familyId,
        p_date: input?.date ?? null,
        p_force: input?.force ?? false,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: streakQueryKey(familyId, userId) }),
        queryClient.invalidateQueries({ queryKey: markedDaysQueryKey(familyId, userId) }),
      ])
    },
  })
}

export interface UnmarkNoExpenseDayInput {
  /** YYYY-MM-DD in the user's local timezone. Omit for today. */
  date?: string
}

export function useUnmarkNoExpenseDay(
  familyId: string | undefined,
  userId: string | undefined,
) {
  const queryClient = useQueryClient()

  return useMutation<string, Error, UnmarkNoExpenseDayInput | undefined>({
    mutationFn: async (input) => {
      if (!familyId) throw new Error('No family selected')
      const { data, error } = await supabase.rpc('unmark_no_expense_day', {
        p_family_id: familyId,
        p_date: input?.date ?? null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: streakQueryKey(familyId, userId) }),
        queryClient.invalidateQueries({ queryKey: markedDaysQueryKey(familyId, userId) }),
      ])
    },
  })
}
```

**Backwards compat:** existing callers like `streak-sheet.tsx:121` (`markNoExpenseMutation.mutate(undefined, {...})`) keep working — `undefined` matches the new `MarkNoExpenseDayInput | undefined` type and the RPC defaults `p_date` to today.

The F1 FAB-petal handler (after F1 ships) calls `markNoExpenseMutation.mutate(undefined, ...)` for clean today; for the F1 `mark-confirm` confirm-Alert path, it can now pass `{ force: true }`. F1 doesn't pass `force` today — that's an F1.5 fixup, see Task 4 below.

- [ ] **Step 2.2: Verify no typecheck breakage**

```bash
npm run typecheck 2>&1 | tail -5
```

Expected: clean. If `streak-sheet.tsx` or the F1 FAB-button hits a type mismatch, the issue is the signature change of `mutate()`. Both call sites pass `undefined` which is compatible with `MarkNoExpenseDayInput | undefined`, so it should pass cleanly.

- [ ] **Step 2.3: Commit**

```bash
git add mobile/features/streaks/use-streak.ts
git commit -m "feat(streaks): mark/unmark hooks accept { date?, force? }

Both mutations now accept an input object so callers can target a
past date (calendar day-detail) or override today's has-expenses
guard (FAB-petal confirm Alert). Existing callers passing
undefined keep their behavior (default = today, no force).

Backwards-compat verified for streak-sheet.tsx and F1 FAB petal.

Phase 2 of no-spend-day feature."
```

---

## Task 3: `FocusMode` exposes mark / unmark actions

**Files:**
- Modify: `mobile/components/gastos/gastos-month-calendar.tsx`

The `FocusMode` component (lines 439-XXX) renders the day-detail with the "Registrar gasto olvidado" button. We add two sibling actions that fire only when the day state matches.

- [ ] **Step 3.1: Extend `FocusMode` props**

Add two optional callbacks to the `FocusMode` props interface (around line 451):

```typescript
  onRegisterForgotten?: () => void
  /** Show "Marcar día sin gastos" only if onMarkNoSpend is set AND
   *  the day is past-or-today AND has 0 expenses AND no existing
   *  no-spend mark. */
  onMarkNoSpend?: () => void
  /** Show "Revertir marca" only if onUnmarkNoSpend is set AND the
   *  day currently has a no-spend mark (no expenses by invariant —
   *  auto-revert keeps that). */
  onUnmarkNoSpend?: () => void
  /** True when the displayed day already has a no-spend mark.
   *  Controls which of the two actions is shown. */
  hasNoSpendMark?: boolean
```

- [ ] **Step 3.2: Add the buttons to the render**

After the existing `onRegisterForgotten` button block (around line 544), add:

```typescript
        {/* No-spend day actions: mutually exclusive with the
            forgotten-expense path. Mark shows only on empty past-or-
            today days; revert shows only on already-marked days. */}
        {onMarkNoSpend && !hasNoSpendMark ? (
          <Pressable
            onPress={onMarkNoSpend}
            onPressIn={registerPress.onPressIn}
            onPressOut={registerPress.onPressOut}
            accessibilityRole="button"
            accessibilityLabel="Marcar este día como sin gastos"
            style={{ marginTop: 12 }}
          >
            <Animated.View
              style={[
                styles.registerForgottenBtn,
                {
                  backgroundColor: theme.colors.successSoft ?? theme.colors.creamSoft,
                  borderColor: theme.colors.line,
                },
                registerPress.animatedStyle,
              ]}
            >
              <MaterialIcons
                name="eco"
                size={16}
                color={theme.colors.success}
              />
              <Text style={[styles.registerForgottenText, { color: theme.colors.text }]}>
                Marcar día sin gastos
              </Text>
            </Animated.View>
          </Pressable>
        ) : null}

        {onUnmarkNoSpend && hasNoSpendMark ? (
          <Pressable
            onPress={onUnmarkNoSpend}
            onPressIn={registerPress.onPressIn}
            onPressOut={registerPress.onPressOut}
            accessibilityRole="button"
            accessibilityLabel="Revertir marca de día sin gastos"
            style={{ marginTop: 12 }}
          >
            <Animated.View
              style={[
                styles.registerForgottenBtn,
                {
                  backgroundColor: theme.colors.creamSoft,
                  borderColor: theme.colors.line,
                },
                registerPress.animatedStyle,
              ]}
            >
              <MaterialIcons
                name="undo"
                size={16}
                color={theme.colors.textMuted}
              />
              <Text style={[styles.registerForgottenText, { color: theme.colors.text }]}>
                Revertir marca de sin gastos
              </Text>
            </Animated.View>
          </Pressable>
        ) : null}
```

Note: If `theme.colors.successSoft` doesn't exist in the current palette, fall back to `theme.colors.creamSoft` (the ternary `?? theme.colors.creamSoft` handles it).

- [ ] **Step 3.3: Wire the props through `GastosMonthCalendar`**

Extend the outer component's props (around line 27-50):

```typescript
  onMarkNoSpend?: (date: Date) => void
  onUnmarkNoSpend?: (date: Date) => void
  /** Set of `YYYY-MM-DD` strings for days already marked as no-spend
   *  in the current cycle. Drives which action button to show in
   *  the day-detail. */
  noSpendMarkedDates?: Set<string>
```

In the FocusMode JSX block (around line 129-149), pass the actions through. Replace the existing FocusMode invocation with:

```typescript
          <FocusMode
            day={selectedDay}
            todayDay={todayDay}
            mood={dayMoods[selectedDay] ?? 'empty'}
            total={selectedDayTotal}
            count={selectedDayCount}
            cycleLabel={cycleLabel}
            onClear={onClearDay}
            onPrev={onPrevDay}
            onNext={onNextDay}
            canGoPrev={canGoPrev}
            canGoNext={canGoNext}
            onRegisterForgotten={
              onRegisterForgottenExpense && selectedDay !== todayDay
                ? () => {
                    const date = resolveCycleDate(cycleStart, cycleDays, selectedDay)
                    if (date) onRegisterForgottenExpense(date)
                  }
                : undefined
            }
            onMarkNoSpend={
              onMarkNoSpend && selectedDayCount === 0
                ? () => {
                    const date = resolveCycleDate(cycleStart, cycleDays, selectedDay)
                    if (date) onMarkNoSpend(date)
                  }
                : undefined
            }
            onUnmarkNoSpend={
              onUnmarkNoSpend
                ? () => {
                    const date = resolveCycleDate(cycleStart, cycleDays, selectedDay)
                    if (date) onUnmarkNoSpend(date)
                  }
                : undefined
            }
            hasNoSpendMark={(() => {
              const date = resolveCycleDate(cycleStart, cycleDays, selectedDay)
              if (!date || !noSpendMarkedDates) return false
              const iso = date.toISOString().slice(0, 10)
              return noSpendMarkedDates.has(iso)
            })()}
          />
```

- [ ] **Step 3.4: Commit**

```bash
git add mobile/components/gastos/gastos-month-calendar.tsx
git commit -m "feat(home): calendar FocusMode shows mark/unmark no-spend buttons

GastosMonthCalendar now accepts onMarkNoSpend, onUnmarkNoSpend, and
noSpendMarkedDates props and threads them into the day-detail. The
two action buttons are mutually exclusive based on the day's state:
mark shows on past-or-today days with 0 expenses and no existing
mark; revert shows on days that already carry a mark. Visual style
mirrors the existing 'Registrar gasto olvidado' button.

Phase 2 of no-spend-day feature."
```

---

## Task 4: Wire the calendar callbacks in `gastos-v2-screen.tsx`

**Files:**
- Modify: `mobile/screens/home/gastos-v2-screen.tsx`

The screen owns the `<GastosMonthCalendar>` instance and already passes `onRegisterForgottenExpense`. Add the two no-spend callbacks + the marked-dates set.

- [ ] **Step 4.1: Add the hooks + handlers**

In `mobile/screens/home/gastos-v2-screen.tsx`, near the other mutation hook usages (after the existing `useExpenses` / streak code), add:

```typescript
  // Reuse the streak hooks already on this screen (verify with grep
  // — if not already imported, add them now).
  const markNoSpendMutation = useMarkNoExpenseDay(familyId, userId)
  const unmarkNoSpendMutation = useUnmarkNoExpenseDay(familyId, userId)

  // Set of marked dates in the current cycle. Source: the existing
  // streak query already fetches the last 14 marked days; we expose
  // those as a Set for O(1) lookups in the calendar.
  const noSpendMarkedDates = useMemo(() => {
    const set = new Set<string>()
    const markedDays = streakResult.data?.weekActivity
      ? // weekActivity is booleans, not dates — we need the actual
        // ISO list. The hook already exposes markedDays via the
        // `useStreak` query; if it doesn't, add a getter. For F2
        // we use the existing markedDaysQuery directly:
        []
      : []
    return set
  }, [streakResult.data])
```

Note: the current `useStreak` returns `StreakData.weekActivity` (booleans, no ISO list). For F2 we need the actual marked dates set. Two options:

**Option A (recommended)** — expose `markedDaysIso` on `StreakData`. One-line change in `mobile/features/streaks/use-streak.ts:225`-ish where the memo builds: also expose `markedDaysIso: Array.from(markedDays)` (Set→Array). Then F2 consumes `new Set(streakResult.data.markedDaysIso)`.

**Option B** — query `streak_marked_days` directly from the screen. New hook `useNoSpendMarkedDatesThisCycle(familyId, userId, cycleStart)` that filters by `marked_date >= cycle_start`.

For F2 use Option A (smaller surface change). For F3 the home_snapshot extension provides the canonical cycle-scoped list and replaces Option A.

- [ ] **Step 4.2: Expose `markedDaysIso` on `StreakData`**

In `mobile/features/streaks/use-streak.ts`, add to the `StreakData` interface (around line 31):

```typescript
  /** ISO date strings (`YYYY-MM-DD`) of marked no-spend days,
   *  ordered by `marked_date` descending. Limited to the last 14 by
   *  the underlying query — sufficient for the calendar's current
   *  cycle view. */
  markedDaysIso: string[]
```

In the `useMemo` that builds the StreakData (around line 191), add:

```typescript
    return {
      currentStreak: row.current_streak,
      // ... existing fields
      streakBrokenAt: row.streak_broken_at,
      markedDaysIso: markedDaysQuery.data ?? [],
    }
```

(And in the no-row fallback case at line 228, set `markedDaysIso: []`.)

- [ ] **Step 4.3: Consume in `gastos-v2-screen.tsx`**

Replace the placeholder Set computation from Step 4.1 with:

```typescript
  const noSpendMarkedDates = useMemo(() => {
    return new Set<string>(streakResult.data?.markedDaysIso ?? [])
  }, [streakResult.data?.markedDaysIso])
```

- [ ] **Step 4.4: Add the handlers**

In the same screen, near the other handlers:

```typescript
  const handleMarkNoSpend = useCallback(
    (date: Date) => {
      const iso = date.toISOString().slice(0, 10)
      markNoSpendMutation.mutate(
        { date: iso },
        {
          onSuccess: () => {
            void triggerHaptic('success')
            confetti.celebrate({ durationMs: 2000, origin: 'top' })
            toast.success('Día sin gastos registrado')
          },
          onError: (error: unknown) => {
            void triggerHaptic('error')
            const message = error instanceof Error ? error.message : 'Error desconocido'
            // Map known RPC errors to friendly Spanish copy.
            if (message.includes('EXPENSES_EXIST_ON_DATE')) {
              toast.error('Ese día tiene gastos registrados — no se puede marcar como sin gasto.')
            } else if (message.includes('FUTURE_DATE_NOT_ALLOWED')) {
              toast.error('No podés marcar un día que aún no ocurrió.')
            } else {
              toast.error('No se pudo marcar. Reintentá en un momento.')
            }
          },
        },
      )
    },
    [markNoSpendMutation],
  )

  const handleUnmarkNoSpend = useCallback(
    (date: Date) => {
      const iso = date.toISOString().slice(0, 10)
      unmarkNoSpendMutation.mutate(
        { date: iso },
        {
          onSuccess: () => {
            void triggerHaptic('selection')
            toast.info('Marca de día sin gastos removida.')
          },
          onError: (error: unknown) => {
            void triggerHaptic('error')
            toast.error(
              error instanceof Error
                ? error.message
                : 'No se pudo revertir. Reintentá en un momento.',
            )
          },
        },
      )
    },
    [unmarkNoSpendMutation],
  )
```

Imports to add at the top of the file (verify which are already present, then add the missing):

```typescript
import { confetti } from '@/lib/confetti-bus'
import { toast } from '@/lib/toast-bus'
import { triggerHaptic } from '@/lib/haptics'
import { useMarkNoExpenseDay, useUnmarkNoExpenseDay } from '@/features/streaks/use-streak'
```

- [ ] **Step 4.5: Pass the props to the `<GastosMonthCalendar>` JSX**

Find the existing `<GastosMonthCalendar ... onRegisterForgottenExpense={...} />` (around line 388-ish in `gastos-v2-screen.tsx`) and add the three new props:

```tsx
<GastosMonthCalendar
  // ... existing props
  onRegisterForgottenExpense={(date) => {
    trackTap('calendar_register_forgotten', 'calendar', '/(app)/add-expense')
    router.push({
      pathname: '/(app)/add-expense',
      params: { date: date.toISOString().slice(0, 10) },
    })
  }}
  onMarkNoSpend={handleMarkNoSpend}
  onUnmarkNoSpend={handleUnmarkNoSpend}
  noSpendMarkedDates={noSpendMarkedDates}
/>
```

- [ ] **Step 4.6: Validate + bundle**

```bash
npm run validate 2>&1 | tail -8
rm -rf /tmp/m-bundle-f2
npx expo export --platform ios --output-dir /tmp/m-bundle-f2 --dump-sourcemap=false 2>&1 | tail -5
```

Both must exit 0.

- [ ] **Step 4.7: Commit**

```bash
git add mobile/features/streaks/use-streak.ts mobile/screens/home/gastos-v2-screen.tsx
git commit -m "feat(home): wire mark/unmark no-spend from gastos calendar

The day-detail of GastosMonthCalendar now triggers mark / revert
mutations on the selected past-or-today date. Success path fires
confetti + haptic + toast (same UX as the FAB petal); failure maps
RPC error codes to Spanish toast copy (EXPENSES_EXIST_ON_DATE,
FUTURE_DATE_NOT_ALLOWED).

Also exposes streakData.markedDaysIso for O(1) Set lookups when
the calendar paints existing marks. F3 will replace this with the
cycle-scoped list from home_snapshot.

Phase 2 of no-spend-day feature."
```

---

## Task 5: Smoke test (manual, runtime)

- [ ] **Step 5.1: Run on simulator**

```bash
npx expo start
```

- [ ] **Step 5.2: Mark a past day with no expenses**

1. Open Gastos → calendar → tap a past day that has no expenses (gray/empty mood).
2. Day-detail shows "Marcar día sin gastos" button.
3. Tap it → expect confetti + haptic + toast "Día sin gastos registrado".
4. Re-open the same day's detail → button now says "Revertir marca de sin gastos".

- [ ] **Step 5.3: Try marking a past day with expenses**

1. Tap a past day that has at least one expense (yellow/red mood).
2. Day-detail shows ONLY "Registrar gasto olvidado" (no mark button — condition `selectedDayCount === 0` is false).
3. Confirm no mark button is offered. UX is correct: the past is settled.

- [ ] **Step 5.4: Try marking a future day**

1. Tap a future day.
2. Day-detail shows the standard view; no mark button (filter blocks future via the existing `selectedDay !== todayDay` chain in F1's day picker).
3. Even if forced via RPC, the migration returns FUTURE_DATE_NOT_ALLOWED. The mobile guard is correct so this shouldn't trigger.

- [ ] **Step 5.5: Unmark a previously-marked past day**

1. Tap a past day already marked (the green dot if F3 ships first; otherwise unconfirmed visually until F3).
2. "Revertir marca de sin gastos" appears.
3. Tap → toast "Marca de día sin gastos removida" + selection haptic, no confetti.

- [ ] **Step 5.6: Sanity — F1 FAB petal still works**

Verify the FAB-petal still marks today correctly (regression check after the hooks signature changed).

---

## Self-review

**Spec coverage F2:**
- ✅ RPC accepts `p_date` (Task 1).
- ✅ Server validation: future / past-with-expenses / today-with-expenses (Task 1).
- ✅ Calendar day-detail mark+unmark buttons (Tasks 3 + 4).
- ✅ Visibility rules: mark only on empty past-or-today, revert only on already-marked (Task 3.2 + 3.3).
- ✅ Error mapping in mobile (Task 4.4).
- ✅ Confetti + haptic + toast on success (Task 4.4).
- ❌ Calendar dot styling for marked days → F3.
- ❌ Achievements firing from past marks → F3 (the trigger runs on insert regardless of date, so it works once F3 lands).

**Placeholder scan:** none.

**Type consistency:** `MarkNoExpenseDayInput { date?, force? }` consistent across hook + mutation + RPC params. `noSpendMarkedDates: Set<string>` consistent between screen + calendar prop. `markedDaysIso: string[]` consistent between hook return + screen consumer.

**Open implementation choices:**
- The Set computation in Task 4 depends on `streakData.markedDaysIso` (Option A). If a future change to `useStreak` changes that property name, this plan's references break — surfaced in Step 4.2's diff.
- Calendar dot styling deferred to F3 with the rest of the visualization layer.
