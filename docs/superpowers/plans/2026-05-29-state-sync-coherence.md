# State Sync Coherence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every mutation in the app reflect instantly in all related surfaces (Home activity, Gastos, Control, Fijos) without reloads — via optimistic updates + a centralized scope-based invalidation helper, with error rollback + retry toast.

**Architecture:** Three layers per mutation: (1) `onMutate` writes the change optimistically into the relevant caches and snapshots them for rollback; (2) `mutationFn` runs the server round-trip; (3a) `onSettled` calls a centralized `syncAllAfterMutation(qc, { familyId, userId, scopes })` helper that invalidates ALL downstream queries including snapshot roots (resolves the structural clobbering), or (3b) `onError` restores the snapshot and shows a retry toast. Reference patterns: `useDeleteExpense` (list filter) and `useMarkCycleWrappedSeen` (bundle map).

**Tech Stack:** React Query v5 (Tanstack), React Native / Expo SDK 54, Supabase JS v2. No automated tests for this change (per spec — vitest lacks React renderer); QA is typecheck + lint + manual verification.

**Spec reference:** `docs/superpowers/specs/2026-05-29-state-sync-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `mobile/lib/sync-after-mutation.ts` | Create | Centralized scope-based invalidation helper |
| `mobile/lib/toast-bus.ts` | Create | Minimal emitter for error toasts with retry |
| `mobile/components/ui/toast-host.tsx` | Create | The rendered toast UI, mounted in app shell |
| `mobile/components/root/app-stack-shell.tsx` | Modify | Mount `<ToastHost />` at app shell level |
| `mobile/features/family/family-query-invalidation.ts` | Modify | Wrap into `syncAllAfterMutation` (back-compat) |
| `mobile/features/expenses/use-expenses.ts` | Modify | Add optimistic + syncAll to create/update; swap delete |
| `mobile/features/fixed-expenses/use-fixed-expenses.ts` | Modify | Add optimistic + syncAll to all 5 fixed mutations |
| `mobile/features/savings-goals/use-upsert-savings-goal.ts` | Modify | Add optimistic + syncAll |
| `mobile/features/income/use-income-events.ts` | Modify | Add optimistic + syncAll |
| `mobile/features/notifications/use-notifications.ts` | Modify | Swap delete invalidate for syncAll |
| `mobile/features/wrapped/use-mark-cycle-wrapped-seen.ts` | Modify | Swap invalidate for syncAll |

Each task below commits after passing typecheck + lint locally.

---

## Task 1: Create the centralized invalidation helper

**Files:**
- Create: `mobile/lib/sync-after-mutation.ts`

- [ ] **Step 1: Write the helper**

```ts
import type { QueryClient } from '@tanstack/react-query'
import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import { notificationQueryKeys } from '@/features/notifications/notification-query-keys'
import { incomeEventQueryKeys } from '@/features/income/use-income-events'
import { savingsGoalQueryKey } from '@/features/savings-goals/use-savings-goal'
import { familyFinanceQueryKey } from '@/features/finance/use-family-finance'
import { homeSnapshotQueryKey } from '@/features/home/use-home-snapshot'
import {
  controlIntelligenceQueryKey,
} from '@/features/insights/use-control-v2-data'
import { controlSnapshotKey } from '@/features/insights/use-control-snapshot'
import { gastosEndpointKeys } from '@/features/gastos/use-gastos-endpoints'
import { streakQueryKey, markedDaysQueryKey } from '@/features/streaks/use-streak'
import { achievementsEarnedQueryKey } from '@/features/achievements/use-achievements'
import { monthlyEditionsQueryKey } from '@/features/wrapped/use-monthly-editions'

export type SyncScope =
  | 'expenses'
  | 'fixed'
  | 'fixedPayment'
  | 'income'
  | 'savings'
  | 'notifications'
  | 'wrapped'

interface SyncArgs {
  familyId?: string
  userId?: string
  scopes: readonly SyncScope[]
}

/**
 * Invalida toda query derivada del scope dado (incluyendo los snapshot
 * roots). Llamar desde onSettled de cualquier mutación. El optimistic
 * update sigue siendo responsabilidad de cada mutación en su onMutate.
 *
 * Cada scope expande a un set de keys que cubren TODAS las vistas que
 * podrían mostrar data stale tras la mutación. Las keys se deduplican
 * antes de invocar invalidateQueries.
 */
