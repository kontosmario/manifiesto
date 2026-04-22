# Home Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use `- [ ]`.

**Goal:** Redesign the Home (Inicio) screen using Foundation v2 primitives — H2 layout (greeting → hero + CTA → metric strip → activity), `<AnimatedAmount>` on the hero value, `<PaydayChip>` with `<BottomSheet>` confirmation, `<SwipeableRow>` + `<CategoryBadge>` for recent expenses, split of the 350-line `<HomeOverviewCard>` into 6 focused files.

**Architecture:** Thin screen file orchestrates `<HomeDashboard>`, which composes 4 blocks (`<PaydayChip>`, `<HomeHeroCard>`, `<HomeMetricStrip>`, `<HomeActivitySection>`). Pure derivations (error classification, payday detection, metric extraction) live in `mobile/features/home/home-dashboard-model.ts` and are unit-tested via vitest. All motion / haptics / tokens come from Foundation (no new deps, no new primitives).

**Tech Stack:** TypeScript, Vitest (Node), React Native, Reanimated 4, `@gorhom/bottom-sheet`, Expo Router, TanStack Query.

**Reference spec:** [docs/superpowers/specs/2026-04-21-home-screen-design.md](../specs/2026-04-21-home-screen-design.md).

**Test commands:** `./scripts/npmw run test | typecheck | lint | validate`.

---

## File plan

### New files

| Path | Responsibility |
|---|---|
| `mobile/features/home/home-dashboard-model.ts` | Pure derivations: classifyDashboardError, isPaydayPending, daysUntilPayday, buildHomeMetrics |
| `tests/unit/home-dashboard-model.test.ts` | Vitest specs for pure derivations |
| `mobile/components/home/home-hero-card.tsx` | brand.deep bg + AnimatedAmount + accent CTA |
| `mobile/components/home/home-metric-strip.tsx` | 2 cards (Ahorro / Fijos) with staggered entry |
| `mobile/components/home/payday-chip.tsx` | Default / pending state chip + haptic + onPress |
| `mobile/components/home/confirm-salary-sheet.tsx` | BottomSheet content for salary confirmation |
| `mobile/components/home/home-activity-section.tsx` | SwipeableRow + CategoryBadge list + empty/error |
| `mobile/components/home/home-dashboard.tsx` | Orchestrator replacing HomeOverviewCard + HomeActivityCard |

### Modified files

| Path | Change |
|---|---|
| `mobile/screens/home/home-screen.tsx` | Trimmed to delegate to HomeDashboard; uses model helpers |

### Deleted files

| Path | Why |
|---|---|
| `mobile/components/home/home-overview-card.tsx` | Replaced by home-dashboard.tsx + split children |
| `mobile/components/home/home-activity-card.tsx` | Replaced by home-activity-section.tsx |

---

## Task 1: Pure dashboard model

**Files:**
- Create: `mobile/features/home/home-dashboard-model.ts`
- Create: `tests/unit/home-dashboard-model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/home-dashboard-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  classifyDashboardError,
  daysUntilPayday,
  isPaydayPending,
} from '@/features/home/home-dashboard-model'

describe('classifyDashboardError', () => {
  it('returns "network" for fetch abort and TypeError', () => {
    expect(classifyDashboardError({ name: 'AbortError' })).toBe('network')
    expect(classifyDashboardError(new TypeError('Failed to fetch'))).toBe('network')
    expect(classifyDashboardError({ message: 'Network request failed' })).toBe('network')
  })

  it('returns "server" for HTTP error responses', () => {
    expect(classifyDashboardError({ status: 500 })).toBe('server')
    expect(classifyDashboardError({ status: 503 })).toBe('server')
    expect(classifyDashboardError({ code: 'PGRST301' })).toBe('server')
  })

  it('returns "unknown" for undefined or unrecognized shapes', () => {
    expect(classifyDashboardError(null)).toBe('unknown')
    expect(classifyDashboardError({})).toBe('unknown')
    expect(classifyDashboardError(new Error('something weird'))).toBe('unknown')
  })
})

describe('daysUntilPayday', () => {
  const today = new Date('2026-04-20T12:00:00Z')

  it('returns 0 when payday is today', () => {
    expect(daysUntilPayday({ paymentDay: 20 }, today)).toBe(0)
  })

  it('returns N days until next payday in same month', () => {
    expect(daysUntilPayday({ paymentDay: 25 }, today)).toBe(5)
  })

  it('wraps to next month when payday already passed', () => {
    // April has 30 days. paymentDay=10 → next is May 10 → 20 days away
    expect(daysUntilPayday({ paymentDay: 10 }, today)).toBe(20)
  })

  it('returns null when no payday configured', () => {
    expect(daysUntilPayday({ paymentDay: null }, today)).toBeNull()
  })
})

describe('isPaydayPending', () => {
  const today = new Date('2026-04-20T12:00:00Z')

  it('returns true when today is payday and last confirmation predates it', () => {
    expect(
      isPaydayPending(
        {
          paymentDay: 20,
          lastConfirmedAt: new Date('2026-03-20T12:00:00Z').toISOString(),
        },
        today,
      ),
    ).toBe(true)
  })

  it('returns false when last confirmation is today or after this payday', () => {
    expect(
      isPaydayPending(
        {
          paymentDay: 20,
          lastConfirmedAt: new Date('2026-04-20T09:00:00Z').toISOString(),
        },
        today,
      ),
    ).toBe(false)
  })

  it('returns false when payday has not been reached this cycle', () => {
    // today = April 20; payday = April 25 → not reached yet
    expect(
      isPaydayPending(
        {
          paymentDay: 25,
          lastConfirmedAt: null,
        },
        today,
      ),
    ).toBe(false)
  })

  it('returns false when no payday configured', () => {
    expect(
      isPaydayPending({ paymentDay: null, lastConfirmedAt: null }, today),
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/npmw run test -- tests/unit/home-dashboard-model.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the model**

Create `mobile/features/home/home-dashboard-model.ts`:

```ts
/**
 * Pure derivations used by the Home screen. No React, no side effects.
 */

