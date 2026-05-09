# Backend Hardening 5K MAU — Bajada Ejecutiva

**Fecha:** 2026-05-08
**Documentos:** `specs/2026-05-08-backend-hardening-5k-mau-design.md` (qué/por qué) · `plans/2026-05-08-backend-hardening-5k-mau-plan.md` (cómo, paso a paso)

---

## TL;DR

Endurecemos el backend de Manifiesto para sostener **5.000 MAU activos** en plan Supabase Pro + Compute Medium con margen, sin romper firmas de RPC públicas y con cero downtime. Trabajo separado en **7 fases mergeables y deployables independientemente**.

**Capacidad estimada después del trabajo:** ~10.000–12.000 MAU (margen >2× sobre target).
**Costo Pro a 5K MAU:** ~$55/mes total ≈ $0.011/MAU.

---

## Las 7 fases

| # | Fase | Riesgo | Impacto | ETA |
|---|---|---|---|---|
| 1 | Índices + RLS optimizado | Muy bajo | Latencia p95 -20% | 2-4h |
| 2 | `home_snapshot` payload trim + cliente cache tuning | Bajo | Egress -30% | 4-6h |
| 3 | `control_snapshot()` materializado c/6h | Medio | Asistente p95 -90% | 6-8h |
| 4 | Retención (purga 14d post-ciclo + cron mensual) | **Medio (data loss real)** | DB -70% | 6-8h |
| 5 | Edge orchestrator de notificaciones | Medio-alto | Edge invocations -90% | 8-12h |
| 6 | `db_health_snapshot()` + pantalla dev | Muy bajo | Observabilidad | 3-4h |
| 7 | Verification + runbooks | — | — | 2h |

Cada fase tiene un **STOP & MERGE** explícito en el plan: mergeas, observás 24-48h, y avanzás.

---

## Lo que NO se rompe (garantías duras)

- **Firmas de RPC públicas:** `bootstrap_family`, `join_family_by_code`, `peek_family_by_code`, `record_fixed_expense_payment`, `home_snapshot`, `monthly_rollup` (`close_monthly_cycle`), `leave_current_family`, `gastos_split_endpoints`, `member_income_contribution`, `family_invites`, `advisor_signal_dismissals` → **idénticas** antes/después. Hay snapshot test del shape de `home_snapshot` para protegerlo.
- **CODE_RULES.md:** nada toca a Supabase desde screens/components.
- **Migraciones:** todas idempotentes, reversibles, sin downtime.
- **Firma RPCs públicas:** cero break.

---

## Lo que SÍ cambia (sumario por fase)

### Fase 1 — Foundations
- **Agrega:** 7 índices nuevos (notifications unread, retention scans, family_members lookup).
- **Marca:** `is_family_member`, `is_family_owner` como `STABLE LEAKPROOF`.

### Fase 2 — `home_snapshot` payload trim + cliente
- **Server:** RPC `home_snapshot()` cuerpo reescrito con caps duros. Mismos keys top-level. Caps: `expenses ≤ 120`, `fixed_expenses ≤ 100`. `family_finance` con columnas explícitas (no más `to_jsonb(ff.*)`).
- **Cliente:** `staleTime: 60s`, `gcTime: 5min`, `refetchOnWindowFocus: true`, prefetch de Home en mount de `(tabs)/_layout.tsx`.

### Fase 3 — `control_snapshot()` materializado
- **Nueva tabla:** `control_snapshots` (1 fila/familia, RLS read-only para miembros).
- **Nueva RPC pública:** `control_snapshot()` lee la tabla, fallback on-demand si stale >12h.
- **Nuevo cron:** `cron_refresh_control_snapshots()` cada 6h (06:00, 12:00, 18:00 AR), chunks de 200 familias.
- **Cliente:** `useControlSnapshot()` con fallback a la lógica vieja si la RPC retorna null.

