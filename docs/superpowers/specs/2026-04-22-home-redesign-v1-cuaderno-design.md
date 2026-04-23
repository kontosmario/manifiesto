# Manifiesto — Home Redesign (V1 Cuaderno) Design

**Date:** 2026-04-22
**Status:** Implemented (pending manual QA + remote Supabase migration)
**Scope:** Home/Inicio screen end-to-end — new DB tables, new hooks, new components, extended theme tokens, and a new Settings entry for the savings goal.
**Source design:** `v1-cuaderno.jsx` (the "★ consolidada" home variant) from `Manifiesto.zip`, referenced against screenshot `Captura 14.20.17.png` (current app) in `Manifiesto (1).zip`. Dark variant from `v1-dark.jsx` (same structure, swapped tokens).
**Depends on:** nothing — standalone PR that ships end-to-end.

---

## 1. Context

The user received a batch of new UI explorations (`Manifiesto.zip` / `Manifiesto (1).zip`) that contains the redesign of every screen in the app. The directive is to integrate the new UI screen-by-screen, starting with Home, and to do it pixel-perfect including animations. Backend data that does not yet exist is expected to be modeled now, so follow-up screens (Gastos, Fijos, Control, Add-sheet) can consume the same tables.

The current Home ([mobile/screens/home/home-screen.tsx](../../../mobile/screens/home/home-screen.tsx) + [home-dashboard.tsx](../../../mobile/components/home/home-dashboard.tsx)) renders:

- `Screen` with title `"{greeting}, {displayName}"` and a right slot with bell + settings icon buttons
- `AmbientBackdrop` (light mode only)
- `HomeHeroCard` — a single card with the available amount, payday chip, margin, savings/fixed mini-rows, and burn-rate hint
- `HomeActivitySection` — recent expenses list with empty / error / loading states
- `ConfirmSalarySheet` — bottom sheet for confirming the monthly salary

The new V1 Cuaderno home splits the surface into **seven stacked sections** with a much richer visual language (aurora gradient hero, sparkline, family strip, dedicated meta card, shortcut cards with mini-charts, activity rows with "who paid" avatar overlay) and a system of coordinated entrance + idle animations.

## 2. Goals

1. **Pixel-perfect port** of `v1-cuaderno.jsx` (light) and `v1-dark.jsx` (dark) to React Native, including all animations the mock uses.
2. **Zero fake numbers at runtime** — every visible value is computed from Supabase or `family_finance` / `expenses` / `fixed_expenses` data. Where the schema is missing, the schema is extended.
3. **Data plumbing is reusable** by follow-up screens. The hooks introduced here (streak, monthly comparison, sparkline, daily mood, savings goal, fixed-expense payments) will be consumed by the Gastos / Fijos / Control redesigns.
4. **Settings UI for the savings goal** so the user can create / edit / disable the meta without SQL.
5. **No regression** in existing Home responsibilities: pull-to-refresh, salary confirmation, expense deletion, notification badge, navigation to tabs, error/empty states, haptics, reduced-motion awareness.

## 3. Non-goals

- Redesign of Gastos, Fijos, Control, Add-sheet, notifications feed (follow-up PRs).
- In-home flow for registering a fixed-expense payment (the "7 de 12" count is read-only on Home; the action lives on the Fijos screen which is out of scope).
- Multiple active savings goals (`savings_goals.is_active` supports it but the UI picks the first active one).
- Replacement of the bell/settings icon buttons or tab bar visuals (the tab bar is already being iterated on a separate branch).
- Changes to `useFamilyDashboard` aggregation logic (already correct).
- Gesture interactions on cards (swipe-to-delete, long-press menus) beyond what Home already has on activity rows.

## 4. Visual structure

The new Home is a single vertical scroll under the existing `Screen` shell. Order top → bottom:

