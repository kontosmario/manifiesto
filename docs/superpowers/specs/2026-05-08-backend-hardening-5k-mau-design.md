# Backend Hardening para 5000 MAU — Design Spec

**Fecha:** 2026-05-08
**Owner:** Mario
**Approach elegido:** B (Recomendado, ver brainstorming notes abajo)
**Plan target:** Supabase Pro + Compute Medium (1 GB RAM, 2 vCPU shared)

---

## 0. Glosario crítico

**"Mes" / "ciclo" / "ciclo de cobro" son lo mismo en este documento.** Manifiesto opera en ciclos de cobro del usuario, no en meses calendario. Cada familia tiene un `family_finance.salary_payment_day` que define cuándo arranca su ciclo. El cierre de ciclo (`close_monthly_cycle`) corre cuando el usuario confirma el cobro del próximo sueldo (trigger en `family_finance.last_salary_confirmed_at`) o por el cron sweeper diario, no el día 1 calendario.

Implicaciones:

- "Borrar expenses 14 días post-ciclo" = 14 días después de que `archived_at` quedó seteado por `close_monthly_cycle`.
- "Retención 12 meses de `monthly_summaries`" = 12 filas por familia (uno por ciclo cerrado), no 12 meses calendario.
- "Retención 60 días de `fixed_expense_price_history`" = sí calendario, porque trackea cambios de precio que pueden ocurrir cualquier día.
- "Cron de retención mensual" = primer día de cada mes calendario (NO atado a ciclos), porque limpia data cross-familia.

---

## 1. Goals

- Sostener **5.000 MAU activos** en plan Pro + Compute Medium con margen ≥30% sobre los límites duros.
- **Cero downtime** en la migración (todas las migraciones idempotentes y reversibles).
- **Cero cambios en firmas de RPCs públicas** consumidas por el cliente: `bootstrap_family`, `join_family_by_code`, `peek_family_by_code`, `record_fixed_expense_payment`, `home_snapshot`, `monthly_rollup` (alias de `close_monthly_cycle`/`try_close_previous_cycle`), `leave_current_family`, `gastos_split_endpoints`, `member_income_contribution`, `family_invites`, `advisor_signal_dismissals`.
- Mantener arquitectura por capas (CODE_RULES.md): nada de Supabase desde screens/components.
- Sin servicios externos nuevos (sin Redis, sin colas).

## 2. Non-Goals

- No migrar a otro proveedor.
- No introducir particionado de tablas (queda para "ronda 2" si la proyección lo pide).
- No reescribir el motor del Asistente en Edge Function (queda para ronda 2).
- No tocar la UI más allá de cambios estrictamente requeridos para egress/cache.
- No cambiar la estructura de `monthly_summaries` (ya cubre el caso anual).

## 3. Diagnóstico actual (con números proyectados)

### 3.1 Volumen esperado a 5K MAU

Asumiendo 5.000 familias activas (1 familia ≈ 1 MAU pagador, miembros adicionales no compran), 150 transacciones por familia/ciclo (60 gastos variables + 20 fijos + ~70 cargas adicionales del resto del grupo).

| Tabla | Filas vivas a 5K MAU | Bytes/fila aprox | Tamaño |
|---|---|---|---|
| `expenses` (solo ciclo en curso + 14 días gracia post-cierre) | ~1.1M (1.5 ciclos peak) | ~250 | **~280 MB** |
| `notifications` (30 días, antes 90d — tightened 2026-05-09) | 1.500.000 | ~400 | **~600 MB** |
| `velocity_snapshots` (6 meses) | 900.000 | ~120 | **~110 MB** |
| `fixed_expense_payments` (12 ciclos) | 1.200.000 | ~150 | **~180 MB** |
| `fixed_expense_price_history` (60 días) | ~50.000 | ~150 | **~8 MB** |
| `monthly_summaries` (12 ciclos por familia) | 60.000 | ~3 KB (JSONB) | **~180 MB** |
| `advisor_signal_dismissals` (12 meses) | 1.800.000 | ~250 | **~450 MB** |
| `home_telemetry` (30 días) | variable | ~200 | **<200 MB** |
| `user_streaks` | ~25.000 | ~200 | **~5 MB** |
| Resto (categorías, families, miembros, fixed_expenses, etc.) | <100K filas | — | **<100 MB** |
| **Total estimado DB vivo** | | | **~3–4 GB** |

