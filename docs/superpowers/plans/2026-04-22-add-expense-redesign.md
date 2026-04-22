# Add Expense Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` syntax.

**Goal:** Rebuild the Add Expense screen as F3 (quick input minimal) + N2 (contextual slide-up numpad): AmountCard with `<AnimatedAmount>` hero, in-app numpad that replaces the system keyboard, 2-col `<SelectableCard>` category grid, collapsible description, sticky footer CTA. Submit → `haptics.success` + `router.back()` so Home's existing `<AnimatedAmount>` spring on the available balance serves as the visible success feedback.

**Architecture:** Reusable `<InAppNumpad>` primitive in `mobile/components/ui/` (built on `<BottomSheet>` for native physics + portal behavior). Screen-specific pieces in `mobile/components/home/`. Pure logic (numpad string ops, category ranking, description ranking) in `mobile/features/home/add-expense-model.ts` + `mobile/components/ui/in-app-numpad-model.ts`. Controller adjusted minimally — expose `rawPrice`, `isNumpadVisible`, `rankedCategories`. Split the 304-line `<AddExpenseForm>` into 7 focused files.

**Tech Stack:** TypeScript, Vitest (Node), React Native, Reanimated 4, Gesture Handler, `@gorhom/bottom-sheet`, Expo Router.

**Reference spec:** [docs/superpowers/specs/2026-04-22-add-expense-design.md](../specs/2026-04-22-add-expense-design.md).

**Test commands:** `./scripts/npmw run test | typecheck | lint | validate`.

**⚠️ Hard rule from prior crash diagnosis (see [memory](../../../.claude/projects/-Users-mario-apps-manifiesto/memory/feedback_reanimated_worklet_globals.md)):** do NOT call `Intl.NumberFormat`, `toLocaleString`, or `new Date()` inside worklet callbacks. Keep Intl formatting on the JS thread. Relevant here: `<AnimatedAmount>` is already correctly implemented; just don't add new worklets that format numbers.

---

## File plan

### New files

| Path | Responsibility |
|---|---|
| `mobile/components/ui/in-app-numpad-model.ts` | Pure string state: append digit, append comma, backspace, clear |
| `mobile/components/ui/in-app-numpad.tsx` | `<InAppNumpad>` primitive using BottomSheet + the model |
| `mobile/features/home/add-expense-model.ts` | Pure helpers: `rankCategoriesByUsage`, `pickTopCategoryDescriptions` |
| `mobile/components/home/amount-card.tsx` | Pressable hero card with AnimatedAmount |
| `mobile/components/home/suggested-amount-strip.tsx` | Horizontal chip row |
| `mobile/components/home/category-picker-grid.tsx` | 2-col SelectableCard grid + "Ver todas" tile |
| `mobile/components/home/all-categories-sheet.tsx` | BottomSheet listing all categories |
| `mobile/components/home/description-row.tsx` | Collapsible description input |
| `mobile/components/home/add-expense-dashboard.tsx` | Orchestrator replacing AddExpenseForm |
| `tests/unit/in-app-numpad-model.test.ts` | Unit tests |
| `tests/unit/add-expense-model.test.ts` | Unit tests |

### Modified files

| Path | Change |
|---|---|
| `mobile/screens/home/add-expense-screen.tsx` | Trimmed; delegates to `<AddExpenseDashboard>` |
| `mobile/features/expenses/use-add-expense-controller.ts` | Add `rawPrice`, `setRawPrice`, `isNumpadVisible`, `setNumpadVisible`, `rankedCategories`. Remove `isPriceFocused`. Relax submit validation (description optional). |
| `mobile/components/ui/index.ts` | Export `InAppNumpad` |

### Deleted files

| Path | Why |
|---|---|
| `mobile/components/home/add-expense-form.tsx` | Replaced |

---

## Task 1: In-app numpad pure model

**Files:**
- Create: `mobile/components/ui/in-app-numpad-model.ts`
- Create: `tests/unit/in-app-numpad-model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/in-app-numpad-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  appendDigit,
  appendComma,
  backspace,
  clearAll,
} from '@/components/ui/in-app-numpad-model'

const LIMITS = { maxIntegerDigits: 8, maxDecimalDigits: 2 }

describe('appendDigit', () => {
  it('appends digit to empty string', () => {
    expect(appendDigit('', '5', LIMITS)).toBe('5')
  })

  it('skips leading zero when appending onto empty', () => {
    expect(appendDigit('', '0', LIMITS)).toBe('')
  })

  it('appends digits up to max integer length', () => {
    expect(appendDigit('12345678', '9', LIMITS)).toBe('12345678')
    expect(appendDigit('1234567', '9', LIMITS)).toBe('12345679')
  })

  it('appends decimal digits up to max decimal length', () => {
    expect(appendDigit('12,5', '7', LIMITS)).toBe('12,57')
    expect(appendDigit('12,57', '9', LIMITS)).toBe('12,57')
  })
})

describe('appendComma', () => {
  it('appends comma when none present', () => {
    expect(appendComma('12')).toBe('12,')
  })

  it('is idempotent when comma already present', () => {
    expect(appendComma('12,5')).toBe('12,5')
  })

  it('adds leading zero if invoked on empty', () => {
    expect(appendComma('')).toBe('0,')
  })
})

describe('backspace', () => {
  it('removes the last character', () => {
    expect(backspace('1234')).toBe('123')
  })

  it('is a no-op on empty', () => {
    expect(backspace('')).toBe('')
  })
})

describe('clearAll', () => {
  it('returns empty string', () => {
    expect(clearAll()).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `./scripts/npmw run test -- tests/unit/in-app-numpad-model.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `mobile/components/ui/in-app-numpad-model.ts`:

```ts
interface NumpadLimits {
  maxIntegerDigits: number
  maxDecimalDigits: number
}

function splitOnComma(raw: string): { integer: string; decimal: string | null } {
  const index = raw.indexOf(',')
  if (index === -1) return { integer: raw, decimal: null }
  return { integer: raw.slice(0, index), decimal: raw.slice(index + 1) }
}

export function appendDigit(raw: string, digit: string, limits: NumpadLimits): string {
  if (raw === '' && digit === '0') return ''
  const { integer, decimal } = splitOnComma(raw)
  if (decimal === null) {
    if (integer.length >= limits.maxIntegerDigits) return raw
    return `${integer}${digit}`
  }
  if (decimal.length >= limits.maxDecimalDigits) return raw
  return `${integer},${decimal}${digit}`
}

export function appendComma(raw: string): string {
  if (raw.includes(',')) return raw
  if (raw === '') return '0,'
  return `${raw},`
}

export function backspace(raw: string): string {
  if (raw.length === 0) return ''
  return raw.slice(0, -1)
}

export function clearAll(): string {
  return ''
}
```

- [ ] **Step 4: Run to verify pass**

Run: `./scripts/npmw run test -- tests/unit/in-app-numpad-model.test.ts`
Expected: 9 tests pass.

- [ ] **Step 5: Typecheck + commit**

```bash
./scripts/npmw run typecheck
git add mobile/components/ui/in-app-numpad-model.ts tests/unit/in-app-numpad-model.test.ts
git commit -m "feat(ui): add in-app-numpad pure string state model"
```

---

## Task 2: Add-expense pure helpers (ranking)

**Files:**
- Create: `mobile/features/home/add-expense-model.ts`
- Create: `tests/unit/add-expense-model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/add-expense-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  rankCategoriesByUsage,
  pickTopCategoryDescriptions,
} from '@/features/home/add-expense-model'
import type { Category } from '@/features/categories/use-categories'
import type { Expense } from '@/features/expenses/use-expenses'

const categories: Category[] = [
  { id: 'c1', name: 'Comida', family_id: 'f1', color: null, template_id: null, created_at: '' },
  { id: 'c2', name: 'Transporte', family_id: 'f1', color: null, template_id: null, created_at: '' },
  { id: 'c3', name: 'Casa', family_id: 'f1', color: null, template_id: null, created_at: '' },
]

function expense(
  id: string,
  categoryId: string,
  description: string,
  price = 1000,
): Expense {
  return {
    id,
    category_id: categoryId,
    description,
    price,
    family_id: 'f1',
    commitment_id: null,
    created_at: '2026-04-01T00:00:00Z',
    created_by: 'u1',
  }
}

describe('rankCategoriesByUsage', () => {
  it('orders categories by frequency descending', () => {
    const expenses: Expense[] = [
      expense('e1', 'c2', 'subte'),
      expense('e2', 'c2', 'bondi'),
      expense('e3', 'c1', 'super'),
    ]
    const ranked = rankCategoriesByUsage(expenses, categories)
    expect(ranked.map((c) => c.id)).toEqual(['c2', 'c1', 'c3'])
  })

  it('tiebreaks by category name ascending', () => {
    const ranked = rankCategoriesByUsage([], categories)
    expect(ranked.map((c) => c.name)).toEqual(['Casa', 'Comida', 'Transporte'])
  })

  it('respects limit parameter', () => {
    const expenses: Expense[] = [expense('e1', 'c2', 'x')]
    expect(rankCategoriesByUsage(expenses, categories, 2)).toHaveLength(2)
  })
})

describe('pickTopCategoryDescriptions', () => {
  it('returns top descriptions for a category, most frequent first', () => {
    const expenses: Expense[] = [
      expense('e1', 'c1', 'Supermercado'),
      expense('e2', 'c1', 'Almuerzo'),
      expense('e3', 'c1', 'Supermercado'),
    ]
    const tops = pickTopCategoryDescriptions(expenses, 'c1', 5)
    expect(tops).toEqual(['Supermercado', 'Almuerzo'])
  })

  it('filters empty + whitespace-only descriptions', () => {
    const expenses: Expense[] = [
      expense('e1', 'c1', ''),
      expense('e2', 'c1', '   '),
      expense('e3', 'c1', 'Real'),
    ]
    expect(pickTopCategoryDescriptions(expenses, 'c1', 5)).toEqual(['Real'])
  })

  it('returns empty array when category has no expenses', () => {
    expect(pickTopCategoryDescriptions([], 'c1', 5)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `./scripts/npmw run test -- tests/unit/add-expense-model.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `mobile/features/home/add-expense-model.ts`:

```ts
import type { Category } from '@/features/categories/use-categories'
import type { Expense } from '@/features/expenses/use-expenses'

export function rankCategoriesByUsage(
  expenses: Expense[],
  categories: Category[],
  limit?: number,
): Category[] {
  const counts = new Map<string, number>()
  for (const expense of expenses) {
    counts.set(expense.category_id, (counts.get(expense.category_id) ?? 0) + 1)
  }
  const ranked = [...categories].sort((a, b) => {
    const diff = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name)
  })
  return typeof limit === 'number' ? ranked.slice(0, limit) : ranked
}

export function pickTopCategoryDescriptions(
  expenses: Expense[],
  categoryId: string,
  limit: number,
): string[] {
  const counts = new Map<string, number>()
  for (const expense of expenses) {
    if (expense.category_id !== categoryId) continue
    const trimmed = expense.description.trim()
    if (!trimmed) continue
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([description]) => description)
}
```

- [ ] **Step 4: Run + commit**

