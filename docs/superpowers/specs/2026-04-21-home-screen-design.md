# Manifiesto — Home Screen Redesign Sub-Spec

**Date:** 2026-04-21
**Status:** Design approved, pending implementation plan
**Scope:** Single screen — `mobile/screens/home/home-screen.tsx` + its `mobile/components/home/` collaborators that compose the Inicio tab.
**Depends on:** Foundation Design v2 (all 5 phases merged — tokens, primitives, hooks, upgrades, copy).

---

## 1. Context

First sub-spec that consumes the Foundation. Home is the reference screen of the product per [BRIEF_UI_UX_MANIFIESTO.md](../../../BRIEF_UI_UX_MANIFIESTO.md) §8.3 and [DOCUMENTO_INSTITUCIONAL_TECNICO.md](../../../DOCUMENTO_INSTITUCIONAL_TECNICO.md) §7.3 — it answers the user's core question: *"¿Cómo está el hogar ahora mismo?"*.

The current [home-screen.tsx](../../../mobile/screens/home/home-screen.tsx) (176 lines) composes a `<HomeOverviewCard>` (350 lines — audit flagged oversized) plus a `<HomeActivityCard>` (160 lines). Layout today: greeting → combined overview card (balance + paycheck chip + salary-confirm button bundled together) → activity card with 3 recent expenses.

The redesign adopts the bold-friendly visual DNA locked in Foundation, wires `<AnimatedAmount>` on the hero value, introduces a 2-card metric strip for ahorro/fijos at-a-glance, replaces the legacy Animated list with `<SwipeableRow>` + `<CategoryBadge>`, and splits the oversized overview card into focused sub-components.

## 2. Goals

1. Deliver the first user-visible proof that Foundation was worth building — Home should feel noticeably different from day one of this merge.
2. Adopt `<AnimatedAmount>` on the hero value (CODE_RULES §20.3 — "animated amounts" was the highest-ROI gap in the audit).
3. Introduce the metric strip pattern (ahorro + fijos one-glance) per the H2 mockup validated during brainstorming.
4. Replace the legacy expense list with `<SwipeableRow>` + `<CategoryBadge>` — unlocks swipe-to-delete with visible affordance.
5. Surface salary confirmation via a `<PaydayChip>` inline in the hero area, opening a `<BottomSheet>` on tap — lighter-weight than the current inline button.
6. Decompose `<HomeOverviewCard>` (350 lines) into focused files each ≤ 100 lines.

## 3. Non-goals

