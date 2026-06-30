# SECURITY DEFINER function grants — leak class que se coló del "100% clean"

> **Fecha**: 2026-06-30
> **Tipo**: hotfix de seguridad — cierra una clase de exposición que sobrevivió al audit-saturated verdict.
> **Status**: 🟢 cerrado y verificado en prod (project `xaquigyhylzvuyfslkqq`).
> **Relacionado**: extiende [`2026-06-11-security-hardening-FINAL.md`](2026-06-11-security-hardening-FINAL.md) · sigue a la migración `20260630010000_lock_notification_relay_functions.sql`.

## TL;DR

Varias funciones `SECURITY DEFINER` del esquema `public` quedaban **ejecutables por `authenticated` (y `anon`)** pese a ser helpers internos (cron / relay / subscripciones). Operan datos **cross-tenant** (de todas las familias/usuarios) **sin chequeo interno de `auth.uid()`/membership**. Misma clase que `list_unpushed_notifications()` (arreglada en `20260630010000`), pero más amplia.

- **119** funciones `SECURITY DEFINER` eran ejecutables por `authenticated` (la mayoría son RPCs legítimas con guard interno — el patrón Supabase aceptado).
- **40** resultaron genuinas exposiciones internas → **39 revocadas** + **1 (`db_health_snapshot`) blindada con guard** en `20260630020000_lock_internal_security_definer_functions.sql`.
- Fix verificado: `has_function_privilege('authenticated'/'anon', …)` = false en las 39; `service_role` conserva execute; scan global residual = vacío.

## Causa raíz — DOS formas de exposición (no una)

`revoke … from public` **no** quita los grants explícitos por rol que Supabase aplica por *default privileges*. Pero además hay un segundo caso simétrico que mordió en este fix:

| Forma | ACL (`pg_proc.proacl`) | Por qué `revoke from anon, authenticated` falla |
|---|---|---|
| **1. grant por rol** (Supabase default privileges) | `{… anon=X/postgres, authenticated=X/postgres …}` | (no falla) `revoke from anon, authenticated` lo limpia. Pero `revoke from public` **no** lo tocaba — la trampa original. |
| **2. grant a PUBLIC** (default de Postgres al crear la función) | `{=X/postgres, …}` (grantee vacío = PUBLIC) | `revoke from anon, authenticated` es **NO-OP**; `authenticated` hereda EXECUTE vía PUBLIC. Hay que `revoke from public`. |

→ La forma robusta e idempotente es **`revoke execute on function … from public, anon, authenticated;`** (cubre ambas). El primer intento de este fix, que revocaba solo de `anon, authenticated`, dejó 12 funciones (todas las `cron_emit_*`, `emit_notification`, `emit_notifications_bulk_returning`, `advance_streak`, `user_local_timezone`) abiertas porque estaban en el caso 2.

## Exposiciones más relevantes

- `list_pending_notifications(text)` — devolvía título/body/`family_id`/`user_id` de notificaciones pendientes de **todas** las familias (idéntico a `list_unpushed_notifications`).
- `apply_subscription_transaction(...)` — webhook StoreKit (service_role): un `authenticated` podía **forjar el entitlement / estado de suscripción de cualquier familia**.
- `cron_*` (22) — disparar emisión masiva de notificaciones, cierres de ciclo, purgas/prunes globales.
- `emit_notification` / `emit_notifications_bulk(_returning)` / `mark_notifications_pushed` / `dispatch_notifications_kind` — relay interno (solo orchestrator vía service_role).
- `resolve_entitlement(uuid)` / `user_local_timezone(uuid)` / `user_current_cycle_start(uuid)` — leer entitlement / timezone / ciclo de cualquier usuario o familia.
- `advance_streak` / `_advance_streak_internal` / `recompute_user_streak` / `close_monthly_cycle` / `try_close_previous_cycle` / `compute_control_snapshot` / `enforce_rate_limit_for_user` — mutadores internos sin guard.

`db_health_snapshot()` **no se revocó** (la pantalla "DB Health" `__DEV__` la llama con el cliente authenticated del owner, y el test de integración vía service_role): se le agregó el guard `is_super_admin() OR service_role/postgres` (mismo patrón que `admin_search_users` / `audit_service_role_write`).

## No tocado (correctamente)

- Funciones con guard interno (`auth.uid()` y/o membership inline) → patrón aceptado. Incluye `gastos_snapshot`, `home_snapshot`, `emit_user_notification` (chequea misma familia), `family_block/remove/transfer/unblock_member`, `record_/revert_fixed_expense_payment`, `record_subscription_usage`, `mark_cycle_wrapped_seen`, `admin_search_users`, `admin_set_mvp`, etc.
- Funciones **trigger** `SECURITY DEFINER` (`tr_award_*`, `handle_*`, `guard_*`…) → no invocables como RPC y el firing no chequea EXECUTE; no son vector.

## Por qué las llamadas internas siguen funcionando

El chequeo de EXECUTE en llamadas anidadas (función definer → función definer, pg_cron, edge functions) se hace contra el owner (`postgres`) o `service_role`, que conservan su grant explícito. Solo se cerró la puerta a `anon`/`authenticated`.

## Lección

`has_function_privilege('authenticated', oid, 'execute')` es el chequeo correcto para auditar esta clase (captura ambas formas, grant-por-rol y PUBLIC). Pero el **revoke** tiene que ser `from public, anon, authenticated` — revocar solo de los roles deja abierta la variante PUBLIC. Auditar con `proacl` para distinguir `=X` (PUBLIC) de `role=X`.
