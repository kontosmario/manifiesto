# Push Notification Consolidation (anti-spam) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar el spam de push notifications consolidando los disparadores que hoy mandan una notificación por ítem, con la regla "digest cuando son >2".

**Architecture:** Los crons emiten filas vía `list_pending_notifications` / `cron_detect_*`; el orchestrator y `send-family-push` hacen fan-out fiel (1 push por fila × token). Por lo tanto, **reducir las filas que emite la DB reduce las push automáticamente** — los fixes de backend NO tocan el orchestrator ni el cliente. Los disparos del lado del cliente (`sendFamilyPush` en loops) se consolidan en el propio cliente.

**Tech Stack:** Supabase Postgres (plpgsql migrations), React Native + Expo (TypeScript), Expo push vía edge functions.

## Global Constraints

- **Regla de consolidación:** 1–2 ítems → notificación individual (copy actual). **>2 (3+) → UNA sola** notificación digest por familia/usuario.
- **Timezone:** todo lo de fechas usa `America/Argentina/Buenos_Aires` (`v_today_ar`).
- **Copy:** español.
- **Deploy backend:** migraciones SQL vía `npm run supabase:remote:db:push`. Estos cambios son a funciones SQL (`list_pending_notifications`, `cron_detect_zombies`), **NO** edge functions → no requiere `supabase:functions:check` ni redeploy del orchestrator.
- **Backend = vive ya** (sin build). **Cliente = requiere build** (OTA bloqueado).
- **Verificación SQL:** deploy + `select * from list_pending_notifications('<kind>')` / llamar la función y observar las filas (vía Management API read-only con el token de `.env.supabase`).

## File Structure

- `supabase/migrations/20260621010000_fixed_upcoming_digest.sql` — CREATE OR REPLACE `list_pending_notifications`, rama `fixed_upcoming` consolidada (Task 1).
- `supabase/migrations/20260621020000_zombie_digest.sql` — CREATE OR REPLACE `cron_detect_zombies` consolidado (Task 2).
- `mobile/features/subscriptions-zombie/use-zombie-push-sync.ts` — neutralizar el push cliente de zombies (Task 2, anti doble-push).
- `mobile/features/insights/use-advisor-notification-sync.ts` — consolidar señales del asistente >2 (Task 3).
- `mobile/features/import-review/use-confirm-import.ts` + `mobile/features/income/use-income-events.ts` — un solo push al cerrar el import (Task 4).
- `docs/sistemas/notifications.md` — documentar la regla de consolidación (en cada task que aplique).

---

### Task 1: Fijos por vencer — digest >2 (`fixed_upcoming`)

**Files:**
- Create: `supabase/migrations/20260621010000_fixed_upcoming_digest.sql`
- Reference (rama actual): `supabase/migrations/20260620170000_notifications_audit_quickwins.sql:209-231`

**Interfaces:**
- Produces: `list_pending_notifications(p_kind text)` con la misma firma `RETURNS TABLE(family_id uuid, user_id uuid, title text, body text, kind text, severity text, metadata jsonb, dedup_key text)`. Solo cambia la rama `fixed_upcoming`.

- [ ] **Step 1: Escribir la migración** que hace CREATE OR REPLACE de `list_pending_notifications` con la rama `fixed_upcoming` reescrita. **Todas las demás ramas quedan idénticas** a 20260620170000 (copiar el cuerpo entero, cambiar solo `fixed_upcoming`). La rama nueva:

```sql
elsif p_kind = 'fixed_upcoming' then
  return query
  with due as (
    select
      fe.family_id, fe.id, fe.name, fe.amount, fe.next_due_on,
      row_number() over (partition by fe.family_id order by fe.next_due_on, fe.amount desc nulls last) as rn
    from public.fixed_expenses fe
    where coalesce(fe.status, 'active') = 'active'
      and (
        fe.next_due_on between v_today_ar and v_today_ar + 1
        or (coalesce(fe.notify_days_before, 0) > 1
            and fe.next_due_on = v_today_ar + coalesce(fe.notify_days_before, 0))
      )
  ),
  agg as (
    select
      family_id,
      count(*) as cnt,
      sum(coalesce(amount, 0)) as total,
      string_agg(case when rn <= 3 then coalesce(nullif(btrim(name), ''), 'Compromiso') end, ', ' order by rn) as top_names
    from due group by family_id
  )
  -- 1–2 fijos: una fila por fijo (copy individual actual)
  select
    d.family_id, null::uuid,
    'Gasto fijo: ' || coalesce(nullif(btrim(d.name), ''), 'Compromiso')
      || ' vence ' || (case when d.next_due_on = v_today_ar then 'hoy'
                            when d.next_due_on = v_today_ar + 1 then 'mañana'
                            else 'en ' || (d.next_due_on - v_today_ar) || ' días' end),
    '$' || to_char(round(coalesce(d.amount, 0)), 'FM999,999,999'),
    'fixed_upcoming', 'warning',
    jsonb_build_object('route', '/fixed-expenses', 'fixed_expense_id', d.id, 'amount', d.amount, 'due_on', d.next_due_on),
    'fixed_upcoming:' || d.id::text || ':' || v_today_ar::text
  from due d join agg a on a.family_id = d.family_id
  where a.cnt <= 2
  union all
  -- >2 fijos: UN digest por familia
  select
    a.family_id, null::uuid,
    'Tenés ' || a.cnt || ' gastos fijos por vencer',
    a.top_names || (case when a.cnt > 3 then ' y ' || (a.cnt - 3) || ' más' else '' end)
      || ' · total $' || to_char(round(a.total), 'FM999,999,999'),
    'fixed_upcoming', 'warning',
    jsonb_build_object('route', '/fixed-expenses', 'count', a.cnt, 'total', a.total),
    'fixed_upcoming_digest:' || a.family_id::text || ':' || v_today_ar::text
  from agg a
  where a.cnt > 2;
```

Notas: `string_agg(case when rn<=3 then name end ...)` ignora los NULL → primeros 3 nombres. `dedup_key` distinto (`fixed_upcoming_digest:`) evita colisión con el por-fijo y se dedup por familia/día.

- [ ] **Step 2: Deploy** — `npm run supabase:remote:db:push`. Esperado: "Applying migration 20260621010000…" + "Finished".

- [ ] **Step 3: Verificar** vía Management API: llamar `select title, body, dedup_key from list_pending_notifications('fixed_upcoming') where family_id = '61bdc187-0053-4a99-93c8-57da12013986'`. La familia de kontosmario tiene ≥3 fijos venciendo (Claude 21/06, Netflix+Apple aye 22/06) → esperado: **1 sola fila** con title "Tenés N gastos fijos por vencer" y dedup_key `fixed_upcoming_digest:…`. Confirmar que NO hay filas `fixed_upcoming:<id>:…` individuales para esa familia.

- [ ] **Step 4: Doc** — agregar a `docs/sistemas/notifications.md` una línea en la sección de fixed_upcoming: "Consolidación: >2 fijos/día → 1 digest family-wide (`fixed_upcoming_digest`)."

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260621010000_fixed_upcoming_digest.sql docs/sistemas/notifications.md
git commit -m "fix(notifs): fijos por vencer en 1 digest cuando son >2 (anti-spam)"
```

---

### Task 2: Zombies — digest >2 + eliminar el doble-push

**Files:**
- Create: `supabase/migrations/20260621020000_zombie_digest.sql`
- Reference (loop actual): `supabase/migrations/20260424150000_control_intelligence.sql` (`cron_detect_zombies`)
- Modify: `mobile/features/subscriptions-zombie/use-zombie-push-sync.ts` (neutralizar el push cliente)

**Interfaces:**
- Produces: `cron_detect_zombies()` returns void — misma firma, ahora consolida.

- [ ] **Step 1: Escribir la migración** CREATE OR REPLACE `cron_detect_zombies()`. En vez del `for v_rec in … loop perform emit_notification` per-fijo: primero juntar en un array los zombies elegibles por familia (status active, periodic, last_used_at null o <60d, ≥2 pagos, no notificado en 14d), y por cada familia:
  - Si hay **1–2** zombies → `emit_notification` individual (copy actual `'Suscripción sin usar'`).
  - Si hay **>2** → un solo `emit_notification`: title `'Suscripciones sin usar'`, body `'Tenés N suscripciones sin movimiento · $TOTAL/mes'`, metadata `{route:'/fixed-expenses', count:N, total:…, kind_digest:true}`, dedup vía el guard de 14d sobre un metadata marker family-wide.
  - Implementación: CTE/temp con los zombies filtrados (incluyendo el guard de "≥2 pagos" y el "no notificado 14d" — para el digest, chequear que no exista un `zombie_alert` digest family-wide en 14d). Emitir con `emit_notification` por familia.

- [ ] **Step 2: Deploy** — `npm run supabase:remote:db:push`.

- [ ] **Step 3: Verificar** — `select public.cron_detect_zombies();` (impersonando service_role no hace falta; es security definer) en una transacción con ROLLBACK, y observar `notifications` emitidas para una familia con >2 zombies (o validar la lógica con un EXPLAIN/seed). Confirmar 1 fila digest por familia con >2.

- [ ] **Step 4: Neutralizar el doble-push del cliente** en `use-zombie-push-sync.ts`: hoy el `for item of feed → sendFamilyPush` manda `subscription_zombie` para el MISMO fenómeno que el server `zombie_alert`. Quitar el `sendFamilyPush` del loop (dejar solo la marca local de "ya visto" / el feed in-app), de modo que el push venga SOLO del server (ya consolidado). Validar con `npm run typecheck` + `npx eslint <file>`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260621020000_zombie_digest.sql mobile/features/subscriptions-zombie/use-zombie-push-sync.ts
git commit -m "fix(notifs): zombies en 1 digest >2 + eliminar doble-push (server vs cliente)"
```

