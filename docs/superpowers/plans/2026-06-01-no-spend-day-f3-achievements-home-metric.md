# Día sin gasto — Phase 3 — Achievements + Home Metric

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la Fase 3 del spec: 4 achievements nuevos al catálogo (3/7/15 por ciclo + 50 lifetime), un trigger que los award en cada insert de `streak_marked_days`, `home_snapshot` devuelve count + lista de marked days del ciclo, y Control hero renderiza el stat con tap-to-streak-sheet. Calendario pinta marked days con un dot distinto.

**Architecture:**
1. Migration `20260601006000_no_spend_achievements.sql`: 4 catalog rows + 1 trigger after-insert sobre `streak_marked_days`.
2. Migration `20260601007000_home_snapshot_no_spend_days.sql`: drop+recreate de `home_snapshot()` con 2 keys nuevas (`no_spend_days_count_cycle` + `no_spend_days_this_cycle` array).
3. Mobile: `useHomeSnapshot` ya devuelve la blob jsonb; agregamos los campos al view-model. Control hero monta un stat condicional (visible solo cuando count > 0). Calendario consume el array para pintar dots.

**Tech Stack:** PostgreSQL trigger, Supabase RPC, React Query, React Native.

**Out of scope:** F1 + F2 ya cerradas. Cualquier UX subsequent (sharing, social) NO.

**Pre-requisito:** F1 + F2 mergeadas.

---

## File map

| Path | Cambio | Tarea |
|------|--------|-------|
| `supabase/migrations/20260601006000_no_spend_achievements.sql` | Crear con 4 INSERT al catálogo + 1 trigger | Task 1 |
| `supabase/migrations/20260601007000_home_snapshot_no_spend_days.sql` | Crear con drop+recreate de home_snapshot() | Task 2 |
| `mobile/features/home/use-home-snapshot.ts` | Modify: agregar `noSpendDaysCount` + `noSpendDatesThisCycle` al view model | Task 3 |
| `mobile/components/control-hero-preview/control-hero-a-titular.tsx` (o donde viva el Control hero stats list) | Modify: nuevo stat card condicional | Task 4 |
| `mobile/components/gastos/gastos-month-calendar.tsx` | Modify: `DayCell` pinta un leaf-dot cuando la fecha está en `noSpendMarkedDates` | Task 5 |
| Deploy + smoke test | — | Task 6 |

---

## Task 1: Catalog rows + after-insert trigger

**Files:**
- Create: `supabase/migrations/20260601006000_no_spend_achievements.sql`

- [ ] **Step 1.1: Crear la migration**