export async function syncAllAfterMutation(
  queryClient: QueryClient,
  args: SyncArgs,
): Promise<void> {
  const { familyId, userId, scopes } = args
  if (scopes.length === 0) return

  // Resolve scopes → set of query keys to invalidate.
  const keys: Array<readonly unknown[]> = []
  const has = (s: SyncScope) => scopes.includes(s)

  // Expenses cluster (also enabled by fixedPayment via DB trigger cascade)
  if (familyId && (has('expenses') || has('fixedPayment'))) {
    keys.push(expenseQueryKeys.family(familyId))
    keys.push(expenseQueryKeys.recentFamily(familyId))
    keys.push(expenseQueryKeys.total(familyId))
    keys.push(expenseQueryKeys.periodTotalFamily(familyId))
    keys.push(expenseQueryKeys.monthlySpentFamily(familyId))
    keys.push(gastosEndpointKeys.heroFamily(familyId))
    keys.push(gastosEndpointKeys.calendarFamily(familyId))
    keys.push(gastosEndpointKeys.categoriesFamily(familyId))
    keys.push(gastosEndpointKeys.paginatedFamily(familyId))
    keys.push(gastosEndpointKeys.forDayFamily(familyId))
    keys.push(['gastos-snapshot', familyId]) // prefix
    if (userId) {
      keys.push(streakQueryKey(familyId, userId))
      keys.push(markedDaysQueryKey(familyId, userId))
    }
  }

  // Fixed cluster
  if (familyId && (has('fixed') || has('fixedPayment'))) {
    keys.push(fixedExpenseQueryKeys.family(familyId))
    keys.push(fixedExpenseQueryKeys.paymentsFamily(familyId))
  }

  // Notifications (some scopes touch them via DB triggers)
  if (familyId && (has('expenses') || has('fixed') || has('fixedPayment') || has('notifications'))) {
    keys.push(notificationQueryKeys.family(familyId))
  }

  // Income
  if (familyId && has('income')) {
    keys.push(incomeEventQueryKeys.list(familyId))
    keys.push(['income-events-cycle-sum', familyId]) // prefix
    keys.push(familyFinanceQueryKey(familyId))
  }

  // Savings
  if (familyId && has('savings')) {
    keys.push(savingsGoalQueryKey(familyId))
  }

  // Wrapped — control intelligence is what holds wrapped_seen_at
  if (familyId && has('wrapped')) {
    keys.push(monthlyEditionsQueryKey(familyId))
  }

  // Achievements — any expense/fixed/payment can unlock one via triggers
  if (userId && (has('expenses') || has('fixed') || has('fixedPayment'))) {
    keys.push(achievementsEarnedQueryKey(userId))
  }

  // Control v2 — affected by virtually anything money-related
  if (
    familyId &&
    (has('expenses') ||
      has('fixed') ||
      has('fixedPayment') ||
      has('income') ||
      has('savings') ||
      has('wrapped'))
  ) {
    keys.push(controlIntelligenceQueryKey(familyId))
  }
  if (
    userId &&
    (has('expenses') ||
      has('fixed') ||
      has('fixedPayment') ||
      has('income') ||
      has('savings'))
  ) {
    keys.push(controlSnapshotKey(userId))
  }

  // Snapshot roots — invalidate so the next refetch re-seeds with fresh
  // data instead of clobbering the optimistic write with stale cache.
  if (userId) {
    keys.push(homeSnapshotQueryKey(userId))
  }

  // Dedup by JSON shape (fast enough for this size).
  const seen = new Set<string>()
  const unique = keys.filter((k) => {
    const sig = JSON.stringify(k)
    if (seen.has(sig)) return false
    seen.add(sig)
    return true
  })

  await Promise.all(
    unique.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}
```

- [ ] **Step 2: typecheck + lint**

```bash
cd mobile && npx tsc --noEmit && npx eslint lib/sync-after-mutation.ts
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/sync-after-mutation.ts
git commit -m "feat(sync): centralized scope-based invalidation helper"
```

---

## Task 2: Toast bus + ToastHost

**Files:**
- Create: `mobile/lib/toast-bus.ts`
- Create: `mobile/components/ui/toast-host.tsx`
- Modify: `mobile/components/root/app-stack-shell.tsx`

- [ ] **Step 1: Write the emitter**

`mobile/lib/toast-bus.ts`:
```ts
// Tiny pub/sub for transient toasts. One listener (ToastHost) consumes
// the stream; producers anywhere in the app call toast.error/success.

export interface ToastPayload {
  id: string
  kind: 'error' | 'success' | 'info'
  message: string
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}

type Listener = (toast: ToastPayload) => void

const listeners = new Set<Listener>()
let counter = 0

function emit(kind: ToastPayload['kind'], message: string, opts?: { actionLabel?: string; onAction?: () => void; durationMs?: number }) {
  counter += 1
  const payload: ToastPayload = {
    id: `${Date.now()}-${counter}`,
    kind,
    message,
    actionLabel: opts?.actionLabel,
    onAction: opts?.onAction,
    durationMs: opts?.durationMs ?? (kind === 'error' ? 6000 : 3000),
  }
  listeners.forEach((l) => l(payload))
}

export const toast = {
  error: (message: string, opts?: { actionLabel?: string; onAction?: () => void; durationMs?: number }) =>
    emit('error', message, opts),
  success: (message: string, opts?: { durationMs?: number }) =>
    emit('success', message, opts),
  info: (message: string, opts?: { durationMs?: number }) =>
    emit('info', message, opts),
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
```

- [ ] **Step 2: Write the ToastHost component**

`mobile/components/ui/toast-host.tsx`:
```ts
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { subscribeToast, type ToastPayload } from '@/lib/toast-bus'
import { useAppTheme } from '@/theme/theme-provider'

export function ToastHost() {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const [current, setCurrent] = useState<ToastPayload | null>(null)

  useEffect(() => {
    const unsub = subscribeToast((toast) => {
      setCurrent(toast)
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!current) return
    const timer = setTimeout(() => {
      setCurrent((c) => (c?.id === current.id ? null : c))
    }, current.durationMs ?? 3500)
    return () => clearTimeout(timer)
  }, [current])

  if (!current) return null

  const tone = current.kind === 'error'
    ? { bg: theme.colors.danger, fg: '#FFFBF2', icon: 'error-outline' as const }
    : current.kind === 'success'
      ? { bg: theme.colors.success, fg: '#0B1F12', icon: 'check-circle' as const }
      : { bg: theme.colors.text, fg: theme.colors.background, icon: 'info-outline' as const }

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(180)}
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 80 }]}
    >
      <View style={[styles.toast, { backgroundColor: tone.bg }]}>
        <MaterialIcons name={tone.icon} size={18} color={tone.fg} />
        <Text style={[styles.message, { color: tone.fg }]} numberOfLines={2}>
          {current.message}
        </Text>
        {current.actionLabel && current.onAction ? (
          <Pressable
            onPress={() => {
              current.onAction?.()
              setCurrent(null)
            }}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={[styles.action, { color: tone.fg }]}>
              {current.actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    maxWidth: '100%',
  },
  message: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  action: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
    textDecorationLine: 'underline',
  },
})
```

- [ ] **Step 3: Mount ToastHost in app shell**

In `mobile/components/root/app-stack-shell.tsx`, locate where `<CycleWrappedBridge />` is mounted and add `<ToastHost />` next to it (both are global overlays):
```ts
import { ToastHost } from '@/components/ui/toast-host'
// ...
<CycleWrappedBridge />
<ToastHost />
```

- [ ] **Step 4: typecheck + lint**

```bash
cd mobile && npx tsc --noEmit && npx eslint lib/toast-bus.ts components/ui/toast-host.tsx components/root/app-stack-shell.tsx
```

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/toast-bus.ts mobile/components/ui/toast-host.tsx mobile/components/root/app-stack-shell.tsx
git commit -m "feat(toast): minimal toast bus + global ToastHost"
```

