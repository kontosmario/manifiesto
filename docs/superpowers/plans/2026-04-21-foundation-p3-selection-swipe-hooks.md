# Foundation Design v2 — Phase 3: Selection + Swipe + Utility Hooks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship PR #3 of Foundation — 3 new interaction primitives (`<SelectableRow>`, `<SelectableCard>`, `<SwipeableRow>`) + 2 utility hooks (`useTabHaptics`, `useKeyboardChain`), plus wiring tab bar haptic into `<AppTabs>`.

**Architecture:** All components live in `mobile/components/ui/`; hooks in `mobile/hooks/` (already exists as transversal hook directory). Interactions use Reanimated 4 worklets + Gesture Handler. Haptic coupling centralized through the existing `triggerHaptic` helper.

**Tech Stack:** TypeScript, Vitest (Node), Reanimated 4, Gesture Handler, Expo Router.

**Reference spec:** [docs/superpowers/specs/2026-04-21-foundation-design.md](../specs/2026-04-21-foundation-design.md) section 6.4 / 6.5 / 6.9 + section 11 Phase 3.

**Test commands:** `./scripts/npmw run test | typecheck | lint | validate`.

---

## File plan

### New files

| Path | Responsibility |
|---|---|
| `mobile/components/ui/selectable-row.tsx` | `<SelectableRow>` list selection primitive |
| `mobile/components/ui/selectable-card.tsx` | `<SelectableCard>` tile selection primitive |
| `mobile/components/ui/swipeable-row.tsx` | `<SwipeableRow>` swipe-to-action with affordance |
| `mobile/hooks/use-tab-haptics.ts` | `useTabHaptics()` — handlers for tab press haptic |
| `mobile/hooks/use-keyboard-chain.ts` | `useKeyboardChain()` — ref array + returnKey chain helper |

### Modified files

| Path | Change |
|---|---|
| `mobile/components/navigation/app-tabs.tsx` | Wire `screenListeners.tabPress` to fire tab haptic |
| `mobile/components/ui/index.ts` | Re-export new primitives |

---

## Task 1: `<SelectableRow>` primitive

**File:** `mobile/components/ui/selectable-row.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated'
import { AppSymbol } from './app-symbol'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { motionSprings } from '@/lib/motion'
import { triggerHaptic, type AppHapticTone } from '@/lib/haptics'

interface SelectableRowProps {
  selected: boolean
  onPress: () => void
  title: string
  meta?: string
  leading?: ReactNode
  disabled?: boolean
  hapticTone?: AppHapticTone
  style?: StyleProp<ViewStyle>
}

export function SelectableRow({
  selected,
  onPress,
  title,
  meta,
  leading,
  disabled,
  hapticTone = 'selection',
  style,
}: SelectableRowProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const pressScale = useSharedValue(1)
  const checkScale = useSharedValue(selected ? 1 : 0)

  checkScale.value = reduceMotion
    ? (selected ? 1 : 0)
    : withSpring(selected ? 1 : 0, motionSprings.celebrate)

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : pressScale.value }],
  }))

  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkScale.value,
    transform: [{ scale: checkScale.value }],
  }))

  const handlePress = () => {
    if (disabled) return
    void triggerHaptic(hapticTone)
    onPress()
  }

  return (
    <Animated.View style={[pressStyle, style]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled }}
        onPress={handlePress}
        onPressIn={() => {
          if (!disabled) pressScale.value = withSpring(0.97, motionSprings.press)
        }}
        onPressOut={() => {
          pressScale.value = withSpring(1, motionSprings.press)
        }}
        disabled={disabled}
        android_ripple={{
          color: theme.colors.primarySurface,
          borderless: false,
        }}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: selected ? theme.colors.primarySurface : 'transparent',
            borderColor: selected ? theme.brand.bright : theme.colors.border,
            opacity: disabled ? 0.5 : pressed ? 0.92 : 1,
          },
        ]}
      >
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <View style={styles.body}>
          <Text style={[typography.bodyLarge, { color: theme.colors.text }]}>{title}</Text>
          {meta ? (
            <Text style={[typography.caption, styles.meta, { color: theme.colors.textMuted }]}>
              {meta}
            </Text>
          ) : null}
        </View>
        <Animated.View style={[styles.check, checkStyle]}>
          <AppSymbol
            name="checkmark.circle.fill"
            fallback="check-circle"
            size={22}
            color={theme.brand.bright}
          />
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  leading: { justifyContent: 'center' },
  body:    { flex: 1, justifyContent: 'center' },
  meta:    { marginTop: 2 },
  check:   { justifyContent: 'center' },
})
```

