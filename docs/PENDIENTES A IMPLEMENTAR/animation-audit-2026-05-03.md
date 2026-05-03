# Animation Audit — 2026-05-03

**Goal:** every animated surface in the app should open, close, and re-open with continuous motion. No abrupt cuts, no instant unmounts that swallow exits, no inconsistent timing/easing across screens.

**Method:** inventoried 101 Reanimated files + 2 RN Animated files + every `<Modal>` and overlay. Cross-referenced against the centralized vocabulary in [tokens.ts](mobile/lib/motion/tokens.ts) and the `ui-ux-pro-max` Animation criteria (`interruptible`, `spring-physics`, `exit-faster-than-enter`, `motion-consistency`, `layout-shift-avoid`, `no-blocking-animation`).

**Verdict:** the codebase is in **good shape architecturally**. There's a real centralized motion vocabulary, universal `useReducedMotion` compliance, and the three highest-traffic dismissable surfaces (`ModalCard`, `StreakSheet`, `AddQuickActionsOverlay`) all gate unmount on the exit-animation completion. Findings below are mostly drift, not breakage.

---

## Canonical vocabulary

[mobile/lib/motion/tokens.ts](mobile/lib/motion/tokens.ts):
- **Durations**: `micro 120 / quick 180 / standard 240 / deliberate 320 / slow 480` + nav-specific (`enterStack 280`, `exitStack 200`, `enterModal 320`, `exitModal 220`, etc.)
- **Springs**: `press / enter / exit / value / celebrate / sheet / tabShift`
- **Easings**: `standard / accelerate / decelerate / enterSmooth / exitStandard / warm`
- **Stagger**: `listItem 40 / section 60`

Every new animation should consume from this file. Inline numeric configs are the smell to look for.

---

## Findings

### P1 — Inconsistency, will cause perceptible drift

#### 1. Quick-actions overlay bypasses canonical springs