1. **Greeting header** — contextual icon (sun/sun-low/moon) + "Buenas tardes," subtitle + "Hola, Mario" 34pt bold display.
2. **Family strip** — stacked avatars (ring color = bg) + "Familia López · 4" + payday pill on the right ("27 días al cobro" with pulsing peach dot).
3. **Hero card** — dark-green aurora gradient. Contents top → bottom:
   - Pulsing green dot + "DISPONIBLE HOY" label (left) + month/day pill "Abril · día 22/30" (right).
   - Huge animated amount `$4.455.000` (52pt, CountUp 1.6s easeOutCubic).
   - Margin line: "Margen del mes +$2.535.000 [▲ +18%]" (the +18% is a glowing chip).
   - Sparkline 12 points with glowing end dot.
   - Three micro-stats separated by 1px dividers: `Hoy / Gastado / Alcancía`. The "Alcancía" column uses accent color and a soft glow.

   **Data mapping for the trio:**
   - `Hoy`: today's remaining daily budget (daily budget − spend so far today). Subtitle `"disponible"`.
   - `Gastado`: sum of today's expenses + count of today's expenses. Subtitle `"N movs"`.
   - `Alcancía`: cumulative savings in the current cycle = `totalAvailable − cycle.daysElapsed × dailyBudget + todaysRemainingBudget`. If negative, show `-$X` in `down` color and swap subtitle to `"excedido"`. Subtitle `"ahorrado"` when positive.
4. **Shortcut cards** — 2-col grid. Each card: uppercase label top-left + chevron top-right + value (22pt bold) + subtitle + bottom row with trend (colored) and a mini-chart:
   - **Gastos:** `$1.545.000` · "este mes · 47 movs" · "+12% vs marzo" (clay) · 7-bar mini histogram.
   - **Fijos:** `$920.000` · "7 de 12 pagados" · "3 próximos" (ink) · 12 colored dots (paid=green, pending=line).
5. **Meta card** — dark rounded card with: "META · VIAJE A BARILOCHE" label (mint) + amount `$1.920k / $3.000k` + floating emoji 🏔️ on the right + progress bar (gradient mint→peach) with running shine + bottom row "64% alcanzado · faltan ~3 meses".
6. **Activity header** — "ACTIVIDAD" uppercase label (left) + "Ver todos" link (right).
7. **Activity rows** — same as today but: icon tile uses peach-soft background + avatar chip overlay in the bottom-right corner of the icon tile identifying who paid + muted text reads `{who.name} · {category}` on the second line.
8. **Bottom spacer** — 120pt so the floating Add button on the tab bar never covers the last row.

Dark mode uses the same layout but the tokens swap per `theme.jsx`:
- Page bg `#0A1410`, cards `#13221B` with 1px `#1F332A` border.
- Hero gradient `#133827 → #1F6B43 → #2E9A5F`.
- Accent mint stays `#C7EE9C`; peach soft becomes `#3A2A22`.

## 5. Data model changes (Supabase)

Two new tables added to [sql/supabase.sql](../../../sql/supabase.sql). Both enforce RLS via the existing `family_members` membership check.

### 5.1 `savings_goals`

```sql
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  emoji text not null default '🎯',
  goal_amount numeric(12,2) not null check (goal_amount > 0),
  current_amount numeric(12,2) not null default 0 check (current_amount >= 0),
  target_months integer null check (target_months is null or target_months > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.savings_goals (family_id) where is_active;
```

**RLS:** `select / insert / update / delete` gated on `exists (select 1 from family_members where family_id = savings_goals.family_id and user_id = auth.uid())`.

**Trigger:** `before update` → set `updated_at = now()`.

**UI contract:** the Home fetches the first `is_active = true` row ordered by `created_at asc` (deterministic if more than one exists). Settings exposes edit on that single active goal.

### 5.2 `fixed_expense_payments`

```sql
create table if not exists public.fixed_expense_payments (
  id uuid primary key default gen_random_uuid(),
  fixed_expense_id uuid not null references public.fixed_expenses(id) on delete cascade,
  period_month date not null,  -- always the first of the month in family timezone
  paid_at timestamptz not null default now(),
  paid_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (fixed_expense_id, period_month)
);
create index on public.fixed_expense_payments (fixed_expense_id, period_month desc);
```

