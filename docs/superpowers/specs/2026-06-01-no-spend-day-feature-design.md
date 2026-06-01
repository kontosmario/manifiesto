# Feature: "Día sin gasto" — Design Spec

> Status: approved 2026-06-01 (post-brainstorming with owner). Ready for implementation planning.

## Context

Manifiesto already ships a "mark no-expense day" backend (`streak_marked_days` table + RPCs `mark_no_expense_day` / `unmark_no_expense_day`, migration `20260427140000`) and a UI in the streak sheet (`mobile/components/gastos/streak-sheet.tsx`, lines 114-356). Auto-revert when an expense is inserted into a marked day also exists (migration `20260427160000`).

This feature **extends** that infrastructure with four surfaces the existing UI doesn't cover:

1. A dedicated petal in the home FAB radial menu (`AddQuickActionsOverlay`) for one-tap marking from anywhere.
2. Past-date marking from the gastos calendar day-detail.
3. Visible celebration: full-screen confetti on successful mark.
4. Achievements + Control-hero metric to make accumulated no-spend days visible.

**Out of scope**: rewriting the existing streak-sheet UI; multi-day batch marking (e.g., "mark all empty days this week"); social sharing of streaks; weekly digest emails of no-spend stats.

## Approach: 3-phase incremental shipping

Each phase ships independent value, can deploy without waiting for the next, and rolls back cleanly. Decided to phase instead of one big PR because dependencies are disjoint and the risk profile of each phase is different (Phase 1 is pure mobile, Phase 2 touches the RPC, Phase 3 touches the catalog + a Postgres trigger).

| Phase | Scope | Surface |
|-------|-------|---------|
| **F1** — FAB petal real + confetti | Refactor commit `d7d7db1` so the petal calls `useMarkNoExpenseDay()` instead of `toast.success(...)`. Add `<NoSpendConfettiHost>` driven by a pub/sub bus. Confirm-Alert if today has expenses (mirror streak-sheet). Toggle behavior if already marked. | Mobile only |
| **F2** — Past-date marking via calendar | Extend `mark_no_expense_day` / `unmark_no_expense_day` with optional `p_date date` (default today in user tz). Add mark/revert actions to `GastosMonthCalendar` day-detail. Server rejects past dates that already have expenses. | RPC migration + mobile |
| **F3** — Achievements + home metric | 4 catalog rows (3 per-cycle + 1 lifetime). After-insert trigger on `streak_marked_days` awards via existing `award_achievement`. `home_snapshot` returns `no_spend_days_count_cycle` + dates list. Control hero renders a stat with tap-to-streak-sheet. Calendar paints marked days with a distinct dot. | Migration + RPC + mobile |

## Data model — no new tables

`streak_marked_days` schema stays exactly as is. Two RPC signatures change in F2:

```sql
-- Before
create or replace function public.mark_no_expense_day(p_family_id uuid)
returns date ...

-- After (F2)
create or replace function public.mark_no_expense_day(
  p_family_id uuid,
  p_date date default null
) returns date ...
```

