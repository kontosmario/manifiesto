# Manifiesto — Foundation Design System (v2)

**Date:** 2026-04-21
**Status:** Design approved, pending implementation plan
**Scope:** Cross-cutting Foundation. Per-screen redesigns are separate sub-specs.

---

## 1. Context

An audit of the Manifiesto mobile app ([CODE_RULES.md](../../../CODE_RULES.md), [BRIEF_UI_UX_MANIFIESTO.md](../../../BRIEF_UI_UX_MANIFIESTO.md), [DOCUMENTO_INSTITUCIONAL_TECNICO.md](../../../DOCUMENTO_INSTITUCIONAL_TECNICO.md)) surfaced the following:

- Primitives exist but typography/spacing tokens are underutilized (100+ inline declarations).
- Motion uses the legacy `Animated` API despite `react-native-reanimated@4.1.1` being installed. Zero Reanimated hooks in code.
- No `motion-tokens.ts`. Spring configs and durations are magic numbers across ~12 files.
- Financial values don't animate on change — the most visible UX gap (CODE_RULES §20.3).
- No `AnimatedAmount`, `BottomSheet`, `StickyFooter`, `SelectableRow`, `SwipeableRow`, `CategoryBadge`, or layout-matching skeletons.
- Tab bar does not fire haptics on selection (CODE_RULES §9.6 violation).
- Copy is inconsistent ("Gasto" vs "Movimiento", "Ciclo" vs "Período", passive empty states).
- Three files over 400 lines, five over 300 — out of scope here, belong to per-screen sub-specs.

Primitives (`AppButton`, `AppCard`, `BrandedPanel`, `ModalCard`, `Screen`, `EmptyState`, `ErrorState`, `SegmentedControl`, `Chip`, `IconButton`) and the haptics wrapper are solid — the work is **systematization + extension**, not rewrite.

## 2. Goals

1. Establish a **token-first** system that refreshes the app visually from a single source of truth.
2. Build the **missing primitives** required by every future screen sub-spec, so they don't get reinvented.
3. Adopt **Reanimated 4** (already installed, unused) for motion primitives, with iOS-native spring feel and celebration pops on success states.
4. **Unify copy** via a glossary + state templates + CI gate against forbidden strings.
5. Target the **iOS ecosystem** aesthetic: SF Pro Rounded, SF Symbols, native sheet detents, scroll-linked large titles, system-feel spring physics.

## 3. Non-goals

- Per-screen redesigns (Home, Add-expense, Control, Gastos, Gastos Fijos, Auth, Settings, Notifications, Join). Each becomes its own sub-spec after Foundation ships.
- Splitting oversized files (`household-setup-screen.tsx` 541 lines, `expense-categories-screen.tsx` 421 lines, etc.). Per-screen sub-specs.
- Navigation structure changes.
- Backend / SQL / Supabase changes.
- Replacing all legacy `Animated` usage. Migration is opportunistic during per-screen sub-specs.

## 4. Design DNA

Result of the visual brainstorming session:

| Axis | Decision |
|---|---|
| Direction | **Bold friendly** (Cash App / Revolut / Up Bank family — not minimal editorial, not premium dark) |
| Canvas policy | **Dual identity per mode.** Light = warm off-white canvas with dark hero moments. Dark = deep dark canvas throughout. |
| Typography | **SF Pro Rounded** native (`-apple-system`, `'SF Pro Rounded'`). Zero custom fonts. Dynamic Type respected. |
| Category colors | **Muted hues.** 8 curated pastels, saturation-matched, subordinate to the green primary. |
| Motion signature | **iOS native springs by default; celebration pops with overshoot for success states** (confirm gasto, pay fixed expense, salary confirmation). |

Light mode canvas: `#F4F2ED` (off-white warm).
Dark mode canvas: `#0A1A12` (deep green-tinted dark).
Brand constants across both modes: `brand.deep = #0F2E1F`, `brand.bright = #7AD8A3`.

## 5. Token evolution

### 5.1 Palette (`mobile/theme/palette.ts`)

Cross-mode brand constants:

```ts
brand.deep         = '#0F2E1F'   // hero bg, CTAs in light, FAB light
brand.bright       = '#7AD8A3'   // CTA on dark, accent, success flash, FAB dark
brand.surfaceSoft  = 'rgba(122,216,163, 0.12)'   // soft success pill
```

Light mode:

```ts
canvas       = '#F4F2ED'
surface      = '#FFFFFF'
surfaceMuted = '#EEE9DF'
surfaceStrong= '#E4DFD3'
border       = 'rgba(15,46,31,0.08)'
borderStrong = 'rgba(15,46,31,0.15)'
text         = '#0F2E1F'
textMuted    = '#6B7566'
textSoft     = '#7A8A7D'
overlay      = 'rgba(15,46,31,0.32)'
success      = '#1C7E3A'
warning      = '#C27A0A'
danger       = '#C23A2F'
```

Dark mode:

```ts
canvas       = '#0A1A12'
surface      = '#102018'
surfaceMuted = '#0F2E1F'
surfaceStrong= '#17301F'
border       = 'rgba(255,255,255,0.06)'
borderStrong = 'rgba(255,255,255,0.12)'
text         = '#F8FBF8'
textMuted    = '#B8C9BE'
textSoft     = '#6B8F78'
overlay      = 'rgba(0,0,0,0.52)'
success      = '#7AD8A3'
warning      = '#F3BA57'
danger       = '#F06A6A'
```

### 5.2 Category hues (`mobile/theme/category-hues.ts`)

Map indexed by category slug with light + dark variants. Each variant exposes `surface` (badge background) and `ink` (icon + accent color).

```ts
export const categoryHues = {
  comida:    { light: { surface: '#FCE8D7', ink: '#8A4A1A' }, dark: { surface: '#3A2C20', ink: '#E8B892' } },
  transporte:{ light: { surface: '#DDE8F5', ink: '#2A4E7A' }, dark: { surface: '#1C2938', ink: '#A8C4E8' } },
  casa:      { light: { surface: '#E2EDDF', ink: '#2A5030' }, dark: { surface: '#1E2A1E', ink: '#A8C8AC' } },
  salud:     { light: { surface: '#F4DDDC', ink: '#8A3530' }, dark: { surface: '#3A2626', ink: '#E8A8A4' } },
  ocio:      { light: { surface: '#E7DDF2', ink: '#5A3E8A' }, dark: { surface: '#2D2538', ink: '#C4A8E0' } },
  servicios: { light: { surface: '#F5EDD6', ink: '#7A5A1C' }, dark: { surface: '#342D1C', ink: '#E8CE8A' } },
  ropa:      { light: { surface: '#E4DFD3', ink: '#5A4A30' }, dark: { surface: '#2D2A22', ink: '#C8B89A' } },
  otros:     { light: { surface: '#DCE5E5', ink: '#425252' }, dark: { surface: '#1E2626', ink: '#A8B8B8' } },
} as const
```

Fallback for custom user categories: deterministic hash `(categoryId) → hueKey`. Hue key selection is stable across app reloads for the same id.

### 5.3 Typography (`mobile/theme/typography.ts`)

Extracted from `palette.ts` into its own file. Expanded preset set:

| Preset | Size | Weight | Letter-spacing | Use |
|---|---|---|---|---|
| `hero` | 54 | 900 | -2.0 | Protagonist value (Home, Control hoy) |
| `displayLarge` | 40 | 900 | -1.5 | Secondary hero (metrics promoted) |
| `screenTitle` | 32 | 900 | -0.8 | Screen titles |
| `sectionTitle` | 22 | 800 | -0.3 | Section dividers |
| `titleMedium` | 18 | 800 | -0.2 | Card titles, row emphasis |
| `metricLarge` | 28 | 900 | -0.5 | Prominent metrics |
| `metricValue` | 22 | 800 | 0 | Metric strip values |
| `buttonDefault` | 15 | 700 | 0 | Button default |
| `buttonCompact` | 13 | 700 | 0 | Button compact |
| `bodyLarge` | 15 | 400 | 0 | Body (bumped from 14 for legibility) |
| `body` | 14 | 400 | 0 | Dense body |
| `bodyEmphasis` | 15 | 600 | 0 | Emphasized inline text |
| `bodySmall` | 13 | 400 | 0 | Sub-rows, meta |
| `eyebrow` | 11 | 800 | +1.2 uppercase | Protagonist label above hero |
| `fieldLabel` | 11 | 700 | +0.8 uppercase | Form labels, section eyebrows |
| `caption` | 11 | 500 | 0 | Helper text, timestamps |

All presets use SF Pro Rounded via `fontFamily: undefined` (iOS system default) + explicit weights. Dynamic Type is respected via `allowFontScaling={true}` everywhere except the hero value (which uses `maxFontSizeMultiplier={1.2}` to preserve layout).