**RLS:** derive family via `fixed_expenses` join — `exists (select 1 from fixed_expenses fe join family_members fm on fm.family_id = fe.family_id where fe.id = fixed_expense_id and fm.user_id = auth.uid())`.

**Home contract:** query `select fixed_expense_id from fixed_expense_payments where period_month = date_trunc('month', now()) and fixed_expense_id in (<family's fixed_expenses>)` → count distinct, compare against total count of family's `fixed_expenses`.

### 5.3 Seed (one-shot)

A migration-only INSERT runs once per family that has `family_members` but no `savings_goals`: `('Viaje a Bariloche', '🏔️', 3000000, 1920000, 3, true)`. This matches the mock. The seed is gated by `where not exists` so re-running the migration is idempotent.

**Rollback note:** a `down.sql` variant (or commented block at the bottom of the migration) includes `drop table` for both tables and an `update savings_goals set is_active = false where title = 'Viaje a Bariloche'` helper.

## 6. New hooks

All live in `mobile/features/<domain>/` and follow the React Query patterns established by `useFamilyDashboard`, `useFixedExpenses`, etc. Each hook has: a query function, a typed Supabase select, and a cache key prefix.

| File | Query keys | Purpose |
|---|---|---|
| `mobile/features/savings-goals/use-savings-goal.ts` | `['savings-goal', familyId]` | fetch the active goal (nullable) |
| `mobile/features/savings-goals/use-upsert-savings-goal.ts` | mutation | used by Settings screen |
| `mobile/features/fixed-expenses/use-fixed-expense-payments.ts` | `['fixed-expense-payments', familyId, periodMonth]` | paid count for month |
| `mobile/features/fixed-expenses/use-mark-fixed-expense-paid.ts` | mutation | no UI in this PR, exported for later |
| `mobile/features/home/use-monthly-expense-comparison.ts` | `['monthly-expense-comparison', familyId]` | `{ currentMonthTotal, previousMonthTotal, deltaPercent, deltaAmount }` |
| `mobile/features/home/use-daily-available-sparkline.ts` | `['daily-available-sparkline', familyId]` | `number[]` of length `cycle.totalDays` capped at 12, one "disponible restante" per day in current payday cycle |
| `mobile/features/home/use-no-excess-streak.ts` | `['no-excess-streak', familyId]` | integer — consecutive days whose total expenses ≤ daily budget, counting backwards from today (stops at first bad day) |
| `mobile/features/home/use-month-daily-mood.ts` | `['month-daily-mood', familyId]` | `Record<dayNumber, 'green'\|'amber'\|'red'>` comparing each day's spend to the daily budget (green ≤ budget, amber ≤ 1.2× budget, red > 1.2×) |

