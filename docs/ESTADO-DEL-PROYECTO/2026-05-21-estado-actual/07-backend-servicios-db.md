# 07 — Backend, Servicios y Base de Datos

> Verificado contra commit `7962ea2` · 2026-05-21 · parte del snapshot docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/

---

## 1. Visión General

Manifiesto usa **Supabase** como backend completo. No hay servidor custom ni capa BFF adicional: todo corre en la infraestructura gestionada de Supabase sobre Postgres 17.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Supabase Project                                │
│                                                                         │
│  Postgres 17 ─── RLS (Row-Level Security) ────── RPCs (SECURITY DEFINER)│
│  pg_cron ────── jobs programados (12 schedules activos)                 │
│  pg_net ─────── HTTP desde cron → Edge Functions                        │
│  Realtime ────── notifications + achievements_earned (via supabase_realtime)│
│  Auth ─────────── JWT (ES256), email/OTP, sin OAuth social              │
│                                                                         │
│  Edge Functions (Deno 2):                                               │
│    control-advisor · notifications-orchestrator · send-family-push      │
│                                                                         │
│  Cliente Mobile ─── supabase-js v2.57.0 (SecureStore en Expo)          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Puntos clave de arquitectura:**
- **Sin servidor propio**: toda la lógica de negocio vive en RPCs Postgres (SECURITY DEFINER) o Edge Functions Deno.
- **Sin ORMs**: acceso directo vía supabase-js con tipado TypeScript generado.
- **Seguridad multicapa**: RLS + funciones helper (`is_family_member`, `is_family_owner`, `is_family_member_active`) + rate-limit DB (`rpc_rate_limits`).
- **Patrón snapshot**: las pantallas Home y Gastos consolidan N round-trips en un único RPC (`home_snapshot`, `gastos_snapshot`) que devuelve JSONB y el cliente seedea caches React Query.
- **Billing/planes**: no existe ningún sistema de facturación en producción. Solo hay tablas "zombie" de diseño (ver §11).

---

## 2. Esquema de Base de Datos

### 2.1 Familias / Miembros / Perfiles

| Tabla | Columnas clave | FKs relevantes |
|-------|----------------|----------------|
| `families` | `id uuid PK`, `code text UNIQUE`, `created_at` | — |
| `family_members` | `family_id + user_id PK`, `role text CHECK('owner','member','blocked')`, `blocked_at`, `monthly_income_contribution numeric(12,2)` | → `families`, → `auth.users` |
| `profiles` | `id uuid PK`, `display_name text`, `avatar_animal text`, `onboarding_completed_at`, `deletion_scheduled_at` | → `auth.users` |
| `family_invites` | `code text PK`, `family_id`, `created_by`, `expires_at`, `consumed_by`, `consumed_at` | → `families`, → `auth.users` (×2) |

**Invariantes:**
- Un usuario puede pertenecer como máximo a una familia (UNIQUE en `family_members.user_id`).
- Exactamente un owner por familia (UNIQUE PARTIAL INDEX `WHERE role = 'owner'`).
- Invites: single-use, TTL 7 días, modelo ephemeral (reemplaza el código permanente de familia).

### 2.2 Gastos Variables (`expenses`)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `uuid PK` | — |
| `family_id` | `uuid` | → `families` |
| `category_id` | `uuid` | → `categories` (on delete restrict — protege categorías) |
| `commitment_id` | `uuid NULL` | → `fixed_expenses` (pago de un fijo) |
| `description` | `text` | obligatorio, breve |
| `notes` | `text NULL` | hasta 500 chars, opcional (agregado 2026-05-19) |
| `price` | `numeric(12,2)` | >= 0 |
| `created_by` | `uuid` | → `auth.users` (inmutable tras insert) |
| `archived_at` | `timestamptz NULL` | soft-delete por cierre de ciclo |

**Triggers activos sobre `expenses`:**
- `trg_expense_category_family` (BEFORE INSERT/UPDATE): valida que `category_id` pertenezca a la misma familia.
- `trg_expense_creator_immutable` (BEFORE UPDATE): impide cambiar `created_by`.
- `trg_expense_notification` (AFTER INSERT): emite notificación `expense_logged` o `fixed_paid`.
- `trg_expenses_advance_streak` (AFTER INSERT): avanza la racha del usuario.
- `expenses_award_first_expense` (AFTER INSERT): otorga achievement `first_expense`.

### 2.3 Categorías

| Tabla | Columnas clave | Notas |
|-------|----------------|-------|
| `categories` | `id uuid PK`, `family_id`, `name`, `color`, `template_id`, `scope text` | scope: `'expense'` o `'fixed_expense'` |
| `category_templates` | `id uuid PK`, `name`, `color`, `scope`, `sort_order` | catálogo global seed, read-only |
| `category_limits` | `id uuid PK`, `family_id`, `category_id`, `monthly_cap numeric(14,2)`, `warning_threshold_pct int` | UNIQUE(family_id, category_id); escritura owner-only |

### 2.4 Gastos Fijos / Compromisos (`fixed_expenses`)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `uuid PK` | — |
| `family_id` | `uuid` | → `families` |
| `name` | `text` | UNIQUE(family_id, name) |
| `amount` | `numeric(12,2)` | >= 0 |
| `kind` | `text CHECK` | `'recurring' / 'periodic' / 'installment' / 'debt'` |
| `status` | `text CHECK` | `'active' / 'paused' / 'completed' / 'archived'` |
| `frequency` | `text CHECK` | `'monthly' / 'weekly' / 'biweekly' / 'annual'` |
| `category_id` | `uuid NULL` | → `categories` |
| `next_due_on` | `date` | próximo vencimiento |
| `ends_on` | `date NULL` | fecha de fin (periódico) |
| `installments_total / paid` | `int` | cuotas (installment kind) |
| `remaining_balance` | `numeric(12,2) NULL` | deuda restante (debt kind) |
| `day_of_month` | `int NULL` | para generar `next_due_on` |
| `notify_days_before` | `int` | anticipación de notificación |
| `last_paid_at` | `timestamptz NULL` | timestamp del último pago |
| `last_used_at` | `timestamptz NULL` | confirmación "lo uso" (zombie detection) |
| `notes` | `text NULL` | notas libres |