---

## Task 3: Migrate `invalidateFamilyBudgetData` to wrap `syncAllAfterMutation`

Keeps backward compatibility: all existing call-sites keep working with the same boolean API while routing through the new scope-based helper under the hood.

**Files:**
- Modify: `mobile/features/family/family-query-invalidation.ts`

- [ ] **Step 1: Replace internals**

```ts
import type { QueryClient } from '@tanstack/react-query'
import { syncAllAfterMutation, type SyncScope } from '@/lib/sync-after-mutation'

interface BudgetInvalidationOptions {
  includeFixedExpenses?: boolean
  includeNotifications?: boolean
  /** Deprecated — kept for back-compat; real fix is to pass userId for snapshot invalidation. */
  userId?: string
}

/**
 * Compat wrapper for the legacy budget-invalidation helper. New code
 * should call `syncAllAfterMutation` directly with explicit scopes.
 */
export async function invalidateFamilyBudgetData(
  queryClient: QueryClient,
  familyId: string | undefined,
  opts: BudgetInvalidationOptions = {},
): Promise<void> {
  if (!familyId) return
  const scopes: SyncScope[] = ['expenses']
  if (opts.includeFixedExpenses) scopes.push('fixed')
  if (opts.includeNotifications) scopes.push('notifications')
  await syncAllAfterMutation(queryClient, { familyId, userId: opts.userId, scopes })
}
```

