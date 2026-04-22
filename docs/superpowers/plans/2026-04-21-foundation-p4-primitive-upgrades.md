# Foundation Design v2 — Phase 4: Primitive Upgrades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Ship PR #4 — upgrade 8 existing primitives to consume motion tokens, add new variants, and polish interactions per spec §7.

**Architecture:** Surgical edits on existing files in `mobile/components/ui/` + three motion hooks (`mobile/hooks/use-press-scale.ts`, `mobile/components/ui/use-screen-entrance.ts`, `mobile/components/ui/use-modal-card-motion.ts`). The existing hooks keep their **legacy `Animated` runtime** and **public API shape** — only their internal spring/duration magic numbers get replaced with imports from `@/lib/motion`. Full migration to Reanimated 4 worklets is out of scope here (orthogonal; a future optimization phase).

**Reference spec:** [docs/superpowers/specs/2026-04-21-foundation-design.md](../specs/2026-04-21-foundation-design.md) section 7 + section 11 Phase 4.

**Test commands:** `./scripts/npmw run test | typecheck | lint | validate`.

---

## Task 1: Motion hooks consume token presets

**Files:**
- Modify: `mobile/hooks/use-press-scale.ts`
- Modify: `mobile/components/ui/use-screen-entrance.ts`
- Modify: `mobile/components/ui/use-modal-card-motion.ts`

Replace magic damping/stiffness/mass/duration numbers with named imports. Do NOT change the public signature or runtime behavior shape of any hook.

- [ ] **Step 1: Edit `use-press-scale.ts`** — replace `Animated.spring` config `{ damping: 18, stiffness: 240, mass: 0.8 }` with values from `motionSprings.press`:

```ts
import { motionSprings } from '@/lib/motion'
// ... inside animateTo:
Animated.spring(scale, {
  toValue: nextValue,
  useNativeDriver: true,
  damping: motionSprings.press.damping,
  stiffness: motionSprings.press.stiffness,
  mass: motionSprings.press.mass,
}).start()
```

- [ ] **Step 2: Edit `use-screen-entrance.ts`** — replace the 2 hardcoded spring configs (header + content) with `motionSprings.enter`. Replace hardcoded `220` / `260` durations with `motionDurations.standard` / `motionDurations.deliberate`. Replace `45` stagger with `motionStagger.listItem + 5` — or just keep `45` as a literal, it matches `motionStagger.listItem` close enough; prefer the token.

```ts
import { motionDurations, motionSprings, motionStagger } from '@/lib/motion'
// ... spring configs use motionSprings.enter
// ... timing durations use motionDurations
// ... stagger uses motionStagger.listItem
```

- [ ] **Step 3: Edit `use-modal-card-motion.ts`** — same pattern for the 4 spring configs (entry `sheetTranslateY`, entry `sheetScale`, exit `sheetScale`, restore `dragTranslateY`, restore `sheetScale`): wire to `motionSprings.sheet` for open/close, `motionSprings.enter` for restore. Use `motionDurations.standard` for the 220ms timing.

- [ ] **Step 4: Typecheck + test**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

Expected: clean + 68/68.

- [ ] **Step 5: Commit**

```bash
git add mobile/hooks/use-press-scale.ts mobile/components/ui/use-screen-entrance.ts mobile/components/ui/use-modal-card-motion.ts
git commit -m "refactor(motion): wire existing hooks to motion token presets"
```

---

## Task 2: `<AppButton>` `accent` variant

**File:** `mobile/components/ui/button.tsx`

- [ ] **Step 1:** Add `'accent'` to the `ButtonVariant` union. In `colorsByVariant`, add:

```ts
accent: {
  backgroundColor: theme.brand.bright,
  borderColor: theme.brand.bright,
  textColor: theme.brand.deep,
},
```

- [ ] **Step 2:** Extend `resolvedHaptic` default to include `accent`:

```ts
const resolvedHaptic =
  haptic ??
  (variant === 'primary' || variant === 'accent' ? 'light'
   : variant === 'secondary' ? 'selection'
   : variant === 'danger' ? 'warning'
   : 'none')
```

- [ ] **Step 3:** Extend `android_ripple` color branch to include `accent`:

```ts
color:
  variant === 'primary' || variant === 'danger' || variant === 'accent'
    ? withAlpha('#FFFFFF', 0.18)
    : /* ... existing ... */
```

Actually `accent` sits on a bright-green bg with deep-green text — the ripple should use `brand.deep` alpha instead of white. Use:

```ts
color:
  variant === 'accent'
    ? withAlpha(theme.brand.deep, 0.18)
    : variant === 'primary' || variant === 'danger'
      ? withAlpha('#FFFFFF', 0.18)
      : variant === 'secondary'
        ? withAlpha(theme.colors.primaryStrong, 0.12)
        : withAlpha(theme.colors.text, 0.08)
```

- [ ] **Step 4:** Typecheck + test + commit:

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
git add mobile/components/ui/button.tsx
git commit -m "feat(ui): add AppButton accent variant (bright green on dark hero)"
```

---

## Task 3: `<IconButton>` haptic prop + hit slop default

**File:** `mobile/components/ui/icon-button.tsx`

- [ ] **Step 1:** Read the existing component to understand its props and defaults.

- [ ] **Step 2:** Add an optional `haptic?: AppHapticTone` prop. If provided, invoke `triggerHaptic(haptic)` inside the `onPress` handler before calling the user's `onPress`.

- [ ] **Step 3:** Default `hitSlop` to `12` (was 8 per audit). Only change the default — allow consumer-provided values to override.

- [ ] **Step 4:** Typecheck + test + commit:

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
git add mobile/components/ui/icon-button.tsx
git commit -m "feat(ui): add IconButton haptic prop + default hit slop to 12"
```

