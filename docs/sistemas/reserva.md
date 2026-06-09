# Reserva — comportamiento real

> Estado: vivo en prod desde 2026-06-08. Stash administrable que acumula sobrantes guardados al cerrar meses.

## Qué es

`family_finance.monthly_reserve_amount` (numeric, `>= 0`) es un stash sin destino — plata aparte del flujo del mes en curso y aparte de la meta. Se acumula cuando el user elige la decisión `reserva` al cerrar un mes (ver [`month-close-decision.md`](month-close-decision.md)) y se administra desde Control v2 → "Tu Alcancía".

## Modelo de datos

```sql
-- family_finance
add column monthly_reserve_amount numeric(12,2) not null default 0
  check (monthly_reserve_amount >= 0)
```

Introducida por [`supabase/migrations/20260605120000_month_close_decision.sql`](../../supabase/migrations/20260605120000_month_close_decision.sql).

**Nunca escrita desde el upsert de family-finance del cliente** — el modelo del cliente la strippea explícitamente en el repository para evitar que un upsert "normal" la pise. Sólo los RPCs `apply_month_close_decision` (rama `reserva`) y `apply_reserve_decision` la mutan.

## Visualización

### Home — chip amber en el hero

[`mobile/components/home/home-hero-card.tsx:474-517`](../../mobile/components/home/home-hero-card.tsx). Render condicional cuando `monthlyReserveAmount > 0`. Icon `account-balance-wallet`, color amber/gold:

```ts
// Antes: indigo (igual que el chip "+$X sumado al mes")
// Owner feedback (CR v2 M6): no se distinguían visualmente.
// Fix: amber/gold para diferenciar del cycle-acumulado.
```

Copy: `"Reserva $X"`.

### Settings — sección read-only

[`mobile/screens/settings/settings-screen.tsx:974`](../../mobile/screens/settings/settings-screen.tsx). Read-only — surface puramente informativa; la administración real vive en Control v2.

### Control v2 — ReserveBlock

[`mobile/components/control-v2/control-v2-alcancia-card.tsx:471+`](../../mobile/components/control-v2/control-v2-alcancia-card.tsx) (`ReserveBlock`, self-contained, nullable).

Banner indigo con 2 CTAs:

- **"Sumar al mes"** — abre `NumericEditSheet`. Monto editable, pre-fill con la reserva total. Dispara `apply_reserve_decision({ amount, target: 'cycle' })`.
- **"A una meta"** — si hay meta activa: abre `NumericEditSheet` análogo + dispara con `target: 'meta'` y el `metaGoalId`. Si no hay meta: abre el wizard de creación con `pendingReserveAfterCreate` armado para aplicar el aporte automático post-create. Si la meta existe pero está pausada: Alert pidiendo reactivar primero.

ReserveBlock se renderea también en el **empty state** del alcancía card (commit `d1b65aa`) — antes la reserva quedaba inaccesible cuando la familia no tenía días suficientes para mostrar el vault principal.

## RPC `apply_reserve_decision`

Migración canónica vigente: [`20260608040000_apply_reserve_atomic_where_guard.sql`](../../supabase/migrations/20260608040000_apply_reserve_atomic_where_guard.sql) (V3 con WHERE-guard atomic).

```sql
apply_reserve_decision(
  p_amount numeric,
  p_target text,           -- 'cycle' | 'meta'
  p_meta_goal_id uuid default null
) returns void
```

### Garantías

1. **Auth**: requiere `auth.uid()`.
2. **Amount válido**: `p_amount > 0`.
3. **Target válido**: `p_target in ('cycle', 'meta')`. `meta` requiere `p_meta_goal_id`.
4. **Family ownership**: deriva `family_id` desde `family_members` del caller con filtro `role <> 'blocked'`. **Asunción**: single-family-per-user (modelo actual del producto). Cuando se introduzca multi-family real, el RPC debe migrar a aceptar `p_family_id uuid` explícito.
5. **Goal ownership** (target='meta'): valida `savings_goals.family_id == family_id`.
6. **Atomic WHERE-guard**:
   ```sql
   update family_finance
      set monthly_reserve_amount = coalesce(monthly_reserve_amount, 0) - p_amount,
          ...
    where family_id = v_family_id
      and coalesce(monthly_reserve_amount, 0) >= p_amount;
   get diagnostics v_updated = row_count;
   if v_updated = 0 then raise exception 'amount exceeds reserve'; end if;
   ```
   Bajo MVCC, dos transactions concurrentes con `p_amount == reserva total` no pueden ambas pasar la guarda — la segunda ve el resultado de la primera al re-evaluar el WHERE. Hoy es teórico (single device por user), pero la regresión silenciosa al introducir multi-device sería seria.

### Branches

| `p_target` | Side effect |
|---|---|
| `cycle` | atomic UPDATE: `monthly_reserve_amount -= p_amount`; `current_cycle_starting_balance = coalesce(balance, coalesce(monthly_income, 0)) + p_amount`. El coalesce con `monthly_income` preserva el sueldo cuando el user no overrideó previamente el balance — mismo idiom que `apply_month_close_decision` rama acumular. |
| `meta` | atomic UPDATE de `monthly_reserve_amount -= p_amount`; segundo UPDATE de `savings_goals.current_amount += p_amount` con guard de family ownership. |