### 5.4 Spacing (4-base scale)

Replaces current (6, 10, 14, 18, 24, 32) with:

```ts
xxs: 4
xs:  8
sm:  12
md:  16
lg:  24
xl:  32
xxl: 48
```

**Migration:** old tokens are renamed to `legacySpacing` in-place at PR start. New `spacing` object with 4-base values ships alongside. Consumers migrate `legacySpacing.xs` → `spacing.{xxs|xs|sm}` based on visual judgment per case, one commit per domain (home, fixed-expenses, settings, etc.). `legacySpacing` deleted before PR merge, enforced by a grep check in CI.

### 5.5 Radii

```ts
xs:   8
sm:   10
md:   14
lg:   18
xl:   22
'2xl':28
pill: 999
```

### 5.6 Motion tokens (`mobile/lib/motion/tokens.ts`)

New file. Centralizes all motion configuration.

```ts
export const motionDurations = {
  micro: 120,
  quick: 180,
  standard: 240,
  deliberate: 320,
  slow: 480,
} as const

export const motionSprings = {
  press:     { damping: 18, stiffness: 380, mass: 0.9 },  // button press-scale
  enter:     { damping: 22, stiffness: 210, mass: 1.0 },  // screen/modal entry
  exit:      { damping: 24, stiffness: 260, mass: 1.0 },  // dismiss
  value:     { damping: 24, stiffness: 180, mass: 1.0 },  // number tickers
  celebrate: { damping: 14, stiffness: 260, mass: 0.8 },  // overshoot pops
  sheet:     { damping: 22, stiffness: 200, mass: 1.0 },  // bottom sheets
} as const

export const motionEasings = {
  standard:   Easing.bezier(0.22, 0.9, 0.3, 1),
  accelerate: Easing.bezier(0.4, 0.0, 1.0, 1.0),
  decelerate: Easing.bezier(0.0, 0.0, 0.2, 1.0),
} as const

export const motionStagger = {
  listItem: 40, // ms between each item entry
  section:  60,
} as const
```

Consumption pattern: `withSpring(value, motionSprings.press)`, `withTiming(value, { duration: motionDurations.standard, easing: motionEasings.standard })`.

## 6. New primitives

All in `mobile/components/ui/`. Each exports from `mobile/components/ui/index.ts`.

### 6.1 `<AnimatedAmount>` ⭐

```tsx
<AnimatedAmount
  value={available}
  variant="hero" | "displayLarge" | "metricLarge" | "metricValue" | "bodyEmphasis"
  hapticOnChange={false}
  prefix?: "+" | "-" | null
  maxFontSizeMultiplier?: number
  locale?: string  // default 'es-AR'
/>
```

- Reanimated 4 worklet. `useDerivedValue` holds the numeric target.
- On value change: `withSpring(target, motionSprings.value)`.
- On *favorable* change (value increases for balance, decreases for debt) with `hapticOnChange`: fires `motionSprings.celebrate` on the container scale (subtle 1→1.03→1) + `haptics.success()`.
- Format: `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })` via `react-native-reanimated` compatible text (uses animated props on a custom `<AnimatedText>` node).
- Respects reduced motion: instant value update, no spring, no celebrate.

### 6.2 `<BottomSheet>`

Wrapper around `@gorhom/bottom-sheet` (new dep, new-architecture compatible).

```tsx
<BottomSheet
  snapPoints={['50%', '90%']}
  enableDynamicSizing?: boolean
  onDismiss?: () => void
  hapticOnDismiss?: boolean  // default true, fires 'selection'
>
  {content}
</BottomSheet>
```

- Uses native iOS sheet behavior (resistance, velocity, detents).
- Backdrop tap dismisses, respects overlay token.
- Drag handle matches `<ModalCard>` styling for consistency.
- Safe area + keyboard avoidance included.
- `<ModalCard>` stays for full-modal flows; `<BottomSheet>` is for quick actions (filters, category pick, amount pick).

### 6.3 `<StickyFooter>`

```tsx
<StickyFooter>
  <AppButton variant="primary" onPress={handleSave}>Guardar gasto</AppButton>
</StickyFooter>
```

- Sticks to bottom of screen, respects bottom safe area + tab bar height.
- Animates up with keyboard (`KeyboardAvoidingView` internal, `behavior="padding"` iOS, `"height"` Android).
- Scroll shadow above it (subtle top border or blur) to separate from scrolled content.
- Max 2 buttons horizontally, primary takes 2/3 width when paired with secondary.