```sql
-- 4 achievements para el feature "Día sin gasto":
--   • Per-cycle (resetean cada ciclo de pago): 3 / 7 / 15 marcas
--     dentro del ciclo vigente.
--   • Lifetime: 50 marcas acumuladas (no reset).
--
-- Detección: trigger AFTER INSERT en streak_marked_days que cuenta
-- marcas en el ciclo vigente del usuario + marcas lifetime y llama
-- award_achievement con el code correspondiente. award_achievement
-- es idempotente (on conflict do nothing) — el trigger puede correr
-- N veces sin riesgo de duplicados.
--
-- Spec: docs/superpowers/specs/2026-06-01-no-spend-day-feature-design.md

-- ─── 1. Catalog rows ────────────────────────────────────────────
insert into public.achievements_catalog (code, title, body, icon, tier, sort_order)
values
  ('no_spend_cycle_3',
   'Tres veces sin gasto',
   'Cerraste 3 días sin gastos en un mismo ciclo. Bien hecho.',
   '🌱', 'bronze', 220),
  ('no_spend_cycle_7',
   'Semana templada',
   '7 días sin gastos en un mismo ciclo. Eso ya es un ritmo.',
   '🌿', 'silver', 221),
  ('no_spend_cycle_15',
   'Mitad de ciclo zen',
   '15 días sin gastos en un mismo ciclo. La mitad del ciclo en calma.',
   '🌳', 'gold', 222),
  ('no_spend_lifetime_50',
   'Ahorrador veterano',
   'Llegaste a 50 días sin gastos acumulados desde que empezaste.',
   '🏆', 'legendary', 223)
on conflict (code) do nothing;

-- ─── 2. Helper: resolve current pay-cycle start for a user ──────
-- The family_finance row holds current_cycle_anchor (date). If null
-- (early family, no salary confirmed yet), fall back to the first
-- day of the calendar month — consistent with the home_snapshot
-- fallback at line ~75 of 20260529140000_home_snapshot_wrapped_seen.sql.
create or replace function public.user_current_cycle_start(p_family_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    ff.current_cycle_anchor,
    date_trunc('month', current_date)::date
  )
  from public.family_finance ff
  where ff.family_id = p_family_id
  limit 1;
$$;

revoke all on function public.user_current_cycle_start(uuid) from public;
grant execute on function public.user_current_cycle_start(uuid) to authenticated;

-- ─── 3. Trigger function ────────────────────────────────────────
create or replace function public.no_spend_marked_award_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_start date;
  v_cycle_count int;
  v_lifetime_count int;
begin
  if new.user_id is null then
    return new;
  end if;

  v_cycle_start := public.user_current_cycle_start(new.family_id);

  -- Count marks in current cycle (cycle-scoped achievements).
  select count(*)::int
  into v_cycle_count
  from public.streak_marked_days
  where user_id = new.user_id
    and family_id = new.family_id
    and marked_date >= v_cycle_start
    and marked_date <= current_date;

  -- Lifetime count (no family filter — if a user changes families,
  -- their personal achievement progress persists).
  select count(*)::int
  into v_lifetime_count
  from public.streak_marked_days
  where user_id = new.user_id;

  if v_cycle_count >= 3 then
    perform public.award_achievement(
      'no_spend_cycle_3',
      new.user_id,
      new.family_id,
      jsonb_build_object('marked_at', new.marked_at, 'cycle_count', v_cycle_count)
    );
  end if;

  if v_cycle_count >= 7 then
    perform public.award_achievement(
      'no_spend_cycle_7',
      new.user_id,
      new.family_id,
      jsonb_build_object('marked_at', new.marked_at, 'cycle_count', v_cycle_count)
    );
  end if;

  if v_cycle_count >= 15 then
    perform public.award_achievement(
      'no_spend_cycle_15',
      new.user_id,
      new.family_id,
      jsonb_build_object('marked_at', new.marked_at, 'cycle_count', v_cycle_count)
    );
  end if;

  if v_lifetime_count >= 50 then
    perform public.award_achievement(
      'no_spend_lifetime_50',
      new.user_id,
      new.family_id,
      jsonb_build_object('marked_at', new.marked_at, 'lifetime_count', v_lifetime_count)
    );
  end if;

  return new;
exception
  when others then
    -- Never block a marked-day insert on achievement bookkeeping.
    -- Errors surface in logs but the user's mark still lands.
    raise notice 'no_spend_marked_award_trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists no_spend_marked_award_trigger on public.streak_marked_days;
create trigger no_spend_marked_award_trigger
after insert on public.streak_marked_days
for each row
execute function public.no_spend_marked_award_trigger();
```

- [ ] **Step 1.2: Verify with dry-run**

```bash
npm run supabase:remote -- db push --dry-run 2>&1 | tail -10
```

Expected: includes `20260601006000_no_spend_achievements.sql`.

- [ ] **Step 1.3: Commit**

```bash
git add supabase/migrations/20260601006000_no_spend_achievements.sql
git commit -m "feat(achievements): 4 no-spend awards + trigger

3 per-cycle awards (3/7/15 marks) + 1 lifetime (50 marks). Trigger
counts in current pay cycle (anchor from family_finance) + lifetime
on every streak_marked_days insert and calls award_achievement
(idempotent). Cycle start resolved by user_current_cycle_start
helper that falls back to month-start if no anchor — matches the
home_snapshot fallback at 20260529140000:75.

Errors in the trigger never block the marked-day insert.

Phase 3 of no-spend-day feature."
```

