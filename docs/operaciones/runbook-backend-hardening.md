# Runbook: Backend Hardening Operacional

> **Implementación:** 7 fases, 27 commits, 11 migraciones nuevas. Spec: `docs/superpowers/specs/2026-05-08-backend-hardening-5k-mau-design.md`. Plan: `docs/superpowers/plans/2026-05-08-backend-hardening-5k-mau-plan.md`.

---

## 1. Operaciones cotidianas

### Forzar refresh de `control_snapshots` para una familia específica

```sql
select public.compute_control_snapshot('<family-uuid>');
```

Esto recomputa la fila para esa familia. Útil después de una corrección de datos manual o si la última corrida del cron falló para esa familia.

### Forzar purga de expenses archivados (ad-hoc, fuera del schedule diario)

```sql
select public.cron_purge_archived_expenses();
```

Borra todos los `expenses` con `archived_at < now() - 14 days` en chunks de 10K. Idempotente.

### Forzar retention mensual completo (todas las tablas)

```sql
select public.cron_apply_retention_policies();
```

Procesa: `notifications` 30d (bajado de 90d el 2026-05-09), `velocity_snapshots` 6m, `advisor_signal_dismissals` 12m, `fixed_expense_price_history` 60d, `home_telemetry` 30d (si existe), `monthly_summaries` top-12 por familia, `push_subscriptions` 90d sin uso.

Idempotente.

### Disparar el orchestrator de notificaciones manualmente

```bash
curl -X POST https://xaquigyhylzvuyfslkqq.supabase.co/functions/v1/notifications-orchestrator \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind":"morning_checkins"}'
```

Kinds válidos: `morning_checkins`, `midday_checkins`, `evening_checkins`, `fixed_upcoming`, `streak_at_risk`, `streak_broken`, `weekly_insights`.

Otros kinds: el orchestrator los acepta pero no genera candidatos hoy (placeholder para extensión futura).

### Verificar tamaño DB y crecimiento

**Opción A (en mobile):** Settings → "DB Health (dev)" en build dev. Muestra: tamaño total, % de uso del plan Pro, top 30 tablas, growth 30d, top 10 slow queries.

**Opción B (psql directo):**

```sql
select pg_size_pretty(pg_database_size(current_database())) as db_size;
select * from public.db_health_snapshot();
```

---

## 2. Setup inicial requerido en producción (UNA VEZ antes de aplicar Phase 5)

La migración `20260512070000_notifications_cron_handover.sql` necesita 2 GUCs configurados antes de correr. Si no están seteados, la migración hace un graceful skip y los crones viejos siguen activos.

```sql
-- Como superuser en producción (o vía Supabase dashboard → Settings → Database):
alter database postgres set "app.settings.orchestrator_url"
  = 'https://xaquigyhylzvuyfslkqq.supabase.co/functions/v1/notifications-orchestrator';
alter database postgres set "app.settings.service_role_key"
  = '<service-role-key>';
```

Después de setear, **re-correr la migración manualmente** para que los nuevos schedules se apliquen:

```sql
\i supabase/migrations/20260512070000_notifications_cron_handover.sql
```

---

## 3. Schedules pg_cron resultantes (post-implementación)

> **Nota 2026-05-22:** la migración `20260518000000_account_deletion_processor.sql` agregó un cron adicional (`process-account-deletions`) posterior al hardening sprint. La tabla de abajo lo incluye.