### 6.4 `<SelectableRow>` / `<SelectableCard>`

Unified selection pattern.

```tsx
<SelectableRow
  selected={isSelected}
  onPress={handlePress}
  title="Supermercado"
  meta?: string
  leading?: ReactNode  // CategoryBadge typically
  hapticTone="selection"
/>

<SelectableCard
  selected={isSelected}
  onPress={handlePress}
  size="sm" | "md" | "lg"
>
  {children}
</SelectableCard>
```

- Press-scale via `motion.springs.press` worklet.
- Check affordance animates in on select (scale 0 → 1 + opacity + `motion.springs.celebrate`).
- Border/background change respects reduced motion (instant if enabled).

### 6.5 `<SwipeableRow>`

```tsx
<SwipeableRow
  leftActions?: SwipeAction[]
  rightActions?: SwipeAction[]
  accessibilityHint="Desliza hacia la izquierda para opciones"  // required
  undoLabel?: string
>
  {rowContent}
</SwipeableRow>
```

- Built on `react-native-gesture-handler` + Reanimated 4 worklet.
- **Visible affordance:** 4pt colored edge on the leading side that persists at rest (chevron peek).
- Haptic on crossing threshold (50% of row width): `haptics.warning()` for destructive, `haptics.selection()` for others.
- Destructive action confirmation: action triggers but a top toast appears with undo for 4s before hard commit.

### 6.6 `<CategoryBadge>`

```tsx
<CategoryBadge
  categoryId={id}
  size="sm" | "md" | "lg"  // 28 | 36 | 48
  tone?: "filled" | "soft"  // default soft
/>
```

- Resolves hue via `categoryHues` map or fallback hash.
- Renders SF Symbol via `expo-symbols` with Material Icons fallback on Android.
- Icon color = hue.ink, background = hue.surface.
- In `filled` variant: background = hue.ink, icon = canvas color (for high-contrast moments like a selected row).

### 6.7 Skeleton suite

```tsx
<SkeletonBox width height radius>

<HeroSkeleton />            // replicates Home hero card layout
<MetricStripSkeleton count={2} />
<ListRowSkeleton rows={5} hasLeading hasTrailing />
<CardSkeleton variant="metric" | "summary" | "hero" />
```

- Shimmer animation via Reanimated 4 worklet (translateX gradient overlay).
- Respects reduced motion: static pulse (opacity 0.6 → 1 → 0.6) instead of shimmer.
- Each screen composes its own skeleton using these pieces.

### 6.8 `<InputGroup>`

```tsx
<InputGroup
  label="Monto"
  helper?: string
  error?: string
  required?: boolean
>
  <TextField ... />
</InputGroup>
```

- Vertical stack: Label (fieldLabel token) + children + Helper/Error.
- Error state: subtle horizontal shake via Reanimated (+/- 4px, 3 cycles, 300ms) + haptics.error().
- Respects reduced motion (no shake).

### 6.9 `useTabHaptics()` + `useKeyboardChain()`

```ts
// In tab bar layout
useTabHaptics()  // fires haptics.selection() on tab change

// In form screens
const refs = useKeyboardChain([amountRef, descRef, notesRef])
// refs auto-wire returnKeyType + onSubmitEditing chain
```

## 7. Existing primitive upgrades

| Primitive | Change |
|---|---|
| `<AppButton>` | Migrate `usePressScale` to Reanimated 4 worklet. Uses `motion.springs.press`. Add `accent` variant (brand.bright on dark hero). Loading spinner cross-fades with label. |
| `<Screen>` | Scroll-linked large title collapse (32/900 → 17/700 centered header). `useScreenEntrance` → `motion.springs.enter`. Canvas background via token. |
| `<ModalCard>` | `useModalCardMotion` → `motion.springs.sheet`. Thicker drag handle (8×4). Kept for full-modal flows only. |
| `<SegmentedControl>` | Pill slider animation between segments (not cross-fade). Width interpolates to target segment. Haptic `selection` on change. |
| `<Chip>` | New variant: `categoryHue` (takes `categoryId`). Two densities: `compact` (32pt) / `default` (40pt). Press scale 0.97 (was 0.95). |
| `<EmptyState>` | Entry animation: icon scale 0.8→1 with `motion.springs.celebrate`, text staggered 60ms. Reduced motion aware. |
| `<ErrorState>` | Icon micro-pulse (1→1.02→1 infinite, 1200ms) when reduced motion OFF. |
| `<IconButton>` | Press scale via Reanimated worklet. New `haptic` prop. Hit slop default 12pt (was 8). |
| `usePressScale` | Internal: Reanimated 4 worklet. Public API unchanged (backward compat). |
| `useScreenEntrance` | Wired to `motion.springs.enter`. Public API unchanged. |
| `useModalCardMotion` | Wired to `motion.springs.sheet`. Public API unchanged. |

