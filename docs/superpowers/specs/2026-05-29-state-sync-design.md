# Sincronización de estado cross-screen (cache coherence)

> **Fecha:** 2026-05-29 · **Origen:** brainstorming session · **Estado:** aprobado para implementación

## Problema

Cuando el usuario agrega/edita/borra un gasto, paga un fijo, confirma un sueldo, etc., los cambios no se reflejan al instante en todas las superficies relacionadas (Home actividad, listado de Gastos, Control v2, Fijos). El usuario tiene que cerrar y abrir la pantalla / hacer pull-to-refresh para verlos. Esto rompe la sensación nativa de la app.

## Diagnóstico (verificado contra código)

1. **Falta de optimistic update en mutaciones core.** `useCreateExpense`, `useUpdateExpense`, los 5 hooks de fixed-expense, `useUpsertSavingsGoal`, `useCreateIncomeEvent` confían en `onSuccess → invalidateQueries → refetch`. Latencia perceptible 500-1500ms = "se siente como necesitar refresh".
2. **Invalidación incompleta.** El helper `invalidateFamilyBudgetData` (en `mobile/features/family/family-query-invalidation.ts`) cubre expenses, fixed, notifications y streaks, pero **NO** toca `controlIntelligenceQueryKey`, `controlSnapshotKey`, `homeSnapshotQueryKey`, `gastosSnapshotQueryKey`, ni los endpoints especializados de `gastos`. Resultado: Control v2 y los hero/calendar de Gastos quedan stale hasta el próximo focus/staleTime.
3. **Snapshot clobbering estructural.** `useHomeSnapshot` y `useGastosSnapshot` corren `seedCaches` adentro de su `queryFn`. Cuando refetchean (focus o cada 60s), re-siembran via `setQueryData` y pisan caches que ya fueron actualizados optimistamente. Hoy ya lo vimos con el flag `wrapped_seen_at`.
4. **Patrones buenos existen** y sirven de referencia: `useDeleteExpense` (snapshot + filter + rollback + invalidate) y `useMarkCycleWrappedSeen` (snapshot + map + rollback + invalidate). El diseño los replica.

## Criterio de éxito

- **Instantáneo nativo:** toda mutación que el usuario inicia desde su device se refleja en TODAS las superficies relacionadas sin esperar el round-trip (vía optimistic update).
- **Self-healing:** al volver el server, las queries derivadas se revalidan automáticamente (invalidación cascada) y convergen a la verdad del server. Si difieren del optimistic, gana el server.
- **Error legible:** si la mutación falla, la UI revierte y el usuario ve un toast minimal con botón "Reintentar".
- **Cross-device no es scope de este spec.** El realtime de Supabase (`useHomeRealtime`, `useGastosRealtime`, `useFamilyNotificationsRealtime`) ya cubre el caso del otro miembro de la familia. Lo dejamos como red de seguridad sin tocar.

## Arquitectura — tres capas

```
1. OPTIMISTIC LAYER (onMutate)
   setQueryData en las queries afectadas con el cambio anticipado
   snapshot de los caches previos para rollback en onError

2. SERVER ROUND-TRIP (mutationFn)
   INSERT/UPDATE/DELETE o RPC

3a. SAFETY-NET INVALIDATION (onSettled)         3b. ROLLBACK + TOAST (onError)
    syncAllAfterMutation(qc, {                       qc.setQueryData(snapshot)
      familyId, userId,                              toast.error('No se pudo guardar',
      scopes: ['expenses' | 'fixed' | ...]           { onRetry })
    })
    → invalida todas las queries derivadas
       y los snapshot roots (resuelve clobbering)
```

La parte que cambia entre mutaciones (qué escribir optimistamente) queda **local y explícita**; la parte repetitiva (qué invalidar) queda **centralizada**.

## Componentes

### 1. `mobile/lib/sync-after-mutation.ts` (nuevo)

API basada en scope (no en booleans), porque el caller declara qué dominio tocó y el helper sabe la cascada.

```ts
export type SyncScope =
  | 'expenses'      // crear/editar/borrar gasto variable
  | 'fixed'         // crear/editar/borrar fijo
  | 'fixedPayment'  // pago de fijo (cascada porque dispara expense via trigger)
  | 'income'        // income_events
  | 'savings'       // savings_goals
  | 'notifications' // read/delete notif
  | 'wrapped'       // mark cycle wrapped seen

export async function syncAllAfterMutation(
  queryClient: QueryClient,
  args: {
    familyId?: string
    userId?: string
    scopes: readonly SyncScope[]
  },
): Promise<void>
```