Plan Pro: 8 GB DB incluido + $0.125/GB extra. Margen ~50% sobre 8 GB.

**Nota clave:** la tabla `expenses` es **drásticamente más chica** que en una arquitectura típica porque se purga al cierre de ciclo (con 14 días de gracia). Esto es el cambio que más capacidad desbloquea.

### 3.2 Egress

`home_snapshot` actual devuelve sin LIMIT: profile + family_finance + fixed_expenses + expenses (no archivados) + categorías × 2 + 80 notifications + family_members + savings_goal + fixed_expense_payments + monthly_summaries_history (6) + category_limits + velocity_today.

Estimación payload promedio por llamada: **~80 KB** (familias chicas) hasta **~250 KB** (familias activas con 150 expenses + 20 fixed + 80 notifications).

A 5.000 MAU × 5 aperturas/día × 30 días × 100 KB promedio = **~75 GB egress/mes**. Plan Pro: 250 GB. Margen ~3×, pero al borde si crece.

### 3.3 Heatmap de riesgos

| # | Componente | Riesgo | Razón | Color |
|---|---|---|---|---|
| 1 | `cron_emit_*` (notificaciones) | **CRÍTICO** | 7 jobs iterando `family_members` sin batch. A 5K familias × 4 miembros = 20K filas/job. Cada uno hace queries por fila (fixed_total, spent_today). Se solapan los slots. | 🔴 |
| 2 | `cron_close_previous_cycles` | ALTO | Itera **todas** las familias secuencialmente. Una falla y el resto sigue, pero el tiempo total escala lineal. | 🟡 |
| 3 | `home_snapshot` egress | ALTO | Sin LIMIT en arrays largos (notifications=80 ok, pero `expenses` puede crecer si algún ciclo tarda en cerrar). | 🟡 |
| 4 | RLS subqueries `family_members` | MEDIO | Política `is_family_member()` se evalúa por fila. Helper SECURITY DEFINER ya existe pero no está STABLE. | 🟡 |
| 5 | `notifications` sin retención | ALTO | 1.5M filas/mes y crece monotónico. A 6 meses son 9M filas. | 🟡 |
| 6 | `expenses` archivadas sin borrado | ALTO | `archived_at` existe pero no se borran. A 12 ciclos = ~9M filas. Decisión: hard-delete 14 días post-cierre. | 🟡→🟢 |
| 7 | Push fan-out 1-a-1 | ALTO | Cada notif = 1 invocación Edge. A 1.5M notifs/mes = revienta el límite (2M/mes Pro). | 🔴 |
| 8 | Realtime concurrent | MEDIO | Pico actual 3 conexiones; a 5K MAU posible 600-1200 simultáneas. Pro: 200. | 🟡 |
| 9 | `home_snapshot` consultado en cada navegación | MEDIO | Tanstack Query cache: revisar staleTime/gcTime. | 🟢 |

## 4. Arquitectura objetivo

### 4.1 Vista de alto nivel