**Tablas relacionadas:**

| Tabla | Propósito |
|-------|-----------|
| `fixed_expense_payments` | registro de pago por ciclo: `(fixed_expense_id, period_month) UNIQUE` |
| `fixed_expense_price_history` | audit trail de cambios de `amount` (retención 60 días) |
| `fixed_expense_usage_audit` | respuesta del usuario a "¿cuánto usás este gasto?": `mucho / a_veces / casi_nunca` |
| `fixed_expense_action_intent` | intención declarada: `cancel / pause / downgrade` (append-only, resolución en 2 estados) |

**Triggers sobre `fixed_expenses`:**
- `trg_fixed_expenses_notify_change` (AFTER INSERT/UPDATE/DELETE): emite notificación de cambio.
- `trg_fixed_expenses_updated_at` (BEFORE UPDATE): toca `updated_at`.
- `fixed_expenses_award_first` (AFTER INSERT): otorga achievement `first_fixed`.
- `fixed_expense_payments_award_first` (AFTER INSERT sobre `fixed_expense_payments`): otorga `first_paid_fixed`.

### 2.5 Finanzas de la Familia

| Tabla | Columnas clave | Notas |
|-------|----------------|-------|
| `family_finance` | `family_id PK`, `monthly_income numeric(12,2)`, `savings_goal numeric`, `savings_goal_percent`, `usd_exchange_rate`, `salary_payment_day smallint`, `daily_budget_buffer_mode/value`, `daily_budget_nudges_enabled`, `daily_budget_checkin_hour`, `current_cycle_starting_balance`, `current_cycle_anchor` | Un row por familia |
| `income_events` | `id uuid PK`, `family_id`, `user_id`, `amount`, `kind text`, `occurred_at` | log de cambios de ingreso |

`monthly_income` es la suma de `family_members.monthly_income_contribution` y se recalcula vía trigger cuando un miembro entra/sale/actualiza su contribución.

### 2.6 Meta de Ahorro

| Tabla | Columnas clave |
|-------|----------------|
| `savings_goals` | `id uuid PK`, `family_id`, `title text`, `emoji text`, `goal_amount numeric(12,2)`, `current_amount`, `target_months`, `is_active boolean`, `updated_at` |

Un solo goal activo por familia en la práctica (el `home_snapshot` devuelve el primero activo). Triggers: `trg_savings_goals_updated_at` + `trg_savings_goal_notification` + `savings_goals_award_milestones` (achievements).

### 2.7 Streaks

| Tabla | Columnas clave |
|-------|----------------|
| `user_streaks` | `id uuid PK`, `family_id + user_id UNIQUE`, `current_streak int`, `longest_streak int`, `total_days_logged int`, `last_logged_date date`, `streak_broken_at`, `freeze_tokens smallint(0-2)`, `days_since_last_token_grant int` |
| `streak_marked_days` | `id uuid PK`, `family_id`, `user_id`, `marked_date date UNIQUE(family_id, user_id, marked_date)` |

Los streaks son una **tabla real** (no derivada), avanzada mediante la función `advance_streak()` invocada por el trigger `trg_expenses_advance_streak` en cada insert de gasto. Los shields (freeze_tokens) se otorgan cada 7 días de racha consecutiva (máximo 2).

### 2.8 Resúmenes Mensuales / Velocidad

| Tabla | Columnas clave |
|-------|----------------|
| `monthly_summaries` | `id uuid PK`, `family_id`, `period_start/end/label`, `total_variable/fixed/spent`, `monthly_income`, `savings_delta`, `category_breakdown jsonb`, `daily_totals jsonb`, `mood`, `delta_vs_previous_percent` |
| `velocity_snapshots` | `id uuid PK`, `family_id`, `snapshot_date date`, `avg_daily_last_7/30`, `momentum numeric`, `forecast_close_amount`, `stress_level text`, `created_at` |
| `control_snapshots` | `family_id PK`, `forecast_close_amount`, `forecast_overshoot_pct`, `over_budget_categories jsonb`, `zombie_candidates jsonb`, `member_pressure jsonb`, `recommended_actions jsonb`, `computed_at` |

Retención: `monthly_summaries` top-12 por familia; `velocity_snapshots` 6 meses. `control_snapshots` se refresca cada 6h via cron.

### 2.9 Notificaciones

| Tabla | Columnas clave |
|-------|----------------|
| `notifications` | `id uuid PK`, `family_id`, `user_id uuid NULL` (NULL = broadcast), `title`, `body`, `kind text`, `severity text CHECK('info','success','warning','alert')`, `metadata jsonb`, `read_at`, `dedup_key text UNIQUE`, `created_at` |
| `notification_preferences` | `user_id PK`, `morning_enabled`, `midday_enabled`, `evening_enabled`, `fixed_upcoming_enabled`, `streak_at_risk_enabled`, `streak_broken_enabled`, `weekly_insights_enabled`, `checkin_hour_ar int`, `push_enabled` |

`dedup_key` previene duplicados de notificaciones del orchestrator (formato: `kind:family_id:user_id:date`).

### 2.10 Push