---

## Task 4: `<ModalCard>` thicker drag handle

**File:** `mobile/components/ui/modal-card.tsx` (or wherever the handle indicator lives — check modal-card-header.tsx first).

- [ ] **Step 1:** Find the drag-handle element (a small View at the top of the sheet rendering as a pill). Current dimensions likely `width: 36, height: 4` or similar.

- [ ] **Step 2:** Update the handle size to a more visible **40×5** (or `8 tall × 40 wide` per spec). Keep `borderRadius: radii.pill`.

- [ ] **Step 3:** Typecheck + test + commit:

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
git add mobile/components/ui/modal-card.tsx mobile/components/ui/modal-card-header.tsx
git commit -m "feat(ui): thicken ModalCard drag handle for visibility"
```

---

## Task 5: `<SegmentedControl>` pill slider animation

**File:** `mobile/components/ui/segmented-control.tsx`

Goal: when the selected index changes, an underlaying pill slides to the new segment instead of cross-fading the backgrounds.

- [ ] **Step 1:** Read the existing component to understand its rendering model (typically: a row of segment `<Pressable>` items, each with its own selected styling).

- [ ] **Step 2:** Implement the pill slider:
  - Track the segment widths with `onLayout` per segment, stored in a ref array.
  - A shared value `translateX` (Reanimated 4) animates to the x-offset of the selected segment when it changes. A shared value `pillWidth` animates to the selected segment's width.
  - Spring animation using `motionSprings.press`.
  - The pill is an absolutely-positioned `Animated.View` beneath the segment labels, sized by `pillWidth` and offset by `translateX`.
  - Keep the previous selection-style for segments (just remove its background — the pill handles the visual now).
  - Add `triggerHaptic('selection')` on change.

- [ ] **Step 3:** Ensure reduced-motion path: set translateX/pillWidth instantly without spring.

- [ ] **Step 4:** Typecheck + test + commit:

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
git add mobile/components/ui/segmented-control.tsx
git commit -m "feat(ui): animate SegmentedControl selection with pill slider"
```

---

## Task 6: `<Chip>` hue variant + compact density

**File:** `mobile/components/ui/chip.tsx`

- [ ] **Step 1:** Read the existing component.

- [ ] **Step 2:** Add:
  - New variant: `categoryHue` — takes a `categoryId?: string` prop. When set, resolves via `useCategoryHue(categoryId)` and uses `hue.surface` as bg, `hue.ink` as text.
  - New density prop: `density?: 'default' | 'compact'` — default height 40, compact height 32.
  - Press scale changed from existing value to 0.97 (if it currently uses `usePressScale`, pass `pressedScale: 0.97`).

- [ ] **Step 3:** Do NOT remove existing variants. Add-only.

- [ ] **Step 4:** Typecheck + test + commit:

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
git add mobile/components/ui/chip.tsx
git commit -m "feat(ui): add Chip categoryHue variant + compact density"
```

---

## Task 7: `<EmptyState>` entry animation

**File:** `mobile/components/ui/empty-state.tsx`

- [ ] **Step 1:** Read the existing component.

- [ ] **Step 2:** Wrap the icon (or icon container) in `Animated.View` (Reanimated 4) with:
  - Initial: `scale: 0.85, opacity: 0`
  - On mount: animate to `scale: 1, opacity: 1` with `motionSprings.celebrate`
  - Respect reduced motion: set final values instantly.

Wrap the text block (title + description) with a stagger — same transform but delayed by `motionStagger.section`.

- [ ] **Step 3:** Typecheck + test + commit:

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
git add mobile/components/ui/empty-state.tsx
git commit -m "feat(ui): animate EmptyState icon + text entry"
```

---

## Task 8: `<ErrorState>` icon micro-pulse

**File:** `mobile/components/ui/error-state.tsx`

- [ ] **Step 1:** Read the existing component.

- [ ] **Step 2:** Wrap the icon in `Animated.View` (Reanimated 4):
  - Use `useSharedValue(1)` + `withRepeat(withSequence(withTiming(1.02, 600), withTiming(1, 600)), -1, false)` for a subtle breathing effect.
  - Respect reduced motion: no pulse, scale stays at 1.

- [ ] **Step 3:** Typecheck + test + commit:

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
git add mobile/components/ui/error-state.tsx
git commit -m "feat(ui): add ErrorState icon micro-pulse"
```

---

## Task 9: Final validate

- [ ] Run `./scripts/npmw run validate`
- [ ] Expected: typecheck green, 68/68 tests, guard green, lint state unchanged (1 pre-existing error + 4 warnings).
- [ ] If any new lint errors from Phase 4 edits, fix inline.

---

## Out of scope (deferred)

- `<Screen>` scroll-linked large title collapse — complex animation requiring per-screen visual validation. Belongs to per-screen sub-specs (Home, Control, etc.) where scroll behavior can be tuned in context.
- Full migration of `use-press-scale`, `use-screen-entrance`, `use-modal-card-motion` to Reanimated 4 worklets — orthogonal optimization, no user-visible improvement beyond current behavior.

## Exit criteria

- All 9 tasks complete.
- 8 primitives consume motion tokens through their hooks.
- `<AppButton>` gains `accent` variant.
- `<IconButton>` has optional `haptic` prop + default hit slop 12.
- `<ModalCard>` drag handle is visibly thicker.
- `<SegmentedControl>` animates selection via pill slider.
- `<Chip>` has `categoryHue` variant + compact density.
- `<EmptyState>` entrance animated, respects reduced motion.
- `<ErrorState>` icon pulses subtly.