```
┌──────────────── CLIENTE (mobile) ─────────────────┐
│ Tanstack Query (staleTime/gcTime tunados)         │
│ Optimistic updates "vivos sin realtime"           │
└────────────────────┬──────────────────────────────┘
                     │
                     ▼
┌──────────── DB (Supabase Postgres) ───────────────┐
│ home_snapshot (más liviano)                       │
│ velocity_snapshots (cron, ya existe)              │
│ control_snapshots (NUEVO, refresh c/6h)           │
│ monthly_summaries (perpetuo, ya existe)           │
│ db_health_snapshot (NUEVO, dev only)              │
│ Retención automática (cron mensual)               │
└────────────────────┬──────────────────────────────┘
                     │ una sola HTTP llamada/job
                     ▼
┌────────── Edge Functions ─────────────────────────┐
│ notifications-orchestrator (NUEVO)                │
│   ├─ chunkea familias                             │
│   ├─ paraleliza con Promise.all (límite 10)       │
│   └─ llama send-family-push en lote               │
│ send-family-push (refactor: acepta lote de tokens)│
└───────────────────────────────────────────────────┘
```

### 4.2 Cambios por área

#### A. Índices y RLS

**Añadir:**

- `expenses (family_id, created_at desc) where archived_at is null` ← **YA EXISTE** como `expenses_family_active_idx`. Confirmar y dejar.
- `notifications (family_id, user_id, created_at desc)` parcial `where read_at is null` para conteos rápidos de unread.
- `notifications (created_at)` para purga (cron de retención).
- `advisor_signal_dismissals (created_at)` para purga.
- `velocity_snapshots (snapshot_date)` para purga.
- `fixed_expense_payments (period_month)` parcial idx ya cubre por familia, validar plan.
- Si `family_members (user_id)` no tiene índice cubriente, agregarlo (es leído por `is_family_member` en cada RLS).

**RLS optimization:**

- Marcar helpers `is_family_member`, `is_family_owner` como `STABLE` y `LEAKPROOF` si todavía no lo están. Esto permite a Postgres llamarlas una vez por query en vez de por fila.
- Auditar políticas que hagan `EXISTS (SELECT FROM family_members WHERE …)` sin envolver en `(SELECT …)` — el envoltorio fuerza initPlan y no se reevalúa por fila.
- No tocar firmas, solo el cuerpo.

#### B. RPC: `home_snapshot` — payload trimming

Cambios al cuerpo (firma intacta, sigue retornando un mismo `jsonb` con todos los keys actuales):

1. **`expenses`**: limitar a últimas **120 filas** (~80 días con 60/mes). El cliente igual tiene `archived_at is null` filter, pero ahora con cap. Si la familia tiene más, el cliente puede pedir "ver todo el ciclo" vía un endpoint paginado existente (a verificar; si no existe, es una expansion de ronda 2 — no urgente porque el ciclo cierra y archiva).
2. **`notifications`**: ya tiene `limit 80` ✓.
3. **`fixed_expenses`**: limitar a `where status <> 'archived'` o agregar cap de 100 (típicamente <30 por familia).
4. **`family_finance`**: en vez de `to_jsonb(ff.*)` listar columnas. Hoy puede traer columnas internas que el cliente no usa (impacto pequeño, pero higiene).
5. **`monthly_summaries_history`**: ya `limit 6` ✓ y ya excluye `by_member`/`top_expense` ✓.
6. **`fixed_expense_payments`**: ya filtra por `period_month = v_period_month` ✓.

Esto baja egress promedio ~30-40% sin romper firma.

#### C. NEW RPC: `control_snapshot()` (refresh c/6h)

> **Nota:** El brief original mencionaba `control_intelligence` como RPC pública. En el código actual no existe — la Control screen lee del `home_snapshot` extendido. Para evitar romper expectativas y para tener una capa de cache, **creamos `control_snapshot()`** como RPC pública nueva. El cliente la consume opcionalmente en la pantalla Control para componer detalles que hoy se calculan client-side (causal-engine, forecast-engine).

**Tabla:** `public.control_snapshots`

