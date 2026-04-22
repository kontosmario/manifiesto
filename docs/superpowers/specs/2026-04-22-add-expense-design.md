# Manifiesto — Add Expense Redesign Sub-Spec

**Date:** 2026-04-22
**Status:** Design approved, pending implementation plan
**Scope:** Single screen — `mobile/screens/home/add-expense-screen.tsx` + its `mobile/components/home/` collaborators that compose the Agregar tab.
**Depends on:** Foundation Design v2 (all 5 phases merged) + Home sub-spec (for the Add→Home success loop).

---

## 1. Context

The Add Expense flow is, per [BRIEF_UI_UX_MANIFIESTO.md](../../../BRIEF_UI_UX_MANIFIESTO.md) §8.5 and [DOCUMENTO_INSTITUCIONAL_TECNICO.md](../../../DOCUMENTO_INSTITUCIONAL_TECNICO.md) §7.4, the most frequent user action in the app. Current implementation: [add-expense-form.tsx](../../../mobile/components/home/add-expense-form.tsx) (304 lines) renders a traditional vertical form inside a `<BrandedPanel>` with:

- `<TextField>` for amount using the system `decimal-pad` keyboard
- Two "highlight cards" side-by-side (category name + amount ready)
- Horizontal `<Chip>` scrolls for suggested amounts, categories, and description suggestions
- `<TextField>` for description
- Submit button at the bottom of a ScrollView (buried — requires scroll on small devices)

After submit, `router.replace('/(app)/(tabs)/expenses')` takes the user to the history, which is jarring and loses context.