- [ ] **Step 2: Typecheck**

Run: `./scripts/npmw run typecheck`
Expected: clean.

- [ ] **Step 3: Test suite**

Run: `./scripts/npmw run test`
Expected: 68/68 passing (no tests added; runtime-only component).

- [ ] **Step 4: Commit**

```bash
git add mobile/components/ui/selectable-row.tsx
git commit -m "feat(ui): add SelectableRow primitive (row selection with check affordance)"
```

---

## Task 2: `<SelectableCard>` primitive

**File:** `mobile/components/ui/selectable-card.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { type ReactNode } from 'react'
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'
import { motionSprings } from '@/lib/motion'
import { triggerHaptic, type AppHapticTone } from '@/lib/haptics'

export type SelectableCardSize = 'sm' | 'md' | 'lg'

interface SelectableCardProps {
  selected: boolean
  onPress: () => void
  disabled?: boolean
  hapticTone?: AppHapticTone
  size?: SelectableCardSize
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
  children: ReactNode
}

const SIZE_PADDING: Record<SelectableCardSize, number> = {
  sm: 10,
  md: 14,
  lg: 18,
}

export function SelectableCard({
  selected,
  onPress,
  disabled,
  hapticTone = 'selection',
  size = 'md',
  style,
  accessibilityLabel,
  children,
}: SelectableCardProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const pressScale = useSharedValue(1)

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : pressScale.value }],
  }))

  const handlePress = () => {
    if (disabled) return
    void triggerHaptic(hapticTone)
    onPress()
  }

  return (
    <Animated.View style={[pressStyle, style]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled }}
        accessibilityLabel={accessibilityLabel}
        onPress={handlePress}
        onPressIn={() => {
          if (!disabled) pressScale.value = withSpring(0.96, motionSprings.press)
        }}
        onPressOut={() => {
          pressScale.value = withSpring(1, motionSprings.press)
        }}
        disabled={disabled}
        android_ripple={{
          color: theme.colors.primarySurface,
          borderless: false,
        }}
        style={({ pressed }) => [
          styles.card,
          {
            padding: SIZE_PADDING[size],
            backgroundColor: selected ? theme.colors.primarySurface : theme.colors.surface,
            borderColor: selected ? theme.brand.bright : theme.colors.border,
            borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
            opacity: disabled ? 0.5 : pressed ? 0.94 : 1,
          },
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
```

- [ ] **Step 2: Typecheck + test suite**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

- [ ] **Step 3: Commit**

```bash
git add mobile/components/ui/selectable-card.tsx
git commit -m "feat(ui): add SelectableCard primitive (tile selection with press scale)"
```

---

## Task 3: `<SwipeableRow>` primitive

