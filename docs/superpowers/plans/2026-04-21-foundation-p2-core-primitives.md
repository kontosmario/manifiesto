# Foundation Design v2 — Phase 2: Core New Primitives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PR #2 of Foundation — 6 new UI primitives (`<AnimatedAmount>`, `<CategoryBadge>`, `<BottomSheet>`, `<StickyFooter>`, `<InputGroup>`, Skeleton suite) exported from `mobile/components/ui/`, ready to be consumed by per-screen sub-specs.

**Architecture:** All primitives live in `mobile/components/ui/` as standalone files. They consume tokens from Phase 1 (`mobile/theme/palette.ts`, `mobile/theme/typography.ts`, `mobile/theme/category-hues.ts`, `mobile/lib/motion/tokens.ts`) — no new token authoring. Motion uses Reanimated 4 worklets (the API is already installed from Phase 1's `4bc243f` but unused in the app today). Native sheet behavior uses `@gorhom/bottom-sheet` (new dep).

**Tech Stack:** TypeScript, Vitest (Node env), React Native, Reanimated 4, Gesture Handler, `@gorhom/bottom-sheet` (new), `expo-symbols`.

**Reference spec:** [docs/superpowers/specs/2026-04-21-foundation-design.md](../specs/2026-04-21-foundation-design.md) section 6 (primitives) + section 11 Phase 2.

**Testing approach:** Vitest runs in Node (no RN renderer), so component render tests are out of scope. Tests target **pure helpers** extracted from each primitive — formatters, prop validators, hue resolvers, skeleton layout builders, the `AnimatedAmount` number-to-text transformer. Typecheck is the structural gate for components. Manual smoke validation on simulator deferred to user at phase-end.

**Test commands:**
- `./scripts/npmw run test` — vitest
- `./scripts/npmw run typecheck`
- `./scripts/npmw run lint`
- `./scripts/npmw run validate` — all + legacy-spacing guard

---

## File plan

### New files

| Path | Responsibility |
|---|---|
| `mobile/components/ui/category-badge.tsx` | `<CategoryBadge>` component |
| `mobile/components/ui/skeleton-box.tsx` | `<SkeletonBox>` base with Reanimated shimmer |
| `mobile/components/ui/skeleton-layouts.tsx` | `<HeroSkeleton>`, `<MetricStripSkeleton>`, `<ListRowSkeleton>`, `<CardSkeleton>` compositions |
| `mobile/components/ui/input-group.tsx` | `<InputGroup>` wrapper |
| `mobile/components/ui/sticky-footer.tsx` | `<StickyFooter>` component |
| `mobile/components/ui/bottom-sheet.tsx` | `<BottomSheet>` wrapper around `@gorhom/bottom-sheet` |
| `mobile/components/ui/animated-amount.tsx` | `<AnimatedAmount>` component (contains thin React layer) |
| `mobile/components/ui/animated-amount-format.ts` | Pure number-to-string formatter (testable) |
| `mobile/components/ui/index.ts` | Barrel for new primitives (does not re-export existing primitives) |
| `tests/unit/animated-amount-format.test.ts` | Format logic tests |
| `tests/unit/skeleton-layouts.test.ts` | Layout config tests |

### Modified files

| Path | Change |
|---|---|
| `package.json` | Add `@gorhom/bottom-sheet` dep |
| `package-lock.json` | Auto-updated |
| `tests/stubs/react-native-reanimated.ts` | Extend stub with `useSharedValue`, `useDerivedValue`, `useAnimatedStyle`, `useAnimatedProps`, `withSpring`, `withTiming`, `runOnJS`, `useAnimatedReaction` — Node-safe minimal implementations (real logic runs on device via RN; tests need the module to load) |

---

## Task 1: Install `@gorhom/bottom-sheet` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the package**

Run from `/Users/mario/apps/manifiesto/`:

```bash
./scripts/npmw install @gorhom/bottom-sheet@latest
```

Verify it installed successfully. Check the version pinned in `package.json` — should be `^5.x` (new-arch compatible).

- [ ] **Step 2: Verify peer deps satisfied**

`@gorhom/bottom-sheet` v5 requires `react-native-reanimated@>=3` and `react-native-gesture-handler@>=2`. The project already has `react-native-reanimated@4.1.1` and `react-native-gesture-handler@~2.28.0` — compatible.

No additional install needed.

- [ ] **Step 3: Typecheck**

```bash
./scripts/npmw run typecheck
```

Expected: clean. The new dep ships its own types.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add @gorhom/bottom-sheet for bottom sheet primitive"
```

---

## Task 2: Extend Reanimated stub for Phase 2 tests

**Files:**
- Modify: `tests/stubs/react-native-reanimated.ts`

Phase 2 primitives that are touched in tests indirectly (through imports) need the stub to export more symbols. Pure helper tests should not need any reanimated import, but the component files that consume those helpers may be imported transitively. Ensuring the stub exports every name the components use keeps the module resolution clean.

- [ ] **Step 1: Read existing stub**

Read `tests/stubs/react-native-reanimated.ts` to understand current exports.

- [ ] **Step 2: Extend with Node-safe minimal implementations**

Add these named exports to the stub (append to the existing file, keeping `Easing` intact):

```ts
// Hook stubs — return plain objects/values; not meant to drive rendering in tests
export function useSharedValue<T>(initial: T): { value: T } {
  return { value: initial }
}

export function useDerivedValue<T>(fn: () => T): { value: T } {
  return { value: fn() }
}

export function useAnimatedStyle<T>(fn: () => T): T {
  return fn()
}

export function useAnimatedProps<T>(fn: () => T): T {
  return fn()
}

export function useAnimatedReaction<T>(_prepare: () => T, _react: (value: T) => void): void {
  return
}

// Worklet helpers — execute the callback synchronously on Node (no UI thread)
export function withSpring<T>(toValue: T, _config?: unknown): T {
  return toValue
}

export function withTiming<T>(toValue: T, _config?: unknown): T {
  return toValue
}

export function withDelay<T>(_delay: number, animation: T): T {
  return animation
}

export function withSequence<T>(...animations: T[]): T | undefined {
  return animations[animations.length - 1]
}

export function runOnJS<F extends (...args: any[]) => any>(fn: F): F {
  return fn
}

export function interpolate(value: number, input: number[], output: number[]): number {
  if (!input.length || !output.length) return value
  if (value <= input[0]) return output[0]
  if (value >= input[input.length - 1]) return output[output.length - 1]
  for (let i = 0; i < input.length - 1; i += 1) {
    if (value >= input[i] && value <= input[i + 1]) {
      const span = input[i + 1] - input[i]
      const t = span === 0 ? 0 : (value - input[i]) / span
      return output[i] + (output[i + 1] - output[i]) * t
    }
  }
  return value
}

// Default export — matches real Reanimated: the default is the `Animated` namespace
// with View, Text, ScrollView, createAnimatedComponent. Tests that render these nodes
// get sentinel strings (enough for typecheck + import resolution; no RN renderer in Node).
const Animated = {
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  createAnimatedComponent: <T,>(component: T): T => component,
}

export default Animated
```

Keep the existing `Easing` named export (with `.bezier(...)`) intact. Do not redefine the default if it already exists — extend it to the shape above only if the current default is the previous stub placeholder.

- [ ] **Step 3: Run existing tests to verify nothing broke**

```bash
./scripts/npmw run test
```

Expected: 61/61 pass (unchanged).

- [ ] **Step 4: Commit**

```bash
git add tests/stubs/react-native-reanimated.ts
git commit -m "test(stubs): extend reanimated stub with hooks + worklet helpers"
```

---

## Task 3: `<CategoryBadge>` primitive

**Files:**
- Create: `mobile/components/ui/category-badge.tsx`

No tests — the component is thin presentational glue (resolves hue from an existing tested helper + renders a View with a Symbol). Pure logic is already covered by Task 2 of Phase 1's `category-hues.test.ts`.

- [ ] **Step 1: Read `expo-symbols` usage pattern in existing code**

Run: `grep -rn "from 'expo-symbols'\|from \"expo-symbols\"" mobile/ --include="*.tsx" | head -5`

Existing primitives like `app-symbol.tsx` already use `expo-symbols` — follow that pattern for icon rendering.

- [ ] **Step 2: Implement `<CategoryBadge>`**

Create `mobile/components/ui/category-badge.tsx`:

```tsx
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { AppSymbol } from './app-symbol'
import { useCategoryHue } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

export type CategoryBadgeSize = 'sm' | 'md' | 'lg'
export type CategoryBadgeTone = 'soft' | 'filled'

interface CategoryBadgeProps {
  categoryId: string
  iconName?: string
  size?: CategoryBadgeSize
  tone?: CategoryBadgeTone
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}

const SIZE_CONFIG: Record<CategoryBadgeSize, { box: number; icon: number }> = {
  sm: { box: 28, icon: 14 },
  md: { box: 36, icon: 18 },
  lg: { box: 48, icon: 22 },
}

export function CategoryBadge({
  categoryId,
  iconName = 'folder.fill',
  size = 'md',
  tone = 'soft',
  style,
  accessibilityLabel,
}: CategoryBadgeProps) {
  const hue = useCategoryHue(categoryId)
  const { box, icon } = SIZE_CONFIG[size]

  const surfaceColor = tone === 'filled' ? hue.ink : hue.surface
  const iconColor = tone === 'filled' ? hue.surface : hue.ink

  return (
    <View
      accessibilityElementsHidden={!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.box,
        {
          width: box,
          height: box,
          borderRadius: radii.md,
          backgroundColor: surfaceColor,
        },
        style,
      ]}
    >
      <AppSymbol name={iconName} size={icon} color={iconColor} />
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
```

**Note:** `AppSymbol` is an existing wrapper over `expo-symbols` — verify it exists at `mobile/components/ui/app-symbol.tsx` before using. If its signature differs (e.g., `iconName` vs `name` prop), adapt.

- [ ] **Step 3: Typecheck**

```bash
./scripts/npmw run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/ui/category-badge.tsx
git commit -m "feat(ui): add CategoryBadge primitive"
```

---

## Task 4: `<SkeletonBox>` base + shimmer

**Files:**
- Create: `mobile/components/ui/skeleton-box.tsx`

- [ ] **Step 1: Implement skeleton box with Reanimated shimmer**

Create `mobile/components/ui/skeleton-box.tsx`:

```tsx
import { useEffect } from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated'
import { useReducedMotion } from 'react-native-reanimated'
import { useAppTheme } from '@/theme/theme-provider'
import { motionDurations } from '@/lib/motion'

interface SkeletonBoxProps {
  width?: number | string
  height?: number
  radius?: number
  style?: StyleProp<ViewStyle>
}

export function SkeletonBox({ width = '100%', height = 16, radius = 8, style }: SkeletonBoxProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(0)

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 0.5
      return
    }
    progress.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    )
  }, [progress, reduceMotion])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion
      ? 0.6
      : interpolate(progress.value, [0, 0.5, 1], [0.45, 0.85, 0.45]),
  }))

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.colors.surfaceMuted,
        },
        animatedStyle,
        style,
      ]}
    />
  )
}
```

- [ ] **Step 2: Extend Reanimated stub with `withRepeat` and `useReducedMotion`**

Add to `tests/stubs/react-native-reanimated.ts`:

```ts
export function withRepeat<T>(animation: T, _count?: number, _reverse?: boolean): T {
  return animation
}