---

## Task 2: Extend `home_snapshot()` with no-spend keys

**Files:**
- Create: `supabase/migrations/20260601007000_home_snapshot_no_spend_days.sql`

The current `home_snapshot()` returns a big jsonb with cycle data. We add 2 keys: `no_spend_days_count_cycle` (int) + `no_spend_days_this_cycle` (jsonb array of ISO date strings).

The cycle window is already computed in the function as `v_cycle_start` (timestamptz) per migration `20260529140000`. We reuse it.

- [ ] **Step 2.1: Read the current function**

Before drafting the migration, run:

```bash
grep -n "CREATE OR REPLACE FUNCTION public.home_snapshot" supabase/migrations/*.sql | tail -3
```

The latest definition is in `20260529140000_home_snapshot_wrapped_seen.sql` (line 9). Open that file end-to-end. The function returns a jsonb_build_object(...) at the bottom — that's where we append the 2 new keys.

- [ ] **Step 2.2: Create the migration**

```sql
-- Extend home_snapshot() to surface no-spend marked days in the
-- current pay cycle. The Control hero renders a new stat from the
-- count; the calendar paints distinct dots from the dates array.
--
-- Replaces (drops + recreates) the function from
-- 20260529140000_home_snapshot_wrapped_seen.sql, keeping every
-- existing key identical and adding 2 new keys at the end of the
-- jsonb_build_object call. The function signature is unchanged
-- (zero args, returns jsonb).
--
-- Spec: docs/superpowers/specs/2026-06-01-no-spend-day-feature-design.md

create or replace function public.home_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
-- COPY THE ENTIRE FUNCTION BODY from
-- supabase/migrations/20260529140000_home_snapshot_wrapped_seen.sql
-- verbatim, then in the final jsonb_build_object(...) append two
-- new keys right before the closing parenthesis:
--
--   'no_spend_days_count_cycle', (
--     select count(*)::int
--     from public.streak_marked_days md
--     where md.user_id = v_user_id
--       and md.family_id = v_family_id
--       and md.marked_date >= v_cycle_start::date
--       and md.marked_date <= current_date
--   ),
--   'no_spend_days_this_cycle', (
--     select coalesce(
--       jsonb_agg(md.marked_date::text order by md.marked_date desc),
--       '[]'::jsonb
--     )
--     from public.streak_marked_days md
--     where md.user_id = v_user_id
--       and md.family_id = v_family_id
--       and md.marked_date >= v_cycle_start::date
--       and md.marked_date <= current_date
--   )
--
-- Also add the same two keys (with the count = 0 / empty array) to
-- the no-family fallback block (the early return when v_family_id
-- is null, around line 36-63 of the prior migration).
--
-- This block intentionally written as a comment instead of inlined
-- SQL because the function body is ~250 LoC and copying it
-- verbatim into this commit message would be noisy. The implementer
-- MUST open the prior migration and reproduce its body here,
-- inserting the 2 new keys at the documented positions. After the
-- edit, the function compiles unchanged for every other key.
$$;
```

**Important:** The above migration is a SCAFFOLD. The implementer must:
1. Open `supabase/migrations/20260529140000_home_snapshot_wrapped_seen.sql`.
2. Copy the function body in full (excluding the `as $$ ... $$` outer wrapper — just the plpgsql body between).
3. Paste it into the new migration replacing the comment block.
4. Add the 2 new jsonb keys in the **populated** branch's final `jsonb_build_object(...)` (the one near the end of the function that returns full data when `v_family_id is not null`).
5. Add the same 2 keys (with `'no_spend_days_count_cycle', 0` and `'no_spend_days_this_cycle', '[]'::jsonb`) to the **no-family fallback** branch (around line 36-63 of the prior migration).