export type DashboardErrorKind = 'network' | 'server' | 'unknown'

export function classifyDashboardError(error: unknown): DashboardErrorKind {
  if (!error || typeof error !== 'object') return 'unknown'
  const maybe = error as {
    name?: unknown
    message?: unknown
    status?: unknown
    code?: unknown
  }

  if (maybe.name === 'AbortError') return 'network'
  if (error instanceof TypeError) return 'network'
  if (typeof maybe.message === 'string' && /network|fetch|offline/i.test(maybe.message)) {
    return 'network'
  }

  if (typeof maybe.status === 'number' && maybe.status >= 500) return 'server'
  if (typeof maybe.status === 'number' && maybe.status >= 400) return 'server'
  if (typeof maybe.code === 'string' && maybe.code.startsWith('PGRST')) return 'server'

  return 'unknown'
}

interface PaydayInput {
  paymentDay: number | null
}

export function daysUntilPayday(input: PaydayInput, today: Date): number | null {
  if (input.paymentDay == null) return null
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const thisMonthPayday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), input.paymentDay))
  let target = thisMonthPayday
  if (thisMonthPayday.getTime() < utcToday.getTime()) {
    target = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, input.paymentDay))
  }
  const diffMs = target.getTime() - utcToday.getTime()
  return Math.round(diffMs / 86_400_000)
}

interface PaydayPendingInput {
  paymentDay: number | null
  lastConfirmedAt: string | null
}

export function isPaydayPending(input: PaydayPendingInput, today: Date): boolean {
  if (input.paymentDay == null) return false

  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const thisMonthPayday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), input.paymentDay))

  if (thisMonthPayday.getTime() > utcToday.getTime()) {
    // payday hasn't happened this month yet
    return false
  }

  if (!input.lastConfirmedAt) return true

  const lastConfirmedMs = new Date(input.lastConfirmedAt).getTime()
  return lastConfirmedMs < thisMonthPayday.getTime()
}

interface DashboardSnapshotLike {
  totalAvailable?: number
  savingsRemaining?: number
  fixedExpensesMonthlyTotal?: number
  monthlyIncome?: number
  savingsGoal?: number
}

export interface HomeMetrics {
  availableToday: number
  savedAmount: number
  fixedAmount: number
  projectedMargin: number
}

