-- supabase/migrations/20260609000000_request_account_deletion_idempotent.sql
--
-- CR Sprint A finding #2: `request_account_deletion` no era idempotente.
-- Repeated calls (TanStack Query retry on network error, malicious actor
-- spam) extendían `deletion_scheduled_at` 30 días más en cada llamada,
-- difiriendo indefinidamente el cron processor.
--
-- Fix: si ya hay un `deletion_scheduled_at` activo, devolver el timestamp
-- existente sin modificarlo. Solo la primera llamada agenda; las
-- siguientes son no-ops y devuelven el schedule original.

create or replace function public.request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing timestamptz;
  v_scheduled timestamptz;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  -- Idempotency: si ya hay una baja agendada, devolver el timestamp
  -- existente sin tocarlo. No hace daño si el RPC se llama varias veces
  -- (retry de red, doble click bypaseando el guard del cliente, etc.)
  select deletion_scheduled_at
    into v_existing
    from public.profiles
   where id = v_user_id;

  if v_existing is not null then
    return v_existing;
  end if;

  -- Primera llamada — agendar 30 días desde ahora.
  v_scheduled := now() + interval '30 days';

  update public.profiles
     set deletion_scheduled_at = v_scheduled,
         updated_at = now()
   where id = v_user_id;

  -- Borrar push subscriptions inmediatamente para que el user no reciba
  -- notificaciones durante el grace period (UX: ya pidió eliminar).
  delete from public.push_subscriptions
   where user_id = v_user_id;

  return v_scheduled;
end;
$$;

revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

comment on function public.request_account_deletion() is
  'Idempotent: agenda la baja de la cuenta para now()+30d. Si ya hay '
  'una baja agendada, devuelve el timestamp existente sin extenderlo. '
  'CR Sprint A finding #2 (2026-06-09).';