```bash
./scripts/npmw run test -- tests/unit/add-expense-model.test.ts
./scripts/npmw run typecheck
git add mobile/features/home/add-expense-model.ts tests/unit/add-expense-model.test.ts
git commit -m "feat(home): add add-expense pure model (category + description ranking)"
```

---

## Task 3: `<InAppNumpad>` primitive

**File:** `mobile/components/ui/in-app-numpad.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated'
import { BottomSheet, type BottomSheetHandle } from './bottom-sheet'
import { AppSymbol } from './app-symbol'
import { AppButton } from './button'
import { appendComma, appendDigit, backspace, clearAll } from './in-app-numpad-model'
import { triggerHaptic } from '@/lib/haptics'
import { motionSprings } from '@/lib/motion'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

export interface InAppNumpadHandle {
  present: () => void
  dismiss: () => void
}

interface InAppNumpadProps {
  rawValue: string
  onChangeRawValue: (value: string) => void
  onDismiss?: () => void
  maxIntegerDigits?: number
  maxDecimalDigits?: number
  doneLabel?: string
}

const DIGITS: string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export const InAppNumpad = forwardRef<InAppNumpadHandle, InAppNumpadProps>(
  function InAppNumpad(
    {
      rawValue,
      onChangeRawValue,
      onDismiss,
      maxIntegerDigits = 8,
      maxDecimalDigits = 2,
      doneLabel = 'Listo',
    },
    ref,
  ) {
    const sheetRef = useRef<BottomSheetHandle>(null)

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }), [])

    const handleDigit = useCallback(
      (digit: string) => {
        void triggerHaptic('selection')
        onChangeRawValue(
          appendDigit(rawValue, digit, { maxIntegerDigits, maxDecimalDigits }),
        )
      },
      [onChangeRawValue, rawValue, maxIntegerDigits, maxDecimalDigits],
    )

    const handleComma = useCallback(() => {
      void triggerHaptic('selection')
      onChangeRawValue(appendComma(rawValue))
    }, [onChangeRawValue, rawValue])

    const handleBackspace = useCallback(() => {
      void triggerHaptic('light')
      onChangeRawValue(backspace(rawValue))
    }, [onChangeRawValue, rawValue])

    const handleClearAll = useCallback(() => {
      void triggerHaptic('warning')
      onChangeRawValue(clearAll())
    }, [onChangeRawValue])

    const handleDone = useCallback(() => {
      void triggerHaptic('selection')
      sheetRef.current?.dismiss()
    }, [])

    return (
      <BottomSheet
        ref={sheetRef}
        snapPoints={['50%']}
        enableDynamicSizing
        onDismiss={onDismiss}
        hapticOnDismiss={false}
      >
        <View style={styles.container}>
          <AppButton
            variant="primary"
            size="compact"
            label={doneLabel}
            onPress={handleDone}
          />
          <View style={styles.grid}>
            {DIGITS.map((digit) => (
              <NumpadKey
                key={digit}
                label={digit}
                onPress={() => handleDigit(digit)}
              />
            ))}
            <NumpadKey label="," onPress={handleComma} />
            <NumpadKey label="0" onPress={() => handleDigit('0')} />
            <NumpadKey
              onPress={handleBackspace}
              onLongPress={handleClearAll}
              icon="delete.backward.fill"
              iconFallback="backspace"
              accessibilityLabel="Borrar último dígito"
              accessibilityHint="Mantené presionado para limpiar todo"
            />
          </View>
        </View>
      </BottomSheet>
    )
  },
)

interface NumpadKeyProps {
  label?: string
  icon?: string
  iconFallback?: string
  onPress: () => void
  onLongPress?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
}

function NumpadKey({
  label,
  icon,
  iconFallback,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
}: NumpadKeyProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
  }))

  return (
    <Animated.View style={[styles.keyWrap, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label ?? ''}
        accessibilityHint={accessibilityHint}
        onPressIn={() => {
          if (reduceMotion) return
          scale.value = withSpring(0.92, motionSprings.press)
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motionSprings.press)
        }}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={450}
        style={({ pressed }) => [
          styles.key,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        {label ? (
          <Text style={[typography.titleMedium, { color: theme.colors.text, fontSize: 22 }]}>
            {label}
          </Text>
        ) : icon ? (
          <AppSymbol
            name={icon}
            fallback={iconFallback ?? 'backspace'}
            size={20}
            color={theme.colors.textMuted}
          />
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keyWrap: {
    width: '32%',
  },
  key: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingVertical: 16,
    minHeight: 54,
  },
})
```

- [ ] **Step 2: Typecheck + lint + test**

```bash
./scripts/npmw run typecheck
./scripts/npmw run lint mobile/components/ui/in-app-numpad.tsx
./scripts/npmw run test
```

Expected: typecheck clean, lint clean on the new file, tests pass.

**Note:** The `keyWrap` uses `width: '32%'` to fit 3-per-row with gap. If lint complains about accessibility on the `NumpadKey` (no label when icon-only), the already-passed `accessibilityLabel` overrides the fallback.