Hora UTC | Hora AR | Job | Función / Edge |
---|---|---|---|
`0 3 * * *` | 00:00 | `close-previous-cycles` | `cron_close_previous_cycles()` (preexistente) |
`0 4 * * *` | 01:00 | `control_velocity` | `cron_compute_velocity_snapshots()` (preexistente) |
`30 4 * * *` | 01:30 | `purge-archived-expenses` | `cron_purge_archived_expenses()` (NUEVO) |
`30 4 * * *` | 01:30 | `process-account-deletions` | `cron_process_account_deletions()` (post-hardening, `20260518000000`) |
`0 4 1 * *` | 01:00 día 1 | `apply-retention-policies` | `cron_apply_retention_policies()` (NUEVO) |
`0 9,15,21 * * *` | 06/12/18 | `control-snapshots-refresh` | `cron_refresh_control_snapshots()` (NUEVO) |
`0 12 * * *` | 09:00 | `notifications-morning` | Edge: `notifications-orchestrator` (NUEVO) |
`0 12 * * *` | 09:00 | `notifications-fixed-upcoming` | Edge: `notifications-orchestrator` (NUEVO) |
`0 17 * * *` | 14:00 | `notifications-midday` | Edge: `notifications-orchestrator` (NUEVO) |
`30 23 * * *` | 20:30 | `notifications-evening` | Edge: `notifications-orchestrator` (NUEVO) |

Verificar:

```sql
select jobname, schedule, active from cron.job order by schedule;
```

---

## 4. Métricas a vigilar semanalmente

| Métrica | Donde la veo | Umbral verde | Umbral amarillo | Umbral rojo |
|---|---|---|---|---|
| `home_snapshot` p95 latency | Supabase dashboard → Reports → API | <150ms | 150-300ms | >300ms |
| `home_snapshot` egress promedio | Supabase dashboard → API | <100KB/call | 100-200KB | >200KB |
| `control_snapshot` p95 latency | Supabase dashboard | <50ms | 50-200ms | >200ms |
| Edge invocations/día | Supabase dashboard → Functions | <500/día (post-handover) | 500-1500/día | >1500/día |
| Realtime concurrent peak | Supabase dashboard | <100 | 100-180 | >180 |
| DB size | DB Health screen (mobile dev) o `db_health_snapshot()` | <5 GB | 5-7 GB | >7 GB (Pro límite 8) |
| `cron_*` execution time | Supabase logs (DB) | sin errores | 1-2 errores/semana | errores recurrentes |
| Tests `validate` en CI | GitHub Actions | green | flaky | red |

Cuando una métrica entra en zona amarilla, abrir issue para investigar. Cuando entra en roja, considerar disparar la **próxima ronda de optimización** (ver §6 abajo).

---

## 5. Rollback por fase

### Phase 1 (índices + RLS)
- Drop indexes: copiar las líneas DOWN de `20260512000000_indexes_for_5k_mau.sql`.
- Reset RLS helpers a VOLATILE: `alter function public.is_family_member(uuid) volatile; alter function public.is_family_owner(uuid) volatile;`

### Phase 2 (home_snapshot trim)
- Re-aplicar `20260507000400_cleanup_legacy_family_code.sql` para volver al cuerpo previo (sin caps).
- Cliente: revertir cambios en `mobile/features/home/use-home-snapshot.ts` y `app/(app)/(tabs)/_layout.tsx`.

### Phase 3 (control_snapshot)
- `select cron.unschedule('control-snapshots-refresh');`
- `drop function if exists public.control_snapshot();`
- `drop function if exists public.compute_control_snapshot(uuid);`
- `drop table if exists public.control_snapshots;`
- Cliente: revertir `mobile/features/insights/use-control-snapshot.ts` y la integración en `use-control-v2-data.ts`.

### Phase 4 (retention)
**Crítico:** una vez ejecutados los crones, los datos viejos están borrados. No hay rollback de datos. **Backup ANTES de aplicar:**

```bash
supabase db dump --data-only --linked > backup-pre-retention-$(date +%Y%m%d-%H%M).sql
```

Para desactivar los crones (sin recuperar datos):

```sql
select cron.unschedule('purge-archived-expenses');
select cron.unschedule('apply-retention-policies');
```

### Phase 5 (notifications orchestrator)
1. Re-aplicar `20260423220137_notifications_cron.sql` para restaurar los schedules viejos.
2. Desactivar schedules nuevos:
   ```sql
   select cron.unschedule('notifications-morning');
   select cron.unschedule('notifications-midday');
   select cron.unschedule('notifications-evening');
   select cron.unschedule('notifications-fixed-upcoming');
   ```
3. Las Edge functions `notifications-orchestrator` y `send-family-push v2` quedan deployadas pero sin tráfico (no rompen nada).