## UX flow detallado

### Caso 1 — Sumar al mes

1. Tap "Sumar al mes" → abre `NumericEditSheet` con monto pre-filled = reserva total.
2. User edita opcional (parcial) — máximo aceptado = reserva total. Submit.
3. Mutation `useApplyReserveDecision` dispara con `{ amount, target: 'cycle' }`.
4. On success invalida `family-finance`, `savings-goal`, `cycle-acumulado`, `home-snapshot`.
5. Chip Reserva del home actualiza (o desaparece si quedó en 0); chip "+$X sumado al mes" aparece (porque el balance se override).

### Caso 2 — A la meta activa

1. Tap "A una meta" con goal activo → `NumericEditSheet` con pre-fill.
2. Submit dispara mutation con `{ amount, target: 'meta', metaGoalId }`.
3. On success — invalida iguales que caso 1. Reserva decrece, `current_amount` de la meta crece.

### Caso 3 — A meta inexistente

1. Tap "A una meta" sin goal → `setPendingReserveAfterCreate(monthlyReserveAmount)`, abre `CreateSavingsGoalWizardSheet`.
2. Wizard create exitoso → `onCreated(newGoal)` callback.
3. ReserveBlock auto-dispara la mutation con `{ amount: pendingReserveAfterCreate, target: 'meta', metaGoalId: newGoal.id }`.
4. `setPendingReserveAfterCreate(null)` limpia el estado intermedio.

### Caso 4 — Meta existe pero pausada

1. Tap "A una meta" → detect `goal.isActive === false`.
2. Alert "Tu meta '...' está inactiva. Activala con el botón 'Activar meta' de arriba y volvé a aportar."
3. User va al CTA "Activar meta" del alcancía card → activate inline → reintenta el aporte.

## Hook `useApplyReserveDecision(familyId)`

[`mobile/features/month-close/use-apply-reserve.ts`](../../mobile/features/month-close/use-apply-reserve.ts).

Builder `buildApplyReserveMutation(queryClient, familyId)` separable del React layer — vitest puede testear el shape sin `useMutation`.

Invalidaciones on success:
- `family-finance` (fuente de `monthly_reserve_amount` y `current_cycle_starting_balance`)
- `savings-goal` (current_amount cuando target='meta')
- `cycle-acumulado` (hero del Home consulta acá para mostrar contexto positivo)
- `home-snapshot` (chip del Home se hidrata desde acá)

## Carga inicial — `home_snapshot` payload

[`supabase/migrations/20260608010000_home_snapshot_includes_monthly_reserve.sql`](../../supabase/migrations/20260608010000_home_snapshot_includes_monthly_reserve.sql) — bugfix: el RPC `home_snapshot` enumera columnas explícitamente vía `jsonb_build_object` y nunca se actualizó cuando se sumó `monthly_reserve_amount`. Resultado: el snapshot seedaba `family-finance` cache SIN la reserva → chip nunca aparecía después del primer paint / pull-to-refresh. Esta migración reescribe el body del RPC (mismo cuerpo + 1 línea agregada).

## Archivos relevantes

### Cliente

- Hook: [`mobile/features/month-close/use-apply-reserve.ts`](../../mobile/features/month-close/use-apply-reserve.ts)
- ReserveBlock (UI): [`mobile/components/control-v2/control-v2-alcancia-card.tsx:471+`](../../mobile/components/control-v2/control-v2-alcancia-card.tsx)
- Chip Home: [`mobile/components/home/home-hero-card.tsx:474-517`](../../mobile/components/home/home-hero-card.tsx)
- Visibilidad Settings: [`mobile/screens/settings/settings-screen.tsx:974+`](../../mobile/screens/settings/settings-screen.tsx)
- Model strip de `monthly_reserve_amount` en upsert: [`mobile/features/finance/family-finance.repository.ts:67`](../../mobile/features/finance/family-finance.repository.ts) y [`family-finance.model.ts:320`](../../mobile/features/finance/family-finance.model.ts)

### DB

- Column intro: [`20260605120000_month_close_decision.sql`](../../supabase/migrations/20260605120000_month_close_decision.sql)
- home_snapshot fix: [`20260608010000_home_snapshot_includes_monthly_reserve.sql`](../../supabase/migrations/20260608010000_home_snapshot_includes_monthly_reserve.sql)
- RPC v1: [`20260608000000_apply_reserve_decision.sql`](../../supabase/migrations/20260608000000_apply_reserve_decision.sql)
- RPC v2 (H1+H2 hardening): [`20260608030000_harden_reserve_and_acumular_atomic.sql`](../../supabase/migrations/20260608030000_harden_reserve_and_acumular_atomic.sql)
- RPC v3 (atomic WHERE-guard): [`20260608040000_apply_reserve_atomic_where_guard.sql`](../../supabase/migrations/20260608040000_apply_reserve_atomic_where_guard.sql)

<!-- ✓ Sincronizado contra código el 2026-06-08 -->