If the `AppSymbol` SF Symbol name `delete.backward.fill` doesn't exist on iOS, it falls back to MaterialIcons `backspace`. No crash risk.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/ui/in-app-numpad.tsx
git commit -m "feat(ui): add InAppNumpad primitive (slide-up numpad via BottomSheet)"
```

---

## Task 4: `<AmountCard>`

**File:** `mobile/components/home/amount-card.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated'
import { AnimatedAmount } from '@/components/ui/animated-amount'
import { triggerHaptic } from '@/lib/haptics'
import { motionSprings } from '@/lib/motion'
import { brand, radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface AmountCardProps {
  amount: number
  isActive: boolean
  onPress: () => void
}

export function AmountCard({ amount, isActive, onPress }: AmountCardProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
  }))

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Monto: ${amount}`}
        accessibilityHint="Abre el numpad para editar el monto"
        onPress={() => {
          void triggerHaptic('light')
          onPress()
        }}
        onPressIn={() => {
          if (reduceMotion) return
          scale.value = withSpring(0.98, motionSprings.press)
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motionSprings.press)
        }}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: isActive ? brand.deep : theme.colors.border,
            borderWidth: isActive ? 2 : StyleSheet.hairlineWidth,
            opacity: pressed ? 0.96 : 1,
          },
        ]}
      >
        <View style={styles.topRow}>
          <Text style={[typography.eyebrow, { color: theme.colors.textMuted }]}>
            Monto
          </Text>
          {!isActive ? (
            <Text style={[typography.caption, { color: theme.colors.textSoft }]}>
              Tap para editar
            </Text>
          ) : null}
        </View>
        <AnimatedAmount
          value={amount}
          variant="hero"
          color={theme.colors.text}
          style={styles.value}
        />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii['2xl'],
    paddingHorizontal: 22,
    paddingVertical: 20,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  value: {
    letterSpacing: -2,
  },
})
```

- [ ] **Step 2: Typecheck + test + commit**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
git add mobile/components/home/amount-card.tsx
git commit -m "feat(home): add AmountCard with AnimatedAmount hero"
```

---

## Task 5: `<SuggestedAmountStrip>`

**File:** `mobile/components/home/suggested-amount-strip.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { ScrollView, StyleSheet } from 'react-native'
import { Chip } from '@/components/ui/chip'
import { currencyFormatter } from '@/utils/money'

interface SuggestedAmountStripProps {
  amounts: number[]
  currentAmount: number
  onSelect: (value: number) => void
}