---

### Task 3: Señales del Asistente — consolidar push >2 (cliente)

**Files:**
- Modify: `mobile/features/insights/use-advisor-notification-sync.ts` (`Promise.allSettled(eligible.map(...sendFamilyPush))`, ~líneas 238-253)

- [ ] **Step 1:** Antes del fan-out, si `eligible.length > 2`: mandar **una sola** `sendFamilyPush` con title `'Tenés N alertas en Control'`, body con el resumen de las primeras + `url='/(app)/(tabs)/control'`, y bumpear el cooldown de TODAS las señales incluidas (mismo `markNotified` que el loop). Si `eligible.length <= 2`: mantener el fan-out individual actual.

- [ ] **Step 2:** Validar — `npm run typecheck`, `npx eslint mobile/features/insights/use-advisor-notification-sync.ts`, `npx vitest run` (si hay test del sync), `npx expo export --platform ios`.

- [ ] **Step 3: Commit**

```bash
git add mobile/features/insights/use-advisor-notification-sync.ts
git commit -m "fix(notifs): señales del asistente en 1 push cuando son >2"
```

---

### Task 4: Import de ingresos — un push al cerrar (cliente)

**Files:**
- Modify: `mobile/features/income/use-income-events.ts` (`createIncome` per row → `sendFamilyPush`)
- Modify: `mobile/features/import-review/use-confirm-import.ts` (cierre del wizard)

- [ ] **Step 1:** Agregar un flag `skipPush` (o `silent`) a `createIncome` para suprimir el `sendFamilyPush` per-row durante el import. `use-confirm-import.ts` pasa `skipPush: true` al crear cada ingreso.

- [ ] **Step 2:** Al cerrar el import (donde ya hace el bulk-invalidate, `use-confirm-import.ts:64-74`), si se crearon >2 ingresos, mandar **una** `sendFamilyPush` consolidada: `'{actor} importó N movimientos'`. Si ≤2, mandar individuales (o ninguno — seguir el comportamiento previo).

- [ ] **Step 3:** Validar — typecheck + eslint + vitest + `npx expo export --platform ios`.

- [ ] **Step 4: Commit**

```bash
git add mobile/features/income/use-income-events.ts mobile/features/import-review/use-confirm-import.ts
git commit -m "fix(notifs): import de ingresos manda 1 push al cerrar, no uno por ingreso"
```

---

## Orden de ejecución

1. **Task 1 (fijos)** — el caso explícito del owner. Backend, vive ya.
2. **Task 2 (zombies)** — 🔴 ALTO, mismo patrón SQL + el doble-push.
3. **Task 3 (asistente)** — cliente.
4. **Task 4 (import)** — cliente.

Tasks 1-2 son backend → se prueban y viven sin build. Tasks 3-4 son cliente → entran en el próximo build.