```sql
create table public.control_snapshots (
  family_id uuid primary key references families(id) on delete cascade,
  -- Forecast del cierre de ciclo
  forecast_close_amount numeric(14,2),
  forecast_overshoot_pct numeric(6,2),
  -- Top 3 categorías over-budget
  over_budget_categories jsonb not null default '[]'::jsonb,
  -- Top 3 zombi candidatos
  zombie_candidates jsonb not null default '[]'::jsonb,
  -- Top miembros por gasto del ciclo
  member_pressure jsonb not null default '[]'::jsonb,
  -- Recommended actions (server-decidido)
  recommended_actions jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now()
);
```

**RPC pública nueva:**
```sql
control_snapshot() returns jsonb -- lee tabla, NO recalcula. Si stale > 12h, fallback al cálculo on-demand.
```

**Cron:**
```sql
cron_refresh_control_snapshots() -- corre cada 6h
-- Slot horario: 09:00, 15:00, 21:00 AR (evita 03:00 cuando corren rollup + velocity)
```

**Estrategia de refresh:** procesa familias en chunks de 200 con savepoint por chunk. Total esperado a 5K familias: ~25 chunks × ~5s = ~2 min total CPU/refresh. 4 refreshes/día = ~8 min/día.

**Sobre el invalidación on-write:** intencionalmente NO añadimos triggers por gasto. El user dijo "puede tardar hasta 6h en reflejar". Mantener simple.

#### D. Política de retención

Hay **dos crones distintos** para retención:

**D.1 Cron diario `cron_purge_archived_expenses()` (04:30 UTC = 01:30 AR)**

Borra físicamente los gastos variables que ya cerraron ciclo y cumplieron 14 días de gracia. Esto es el grueso del ahorro.

```sql
delete from public.expenses
where archived_at is not null
  and archived_at < now() - interval '14 days';
```

El comportamiento de `close_monthly_cycle` (que setea `archived_at = now()`) **no se cambia** — sigue siendo soft-delete. La separación entre soft-delete (al cerrar ciclo) y hard-delete (14 días después) preserva la red de seguridad y le da ventana al `cron_compute_velocity_snapshots` para empalmar la transición de ciclo (lee `archived_at` como parte de la ventana de 30 días).

**D.2 Cron mensual `cron_apply_retention_policies()` (día 1 de cada mes calendario, 04:00 UTC)**

| Tabla | Política |
|---|---|
| `notifications` | Borra `created_at < now() - interval '30 days'`. (Bajado de 90d el 2026-05-09 tras auditar uso real — el bell icon corta a 80 filas y la dedup_key cubre el caso diario; >30d era zombi storage.) |
| `velocity_snapshots` | Borra `snapshot_date < now() - interval '6 months'`. |
| `advisor_signal_dismissals` | Borra `created_at < now() - interval '12 months'`. |
| `fixed_expense_price_history` | Borra `changed_at < now() - interval '60 days'`. |
| `home_telemetry` (si existe) | Borra `created_at < now() - interval '30 days'`. |
| `monthly_summaries` | Borra rows donde la familia ya tiene **>12 ciclos** más nuevos. (Window function por `family_id` ordenado por `period_start desc`, drop rank > 12.) |
| `user_streaks` | **No purgar.** 1 fila/user. |
| `families`, `family_members`, `profiles` | **No purgar.** |
| `fixed_expenses`, `fixed_expense_payments` | **No purgar.** Configuración persistente y registro de pagos. |
| `push_subscriptions` | Borra rows con `last_used_at < now() - interval '90 days'` (si la col existe; si no, agregarla). |

Borrado en chunks de 10K filas con `DELETE … WHERE ctid IN (SELECT ctid FROM … LIMIT 10000)` para evitar long locks. Cada DELETE en su propia transacción / savepoint.

#### E. Notifications cron — refactor a Edge Orchestrator

**Patrón actual (problema):**

`pg_cron` → `cron_emit_morning_checkins()` → loop secuencial sobre 20K filas → emite N rows en `notifications` → trigger en `notifications` (si existe) → `pg_net.http_post` × N → Edge `send-family-push` × N invocaciones.