| Tabla | Columnas clave |
|-------|----------------|
| `push_subscriptions` | `id uuid PK`, `family_id`, `user_id`, `provider text CHECK('web','expo')`, `endpoint text`, `p256dh text`, `auth text`, `last_used_at timestamptz`, UNIQUE(user_id, endpoint) |

### 2.11 Telemetría

| Tabla | Columnas clave |
|-------|----------------|
| `home_telemetry` | `id uuid PK`, `user_id`, `family_id`, `event text`, `element_id text`, `slot text`, `context jsonb`, `created_at` |

### 2.12 Asesor / Advisor Layer

| Tabla | Propósito |
|-------|-----------|
| `advisor_interactions` | registro de cada (usuario, signal) mostrada/actuada/descartada/expirada |
| `advisor_value_log` | valor monetario estimado de acciones tomadas |
| `user_signal_blocklist` | mute permanente por usuario de señales específicas |
| `advisor_signal_dismissals` | descarte temporal de señales (retención 12 meses) |

### 2.13 Achievements

| Tabla | Columnas clave |
|-------|----------------|
| `achievements_catalog` | `code text PK`, `title`, `body`, `icon`, `tier CHECK('bronze','silver','gold','legendary')`, `sort_order`, `is_active` |
| `achievements_earned` | `(user_id, code) PK`, `family_id NULL`, `earned_at`, `context jsonb NULL` |

Catálogo v1: 14 achievements (11 originales + 3 milestone de meta: `goal_25`, `goal_50`, `goal_75`).

### 2.14 Eliminación de Cuentas / Rate Limits

| Tabla | Propósito |
|-------|-----------|
| `rpc_rate_limits` | sliding window de rate-limit por usuario+acción (usado por `enforce_rate_limit_for_user`) |

### 2.15 Avatares

| Tabla | Propósito |
|-------|-----------|
| `avatar_animals` | catálogo de avatares disponibles (animal + variantes de color) |

---

## 3. RLS y Modelo de Seguridad

### 3.1 Principios

El modelo de acceso se basa en la **family_id** como único tenant. Cada tabla tiene RLS habilitado. Las funciones helper son:

| Función | Tipo | Propósito |
|---------|------|-----------|
| `is_family_member(fam_id)` | `stable security definer` | true si el usuario tiene membership activa |
| `is_family_owner(fam_id)` | `stable security definer` | true si el usuario es owner |
| `is_family_member_active(fam_id)` | `stable security definer` | true si member y no bloqueado |

### 3.2 Políticas por tabla (estado post-hardening 2026-05-10)

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `families` | miembro | — (via RPC) | — | — |
| `family_members` | miembro | **DENEGADO** (solo via RPC) | **DENEGADO** | **DENEGADO** |
| `categories` | miembro | miembro | miembro | miembro |
| `expenses` | miembro | miembro + `created_by = auth.uid()` | miembro | miembro |
| `family_finance` | miembro | miembro | **owner-only** | owner-only |
| `fixed_expenses` | miembro | miembro | miembro | miembro |
| `savings_goals` | miembro | miembro | **owner-only** | owner-only |
| `notifications` | propio + broadcast | **DENEGADO** (solo via RPC) | propio + broadcast | miembro |
| `push_subscriptions` | **propio** (solo mi token) | propio + miembro | propio + miembro | propio + miembro |
| `achievements_catalog` | cualquier autenticado | — | — | — |
| `achievements_earned` | **propio** | — (solo via service_role) | — | — |
| `home_telemetry` | **propio** | — (via RPC) | — | — |
| `advisor_interactions` | propio | — (via RPC) | — | — |

### 3.3 Vulnerabilidad Reportada — Estado Verificado

**Vulnerabilidad original:** "cualquier miembro de familia podía editar/borrar gastos de otro miembro" (política `expenses_update_members` y `expenses_delete_members` permitían cualquier miembro, no solo el creador).

**Estado actual (verificado en `20260510000000_security_hardening_rls.sql`):**

La migración de hardening **NO cerró esta vulnerabilidad específica sobre `expenses`**. Las políticas de UPDATE y DELETE de `expenses` **siguen siendo a nivel de familia** (no a nivel de creador):

```sql
-- expenses_update_members: using (public.is_family_member(family_id))
-- expenses_delete_members: using (public.is_family_member(family_id))
```

**Conclusión:** Cualquier miembro activo de la familia sigue pudiendo editar y borrar gastos de otros miembros. La migración de hardening cerró otros 8 hallazgos del audit (re-join forzado, blocked members en RPCs, token leak de push, spoofing de notificaciones, escalación de role en family_members) pero **esta vulnerabilidad específica permanece abierta**.

**Mitigaciones parciales vigentes:**
- `created_by` es inmutable (trigger impide cambio).
- El INSERT fuerza `created_by = auth.uid()`.
- No hay vector de CRUD cruzado en los flujos de UI actuales.

---

## 4. RPCs y Funciones

### 4.1 Patrón Snapshot

Las pantallas Home y Gastos usan el patrón **"snapshot bundle"**: una sola llamada RPC que consolida múltiples queries y devuelve un JSONB denso. El cliente lo recibe y seedea cada subclave en su cache React Query correspondiente, manteniendo invalidación granular e updates optimistas.

```
[Mobile]  → POST /rest/v1/rpc/home_snapshot   → [Postgres SECURITY DEFINER]
                                                   → join family_members
                                                   → join family_finance
                                                   → select expenses (last 120)
                                                   → select fixed_expenses
                                                   → count notifications unread
                                                   → ...15+ queries internas
                                                   ← JSONB con ~15 claves
[Mobile]  seedea React Query caches por clave
```

### 4.2 RPCs Principales

