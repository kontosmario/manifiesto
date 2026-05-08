-- WHAT: Índices compuestos y parciales para hot-paths a 5K MAU.
-- WHY: A escala el conteo de unread notifications y los scans de retención
--      necesitan índices cubrientes. family_members(user_id) lo lee cada
--      RLS policy via is_family_member().
--
-- NOTA OPERACIONAL: estas migraciones usan CREATE INDEX (no CONCURRENTLY)
-- porque Supabase ejecuta las migraciones dentro de una transacción implícita,
-- y CONCURRENTLY no puede correr en transacción. A escala actual (<100 MAU)
-- el lock es instantáneo. Cuando notifications o advisor_signal_dismissals
-- superen 1M de filas, conviene crear estos índices manualmente desde el
-- dashboard con CREATE INDEX CONCURRENTLY antes de aplicar la migración
-- (la migración acá quedará como no-op gracias a IF NOT EXISTS).

-- ─── notifications: unread por usuario ─────────────────────────────
-- home_snapshot calcula unread_notification_count en cada apertura.
-- Nota: notifications_family_user_unread_idx (sin WHERE) ya existe desde
-- 20260423215800_notifications_ecosystem.sql y sirve al query de listado.
-- Este índice parcial sirve exclusivamente al count de no leídas.
create index if not exists notifications_family_user_unread_partial_idx
  on public.notifications (family_id, user_id, created_at desc)
  where read_at is null;

-- ─── notifications: retención (cron mensual purga por created_at) ──
create index if not exists notifications_created_at_idx
  on public.notifications (created_at);

-- ─── advisor_signal_dismissals: retención por created_at ───────────
create index if not exists advisor_signal_dismissals_created_at_idx
  on public.advisor_signal_dismissals (created_at);

-- ─── velocity_snapshots: retención por snapshot_date ──────────────
-- (idx de family_id + snapshot_date desc ya existe; este es para cron purga)
create index if not exists velocity_snapshots_snapshot_date_idx
  on public.velocity_snapshots (snapshot_date);

-- ─── fixed_expense_price_history: retención por changed_at ─────────
create index if not exists fixed_expense_price_history_changed_at_idx
  on public.fixed_expense_price_history (changed_at);

-- ─── family_members: lookup por user_id (lo usa is_family_member) ──
-- Si family_members ya tiene PK sobre (family_id, user_id) o índice equivalente,
-- esto agrega el reverse lookup (user → familia).
create index if not exists family_members_user_id_idx
  on public.family_members (user_id);

-- ─── expenses: retención por archived_at ──────────────────────────
-- expenses_family_archived_idx (family_id, archived_at) ya existe
-- según monthly_rollup migration. Este es el cubriente para cron purge
-- que solo necesita archived_at sin family_id.
create index if not exists expenses_archived_at_idx
  on public.expenses (archived_at)
  where archived_at is not null;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- drop index if exists notifications_family_user_unread_partial_idx;
-- drop index if exists notifications_created_at_idx;
-- drop index if exists advisor_signal_dismissals_created_at_idx;
-- drop index if exists velocity_snapshots_snapshot_date_idx;
-- drop index if exists fixed_expense_price_history_changed_at_idx;
-- drop index if exists family_members_user_id_idx;
-- drop index if exists expenses_archived_at_idx;