[mobile/components/navigation/add-quick-actions-overlay.tsx:75-114](mobile/components/navigation/add-quick-actions-overlay.tsx#L75-L114)

The fan menu we just authored uses inline spring configs (`{damping: 14, stiffness: 160, mass: 0.9}` enter, `{damping: 24, stiffness: 180, mass: 0.8}` exit) instead of `motionSprings.enter` / `motionSprings.exit`. The motion *language* of the menu is good, but the *vocabulary* is its own — so when other surfaces tune their springs, this one will drift.

**Why:** I deliberately used a softer enter (more bounce) and critically-damped exit. That's a legitimate design choice for this overlay specifically — but it should be **expressed in the tokens file**, not inline.

**Fix:** add `fan: { ... }` and `fanExit: { ... }` to `motionSprings` (or extend `enter`/`exit` to feel right for both modals and this overlay), and reference from the component. Either path makes future tuning a one-file change.

#### 2. Stagger constants live in two places

The fan menu uses an inline `stagger = 0.08` (per-petal interpolation window offset). [tokens.ts:80-83](mobile/lib/motion/tokens.ts#L80-L83) defines `motionStagger.listItem 40` and `section 60` (in ms). These aren't directly comparable (the overlay's stagger is a fraction of progress, not a delay), but the *concept* should reuse the token vocabulary — express the per-petal delay as `40ms / springDurationApprox` or move to a worklet helper.

**Fix:** add `motionStagger.fan: 0.08` (unitless progress fraction) so future radial menus inherit, or convert the petal stagger to ms-based `withDelay`.

---

### P2 — Real risk, low frequency

#### 3. Notifications preferences picker uses OS-level fade Modal

[mobile/screens/settings/notifications-preferences-screen.tsx:258-263](mobile/screens/settings/notifications-preferences-screen.tsx#L258-L263)

Uses `<Modal animationType="fade" visible={...}>`. The OS handles the fade, so the dismiss isn't truncated — but the duration/easing is **not** from the token vocabulary, and there's no `useReducedMotion` gate. On a screen full of `RiseView`-driven content this fade-in feels like a different app for ~250ms.

**Fix:** replace with the same pattern used in [modal-card.tsx](mobile/components/ui/modal-card.tsx) (mount-gated, `motionDurations.enterModal` + `motionSprings.sheet`). Low effort, big consistency win.

#### 4. `auth-input.tsx` uses legacy RN Animated API

[mobile/components/auth/auth-input.tsx](mobile/components/auth/auth-input.tsx)

Only file that imports from `react-native`'s `Animated` namespace instead of Reanimated. RN's `Animated` runs on the JS thread (when not using `useNativeDriver: true`) which can cause jank when Reanimated worklets are saturating the UI thread. Even with `useNativeDriver: true`, the runtime is split — interrupting a focus animation with another worklet animation isn't transferable.

**Fix:** port the focus/blur color/scale transitions to Reanimated. Single-runtime motion across the app means animations remain interruptible by other Reanimated animations elsewhere on screen.

---

### P3 — Hardening / future-proofing

#### 5. No regression test for the "Modal-unmount-before-exit" bug

The bug fixed in [add-quick-actions-overlay.tsx](mobile/components/navigation/add-quick-actions-overlay.tsx) (commit `ca971a0`) is a structural footgun: anyone wiring a new RN `<Modal>` directly to a parent prop will reintroduce it. There's no test gate today.

**Fix options:**
- **Lint rule (cheap):** ESLint rule that flags `<Modal visible={prop}>` where `prop` is a direct prop pass-through and the file imports `withSpring`/`withTiming`. Suggest the `mounted` state pattern.
- **Snapshot of pattern (cheaper):** add a [docs/patterns/dismissable-modal.md](docs/patterns/dismissable-modal.md) with the canonical `mounted + completion-callback` recipe and link to it in the offending files when adding new ones.
- **CI grep (cheapest):** a `bun scripts/check-motion-tokens.ts` that fails if any file other than `tokens.ts` contains `withSpring(\d` or `withTiming(\d` with literal numeric configs.

I'd recommend the CI grep — it catches both this bug and finding #1/#3 above.

#### 6. Decorative loops not centrally inventoried

3 surfaces use `useLoopAnimation` ([breathe-dot](mobile/components/ui/breathe-dot.tsx), [float-view](mobile/components/ui/float-view.tsx), [ambient-blobs](mobile/components/home/ambient-blobs.tsx)) reading from `decorativeDurations`. Good. But there's no audit of *cumulative* loops on a single screen — Home renders all three plus `breath` on the FAB plus shimmer on summary cards.

**Fix:** add an `__DEV__`-only `<MotionDebugger />` overlay that lists active worklets per frame. Not a bug, but useful tooling for keeping the "ambient layer" within budget on lower-end Android.

---

## What's already correct (and worth defending)

- ✅ **Mount-gated dismiss** in [modal-card.tsx:66-127](mobile/components/ui/modal-card.tsx#L66-L127), [streak-sheet.tsx:81-108](mobile/components/gastos/streak-sheet.tsx#L81-L108), [add-quick-actions-overlay.tsx:62-113](mobile/components/navigation/add-quick-actions-overlay.tsx#L62-L113). Every dismissable surface keeps the Modal alive until the spring lands at 0.
- ✅ **`useReducedMotion` hits 98 files** — both choreography (springs collapse to instant snaps) and decorative loops (cancel cleanly).
- ✅ **`useLoopAnimation` cancels on blur and unmount** — no orphaned worklets when navigating away.
- ✅ **Tab transitions** ([use-tab-focus-fade.ts](mobile/components/ui/use-tab-focus-fade.ts)) directionally aware (incoming slides from the side of the previous tab).
- ✅ **Stack architecture decision documented** ([app-stack-shell.tsx:30-54](mobile/components/root/app-stack-shell.tsx#L30-L54)) — explicit reasoning for staying on native-stack vs JS-stack, so future contributors don't re-litigate.
- ✅ **Press scale via `usePressScale`** consistent across every Pressable that opts in. Same spring (`motionSprings.press`).

---

## Recommended next steps (ordered)

1. **Promote the fan-menu spring to tokens** (P1 #1). 5min change, prevents drift.
2. **Replace the notifications hour picker Modal** with `ModalCard` (P2 #3). 30min change, instant consistency win.
3. **Port `auth-input.tsx` to Reanimated** (P2 #4). 1-2h change, eliminates the only dual-runtime surface.
4. **Add the `check-motion-tokens.ts` CI grep** (P3 #5). 30min, prevents both the unmount-before-exit bug and inline-config drift from recurring.
5. **Add `<MotionDebugger />` dev overlay** (P3 #6). 1-2h, useful for ambient-layer budget audits going forward.

Items 1–2 are the highest leverage for "se sienta natural y fluido". Items 4–5 are about keeping it that way.