| RPC | Firma | Propósito | Rol |
|-----|-------|-----------|-----|
| `home_snapshot()` | `() → jsonb` | Bundle completo para Home: profile, family, finance, expenses (120), fixed_expenses (100), categories, notifications (80), savings_goal, fixed_expense_payments, monthly_summaries (6), category_limits, velocity_today, advisor_signal_dismissals, has_push_subscription | `authenticated` |
| `gastos_snapshot(family_id, cycle_start, cycle_end, today?, cupo_diario?, days_per_page?, timezone?)` | `(uuid, timestamptz, timestamptz, ...) → jsonb` | Bundle Gastos: hero, calendar, categories, primera_page de gastos paginados, streak_row, streak_marked_days (14 días) | `authenticated` |
| `log_home_events_bulk(p_events jsonb)` | `(jsonb) → integer` | Inserta batch de hasta 50 eventos de telemetría en una sola llamada. Rate-limit: 60/min/user. Valida membership y caps por campo. | `authenticated` |
| `award_achievement(code, user_id, family_id?, context?)` | `(text, uuid, uuid, jsonb) → boolean` | Idempotente (ON CONFLICT DO NOTHING). Solo invocable por service_role o triggers. | `service_role` |
| `request_account_deletion()` | `() → timestamptz` | Schedula borrado en 30 días, impide si owner con miembros activos, limpia push_subscriptions inmediatamente. | `authenticated` |
| `cancel_account_deletion()` | `() → void` | Revierte el timestamp de borrado. | `authenticated` |
| `admin_delete_account(user_id)` | `(uuid) → void` | Hard-delete del `auth.users` row (cascadea todo). Solo invocable por service_role. | `service_role` |
| `cron_process_account_deletions()` | `() → table(processed, failed, failures)` | Procesador del batch de hard-deletes. Solo service_role. | `service_role` |
| `bootstrap_family(preferred_code?)` | `(text?) → table(family_id, family_code)` | Crea familia + seed categorías + agrega al user. Idempotente si ya tiene familia. | `authenticated` |
| `join_family_by_code(code)` | `(text) → table(family_id, family_code)` | Legacy (código permanente). Reemplazado por `consume_family_invite`. | `authenticated` |
| `create_family_invite()` | `() → text` | Genera invite de un solo uso con TTL 7 días. | `authenticated` |
| `consume_family_invite(code, contribution?)` | `(text, numeric?) → table(...)` | Valida, inserta membership, marca invite como consumido. | `authenticated` |
| `peek_family_by_invite(code)` | `(text) → jsonb` | Preview de familia sin unirse (para step de confirmación). | `authenticated` |
| `record_fixed_expense_payment(fixed_expense_id)` | `(uuid) → uuid` | Registra pago: insert expense + insert payment + avanza next_due_on + actualiza status. Devuelve expense_id. | `authenticated` |
| `add_savings_contribution(goal_id, amount)` | `(uuid, numeric) → savings_goals` | Incrementa current_amount. Requiere owner. | `authenticated` |
| `advance_streak(family_id, user_id, date)` | `(uuid, uuid, date) → void` | Máquina de estado de streaks. Idempotente si ya registró ese día. Invocada por trigger. | `authenticated` |
| `leave_current_family()` | `() → void` | El miembro sale. Si owner y único, borra la familia. Si owner con otros, requiere transferencia previa. | `authenticated` |
| `transfer_ownership(new_owner_id)` | `(uuid) → void` | Transfiere rol owner. Solo owner actual. | `authenticated` |
| `block_member(user_id)` / `unblock_member(user_id)` | `(uuid) → void` | Admin de household. | `authenticated` |
| `update_my_income_contribution(amount)` | `(numeric) → numeric` | Único write permitido sobre `family_members` para usuarios (la política bloquea UPDATE directo). | `authenticated` |
| `emit_user_notification(target_user_id, kind, title, body, metadata?)` | `(uuid, text, text, text, jsonb) → uuid` | Única forma de que el cliente emita notificaciones cross-user. Permite solo `member_warning` y `member_nudge`. | `authenticated` |
| `enforce_rate_limit_for_user(user_id, action, max_attempts, window_seconds)` | `(uuid, text, int, int) → void` | Sliding window de rate limit. Lanza excepción si excede. | `service_role` (vía Edge) |
| `gastos_hero_summary`, `gastos_calendar_summary`, `gastos_categories_with_counts`, `gastos_expenses_paginated`, `gastos_expenses_for_day` | varias | RPCs hijas invocadas internamente por `gastos_snapshot`. También disponibles directas. | `authenticated` |
| `compute_control_snapshot(family_id)` | `(uuid) → void` | Materializa control_snapshots: forecast, zombies, over-budget categories, member pressure. | `service_role` |
| `db_health_snapshot()` | `() → jsonb` | Métricas de DB: tamaño, growth, slow queries. Dev-only. | `authenticated` |
| `audit_subscription(fixed_expense_id, level)` | `(uuid, text) → fixed_expense_usage_audit` | Responde encuesta de uso de suscripción. | `authenticated` |
| `declare_subscription_intent(fixed_expense_id, intent, notes?)` | `(uuid, text, text) → ...` | Declara intención de cancel/pause/downgrade. | `authenticated` |
| `resolve_subscription_intent(intent_id, resolution, new_amount?)` | `(uuid, text, numeric) → ...` | Resuelve la intención: ejecuta el cambio en fixed_expense si completed. | `authenticated` |

---

## 5. Triggers