### Fase 4 — Retención (la única fase con riesgo real de data)
- **Cron diario:** `cron_purge_archived_expenses()` borra `expenses` con `archived_at < now() - 14d`. **Hard-delete físico**.
- **Cron mensual:** `cron_apply_retention_policies()` día 1 de cada mes:
  - `notifications` > 30 días → DELETE (bajado de 90d el 2026-05-09 — ver migración `20260513000000_tighten_notifications_retention.sql`)
  - `velocity_snapshots` > 6 meses → DELETE
  - `advisor_signal_dismissals` > 12 meses → DELETE
  - `fixed_expense_price_history` > 60 días → DELETE
  - `home_telemetry` > 30 días → DELETE
  - `monthly_summaries` → solo conserva los **12 más nuevos por familia**, el resto DELETE
  - `push_subscriptions` con `last_used_at` > 90 días → DELETE

### Fase 5 — Notifications: Edge orchestrator
- **Nueva Edge:** `notifications-orchestrator/index.ts` recibe `{ kind }`, pide candidatos a la DB, chunkea de 200, emite con `dedup_key`, llama a `send-family-push v2` en lotes de 100.
- **Modificada Edge:** `send-family-push` acepta `{ messages: [...] }` además de la firma vieja (compat preservada).
- **DB:** helpers nuevos `list_pending_notifications(kind)` y `emit_notifications_bulk(rows)`. Columna `dedup_key` en `notifications` con índice unique parcial.
- **pg_cron:** los 7 schedules viejos (`morning-checkins`, etc.) reemplazados por schedules que llaman al orchestrator vía `pg_net.http_post`.

### Fase 6 — Observabilidad dev
- **Nueva RPC pública:** `db_health_snapshot()` (sin PII; tamaño DB, growth 30d, top tablas, top slow queries, % uso del plan).
- **Nueva pantalla:** `app/(app)/settings/dev-health.tsx` solo visible si `__DEV__`. Lista plana con números.

### Fase 7 — Verification
- **Migración menor:** asegura `push_subscriptions.last_used_at` con backfill.
- **Smoke test full** + runbook operacional.

---

## Impacto sobre cuentas con data real (kontosmario@gmail.com, aye.tello18@gmail.com)

> Esto es lo que el usuario me pidió analizar antes de avanzar.

### Fases 1, 2, 3, 5, 6, 7 → CERO PÉRDIDA DE DATA

Solo agregan índices, refactorizan código, agregan RPCs nuevas, cambian cómo se generan notificaciones. **Nada se borra**.

### Fase 4 → ÚNICO RIESGO DE PÉRDIDA — leer con atención

**Lo que se va a borrar de las cuentas reales cuando corra el cron:**

| Cosa | Política | ¿Qué pierden las cuentas? |
|---|---|---|
| `expenses` archivadas | hard-delete 14 días post-cierre de ciclo | Detalle fila-por-fila de gastos de ciclos cerrados. **El total y breakdown del ciclo viven en `monthly_summaries`** (preservado). |
| `notifications` >90 días | DELETE | Notificaciones viejas. Las recientes y las nuevas siguen apareciendo. |
| `monthly_summaries` >12 por familia | DELETE de los más viejos | Si la cuenta tiene >12 ciclos cerrados, se borran los más antiguos. |
| `fixed_expense_price_history` >60 días | DELETE | Histórico de cambios de precio anterior a 60 días. El valor actual de cada `fixed_expense` queda intacto. |
| `velocity_snapshots` >6 meses | DELETE | Snapshots de "ritmo de gasto" históricos. El cálculo del Asistente solo usa el último, así que no afecta UX. |
| `advisor_signal_dismissals` >12 meses | DELETE | Si hace >12 meses cerraste un consejo del asistente, se olvida que lo cerraste. Edge case improbable que afecte UX. |

**¿Qué hago para minimizar riesgo en estas cuentas específicas?**

1. **Antes de aplicar Phase 4 en prod, hacer dump completo:**
   ```bash
   supabase db dump --data-only --linked > backup-pre-retention-$(date +%Y%m%d).sql
   ```
   Te queda un .sql restaurable.

2. **Primer run del cron en modo "dry":** correr la query de cada cron como `SELECT count(*) … WHERE` (sin DELETE) para ver cuántas filas se afectan, antes de habilitar el cron real. Esto está documentado en el plan (Phase 4, Task 4.3 STOP & MERGE).

