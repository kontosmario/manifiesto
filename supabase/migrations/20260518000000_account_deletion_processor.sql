-- WHAT: Cron processor para hard-deletes de cuentas marcadas con
--       `profiles.deletion_scheduled_at <= now()`. Cierra el loop del
--       flujo de Delete Account end-to-end.
--
-- WHY:  La migración 20260517000000 (account_deletion.sql) implementó
--       el soft-delete: el usuario pide la baja, el RPC marca el
--       timestamp con 30 días de gracia. Sin un procesador background
--       que materialice el hard-delete cuando vence la gracia, las
--       cuentas quedarían marcadas indefinidamente — violando GDPR
--       Art. 17 "right to erasure" y la promesa explícita que le hace
--       la app al usuario en el confirm sheet de Settings.
--
-- HOW:  Toda la lógica vive dentro de Postgres. No hay edge function
--       porque no hay API externa que invocar — `admin_delete_account`
--       hace `delete from auth.users where id = ?` y las FKs ON DELETE
--       CASCADE de toda la app limpian el resto. Es 100% transaccional
--       y se mantiene sin secrets ni vault.
--
-- ROLLBACK (manual):
--   do $$ begin perform cron.unschedule('process-account-deletions');
--   exception when others then null; end $$;
--   drop function if exists public.cron_process_account_deletions();

-- ─── 1. Procesador batch ──────────────────────────────────────────
-- Recorre el view `account_deletions_due` (gracia vencida) y dispara
-- `admin_delete_account` por usuario. Cada delete vive en su propio
-- bloque `begin...exception` para que un usuario problemático no
-- bloquee la cohorte entera.
create or replace function public.cron_process_account_deletions()
returns table (
  processed_count int,
  failed_count int,
  failures jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_processed int := 0;
  v_failed int := 0;
  v_failures jsonb := '[]'::jsonb;
  v_error_msg text;
begin
  for v_user_id in
    select user_id from public.account_deletions_due
  loop
    begin
      perform public.admin_delete_account(v_user_id);
      v_processed := v_processed + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_error_msg := sqlerrm;
      v_failures := v_failures || jsonb_build_object(
        'user_id', v_user_id,
        'error', v_error_msg,
        'sqlstate', sqlstate
      );
      -- Loggea para que aparezca en Supabase logs sin tirar la
      -- transacción del procesador entero.
      raise warning
        'cron_process_account_deletions: failed user_id=% sqlstate=% msg=%',
        v_user_id, sqlstate, v_error_msg;
    end;
  end loop;

  return query select v_processed, v_failed, v_failures;
end;
$$;

revoke all on function public.cron_process_account_deletions() from public;
grant execute on function public.cron_process_account_deletions() to service_role;

comment on function public.cron_process_account_deletions() is
  'Daily cron processor for hard-deleting accounts whose '
  'deletion_scheduled_at has elapsed. Returns (processed, failed, '
  'failures jsonb). Failures are isolated per-user so one broken row '
  'does not abort the batch.';

-- ─── 2. Schedule diario ───────────────────────────────────────────
-- Corre a las 04:30 UTC (01:30 ART). Después del purge-archived-expenses
-- de las 04:30 y antes del traffic de la mañana. Idempotente: si ya
-- existía un schedule con el mismo nombre, lo reemplaza.
do $$
declare
  v_has_cron boolean;
begin
  select exists(
    select 1 from pg_extension where extname = 'pg_cron'
  ) into v_has_cron;

  if not v_has_cron then
    raise notice
      'pg_cron not available; skipping process-account-deletions '
      'schedule. Apply the cron manually when running on Supabase '
      'Cloud (where pg_cron is enabled).';
    return;
  end if;

  -- Limpia el schedule previo si existía (idempotencia).
  begin
    perform cron.unschedule('process-account-deletions');
  exception when others then
    -- No existía; OK.
    null;
  end;

  -- Programa el processor diario.
  perform cron.schedule(
    'process-account-deletions',
    '30 4 * * *',  -- daily at 04:30 UTC
    $cron$select public.cron_process_account_deletions();$cron$
  );
end$$;