export function useReducedMotion(): boolean {
  return false
}
```

(Place near the other worklet helpers.)

- [ ] **Step 3: Typecheck + tests**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

Expected: clean + 61 tests still passing.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/ui/skeleton-box.tsx tests/stubs/react-native-reanimated.ts
git commit -m "feat(ui): add SkeletonBox base with shimmer animation"
```

---

## Task 5: Skeleton layout compositions

**Files:**
- Create: `mobile/components/ui/skeleton-layouts.tsx`
- Create: `tests/unit/skeleton-layouts.test.ts`

- [ ] **Step 1: Extract the skeleton layout config helpers as pure functions (for testability)**

Create `mobile/components/ui/skeleton-layouts.tsx`. Layout config lives as an inline constant, and the component composes `SkeletonBox` instances. For testability we export a pure helper:

```tsx
import { View, StyleSheet } from 'react-native'
import { SkeletonBox } from './skeleton-box'
import { radii } from '@/theme/palette'

// Pure layout descriptors — testable
export const SKELETON_HERO_LAYOUT = {
  eyebrow: { width: '35%' as const, height: 10 },
  value:   { width: '55%' as const, height: 48 },
  context: { width: '70%' as const, height: 14 },
  cta:     { width: 140, height: 34 },
}

export const SKELETON_LIST_ROW_LAYOUT = {
  leading:  { width: 36, height: 36 },
  title:    { width: '50%' as const, height: 14 },
  subtitle: { width: '35%' as const, height: 11 },
  trailing: { width: 64, height: 14 },
}

export const SKELETON_METRIC_LAYOUT = {
  label: { width: '40%' as const, height: 10 },
  value: { width: '60%' as const, height: 20 },
}

export function HeroSkeleton() {
  return (
    <View style={styles.heroCard}>
      <SkeletonBox {...SKELETON_HERO_LAYOUT.eyebrow} radius={radii.xs} />
      <View style={styles.heroSpacerSm} />
      <SkeletonBox {...SKELETON_HERO_LAYOUT.value} radius={radii.sm} />
      <View style={styles.heroSpacerMd} />
      <SkeletonBox {...SKELETON_HERO_LAYOUT.context} radius={radii.xs} />
      <View style={styles.heroSpacerLg} />
      <SkeletonBox {...SKELETON_HERO_LAYOUT.cta} radius={radii.lg} />
    </View>
  )
}

export function MetricStripSkeleton({ count = 2 }: { count?: number }) {
  return (
    <View style={styles.metricStrip}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.metricCard}>
          <SkeletonBox {...SKELETON_METRIC_LAYOUT.label} radius={radii.xs} />
          <View style={styles.metricSpacer} />
          <SkeletonBox {...SKELETON_METRIC_LAYOUT.value} radius={radii.sm} />
        </View>
      ))}
    </View>
  )
}

export function ListRowSkeleton({
  rows = 4,
  hasLeading = true,
  hasTrailing = true,
}: { rows?: number; hasLeading?: boolean; hasTrailing?: boolean }) {
  return (
    <View>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={styles.row}>
          {hasLeading && (
            <SkeletonBox {...SKELETON_LIST_ROW_LAYOUT.leading} radius={radii.md} />
          )}
          <View style={styles.rowLabels}>
            <SkeletonBox {...SKELETON_LIST_ROW_LAYOUT.title} radius={radii.xs} />
            <View style={styles.rowSpacer} />
            <SkeletonBox {...SKELETON_LIST_ROW_LAYOUT.subtitle} radius={radii.xs} />
          </View>
          {hasTrailing && (
            <SkeletonBox {...SKELETON_LIST_ROW_LAYOUT.trailing} radius={radii.xs} />
          )}
        </View>
      ))}
    </View>
  )
}

export function CardSkeleton({ height = 120 }: { height?: number }) {
  return <SkeletonBox height={height} radius={radii['2xl']} />
}

const styles = StyleSheet.create({
  heroCard:       { padding: 20, borderRadius: 28 },
  heroSpacerSm:   { height: 6 },
  heroSpacerMd:   { height: 10 },
  heroSpacerLg:   { height: 18 },
  metricStrip:    { flexDirection: 'row', gap: 10 },
  metricCard:     { flex: 1, padding: 14, borderRadius: 16 },
  metricSpacer:   { height: 6 },
  row:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  rowLabels:      { flex: 1 },
  rowSpacer:      { height: 4 },
})
```