**File:** `mobile/components/ui/swipeable-row.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useCallback, useRef, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { RectButton, Swipeable } from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated'
import { useAppTheme } from '@/theme/theme-provider'
import { typography } from '@/theme/typography'
import { triggerHaptic, type AppHapticTone } from '@/lib/haptics'

export interface SwipeAction {
  label: string
  tone?: 'neutral' | 'danger'
  onPress: () => void
  iconName?: string
}

interface SwipeableRowProps {
  children: ReactNode
  rightActions?: SwipeAction[]
  leftActions?: SwipeAction[]
  accessibilityHint: string  // required — CODE_RULES §11.4
  onSwipeOpenHaptic?: AppHapticTone
}

export function SwipeableRow({
  children,
  rightActions = [],
  leftActions = [],
  accessibilityHint,
  onSwipeOpenHaptic = 'selection',
}: SwipeableRowProps) {
  const swipeRef = useRef<Swipeable>(null)

  const handleSwipeOpen = useCallback(() => {
    void triggerHaptic(onSwipeOpenHaptic)
  }, [onSwipeOpenHaptic])

  const renderActions = useCallback(
    (actions: SwipeAction[], side: 'left' | 'right') =>
      (progress: SharedValue<number>) => (
        <SwipeActionsRow
          actions={actions}
          side={side}
          progress={progress}
          onActionPress={(action) => {
            swipeRef.current?.close()
            action.onPress()
          }}
        />
      ),
    [],
  )

  return (
    <View
      accessible
      accessibilityHint={accessibilityHint}
    >
      <Swipeable
        ref={swipeRef}
        friction={1.8}
        overshootLeft={false}
        overshootRight={false}
        onSwipeableOpen={handleSwipeOpen}
        renderRightActions={rightActions.length ? renderActions(rightActions, 'right') : undefined}
        renderLeftActions={leftActions.length ? renderActions(leftActions, 'left') : undefined}
      >
        {children}
      </Swipeable>
    </View>
  )
}

interface SwipeActionsRowProps {
  actions: SwipeAction[]
  side: 'left' | 'right'
  progress: SharedValue<number>
  onActionPress: (action: SwipeAction) => void
}

function SwipeActionsRow({ actions, side, progress, onActionPress }: SwipeActionsRowProps) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.6, 1]),
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [side === 'right' ? 40 : -40, 0]) },
    ],
  }))

  return (
    <Animated.View
      style={[
        styles.actionsRow,
        side === 'right' ? styles.actionsRight : styles.actionsLeft,
        style,
      ]}
    >
      {actions.map((action, index) => (
        <SwipeActionButton key={`${action.label}-${index}`} action={action} onPress={onActionPress} />
      ))}
    </Animated.View>
  )
}

function SwipeActionButton({ action, onPress }: { action: SwipeAction; onPress: (action: SwipeAction) => void }) {
  const { theme } = useAppTheme()
  const isDanger = action.tone === 'danger'
  const background = isDanger ? theme.colors.danger : theme.colors.primary
  const foreground = isDanger ? '#FFFFFF' : theme.isDark ? theme.brand.deep : '#FFFFFF'

  return (
    <RectButton
      onPress={() => {
        void triggerHaptic(isDanger ? 'warning' : 'selection')
        onPress(action)
      }}
      style={[styles.actionButton, { backgroundColor: background }]}
    >
      <Text style={[typography.buttonCompact, styles.actionLabel, { color: foreground }]}>
        {action.label}
      </Text>
    </RectButton>
  )
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  actionsRight: { justifyContent: 'flex-end' },
  actionsLeft:  { justifyContent: 'flex-start' },
  actionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    minWidth: 84,
  },
  actionLabel: { textAlign: 'center' },
})
```

**Note on `RectButton`:** `react-native-gesture-handler` exports `RectButton` which provides native-feel press feedback on Android (ripple) and iOS (highlight). This is the idiomatic Gesture-Handler action component inside `Swipeable`.

- [ ] **Step 2: Extend Gesture Handler stub if needed**

Verify test suite still passes. If vitest fails resolving `react-native-gesture-handler`, add a minimal stub at `tests/stubs/react-native-gesture-handler.ts`:

```ts
export const Swipeable = 'Swipeable'
export const RectButton = 'RectButton'
export const GestureHandlerRootView = 'GestureHandlerRootView'
```

And add the alias to `vitest.config.ts`:

```ts
'react-native-gesture-handler': resolve(__dirname, './tests/stubs/react-native-gesture-handler.ts'),
```

Skip this step if the test suite stays green without it.

- [ ] **Step 3: Typecheck + test suite**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

- [ ] **Step 4: Commit**

```bash
git add mobile/components/ui/swipeable-row.tsx
# If stub was needed:
# git add tests/stubs/react-native-gesture-handler.ts vitest.config.ts
git commit -m "feat(ui): add SwipeableRow primitive with visible affordance + required hint"
```

---

## Task 4: `useTabHaptics` hook

**File:** `mobile/hooks/use-tab-haptics.ts`

- [ ] **Step 1: Create the file**

```ts
import { useMemo } from 'react'
import { triggerHaptic } from '@/lib/haptics'

interface TabPressEvent {
  target?: string
}

/**
 * Returns a `screenListeners` config for Expo Router's `<Tabs>` that fires
 * `selection` haptic on every tab press. Wire into `<Tabs screenListeners={...}>`.
 */
export function useTabHaptics() {
  return useMemo(
    () => ({
      tabPress: (_event: TabPressEvent) => {
        void triggerHaptic('selection')
      },
    }),
    [],
  )
}
```

- [ ] **Step 2: Typecheck + test**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

- [ ] **Step 3: Commit**

```bash
git add mobile/hooks/use-tab-haptics.ts
git commit -m "feat(hooks): add useTabHaptics for tab bar selection haptic"
```

---

## Task 5: `useKeyboardChain` hook

**File:** `mobile/hooks/use-keyboard-chain.ts`

- [ ] **Step 1: Implement the helper**