A 5K MAU: ~5K invocaciones/día × 7 jobs = **35K invocaciones/día solo de check-ins** ≈ 1M/mes. Pro plan: 2M/mes. Sin margen para nada más.

**Patrón objetivo:**

`pg_cron` → llama **1 vez** a Edge `notifications-orchestrator` → la Edge:
1. Consulta DB: lista de `(family_id, user_id, kind, payload)` candidatos para este job.
2. Chunkea de a 200.
3. Por chunk: hace `INSERT … RETURNING` masivo en `notifications` (1 round-trip).
4. Por chunk: arma payload Expo Push y llama `send-family-push` con array de tokens (1 invocación por chunk, no por usuario).
5. Total invocaciones/día: 7 jobs × ~25 chunks = **175 invocaciones/día** ≈ 5K/mes. ✅

**Migración por fases (zero downtime):**

- **Fase 1:** Crear Edge `notifications-orchestrator` y `send-family-push` v2 que acepta lote. Mantener cron viejo activo.
- **Fase 2:** Cambiar pg_cron schedule para que llame al orchestrator vía `pg_net.http_post`. Las funciones SQL `cron_emit_*` se mantienen como **read-only data builders** (las llama el orchestrator vía RPC, devuelven `setof record` de candidatos sin emitir). Esto preserva la lógica de negocio (idempotencia por fecha) en SQL donde está bien testeada.
- **Fase 3:** Cuando todo verde por 1 semana, dropear los `cron.schedule` viejos.

**Helper SQL nueva (pública para service_role):**
```sql
list_pending_notifications(p_kind text) returns table(family_id uuid, user_id uuid, payload jsonb, dedup_key text)
-- Hace lo que hoy hace cron_emit_morning_checkins SIN insertar.
-- El orchestrator lee, chunkea, y luego llama a emit_notifications_bulk.

emit_notifications_bulk(p_rows jsonb) returns int
-- INSERT masivo en notifications con on conflict do nothing por dedup_key.
```

#### F. Realtime "vivo en cliente"

**Decisión (P6 = a):** mantener subscription Realtime solo cuando hay 2+ miembros activos en la app (heurística client-side: `presence` channel ligero).

**Cliente:**
- `use-home-realtime.ts` se vuelve **opt-in** vía un flag `useShouldEnableRealtime()` que escucha presence del canal `family:{id}`.
- Si solo el current user está presente → no se subscribe a postgres_changes → 0 conexiones.
- Si hay 2+ → se subscribe igual que hoy.
- Optimistic updates en mutations (`add-expense-model.ts`, `record_fixed_expense_payment`) ya existen — verificar que cubren todos los hot mutations.

A 5K MAU con familias 4-personas activas simultáneas estimadas en <10% del tiempo: ~150 conexiones simultáneas pico vs. límite Pro 200. Pasa.

#### G. Connection pooling

- Validar que el cliente Supabase usa el **transaction-mode pooler** (puerto 6543) en `mobile/lib/supabase.ts`. La PostgREST ya usa pgbouncer por default.
- Edge Functions (Deno): usar `connectionString` con `pgbouncer=true`.
- Nada que rehacer si ya está; solo verificar y documentar.

#### H. Observabilidad: `db_health_snapshot()` (dev only)

**RPC pública (para owner role en build dev):**

```sql
create function public.db_health_snapshot() returns jsonb
-- devuelve:
-- {
--   db_size_bytes, db_size_pretty,
--   table_sizes: [{table, rows_estimate, total_bytes, indexes_bytes}, ...],
--   slow_queries_top10: [{query, mean_exec_ms, calls, total_ms}, ...] -- via pg_stat_statements si está
--   monthly_growth: { expenses_30d, notifications_30d, ... },
--   limits_pro: { db_pct_used, egress_pct_used (NULL si no se puede medir), ... }
-- }
```