| Trigger | Tabla | Momento | Función | Propósito |
|---------|-------|---------|---------|-----------|
| `trg_expense_category_family` | `expenses` | BEFORE INSERT/UPDATE | `ensure_expense_category_belongs_family()` | Valida que category_id pertenezca a la misma familia |
| `trg_expense_creator_immutable` | `expenses` | BEFORE UPDATE | `prevent_expense_creator_change()` | Impide cambiar `created_by` |
| `trg_expense_notification` | `expenses` | AFTER INSERT | `notify_expense_change()` | Emite notificación `expense_logged` o `fixed_paid` |
| `trg_expenses_advance_streak` | `expenses` | AFTER INSERT | `expenses_trigger_advance_streak()` | Avanza el streak del creador del gasto |
| `expenses_award_first_expense` | `expenses` | AFTER INSERT | `tr_award_first_expense()` | Achievement: primer gasto del usuario |
| `trg_fixed_expenses_notify_change` | `fixed_expenses` | AFTER INSERT/UPDATE/DELETE | `notify_fixed_expense_change()` | Notificación de cambio de compromiso |
| `trg_fixed_expenses_updated_at` | `fixed_expenses` | BEFORE UPDATE | `touch_fixed_expenses_updated_at()` | Mantiene `updated_at` |
| `fixed_expenses_award_first` | `fixed_expenses` | AFTER INSERT | `tr_award_first_fixed()` | Achievement: primer fijo de la familia |
| `fixed_expense_payments_award_first` | `fixed_expense_payments` | AFTER INSERT | `tr_award_first_paid_fixed()` | Achievement: primer pago de fijo |
| `trg_savings_goal_notification` | `savings_goals` | AFTER INSERT/UPDATE | `notify_savings_goal_change()` | Notificaciones de meta: creación, aporte, milestones 25/50/75/100% |
| `savings_goals_award_milestones` | `savings_goals` | AFTER INSERT/UPDATE of `current_amount` | `tr_award_goal_milestones()` | Achievements: goal_25, goal_50, goal_75, goal_completed |
| `savings_goals_award_first` | `savings_goals` | AFTER INSERT | `tr_award_first_goal()` | Achievement: primera meta creada |
| `user_streaks_award_milestones` | `user_streaks` | AFTER UPDATE of `current_streak` | `tr_award_streak_milestones()` | Achievements: streak_7/14/30/60/90 |
| `user_streaks_award_milestones_insert` | `user_streaks` | AFTER INSERT | `tr_award_streak_milestones_initial()` | Mismo, para inserts (backfill edge case) |
| `monthly_summaries_award_under_budget` | `monthly_summaries` | AFTER INSERT | `tr_award_first_cycle_under_budget()` | Achievement: primer ciclo bajo cupo |
| `on_auth_user_created` | `auth.users` | AFTER INSERT | `handle_new_user_profile()` | Crea fila en `profiles` con display_name neutral ("Usuario") |
| `trg_family_finance_updated_at` | `family_finance` | BEFORE UPDATE | `touch_family_finance_updated_at()` | Mantiene `updated_at` |
| `trg_push_subscriptions_updated_at` | `push_subscriptions` | BEFORE UPDATE | `touch_push_subscriptions_updated_at()` | Mantiene `updated_at` |
| `trg_savings_goals_updated_at` | `savings_goals` | BEFORE UPDATE | `savings_goals_touch_updated_at()` | Mantiene `updated_at` |

**Nota de diseño:** todos los triggers de awards están en bloques `EXCEPTION WHEN OTHERS` — un fallo en el award no aborta la operación principal (best-effort).

### Realtime Publications

| Tabla | Evento |
|-------|--------|
| `notifications` | INSERT (para el feed de notificaciones en tiempo real) |
| `achievements_earned` | INSERT (para el modal de unlock inmediato) |

---

## 6. Edge Functions

Ubicación: [`supabase/functions/`](../../../supabase/functions/)

### 6.1 `control-advisor` ✅ LIVE

**Ruta:** `POST /functions/v1/control-advisor`  
**Auth:** Bearer JWT (Supabase Auth, gateway `verify_jwt = true`)  
**Entrada:** `{ familyId: string }`  
**Salida:** `{ tasks: ControlAdvisorTask[], generatedAt: string, cached: boolean, fallback?: boolean }`

**Qué hace:**
1. Valida JWT y extrae `actorUserId`.
2. Aplica **rate-limit DB**: 5 llamadas/hora por usuario (`enforce_rate_limit_for_user`, acción `control_advisor`).
3. Valida que el usuario sea miembro activo (no bloqueado) de `familyId`.
4. Construye contexto financiero de la familia (`loadFamilyContext`): income, velocity_snapshot, últimas 3 monthly_summaries, top-5 categorías del ciclo actual, fijos venciendo en 14 días, active savings goal.
5. Si no hay datos suficientes devuelve `{ tasks: [], reason: 'insufficient_data' }`.
6. Llama a **Claude Sonnet 4-6** (`claude-sonnet-4-6`) via API Anthropic directa (no SDK):
   - `max_tokens: 1500`, `temperature: 0.4`
   - SYSTEM prompt marcado con `cache_control: { type: 'ephemeral' }` (prompt caching de Anthropic).
7. Parsea y valida el JSON array de 3-5 tareas; si es inválido devuelve 3 tareas de fallback.

**Claude model:** `claude-sonnet-4-6` — verificado en código.  
**Cache:** Prompt caching en Anthropic (SYSTEM prompt compartido entre familias). **No hay cache local en DB**.

### 6.2 `notifications-orchestrator` ✅ LIVE

**Ruta:** `POST /functions/v1/notifications-orchestrator`  
**Auth:** Service-role bearer (solo llamado desde pg_cron vía pg_net)  
**Entrada:** `{ kind: Kind }`  
**Kinds soportados:** `morning_checkins | midday_checkins | evening_checkins | fixed_upcoming | streak_at_risk | streak_broken | weekly_insights`