## 8. Copy system

### 8.1 Glossary (`mobile/lib/copy/glossary.ts`)

```ts
export const terms = {
  expense:    'Gasto',        // not 'Movimiento' / 'Transacción'
  currentCycle: 'Este ciclo', // not 'Período vigente' / 'Mes actual'
  available:  'Disponible',   // not 'Saldo' / 'Te queda'
  margin:     'Margen',       // not 'Excedente' / 'Sobrante'
  payday:     'Día de cobro', // not 'Fecha salarial' / 'Payday'
  fixedExpense:'Gasto fijo',
  history:    'Historial',
} as const
```

### 8.2 State templates (`mobile/lib/copy/states.ts`)

```ts
export const emptyStates = {
  expensesThisCycle: { title, description, action },
  debt: { title: 'Registrá deudas', ... },   // active, not passive
  fixedRecurring: { ... },
  fixedInstallments: { ... },
  // one per screen
} as const

export const loadingLabels = {
  expenses: 'Cargando tus gastos',
  fixedExpenses: 'Cargando gastos fijos',
  control: 'Leyendo tu ciclo',
  // ... never "Cargando..." bare
} as const

export const errorMessages = {
  network: 'No pudimos conectarnos. Revisá tu conexión.',
  server:  'Algo falló del lado del servidor. Probá de nuevo.',
  // distinct network vs data errors
} as const
```

### 8.3 CI gate

Lint/grep step in `./scripts/npmw run validate` that fails on forbidden string literals in `mobile/` — specifically `"Cargando..."`, `"Sin datos"`, `"No hay registros"`, `"Error"`, raw `error.message` in visible Text. Allowlist via inline comment (`// @copy-allow`) for edge cases.

## 9. Audit cleanup (part of Foundation)

- Move `mobile/components/shared/blocking-screen-view.tsx` → `mobile/components/ui/`, delete `shared/` folder.
- `useTabHaptics()` wired in tab bar layout (`app/(app)/_layout.tsx` or equivalent).
- `accessibilityHint` on all `<SwipeableRow>` consumers (in this Foundation, enforced via component prop — `required` in TS).
- `useKeyboardChain` utility available for form screens (adoption in per-screen sub-specs).

## 10. Dependencies

New:
- **`@gorhom/bottom-sheet`** — new-arch compatible, iOS native detent physics. For `<BottomSheet>` primitive.

Existing leveraged (no new install):
- `react-native-reanimated@4.1.1` — adopted for all new worklets.
- `expo-symbols@^1.0.8` — SF Symbols in `<CategoryBadge>`.
- `expo-blur@^15.0.8` — available for sheet backdrops if needed.
- `react-native-gesture-handler` — for `<SwipeableRow>`.

## 11. Execution phases

Five independent PRs. Each deployable on its own. Order matters only in that downstream phases depend on upstream primitives existing, but all phases can be parallel-developed on branches once Phase 1 is merged.

### Phase 1 · Token foundation (PR #1)

- Rewrite `palette.ts` with canvas / brand / surfaces / text for both modes.
- Extract `typography.ts` from palette, expanded presets.
- New `category-hues.ts` map.
- New `motion/tokens.ts`.
- Migrate spacing to 4-base + radii expanded.
- **Deprecation proxy:** old token names route to nearest new values for the duration of the PR. Proxy deleted before merge.
- ThemeProvider updated to expose new structure.

**Visible outcome:** app refreshed from tokens alone. Hero dark green, canvas cálido, typography bumps. Motion remains legacy.

**Acceptance:** no visual regression on existing screens (manual pass on simulator), `validate | typecheck | lint | test` green.

### Phase 2 · Core new primitives (PR #2)

- `<AnimatedAmount>`, `<CategoryBadge>`
- `<BottomSheet>` (`+ @gorhom/bottom-sheet` dep)
- `<StickyFooter>`, `<InputGroup>`
- Skeleton suite

**Acceptance:** primitives exported. Unit tests green. Storybook-style preview screen at `mobile/screens/_dev/primitives-preview.tsx` (dev-only, unlisted route) demonstrates each primitive in light + dark.