- Scroll-linked large title animation (deferred to a future polish pass).
- Redesign of Gastos, Control, Gastos Fijos, Ajustes, Notificaciones screens (each is its own sub-spec).
- Changes to `useFamilyDashboard`, RPCs, or SQL — no data-layer work.
- Changes to tab bar or navigation (tab haptic already wired in P3).
- Per-category customization of icons (uses `<CategoryBadge>`'s resolution via `resolveCategoryHue` with the existing `category.id` as fallback seed — no new iconography authoring).
- New empty-state or copy strings beyond what already exists in `@/lib/copy/states` — if a string is missing, a new key gets added to `states.ts` in passing (not a stand-alone task).

## 4. Layout (H2 — 4 blocks)

```
<Screen>
├── ScreenHeader
│   • title: "Hola, {displayName}"
│   • rightSlot: IconButton(Notifications) + IconButton(Settings)
└── <HomeDashboard>
    ├── <PaydayChip />                   ← only if payday configured
    ├── <HomeHeroCard>                   ← brand.deep bg, AnimatedAmount hero, accent CTA
    ├── <HomeMetricStrip>                ← 2 cards: Ahorro + Fijos
    └── <HomeActivitySection>            ← eyebrow header + 3 rows + "Ver todos"
```

Vertical gap between major blocks: `theme.spacing.lg` (24). Inner padding stays at `theme.spacing.md` (16).

## 5. Component responsibilities

### 5.1 `<PaydayChip>` — `mobile/components/home/payday-chip.tsx`

Two states:
- **Default (no pending):** pasiva, shows days to next payday, `theme.colors.surfaceMuted` bg + `theme.colors.textMuted` text. Non-tappable.
- **Pending (pay day reached but not confirmed):** tappable, `theme.brand.bright` bg + `theme.brand.deep` text. Opens `<ConfirmSalarySheet>` on press. Fires `haptics.light()` on press-in. Enters with `motionSprings.celebrate` pop when transitioning from default → pending.

Shape: `Pressable` wrapping a row with an SF Symbol (`clock.badge.checkmark.fill` or similar) + label text. Height 32, radius `radii.pill`. Left-aligned, not full width.

Props: `{ daysUntilPayday: number | null; isPending: boolean; onPressConfirm: () => void }`.

### 5.2 `<HomeHeroCard>` — `mobile/components/home/home-hero-card.tsx`

- Background: `theme.brand.deep` in both modes. Border radius `theme.radii['2xl']` (28).
- Shadow: matches the existing `BrandedPanel` elevation or a lighter equivalent. Shadow color `theme.brand.deep` with low opacity.
- Content (vertical stack):
  - Eyebrow: `typography.eyebrow` + `theme.brand.bright` color + text `"Disponible hoy"`.
  - Hero value: `<AnimatedAmount value={dashboard.availableToday} variant="hero" hapticOnChange color="#FFFFFF" />`.
  - Context: `typography.bodySmall` + muted off-white (`rgba(255,255,255,0.7)`). Composed from glossary: *"Margen del mes {sign}${amount}"* using `terms.margin`.
  - CTA: `<AppButton variant="accent" label="Registrar gasto" size="compact" fullWidth={false}>` → navigates to `(app)/(tabs)/add` via `useRouter().push`.

Props: `{ availableToday: number; projectedMargin: number; onPressAddExpense: () => void }`.

### 5.3 `<HomeMetricStrip>` — `mobile/components/home/home-metric-strip.tsx`

- Row of 2 metric cards, `gap: theme.spacing.sm` (12).
- Each card: `theme.colors.surface` bg, `radii.lg` (18), padding `theme.spacing.md` (16), subtle shadow (matches `<AppCard>` shape).
- Each card contains:
  - Eyebrow (uppercase label): *"Ahorro"* / *"Fijos"*. `typography.fieldLabel` + `theme.colors.textMuted`.
  - Value: `<AnimatedAmount variant="metricValue" />`.
  - Sublabel (optional): small caption — *"del mes"* / *"pagado"* — `typography.caption` + `textSoft`.
- Staggered entry: card 1 at `motionStagger.listItem * 0` post-hero; card 2 at `listItem * 1`. Use Reanimated entry animation via a shared hook or inline `useSharedValue`.

Props: `{ savedAmount: number; fixedAmount: number }` — sourced from `useFamilyDashboard`'s snapshot.

### 5.4 `<HomeActivitySection>` — `mobile/components/home/home-activity-section.tsx`

Replaces the existing `<HomeActivityCard>`.

- Header row: `<SectionHeader>`-like but custom inline here — eyebrow *"Reciente"* + right-side ghost action *"Ver todos"* that pushes to the full history screen.
- List: fixed to the last 3 recent expenses. Each row uses `<SwipeableRow>`:
  - Row content (inside SwipeableRow children): a `<Pressable>` row composed of `<CategoryBadge size="md" tone="soft">` + name/meta column + amount.
  - Required `accessibilityHint="Desliza hacia la izquierda para eliminar"` on every row.
  - `rightActions: [{ label: 'Eliminar', tone: 'danger', onPress: handleDelete }]`.
  - On swipe open: `haptics.selection()`. On delete: `haptics.warning()` followed by `haptics.success()` after server confirms (or `haptics.error()` on failure).
- Empty: `<EmptyState stateKey="expensesThisCycle" icon="receipt-long" action={{ label: 'Registrar primer gasto', onPress: () => router.push(...) }} />`.
- Error (when `recentExpensesQuery.isError && recentExpenses.length === 0`): `<ErrorState>` with `errorMessages.network` if error looks like a network failure, else `errorMessages.server`. Detection via a tiny `classifyDashboardError(error)` helper (pure, tested).

Props: `{ expenses: Expense[]; categoryNameById: Map<string, string>; isLoading: boolean; errorKind?: 'network' | 'server'; onDelete: (expenseId: string) => void; onRetry: () => void; onViewAll: () => void }`.

### 5.5 `<ConfirmSalarySheet>` — `mobile/components/home/confirm-salary-sheet.tsx`

Content to be rendered inside a `<BottomSheet snapPoints={['40%']}>`. Opens from the `<PaydayChip>` pending state.

- Title (typography.sectionTitle): *"¿Todo ok con este cobro?"*
- Description (typography.body + textMuted): two lines explaining what confirmation does.
- Primary: `<AppButton variant="primary" label="Sí, confirmar cobro" loading={isSaving}>` → calls the existing `buildSalaryConfirmationInput` + `useUpsertFamilyFinance.mutate`, same as today.
- Secondary: `<AppButton variant="ghost" label="Más tarde">` → closes sheet.
- On success: `haptics.success()` + sheet dismisses automatically.
- On error: inline error text + `haptics.error()` + keep sheet open.

Props: `{ visible: boolean; onDismiss: () => void; dashboard: FamilyDashboardSnapshot; isSaving: boolean; onConfirm: () => void; errorMessage?: string }`.

### 5.6 `<HomeDashboard>` — `mobile/components/home/home-dashboard.tsx`

Thin orchestrator. Replaces `<HomeOverviewCard>`. Composes the 4 blocks above, passing down props from dashboard hook results. Manages the sheet visibility state via `useState<boolean>`.

Props: mirrors the current `<HomeOverviewCard>` but narrower — pass the already-computed derivations rather than the full dashboard object.

## 6. `home-screen.tsx` shape

Post-refactor, the screen file:
- Resolves hooks (`useMyProfile`, `useFamilyDashboard`, `useCategories`, `useRecentExpenses`, `useUpsertFamilyFinance`).
- Derives presentational values via a pure helper in `home-dashboard-model.ts` (new file): the error classification, derived category name map, pending-payday boolean, derived metric values (ahorro, fijos), etc. Tested in Node via vitest.
- Renders `<Screen>` with title "Hola, {displayName}" + rightSlot and delegates the body to `<HomeDashboard>`.
- Handles delete-expense mutation and passes the handler down.

Target size: ≤120 lines. Current is 176 lines.

## 7. File plan

### New files

| Path | Responsibility |
|---|---|
| `mobile/components/home/home-hero-card.tsx` | Dark hero card with AnimatedAmount + CTA |
| `mobile/components/home/payday-chip.tsx` | Countdown/pending chip |
| `mobile/components/home/home-metric-strip.tsx` | 2-card strip (ahorro/fijos) with stagger entry |
| `mobile/components/home/home-activity-section.tsx` | SwipeableRow list + empty/error delegation |
| `mobile/components/home/confirm-salary-sheet.tsx` | Sheet content for salary confirmation |
| `mobile/components/home/home-dashboard.tsx` | Orchestrator replacing HomeOverviewCard |
| `mobile/features/home/home-dashboard-model.ts` | Pure derivations: classifyDashboardError, buildHomeMetrics, isPaydayPending, etc. |
| `tests/unit/home-dashboard-model.test.ts` | Unit tests for pure derivations |

### Modified files

| Path | Change |
|---|---|
| `mobile/screens/home/home-screen.tsx` | Trimmed to ~120 lines, delegates to HomeDashboard, uses model helpers |
| `mobile/components/home/home-overview-card.tsx` | DELETED (replaced by home-dashboard.tsx + split children) |
| `mobile/components/home/home-activity-card.tsx` | DELETED (replaced by home-activity-section.tsx) |
| `mobile/lib/copy/states.ts` | Add a key for the "Ver todos" action label if referenced from glossary (likely keep inline — minor) |

### Files left alone

- `mobile/components/home/financial-summary-radial*.tsx` — kept for Control sub-spec, not removed from codebase. Home simply stops rendering them.
- `mobile/components/home/home-overview-card.tsx`: kept until `home-dashboard.tsx` fully takes over, then deleted in the final cleanup commit.
- `mobile/hooks/use-family-dashboard.ts` — no changes.

## 8. Motion adoption map

| Event | Primitive + token |
|---|---|
| Screen entrance (header + content) | `useScreenEntrance` (already wired to `motionSprings.enter`) |
| Hero value changes | `<AnimatedAmount hapticOnChange>` — spring via `motionSprings.value`, celebrate + success haptic on favorable change |
| Metric cards entrance | Reanimated 4 worklet, staggered via `motionStagger.listItem`, `motionSprings.enter` |
| PaydayChip default → pending transition | `motionSprings.celebrate` + `haptics.light()` |
| PaydayChip press | press-scale via `usePressScale` (0.97) + `haptics.light()` |
| BottomSheet open | native gorhom physics (already in Foundation P2) |
| SwipeableRow open (affordance threshold) | `haptics.selection()` (already in SwipeableRow primitive) |
| Row delete | `haptics.warning()` (in primitive) → `haptics.success()` post-server (in consumer handler) |
| Activity row tap | currently n/a — rows are read-only. Future: tap opens detail. Out of scope here. |
| CTA "Registrar gasto" press | `<AppButton variant="accent">` — default haptic `light` via the variant's resolved tone |

## 9. Data flow

Unchanged at the hook level:
- `useMyProfile(userId)` → displayName for the greeting.
- `useFamilyDashboard(familyId)` → the snapshot with availableToday, projectedMargin, savedAmount, fixedAmount, salaryPaymentDay, lastSalaryConfirmedAt.
- `useCategories(familyId)` → for the category name map.
- `useRecentExpenses(familyId, 3)` → the 3 recent expenses.
- `useUpsertFamilyFinance(familyId)` → for the salary confirmation mutation.

New logic (all pure, testable):
- `classifyDashboardError(error): 'network' | 'server' | 'unknown'` — inspects the error for common network markers (fetch abort, TypeError, timeout) vs server-like (HTTP code, Supabase RPC errors).
- `buildHomeMetrics(dashboard): { availableToday, projectedMargin, savedAmount, fixedAmount }` — extracts the four numbers the UI needs.
- `isPaydayPending(dashboard, today): boolean` — true when `currentPaydayDate <= today` and `lastSalaryConfirmedAt < currentPaydayDate`.
- `daysUntilPayday(dashboard, today): number | null` — for the chip default state.

### 9.1 Delete expense flow

When a `<SwipeableRow>` delete fires:
1. Optimistic update on the React Query cache (`setQueryData` to remove the expense).
2. Call the existing `useDeleteExpense` mutation (add if not present — but one likely exists; check `mobile/features/expenses/*.ts`).
3. On error: rollback cache, show a toast or inline error + `haptics.error()`. Toast mechanism: use a simple local state + `Animated.View` at the top of the screen — or skip toast and rely on `<ErrorState>` replacing the list section temporarily. Decision: inline toast deferred; if delete fails, the row reappears (rollback) and an alert fires via the existing `Alert.alert` pattern from the current screen.

## 10. States (UI lifecycle)

Per CODE_RULES §19.

| State | Hero | Metric strip | Activity section |
|---|---|---|---|
| Loading (initial fetch) | `<HeroSkeleton />` | `<MetricStripSkeleton count={2} />` | `<ListRowSkeleton rows={3} />` |
| Content (happy path) | `<HomeHeroCard>` | `<HomeMetricStrip>` | `<HomeActivitySection>` with rows |
| Empty (content loaded, expenses.length === 0) | `<HomeHeroCard>` | `<HomeMetricStrip>` | `<EmptyState stateKey="expensesThisCycle">` |
| Partial error (dashboard error, but some data) | `<HomeHeroCard>` with cached snapshot | strip with cached values | `<ErrorState>` inline if activity failed, otherwise normal rows |
| Total error (no data anywhere) | `<ErrorState>` replacing the entire dashboard body | (not rendered) | (not rendered) |

PaydayChip renders only when `dashboard.familyFinanceQuery.data?.salary_payment_day` is non-null — otherwise it's hidden.

## 11. Accessibility

- PaydayChip in pending state: `accessibilityRole="button"`, `accessibilityLabel="Confirmar cobro del día"`, `accessibilityHint="Abre una hoja para confirmar el cobro de este ciclo"`.
- PaydayChip in default state: `accessibilityRole="text"` (not tappable).
- Hero value: `<AnimatedAmount>` already sets an `accessibilityLabel` to the formatted text.
- Metric cards: `accessibilityLabel` composed as "Ahorro: $3.200 del mes" / "Fijos: $8.100 pagado".
- Activity rows: `accessibilityLabel="Supermercado, Comida, -$2.400, hoy"` + the required `accessibilityHint` on `<SwipeableRow>`.
- "Ver todos" action: `accessibilityLabel="Ver todo el historial"`, `accessibilityRole="button"`.
- Color states: hero, strip, and rows never rely on color alone — all semantics have icon or label equivalents.

## 12. Testing

- Unit (`tests/unit/home-dashboard-model.test.ts`):
  - `classifyDashboardError` for: abort signal, TypeError, HTTP 5xx mock, HTTP 4xx mock, unknown.
  - `isPaydayPending` for: payday today + unconfirmed = true; payday in 3 days = false; payday yesterday + confirmed today = false; no payday configured = false.
  - `daysUntilPayday` for: today = 0; tomorrow = 1; next week = 7; past payday = null.
  - `buildHomeMetrics` snapshot test against a representative dashboard object.
- Visual: manual pass on simulator in light + dark. Home must render without layout regressions, animations must feel smooth, haptics must fire where expected.
- Not tested: component rendering (no RN renderer in Node) — relies on typecheck + manual pass.

## 13. Dependencies

None new. All primitives and hooks come from Foundation v2.

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `<HomeOverviewCard>` being deleted leaves dangling imports | Grep before delete; the orchestrator `<HomeDashboard>` is imported by `home-screen.tsx` only — one call site. |
| Delete mutation not yet wired in a hook | Implementation task includes creating `useDeleteExpense` if missing (mirrors existing mutation style). |
| `<AnimatedAmount>` first-paint flicker when the initial value is undefined | Guard: only render the hero card once `dashboard.availableToday` is a number; show skeleton otherwise. |
| `<BottomSheet>` modal interference with tab bar | gorhom handles tab bar z-indexing automatically; verify on simulator. |
| Category icons missing for user-created categories | `<CategoryBadge>`'s fallback resolver uses hash → existing canonical hues; any id yields a stable hue. |

## 15. Execution phases

Single PR — scope is tight and cohesive.

1. **Phase 1 · Pure model** — Write `home-dashboard-model.ts` + unit tests (TDD). No UI yet.
2. **Phase 2 · Hero + metric strip** — Build `<HomeHeroCard>` and `<HomeMetricStrip>` with their entry animations.
3. **Phase 3 · PaydayChip + ConfirmSalarySheet** — Chip state machine + sheet flow.
4. **Phase 4 · Activity section** — `<HomeActivitySection>` with SwipeableRow + CategoryBadge, including empty/error/loading states.
5. **Phase 5 · Dashboard orchestrator + screen swap** — `<HomeDashboard>` composes the above, `home-screen.tsx` refactor, delete `<HomeOverviewCard>` + `<HomeActivityCard>`.
6. **Phase 6 · Validate + polish** — Run `validate`, fix any lint/typecheck/guard issues, manual pass.

Each phase is a commit. Combined into one PR.

## 16. Exit criteria

- Home screen renders the new H2 layout on simulator in both light and dark.
- `<AnimatedAmount>` animates hero value changes with haptic.
- `<PaydayChip>` surfaces pending salary confirmation; tap opens `<BottomSheet>`; confirm succeeds and dismisses.
- `<SwipeableRow>` lets user delete an expense with visible affordance + haptic confirmation.
- `home-screen.tsx` is ≤ 120 lines, `<HomeDashboard>` ≤ 60, each sub-component ≤ 100.
- Deleted: `home-overview-card.tsx`, `home-activity-card.tsx`.
- `./scripts/npmw run validate` passes (allowing the 1 pre-existing lint error unrelated to Home).
- 4+ new unit tests in `home-dashboard-model.test.ts`, all green.