**Qué hace:**
1. Llama a `list_pending_notifications(p_kind)` → obtiene candidatos con `dedup_key`.
2. Chunkea en grupos de 200.
3. Por chunk: `emit_notifications_bulk` (insert con dedup via `dedup_key UNIQUE`) → resuelve tokens de push en `push_subscriptions` → construye `ExpoPushMessage[]` → invoca `send-family-push` con el array pre-armado.

**Optimización:** reemplazó el modelo anterior de triggers por-fila (~5000 invocaciones Edge/día) por ~50 invocaciones/día en chunks.

**Importante:** el cron handover (`20260512070000_notifications_cron_handover.sql`) requiere que las GUCs `app.settings.orchestrator_url` y `app.settings.service_role_key` estén configuradas en producción como superuser. El script lo documenta explícitamente.

### 6.3 `send-family-push` ✅ LIVE

**Ruta:** `POST /functions/v1/send-family-push`  
**Auth:** Gateway `verify_jwt = false` (ES256 workaround — la función valida el JWT internamente via `auth.getUser`). Excepción: cuando el body tiene `messages[]` (path del orchestrator), no hay gate de auth de usuario — se confía en que solo el orchestrator llama con service-role.  
**Entrada (modo legacy):** `{ familyId, title, body, kind?, url? }`  
**Entrada (modo batch):** `{ messages: ExpoPushMessage[] }`

**Qué hace (modo batch — path principal):**
- Recibe array pre-armado de `ExpoPushMessage`.
- Envía a Expo Push API en batches de 100 (límite de Expo).
- No valida tokens ni elimina suscripciones en este path (cleanup ocurre en el path legacy).

**Qué hace (modo legacy — path de notificación manual):**
- Valida JWT, aplica rate-limit (10/min/user).
- Valida membership y que el usuario no esté bloqueado.
- Recupera suscripciones de la familia (excluyendo al actor).
- Por suscripción: si es Expo → `sendExpoPush`; si es Web → `sendWebPush` (VAPID).
- Limpia suscripciones con error `DeviceNotRegistered`.

**Env vars requeridas:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`.

### 6.4 Configuración Runtime

Archivo: [`supabase/functions/deno.json`](../../../supabase/functions/deno.json)
```json
{ "nodeModulesDir": "auto" }
```
Runtime: **Deno 2** (`deno_version = 2` en `config.toml`). `deno.lock` presente.

---

## 7. Crons y Jobs Programados

Todos los crons usan **pg_cron** (extensión de Postgres). Si pg_cron no está disponible (local), las migraciones hacen `RAISE NOTICE` y siguen sin error.

| Job name | Schedule (UTC) | Función | Propósito |
|----------|---------------|---------|-----------|
| `control_velocity` | `0 4 * * *` (diario 04:00) | `cron_compute_velocity_snapshots()` | Materializa velocity_snapshots por familia |
| `control_zombies` | `15 4 * * 1` (lunes 04:15) | `cron_detect_zombies()` | Detecta suscripciones zombie, emite notificaciones |
| `control_price_hikes` | `30 4 * * *` (diario 04:30) | `cron_detect_price_hikes()` | Detecta subas >= 10% en fijos, emite notificaciones |
| `purge-archived-expenses` | `30 4 * * *` (diario 04:30) | `cron_purge_archived_expenses()` | Hard-delete de expenses archivados > 14 días |
| `process-account-deletions` | `30 4 * * *` (diario 04:30) | `cron_process_account_deletions()` | Hard-delete de cuentas cuya gracia de 30d expiró |
| `apply-retention-policies` | `0 4 1 * *` (mensual día 1, 04:00) | `cron_apply_retention_policies()` | Purga: notifications 90d, velocity 6m, advisor 12m, price_history 60d, home_telemetry 30d, monthly_summaries top-12, push_subscriptions 90d sin uso |
| `control-snapshots-refresh` | `0 9,15,21 * * *` (3x/día) | `cron_refresh_control_snapshots()` | Refresca control_snapshots para todas las familias activas (chunks de 200) |
| `cron_prune_home_telemetry` | `0 5 1 * *` (mensual día 1, 05:00) | `cron_prune_home_telemetry()` | Alternativa al apply-retention-policies para home_telemetry |
| `notifications-morning` | `0 12 * * *` (12:00 UTC = 09:00 AR) | orchestrator via pg_net | Checkins matutinos |
| `notifications-midday` | `0 17 * * *` (17:00 UTC = 14:00 AR) | orchestrator via pg_net | Checkins mediodía |
| `notifications-evening` | `30 23 * * *` (23:30 UTC = 20:30 AR) | orchestrator via pg_net | Checkins nocturnos |
| `notifications-fixed-upcoming` | `0 12 * * *` (12:00 UTC) | orchestrator via pg_net | Fijos próximos a vencer |

**Nota:** Los schedules de notificaciones (`morning/midday/evening/fixed-upcoming`) dependen de las GUCs `app.settings.orchestrator_url` y `app.settings.service_role_key`. Si estas GUCs no están configuradas en producción, el handover migration hace RAISE NOTICE y los schedules quedan sin activar.

Los schedules `streak-broken`, `streak-at-risk` y `streak-recovery` del modelo anterior fueron **reemplazados** por el orchestrator.

---

## 8. Telemetría

### 8.1 Home Telemetry (propio)

La app tiene su **propia capa de telemetría** implementada como tabla Postgres + RPC:

- **Tabla:** `home_telemetry` — un row por evento, con `event`, `element_id`, `slot`, `context jsonb`, `session_id` en context.
- **Eventos típicos:** `home.opened`, `home.closed`, `home.element_shown`, `home.element_tapped`, `home.element_dismissed`, `home.scrolled_to_bottom`, `home.refreshed`, `home.left_without_tap`.
- **RPC:** `log_home_events_bulk(p_events jsonb)` — inserta hasta 50 eventos en un solo POST. Rate-limit: 60 calls/min/user. Valida membership activa por cada evento del batch.
- **Retención:** 30 días (cron mensual).

### 8.2 Sentry y PostHog

⏸️ **EN PAUSA** — Ninguno de los dos SDKs está instalado ni configurado. La decisión está documentada en el RFC del Sprint 0: se optó por telemetría propia para v1 antes de comprometer un SDK comercial.

---

## 9. Push Notifications

### 9.1 Arquitectura

```
pg_cron → pg_net.http_post → notifications-orchestrator
                                  ↓ list_pending_notifications
                                  ↓ emit_notifications_bulk (dedup)
                                  ↓ push_subscriptions (tokens)
                                  ↓ send-family-push
                                       ↓ Expo Push API (batches de 100)