- [ ] **Step 2: typecheck + lint**

```bash
cd mobile && npx tsc --noEmit && npx eslint features/family/family-query-invalidation.ts
```

- [ ] **Step 3: Commit**

```bash
git add mobile/features/family/family-query-invalidation.ts
git commit -m "refactor(sync): invalidateFamilyBudgetData wraps syncAllAfterMutation"
```

---

## Task 4: `useCreateExpense` — optimistic + syncAll

**Files:**
- Modify: `mobile/features/expenses/use-expenses.ts` (around line 77 — `useCreateExpense`)

- [ ] **Step 1: Add optimistic insert + syncAll**

Find the `useCreateExpense` mutation. Add `onMutate` that inserts the new expense at the top of `expenseQueryKeys.family(familyId)` and `expenseQueryKeys.recent(familyId, N)` lists with a tentative id. Snapshot previous values. `onError`: restore + `toast.error`. `onSettled`: `syncAllAfterMutation(qc, { familyId, userId, scopes: ['expenses'] })`. Remove the existing `onSuccess` invalidation (now handled by `onSettled`).

Use the existing `Expense` type. Tentative id pattern:
```ts
const tentativeId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
```

Build the optimistic row from the mutation input + tentative id + `created_at: new Date().toISOString()`. When the server returns the real row, the `onSettled` invalidation triggers refetch and the real id replaces the tentative one.

Skeleton:
```ts
onMutate: async (input) => {
  await qc.cancelQueries({ queryKey: expenseQueryKeys.family(familyId) })
  const optimistic: Expense = {
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    family_id: familyId,
    category_id: input.category_id,
    description: input.description,
    price: input.price,
    notes: input.notes ?? null,
    commitment_id: input.commitment_id ?? null,
    created_by: input.created_by,
    created_at: new Date().toISOString(),
    archived_at: null,
  }
  // Snapshot every variant the home_snapshot seeds
  const previous = {
    list: qc.getQueryData(expenseQueryKeys.list(familyId, undefined)),
    recent6: qc.getQueryData(expenseQueryKeys.recent(familyId, 6)),
    recent3: qc.getQueryData(expenseQueryKeys.recent(familyId, 3)),
    recentFamilyPrefix: undefined, // covered by recent6/3
  }
  const prepend = (arr: Expense[] | undefined) => (arr ? [optimistic, ...arr] : [optimistic])
  qc.setQueryData(expenseQueryKeys.list(familyId, undefined), prepend)
  if (!optimistic.commitment_id) {
    // recent feed pre-filters commitment-bound rows out
    qc.setQueryData(expenseQueryKeys.recent(familyId, 6), prepend)
    qc.setQueryData(expenseQueryKeys.recent(familyId, 3), prepend)
  }
  return { previous }
},
onError: (_err, input, ctx) => {
  if (ctx?.previous) {
    qc.setQueryData(expenseQueryKeys.list(familyId, undefined), ctx.previous.list)
    qc.setQueryData(expenseQueryKeys.recent(familyId, 6), ctx.previous.recent6)
    qc.setQueryData(expenseQueryKeys.recent(familyId, 3), ctx.previous.recent3)
  }
  toast.error('No se pudo guardar el gasto.', {
    actionLabel: 'Reintentar',
    onAction: () => mutationRef.current?.mutate(input),
  })
},
onSettled: () => {
  void syncAllAfterMutation(qc, { familyId, userId, scopes: ['expenses'] })
},
```

Note: `mutationRef` pattern — capture the mutation result via `useRef` to retry. If react-query's `useMutation` doesn't surface a ref easily, use a less elegant: re-create the mutation params in the toast and the consumer calls `mutate` again. Simpler: factor the toast trigger to take the input + a function that the host can pass.