The redesign adopts the Foundation DNA (bold friendly, dark hero moments, muted hues, iOS-native motion) with an **amount-hero + N2 contextual numpad** flow. The key conceptual win is that success animations live on **Home** (via `<AnimatedAmount>`'s natural spring + haptic on value change), not on the Add screen — so the user sees their available balance physically tick down after the submit, reinforcing cause-and-effect.

## 2. Goals

1. Make the most frequent action feel effortless: 3 taps to log a typical expense (amount via numpad → category tile → submit).
2. Use an **in-app numpad** instead of the system decimal-pad keyboard — takes over the bottom half only while editing the amount, dismisses to reveal the sticky CTA.
3. Replace the horizontal chip scroll of categories with a 2-col grid of `<SelectableCard>` that matches Foundation's tile pattern.
4. Replace the bottom-of-scroll submit button with a `<StickyFooter>` that's always reachable without scrolling.
5. Change the post-submit navigation from `replace('/expenses')` to `back()` — lands the user on Home, where `<AnimatedAmount>` animates the available balance dropping. That visible animation IS the success feedback.
6. Decompose the 304-line `<AddExpenseForm>` into 6 focused files each ≤ 130 lines.

## 3. Non-goals

- Batch adding multiple expenses (still one-at-a-time; the loop is fast because of `router.back()`).
- Voice input for amount.
- Photo/receipt attachments.
- Splitting an expense between family members.
- Rendering a live preview of the available balance inside the Add screen (considered and rejected — the feedback moment lives on Home).
- Changes to the expense creation mutation (`useCreateExpense`) or invalidation strategy — already correct.
- Redesign of the "Agregar" tab button itself (the FAB in the tab bar stays as is — Phase 3 already wired its haptic).

## 4. Flow: F3 + N2

### 4.1 Initial state on mount

On route mount, the user sees:

```
┌────────────────────────────────┐
│ [←]  Agregar         [Hist.]   │  ← Screen header
├────────────────────────────────┤
│                                │
│   ╭────────────────────────╮   │
│   │   MONTO                │   │
│   │   $0                   │   │  ← AmountCard (pressable, focused by default)
│   ╰────────────────────────╯   │
│                                │
│   [500] [1k] [2.5k] [5k] [10k] │  ← SuggestedAmountStrip (horizontal chips)
│                                │
│   CATEGORÍA                    │  ← eyebrow
│   ┌─────────┐  ┌─────────┐     │
│   │ 🛒      │  │ 🚕      │     │  ← CategoryPickerGrid (2-col SelectableCard)
│   │ Comida  │  │ Transp. │     │
│   └─────────┘  └─────────┘     │
│   ┌─────────┐  ┌─────────┐     │
│   │ 🏠 Casa │  │ 💊 Salud│     │
│   └─────────┘  └─────────┘     │
│   ┌─────────┐  ┌─────────┐     │
│   │ 🎬 Ocio │  │  Ver    │     │  ← "Ver todas" slot if > 7 categories
│   └─────────┘  └─────────┘     │
│                                │
│   ＋ Agregar descripción        │  ← DescriptionRow (collapsed)
│                                │
├────────────────────────────────┤
│      [Guardar gasto]           │  ← StickyFooter
└────────────────────────────────┘

   ╔═══════════════════════╗
   ║                Listo  ║
   ║  1   2   3            ║     ← NumpadOverlay (slides up on mount —
   ║  4   5   6            ║       amount is default-focused)
   ║  7   8   9            ║
   ║  ,   0   ⌫            ║
   ╚═══════════════════════╝
```

### 4.2 User journey (happy path)

1. User taps the FAB on the tab bar → navigates to `/(app)/(tabs)/add`.
2. Screen mounts. The numpad slides up immediately (because amount is 0 and focused). Sticky footer is hidden by the numpad overlay.
3. User taps digits in the numpad → `$0 → $2 → $24 → $240 → $2.400`. Each digit: `haptics.selection`. The `<AnimatedAmount>` on the AmountCard animates the value with `motionSprings.value`.
4. User taps "Listo" on the numpad → numpad slides down, sticky footer appears. The first suggested-amount chip matching the typed value highlights with a `motionSprings.celebrate` pop.
5. User taps a category tile (e.g., "Comida") → `<SelectableCard>` selected state + `haptics.selection`.
6. (Optional) User taps "＋ Agregar descripción" → row expands with an `<InputGroup>`. Types description or picks a quick-suggestion chip.
7. User taps "Guardar gasto" in the sticky footer → `haptics.light` immediately, button shows loading spinner.
8. Mutation fires. On success: `haptics.success` + `router.back()` — user lands on Home.
9. Home mounts. React Query's cache for `family-dashboard` and `recent-expenses` was invalidated in the mutation's `onSuccess`, so Home refetches. When new data arrives, `dashboard.totalAvailable` drops. The `<AnimatedAmount hapticOnChange>` on Home's hero animates from old to new via `motionSprings.value` spring + a secondary `haptics.selection` (direction: unfavorable) — user physically sees the balance tick down.

### 4.3 Edit / adjustment flow

- Tap again on the AmountCard → numpad re-opens; current value is editable from the raw string (not cleared automatically).
- Tap a suggested amount chip (500/1k/etc) → overwrites the current amount to that exact value. `haptics.selection`.
- Tap a different category → re-selects instantly; no numpad involved.
- Tap outside the numpad (on any non-numpad area) → numpad dismisses automatically before processing the tap.

### 4.4 Error flow

- Categories failed to load: `<ErrorState>` replaces the entire form body with a retry button, as today.
- Zero categories exist: `<EmptyState stateKey="categories">` with CTA to open the category creation flow.
- Submit mutation error: `haptics.error` + inline error bar just above the sticky footer with text from `errorMessages.network` or `errorMessages.server` (classified via the shared `classifyDashboardError` helper from home-dashboard-model). Button re-enables. Form state preserved.
- Amount is `0` or category is unselected: submit button disabled — user cannot reach the mutation.

## 5. Component responsibilities

### 5.1 `<InAppNumpad>` — `mobile/components/ui/in-app-numpad.tsx`

New primitive. Reusable in future flows (add fixed expense, payment amount, etc.).

Props:

```tsx
<InAppNumpad
  visible={boolean}
  rawValue={string}              // e.g. "2400" or "2400,50"
  onChangeRawValue={(v) => void}
  onDismiss={() => void}
  maxIntegerDigits={8}           // safety cap, e.g. 99,999,999
  maxDecimalDigits={2}
  doneLabel="Listo"
/>
```

Behavior:

- Renders as a vertical slide-up overlay pinned to the bottom of the screen. Uses `<BottomSheet>` under the hood with `snapPoints={['50%']}` to leverage the existing native sheet physics, and `enableDynamicSizing={true}` so the numpad is exactly its natural height.
- Numpad grid 3-col × 4-row: `1-9` + `,` + `0` + `⌫`. Each cell is a `<Pressable>` with `motionSprings.press` scale 0.92 on press-in, `haptics.selection` on press.
- `⌫` long-press (>450ms) clears entire raw value with `haptics.warning`.
- `,` only appends if the raw value does not already contain a comma; otherwise no-op.
- Digits respect `maxIntegerDigits` / `maxDecimalDigits`.
- "Listo" button sits above the grid, full-width, primary variant. Tap fires `onDismiss()` + `haptics.selection`.
- Backdrop tap also fires `onDismiss()` (gorhom backdrop behavior).

Pure logic extracted to `mobile/components/ui/in-app-numpad-model.ts`:

```ts
export function appendDigit(raw: string, digit: string, opts: { maxIntegerDigits: number; maxDecimalDigits: number }): string
export function appendComma(raw: string): string
export function backspace(raw: string): string
export function clearAll(): string
```

Tested in Node via vitest.

### 5.2 `<AmountCard>` — `mobile/components/home/amount-card.tsx`

Props:

```tsx
<AmountCard
  amount={number}                // parsed numeric
  onPress={() => void}           // opens the numpad
  hasValidAmount={boolean}
/>
```

Renders a `<Pressable>` card with:

- Eyebrow `typography.eyebrow` + `theme.colors.textMuted` reading "MONTO".
- `<AnimatedAmount value={amount} variant="hero" />` as the protagonist — animates on every raw-value change via its internal `motionSprings.value` spring.
- Subtle hint "Tap para editar" top-right if not currently editing.
- Card surface: `theme.colors.surface`, border `theme.brand.deep` (2px when active/focused, hairline otherwise), `radii['2xl']`, gentle shadow.
- Press scale via `usePressScale(0.98)`.
- Tap → `onPress()` + `haptics.light`.

### 5.3 `<SuggestedAmountStrip>` — `mobile/components/home/suggested-amount-strip.tsx`

Props:

```tsx
<SuggestedAmountStrip
  amounts={number[]}             // 3-5 suggestions
  currentAmount={number}
  onSelect={(value: number) => void}
/>
```

Horizontal `<ScrollView>` of `<Chip>` with `density="compact"`. The chip whose value matches `currentAmount` (rounded) shows active state + plays a one-time `motionSprings.celebrate` pop when newly matched.

### 5.4 `<CategoryPickerGrid>` — `mobile/components/home/category-picker-grid.tsx`

Props:

```tsx
<CategoryPickerGrid
  categories={Category[]}
  selectedCategoryId={string}
  onSelect={(categoryId: string) => void}
  onSeeAll={() => void}
/>
```

- Renders up to 6 categories in a 2-col grid of `<SelectableCard size="md">` plus a 7th "Ver todas" tile that calls `onSeeAll`.
- Each tile: leading `<CategoryBadge categoryId size="md" tone="soft">` + name (typography.buttonDefault). Card height ~64pt.
- Ordering: top 6 by user frequency. Derivation helper `rankCategoriesByUsage(expenses, categories): Category[]` lives in `mobile/features/home/add-expense-model.ts` (pure, testable).
- If there are ≤6 categories total, no "Ver todas" tile shown.

### 5.5 `<AllCategoriesSheet>` — `mobile/components/home/all-categories-sheet.tsx`

`<BottomSheet>` with snapPoints `['75%', '95%']`. Content:

- Title "Todas las categorías" (typography.sectionTitle).
- Vertical list (FlatList) of `<SelectableRow>` entries: CategoryBadge leading, name, check on the right when selected.
- Sticky bottom button "＋ Crear categoría" → dismisses sheet + navigates to category editor (reuses existing category creation modal).
- Tap a row → select + `onDismiss()` via ref.

Props:

```tsx
<AllCategoriesSheet
  ref={BottomSheetHandle}
  categories={Category[]}
  selectedCategoryId={string}
  onSelect={(categoryId) => void}
  onCreateNew={() => void}
/>
```

### 5.6 `<DescriptionRow>` — `mobile/components/home/description-row.tsx`

Two visual states:

**Collapsed** (default):

- `<Pressable>` row: "＋" icon + "Agregar descripción (opcional)" in `typography.bodySmall` + `theme.colors.textMuted`. Height 44.
- Tap → expands.

**Expanded**:

- `<InputGroup label="Descripción">` with a `<TextField>` (`autoCapitalize="sentences"`, `autoCorrect={false}`, `returnKeyType="done"`, `maxLength={60}`). Auto-focuses.
- Quick-suggestion chips under the field: top 3 descriptions from history filtered by selected category. Tap chip → fills field.
- Collapse back when field blurs and is empty.

Props:

```tsx
<DescriptionRow
  description={string}
  onChange={(v: string) => void}
  quickSuggestions={string[]}
  onSelectSuggestion={(v: string) => void}
/>
```

Animated collapse/expand with `motionSprings.enter` (height + opacity transition).

### 5.7 `<AddExpenseDashboard>` — `mobile/components/home/add-expense-dashboard.tsx`

Orchestrator. Manages numpad visibility state + `<AllCategoriesSheet>` ref. Composes the 4 sub-components + the numpad overlay. Hides the `<StickyFooter>` parent when numpad is visible (or passes a prop to conceal the CTA).

Props mirror what the current `<AddExpenseForm>` receives, but simplified:

```tsx
<AddExpenseDashboard
  rawPrice={string}
  parsedAmount={number}
  hasValidAmount={boolean}
  amountHelper?: string
  categories={Category[]}
  rankedCategories={Category[]}     // top 6 for the grid
  selectedCategoryId={string}
  suggestedAmounts={number[]}
  quickDescriptionSuggestions={string[]}
  description={string}
  isBusy={boolean}
  submitErrorMessage?: string | null
  onRawPriceChange={(s: string) => void}
  onSelectSuggestedAmount={(n: number) => void}
  onSelectCategory={(id: string) => void}
  onSelectDescriptionSuggestion={(s: string) => void}
  onDescriptionChange={(s: string) => void}
  onSubmit={() => void}
/>
```

### 5.8 Screen shape

`mobile/screens/home/add-expense-screen.tsx` after refactor:

- Resolves hooks (`useAddExpenseController`) — same as today. The controller is simplified (see 6.1) to expose `rawPrice` / `setRawPrice` in addition to the existing formatted price.
- Renders `<Screen canGoBack title="Agregar" rightSlot={<Historical icon>}>`.
- Body: `<AmbientBackdrop variant="form">` (light mode) + `<ErrorState>` OR `<EmptyState>` OR `<AddExpenseDashboard>`.
- Target: ≤ 120 lines.

## 6. Controller changes

### 6.1 `use-add-expense-controller.ts`

Current exposes `price: string`, `amount: number`, `isPriceFocused: boolean`, etc. After refactor:

- Add `rawPrice: string` — the raw input string as entered via the numpad (no formatting). The current `price` can be derived from `rawPrice` via `formatPriceInputValue`.
- Remove `isPriceFocused` — it was used to toggle formatting. Numpad always shows the canonical formatted value via `<AnimatedAmount>`.
- Add `isNumpadVisible: boolean` + `setNumpadVisible(visible: boolean)` actions.
- Keep all existing derivations (`selectedCategoryId`, `suggestedAmounts`, `quickDescriptionSuggestions`, `amountHelper`, `hasValidAmount`, `submitExpense`).
- Add `rankedCategories: Category[]` — the top 6 + rest, via new pure helper.

All existing tests pass; new helpers get unit tests.

### 6.2 New pure helpers

`mobile/features/home/add-expense-model.ts`:

```ts
export function rankCategoriesByUsage(
  expenses: Expense[],
  categories: Category[],
  limit?: number,
): Category[]

export function pickTopCategoryDescriptions(
  expenses: Expense[],
  categoryId: string,
  limit?: number,
): string[]
```

Tested in Node via vitest.

## 7. File plan

### New files

| Path | Responsibility |
|---|---|
| `mobile/components/ui/in-app-numpad.tsx` | Reusable in-app numpad overlay |
| `mobile/components/ui/in-app-numpad-model.ts` | Pure string-state logic |
| `tests/unit/in-app-numpad-model.test.ts` | Unit tests for the pure logic |
| `mobile/components/home/amount-card.tsx` | Pressable card with AnimatedAmount hero |
| `mobile/components/home/suggested-amount-strip.tsx` | Horizontal quick-amount chips |
| `mobile/components/home/category-picker-grid.tsx` | 2-col SelectableCard grid |
| `mobile/components/home/all-categories-sheet.tsx` | BottomSheet listing all categories |
| `mobile/components/home/description-row.tsx` | Collapsible description input |
| `mobile/components/home/add-expense-dashboard.tsx` | Orchestrator replacing AddExpenseForm |
| `mobile/features/home/add-expense-model.ts` | `rankCategoriesByUsage`, `pickTopCategoryDescriptions` pure helpers |
| `tests/unit/add-expense-model.test.ts` | Unit tests for the helpers |

### Modified files

| Path | Change |
|---|---|
| `mobile/screens/home/add-expense-screen.tsx` | Delegates to `<AddExpenseDashboard>`, trimmed to ~120 lines |
| `mobile/features/expenses/use-add-expense-controller.ts` | Adds `rawPrice` / `setRawPrice` / `isNumpadVisible` / `setNumpadVisible` / `rankedCategories`. Removes `isPriceFocused`. Keeps the rest. |
| `mobile/components/ui/index.ts` | Export `InAppNumpad` primitive |

### Deleted files

| Path | Why |
|---|---|
| `mobile/components/home/add-expense-form.tsx` (304 lines) | Replaced by `<AddExpenseDashboard>` + split children |

## 8. Motion adoption map

| Event | Primitive + spring |
|---|---|
| Screen entrance | `useScreenEntrance` (already tokenized) |
| AmountCard press | `usePressScale(0.98)` using `motionSprings.press` |
| AnimatedAmount on raw value change | `motionSprings.value` spring + no haptic here (haptic fires per digit via numpad) |
| Numpad open (slide-up) | BottomSheet's gorhom native physics (`motionSprings.sheet` internally) |
| Numpad digit press | `motionSprings.press` scale 0.92 + `haptics.selection` |
| Numpad backspace press | `motionSprings.press` + `haptics.light` |
| Numpad backspace long-press (clear all) | `haptics.warning` |
| Numpad Listo | `haptics.selection` + BottomSheet dismiss |
| Suggested amount chip press | Chip's press scale 0.97 + `haptics.selection` |
| Suggested amount chip becomes active | `motionSprings.celebrate` one-shot pop |
| SelectableCard press | Primitive's `motionSprings.press` + `haptics.selection` |
| SelectableCard check affordance in | `motionSprings.celebrate` scale 0→1 |
| DescriptionRow expand/collapse | `motionSprings.enter` on height + opacity |
| Submit success | `haptics.success` immediately + `router.back()` |
| Submit error | InputGroup (if relevant field) shake + `haptics.error` + inline error strip with motion fade-in |
| Home hero sees value drop | Home's existing `<AnimatedAmount hapticOnChange>` — `motionSprings.value` + `haptics.selection` |

## 9. Data flow

Unchanged at the data layer. The controller still wraps:

- `useCategories(familyId)` → category list
- `useCategoryTemplates()` → template fallbacks
- `useExpenses(familyId)` → for suggestion ranking
- `useFamilyDashboard(familyId)` → already present; used by `computeDailyBudgetSummary` for the amount helper string
- `useCreateExpense(familyId, userId)` → mutation

The mutation's existing `onSuccess` (inside `useCreateExpense`) already invalidates the relevant React Query keys so Home's re-render picks up the new dashboard state automatically. No changes needed.

## 10. States

Per CODE_RULES §19.

| State | Screen body |
|---|---|
| Loading (categories query loading, first mount) | `<LoadingBlock label={loadingLabels.categories}>` inside the form frame |
| Empty (no categories exist) | `<EmptyState stateKey="categories" action={{ label: 'Crear categoría', onPress: navigateToCategoryEditor }}>` |
| Error (categories failed to load) | `<ErrorState description={errorMessages...} onAction={refetch}>` |
| Content (categories available) | `<AddExpenseDashboard>` |

Submit error handled inline within the dashboard, not replacing the form.

## 11. Accessibility

- `<AmountCard>`: `accessibilityRole="button"`, `accessibilityLabel="Monto: ${formattedAmount}"`, `accessibilityHint="Abre el numpad para editar el monto"`.
- `<InAppNumpad>` keys: each a button with `accessibilityLabel="${digit}"` (digits), `accessibilityLabel="Coma"`, `accessibilityLabel="Borrar último dígito"` (⌫). The ⌫ has `accessibilityHint="Mantené presionado para limpiar todo"`.
- `<SelectableCard>` tiles: already come with `accessibilityRole="radio"` + `accessibilityState={selected}` from the Foundation primitive. The consumer adds `accessibilityLabel="Seleccionar ${categoryName}"`.
- Suggested amount chips: `accessibilityLabel="Usar monto ${formatted}"`.
- `<DescriptionRow>` collapsed: `accessibilityRole="button"`, `accessibilityLabel="Agregar descripción opcional"`.
- Submit button: `accessibilityLabel="Guardar gasto"`, `accessibilityState={{ disabled, busy: isBusy }}`.
- Sticky footer respects safe area via the Foundation primitive.
- Reduced motion: all springs respected via the hooks' built-in `useReducedMotion` short-circuits.

## 12. Testing

- **Unit — `in-app-numpad-model.test.ts`** (new): appendDigit respects maxIntegerDigits / maxDecimalDigits; appendComma idempotent; backspace with empty string is no-op; clearAll returns ''.
- **Unit — `add-expense-model.test.ts`** (new): rankCategoriesByUsage returns top-N sorted by count; stable order when tied (by name asc); includes unused categories after ranked ones; pickTopCategoryDescriptions ignores empty descriptions + returns unique values.
- **Unit — existing controller tests**: adapted to the added `rawPrice`/`isNumpadVisible` state fields.
- **TS + lint**: standard.
- **Manual device pass**: deferred to user. Full loop Add → Home must be verified on simulator or device.

## 13. Dependencies

None new. All primitives come from Foundation v2 + the new `<InAppNumpad>` (built here).

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `<InAppNumpad>` built on gorhom BottomSheet may over-animate or feel heavy compared to a custom slide-up | The wrapper already works for ConfirmSalarySheet and feels native. Using it here reuses the proven pattern. If performance lags on older devices, revisit with a custom Reanimated 4 sheet implementation. |
| Numpad auto-opening on mount annoys users who want to use a suggested chip immediately | Mitigation: the first action the user sees is the monto amount hero with $0 and the numpad just below. Tapping a quick chip outside the numpad dismisses it and applies — so they can bypass keying in digits. |
| Amount of "2,5" versus "2.5" — regional separator confusion | The numpad button is labeled "," (comma), matching `es-AR` locale. Internally the raw value uses comma; `parsePrice` handles both comma and period for safety. |
| Auto-open conflicts with the "tap on a category" gesture when the numpad is still showing | Numpad dismiss-on-outside-tap handled by gorhom's backdrop. If user taps through the backdrop onto a category tile, the `<BottomSheet>` onDismiss fires first; ensure the category tap handler is still registered by using `pressBehavior="close"` on the backdrop so the backdrop only consumes the first tap. |
| Home's `<AnimatedAmount>` won't fire haptic if user is deep in transition and Home hasn't mounted yet | Acceptable trade-off. React Query invalidation + refetch happens in the background; when Home's AnimatedAmount's useEffect fires with the new value, the haptic triggers then. If the user dwells on a transition screen briefly, the haptic is delayed but still fires. |

## 15. Execution phases

Single PR. Phases map to task groups.

1. **Phase 1 · Pure model** — write `in-app-numpad-model.ts` + `add-expense-model.ts` with TDD unit tests. No UI.
2. **Phase 2 · `<InAppNumpad>` primitive** — build the slide-up numpad using `<BottomSheet>` + the pure model. Export from `ui/index.ts`.
3. **Phase 3 · AmountCard + SuggestedAmountStrip** — simpler presentational components that consume the primitives.
4. **Phase 4 · CategoryPickerGrid + AllCategoriesSheet** — grid + sheet for categories. Adopts `<SelectableCard>` + `<BottomSheet>`.
5. **Phase 5 · DescriptionRow** — collapsible description with `<InputGroup>`.
6. **Phase 6 · AddExpenseDashboard orchestrator + controller adjustments** — wires everything together + updates `use-add-expense-controller.ts`.
7. **Phase 7 · Screen swap + delete legacy** — `add-expense-screen.tsx` rewrite, delete `add-expense-form.tsx`.
8. **Phase 8 · Final validate** — `./scripts/npmw run validate`, lint check, test suite.

## 16. Exit criteria

- New Add Expense screen renders with: AmountCard + AnimatedAmount hero + numpad auto-open + SuggestedAmountStrip + CategoryPickerGrid (2-col) + DescriptionRow collapsed + StickyFooter.
- Numpad slides up on amount tap + dismisses on "Listo" / outside tap.
- Submit success fires `haptics.success` + `router.back()` — user lands on Home and sees the hero animate.
- Submit error inline with localized message.
- `add-expense-screen.tsx` ≤ 120 lines; `add-expense-form.tsx` deleted.
- All new unit tests pass; `./scripts/npmw run validate` clean (modulo the pre-existing lint error that predates this sub-spec).
- `InAppNumpad` exported from `mobile/components/ui/index.ts` so it can be consumed by future flows (Add fixed expense).