### Phase 3 · Selection, swipe, utility hooks (PR #3)

- `<SelectableRow>`, `<SelectableCard>`, `<SwipeableRow>`
- `useTabHaptics`, `useKeyboardChain`
- Wire `useTabHaptics` into tab bar layout.

**Acceptance:** tab bar fires haptic on change (manual device pass). Unit tests green.

### Phase 4 · Existing primitive upgrades (PR #4)

- Reanimated 4 worklet migration for `usePressScale`, `useScreenEntrance`, `useModalCardMotion`.
- `<Screen>` scroll-linked large title.
- `<SegmentedControl>` pill slider.
- `<Chip>` hue variants + compact density.
- `<EmptyState>` / `<ErrorState>` polish.
- `<AppButton>` new `accent` variant.

**Acceptance:** no public API break for consumers. Visual snapshot diffs reviewed for existing primitives.

### Phase 5 · Copy + cleanup (PR #5)

- `glossary.ts`, `states.ts` files.
- `<EmptyState>` / `<LoadingBlock>` / `<ErrorState>` accept keys from states map (additive API).
- CI grep gate for forbidden strings.
- Move `shared/` → `ui/`.
- Rewrite 5-10 most prominent copy strings in existing screens (opportunistic, low-risk).

**Acceptance:** CI fails on forbidden strings. No remaining `shared/` folder.

## 12. Testing strategy

- **Unit tests** per new/upgraded primitive in `__tests__/name.test.tsx`:
  - Renders by variant.
  - Correct spring preset referenced (assert `motion.springs.press` is the one used).
  - Reduced motion respected (mock `useReducedMotion` → true, assert instant values).
  - Haptic fires on expected events (mock `haptics` module).
- **Snapshot tests** for key primitives in light + dark modes.
- **Manual device pass** per PR on iOS simulator + real device. Checklist: no regression on existing screens, new primitive feels right, haptics/motion perceivable.
- **Release-mode validation** per PR on simulator (animations measured at 60fps, no jank in Reanimated worklets).

No e2e in Foundation — belongs to screen sub-specs.

## 13. Exit criteria

- 5 PRs merged to `main`.
- Existing screens render with no visual regression (manual pass, simulator + device).
- New primitives exported from `mobile/components/ui/index.ts`, available for per-screen sub-specs.
- `./scripts/npmw run validate | typecheck | lint | test` green.
- No usages of deprecated token proxy remain.
- CI copy gate active.
- Tab bar haptic fires on device.

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Token migration (Phase 1) breaks visual layout on some screens | Deprecation proxy during PR. Manual visual pass per domain before proxy removal. |
| Reanimated 4 worklet migration introduces jank on older iPhones | Profile on iPhone SE 2/3 gen in release mode. Keep legacy `Animated` available as fallback util. |
| `@gorhom/bottom-sheet` conflicts with Expo SDK version | Verify compatibility with installed Expo version before Phase 2. Pin version. |
| Scope creep — temptation to redesign a screen during Foundation | Strict non-goals. PR reviews reject screen-level changes. |
| Copy gate blocks legitimate edge cases | Inline allowlist via `// @copy-allow` comment. |

## 15. Post-Foundation roadmap

Once Foundation ships, per-screen sub-specs in this order (by ROI):

1. **Home / Inicio** — adopts `<AnimatedAmount>` for the hero. Reference screen for motion.
2. **Add expense** — adopts `<StickyFooter>`, `<InputGroup>`, `<SelectableCard>` (categories/amounts), `useKeyboardChain`.
3. **Control** — adopts `<AnimatedAmount>`, custom skeletons, scroll-linked title transitions between hoy/plan/meses.
4. **Gastos (historial)** — adopts `<SwipeableRow>`, `<CategoryBadge>`, `<BottomSheet>` for filters, custom skeletons.
5. **Gastos Fijos** — adopts `<SwipeableRow>`, custom skeletons. Split of oversized `fixed-expenses-screen.tsx`.
6. **Auth / onboarding** — keeps its separate teatrical register. Only motion token adoption.
7. **Ajustes** — adopts `<InputGroup>`, `<SelectableRow>`. Split of `household-setup-screen.tsx` (541 lines).
8. **Notificaciones**, **Join Family** — low-complexity, pick up Foundation idioms.

Each sub-spec goes through its own brainstorming → design → plan → implementation loop.