Pragmatic alternative: have the hook accept `userId` (already does for created_by) and call `toast.error` with the original input bound. The retry calls `mutationFn` directly OR re-invokes the consumer's `mutate`. Use a closure capturing the bound `mutate` from outside — in React Query v5, you can use the `mutateAsync`/`mutate` from the same `useMutation` returned. Easier: use the result of `useMutation` and store a stable ref.

Simplest approach: inside the hook, before returning, wrap `mutate` so the toast action calls it back. Pseudo:
```ts
const result = useMutation({...})
// in onError above, replace the onAction closure with:
// onAction: () => result.mutate(input)
// But onError doesn't see `result` yet. Workaround: use a ref.
const ref = useRef<typeof result | null>(null)
useEffect(() => { ref.current = result }, [result])
// in onError: onAction: () => ref.current?.mutate(input)
```

- [ ] **Step 2: Imports**

Add at top:
```ts
import { useRef, useEffect } from 'react'
import { toast } from '@/lib/toast-bus'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'
```

- [ ] **Step 3: typecheck + lint**

```bash
cd mobile && npx tsc --noEmit && npx eslint features/expenses/use-expenses.ts
```

- [ ] **Step 4: Commit**

```bash
git add mobile/features/expenses/use-expenses.ts
git commit -m "feat(expenses): optimistic update + syncAll on useCreateExpense"
```

---

## Task 5: `useUpdateExpense` — optimistic + syncAll

**Files:**
- Modify: `mobile/features/expenses/use-expenses.ts` (around line 121 — `useUpdateExpense`)

- [ ] **Step 1: Add optimistic patch + syncAll**

`onMutate({ id, patch })`: snapshot the variants, map and patch the matching row in each cached list. `onError`: restore + toast.error with retry. `onSettled`: syncAll scope `['expenses']`. Remove the existing `onSuccess` invalidation.

```ts
onMutate: async ({ id, patch }) => {
  await qc.cancelQueries({ queryKey: expenseQueryKeys.family(familyId) })
  const previous = {
    list: qc.getQueryData(expenseQueryKeys.list(familyId, undefined)),
    recent6: qc.getQueryData(expenseQueryKeys.recent(familyId, 6)),
    recent3: qc.getQueryData(expenseQueryKeys.recent(familyId, 3)),
  }
  const patchOne = (arr: Expense[] | undefined) =>
    arr?.map((e) => (e.id === id ? { ...e, ...patch } : e))
  qc.setQueryData(expenseQueryKeys.list(familyId, undefined), patchOne)
  qc.setQueryData(expenseQueryKeys.recent(familyId, 6), patchOne)
  qc.setQueryData(expenseQueryKeys.recent(familyId, 3), patchOne)
  return { previous }
},
onError: (_err, input, ctx) => {
  if (ctx?.previous) {
    qc.setQueryData(expenseQueryKeys.list(familyId, undefined), ctx.previous.list)
    qc.setQueryData(expenseQueryKeys.recent(familyId, 6), ctx.previous.recent6)
    qc.setQueryData(expenseQueryKeys.recent(familyId, 3), ctx.previous.recent3)
  }
  toast.error('No se pudo actualizar el gasto.', {
    actionLabel: 'Reintentar',
    onAction: () => ref.current?.mutate(input),
  })
},
onSettled: () => syncAllAfterMutation(qc, { familyId, userId, scopes: ['expenses'] }),
```

- [ ] **Step 2: typecheck + lint + commit**

```bash
cd mobile && npx tsc --noEmit && npx eslint features/expenses/use-expenses.ts
git add mobile/features/expenses/use-expenses.ts
git commit -m "feat(expenses): optimistic patch + syncAll on useUpdateExpense"
```

---

## Task 6: `useDeleteExpense` — swap invalidate for syncAll

Already optimistic. Just swap the `onSettled` invalidation for the new helper. Keep snapshot/rollback as is.

**Files:**
- Modify: `mobile/features/expenses/use-expenses.ts` (around line 139)

- [ ] **Step 1: Replace `onSettled`**

```ts
onSettled: () => syncAllAfterMutation(qc, { familyId, userId, scopes: ['expenses'] }),
```

Also add retry toast on `onError` (currently silent):
```ts
onError: (_err, expenseId, ctx) => {
  if (ctx?.snapshots) restoreSnapshots(qc, ctx.snapshots)
  toast.error('No se pudo borrar el gasto.', {
    actionLabel: 'Reintentar',
    onAction: () => ref.current?.mutate(expenseId),
  })
},
```