export function SuggestedAmountStrip({
  amounts,
  currentAmount,
  onSelect,
}: SuggestedAmountStripProps) {
  const rounded = Math.round(currentAmount)

  return (
    <ScrollView
      contentContainerStyle={styles.row}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {amounts.map((amount) => (
        <Chip
          key={amount}
          compact
          isActive={rounded === amount}
          label={currencyFormatter.format(amount)}
          onPress={() => onSelect(amount)}
        />
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingHorizontal: 2,
  },
})
```

- [ ] **Step 2: Typecheck + commit**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
git add mobile/components/home/suggested-amount-strip.tsx
git commit -m "feat(home): add SuggestedAmountStrip (horizontal quick-amount chips)"
```

---

## Task 6: `<CategoryPickerGrid>` + `<AllCategoriesSheet>`

**Files:**
- Create: `mobile/components/home/category-picker-grid.tsx`
- Create: `mobile/components/home/all-categories-sheet.tsx`

- [ ] **Step 1: Create `<CategoryPickerGrid>`**

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CategoryBadge } from '@/components/ui/category-badge'
import { SelectableCard } from '@/components/ui/selectable-card'
import type { Category } from '@/features/categories/use-categories'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

const GRID_LIMIT = 6

interface CategoryPickerGridProps {
  categories: Category[]           // ranked list (all)
  selectedCategoryId: string
  onSelect: (categoryId: string) => void
  onSeeAll: () => void
}

export function CategoryPickerGrid({
  categories,
  selectedCategoryId,
  onSelect,
  onSeeAll,
}: CategoryPickerGridProps) {
  const { theme } = useAppTheme()
  const visible = categories.slice(0, GRID_LIMIT)
  const showSeeAll = categories.length > GRID_LIMIT

  return (
    <View style={styles.root}>
      <Text
        style={[typography.eyebrow, styles.eyebrow, { color: theme.colors.textMuted }]}
      >
        Categoría
      </Text>
      <View style={styles.grid}>
        {visible.map((category) => (
          <View key={category.id} style={styles.cell}>
            <SelectableCard
              selected={category.id === selectedCategoryId}
              onPress={() => onSelect(category.id)}
              accessibilityLabel={`Seleccionar ${category.name}`}
              size="md"
            >
              <View style={styles.cardRow}>
                <CategoryBadge categoryId={category.id} size="md" tone="soft" />
                <Text
                  style={[typography.buttonDefault, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  {category.name}
                </Text>
              </View>
            </SelectableCard>
          </View>
        ))}
        {showSeeAll ? (
          <View style={styles.cell}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver todas las categorías"
              onPress={onSeeAll}
              style={({ pressed }) => [
                styles.seeAll,
                {
                  backgroundColor: theme.colors.surfaceMuted,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <Text
                style={[typography.buttonDefault, { color: theme.colors.primaryStrong }]}
              >
                Ver todas
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  eyebrow: {},
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 8,
  },
  cell: {
    width: '48%',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  seeAll: {
    height: 64,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
```

- [ ] **Step 2: Create `<AllCategoriesSheet>`**

```tsx
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { BottomSheet, type BottomSheetHandle } from '@/components/ui/bottom-sheet'
import { CategoryBadge } from '@/components/ui/category-badge'
import { SelectableRow } from '@/components/ui/selectable-row'
import { AppButton } from '@/components/ui/button'
import type { Category } from '@/features/categories/use-categories'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface AllCategoriesSheetProps {
  categories: Category[]
  selectedCategoryId: string
  onSelect: (categoryId: string) => void
  onCreateNew?: () => void
}

export const AllCategoriesSheet = forwardRef<BottomSheetHandle, AllCategoriesSheetProps>(
  function AllCategoriesSheet(
    { categories, selectedCategoryId, onSelect, onCreateNew },
    ref,
  ) {
    const { theme } = useAppTheme()
    const sheetRef = useRef<BottomSheetHandle>(null)

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
      snapTo: (index: number) => sheetRef.current?.snapTo(index),
    }), [])

    return (
      <BottomSheet ref={sheetRef} snapPoints={['75%', '95%']}>
        <View style={styles.content}>
          <Text style={[typography.sectionTitle, { color: theme.colors.text }]}>
            Todas las categorías
          </Text>
          <View style={styles.list}>
            {categories.map((category) => (
              <SelectableRow
                key={category.id}
                selected={category.id === selectedCategoryId}
                onPress={() => {
                  onSelect(category.id)
                  sheetRef.current?.dismiss()
                }}
                title={category.name}
                leading={<CategoryBadge categoryId={category.id} size="md" tone="soft" />}
              />
            ))}
          </View>
          {onCreateNew ? (
            <AppButton
              variant="secondary"
              label="＋ Crear categoría"
              onPress={() => {
                sheetRef.current?.dismiss()
                onCreateNew()
              }}
            />
          ) : null}
        </View>
      </BottomSheet>
    )
  },
)

const styles = StyleSheet.create({
  content: {
    gap: 14,
    paddingBottom: 20,
  },
  list: {
    gap: 6,
  },
})
```

- [ ] **Step 3: Typecheck + test + commit**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
git add mobile/components/home/category-picker-grid.tsx mobile/components/home/all-categories-sheet.tsx
git commit -m "feat(home): add CategoryPickerGrid + AllCategoriesSheet"
```

---

## Task 7: `<DescriptionRow>`

**File:** `mobile/components/home/description-row.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native'
import { Chip } from '@/components/ui/chip'
import { InputGroup } from '@/components/ui/input-group'
import { TextField } from '@/components/ui/text-field'
import { AppSymbol } from '@/components/ui/app-symbol'
import { triggerHaptic } from '@/lib/haptics'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface DescriptionRowProps {
  description: string
  onChange: (value: string) => void
  quickSuggestions: string[]
  onSelectSuggestion: (value: string) => void
}

export function DescriptionRow({
  description,
  onChange,
  quickSuggestions,
  onSelectSuggestion,
}: DescriptionRowProps) {
  const { theme } = useAppTheme()
  const [expanded, setExpanded] = useState(description.trim().length > 0)
  const inputRef = useRef<TextInput | null>(null)

  const handleExpand = () => {
    void triggerHaptic('selection')
    setExpanded(true)
    setTimeout(() => inputRef.current?.focus(), 60)
  }

  const handleBlur = () => {
    if (description.trim().length === 0) {
      setExpanded(false)
    }
  }

  if (!expanded) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Agregar descripción opcional"
        onPress={handleExpand}
        style={({ pressed }) => [
          styles.collapsed,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.94 : 1,
          },
        ]}
      >
        <AppSymbol
          name="plus"
          fallback="add"
          size={16}
          color={theme.colors.textMuted}
        />
        <Text style={[typography.bodySmall, { color: theme.colors.textMuted }]}>
          Agregar descripción (opcional)
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={styles.expanded}>
      <InputGroup label="Descripción">
        <TextField
          ref={inputRef}
          autoCapitalize="sentences"
          autoCorrect={false}
          maxLength={60}
          onChangeText={onChange}
          onBlur={handleBlur}
          placeholder="Ej: Supermercado"
          returnKeyType="done"
          value={description}
        />
      </InputGroup>
      {quickSuggestions.length > 0 ? (
        <ScrollView
          contentContainerStyle={styles.suggestionsRow}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {quickSuggestions.map((suggestion) => (
            <Chip
              key={suggestion}
              compact
              label={suggestion}
              onPress={() => onSelectSuggestion(suggestion)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  collapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
  },
  expanded: {
    gap: 8,
  },
  suggestionsRow: {
    gap: 6,
    paddingHorizontal: 2,
  },
})
```

**Note on `<TextField>`'s ref:** verify that the component forwards ref. If it doesn't, either use a direct `<TextInput>` here or wrap via `useImperativeHandle` — quickest is to check `mobile/components/ui/text-field.tsx` before writing. If it doesn't forward a ref, swap the `ref={inputRef}` call to the equivalent `<TextInput>` directly.

- [ ] **Step 2: Typecheck + test + commit**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
git add mobile/components/home/description-row.tsx
git commit -m "feat(home): add collapsible DescriptionRow"
```

---

## Task 8: Controller adjustments + `<AddExpenseDashboard>` orchestrator

**Files:**
- Modify: `mobile/features/expenses/use-add-expense-controller.ts`
- Create: `mobile/components/home/add-expense-dashboard.tsx`

### Controller adjustments

- [ ] **Step 1: Read the current controller**

Run: `cat mobile/features/expenses/use-add-expense-controller.ts` to confirm the current shape.

- [ ] **Step 2: Modify the controller**

In `mobile/features/expenses/use-add-expense-controller.ts`:

1. Remove `isPriceFocused` state + its setter action (`setPriceFocused`).
2. Keep `price` as today (derived formatted representation) but add a canonical `rawPrice` state that's just the numpad's raw string.
3. Remove the `trimmedDescription` requirement in `submitExpense` — description is now optional. Still require `selectedCategoryId` + `hasValidAmount`.
4. Add `isNumpadVisible` + `setNumpadVisible` state.
5. Add `rankedCategories` derivation using `rankCategoriesByUsage`.

Replace the file with this:

```ts
import { useMemo, useState } from 'react'
import { Alert } from 'react-native'
import {
  type CategoryTemplate,
  useCategoryTemplates,
} from '@/features/categories/use-category-templates'
import { type Category, useCategories } from '@/features/categories/use-categories'
import { computeDailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import { type Expense, useCreateExpense, useExpenses } from '@/features/expenses/use-expenses'
import { rankCategoriesByUsage, pickTopCategoryDescriptions } from '@/features/home/add-expense-model'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { triggerHaptic } from '@/lib/haptics'
import { getErrorMessage } from '@/utils/error-message'
import { currencyFormatter, parsePrice } from '@/utils/money'

const EMPTY_CATEGORIES: Category[] = []
const EMPTY_CATEGORY_TEMPLATES: CategoryTemplate[] = []
const EMPTY_EXPENSES: Expense[] = []
const MAX_QUICK_DESCRIPTION_SUGGESTIONS = 6

function normalizeSuggestionLabel(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

interface UseAddExpenseControllerParams {
  familyId: string
  onCreated: () => void
  userId: string
}

export function useAddExpenseController({
  familyId,
  onCreated,
  userId,
}: UseAddExpenseControllerParams) {
  const dashboard = useFamilyDashboard(familyId)
  const categoriesQuery = useCategories(familyId)
  const categoryTemplatesQuery = useCategoryTemplates()
  const expensesQuery = useExpenses(familyId)
  const createExpenseMutation = useCreateExpense(familyId, userId)
  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES
  const categoryTemplates = categoryTemplatesQuery.data ?? EMPTY_CATEGORY_TEMPLATES
  const expenses = expensesQuery.data ?? EMPTY_EXPENSES
  const [categorySelection, setCategorySelection] = useState('')
  const [description, setDescription] = useState('')
  const [rawPrice, setRawPrice] = useState('')
  const [isNumpadVisible, setNumpadVisible] = useState(true)

  const selectedCategoryId = useMemo(() => {
    if (categories.length === 0) return ''
    return categories.some((c) => c.id === categorySelection)
      ? categorySelection
      : categories[0].id
  }, [categories, categorySelection])

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) ?? null

  const variableExpenses = useMemo(
    () => expenses.filter((expense) => !expense.commitment_id),
    [expenses],
  )

  const amount = parsePrice(rawPrice)
  const hasValidAmount = Number.isFinite(amount) && amount > 0
  const remainingCycleAfterExpense = hasValidAmount
    ? dashboard.totalAvailable - amount
    : dashboard.totalAvailable

  const dailyBudgetSummary = useMemo(
    () =>
      computeDailyBudgetSummary({
        bufferMode: dashboard.dailyBudgetBufferMode,
        bufferValue: dashboard.dailyBudgetBufferValue,
        expenses: variableExpenses,
        fixedExpensesMonthlyTotal: dashboard.fixedExpensesMonthlyTotal,
        monthlyIncome: dashboard.monthlyIncome,
        payCycle: dashboard.payCycle,
        savingsGoal: dashboard.savingsGoal,
        today: dashboard.todayDate,
      }),
    [
      dashboard.dailyBudgetBufferMode,
      dashboard.dailyBudgetBufferValue,
      dashboard.fixedExpensesMonthlyTotal,
      dashboard.monthlyIncome,
      dashboard.payCycle,
      dashboard.savingsGoal,
      dashboard.todayDate,
      variableExpenses,
    ],
  )

  const quickDescriptionSuggestions = useMemo(() => {
    if (!selectedCategory) return []
    const templateDescriptions =
      categoryTemplates.find((t) => t.id === selectedCategory.template_id)?.quickDescriptions ??
      categoryTemplates.find((t) => t.name === selectedCategory.name)?.quickDescriptions ??
      []
    const fromHistory = pickTopCategoryDescriptions(expenses, selectedCategory.id, 6)
    const merged = [...fromHistory, ...templateDescriptions]
    const seen = new Set<string>()
    return merged
      .filter((s) => {
        const normalized = normalizeSuggestionLabel(s)
        if (!normalized || seen.has(normalized)) return false
        seen.add(normalized)
        return true
      })
      .slice(0, MAX_QUICK_DESCRIPTION_SUGGESTIONS)
  }, [categoryTemplates, expenses, selectedCategory])

  const remainingTodayAfterExpense = hasValidAmount
    ? dailyBudgetSummary.remainingToday - amount
    : dailyBudgetSummary.remainingToday

  const suggestedAmounts = useMemo(() => {
    const baseAmount =
      dashboard.monthlyIncome > 0
        ? Math.max(1500, Math.round((dashboard.monthlyIncome * 0.01) / 500) * 500)
        : 5000
    const amounts = [baseAmount, baseAmount * 2, baseAmount * 3, baseAmount * 5]
    return [...new Set(amounts.map((v) => Math.max(1000, Math.round(v / 500) * 500)))]
  }, [dashboard.monthlyIncome])

  const rankedCategories = useMemo(
    () => rankCategoriesByUsage(expenses, categories),
    [expenses, categories],
  )

  const afterValue =
    dashboard.monthlyIncome > 0 ? remainingTodayAfterExpense : remainingCycleAfterExpense
  const afterLabel = dashboard.monthlyIncome > 0 ? 'Te quedan hoy' : 'Te quedan en el ciclo'
  const amountHelper =
    dashboard.monthlyIncome > 0 || hasValidAmount
      ? `${afterLabel} ${currencyFormatter.format(afterValue)}`
      : undefined

  const showError = (error: unknown, fallback: string) => {
    void triggerHaptic('error')
    Alert.alert('Algo salió mal', getErrorMessage(error, fallback))
  }

  const submitExpense = () => {
    if (!selectedCategoryId || !hasValidAmount) return
    createExpenseMutation.mutate(
      {
        categoryId: selectedCategoryId,
        description: description.trim(),
        price: amount,
      },
      {
        onError: (error: unknown) => {
          showError(error, 'No se pudo crear el gasto.')
        },
        onSuccess: () => {
          void triggerHaptic('success')
          setDescription('')
          setRawPrice('')
          onCreated()
        },
      },
    )
  }

  return {
    amount,
    amountHelper,
    categories,
    rankedCategories,
    categoriesQuery,
    createExpenseMutation,
    dashboard,
    description,
    expensesQuery,
    hasValidAmount,
    isNumpadVisible,
    normalizeSuggestionLabel,
    rawPrice,
    quickDescriptionSuggestions,
    selectedCategoryId,
    submitExpense,
    suggestedAmounts,
    actions: {
      selectCategory: setCategorySelection,
      setDescription,
      setRawPrice,
      setNumpadVisible,
      setSuggestedAmount: (value: number) => setRawPrice(String(Math.round(value))),
      useQuickDescription: setDescription,
    },
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
./scripts/npmw run typecheck
```

Expected: clean. If errors arise in `<AddExpenseForm>` (which still imports the old shape), that's OK — the file gets deleted in Task 9. The controller + new dashboard should typecheck.

### AddExpenseDashboard orchestrator

- [ ] **Step 4: Create `mobile/components/home/add-expense-dashboard.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AmountCard } from '@/components/home/amount-card'
import { AllCategoriesSheet } from '@/components/home/all-categories-sheet'
import { CategoryPickerGrid } from '@/components/home/category-picker-grid'
import { DescriptionRow } from '@/components/home/description-row'
import { SuggestedAmountStrip } from '@/components/home/suggested-amount-strip'
import { AppButton } from '@/components/ui/button'
import { type BottomSheetHandle } from '@/components/ui/bottom-sheet'
import { InAppNumpad, type InAppNumpadHandle } from '@/components/ui/in-app-numpad'
import { StickyFooter } from '@/components/ui/sticky-footer'
import type { Category } from '@/features/categories/use-categories'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface AddExpenseDashboardProps {
  amount: number
  hasValidAmount: boolean
  amountHelper?: string
  rawPrice: string
  rankedCategories: Category[]
  selectedCategoryId: string
  suggestedAmounts: number[]
  quickDescriptionSuggestions: string[]
  description: string
  isBusy: boolean
  submitErrorMessage?: string | null
  onRawPriceChange: (value: string) => void
  onSelectSuggestedAmount: (value: number) => void
  onSelectCategory: (categoryId: string) => void
  onSelectDescriptionSuggestion: (value: string) => void
  onDescriptionChange: (value: string) => void
  onCreateCategory?: () => void
  onSubmit: () => void
}

export function AddExpenseDashboard({
  amount,
  hasValidAmount,
  amountHelper,
  rawPrice,
  rankedCategories,
  selectedCategoryId,
  suggestedAmounts,
  quickDescriptionSuggestions,
  description,
  isBusy,
  submitErrorMessage,
  onRawPriceChange,
  onSelectSuggestedAmount,
  onSelectCategory,
  onSelectDescriptionSuggestion,
  onDescriptionChange,
  onCreateCategory,
  onSubmit,
}: AddExpenseDashboardProps) {
  const { theme } = useAppTheme()
  const numpadRef = useRef<InAppNumpadHandle>(null)
  const allCategoriesRef = useRef<BottomSheetHandle>(null)
  const didAutoPresent = useRef(false)

  useEffect(() => {
    if (didAutoPresent.current) return
    didAutoPresent.current = true
    const handle = setTimeout(() => numpadRef.current?.present(), 120)
    return () => clearTimeout(handle)
  }, [])

  return (
    <View style={styles.stack}>
      <AmountCard
        amount={amount}
        isActive={false}
        onPress={() => numpadRef.current?.present()}
      />

      <SuggestedAmountStrip
        amounts={suggestedAmounts}
        currentAmount={amount}
        onSelect={onSelectSuggestedAmount}
      />

      {amountHelper ? (
        <Text
          style={[typography.caption, styles.helper, { color: theme.colors.textMuted }]}
        >
          {amountHelper}
        </Text>
      ) : null}

      <CategoryPickerGrid
        categories={rankedCategories}
        selectedCategoryId={selectedCategoryId}
        onSelect={onSelectCategory}
        onSeeAll={() => allCategoriesRef.current?.present()}
      />

      <DescriptionRow
        description={description}
        onChange={onDescriptionChange}
        quickSuggestions={quickDescriptionSuggestions}
        onSelectSuggestion={onSelectDescriptionSuggestion}
      />

      {submitErrorMessage ? (
        <Text
          style={[typography.caption, styles.error, { color: theme.colors.danger }]}
        >
          {submitErrorMessage}
        </Text>
      ) : null}

      <StickyFooter>
        <AppButton
          label="Guardar gasto"
          variant="primary"
          loading={isBusy}
          disabled={!hasValidAmount || !selectedCategoryId}
          onPress={onSubmit}
        />
      </StickyFooter>

      <InAppNumpad
        ref={numpadRef}
        rawValue={rawPrice}
        onChangeRawValue={onRawPriceChange}
      />

      <AllCategoriesSheet
        ref={allCategoriesRef}
        categories={rankedCategories}
        selectedCategoryId={selectedCategoryId}
        onSelect={onSelectCategory}
        onCreateNew={onCreateCategory}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
    paddingBottom: 88, // leave room for the sticky footer
  },
  helper: {
    paddingHorizontal: 4,
  },
  error: {
    paddingHorizontal: 4,
  },
})
```

- [ ] **Step 5: Typecheck + test + commit**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
git add mobile/features/expenses/use-add-expense-controller.ts mobile/components/home/add-expense-dashboard.tsx
git commit -m "feat(home): add AddExpenseDashboard orchestrator + controller refactor"
```

---

## Task 9: Screen swap + delete legacy

**Files:**
- Modify: `mobile/screens/home/add-expense-screen.tsx`
- Delete: `mobile/components/home/add-expense-form.tsx`

- [ ] **Step 1: Rewrite `add-expense-screen.tsx`**

Replace the full contents with:

```tsx
import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { AddExpenseDashboard } from '@/components/home/add-expense-dashboard'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { Screen } from '@/components/ui/screen'
import { useAddExpenseController } from '@/features/expenses/use-add-expense-controller'
import { errorMessages } from '@/lib/copy/states'
import { buildScreenHeaderPalette } from '@/theme/screen-header'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface AddExpenseScreenProps {
  familyId: string
  userId: string
}

export function AddExpenseScreen({ familyId, userId }: AddExpenseScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const controller = useAddExpenseController({
    familyId,
    onCreated: () => {
      router.back()
    },
    userId,
  })

  const headerPalette = buildScreenHeaderPalette(theme)
  const categoriesLoadError = controller.categoriesQuery.error
  const shouldShowErrorState = Boolean(
    categoriesLoadError && !controller.categoriesQuery.data,
  )
  const hasNoCategories =
    !controller.categoriesQuery.isLoading && controller.categories.length === 0

  return (
    <Screen
      canGoBack
      contentContainerStyle={styles.screenContent}
      rightSlot={
        <View style={styles.headerActions}>
          <IconButton
            accessibilityLabel="Ver historial"
            backgroundColor={headerPalette.buttonBackgroundColor}
            borderColor={headerPalette.buttonBorderColor}
            icon="receipt-long"
            iconColor={headerPalette.iconColor}
            symbolName="clock.arrow.circlepath"
            onPress={() => router.push('/(app)/expenses-history')}
          />
        </View>
      }
      title="Agregar"
      titleColor={headerPalette.titleColor}
    >
      {!theme.isDark ? <AmbientBackdrop variant="form" /> : null}

      {shouldShowErrorState ? (
        <ErrorState
          description={getErrorMessage(categoriesLoadError, errorMessages.server)}
          title="No pudimos abrir el formulario"
          onAction={() => {
            void controller.categoriesQuery.refetch()
          }}
        />
      ) : hasNoCategories ? (
        <EmptyState
          stateKey="categories"
          icon="category"
          action={{
            label: 'Crear categoría',
            onPress: () => router.push('/(app)/(tabs)/expenses'),
          }}
        />
      ) : (
        <AddExpenseDashboard
          amount={controller.amount}
          hasValidAmount={controller.hasValidAmount}
          amountHelper={controller.amountHelper}
          rawPrice={controller.rawPrice}
          rankedCategories={controller.rankedCategories}
          selectedCategoryId={controller.selectedCategoryId}
          suggestedAmounts={controller.suggestedAmounts}
          quickDescriptionSuggestions={controller.quickDescriptionSuggestions}
          description={controller.description}
          isBusy={controller.createExpenseMutation.isPending}
          onRawPriceChange={controller.actions.setRawPrice}
          onSelectSuggestedAmount={controller.actions.setSuggestedAmount}
          onSelectCategory={controller.actions.selectCategory}
          onSelectDescriptionSuggestion={controller.actions.useQuickDescription}
          onDescriptionChange={controller.actions.setDescription}
          onSubmit={controller.submitExpense}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
})
```

- [ ] **Step 2: Delete legacy file**

```bash
rm mobile/components/home/add-expense-form.tsx
```

- [ ] **Step 3: Grep for stragglers**

```bash
grep -rn "AddExpenseForm\|add-expense-form" mobile/ app/ --include="*.tsx" --include="*.ts"
```

Expected: no results.

- [ ] **Step 4: Typecheck + test + lint**

```bash
./scripts/npmw run typecheck
./scripts/npmw run lint mobile/screens/home/add-expense-screen.tsx mobile/components/home/add-expense-dashboard.tsx
./scripts/npmw run test
```

Expected: typecheck clean, tests pass, no new lint errors.

- [ ] **Step 5: Commit**

```bash
git add -A mobile/screens/home/add-expense-screen.tsx mobile/components/home/add-expense-form.tsx
git commit -m "refactor(home): swap AddExpenseForm for new AddExpenseDashboard"
```

---

## Task 10: Export `InAppNumpad` from `ui/index.ts` + final validate

- [ ] **Step 1: Update the barrel**

Open `mobile/components/ui/index.ts` and append:

```ts
export { InAppNumpad, type InAppNumpadHandle } from './in-app-numpad'
```

- [ ] **Step 2: Full validate**

```bash
./scripts/npmw run validate
```

Expected: typecheck green, tests green (currently 84; +2 test files here should bring this close to ~100 — verify the exact count). Guards green. Lint at same state as pre-Add-expense (1 pre-existing error unrelated).

- [ ] **Step 3: Commit**

```bash
git add mobile/components/ui/index.ts
git commit -m "feat(ui): export InAppNumpad from ui barrel"
```

---

## Out of scope / deferred

- Batch-add flow.
- Voice / receipt capture.
- Split between members.
- Preview of available balance inside the Add screen.
- Alert dialogs replaced by inline validation UX — current code alerted on missing category / description; new disabled-button approach plus inline error strip for server failures covers everything per spec §4.4.

## Exit criteria

- Typecheck clean, tests green (≥ 96), guards green.
- New Add screen: AmountCard + SuggestedAmountStrip + CategoryPickerGrid + DescriptionRow + StickyFooter + InAppNumpad.
- Submit lands user on Home via `router.back()` with haptic success.
- Legacy `add-expense-form.tsx` deleted; no references remain.
- `add-expense-screen.tsx` ≤ 120 lines.
- `InAppNumpad` exported for future consumers.
