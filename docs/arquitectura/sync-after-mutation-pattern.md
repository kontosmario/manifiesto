# `syncAllAfterMutation` — cache invalidation pattern

> Estado: vivo en prod. Consolidado en 2026-06-08 como patrón estándar para toda mutación que toque data derivada en `home_snapshot`, `gastos_snapshot` o `control_snapshot`.

## Por qué existe

Antes del sprint 2026-06-08, cada hook de mutation invalidaba queries hardcoded en su propio `onSuccess`/`onSettled`. Distintos hooks elegían distintos subsets:

- `useUpsertFamilyFinance` invalidaba `cycle-acumulado` pero olvidaba `home_snapshot`.
- `useUpsertSavingsGoal` invalidaba `savings-goal` pero no `home_snapshot` cuando el caller olvidaba pasar `userId`.
- `useUpsertProfile` invalidaba `profile` pero no `home_snapshot` (avatar quedaba stale).

Resultado: bugs recurrentes de "el dato cambió en DB pero la UI no se entera hasta refresh manual". El owner reportó el síntoma varias veces ("MetaCard no aparece post-create", "avatar viejo después de cambiar foto", "categoría renombrada no se refleja en donut").

`syncAllAfterMutation` resuelve el problema declarando **el grafo de dependencias por scope una sola vez**. Cualquier mutation hook nuevo se limita a:

1. Hacer su `setQueryData` optimistic en `onMutate`.
2. Llamar `syncAllAfterMutation(queryClient, { familyId, userId, scopes })` en `onSettled`.

El helper expande los scopes al set completo de query keys que pueden estar stale, deduplica, y dispara `invalidateQueries` en paralelo.

## Ubicación

[`mobile/lib/sync-after-mutation.ts`](../../mobile/lib/sync-after-mutation.ts)

## Signature

```ts
export type SyncScope =
  | 'expenses'
  | 'fixed'
  | 'fixedPayment'
  | 'income'
  | 'savings'
  | 'notifications'
  | 'wrapped'
  | 'categories'
  | 'profile'

interface SyncArgs {
  familyId?: string
  userId?: string
  scopes: readonly SyncScope[]
}

export async function syncAllAfterMutation(
  queryClient: QueryClient,
  args: SyncArgs,
): Promise<void>
```

## Scopes disponibles

| Scope | Qué invalida |
|---|---|
| `expenses` | `expenseQueryKeys.*` (family/recent/total/period/monthlySpent), `gastosEndpointKeys.*` (hero/calendar/categories/paginated/forDay), `gastos-snapshot`, `streakQueryKey`, `markedDaysQueryKey`, `notificationQueryKeys.family`, `incomeEventQueryKeys.list`, `cycle-acumulado`, `achievementsEarnedQueryKey`, `controlIntelligenceQueryKey`, `controlSnapshotKey`, `homeSnapshotQueryKey` |
| `fixed` | `fixedExpenseQueryKeys.family`, `fixedExpenseQueryKeys.paymentsFamily`, `notificationQueryKeys.family`, `achievementsEarnedQueryKey`, `controlIntelligenceQueryKey`, `controlSnapshotKey`, `homeSnapshotQueryKey` |
| `fixedPayment` | Todo lo de `expenses` + `fixed` (porque un pago de fijo dispara trigger DB que materializa expense row). Adicional: `incomeEventQueryKeys.list`, `income-events-cycle-sum` |
| `income` | `incomeEventQueryKeys.list`, `income-events-cycle-sum`, `familyFinanceQueryKey`, `cycle-acumulado`, `controlIntelligenceQueryKey`, `controlSnapshotKey`, `homeSnapshotQueryKey` |
| `savings` | `savingsGoalQueryKey`, `latestSavingsGoalQueryKey`, `cycle-acumulado`, `controlIntelligenceQueryKey`, `controlSnapshotKey`, `homeSnapshotQueryKey` |
| `notifications` | `notificationQueryKeys.family`, `homeSnapshotQueryKey` |
| `wrapped` | `monthlyEditionsQueryKey`, `controlIntelligenceQueryKey`, `homeSnapshotQueryKey` |
| `categories` | `categoriesQueryKey` (expense + fixed_expense), `expenseQueryKeys.family`, `gastosEndpointKeys.categoriesFamily`, `gastosEndpointKeys.heroFamily`, `gastos-snapshot`, `controlIntelligenceQueryKey`, `controlSnapshotKey`, `homeSnapshotQueryKey` |
| `profile` | `familyMembersKey`, `['profile', userId]`, `homeSnapshotQueryKey` |

> El `homeSnapshotQueryKey` se incluye siempre que haya AT LEAST UN scope — es el root del cache derivado del home y casi todos los cambios derivados deben re-leerlo.

## Edge cases

### `userId` requerido para invalidar snapshots userId-scoped

Varias queries están gated por `userId` y NO `familyId`:

- `homeSnapshotQueryKey(userId)` — el snapshot del home está por user, no por family
- `controlSnapshotKey(userId)`
- `streakQueryKey(familyId, userId)`
- `achievementsEarnedQueryKey(userId)`
- `['profile', userId]`

Si el caller NO pasa `userId`, esas keys NO se invalidan — el helper hace early-skip de las branches dependientes. Resultado: la mutation se completa, los caches family-scoped se invalidan, pero el snapshot del home queda stale hasta refresh manual.

**Bug histórico** (Spec B): el wizard de creación de meta llamaba `useUpsertSavingsGoal(familyId, /* userId omitido */)`. Sin `userId`, `syncAllAfterMutation` no invalidaba `home_snapshot` → la MetaCard no aparecía hasta refresh. Fix: plumb `userId` en TODOS los call sites (commits `d39e071` + `80cefbb`).