Why not inline the full body here: the function body is ~250 LoC and copying it into a plan would be both unreadable and at risk of drift from the source. The implementer reads the source directly.

- [ ] **Step 2.3: Verify the diff is minimal**

After writing the migration, run:

```bash
diff supabase/migrations/20260529140000_home_snapshot_wrapped_seen.sql supabase/migrations/20260601007000_home_snapshot_no_spend_days.sql | head -40
```

Expected: only 2 chunks of additions — the populated-branch insertions + the fallback-branch insertions. If the diff shows any other change (formatting, line moves, semicolon changes), revert and copy again.

- [ ] **Step 2.4: SQL parse dry-run**

```bash
npm run supabase:remote -- db push --dry-run 2>&1 | tail -10
```

Expected: includes `20260601007000_home_snapshot_no_spend_days.sql`. No errors.

- [ ] **Step 2.5: Commit**

```bash
git add supabase/migrations/20260601007000_home_snapshot_no_spend_days.sql
git commit -m "feat(db): home_snapshot returns no_spend_days_count + dates

Adds two keys to the jsonb return:
- no_spend_days_count_cycle: int, count of streak_marked_days rows
  with marked_date in [v_cycle_start, current_date].
- no_spend_days_this_cycle: jsonb array of ISO date strings ordered
  by date desc.

Both surface to Control hero (count → stat card) and the calendar
(dates → leaf dots on marked days). Same shape in the populated
and no-family fallback branches.

Function body copied verbatim from 20260529140000 with the 2 new
keys inserted at the documented positions; no other changes.

Phase 3 of no-spend-day feature."
```

---

## Task 3: Mobile view model — surface `noSpendDaysCount` + `noSpendDatesThisCycle`

**Files:**
- Modify: `mobile/features/home/use-home-snapshot.ts`

- [ ] **Step 3.1: Locate the type declaration + the snapshot consumer**

```bash
grep -n "interface HomeSnapshot\|interface HomeSnapshotView\|HomeSnapshotData\|home_snapshot" mobile/features/home/use-home-snapshot.ts | head -10
```

Find the TS interface that mirrors the jsonb shape (most likely `HomeSnapshotResponse` or similar). It will already have fields like `wrappedSeenAt`, `topExpense`, etc.

- [ ] **Step 3.2: Add the 2 fields**

In the TS interface (the one mapping the raw RPC return), add:

```typescript
  no_spend_days_count_cycle: number
  no_spend_days_this_cycle: string[]
```

In the view model interface (the camelCased shape consumed by components), add:

```typescript
  noSpendDaysCount: number
  noSpendDatesThisCycle: string[]
```

In the mapper that converts raw → view model, add:

```typescript
    noSpendDaysCount: raw.no_spend_days_count_cycle ?? 0,
    noSpendDatesThisCycle: raw.no_spend_days_this_cycle ?? [],
```

The exact location depends on the file structure of `use-home-snapshot.ts`. Open it and locate the mapping section (look for keys like `payments_cycle_start`, `top_expense`, etc.).

- [ ] **Step 3.3: Verify typecheck**

```bash
npm run typecheck 2>&1 | tail -5
```

- [ ] **Step 3.4: Commit**

```bash
git add mobile/features/home/use-home-snapshot.ts
git commit -m "feat(home): expose no-spend cycle count + dates on snapshot view

Maps the 2 new home_snapshot keys (no_spend_days_count_cycle +
no_spend_days_this_cycle) into the view model as noSpendDaysCount
+ noSpendDatesThisCycle. Default to 0 / [] when undefined for
backwards-compat during the cross-deploy window where some clients
read the snapshot before the F3 migration applies.

Phase 3 of no-spend-day feature."
```

---

## Task 4: Control hero stat card

**Files:**
- Modify: the file that renders the Control hero stats list. Likely `mobile/components/control-hero-preview/control-hero-a-titular.tsx` (per the spec; verify by grepping for an existing stat like "Promedio diario" or "Tope sugerido").