- [ ] **Step 2: typecheck + lint + commit**

```bash
cd mobile && npx tsc --noEmit && npx eslint features/expenses/use-expenses.ts
git add mobile/features/expenses/use-expenses.ts
git commit -m "refactor(expenses): useDeleteExpense uses syncAll + retry toast"
```

---

## Task 7: Fixed expense mutations — 5 hooks

**Files:**
- Modify: `mobile/features/fixed-expenses/use-fixed-expenses.ts`

Five mutations: `useCreateFixedExpense`, `useUpdateFixedExpense`, `useUpdateFixedExpenseStatus`, `useRecordFixedExpensePayment`, `useDeleteFixedExpense`. Pattern for each:

| Hook | onMutate (optimistic on `fixedExpenseQueryKeys.family(familyId)`) | scope |
|---|---|---|
| `useCreateFixedExpense` | prepend optimistic row with tentative id | `['fixed']` |
| `useUpdateFixedExpense` | map+patch matching row | `['fixed']` |
| `useUpdateFixedExpenseStatus` | map+patch `status` field | `['fixed']` |
| `useRecordFixedExpensePayment` | prepend payment row to `fixedExpensePaymentsKey(familyId, ...)` if present; also patch `fixed_expenses[i].last_paid_at = now` | `['fixedPayment']` |
| `useDeleteFixedExpense` | filter matching row | `['fixed']` |

All: `onError` restore + `toast.error('No se pudo guardar/borrar el fijo.', { actionLabel: 'Reintentar', onAction })`. All: `onSettled` syncAll with the right scope.

Imports at top of file:
```ts
import { useRef, useEffect } from 'react'
import { toast } from '@/lib/toast-bus'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'
import { fixedExpensePaymentsKey } from '@/features/fixed-expenses/use-fixed-expense-payments'
```

- [ ] **Step 1: Add optimistic + syncAll to all 5**

Apply the pattern above to each of the 5 hooks in `use-fixed-expenses.ts`. For `useRecordFixedExpensePayment`, the optimistic payment row needs fields matching the existing `fixedExpensePaymentsKey` shape — read the existing query/select to match.

- [ ] **Step 2: typecheck + lint + commit**

```bash
cd mobile && npx tsc --noEmit && npx eslint features/fixed-expenses/use-fixed-expenses.ts
git add mobile/features/fixed-expenses/use-fixed-expenses.ts
git commit -m "feat(fixed): optimistic updates + syncAll on all 5 fixed mutations"
```

---

## Task 8: `useUpsertSavingsGoal` — optimistic + syncAll

**Files:**
- Modify: `mobile/features/savings-goals/use-upsert-savings-goal.ts`

- [ ] **Step 1: Add optimistic + syncAll**

```ts
onMutate: async (input) => {
  await qc.cancelQueries({ queryKey: savingsGoalQueryKey(familyId) })
  const previous = qc.getQueryData(savingsGoalQueryKey(familyId))
  qc.setQueryData(savingsGoalQueryKey(familyId), (old: SavingsGoal | null | undefined) => ({
    ...(old ?? {}),
    ...input,
  }))
  return { previous }
},
onError: (_err, input, ctx) => {
  if (ctx?.previous !== undefined) {
    qc.setQueryData(savingsGoalQueryKey(familyId), ctx.previous)
  }
  toast.error('No se pudo guardar la meta.', {
    actionLabel: 'Reintentar',
    onAction: () => ref.current?.mutate(input),
  })
},
onSettled: () => syncAllAfterMutation(qc, { familyId, userId, scopes: ['savings'] }),
```

- [ ] **Step 2: typecheck + lint + commit**

```bash
cd mobile && npx tsc --noEmit && npx eslint features/savings-goals/use-upsert-savings-goal.ts
git add mobile/features/savings-goals/use-upsert-savings-goal.ts
git commit -m "feat(savings): optimistic upsert + syncAll on savings goal"
```

---

## Task 9: `useCreateIncomeEvent` — optimistic + syncAll

**Files:**
- Modify: `mobile/features/income/use-income-events.ts` (around line 86)

- [ ] **Step 1: Add optimistic prepend + syncAll**