GRANT solo a un rol custom `dev_admin`. El cliente lo consume desde una pantalla en `app/(app)/settings/dev-health.tsx` que solo se renderiza si `__DEV__ || expo-constants.releaseChannel === 'dev'`. La pantalla muestra una grilla simple con los números.

#### I. Cliente: TanStack Query tuning

Patches concretos por hook (no genéricos):

| Archivo | Cambio |
|---|---|
| `mobile/features/home/use-home-snapshot.ts` | `staleTime: 60_000` (1 min). `gcTime: 5 * 60_000`. `refetchOnWindowFocus: true`. Hoy probable default 0. |
| `mobile/features/insights/use-control-v2-data.ts` | `staleTime: 5 * 60_000` (5 min). `gcTime: 30 * 60_000`. La data viene del snapshot 6h-cached, no necesita refetch agresivo. |
| `mobile/features/notifications/*` | `staleTime: 30_000`. Invalidación en mutations explícitas. |
| `mobile/features/expenses/use-*` | `staleTime: 60_000`. Lista paginada con `keepPreviousData`. |
| Prefetch en `app/(app)/(tabs)/_layout.tsx` | Al montar tabs, `prefetchQuery` de Inicio + Asistente para evitar loading visible al cambiar tab. |

(Lista exacta de archivos a tocar se materializa en el plan de implementación tras grep al código actual.)

## 5. Esquema de migraciones (orden y nombres)

Todas con timestamp > `20260511000000` y idempotentes.

| # | Archivo | QUÉ |
|---|---|---|
| 1 | `20260512000000_indexes_for_5k_mau.sql` | Índices faltantes y partial indexes para retención. |
| 2 | `20260512010000_rls_helpers_stable_leakproof.sql` | Marca helpers `STABLE LEAKPROOF`, audita policies. |
| 3 | `20260512020000_home_snapshot_payload_trim.sql` | Reescribe cuerpo de `home_snapshot` con caps. |
| 4 | `20260512030000_control_snapshot_table_and_rpc.sql` | Tabla `control_snapshots` + RPC `control_snapshot()` + helper compute. |
| 5 | `20260512040000_control_snapshot_cron.sql` | pg_cron schedule cada 6h. |
| 6a | `20260512050000_purge_archived_expenses.sql` | `cron_purge_archived_expenses()` + schedule diario (14 días post-cierre). |
| 6b | `20260512051000_retention_policies.sql` | `cron_apply_retention_policies()` + schedule mensual (notifications, velocity, dismissals, price_history 60d, monthly_summaries 12 ciclos). |
| 7 | `20260512060000_notifications_pending_helpers.sql` | `list_pending_notifications` + `emit_notifications_bulk`. |
| 8 | `20260512070000_notifications_cron_handover.sql` | Reschedule pg_cron para llamar al orchestrator. Dropea jobs viejos `morning-checkins`, etc. |
| 9 | `20260512080000_db_health_snapshot.sql` | RPC + rol `dev_admin`. |
| 10 | `20260512090000_push_subscriptions_last_used_at.sql` | Si la columna no existe. |

Cada migración:
- `IF NOT EXISTS`, `CREATE OR REPLACE`, `DO $$ ... EXCEPTION WHEN ... $$`.
- Comentario `-- WHAT / -- WHY` arriba.
- Down script en comentario al pie.
- No `DROP` de tabla con datos.
- Cambios sobre tablas grandes (`expenses` ~9M filas a término): solo `CREATE INDEX CONCURRENTLY` (fuera de transacción).

## 6. Edge Functions

| Función | Estado | Cambio |
|---|---|---|
| `send-family-push` | existe | v2 que acepta `{ tokens: string[], payload: ExpoPushMessage }`. Mantener v1 firma para compat. |
| `control-advisor` | existe | revisar; si llama por familia, refactor para batch (fuera de scope si no es bottleneck). |
| `notifications-orchestrator` | NUEVO | `index.ts` con `Deno.serve`. Acepta `{ kind: 'morning_checkins' | 'midday_checkins' | ... }`. |