- [ ] **Step 2: Write tests for the layout descriptor constants**

Create `tests/unit/skeleton-layouts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  SKELETON_HERO_LAYOUT,
  SKELETON_LIST_ROW_LAYOUT,
  SKELETON_METRIC_LAYOUT,
} from '@/components/ui/skeleton-layouts'

describe('skeleton layout descriptors', () => {
  it('hero layout defines eyebrow / value / context / cta blocks', () => {
    expect(SKELETON_HERO_LAYOUT).toHaveProperty('eyebrow.width')
    expect(SKELETON_HERO_LAYOUT).toHaveProperty('value.height')
    expect(SKELETON_HERO_LAYOUT).toHaveProperty('context.width')
    expect(SKELETON_HERO_LAYOUT).toHaveProperty('cta.width', 140)
  })

  it('list row layout defines leading / labels / trailing', () => {
    expect(SKELETON_LIST_ROW_LAYOUT.leading.width).toBe(36)
    expect(SKELETON_LIST_ROW_LAYOUT.title.width).toBe('50%')
    expect(SKELETON_LIST_ROW_LAYOUT.subtitle.height).toBe(11)
  })

  it('metric layout defines label + value', () => {
    expect(SKELETON_METRIC_LAYOUT.label.width).toBe('40%')
    expect(SKELETON_METRIC_LAYOUT.value.height).toBe(20)
  })
})
```