```ts
import { useMemo, useRef } from 'react'
import type { ReturnKeyTypeOptions, TextInput } from 'react-native'

export interface KeyboardChainField {
  /** Attach this ref to the TextInput. */
  ref: React.RefObject<TextInput | null>
  /** Apply to the TextInput's `returnKeyType` prop. */
  returnKeyType: ReturnKeyTypeOptions
  /** Apply to the TextInput's `onSubmitEditing` prop. */
  onSubmitEditing: () => void
}

/**
 * Builds a return-key chain across a sequence of TextInput refs.
 *
 * Usage:
 *   const [amount, description] = useKeyboardChain(2, handleSubmit)
 *   <TextField ref={amount.ref} returnKeyType={amount.returnKeyType} onSubmitEditing={amount.onSubmitEditing} />
 *   <TextField ref={description.ref} returnKeyType={description.returnKeyType} onSubmitEditing={description.onSubmitEditing} />
 *
 * The last field fires `onSubmit` (if provided) and uses `done` / `go` as its key.
 */
export function useKeyboardChain(
  count: number,
  onSubmit?: () => void,
  lastReturnKey: ReturnKeyTypeOptions = 'done',
): KeyboardChainField[] {
  const refs = useRef<Array<React.RefObject<TextInput | null>>>([])
  if (refs.current.length !== count) {
    refs.current = Array.from({ length: count }, (_, i) => refs.current[i] ?? { current: null })
  }

  return useMemo(
    () =>
      refs.current.map((ref, index) => {
        const isLast = index === count - 1
        return {
          ref,
          returnKeyType: isLast ? lastReturnKey : 'next',
          onSubmitEditing: () => {
            if (isLast) {
              onSubmit?.()
            } else {
              refs.current[index + 1]?.current?.focus()
            }
          },
        }
      }),
    [count, onSubmit, lastReturnKey],
  )
}
```

- [ ] **Step 2: Typecheck + test**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

- [ ] **Step 3: Commit**

```bash
git add mobile/hooks/use-keyboard-chain.ts
git commit -m "feat(hooks): add useKeyboardChain for form field return-key chaining"
```

---

## Task 6: Wire `useTabHaptics` into `<AppTabs>`

**File:** `mobile/components/navigation/app-tabs.tsx`

- [ ] **Step 1: Add import and wire `screenListeners`**

Edit `mobile/components/navigation/app-tabs.tsx`. Add near the existing imports:

```ts
import { useTabHaptics } from '@/hooks/use-tab-haptics'
```

Inside `AppTabs`, call the hook:

```ts
const tabHaptics = useTabHaptics()
```

Pass it to `<Tabs>` via `screenListeners`:

```tsx
<Tabs
  screenOptions={{ /* ... existing ... */ }}
  screenListeners={tabHaptics}
>
```

- [ ] **Step 2: Typecheck + test + lint**

```bash
./scripts/npmw run typecheck
./scripts/npmw run lint mobile/components/navigation/app-tabs.tsx
./scripts/npmw run test
```

- [ ] **Step 3: Commit**

```bash
git add mobile/components/navigation/app-tabs.tsx
git commit -m "feat(navigation): wire tab bar selection haptic via useTabHaptics"
```

---

## Task 7: Update UI barrel

**File:** `mobile/components/ui/index.ts`

- [ ] **Step 1: Add new exports**

Append to the existing `mobile/components/ui/index.ts`:

```ts
export { SelectableRow } from './selectable-row'
export { SelectableCard, type SelectableCardSize } from './selectable-card'
export { SwipeableRow, type SwipeAction } from './swipeable-row'
```

- [ ] **Step 2: Typecheck**

```bash
./scripts/npmw run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add mobile/components/ui/index.ts
git commit -m "feat(ui): export Phase 3 primitives from ui barrel"
```

---

## Task 8: Final validation

- [ ] **Step 1: Run full validate**

```bash
./scripts/npmw run validate
```

Expected: typecheck green, 68/68 tests green, guard:legacy-spacing green, lint state unchanged (1 pre-existing error + 4 warnings not from Phase 3).

- [ ] **Step 2: Report phase complete**

No commits in this task — just validation.

---

## Exit criteria

- 5 primitives + hooks net-new in the codebase.
- Tab bar haptic fires on device (manual verification deferred).
- `ui/index.ts` barrel exports Phase 2 + Phase 3 primitives.
- Typecheck + test + guard green.
- No new lint errors introduced.