```

### 9.2 Estado

| Componente | Estado |
|------------|--------|
| Web Push (VAPID) | ✅ LIVE — funcional para endpoints web |
| Expo Push (ExponentPushToken) | 🟡 PARCIAL — la integración técnica existe, pero iOS requiere APNs certificate de Apple Dev Program |
| Push iOS en producción | ⛔ BLOQUEADO — la app no está en Apple Developer Program. Sin el certificado APNs, los tokens Expo no entregan notificaciones en dispositivos iOS reales |
| Expo Go (development) | ✅ LIVE — push funciona en Expo Go sobre la cuenta personal del developer |

### 9.3 Tipos de Notificaciones

El sistema soporta 18 `kind` en la whitelist de `send-family-push`:
`info`, `expense_logged`, `fixed_paid`, `fixed_created`, `fixed_edited`, `fixed_deleted`, `goal_contribution`, `goal_milestone`, `goal_achieved`, `goal_created`, `streak_broken`, `streak_milestone`, `shield_used`, `shield_earned`, `member_warning`, `member_nudge`, `member_left`, `cycle_close`.

### 9.4 Política de Retención

- Subscripciones sin actividad > 90 días se purgan en el cron mensual `apply-retention-policies`.
- `push_subscriptions.last_used_at` es el marcador (backfill: igual a `created_at` para suscripciones previas a la columna).
- Si la Expo API responde `DeviceNotRegistered`, el path legacy de `send-family-push` elimina la suscripción.

---

## 10. Account Deletion (Flujo Backend End-to-End)

Implementado para cumplir **App Store Guideline 5.1.1(v)** (eliminación de cuenta in-app). Flujo completo en migraciones `20260517-20260518`.

```
Usuario toca "Eliminar cuenta" en Settings
         ↓
   [RPC] request_account_deletion()
         ├─ Verifica: si es owner con otros miembros activos → error (transferir primero)
         ├─ profiles.deletion_scheduled_at = now() + 30 días
         └─ DELETE push_subscriptions WHERE user_id = caller (limpieza inmediata)
         
  ── Ventana de gracia: 30 días ──────────────────────────────────────
  Durante la gracia, el usuario puede:
         ↓
   [RPC] cancel_account_deletion()
         └─ profiles.deletion_scheduled_at = NULL (cancela)
         
  ── Al expirar los 30 días ─────────────────────────────────────────
         ↓
   [CRON] cron_process_account_deletions() — 04:30 UTC diario
         ├─ Lee: account_deletions_due (view: deletion_scheduled_at <= now())
         └─ Por cada user_id:
               [RPC service_role] admin_delete_account(user_id)
                    ├─ Verifica que deletion_scheduled_at <= now() (doble-check)
                    └─ DELETE FROM auth.users WHERE id = user_id
                              ↓ ON DELETE CASCADE
                         elimina: profiles, family_members, expenses, 
                         fixed_expenses, notifications, push_subscriptions,
                         savings_goals, home_telemetry, streaks, achievements_earned, ...