**Mapa scope → keys que invalida.** Cada scope expande a un set de keys; el helper deduplica antes de invocar `invalidateQueries`:

| Scope | Keys que invalida |
|---|---|
| `expenses` | `expenseQueryKeys.family/recentFamily/total/periodTotalFamily/monthlySpentFamily`, `gastosEndpointKeys.heroFamily/calendarFamily/categoriesFamily/paginatedFamily/forDayFamily`, `['gastos-snapshot', familyId]` (prefix), `homeSnapshotQueryKey(userId)`, `controlIntelligenceQueryKey(familyId)`, `controlSnapshotKey(userId)`, `streakQueryKey(familyId, userId)` / `markedDaysQueryKey(familyId, userId)`, `achievementsEarnedQueryKey(userId)`, `notificationQueryKeys.family(familyId)` (trigger DB emite notif) |
| `fixed` | `fixedExpenseQueryKeys.family/paymentsFamily`, `homeSnapshotQueryKey(userId)`, `controlIntelligenceQueryKey(familyId)`, `controlSnapshotKey(userId)`, `notificationQueryKeys.family(familyId)` |
| `fixedPayment` | superset de `fixed` + `expenses` (el pago crea un expense vía trigger DB) |
| `income` | `incomeEventQueryKeys.list/cycleSum`, `familyFinanceQueryKey(familyId)`, `homeSnapshotQueryKey(userId)`, `controlIntelligenceQueryKey(familyId)`, `controlSnapshotKey(userId)` |
| `savings` | `savingsGoalQueryKey(familyId)`, `homeSnapshotQueryKey(userId)`, `controlIntelligenceQueryKey(familyId)`, `controlSnapshotKey(userId)` |
| `notifications` | `notificationQueryKeys.family(familyId)`, `homeSnapshotQueryKey(userId)` (por el badge unread) |
| `wrapped` | `controlIntelligenceQueryKey(familyId)`, `homeSnapshotQueryKey(userId)`, `monthlyEditionsQueryKey(familyId)` |

**Compatibilidad con el helper viejo.** `invalidateFamilyBudgetData` queda como wrapper que llama a `syncAllAfterMutation` con scopes equivalentes; los call-sites se migran uno por uno sin rotura.

### 2. Patrón optimistic — tres moldes

**Molde A — entidad simple en lista** (`expense` create/update/delete, `fixed` create/delete):

```ts
onMutate: async (input) => {
  await qc.cancelQueries({ queryKey: expenseQueryKeys.family(familyId) })
  const previous = {
    list: qc.getQueryData(expenseQueryKeys.list(familyId, undefined)),
    recent: qc.getQueryData(expenseQueryKeys.recent(familyId, 6)),
    // ...todas las variantes que el seed popula
  }
  qc.setQueryData(expenseQueryKeys.list(...), (old) => mutate(old, input))
  qc.setQueryData(expenseQueryKeys.recent(...), (old) => mutate(old, input))
  return { previous }
}
onError: (err, input, ctx) => {
  if (ctx?.previous) restoreAll(qc, ctx.previous)
  showRetryToast(input, () => mutation.mutate(input))
}
onSettled: () => syncAllAfterMutation(qc, { familyId, userId, scopes: ['expenses'] })
```

Para `create`: insertar al tope de la lista con un id "tentativo" (timestamp + random); cuando el server responde, la cache se invalida → refetch trae el id real. Para `update`: map sobre la lista. Para `delete`: filter.

**Molde B — payload bundleado** (`useMarkCycleWrappedSeen`, `useUpsertSavingsGoal`):

```ts
onMutate: async (input) => {
  await qc.cancelQueries({ queryKey })
  const previous = qc.getQueryData(queryKey)
  qc.setQueryData(queryKey, patchBundle(previous, input))
  return { previous }
}
// resto idéntico al Molde A
```

**Molde C — agregados derivados** (totals, counts, projections del cliente). NO se actualizan optimistamente — derivan de la lista que ya está pintada optimistamente. Se invalidan en `onSettled` y refetchean.

### 3. Error UX — toast con retry