- [ ] **Step 3: Run test**

```bash
./scripts/npmw run test -- tests/unit/skeleton-layouts.test.ts
```

Expected: 3 passing.

- [ ] **Step 4: Typecheck + full test suite**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/ui/skeleton-layouts.tsx tests/unit/skeleton-layouts.test.ts
git commit -m "feat(ui): add skeleton layout compositions (Hero/MetricStrip/ListRow/Card)"
```

---

## Task 6: `<InputGroup>` primitive

**Files:**
- Create: `mobile/components/ui/input-group.tsx`

- [ ] **Step 1: Implement `<InputGroup>`**

Create `mobile/components/ui/input-group.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated'
import { useAppTheme } from '@/theme/theme-provider'
import { typography } from '@/theme/typography'

interface InputGroupProps {
  label?: string
  helper?: string
  error?: string
  required?: boolean
  children: ReactNode
}

export function InputGroup({ label, helper, error, required, children }: InputGroupProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const shake = useSharedValue(0)

  useEffect(() => {
    if (!error || reduceMotion) return
    shake.value = withSequence(
      withTiming(-4, { duration: 60 }),
      withTiming(4, { duration: 60 }),
      withTiming(-3, { duration: 60 }),
      withTiming(3, { duration: 60 }),
      withTiming(0, { duration: 60 }),
    )
  }, [error, reduceMotion, shake])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }))

  const helperColor = error ? theme.colors.danger : theme.colors.textMuted
  const helperText = error ?? helper

  return (
    <View style={styles.container}>
      {label ? (
        <Text
          style={[
            typography.fieldLabel,
            styles.label,
            { color: theme.colors.textMuted },
          ]}
          accessibilityRole="text"
        >
          {label}
          {required ? ' *' : ''}
        </Text>
      ) : null}
      <Animated.View style={animatedStyle}>{children}</Animated.View>
      {helperText ? (
        <Text
          style={[typography.caption, styles.helper, { color: helperColor }]}
          accessibilityLiveRegion={error ? 'polite' : 'none'}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label:     { marginBottom: 2 },
  helper:    { marginTop: 4 },
})
```

- [ ] **Step 2: Typecheck + test suite**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/ui/input-group.tsx
git commit -m "feat(ui): add InputGroup primitive with shake animation on error"
```

---

## Task 7: `<StickyFooter>` primitive

**Files:**
- Create: `mobile/components/ui/sticky-footer.tsx`

- [ ] **Step 1: Implement `<StickyFooter>`**

Create `mobile/components/ui/sticky-footer.tsx`:

```tsx
import { type ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppTheme } from '@/theme/theme-provider'

interface StickyFooterProps {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  divider?: boolean
}

export function StickyFooter({ children, style, divider = true }: StickyFooterProps) {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View
        style={[
          styles.container,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: theme.colors.canvas,
            borderTopColor: theme.colors.border,
            borderTopWidth: divider ? StyleSheet.hairlineWidth : 0,
          },
          style,
        ]}
      >
        <View style={styles.inner}>{children}</View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  inner: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
})
```

- [ ] **Step 2: Typecheck + test**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/ui/sticky-footer.tsx
git commit -m "feat(ui): add StickyFooter primitive (safe-area + keyboard aware)"
```

---

## Task 8: `<BottomSheet>` wrapper

**Files:**
- Create: `mobile/components/ui/bottom-sheet.tsx`

- [ ] **Step 1: Implement the wrapper**

Create `mobile/components/ui/bottom-sheet.tsx`:

```tsx
import { forwardRef, useCallback, useImperativeHandle, useRef, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import GorhomBottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetProps as GorhomBottomSheetProps,
} from '@gorhom/bottom-sheet'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'
import { triggerHaptic } from '@/lib/haptics'

export interface BottomSheetHandle {
  present: () => void
  dismiss: () => void
  snapTo: (index: number) => void
}

interface BottomSheetProps {
  children: ReactNode
  snapPoints?: Array<string | number>
  enableDynamicSizing?: boolean
  onDismiss?: () => void
  hapticOnDismiss?: boolean
  backgroundStyle?: GorhomBottomSheetProps['backgroundStyle']
}

export const BottomSheet = forwardRef<BottomSheetHandle, BottomSheetProps>(function BottomSheet(
  {
    children,
    snapPoints = ['50%', '90%'],
    enableDynamicSizing = false,
    onDismiss,
    hapticOnDismiss = true,
    backgroundStyle,
  },
  ref,
) {
  const { theme } = useAppTheme()
  const sheetRef = useRef<GorhomBottomSheet>(null)

  useImperativeHandle(ref, () => ({
    present: () => sheetRef.current?.expand(),
    dismiss: () => sheetRef.current?.close(),
    snapTo: (index: number) => sheetRef.current?.snapToIndex(index),
  }), [])

  const handleClose = useCallback(() => {
    if (hapticOnDismiss) triggerHaptic('selection')
    onDismiss?.()
  }, [hapticOnDismiss, onDismiss])

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  )

  return (
    <GorhomBottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enableDynamicSizing={enableDynamicSizing}
      enablePanDownToClose
      onClose={handleClose}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: theme.colors.borderStrong, width: 36, height: 4 }}
      backgroundStyle={[
        {
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: radii['2xl'],
          borderTopRightRadius: radii['2xl'],
        },
        backgroundStyle,
      ]}
    >
      <View style={styles.content}>{children}</View>
    </GorhomBottomSheet>
  )
})

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
})
```

**Note:** `triggerHaptic` lives in `mobile/lib/haptics.ts` (existing). If that file is still untracked, it won't break typecheck (TS compiles from the filesystem). Verify the import path is correct.

- [ ] **Step 2: Typecheck + test**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

Expected: green.

If `@gorhom/bottom-sheet` types don't resolve, ensure the install from Task 1 succeeded. Running `./scripts/npmw install` again is safe.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/ui/bottom-sheet.tsx
git commit -m "feat(ui): add BottomSheet wrapper around @gorhom/bottom-sheet"
```