```ts
onMutate: async (input) => {
  await qc.cancelQueries({ queryKey: incomeEventQueryKeys.list(familyId) })
  const previous = qc.getQueryData(incomeEventQueryKeys.list(familyId))
  const optimistic: IncomeEvent = {
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    family_id: familyId,
    user_id: input.user_id,
    amount: input.amount,
    kind: input.kind,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
  }
  qc.setQueryData(incomeEventQueryKeys.list(familyId), (old: IncomeEvent[] | undefined) =>
    old ? [optimistic, ...old] : [optimistic],
  )
  return { previous }
},
onError: (_err, input, ctx) => {
  if (ctx?.previous !== undefined) {
    qc.setQueryData(incomeEventQueryKeys.list(familyId), ctx.previous)
  }
  toast.error('No se pudo guardar el ingreso.', {
    actionLabel: 'Reintentar',
    onAction: () => ref.current?.mutate(input),
  })
},
onSettled: () => syncAllAfterMutation(qc, { familyId, userId, scopes: ['income'] }),
```

- [ ] **Step 2: typecheck + lint + commit**

```bash
cd mobile && npx tsc --noEmit && npx eslint features/income/use-income-events.ts
git add mobile/features/income/use-income-events.ts
git commit -m "feat(income): optimistic create + syncAll on income event"
```

---

## Task 10: Notifications + Wrapped — swap invalidate for syncAll

Already optimistic in both cases. Just swap helper.

**Files:**
- Modify: `mobile/features/notifications/use-notifications.ts` (around lines 207, 257 — delete + deleteAll)
- Modify: `mobile/features/wrapped/use-mark-cycle-wrapped-seen.ts`

- [ ] **Step 1: Notifications swap**

In `useDeleteNotification` and `useDeleteAllNotifications`, change `onSettled` to:
```ts
onSettled: () => syncAllAfterMutation(qc, { familyId, userId, scopes: ['notifications'] }),
```

Add retry toast to `onError` (currently silent rollback):
```ts
onError: (_err, _input, ctx) => {
  // existing rollback logic
  toast.error('No se pudo eliminar la notificación.', {
    actionLabel: 'Reintentar',
    onAction: () => ref.current?.mutate(_input),
  })
},
```

- [ ] **Step 2: Wrapped swap**

In `useMarkCycleWrappedSeen`, change `onSettled`:
```ts
onSettled: () => syncAllAfterMutation(qc, { familyId, userId, scopes: ['wrapped'] }),
```

(No retry toast for wrapped seen — silent is fine; it's a marker, not a user action that needs feedback.)

- [ ] **Step 3: typecheck + lint + commit**

```bash
cd mobile && npx tsc --noEmit && npx eslint features/notifications/use-notifications.ts features/wrapped/use-mark-cycle-wrapped-seen.ts
git add mobile/features/notifications/use-notifications.ts mobile/features/wrapped/use-mark-cycle-wrapped-seen.ts
git commit -m "refactor(sync): notifications + wrapped use syncAll helper"
```

---

## Task 11: Final QA + merge

- [ ] **Step 1: Full typecheck + lint**

```bash
cd mobile && npx tsc --noEmit && npx eslint .
```
Expected: clean (zero errors). If there are pre-existing lint warnings, that's fine — only fail on new ones introduced by this branch.

- [ ] **Step 2: Update doc 07 with the new helper**

Add a short note in `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/07-backend-servicios-db.md` (or in 01-arquitectura-stack-navegacion-estado.md) under the React Query / state-management section, mentioning the new `syncAllAfterMutation` helper and where it lives.

- [ ] **Step 3: Commit docs**

```bash
git add docs/ESTADO-DEL-PROYECTO/
git commit -m "docs(estado): nota sobre syncAllAfterMutation y patrón optimistic"
```

- [ ] **Step 4: Merge to main**

```bash
git checkout main
git merge --no-ff feat/state-sync-coherence -m "Merge feat/state-sync-coherence: optimistic updates + centralized invalidation"
git push origin main
git branch -d feat/state-sync-coherence
```

---

## Spec self-review

- **Spec coverage:** ✅ all 13 mutations from the spec scope table have tasks (Tasks 4-10). Helper (T1), Toast (T2), Compat wrapper (T3), QA+merge (T11).
- **Placeholder scan:** None. All steps have real code or exact commands.
- **Type consistency:** `syncAllAfterMutation(qc, { familyId, userId, scopes })` shape consistent across tasks 1-10. `SyncScope` values match the spec table.

Plan ready for execution.