- [ ] **Step 4.1: Locate the stats list block**

```bash
grep -rn "Promedio diario\|Tope sugerido\|Días restantes\|Disponible" mobile/components/control-hero-preview mobile/features/insights mobile/components/home 2>/dev/null | head -10
```

The result tells you which file owns the stat row list.

- [ ] **Step 4.2: Add the new stat card conditionally**

In that file, find the stats list JSX. Add a new card that renders only when `homeSnapshot.noSpendDaysCount > 0`:

```tsx
{snapshot.noSpendDaysCount > 0 ? (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={`Días sin gastos este ciclo: ${snapshot.noSpendDaysCount}. Toca para abrir tu racha.`}
    onPress={() => {
      // Open the streak sheet. The screen already has a way to
      // open it (probably via a state setter or a navigation
      // call). Mirror the existing trigger — search for
      // 'setStreakSheetVisible' or 'openStreakSheet' in this file
      // and reuse it.
      setStreakSheetVisible(true)
    }}
    style={statCardStyle}
  >
    <Text style={statLabelStyle}>Días sin gastos este ciclo</Text>
    <Text style={statValueStyle}>
      <MaterialIcons name="eco" size={20} color={theme.colors.success} />{' '}
      {snapshot.noSpendDaysCount}
    </Text>
    <Text style={statHintStyle}>Toca para ver tu racha</Text>
  </Pressable>
) : null}
```

The exact prop names (`statCardStyle`, `statLabelStyle`, `setStreakSheetVisible`) are placeholders for what already exists in the file. Match the style + opener of the surrounding stats.

- [ ] **Step 4.3: Validate + bundle**

```bash
npm run validate 2>&1 | tail -5
rm -rf /tmp/m-bundle-f3-stat
npx expo export --platform ios --output-dir /tmp/m-bundle-f3-stat --dump-sourcemap=false 2>&1 | tail -5
```

- [ ] **Step 4.4: Commit**

```bash
git add mobile/components/control-hero-preview/control-hero-a-titular.tsx
git commit -m "feat(control): no-spend cycle count stat in Control hero

Renders only when noSpendDaysCount > 0 (user pidió que la métrica
no aparezca como 'null' when there's nothing to celebrate). Tap
opens the streak sheet for drilldown.

Placement: same row as the other cycle stats (promedio diario,
tope sugerido). Reuses the existing stat card style.

Phase 3 of no-spend-day feature."
```

---

## Task 5: Calendar dot styling for marked days

**Files:**
- Modify: `mobile/components/gastos/gastos-month-calendar.tsx` (specifically the `DayCell` component or its mood resolver)

- [ ] **Step 5.1: Wire `noSpendMarkedDates` through GridMode**

F2 already added the `noSpendMarkedDates: Set<string>` prop to `GastosMonthCalendar`. Extend `GridMode` to receive it and pass it down to each `DayCell`.

In the `GridMode` props (around line 178-...):

```typescript
  dayMoods: Record<number, GastosDayMood>
  cycleStart: Date
  cycleDays: number
  firstWeekdayOffset: number
  onSelectDay: (day: number) => void
  noSpendMarkedDates?: Set<string>   // NEW
```

In the parent block (around line 152-164) where `<GridMode ... />` is rendered, add `noSpendMarkedDates={noSpendMarkedDates}`.

- [ ] **Step 5.2: Pass to `DayCell`**

In the `GridMode` body where each `<DayCell ... />` is rendered (around line 266-275), compute and pass `isNoSpendMarked`:

```typescript
const iso = cellDate.toISOString().slice(0, 10)
const isNoSpendMarked = noSpendMarkedDates?.has(iso) ?? false

return (
  <DayCell
    key={`${cellDate.getFullYear()}-${cellDate.getMonth()}-${dayNum}`}
    day={dayNum}
    mood={dayMoods[dayNum] ?? (isPast ? 'empty' : undefined)}
    isToday={isToday}
    isPast={isPast}
    inert={inert}
    onPress={() => onSelectDay(dayNum)}
    isNoSpendMarked={isNoSpendMarked}   // NEW
  />
)
```