**Lección**: si tu mutation puede afectar lo que el home muestra, asegurate de pasar `userId`. Todos los hooks que invocan `syncAllAfterMutation` aceptan `userId` opcional en su signature por esta razón.

### Tests sin userId

Para tests unitarios que no inyectan auth session, los hooks pueden recibir `userId = undefined`. El helper hace early-skip sin tirar. Si el test verifica invalidaciones, el assertion debe hacerse sobre keys que NO dependen de userId (e.g., `savingsGoalQueryKey(familyId)`).

Para coverage del path con userId, los tests pueden mockear `useAuthSession` o pasar un `userId` literal al hook.

### Dedup automático

Múltiples scopes que invalidan la misma key (e.g., `expenses` + `income` ambos invalidan `controlIntelligenceQueryKey`) se deduplican por shape JSON antes del `invalidateQueries` final. No hay over-invalidation cuando se combinan scopes.

### `cycle-acumulado` cubierto por savings + income

El chip "+$X acumulado del mes anterior" depende del savings goal y del cycle balance. Antes del CR v2 sólo savings lo invalidaba; ahora income también (porque finance edits afectan el chip igual). Documentado en el helper con comentario inline.

## Cuándo usar vs invalidate manual

### Usar `syncAllAfterMutation`

- **Mutations en `onSettled`** que tocan data persistida en DB y derivada en `home_snapshot` / `gastos_snapshot` / `control_snapshot`.
- **Defaults para nuevos hooks de mutation** — empezá con el helper y sólo bajá a invalidate manual si tenés una razón.

### Invalidate manual

- **Patches inmediatos del cache para UI snappy** (`setQueryData` + invalidate de keys específicas que NO necesitan refetch del server). Ejemplo: `useUpdateExpense` patcha `paginatedFamily` y `forDayFamily` en `onMutate` Y delega al helper en `onSettled`.
- **Realtime listeners** (`use-home-realtime.ts`) — el listener sabe exactamente qué tabla cambió, puede invalidar sólo los endpoints relacionados sin pagar el costo de un sync completo.
- **Bridge listeners de subscription cleanup** — cuando una sesión cierra y queremos purgar todo, `queryClient.clear()` es más directo que enumerar scopes.

## Ejemplo de adopción

Patrón en `useApplyReserveDecision` ([`mobile/features/month-close/use-apply-reserve.ts`](../../mobile/features/month-close/use-apply-reserve.ts)):

```ts
export function useApplyReserveDecision(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ApplyReserveInput) => {
      const { error } = await supabase.rpc('apply_reserve_decision', {
        p_amount: input.amount,
        p_target: input.target,
        p_meta_goal_id: input.metaGoalId ?? null,
      })
      if (error) throw error
    },
    onSettled: async () => {
      await syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['savings', 'income'],
      })
      // Fallback para callers sin userId (tests): garantiza al menos
      // un invalidate del root del home_snapshot.
      if (!userId) {
        await queryClient.invalidateQueries({ queryKey: ['home-snapshot'] })
      }
    },
  })
}
```

## Hooks que lo usan (post fix-round 2026-06-08)

| Hook | Archivo | Scope(s) |
|---|---|---|
| `useUpsertFamilyFinance` | `mobile/features/finance/use-family-finance.ts` | `income` |
| `useApplyMonthCloseDecision` | `mobile/features/month-close/use-month-close-decision.ts` | `savings`, `income`, `wrapped` |
| `useApplyReserveDecision` | `mobile/features/month-close/use-apply-reserve.ts` | `savings`, `income` |
| `useAddSavingsContribution` | `mobile/features/savings-goals/use-add-savings-contribution.ts` | `savings` |
| `useUpsertSavingsGoal` | `mobile/features/savings-goals/use-upsert-savings-goal.ts` | `savings` |
| `useDeleteSavingsGoal` | `mobile/features/savings-goals/use-delete-savings-goal.ts` | `savings` |
| `useDeclareSubscriptionIntent` | `mobile/features/subscriptions-zombie/use-declare-subscription-intent.ts` | `fixed`, `fixedPayment` |
| `useResolveSubscriptionIntent` | `mobile/features/subscriptions-zombie/use-resolve-subscription-intent.ts` | `fixed`, `fixedPayment` |
| `useUpdateExpense` / `useDeleteExpense` | `mobile/features/expenses/use-expenses.ts` | `expenses` |
| `useUpsertProfile` | `mobile/features/profile/use-profile.ts` | `profile` |
| `useUpsertCategory` | `mobile/features/categories/use-categories.ts` | `categories` |
| `useConfirmImport` | `mobile/features/import-review/use-confirm-import.ts` | `expenses` |
| `useMarkCycleWrappedSeen` | `mobile/features/wrapped/use-mark-cycle-wrapped-seen.ts` | `wrapped` |
| `useDeclareSubscriptionIntent` / fixed-expenses ops | `mobile/features/fixed-expenses/use-fixed-expenses.ts` | `fixed` / `fixedPayment` |
| `useResolveOrIgnoreNotification` | `mobile/features/notifications/use-notifications.ts` | `notifications` |
| `useRecordIncomeEvent` | `mobile/features/income/use-income-events.ts` | `income` |

## Spec

Diseño original: `docs/superpowers/specs/2026-05-29-state-sync-design.md`.

## Verificación

Tests de invalidación específicos (`tests/unit/use-apply-reserve.test.ts`, `tests/unit/use-delete-savings-goal.test.ts`) mockean `@/lib/supabase` y assertan que las keys correctas se invalidan. Usar el mismo patrón para nuevos hooks que usen el helper.

<!-- ✓ Sincronizado contra código el 2026-06-08 -->