Validation server-side in the extended RPC:
- If `p_date is null`, default to user-local today (existing behavior).
- Reject if `p_date > user_local_today` (no future marking).
- Reject if `p_date` has any `expenses` row for the same `user_id` — error code `EXPENSES_EXIST_ON_DATE`. The client checks this before calling and prompts a confirm-Alert; if the user confirms anyway for *today*, the client passes `p_force = true` (small additional param). For *past dates*, the override is NOT allowed (the past is settled — if you registered an expense that day, the day wasn't no-spend).

Idempotency: `on conflict (family_id, user_id, marked_date) do nothing` already in place.

The advance_streak call inside `mark_no_expense_day` works on `p_date` (not always "today"), so a past mark inserted via F2 won't fake the streak forward — it backfills correctly because `advance_streak` is date-aware.

## UI surfaces

### F1 — FAB petal

`mobile/components/navigation/add-quick-actions-overlay.tsx` already has the petal slot from commit `d7d7db1`. Three changes:

1. The petal's `onPress` callback in `add-expense-tab-button.tsx` switches from `toast.success(...)` to:
   - Read `streakData.hasMarkedNoExpenseToday` and any `expensesToday.length > 0` from existing hooks.
   - If already marked → toggle: call `useUnmarkNoExpenseDay()`, haptic `selection`, no confetti.
   - If today has expenses → `Alert.alert(...)` matching streak-sheet's existing confirm. On yes, call mutation with `p_force = true`.
   - Otherwise → call `useMarkNoExpenseDay()`, on success haptic `success` + `confetti.celebrate({ duration: 2000 })` + `toast.success('Día sin gasto registrado')`.
2. Petal state reflects marked/unmarked: when `hasMarkedNoExpenseToday`, the petal renders with a filled green tint (vs the default primary green) and label changes to "Marcado ✓".
3. The petal's icon stays `eco`. Label "Día sin gasto" per brainstorming Q2.

### F2 — Calendar day-detail past-date marking

`mobile/components/gastos/gastos-month-calendar.tsx` and its day-detail consumer get a new action row. The existing `calendar_register_forgotten` button (tracking event at `gastos-v2-screen.tsx:388`) sits next to a new sibling:

```
┌─ Day: 2026-05-12 ──────────────────┐
│   3 movimientos · $2.450           │
│                                    │
│   [ Registrar gasto olvidado ]     │  ← existing
│                                    │
│   [ 🌱 Marcar día sin gastos ]     │  ← NEW (F2)
└────────────────────────────────────┘
```

Visibility rules:
- "Marcar día sin gastos" shows only if the day has **0 expenses** AND **0 marked rows**.
- "Revertir marca" shows only if the day has **1 marked row** AND **0 expenses** (auto-revert would have cleared a marked row if any expense existed).
- "Registrar gasto olvidado" always shows for past dates.
- Future dates: only "Registrar gasto olvidado" (already disabled for future per existing logic).

Tap fires the corresponding mutation with `p_date = <day>`. On success: dismiss the sheet, confetti (only on mark, not on revert), toast.

### F3 — Control hero stat + calendar dots + achievements

**Control hero new stat** (renders only when `count > 0`):

```
┌─ Días sin gastos este ciclo ──┐
│           🌱 5                │
│   Toca para ver tu racha →    │
└───────────────────────────────┘
```

Tap opens the `streak-sheet`. Lives between the existing "Promedio diario" stat and the "Tope sugerido" stat in `control-hero-a-titular.tsx` (or wherever the cycle stats list lives — to be confirmed in the plan).

**Calendar dot styling**: marked days get a small green leaf icon under the date number, distinct from the gray dot used for days with expenses. Reuse a new variant of the existing day-cell renderer.

**Achievements catalog** (added by migration `20260601006000_no_spend_achievements.sql`):

| code | title | tier | trigger condition |
|------|-------|------|-------------------|
| `no_spend_cycle_3` | Tres veces sin gasto | bronze | 3 marked days in current pay cycle |
| `no_spend_cycle_7` | Semana templada | silver | 7 marked days in current pay cycle |
| `no_spend_cycle_15` | Mitad de ciclo zen | gold | 15 marked days in current pay cycle |
| `no_spend_lifetime_50` | Ahorrador veterano | legendary | 50 marked days lifetime |

After-insert trigger on `streak_marked_days`: count rows in current cycle (using existing pay-cycle helper) and award via `award_achievement(...)`. `award_achievement` is already idempotent.

## Confetti integration

**Library**: try `react-native-confetti-cannon@1.5.2` first. Pre-flight verification via `npx expo export --platform ios` BEFORE committing the dep (lesson from `pbkdf2` Node-stdlib regression).

If the dep brings transitive Node-stdlib imports, fallback to a manual Reanimated-only implementation: ~30 particles, each a `useSharedValue` driven `transform: translate + rotate + scale + opacity`, lifetime 2s, parallel start. ~100 LoC, zero deps. Documented contingency in the implementation plan.

**Driver**: pub/sub bus mirroring `mobile/lib/toast-bus.ts`:

```typescript
// mobile/lib/confetti-bus.ts
export const confetti = {
  celebrate: (opts?: { duration?: number; origin?: 'top' | 'center' }) => {...}
}
```

**Mount**: new `<NoSpendConfettiHost />` in `mobile/components/root/app-stack-shell.tsx`, same nesting level as the existing `<ToastHost />`. Single global instance subscribed to the bus. Renders overlay with `pointerEvents="none"` and `position: absolute` covering the safe area.

**Why pub/sub instead of prop drilling**: the confetti needs to paint over any route — FAB-triggered (any screen), calendar-day-detail-triggered (gastos screen), or future entrypoints — without each caller knowing the overlay exists. Toast already proves the pattern works.

## Home snapshot extension

Migration F3 adds to `home_snapshot()` jsonb return:

```sql
'no_spend_days_count_cycle', (
  select count(*)::int
  from public.streak_marked_days md
  where md.user_id = v_user_id
    and md.marked_date >= v_cycle_start
    and md.marked_date <= current_date
),
'no_spend_days_this_cycle', (
  select coalesce(jsonb_agg(md.marked_date order by md.marked_date), '[]'::jsonb)
  from public.streak_marked_days md
  where md.user_id = v_user_id
    and md.marked_date >= v_cycle_start
    and md.marked_date <= current_date
)
```

Mobile-side `useHomeSnapshot` exposes `homeSnapshot.noSpendDaysCount` and `homeSnapshot.noSpendDatesThisCycle`. The Control hero stat consumes count; the calendar dots consume the dates array.

## Edge cases + invariants

| Scenario | Behavior |
|----------|----------|
| Tap FAB-petal, already marked today | Toggle to unmark; haptic `selection`; no confetti; toast.info "Marca removida". |
| Tap FAB-petal, today has expenses | Alert.alert "Hoy tenés gastos cargados. ¿Marcar igual?". Yes → mutation with `p_force=true`; No → dismiss. |
| Mark past date that has expenses | RPC rejects with `EXPENSES_EXIST_ON_DATE`. Client surfaces toast.error "Ese día tenés gastos cargados — no podés marcarlo como sin gasto". No force-override allowed for past dates. |
| Insert expense into a marked day (any day) | Auto-revert trigger removes the marked row (already exists, migration `20260427160000`). Client realtime sub on `streak_marked_days` deletes → toast.info "Marca de día sin gastos removida por un gasto nuevo". |
| Tap FAB-petal offline | Mutation queues via React Query; UI optimistic confetti + toast; on server rejection at sync, rollback + toast.error. |
| Achievement unlocks mid-confetti | Confetti runs 2s. Achievement unlock modal queued behind a `setTimeout(2200)` so the user sees confetti → achievement modal sequentially, not overlapping. |
| Mark future date | Blocked at UI (calendar disables future days for actions) AND at RPC (`p_date > user_local_today` rejects). |
| Race: two clients mark same day | `on conflict do nothing` makes the RPC idempotent. `advance_streak` is also idempotent on the same date. Second client gets the same response as first. |

## Telemetry

Per-mark event via existing telemetry (`log-home-event.ts`):
- `no_spend_marked` with context `{ source: 'fab' | 'calendar' | 'streak_sheet', date: <iso> }`
- `no_spend_unmarked` with same context shape
- `no_spend_achievement_unlocked` with context `{ code, days_in_cycle, days_lifetime }`

These hook into the existing event-queue / dashboard.

## Testing

**F1 (mobile-only)**:
- Unit: petal state machine (marked / unmarked / has-expenses / pending) reproducible via existing test infra.
- Integration (manual): tap FAB-petal in dev → expect mutation, confetti, toast, streak weekActivity updates.

**F2 (RPC + mobile)**:
- Unit: RPC `p_date` validation (future date → reject, past date with expenses → reject, past date without expenses → accept).
- Manual: select day in calendar → mark → confirm row in DB → confirm streak grid pinta el día.

**F3 (catalog + trigger + snapshot)**:
- Unit: trigger logic (count rows in cycle, award correct tier at thresholds 3/7/15/50).
- Integration: smoke a fresh user, mark 3 days in cycle, expect `no_spend_cycle_3` row in `achievements_earned`.
- Manual: home_snapshot returns count > 0 → Control hero renders stat; count == 0 → stat hidden.

**Pre-flight (every phase)**:
- `npm run validate` exit 0.
- `npx expo export --platform ios` bundle succeeds (lesson from `pbkdf2`).

## Migration list (this feature only)

| Filename | Purpose |
|----------|---------|
| `20260601005000_mark_no_expense_day_with_date.sql` | Extend mark/unmark RPCs with `p_date` + `p_force`. F2. |
| `20260601006000_no_spend_achievements.sql` | Catalog rows + trigger. F3. |
| `20260601007000_home_snapshot_no_spend_days.sql` | Extend home_snapshot return jsonb. F3. |

3 migrations total. All additive, all reversible (drop policies/functions, restore old signatures, restore catalog rows by code).

## Open questions deferred to implementation plan

- Exact placement of the Control hero stat (which row of stats, before/after which existing stat) — read the layout when writing the plan.
- Whether the trigger uses `current_pay_cycle_start(user_id)` or rebuilds the cycle logic inline — depends on existing helper availability.
- Calendar dot icon: leaf glyph vs colored dot vs micro-icon — design call, will look at the existing day-cell renderer.
- Whether to add a "Marcar día sin gastos" entry in the streak-sheet's three-dots overflow menu (separate from existing button) — defer, the existing button is enough.

## Next step

Per the brainstorming skill, after user approves this spec the next action is to invoke `superpowers:writing-plans` to produce a per-phase implementation plan (probably 3 docs in `docs/superpowers/plans/`: one per phase).