## 7. Cliente — patches concretos

(Orientativo; el plan de implementación enumera archivos exactos tras grep)

- **`mobile/lib/supabase.ts`**: confirmar uso del pooler (puerto 6543). Si no, cambiar.
- **`mobile/features/home/use-home-snapshot.ts`**: `staleTime`, `gcTime`, `refetchOnWindowFocus`.
- **`mobile/features/insights/use-control-v2-data.ts`**: leer de la nueva `control_snapshot()` opcionalmente; mantener fallback a la lógica actual.
- **`mobile/features/home/use-home-realtime.ts`**: gate por presence count.
- **`app/(app)/settings/`**: nueva ruta `dev-health.tsx` (solo dev build).
- **`app/(app)/(tabs)/_layout.tsx`**: prefetch de home + insights al mount.
- **Selects más finos**: revisar hooks que hoy traen filas completas (ej. `family_members` con todas las cols cuando solo se usa `display_name + role`).

## 8. Testing strategy

- **RPCs nuevas**: TDD. Tests pgTAP o tests TS contra Supabase local con seed que reproduzca:
  - `control_snapshot()`: con familia con 0 gastos, con familia normal, con familia over-budget. Confirmar que devuelve la misma estructura siempre.
  - `db_health_snapshot()`: que solo el rol `dev_admin` lo puede invocar.
  - Retention cron: insertar filas viejas, correr cron, verificar borrado.
- **`home_snapshot` post-trim**: snapshot test del shape JSON (los keys deben ser idénticos a los actuales).
- **Notifications orchestrator**: test de chunking (200 familias → 1 invocación recibe lista correcta).
- **RLS**: matriz de tests (owner, member, blocked, no-family) sobre las tablas tocadas.
- **Idempotencia**: correr cada migración 2× seguidas en local. Sin error.
- **Verificación final**: `./scripts/npmw run validate` + `typecheck` + `test` + smoke test mobile contra build dev.

## 9. Capacidad antes/después

| Métrica | Antes (proyectado a 5K) | Después | Margen sobre Pro |
|---|---|---|---|
| DB total | ~12 GB (sin retención) | **~3–4 GB** | ~50% |
| Egress/mes | ~80–100 GB | **~50–60 GB** | ~70% |
| Edge invocations/mes | ~1.2M | **~150K** | ~92% |
| Realtime concurrent peak | ~600–1.200 | **~150** | ~25% |
| Asistente p95 latency | ~800ms (cálculo) | **<80ms** (lectura tabla) | ✓ |
| Home p95 latency | ~250ms | **<150ms** (payload -30%) | ✓ |
| Compute headroom (Medium 1GB/2vCPU) | borderline | margen ~40% | ✓ |

**MAU servibles estimados:** ~10.000–12.000 con margen sobre 5K objetivo (la purga agresiva de `expenses` desbloquea el doble de capacidad de lo que pensaba). Próxima ronda dispara cuando: DB > 70%, egress > 60%, Edge > 70%, o Realtime concurrent > 70%.

## 10. Costos estimados (USD/mes a 5K MAU)

- Supabase Pro: $25
- Compute Medium add-on: $30
- Egress overage (50–60 GB cubierto, 0 overage)
- Edge overage: 150K invocaciones/mes (cubierto, 0 overage)
- DB storage overage: 0 (5–6 GB sobre 8 GB incluidos)
- **Total: ~$55/mes** ≈ **$0.011/MAU**