**Definition details:**
- *Daily budget* = `family_finance.total_available / cycle.totalDays` at cycle start. If no cycle, hooks return `null` and the UI gracefully hides the derived piece.
- *Streak* resets the instant any day exceeds daily budget; today counts if the sum-so-far is still ≤ budget.
- *Monthly comparison* uses calendar months (not payday cycles) — matches the "VS MARZO" copy in the mock.
- *Sparkline* returns cumulative "disponible" (starting from `total_available`, subtracting each day's total expense), not daily deltas.

All hooks honor the staleTime / refetch conventions already used in the codebase (staleTime: 60s for aggregations, 30s for expense-derived).

## 7. Component tree

New components live under `mobile/components/home/` and are composed by `HomeDashboard`. Each file stays under ~200 lines — if a component needs more, it splits into `<name>-primitives.tsx` + `<name>.tsx` per the existing convention in `control-*.tsx`.

```
HomeDashboard
├── AmbientBlobs (new)              ← 3 floating radial blobs behind everything, pointer-events none
├── GreetingHeader (new)            ← contextual icon + "Buenas tardes," + "Hola, {name}"
├── FamilyStrip (new)               ← stacked avatars + name + count + payday pill
├── HomeHeroCardV2 (replaces home-hero-card.tsx)
│   ├── AuroraBackdrop (internal)   ← 3 absolutely-positioned radial blobs + diagonal shine
│   ├── HeroHeader (internal)       ← pulsing dot + label + month-day pill
│   ├── AnimatedHeroAmount (internal) ← CountUp with formatted display
│   ├── MarginLine (internal)       ← "Margen del mes +$X.XXX [▲ +18%]"
│   ├── HeroSparkline (new)         ← SVG path with stroke-dash draw animation + glowing end dot
│   └── HeroStatsRow (internal)     ← 3 HeroStat columns separated by 1px dividers
├── ShortcutCardsRow (new)          ← 2-col grid
│   ├── ShortcutCard (new, reusable) ← generic label/value/sub/trend/chart shell
│   ├── MiniBars (new)              ← 7-bar grow-bar chart
│   └── PagoDots (new)              ← row of colored dots (paid/pending)
├── MetaCard (new)                  ← dark card + floating emoji + progress bar + shine
├── HomeActivitySection (kept, header + empty/error/loading preserved)
│   └── ActivityRowV2 (replaces expense row component)
│       └── WhoPaidAvatar (internal) ← small avatar chip overlay
└── ConfirmSalarySheet (kept)
```

Components that `HomeDashboard` currently uses and **stay unchanged**: `ConfirmSalarySheet`, `HomeActivitySection`'s container, empty/error/loading internals, `Screen`, `IconButton`, `AmbientBackdrop` (still used for non-home screens).

Components that are **deleted** after this PR: `home-hero-card.tsx` and its dependencies that become dead (`payday-pill.tsx`, the legacy `amount-card.tsx` if unused elsewhere — verified against grep before removal).

## 8. Animations

The app already depends on `react-native-reanimated` and `react-native-svg`. All animations route through Reanimated shared values so they respect `useReducedMotion`. Numbers formatted with `Intl` are always formatted on the JS thread via `runOnJS` — per the recorded feedback memory that `Intl` inside a worklet crashes Expo Go.

| Animation | Technique |
|---|---|
| **Greeting rise** | `useSharedValue(translateY + opacity)` → `withTiming(0, { duration: 700 })` on mount. |
| **Sun/moon float-slow** | `withRepeat(withSequence(withTiming(+y, 2500), withTiming(-y, 2500)), -1, true)`. |
| **Family strip stagger** | each avatar animates in with a delay offset (`i * 80ms`). |
| **Payday pill dot** | `withRepeat(withTiming(scale 1.15), -1, true)` 1800ms. |
| **Hero aurora blobs** | 3 blobs, each with its own repeating `translate + scale` loop (9s / 11s / 13s). Rendered as `Animated.View` with `backgroundColor` radial-gradient emulated via `react-native-linear-gradient` + `borderRadius: 9999` + `opacity` / `filter: blur` equivalent (`MaskedView`-based glow or a simple `shadowColor` + `shadowRadius` to approximate blur on iOS, Android falls back to plain radial). |
| **Hero shine sweep** | diagonal linear-gradient rectangle translating across the hero card with `withRepeat` (4.2s loop). |
| **CountUp amount** | `useAnimatedReaction` on a shared value driven by `withTiming(target, 1600ms, Easing.out(Easing.cubic))` → `runOnJS(formatMoney)` → local state → Text. |
| **Sparkline draw** | `react-native-svg` `Path` with `strokeDasharray = length`, `strokeDashoffset` animated from `length` to `0` over 1.4s. |
| **Sparkline end dot** | after draw completes, fade in + breathe (`scale 1.0 → 1.08 → 1.0`, 2s loop). |
| **Hero stats rise** | translateY + opacity, staggered. |
| **Shortcut cards rise** | 200ms + 260ms delays, matching mock. |
| **Mini-bar grow** | `scaleY` origin-bottom via `transform: [{ scaleY }]` on each bar, stagger. |
| **Pago dots** | fade-in stagger (40ms per dot). |
| **Meta bar grow** | `scaleX` origin-left. |
| **Meta shine** | inner gradient block translating left→right on repeat (3.2s loop, 1.8s delay). |
| **Meta emoji float** | `translateY` 3s loop. |
| **Activity slide-in** | `translateX(-10) + opacity(0) → rest`, staggered by 60ms. |
| **Ambient page blobs** | float-slow loops, 9-13s. |

All entrance animations are skipped (or instant) when `useReducedMotion()` returns `true`; all idle/repeat loops stop.

## 9. Theme tokens

[mobile/theme/palette.ts](../../../mobile/theme/palette.ts) gets extended (not replaced) with the mock's token set, exposed under the same `light` / `dark` blocks the app already ships. New keys:

- `heroGradient` (tuple of 4 stops)
- `heroAccent` `#C7EE9C` / dark equivalent
- `heroMuted` / `heroMuted2` (rgba white tints)
- `creamSoft`, `peachSoft`, `peachBand`, `greenBand`, `redBand`
- `line`, `lineSoft` (card borders)
- `auroraA`, `auroraB`, `auroraC` (rgba colors for hero blobs)
- `shineOverlay` (rgba white gradient stop)
- `ringBg` (for avatar rings)

`buildScreenHeaderPalette` stays as-is; it already returns the right colors for light/dark and is consumed by the header icon buttons.

## 10. Settings — "Meta de ahorro"

A new row in the Settings list (`mobile/screens/settings/*` — follow the existing list pattern) with label "Meta de ahorro" and subtitle showing the current goal title or "Sin meta configurada". Pressing navigates to a form screen:

- Title (`TextField`, required, max 40 chars)
- Emoji (single-char `TextField` with emoji keyboard, required, default 🎯)
- Goal amount (numeric `TextField` with thousands formatting — reuse patterns from `family-finance` form)
- Current amount (numeric, default 0)
- Target months (numeric, optional)
- Toggle "Meta activa" (bool)
- Save button in `StickyFooter`

On save → `useUpsertSavingsGoal`. On success → `router.back()` + `triggerHaptic('success')`. Error path uses `Alert.alert` consistent with other settings forms.

If no goal exists, the form is in "create" mode and the save button reads "Crear meta".

## 11. Edge cases & error handling

- **No payment day configured** → no cycle → no sparkline, no hero-day pill, no daily-mood calendar. The MarginLine still shows `+$X vs income`; stat trio shows `Hoy / Gastado / —` with em-dash placeholder in the third column.
- **No savings goal** → Meta card is not rendered (section collapsed — not an empty state, per user intent: "the card shouldn't appear if there's no meta"). Settings still has the "Crear meta" entry.
- **No fixed expenses** → FIJOS shortcut card shows `$0 · 0 de 0 · sin fijos`, chart is a muted dot row.
- **No monthly-comparison previous month** → trend line is hidden (not replaced with zeros).
- **Dashboard error** → existing `ErrorState` path is preserved and wraps the new dashboard.
- **Recent expenses empty / error / loading** → handled by existing `HomeActivitySection` unchanged.
- **Reduced motion** → entrance animations skipped; idle loops suspended.
- **Family size > 5** → family strip shows first 4 avatars + a "+N" pill on the right.

## 12. Testing

Unit tests (Vitest) for all new pure functions in `mobile/features/home/home-dashboard-model.ts`:
- `computeNoExcessStreak`
- `computeMonthDailyMood`
- `computeMonthlyComparison`
- `buildDailyAvailableSparkline`
- `buildSavingsGoalMonthsRemaining` (derivation: `(goal - current) / avgMonthlyContribution`, graceful null)

Integration-style test for `HomeDashboard` rendering with realistic props (no network): asserts the seven sections appear, the meta card hides when goal is null, the FIJOS card shows "0 de 0" when no fixed expenses.

Snapshot test skipped — the design is animated, snapshots would be brittle.

## 13. Rollout

Single PR. No feature flag — the old `home-hero-card.tsx` is removed, not toggled. The new DB migration runs on the next supabase deploy; the app code tolerates both tables existing before / after the migration (empty results degrade gracefully).

## 14. Open questions

None — all blocking questions were resolved during brainstorming:
- Savings goals: new table + Settings form (confirmed).
- Fixed expense payments: new table with historical records (confirmed).
- Scope: light + dark + all animations + both tables + settings (confirmed, pixel-perfect).