export function buildHomeMetrics(snapshot: DashboardSnapshotLike): HomeMetrics {
  const availableToday = snapshot.totalAvailable ?? 0
  const savedAmount = snapshot.savingsRemaining ?? 0
  const fixedAmount = snapshot.fixedExpensesMonthlyTotal ?? 0
  const projectedMargin = availableToday - (snapshot.savingsGoal ?? 0)
  return { availableToday, savedAmount, fixedAmount, projectedMargin }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/npmw run test -- tests/unit/home-dashboard-model.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Typecheck + commit**

```bash
./scripts/npmw run typecheck
git add mobile/features/home/home-dashboard-model.ts tests/unit/home-dashboard-model.test.ts
git commit -m "feat(home): add pure dashboard model (error classify, payday pending, metrics)"
```

---

## Task 2: `<HomeHeroCard>`

**File:** `mobile/components/home/home-hero-card.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { StyleSheet, Text, View } from 'react-native'
import { AnimatedAmount } from '@/components/ui/animated-amount'
import { AppButton } from '@/components/ui/button'
import { terms } from '@/lib/copy/glossary'
import { brand, radii } from '@/theme/palette'
import { typography } from '@/theme/typography'

interface HomeHeroCardProps {
  availableToday: number
  projectedMargin: number
  onPressAddExpense: () => void
}

export function HomeHeroCard({
  availableToday,
  projectedMargin,
  onPressAddExpense,
}: HomeHeroCardProps) {
  const marginSign = projectedMargin >= 0 ? '+' : ''
  const marginText = `${marginSign}$${Math.abs(Math.round(projectedMargin)).toLocaleString('es-AR')}`

  return (
    <View style={styles.card}>
      <Text style={[typography.eyebrow, styles.eyebrow]}>Disponible hoy</Text>
      <AnimatedAmount
        value={availableToday}
        variant="hero"
        hapticOnChange
        color="#FFFFFF"
        style={styles.value}
      />
      <Text style={[typography.bodySmall, styles.context]}>
        {terms.margin} del mes{' '}
        <Text style={[styles.contextEmphasis, { color: brand.bright }]}>{marginText}</Text>
      </Text>
      <View style={styles.ctaRow}>
        <AppButton
          variant="accent"
          label="＋ Registrar gasto"
          size="compact"
          fullWidth={false}
          onPress={onPressAddExpense}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: brand.deep,
    borderRadius: radii['2xl'],
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: brand.deep,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 4,
  },
  eyebrow: {
    color: brand.bright,
  },
  value: {
    marginTop: 4,
    color: '#FFFFFF',
  },
  context: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.7)',
  },
  contextEmphasis: {
    fontWeight: '700',
  },
  ctaRow: {
    marginTop: 16,
  },
})
```

- [ ] **Step 2: Typecheck + test**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

- [ ] **Step 3: Commit**

```bash
git add mobile/components/home/home-hero-card.tsx
git commit -m "feat(home): add HomeHeroCard with AnimatedAmount + accent CTA"
```

---

## Task 3: `<HomeMetricStrip>`

**File:** `mobile/components/home/home-metric-strip.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated'
import { AnimatedAmount } from '@/components/ui/animated-amount'
import { motionDurations, motionSprings, motionStagger } from '@/lib/motion'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface HomeMetricStripProps {
  savedAmount: number
  fixedAmount: number
}

export function HomeMetricStrip({ savedAmount, fixedAmount }: HomeMetricStripProps) {
  return (
    <View style={styles.row}>
      <MetricCard index={0} label="Ahorro" sublabel="del mes" value={savedAmount} />
      <MetricCard index={1} label="Fijos" sublabel="del mes" value={fixedAmount} />
    </View>
  )
}

function MetricCard({
  index,
  label,
  sublabel,
  value,
}: {
  index: number
  label: string
  sublabel: string
  value: number
}) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const opacity = useSharedValue(reduceMotion ? 1 : 0)
  const translateY = useSharedValue(reduceMotion ? 0 : 6)

  useEffect(() => {
    if (reduceMotion) return
    const delay = index * motionStagger.listItem
    opacity.value = withDelay(delay, withTiming(1, { duration: motionDurations.standard }))
    translateY.value = withDelay(delay, withSpring(0, motionSprings.enter))
  }, [index, reduceMotion, opacity, translateY])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }))

  return (
    <Animated.View
      accessible
      accessibilityLabel={`${label}: $${Math.round(value).toLocaleString('es-AR')} ${sublabel}`}
      style={[
        styles.card,
        animatedStyle,
        {
          backgroundColor: theme.colors.surface,
          shadowColor: '#000',
        },
      ]}
    >
      <Text style={[typography.fieldLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <AnimatedAmount value={value} variant="metricValue" style={styles.value} />
      <Text style={[typography.caption, { color: theme.colors.textSoft }]}>{sublabel}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    padding: 16,
    borderRadius: radii.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  value: {
    marginTop: 2,
  },
})
```

- [ ] **Step 2: Typecheck + test**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

- [ ] **Step 3: Commit**

```bash
git add mobile/components/home/home-metric-strip.tsx
git commit -m "feat(home): add HomeMetricStrip with staggered entry animation"
```

---

## Task 4: `<PaydayChip>`

**File:** `mobile/components/home/payday-chip.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated'
import { AppSymbol } from '@/components/ui/app-symbol'
import { triggerHaptic } from '@/lib/haptics'
import { motionSprings } from '@/lib/motion'
import { brand, radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface PaydayChipProps {
  daysUntilPayday: number | null
  isPending: boolean
  onPressConfirm: () => void
}

export function PaydayChip({ daysUntilPayday, isPending, onPressConfirm }: PaydayChipProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const emphasis = useSharedValue(isPending ? 1 : 0)

  useEffect(() => {
    if (reduceMotion) {
      emphasis.value = isPending ? 1 : 0
      return
    }
    emphasis.value = withSpring(isPending ? 1 : 0, motionSprings.celebrate)
  }, [isPending, reduceMotion, emphasis])

  const wrapperStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  if (daysUntilPayday == null && !isPending) return null

  if (isPending) {
    return (
      <Animated.View style={wrapperStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Confirmar cobro del día"
          accessibilityHint="Abre una hoja para confirmar el cobro de este ciclo"
          onPressIn={() => {
            if (reduceMotion) return
            scale.value = withSpring(0.97, motionSprings.press)
          }}
          onPressOut={() => {
            scale.value = withSpring(1, motionSprings.press)
          }}
          onPress={() => {
            void triggerHaptic('light')
            onPressConfirm()
          }}
          style={[
            styles.chip,
            {
              backgroundColor: brand.bright,
              borderColor: brand.bright,
            },
          ]}
        >
          <AppSymbol name="clock.badge.checkmark.fill" fallback="check-circle" size={14} color={brand.deep} />
          <Text style={[typography.buttonCompact, styles.label, { color: brand.deep }]}>
            Llegó tu cobro · Confirmar
          </Text>
        </Pressable>
      </Animated.View>
    )
  }

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        daysUntilPayday === 0
          ? 'Hoy es tu día de cobro'
          : `Tu próximo cobro es en ${daysUntilPayday} día${daysUntilPayday === 1 ? '' : 's'}`
      }
      style={[
        styles.chip,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <AppSymbol name="clock.fill" fallback="schedule" size={14} color={theme.colors.textMuted} />
      <Text style={[typography.buttonCompact, styles.label, { color: theme.colors.textMuted }]}>
        {daysUntilPayday === 0
          ? 'Cobro hoy'
          : `Cobro en ${daysUntilPayday} día${daysUntilPayday === 1 ? '' : 's'}`}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
    minHeight: 32,
  },
  label: {
    lineHeight: 16,
  },
})
```

Note: `emphasis` shared value is reserved for future visual differentiation (e.g. subtle scale pulse). For now it tracks the pending state without visual effect — leave the infrastructure in place rather than deleting it, as it documents the intent.

- [ ] **Step 2: Typecheck + test**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

- [ ] **Step 3: Commit**

```bash
git add mobile/components/home/payday-chip.tsx
git commit -m "feat(home): add PaydayChip with default + pending states"
```

---

## Task 5: `<ConfirmSalarySheet>`

**File:** `mobile/components/home/confirm-salary-sheet.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { BottomSheet, type BottomSheetHandle } from '@/components/ui/bottom-sheet'
import { AppButton } from '@/components/ui/button'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface ConfirmSalarySheetProps {
  isSaving: boolean
  errorMessage?: string | null
  onConfirm: () => void
}

export const ConfirmSalarySheet = forwardRef<BottomSheetHandle, ConfirmSalarySheetProps>(
  function ConfirmSalarySheet({ isSaving, errorMessage, onConfirm }, ref) {
    const { theme } = useAppTheme()
    const sheetRef = useRef<BottomSheetHandle>(null)

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
      snapTo: (index: number) => sheetRef.current?.snapTo(index),
    }), [])

    return (
      <BottomSheet ref={sheetRef} snapPoints={['40%']}>
        <View style={styles.content}>
          <Text style={[typography.sectionTitle, { color: theme.colors.text }]}>
            ¿Todo ok con este cobro?
          </Text>
          <Text style={[typography.body, styles.description, { color: theme.colors.textMuted }]}>
            Al confirmar, arrancamos un nuevo ciclo con tu ingreso base. Si recibiste un extra
            o algo distinto, podés ajustarlo en Ajustes luego.
          </Text>
          {errorMessage ? (
            <Text style={[typography.caption, styles.error, { color: theme.colors.danger }]}>
              {errorMessage}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <AppButton
              variant="primary"
              label="Sí, confirmar cobro"
              loading={isSaving}
              onPress={onConfirm}
            />
            <AppButton
              variant="ghost"
              label="Más tarde"
              onPress={() => sheetRef.current?.dismiss()}
            />
          </View>
        </View>
      </BottomSheet>
    )
  },
)

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
    gap: 12,
  },
  description: {
    lineHeight: 20,
  },
  error: {
    marginTop: 4,
  },
  actions: {
    gap: 10,
    marginTop: 8,
  },
})
```

- [ ] **Step 2: Typecheck + test**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

- [ ] **Step 3: Commit**

```bash
git add mobile/components/home/confirm-salary-sheet.tsx
git commit -m "feat(home): add ConfirmSalarySheet bottom sheet content"
```

---

## Task 6: `<HomeActivitySection>`

**File:** `mobile/components/home/home-activity-section.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { StyleSheet, Text, View, Pressable } from 'react-native'
import { CategoryBadge } from '@/components/ui/category-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { ListRowSkeleton } from '@/components/ui/skeleton-layouts'
import { SwipeableRow, type SwipeAction } from '@/components/ui/swipeable-row'
import { errorMessages } from '@/lib/copy/states'
import { type DashboardErrorKind } from '@/features/home/home-dashboard-model'
import type { Expense } from '@/features/expenses/use-expenses'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface HomeActivitySectionProps {
  expenses: Expense[]
  categoryNameById: Map<string, string>
  isLoading: boolean
  errorKind?: DashboardErrorKind
  onDelete: (expenseId: string) => void
  onRetry: () => void
  onViewAll: () => void
  onAddFirst: () => void
}

export function HomeActivitySection({
  expenses,
  categoryNameById,
  isLoading,
  errorKind,
  onDelete,
  onRetry,
  onViewAll,
  onAddFirst,
}: HomeActivitySectionProps) {
  const { theme } = useAppTheme()

  return (
    <View>
      <View style={styles.header}>
        <Text style={[typography.eyebrow, { color: theme.colors.textMuted }]}>Reciente</Text>
        {expenses.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver todo el historial"
            onPress={onViewAll}
            hitSlop={10}
          >
            <Text style={[typography.buttonCompact, { color: theme.colors.primaryStrong }]}>
              Ver todos
            </Text>
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.listContainer}>
          <ListRowSkeleton rows={3} />
        </View>
      ) : errorKind ? (
        <ErrorState
          description={errorKind === 'network' ? errorMessages.network : errorMessages.server}
          onAction={onRetry}
        />
      ) : expenses.length === 0 ? (
        <EmptyState
          icon="receipt-long"
          stateKey="expensesThisCycle"
          action={{ label: 'Registrar primer gasto', onPress: onAddFirst }}
        />
      ) : (
        <View
          style={[
            styles.listContainer,
            {
              backgroundColor: theme.colors.surface,
              shadowColor: '#000',
            },
          ]}
        >
          {expenses.map((expense, index) => {
            const categoryName = expense.category_id
              ? categoryNameById.get(expense.category_id) ?? 'Sin categoría'
              : 'Sin categoría'
            const dangerAction: SwipeAction = {
              label: 'Eliminar',
              tone: 'danger',
              onPress: () => onDelete(expense.id),
            }
            return (
              <SwipeableRow
                key={expense.id}
                accessibilityHint="Desliza hacia la izquierda para eliminar"
                rightActions={[dangerAction]}
              >
                <View
                  style={[
                    styles.row,
                    index < expenses.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: theme.colors.border,
                    },
                  ]}
                >
                  <CategoryBadge
                    categoryId={expense.category_id ?? 'otros'}
                    size="md"
                    tone="soft"
                  />
                  <View style={styles.rowBody}>
                    <Text
                      style={[typography.bodyEmphasis, { color: theme.colors.text }]}
                      numberOfLines={1}
                    >
                      {expense.description || categoryName}
                    </Text>
                    <Text
                      style={[typography.caption, { color: theme.colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {categoryName}
                    </Text>
                  </View>
                  <Text
                    style={[typography.bodyEmphasis, { color: theme.colors.text }]}
                    accessibilityLabel={`Monto: $${Math.round(Number(expense.amount ?? 0)).toLocaleString('es-AR')}`}
                  >
                    -${Math.round(Math.abs(Number(expense.amount ?? 0))).toLocaleString('es-AR')}
                  </Text>
                </View>
              </SwipeableRow>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingBottom: 10,
  },
  listContainer: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
})
```

**Note on `Expense` shape:** verify the actual property names in `mobile/features/expenses/use-expenses.ts` before running — adapt if fields differ (e.g., `description` might be `note`, `amount` might be typed differently). If the real shape uses different names, update the accessors here to match.

- [ ] **Step 2: Typecheck + test**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

If typecheck fails on `Expense` fields, open `mobile/features/expenses/use-expenses.ts`, read the exported `Expense` type, and correct the accessors in the component to match.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/home/home-activity-section.tsx
git commit -m "feat(home): add HomeActivitySection with SwipeableRow + CategoryBadge"
```

---

## Task 7: `<HomeDashboard>` orchestrator

**File:** `mobile/components/home/home-dashboard.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useMemo, useRef, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { type BottomSheetHandle } from '@/components/ui/bottom-sheet'
import { ConfirmSalarySheet } from '@/components/home/confirm-salary-sheet'
import { HomeActivitySection } from '@/components/home/home-activity-section'
import { HomeHeroCard } from '@/components/home/home-hero-card'
import { HomeMetricStrip } from '@/components/home/home-metric-strip'
import { PaydayChip } from '@/components/home/payday-chip'
import type { Expense } from '@/features/expenses/use-expenses'
import {
  buildHomeMetrics,
  classifyDashboardError,
  daysUntilPayday,
  isPaydayPending,
  type DashboardErrorKind,
} from '@/features/home/home-dashboard-model'
import type { FamilyDashboard } from '@/hooks/use-family-dashboard'
import { triggerHaptic } from '@/lib/haptics'

interface HomeDashboardProps {
  dashboard: FamilyDashboard
  recentExpenses: Expense[]
  categoryNameById: Map<string, string>
  isLoadingActivity: boolean
  activityError: unknown
  onConfirmSalary: () => void
  onDeleteExpense: (expenseId: string) => void
  isSavingSalary: boolean
  salaryErrorMessage: string | null
}

export function HomeDashboard({
  dashboard,
  recentExpenses,
  categoryNameById,
  isLoadingActivity,
  activityError,
  onConfirmSalary,
  onDeleteExpense,
  isSavingSalary,
  salaryErrorMessage,
}: HomeDashboardProps) {
  const router = useRouter()
  const sheetRef = useRef<BottomSheetHandle>(null)
  const [today] = useState(() => new Date())

  const paymentDay = dashboard.familyFinanceQuery.data?.salary_payment_day ?? null
  const lastConfirmedAt = dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null
  const pending = useMemo(
    () => isPaydayPending({ paymentDay, lastConfirmedAt }, today),
    [paymentDay, lastConfirmedAt, today],
  )
  const days = useMemo(() => daysUntilPayday({ paymentDay }, today), [paymentDay, today])

  const metrics = useMemo(() => buildHomeMetrics(dashboard), [dashboard])

  const activityErrorKind: DashboardErrorKind | undefined = activityError
    ? classifyDashboardError(activityError)
    : undefined

  const handleChipConfirm = () => {
    sheetRef.current?.present()
  }

  const handleSheetConfirm = () => {
    onConfirmSalary()
  }

  const handleAddExpense = () => {
    void triggerHaptic('light')
    router.push('/(app)/(tabs)/add')
  }

  const handleViewAll = () => {
    router.push('/(app)/(tabs)/expenses')
  }

  return (
    <View style={styles.stack}>
      <PaydayChip daysUntilPayday={days} isPending={pending} onPressConfirm={handleChipConfirm} />

      <HomeHeroCard
        availableToday={metrics.availableToday}
        projectedMargin={metrics.projectedMargin}
        onPressAddExpense={handleAddExpense}
      />

      <HomeMetricStrip savedAmount={metrics.savedAmount} fixedAmount={metrics.fixedAmount} />

      <HomeActivitySection
        expenses={recentExpenses}
        categoryNameById={categoryNameById}
        isLoading={isLoadingActivity}
        errorKind={activityErrorKind}
        onDelete={onDeleteExpense}
        onRetry={() => {
          void dashboard.refetchAll()
        }}
        onViewAll={handleViewAll}
        onAddFirst={handleAddExpense}
      />

      <ConfirmSalarySheet
        ref={sheetRef}
        isSaving={isSavingSalary}
        errorMessage={salaryErrorMessage}
        onConfirm={handleSheetConfirm}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: 24,
  },
})
```

- [ ] **Step 2: Typecheck + test**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
```