---

## Task 9: `<AnimatedAmount>` — currency ticker

**Files:**
- Create: `mobile/components/ui/animated-amount-format.ts`
- Create: `mobile/components/ui/animated-amount.tsx`
- Create: `tests/unit/animated-amount-format.test.ts`

- [ ] **Step 1: Write the failing test for the pure formatter**

Create `tests/unit/animated-amount-format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatAnimatedAmount } from '@/components/ui/animated-amount-format'

describe('formatAnimatedAmount', () => {
  it('formats Argentine peso amounts with thousands separators', () => {
    expect(formatAnimatedAmount(12400, 'es-AR')).toBe('$12.400')
    expect(formatAnimatedAmount(0, 'es-AR')).toBe('$0')
    expect(formatAnimatedAmount(1500000, 'es-AR')).toBe('$1.500.000')
  })

  it('prefixes negative amounts with a minus', () => {
    expect(formatAnimatedAmount(-850, 'es-AR')).toBe('-$850')
  })

  it('rounds fractional values to the nearest integer', () => {
    expect(formatAnimatedAmount(12.7, 'es-AR')).toBe('$13')
    expect(formatAnimatedAmount(12.3, 'es-AR')).toBe('$12')
  })

  it('accepts an explicit prefix override', () => {
    expect(formatAnimatedAmount(800, 'es-AR', '+')).toBe('+$800')
    expect(formatAnimatedAmount(800, 'es-AR', null)).toBe('$800')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
./scripts/npmw run test -- tests/unit/animated-amount-format.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement the formatter**

Create `mobile/components/ui/animated-amount-format.ts`:

```ts
export type AmountPrefix = '+' | '-' | null | undefined