- [ ] **Step 5.3: Render a leaf dot on the DayCell**

Find the `DayCell` component (further down in `gastos-month-calendar.tsx`). Add the prop and a small leaf icon below the day number when `isNoSpendMarked` is true:

```typescript
function DayCell({
  day,
  mood,
  isToday,
  isPast,
  inert,
  onPress,
  isNoSpendMarked = false,
}: {
  day: number
  mood: GastosDayMood | undefined
  isToday: boolean
  isPast: boolean
  inert?: boolean
  onPress: () => void
  isNoSpendMarked?: boolean
}) {
  // ... existing body
  return (
    <Pressable /* ... */>
      <Text /* ... */>{day}</Text>
      {isNoSpendMarked ? (
        <MaterialIcons
          name="eco"
          size={8}
          color={theme.colors.success}
          style={{ position: 'absolute', bottom: 4, alignSelf: 'center' }}
        />
      ) : null}
    </Pressable>
  )
}
```

Adapt the rendering to the existing `DayCell` style — the key insight is a small 8px green leaf icon below the day number, distinct from the existing mood-color dot. Use `theme.colors.success` (or `#329315` if theme accessor not available in DayCell scope).

- [ ] **Step 5.4: Wire `noSpendMarkedDates` from `gastos-v2-screen.tsx` to use F3's snapshot data**

F2's wiring uses `streakResult.data.markedDaysIso` (last 14 entries). F3 should switch to the cycle-scoped list from `homeSnapshot.noSpendDatesThisCycle` because:
- It's filtered to the current cycle (more accurate for calendar dots which only render the current cycle).
- It's already part of the snapshot — no extra query.

In `mobile/screens/home/gastos-v2-screen.tsx`, replace the F2 computation:

```typescript
  // Was (F2):
  // const noSpendMarkedDates = useMemo(() => {
  //   return new Set<string>(streakResult.data?.markedDaysIso ?? [])
  // }, [streakResult.data?.markedDaysIso])

  // Now (F3):
  const noSpendMarkedDates = useMemo(() => {
    return new Set<string>(snapshot.data?.noSpendDatesThisCycle ?? [])
  }, [snapshot.data?.noSpendDatesThisCycle])
```

(`snapshot` here is whatever hook variable `useHomeSnapshot(userId)` returns into — match the existing name in the file.)

- [ ] **Step 5.5: Validate + bundle**

```bash
npm run validate 2>&1 | tail -5
rm -rf /tmp/m-bundle-f3-dots
npx expo export --platform ios --output-dir /tmp/m-bundle-f3-dots --dump-sourcemap=false 2>&1 | tail -5
```

- [ ] **Step 5.6: Commit**

```bash
git add mobile/components/gastos/gastos-month-calendar.tsx mobile/screens/home/gastos-v2-screen.tsx
git commit -m "feat(home): calendar paints leaf dot on no-spend days

DayCell renders a small green leaf (MaterialIcons eco, 8px) below
the day number when the date is in noSpendMarkedDates. Distinct
from the existing mood-color dot so the user reads 'marked as no-
spend' at a glance.

The screen now feeds the calendar from
snapshot.noSpendDatesThisCycle (cycle-scoped, fresh from home_snapshot
F3 extension) instead of the F2 placeholder
streakResult.data.markedDaysIso (last 14 entries). The new source is
exactly the current cycle window, matching the Control hero stat.

Phase 3 of no-spend-day feature."
```

---

## Task 6: Deploy + smoke test

- [ ] **Step 6.1: Push migrations to prod**

```bash
npm run supabase:remote:db:push 2>&1 | tail -15
```

Expected: 2 migrations applied (`20260601006000`, `20260601007000`).

- [ ] **Step 6.2: Verify the trigger fired on existing marked days (if any)**