## 11. Riesgos residuales

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Borrado de `expenses` archivadas rompe alguna RPC oculta | Media | Alto | Audit grep antes; dejar primer mes la retención commented-out con flag, monitorear. |
| `control_snapshot()` queda stale > 6h por cron crash | Media | Bajo | RPC tiene fallback al cálculo on-demand si `computed_at < now() - 12h`. |
| Edge `notifications-orchestrator` timeout en chunk grande | Baja | Medio | Chunks de 200, timeout Deno default 60s suficiente. Reintentos por chunk. |
| Cliente con cache demasiado largo no ve updates | Media | Medio | `refetchOnWindowFocus: true` + invalidación explícita en mutations. |
| RLS marcado LEAKPROOF acepta función no-LEAKPROOF | Baja | Alto (security) | Audit per-line, doc del análisis en cada función. |
| Particionado de `expenses` requerido antes de lo previsto | Baja a 5K, alta a 15K | Alto | Trigger de ronda 2 cuando `expenses > 20M filas`. |

## 12. Plan de rollout

1. **Día 0**: merge migraciones 1–2 (índices, RLS). Bajísimo riesgo.
2. **Día 1**: merge 3 (`home_snapshot` trim) + cliente cache changes. Smoke test.
3. **Día 2**: merge 4–5 (control_snapshot table + cron). Cliente sigue usando lógica vieja.
4. **Día 3**: merge cliente para usar `control_snapshot()`. Toggle por feature flag local.
5. **Día 5**: merge 6 (retención). Primera ejecución con `dry_run=true` (cuenta filas a borrar, no borra). Revisión humana. Después flip.
6. **Día 7**: merge 7 (helpers de notif).
7. **Día 8**: deploy Edge `notifications-orchestrator` v2 + `send-family-push` v2. Probar en staging con un job manual.
8. **Día 10**: merge 8 (notifications cron handover). Desactiva jobs viejos.
9. **Día 14**: merge 9 (db_health_snapshot). Pantalla dev.
10. **Día 30**: revisión: leer `db_health_snapshot()`, comparar contra targets de §9.

## 13. Brainstorming notes (de la conversación)

- **Terminología**: "mes" = ciclo de cobro (definido por `family_finance.salary_payment_day`), no mes calendario.
- **P1 retención**: `expenses` se purgan 14 días después del cierre de ciclo (soft-delete vía `archived_at` al cerrar, hard-delete 14 días después por cron). `monthly_summaries` retención de **12 ciclos** por familia. `fixed_expense_price_history` retención de 60 días.
- **P2 Asistente**: refresh cada 6h. Cron 09:00, 15:00, 21:00 AR. Evita 0–6 AM.
- **P3 observabilidad**: pantalla en Settings, **solo dev build**. Plain info.
- **P4 volumen**: ~150 transacciones/familia/ciclo confirmado.
- **P5 push**: agrupar por familia/lote, cliente no nota diferencia.
- **P6 realtime**: subscription gated por presence (2+ miembros activos). Resto: optimistic + invalidar al volver al tab.
- **P7 cron notifications**: pg_cron llama 1 vez a Edge orchestrator que chunkea internamente.
- **fixed_expenses**: la tabla actual `fixed_expense_price_history` ya provee el "valor del mes pasado" vía trigger. No se cambia su estructura, solo se le aplica retención agresiva de 60 días.

## 14. Definition of Done

- [ ] Todas las migraciones corren limpio en local (idempotentes 2×).
- [ ] `validate`, `typecheck`, `test` y `lint` verdes.
- [ ] `home_snapshot` JSON shape igual antes/después (snapshot test).
- [ ] `control_snapshot()` devuelve data válida en familia vacía y familia con 1.000 expenses.
- [ ] Retention cron borra rows correctamente y no toca rows in-window.
- [ ] Edge orchestrator: 1 invocación procesa 200 familias en <10s.
- [ ] Mobile: `home_snapshot` payload promedio cae al menos 25%.
- [ ] Mobile: tab Asistente p95 < 100ms (lectura tabla, no cálculo).
- [ ] Pantalla `dev-health` solo aparece en build dev.
- [ ] Documento de runbook: cómo correr retention manualmente, cómo invalidar control_snapshots, cómo despachar el orchestrator on-demand.

---

**End of design.**