If typecheck fails because `FamilyDashboard` doesn't expose `savingsRemaining`, `fixedExpensesMonthlyTotal`, or `totalAvailable` directly (it should — `buildFamilyDashboardSnapshot` returns them and they're spread via `...snapshot` in `useFamilyDashboard`), confirm by reading `mobile/features/family/family-dashboard-model.ts` and adjust the property names in `buildHomeMetrics` (Task 1) accordingly.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/home/home-dashboard.tsx
git commit -m "feat(home): add HomeDashboard orchestrator"
```

---

## Task 8: Refactor `home-screen.tsx` + delete legacy files

**Files:**
- Modify: `mobile/screens/home/home-screen.tsx`
- Delete: `mobile/components/home/home-overview-card.tsx`
- Delete: `mobile/components/home/home-activity-card.tsx`

- [ ] **Step 1: Rewrite `home-screen.tsx`**

Replace the contents of `mobile/screens/home/home-screen.tsx` with:

```tsx
import { useMemo, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { HomeDashboard } from '@/components/home/home-dashboard'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { Screen } from '@/components/ui/screen'
import { useCategories } from '@/features/categories/use-categories'
import { useDeleteExpense, useRecentExpenses } from '@/features/expenses/use-expenses'
import {
  buildSalaryConfirmationInput,
  useUpsertFamilyFinance,
} from '@/features/finance/use-family-finance'
import { useMyProfile } from '@/features/profile/use-profile'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { errorMessages } from '@/lib/copy/states'
import { triggerHaptic } from '@/lib/haptics'
import { buildScreenHeaderPalette } from '@/theme/screen-header'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface HomeScreenProps {
  userId: string
  familyId: string
}

export function HomeScreen({ userId, familyId }: HomeScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const [salaryErrorMessage, setSalaryErrorMessage] = useState<string | null>(null)

  const { data: profile } = useMyProfile(userId)
  const displayName = profile?.display_name ?? 'Usuario'
  const dashboard = useFamilyDashboard(familyId)
  const categoriesQuery = useCategories(familyId)
  const recentExpensesQuery = useRecentExpenses(familyId, 3)
  const upsertFamilyFinanceMutation = useUpsertFamilyFinance(familyId)
  const deleteExpenseMutation = useDeleteExpense(familyId)

  const categoryNameById = useMemo(
    () =>
      new Map(
        (categoriesQuery.data ?? []).map((category) => [category.id, category.name] as const),
      ),
    [categoriesQuery.data],
  )
  const recentExpenses = recentExpensesQuery.data ?? []
  const headerPalette = buildScreenHeaderPalette(theme)

  const shouldShowDashboardError =
    (dashboard.familyFinanceQuery.error && !dashboard.familyFinanceQuery.data) ||
    (dashboard.fixedExpensesQuery.error && !dashboard.fixedExpensesQuery.data) ||
    (dashboard.expensesQuery.error && !dashboard.expensesQuery.data)

  const activityError =
    recentExpensesQuery.isError && recentExpenses.length === 0
      ? recentExpensesQuery.error
      : categoriesQuery.isError && recentExpenses.length === 0
        ? categoriesQuery.error
        : undefined

  const confirmSalary = () => {
    setSalaryErrorMessage(null)
    upsertFamilyFinanceMutation.mutate(
      buildSalaryConfirmationInput({
        dailyBudgetBufferMode: dashboard.dailyBudgetBufferMode,
        dailyBudgetBufferValue: dashboard.dailyBudgetBufferValue,
        dailyBudgetCheckinHour: dashboard.dailyBudgetCheckinHour,
        dailyBudgetNudgesEnabled: dashboard.dailyBudgetNudgesEnabled,
        essentialMonthlyCost:
          dashboard.familyFinanceQuery.data?.essential_monthly_cost ?? 0,
        monthlyIncome: dashboard.monthlyIncome,
        savingsGoal: dashboard.savingsGoal,
        savingsGoalPercent:
          dashboard.familyFinanceQuery.data?.savings_goal_percent ?? 20,
        usdExchangeRate: dashboard.usdExchangeRate,
        salaryPaymentDay: dashboard.salaryPaymentDay,
        lastSalaryConfirmedAt:
          dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null,
      }),
      {
        onError: (error: unknown) => {
          setSalaryErrorMessage(getErrorMessage(error, errorMessages.server))
          void triggerHaptic('error')
        },
        onSuccess: () => {
          void triggerHaptic('success')
        },
      },
    )
  }

  const handleDeleteExpense = (expenseId: string) => {
    void triggerHaptic('warning')
    deleteExpenseMutation.mutate(expenseId, {
      onError: (error: unknown) => {
        void triggerHaptic('error')
        Alert.alert(
          'No pudimos eliminar',
          getErrorMessage(error, errorMessages.server),
        )
      },
      onSuccess: () => {
        void triggerHaptic('success')
      },
    })
  }

  return (
    <Screen
      contentContainerStyle={styles.screenContent}
      rightSlot={
        <View style={styles.headerActions}>
          <IconButton
            accessibilityLabel="Ir a notificaciones"
            icon="notifications-none"
            backgroundColor={headerPalette.buttonBackgroundColor}
            badgeColor={theme.colors.danger}
            borderColor={headerPalette.buttonBorderColor}
            iconColor={headerPalette.iconColor}
            showBadge
            symbolName="bell"
            onPress={() => router.push('/(app)/notifications')}
          />
          <IconButton
            accessibilityLabel="Ir a ajustes"
            icon="tune"
            backgroundColor={headerPalette.buttonBackgroundColor}
            borderColor={headerPalette.buttonBorderColor}
            iconColor={headerPalette.iconColor}
            symbolName="slider.horizontal.3"
            onPress={() => router.push('/(app)/settings')}
          />
        </View>
      }
      titleColor={headerPalette.titleColor}
      title={`Hola, ${displayName}`}
    >
      {!theme.isDark ? <AmbientBackdrop variant="home" /> : null}

      {shouldShowDashboardError ? (
        <ErrorState
          description={getErrorMessage(
            dashboard.dashboardError,
            errorMessages.server,
          )}
          title="No pudimos abrir tu panorama"
          onAction={() => {
            void dashboard.refetchAll()
          }}
        />
      ) : (
        <HomeDashboard
          dashboard={dashboard}
          recentExpenses={recentExpenses}
          categoryNameById={categoryNameById}
          isLoadingActivity={recentExpensesQuery.isLoading}
          activityError={activityError}
          onConfirmSalary={confirmSalary}
          onDeleteExpense={handleDeleteExpense}
          isSavingSalary={upsertFamilyFinanceMutation.isPending}
          salaryErrorMessage={salaryErrorMessage}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
})
```

- [ ] **Step 2: Delete legacy files**

```bash
rm mobile/components/home/home-overview-card.tsx mobile/components/home/home-activity-card.tsx
```

- [ ] **Step 3: Grep for any stragglers**

```bash
grep -rn "HomeOverviewCard\|HomeActivityCard" mobile/ app/ --include="*.tsx" --include="*.ts"
```

Expected: no results (all consumers were in `home-screen.tsx` which is now rewritten).

- [ ] **Step 4: Typecheck + test + lint**

```bash
./scripts/npmw run typecheck
./scripts/npmw run lint mobile/screens/home/home-screen.tsx mobile/components/home/home-dashboard.tsx
./scripts/npmw run test
```

- [ ] **Step 5: Commit**

```bash
git add -A mobile/screens/home/home-screen.tsx mobile/components/home/home-overview-card.tsx mobile/components/home/home-activity-card.tsx
git commit -m "refactor(home): swap HomeOverviewCard/HomeActivityCard for new HomeDashboard"
```

---

## Task 9: Final validation

- [ ] **Step 1: Run full validate**

```bash
./scripts/npmw run validate
```

Expected: typecheck green, tests green (77 total — 73 prior + 4 new home-dashboard-model assertions which in fact is 10 since we wrote 10 assertions in Task 1; let's count: classifyDashboardError 3 + daysUntilPayday 4 + isPaydayPending 4 = 11 assertions; actually they're spread across grouped `it()` calls). Final test count: **73 + ≥10 = 83+**. Guards green. Lint at the same state as end of Foundation (1 pre-existing error + 4 warnings unrelated to Home).

If any new lint errors introduced by Home, fix them inline in the respective component.

- [ ] **Step 2: Report Home sub-spec complete**

No commit in this task.

---

## Out of scope

- Scroll-linked large title collapse on `<Screen>` — deferred per the spec.
- Home tab in `<AppTabs>` already uses `useTabHaptics` from Phase 3 — nothing to wire here.
- `financial-summary-radial*.tsx` removal — kept for Control sub-spec.

## Exit criteria

- 8 new component/model files landed; 2 old files deleted; 1 screen rewritten.
- `home-screen.tsx` ≤ 120 lines.
- `./scripts/npmw run validate` passes (modulo pre-existing lint).
- No dangling references to `HomeOverviewCard` / `HomeActivityCard`.
- Home renders without runtime errors when the app boots (manual sim pass deferred to user).