The trigger only fires on NEW inserts to `streak_marked_days`. Users with pre-existing marked-day rows (e.g., from before this migration) won't retroactively get achievements. That's acceptable — the achievement is forward-looking from F3 ship.

If you want to backfill for active beta users, run manually in SQL editor after deploy (sample, do not script — review per user):

```sql
-- Backfill achievements for one user's existing marks. Run only if
-- you confirmed with the user beforehand.
-- The trigger runs the same logic, so we just re-insert the latest
-- row of each user (which retriggers the count) — but the cleaner
-- way is to call the helper directly.
do $$
declare
  r record;
begin
  for r in
    select user_id, family_id, max(marked_at) as latest
    from public.streak_marked_days
    group by user_id, family_id
  loop
    perform public.no_spend_marked_award_trigger() from public.streak_marked_days
    where user_id = r.user_id and family_id = r.family_id and marked_at = r.latest;
  end loop;
end $$;
```

This backfill step is OPTIONAL. Decide with the user.

- [ ] **Step 6.3: Smoke test on simulator**

```bash
npx expo start
```

Steps:
1. Open Gastos → tap the streak sheet → mark today.
2. Long-press FAB → "Día sin gasto" petal now reads "Marcado ✓".
3. Open Gastos → Control hero shows the new stat "Días sin gastos este ciclo: 1 🌱".
4. Calendar shows today's cell with a green leaf dot.
5. Mark 2 more past days (clean — no expenses). Tap the achievement gallery in Settings → "Tres veces sin gasto" appears unlocked.
6. Tap the Control stat → streak sheet opens.

- [ ] **Step 6.4: Edge: unmark drops the count**

1. Unmark one of the marks via streak sheet or calendar.
2. Reload home → Control stat decreases by 1.
3. Calendar dot for that day disappears.

- [ ] **Step 6.5: Lock+resume regression**

Bloquear el device + volver. No nuevos console errors. Sanity de que el AppState wiring del fix ad728f0 sigue OK.

---

## Self-review

**Spec coverage F3:**
- ✅ 4 catalog rows (Task 1.1).
- ✅ After-insert trigger awards (Task 1.1).
- ✅ Per-cycle vs lifetime split per spec (cycle uses `user_current_cycle_start`, lifetime uses no filter).
- ✅ `home_snapshot` returns count + dates (Task 2).
- ✅ Mobile view model exposes the fields (Task 3).
- ✅ Control hero stat condicional (Task 4).
- ✅ Calendar leaf-dot on marked days (Task 5).
- ✅ Tap stat → streak sheet (Task 4.2).
- ✅ Snapshot source switched from F2 placeholder to F3 cycle-scoped data (Task 5.4).

**Placeholder scan:** the comment block in Task 2.2 ("COPY THE ENTIRE FUNCTION BODY") is a deliberate instruction, not a placeholder. The implementer must read the source and inline it — there is no shortcut. The plan flags this explicitly + provides verification (Task 2.3 diff check).

**Type consistency:**
- `no_spend_days_count_cycle: int` (SQL) ↔ `noSpendDaysCount: number` (TS view model).
- `no_spend_days_this_cycle: jsonb array of text` (SQL) ↔ `noSpendDatesThisCycle: string[]` (TS).
- `isNoSpendMarked: boolean` consistent between DayCell prop + GridMode passthrough + outer Set lookup.

**Migration order safety:**
- `20260601005000` (F2 RPC extension) runs before `20260601006000` (F3 achievements) and `20260601007000` (F3 snapshot ext) — correct sequencing on `supabase db push`.
- `20260601006000` inserts catalog rows BEFORE the trigger fires for the first time, so `award_achievement` resolves the codes correctly.

**Out of plan (post-F3 backlog):**
- Manual backfill for existing marked days (Task 6.2) — optional, not part of the migration.
- Future "monthly digest" using `no_spend_days_this_cycle` history — not in spec.
- Sharing/social features — out of scope.