Pasos:
1. Chequear si existe un sistema de toasts en la app. Si sí, reusar.
2. Si no, agregar `mobile/lib/toast-bus.ts` minimal (emitter + `<ToastHost />` en `mobile/components/root/app-stack-shell.tsx`).

API del bus:
```ts
toast.error(message: string, opts?: { actionLabel?: string; onAction?: () => void })
toast.success(message: string, opts?: { duration?: number })
```

Copy neutralizado, sin voseo: *"No se pudo guardar el gasto."* / acción *"Reintentar"*. Retry re-ejecuta `mutation.mutate(originalInput)`.

### 4. Fix del snapshot clobbering

El helper invalida `homeSnapshotQueryKey(userId)` y `gastosSnapshotQueryKey` (prefix por `familyId`) en todos los scopes relevantes. Cuando el snapshot refetcha luego de una mutación:

1. El RPC del server devuelve los datos frescos (incluyendo lo recién mutado).
2. `seedCaches` corre y re-siembra los caches con la verdad del server.
3. El optimistic update queda **convergido** al server (si difiere, gana el server).

No hace falta cambiar `seedCaches` para que "no clobberee" — el clobber pasa con datos viejos del snapshot. Con la invalidación adecuada, el clobber pasa con datos FRESCOS, que es exactamente lo que queremos como red de seguridad.

## Scope de mutaciones a tocar

| Mutación | Estado actual | Acción | Scope helper |
|---|---|---|---|
| `useCreateExpense` | sin optimista | + onMutate (A) | `['expenses']` |
| `useUpdateExpense` | sin optimista | + onMutate (A) | `['expenses']` |
| `useDeleteExpense` | optimista ✅ | reemplazar invalidate por syncAll | `['expenses']` |
| `useCreateFixedExpense` | sin optimista | + onMutate (A) | `['fixed']` |
| `useUpdateFixedExpense` | sin optimista | + onMutate (A) | `['fixed']` |
| `useUpdateFixedExpenseStatus` | sin optimista | + onMutate (A — toggle status) | `['fixed']` |
| `useRecordFixedExpensePayment` | sin optimista | + onMutate (insertar payment) | `['fixedPayment']` |
| `useDeleteFixedExpense` | sin optimista | + onMutate (A) | `['fixed']` |
| `useUpsertSavingsGoal` | sin optimista | + onMutate (B) | `['savings']` |
| `useCreateIncomeEvent` | sin optimista | + onMutate (A) | `['income']` |
| `useDeleteNotification` | optimista ✅ | reemplazar invalidate por syncAll | `['notifications']` |
| `useDeleteAllNotifications` | optimista ✅ | reemplazar invalidate por syncAll | `['notifications']` |
| `useMarkCycleWrappedSeen` | optimista ✅ | reemplazar invalidate por syncAll | `['wrapped']` |

## Fuera de scope (explícito)

- Cross-device sync (el realtime existente cubre Home/Gastos/Notifications).
- Migrar a una abstracción wrapper genérica (`useOptimisticEntityMutation`) — alta variabilidad de shapes lo desaconseja.
- Cambiar `seedCaches` para que sea merge-en-vez-de-overwrite — innecesario con la invalidación adecuada.
- Achievements / streaks no se actualizan optimistamente (son derivados del server con triggers DB); el invalidate cascada los refetcha.

## Testing

- **Primary QA:** `tsc --noEmit` + `eslint` estrictos. Es un cambio de tipos y wiring; el typecheck es el primer filtro.
- **Manual en device:** happy paths del usuario (agregar gasto → ver instant en Home actividad + Gastos + Control; pagar fijo → idem en Fijos + Home + Control; borrar gasto → idem). Simular error (sin red) → rollback + toast aparece.
- **Tests automáticos:** no es prioridad. La memoria documenta que vitest no tiene React renderer; testear hooks con estado es frágil. Skipeo tests automáticos para esta integración.

## Plan de migración (resumen)

1. Crear `sync-after-mutation.ts` (+ mapa scope→keys).
2. Crear/identificar toast bus + ToastHost.
3. Reemplazar `invalidateFamilyBudgetData` por wrapper que llama al nuevo helper.
4. Convertir mutaciones que YA tienen optimista (delete expense, delete notif, mark wrapped seen) — solo cambian a syncAll.
5. Agregar optimista a las que faltan (create/update expense, las 5 de fixed, savings, income).
6. typecheck + lint.
7. Commit temático + merge.

Detalle file-by-file va al plan de implementación (writing-plans).