### Phase 6 (db_health_snapshot)
- `drop function if exists public.db_health_snapshot();`
- Cliente: borrar carpeta `mobile/features/dev-health/`, archivo `mobile/screens/dev-health-screen.tsx` y route `app/(app)/settings/dev-health.tsx`.

---

## 6. Próxima ronda de optimización (cuando dispara)

| Trigger | Acción |
|---|---|
| DB > 70% del plan Pro (5.6 GB) | Auditar tabla por tabla; considerar archivado de `monthly_summaries` viejos a `monthly_summaries_archive` con menos índices. |
| Egress > 60% del plan Pro (150 GB/mes) | Revisar selectores en hooks; agregar más caps a `home_snapshot`; considerar GZIP en cliente. |
| Edge invocations > 70% (1.4M/mes) | Mover más lógica del Asistente a Edge (saca CPU de Postgres). |
| Realtime concurrent > 70% (140) | Implementar Phase 4.2.F del spec original: gating por presence (subscribe solo si 2+ miembros activos). |
| `expenses` rows > 5M activas | Particionar por año (`PARTITION BY RANGE (created_at)`). |
| Compute Medium con CPU >70% sostenido | Upgrade a Compute Large ($60/mes adicional). |

---

## 7. Tests de integración (cuando los necesitás)

Los tests viven en `tests/integration/`. Necesitan Supabase local corriendo. Skip gracioso si no es alcanzable.

**Setup (una vez):**

```bash
npx supabase start
```

**Correr todos:**

```bash
./scripts/npmw run test -- tests/integration/
```

**Correr uno específico:**

```bash
./scripts/npmw run test -- tests/integration/control-snapshot.test.ts
```

Si los tests skipean por "Supabase unreachable", verificá que `npx supabase status` esté healthy. Si querés forzar URL/keys, exportá:

```bash
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_ANON_KEY=$(npx supabase status -o json | jq -r .ANON_KEY)
export SUPABASE_SERVICE_ROLE_KEY=$(npx supabase status -o json | jq -r .SERVICE_ROLE_KEY)
```

---

## 8. Tests pre-existentes saltados (TODO list)

Durante la implementación se descubrieron 23 tests preexistentes rotos en `main`. Quedaron como `it.skip` con comentario `// TODO(phase-1-cleanup)`. Los archivos afectados:

- `tests/unit/financial-summary-radial-static.test.ts` — módulo eliminado durante refactor. **Archivo también eliminado del repo** (ya no existe en disco).
- `tests/unit/home-aggregates-{mood,sparkline,streak,hero-stats}.test.ts` — funciones removidas de `home-aggregates.model`. **Estos 4 archivos también fueron eliminados del repo** (solo persiste `home-aggregates-comparison.test.ts`).
- `tests/unit/home-dashboard-model.test.ts` — `buildHomeVelocity` removido.
- `tests/unit/household-setup-wizard-model.test.ts` — `isHouseholdSetupPending` removido.
- `tests/unit/settings-form-model.test.ts` — `buildFinanceFieldValues`, `canSaveProfileDraft`, `sanitizeDayInput` removidos.

**Decisión pendiente:** re-implementar tests con la lógica actual o borrar definitivamente. No urgente.

---

## 9. Capacidad estimada

| Métrica | Pre-implementación | Post-implementación | Plan Pro límite | % uso a 5K MAU |
|---|---|---|---|---|
| DB total | ~12 GB (sin retención) | ~3-4 GB | 8 GB | ~50% |
| Egress/mes | ~80-100 GB | ~50-60 GB | 250 GB | ~25% |
| Edge invocations/mes | ~1.2M | ~150K | 2M | ~7% |
| Realtime concurrent peak | ~600-1.200 | ~150 (sin gating) | 200 | ~75% |

**MAU servibles estimados:** ~10.000-12.000 con margen sobre 5K objetivo.

**Costo Pro estimado a 5K MAU:** ~$55/mes total ≈ $0.011/MAU.

<!-- ✓ Contrastado contra código el 2026-05-22 -->