3. **Tu cuenta y aye.tello18 a 2026-05-08:**
   - Tiempo en producción ~25 días (proyecto inició abril 2026). Por edad pura, **muy poco se va a borrar en la primera corrida**:
     - `notifications` >90 días: posiblemente 0
     - `monthly_summaries` >12 por familia: 0 (no hay 12 ciclos cerrados todavía)
     - `velocity_snapshots` >6 meses: 0
     - `fixed_expense_price_history` >60 días: posiblemente algunas
     - `expenses` archivadas: depende de cuántos ciclos cerraron — si tu/aye cerraron 1 ciclo, son los expenses de ese ciclo (que ya están en `monthly_summaries` de todas formas).

**Conclusión:** el riesgo real para las cuentas que conservás es **bajo en este momento** porque la app es nueva. Si fuera una app de 2 años, sería distinto.

---

## Orden de ejecución recomendado

1. **Primero:** sanitización de cuentas test (script `scripts/sanitize-non-real-users.sql`). Dry run + confirmación + delete.
2. **Después:** ejecución del plan, fase por fase, con merge entre fases:
   - Phase 1 (foundations) → merge → 24h obs
   - Phase 2 (payload trim) → merge → 24h obs
   - Phase 3 (control_snapshot) → merge → 24h obs
   - **Backup antes de Phase 4**
   - Phase 4 (retention) → merge → primer mes observar logs
   - Phase 5 (notifications orchestrator) → merge → 48h obs
   - Phase 6 (dev-health) → merge
   - Phase 7 (verification) → merge

3. **Mecanismo de ejecución:** subagent-driven. Yo despacho un subagente fresco por task, reviso entre tasks, no quemo el contexto de este chat. Así puedo soportar todo el plan completo (~25 tasks).

---

## Métricas a observar después de cada merge

| Métrica | Donde | Umbral verde |
|---|---|---|
| `home_snapshot` p95 latency | Supabase dashboard → Reports | <150ms |
| `home_snapshot` egress promedio | Supabase dashboard → API | <100KB/call |
| `control_snapshot` p95 latency | Supabase dashboard | <50ms |
| `cron_*` execution time | Supabase logs (DB) | sin errores, time razonable |
| Edge invocations/día | Supabase dashboard → Functions | <500 (era 5K) |
| DB size / 8 GB | DB Health screen (dev) | <70% |
| Realtime concurrent peak | Supabase dashboard | <100 |

---

## Backlog (out of scope de este sprint)

- **Realtime gating por presence** (subscribe solo si 2+ miembros activos): hoy hay 3 conexiones, no urgente. Dispara cuando >100 simultáneas.
- **Particionado de `expenses`** por año: el delete agresivo lo hace innecesario por ahora. Dispara cuando `expenses` rows >5M.
- **Mover el motor del Asistente a Edge Function** (saca CPU de Postgres): ronda 2 cuando compute >70%.
- **Quitar `fixed_expense_price_history` y reemplazar por `previous_amount` columna en `fixed_expenses`**: cambio invasivo, no necesario hoy con retención de 60 días.

---

## Comandos clave que vas a correr

### Sanitización (antes de empezar)
```bash
# 1. Dry run — solo lista
psql "$SUPABASE_DB_URL" -f scripts/sanitize-non-real-users.sql -v dry_run=true

# 2. Si la lista es la esperada, delete real
psql "$SUPABASE_DB_URL" -f scripts/sanitize-non-real-users.sql -v dry_run=false
```

### Backup antes de Phase 4
```bash
supabase db dump --data-only --linked \
  --file backup-pre-retention-$(date +%Y%m%d-%H%M).sql
```

### Forzar refresh de control_snapshots para una familia (ad-hoc)
```sql
select public.compute_control_snapshot('<family-uuid>');
```

### Disparar el orchestrator manualmente
```bash
curl -X POST https://xaquigyhylzvuyfslkqq.supabase.co/functions/v1/notifications-orchestrator \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind":"morning_checkins"}'
```