export function formatAnimatedAmount(
  value: number,
  locale: string = 'es-AR',
  prefix?: AmountPrefix,
): string {
  const rounded = Math.round(value)
  const isNegative = rounded < 0
  const absolute = Math.abs(rounded)

  const absoluteFormatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(absolute)

  const resolvedPrefix: string =
    prefix === undefined ? (isNegative ? '-' : '') : prefix ?? ''

  return `${resolvedPrefix}$${absoluteFormatted}`
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./scripts/npmw run test -- tests/unit/animated-amount-format.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Implement the component**

Create `mobile/components/ui/animated-amount.tsx`:

```tsx
import { useEffect } from 'react'
import { Text, type StyleProp, type TextStyle } from 'react-native'
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedProps,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated'
import { typography } from '@/theme/typography'
import { motionSprings } from '@/lib/motion'
import { triggerHaptic } from '@/lib/haptics'
import { formatAnimatedAmount, type AmountPrefix } from './animated-amount-format'

type AmountVariant = 'hero' | 'displayLarge' | 'metricLarge' | 'metricValue' | 'bodyEmphasis'

interface AnimatedAmountProps {
  value: number
  variant?: AmountVariant
  hapticOnChange?: boolean
  prefix?: AmountPrefix
  locale?: string
  color?: string
  maxFontSizeMultiplier?: number
  style?: StyleProp<TextStyle>
}

const VARIANT_TO_PRESET: Record<AmountVariant, keyof typeof typography> = {
  hero: 'hero',
  displayLarge: 'displayLarge',
  metricLarge: 'metricLarge',
  metricValue: 'metricValue',
  bodyEmphasis: 'bodyEmphasis',
}

const AnimatedText = Animated.createAnimatedComponent(Text)

export function AnimatedAmount({
  value,
  variant = 'hero',
  hapticOnChange = false,
  prefix,
  locale = 'es-AR',
  color,
  maxFontSizeMultiplier = 1.2,
  style,
}: AnimatedAmountProps) {
  const reduceMotion = useReducedMotion()
  const current = useSharedValue(value)

  useEffect(() => {
    const previous = current.value
    current.value = reduceMotion ? value : withSpring(value, motionSprings.value)
    if (hapticOnChange && previous !== value) {
      triggerHaptic(value > previous ? 'success' : 'selection')
    }
  }, [value, reduceMotion, hapticOnChange, current])

  const formatted = useDerivedValue(() => formatAnimatedAmount(current.value, locale, prefix))

  const animatedProps = useAnimatedProps(() => ({
    text: formatted.value,
    defaultValue: formatted.value,
  }) as unknown as { text: string })

  const presetKey = VARIANT_TO_PRESET[variant]
  const preset = typography[presetKey]

  return (
    <AnimatedText
      allowFontScaling
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      accessibilityLabel={formatAnimatedAmount(value, locale, prefix)}
      style={[preset, color ? { color } : null, style]}
      animatedProps={animatedProps}
    >
      {formatAnimatedAmount(value, locale, prefix)}
    </AnimatedText>
  )
}
```

**Note on the `animatedProps as unknown as { text: string }` cast:** Reanimated's `Text` `animatedProps` prop types don't include `text` officially, but the native driver supports it. This pattern is widespread — the cast is the idiomatic escape hatch.

- [ ] **Step 6: Typecheck + test**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

Expected: green. 65 tests total (+3 skeleton +4 amount format).

- [ ] **Step 7: Commit**

```bash
git add mobile/components/ui/animated-amount-format.ts mobile/components/ui/animated-amount.tsx tests/unit/animated-amount-format.test.ts
git commit -m "feat(ui): add AnimatedAmount currency ticker primitive"
```

---

## Task 10: UI barrel index

**Files:**
- Create: `mobile/components/ui/index.ts`

- [ ] **Step 1: Create the barrel with only the new primitives**

Create `mobile/components/ui/index.ts`:

```ts
// Phase 2 primitives — barrel.
// Existing primitives remain imported by explicit path per the codebase convention.
// Add re-exports as new primitives land.

export { AnimatedAmount } from './animated-amount'
export { formatAnimatedAmount, type AmountPrefix } from './animated-amount-format'

export { BottomSheet, type BottomSheetHandle } from './bottom-sheet'

export { CategoryBadge, type CategoryBadgeSize, type CategoryBadgeTone } from './category-badge'

export { InputGroup } from './input-group'

export { SkeletonBox } from './skeleton-box'
export {
  HeroSkeleton,
  MetricStripSkeleton,
  ListRowSkeleton,
  CardSkeleton,
  SKELETON_HERO_LAYOUT,
  SKELETON_LIST_ROW_LAYOUT,
  SKELETON_METRIC_LAYOUT,
} from './skeleton-layouts'

export { StickyFooter } from './sticky-footer'
```

- [ ] **Step 2: Typecheck**

```bash
./scripts/npmw run typecheck
```

Expected: clean.

- [ ] **Step 3: Run validate**

```bash
./scripts/npmw run validate
```

Expected: typecheck green, test green (65 tests), guard green. Lint may still have the 1 pre-existing error from Phase 1 (out of scope).

- [ ] **Step 4: Commit**

```bash
git add mobile/components/ui/index.ts
git commit -m "feat(ui): add Phase 2 primitives barrel"
```

---

## Task 11: Final validation

**Files:** none edited.

- [ ] **Step 1: Run full validate**

```bash
./scripts/npmw run validate
```

Expected: typecheck green, test green (65 total), guard green. Lint state unchanged from end of Phase 1.

- [ ] **Step 2: Sanity grep — no stray imports from the wrong path**

```bash
grep -rn "from '@/components/ui'" mobile app tests --include="*.ts" --include="*.tsx" | head
```

Expected: zero matches (no consumer adopts the barrel yet — that happens in per-screen sub-specs).

- [ ] **Step 3: Commit nothing. Report phase complete.**

Report to controller: primitives ready. Manual smoke validation on device requires booting a dev preview screen — deferred to the per-screen sub-specs that will consume these primitives (Home / Add-expense sub-specs will exercise `AnimatedAmount`, `StickyFooter`, `CategoryBadge` in real UI).

---

## Out of scope (Phase 2 explicit non-goals)

- **Dev preview screen** — the spec's acceptance criteria mention a `mobile/screens/_dev/primitives-preview.tsx` demo. Deferred because it adds a route-authoring task and drifts toward per-screen work. Smoke validation will happen organically when Home and Add-expense sub-specs consume these primitives.
- **Adopting the primitives in existing screens** — per-screen sub-specs.
- **Migrating existing `Animated`-API code to Reanimated 4** — Phase 4.
- **Copy glossary integration** — Phase 5.

## Exit criteria

- All 11 tasks complete.
- 9 net-new primitive-level files under `mobile/components/ui/` (7 components + 1 helper + 1 barrel).
- `@gorhom/bottom-sheet` in `package.json`.
- Reanimated stub extended for Node test env.
- 65 vitest tests green (was 61 at end of Phase 1).
- Typecheck clean.
- Legacy-spacing CI guard passing.