```

**Permisos:**
- `request_account_deletion()` + `cancel_account_deletion()`: `authenticated` (usuario hace sobre sí mismo).
- `admin_delete_account()` + `cron_process_account_deletions()`: **`service_role` only** (lockdown explícito; revocado de `public`, `anon`, `authenticated`).
- Vista `account_deletions_due`: `service_role` only.

---

## 11. Billing / Subscriptions Backend

🔴 **NO EXISTE ningún sistema de billing real.**

Lo que existe son **tablas "zombie" de diseño** creadas en la migración `20260502120000_subscription_zombie_tables.sql`, que representan el flujo de auditoría de suscripciones **de la familia** (Netflix, Spotify, etc.) — no facturación de Manifiesto:

- `fixed_expense_usage_audit`: cuánto usa la familia una suscripción (`mucho / a_veces / casi_nunca`).
- `fixed_expense_action_intent`: intención de cancelar/pausar/bajar un plan.

No hay:
- Tabla de planes de Manifiesto (free/pro/etc.).
- Integración con Stripe, RevenueCat, ni Apple IAP.
- Webhooks de billing.
- Ninguna lógica de gate por plan.

Toda la app funciona como si todos los usuarios fueran "pro" sin restricciones de feature.

---

## 12. CI/CD, Tests y Scripts

### 12.1 CI/CD

**GitHub Actions:**

| Workflow | Trigger | Qué corre |
|----------|---------|-----------|
| `mobile-ci.yml` | push to `main`, PRs | `npm ci` → `npm run lint` → `npm run typecheck` |
| `deploy-pages.yml` | push to `main` (solo si toca `site/**`) | Upload `site/` → deploy GitHub Pages (manifiesto.app) |

**Lo que NO corre el CI:**
- Build de la app (Expo/EAS).
- Submit a App Store / Play Store.
- Tests unitarios (`npm test` / `vitest`).
- Tests E2E (Playwright).
- Supabase migrations check / diff.

**Pre-commit hook** (`.githooks/pre-commit`):
- Scanner de secretos escrito en bash puro (sin dependencias externas).
- Bloquea: `.env`, `.pem`, `.p12`, `.key`, service-role JWTs, Anthropic API keys, AWS keys, connection strings con password.
- Activación: `git config core.hooksPath .githooks` (manual por clon).

### 12.2 Tests

**Framework:** Vitest (configurado en `vitest.config.ts`)

**Cobertura:**

| Directorio | Tests | Tipo |
|------------|-------|------|
| `tests/unit/` | ~48 archivos `.test.ts` | Unit tests de modelos, engines, helpers de UI |
| `tests/integration/` | ~6 archivos `.test.ts` | Tests de RPCs y snapshots (home, gastos, control, notifications, retention) |
| `tests/e2e/` | 4 archivos `.spec.ts` | Playwright: smoke, gastos-auth, fijos-auth, home-auth |
| `tests/stubs/` | 4 archivos | Stubs de `react-native`, `react-native-reanimated`, `expo-secure-store`, `@react-navigation/native` |

**Qué cubren los unit tests:** modelos de domain (add-expense, savings-goal, control-signals, daily-budget-engine, subscription-zombie-engine), helpers de formatting y animación, tokens de diseño.

**Qué cubren los integration tests:** shape del home_snapshot, gastos_snapshot, control_snapshot, notifications bulk, retention policies.

**Estado de los E2E:** el `playwright.config.ts` existe, los 4 spec files están escritos, pero **no corren en CI**. Requieren app running.

### 12.3 Scripts Relevantes

| Script | Propósito |
|--------|-----------|
| `scripts/supabase-remote.mjs` | Wrapper para comandos de Supabase CLI apuntando a remoto |
| `scripts/create-test-account.mjs` | Crea cuenta de test en Supabase |
| `scripts/validate-fijos-backend.mjs` | Valida el flujo de fijos contra backend real |
| `scripts/validate-payment-flow.mjs` | Valida el flujo de pagos end-to-end |
| `scripts/backfill-user-streaks.sql` | SQL para backfill de streaks (corrida manual) |
| `scripts/sanitize-kontosmario-payments.sql` | Limpieza de datos de prueba reales |
| `scripts/seed-fijos-demo-data.sql` | Seed de datos de fijos para demo |
| `scripts/build-ipa.sh` | Script manual de build IPA |
| `scripts/guard-forbidden-copy.mjs` | Valida que no haya copy prohibido en el codebase |
| `scripts/guard-motion-tokens.mjs` | Valida motion tokens |

---

## 13. Estado vs Deuda

| Componente | Estado | Nota |
|------------|--------|------|
| Postgres schema (101 migraciones) | ✅ LIVE | Sincronizado con prod |
| RLS multi-tenant por household | ✅ LIVE | Post-hardening 2026-05-10 |
| Vulnerabilidad update/delete cross-member en `expenses` | 🔴 ABIERTA | Ninguna migración la cerró; la política sigue siendo a nivel familia |
| RPC `home_snapshot` | ✅ LIVE | Bundle completo con 15+ subkeys |
| RPC `gastos_snapshot` | ✅ LIVE | Bundle 6 queries → 1 round-trip |
| RPC `log_home_events_bulk` | ✅ LIVE | Telemetría en batch |
| Edge Function `control-advisor` (Claude Sonnet 4-6) | ✅ LIVE (desplegada) | Rate-limited 5/hora/user · **no invocada desde el cliente** (asistente heurístico) |
| Edge Function `notifications-orchestrator` | ✅ LIVE | Reemplaza modelo de triggers por-fila |
| Edge Function `send-family-push` | ✅ LIVE | Expo + Web Push |
| Push iOS en producción | ⛔ BLOQUEADO | Requiere Apple Developer Program |
| Sistema de achievements (14 badges) | ✅ LIVE | Triggers idempotentes + realtime |
| Streaks con shields | ✅ LIVE | Tabla real + advance_streak() |
| Account deletion (soft + hard) | ✅ LIVE | Cumple App Store 5.1.1(v) |
| Cron jobs (8+ schedules) | ✅ LIVE | pg_cron en Supabase Cloud |
| Cron handover a orchestrator (notificaciones) | 🟡 PARCIAL | Requiere GUCs configuradas como superuser en prod |
| Home telemetría propia | ✅ LIVE | SDK comercial (Sentry/PostHog) en pausa |
| Sentry | ⏸️ EN PAUSA | No instalado para v1 |
| PostHog | ⏸️ EN PAUSA | No instalado para v1 |
| Billing / planes de Manifiesto | 🔴 NO EXISTE | Solo tablas de auditoría de suscripciones de la familia |
| CI: lint + typecheck | ✅ LIVE | GitHub Actions |
| CI: tests unitarios | ⏸️ EN PAUSA | No corren en CI (vitest corre solo local) |
| CI: E2E (Playwright) | ⏸️ EN PAUSA | 4 specs escritos, no corren en CI |
| CI: build / submit EAS | 🔴 NO EXISTE | Manual vía `build-ipa.sh` |
| Pre-commit secret scanner | ✅ LIVE | Activación manual por clon |

---

*Fin del documento. Generado por agente de documentación técnica leyendo código fuente real — commit `7962ea2` · 2026-05-21.*
