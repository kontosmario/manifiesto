-- FIX (2026-07-20): idempotencia server-side para los push del Asistente.
--
-- Causa raíz (bug de cliente sin backstop): las señales del asistente
-- (useAdvisorNotificationSync → send-family-push, p.ej. "Cobro esperado no
-- confirmado" / income-missing) NO insertan fila en `notifications` y
-- dependían SOLO de un cooldown local (SecureStore) por dispositivo. Ese
-- cooldown falla por (a) race en el `run()` async del hook (varios envíos en
-- el mismo minuto — medido: 3 send_family_push en 60s) y (b) se borra al
-- reinstalar la app (dev builds) → tormenta de push idénticas al OTRO miembro
-- de la familia (`.neq actor`). El cliente no puede deduplicar esto: es
-- cross-device / cross-sesión / cross-emisor.
--
-- ⚠️ ORDEN DE DEPLOY: aplicar ESTA migración ANTES de deployar el edge fn
-- send-family-push nuevo. El edge fn llama advisor_push_allowed_recipients; si
-- se deploya antes que la migración, la RPC no existe → el edge fn falla OPEN
-- (manda sin dedup) hasta que aterrice la migración. El orden inverso es seguro:
-- el edge fn viejo no llama la RPC. Mismo criterio que 20260713120000.
--
-- Fix: ledger server-side por DESTINATARIO + RPC batch atómica.
-- `send-family-push` la llama para todo kind `advisor_*` DESPUÉS de resolver
-- los destinatarios reales (post filtros de bloqueo/mute) y ANTES del fan-out:
-- a lo sumo un push por (destinatario, kind) por ventana de cooldown, sin
-- importar cuántos devices/sesiones/emisores lo disparen. La clave es por
-- RECEPTOR (no por familia): que A avise a B no debe silenciar el aviso que
-- B necesita — cada usuario recibe a lo sumo uno por ventana. Los push
-- sociales/de evento (no advisor) no tocan esto → siguen instantáneos.

-- Un renglón por (user, kind), UPSERT en el lugar. OJO: el `kind` incluye ids
-- de entidad (advisor_duplicate-<expenseId>, advisor_cap-<limitId>,
-- advisor_hike-<notifId>, ...), así que la cardinalidad (user, kind) NO está
-- acotada. Un renglón deja de servir apenas pasa el cooldown (horas); el cron
-- de poda de más abajo lo mantiene chico.
create table if not exists public.advisor_push_ledger (
  user_id uuid not null,
  kind text not null,
  pushed_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.advisor_push_ledger enable row level security;
-- Sin policies a propósito: solo el service_role (send-family-push / edge)
-- escribe vía la RPC security-definer de abajo. Mismo criterio que
-- 20260630020000_lock_internal_security_definer_functions.

-- Batch atómico: de la lista de destinatarios candidatos devuelve SOLO los que
-- están fuera de cooldown, marcándolos (pushed_at=now) en la MISMA sentencia.
-- El INSERT ... SELECT ... ON CONFLICT DO UPDATE ... WHERE ... RETURNING hace
-- que N llamadas concurrentes (el race del cliente) resuelvan determinístico:
-- por cada (user, kind) gana una sola (inserta o actualiza y aparece en
-- RETURNING); las de dentro de cooldown caen en el WHERE en false → no se
-- actualizan → no vuelven → no se les manda push.
create or replace function public.advisor_push_allowed_recipients(
  p_user_ids uuid[],
  p_kind text,
  p_cooldown_seconds integer
) returns table(user_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  insert into public.advisor_push_ledger as l (user_id, kind, pushed_at)
  select distinct u, p_kind, now()
  from unnest(coalesce(p_user_ids, array[]::uuid[])) as u
  where u is not null
  on conflict (user_id, kind) do update
    set pushed_at = now()
    where l.pushed_at < now() - make_interval(secs => greatest(coalesce(p_cooldown_seconds, 0), 0))
  returning l.user_id;
end;
$$;

revoke all on function public.advisor_push_allowed_recipients(uuid[], text, integer) from public, anon, authenticated;
grant execute on function public.advisor_push_allowed_recipients(uuid[], text, integer) to service_role;

comment on function public.advisor_push_allowed_recipients(uuid[], text, integer) is
  'Backstop de idempotencia para push del asistente. De los destinatarios candidatos devuelve (y marca) los que están fuera de cooldown para (user, kind); a lo sumo uno por ventana p_cooldown_seconds, atómico contra el race del cliente. Lo llama send-family-push para kinds advisor_*.';

-- Poda diaria: como (user, kind) no está acotado (ids de entidad en el kind) y
-- un renglón muere apenas pasa el cooldown (horas), borramos todo lo más viejo
-- que 3 días (>> cooldown). 4:17 UTC para no chocar con la ráfaga de emisores
-- (:00 checkins · :05 hike · :10 weekly · :15 recovery · :20/:50 relay · :25 dormant).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'advisor-push-ledger-cleanup') then
    perform cron.unschedule('advisor-push-ledger-cleanup');
  end if;
end $$;
select cron.schedule(
  'advisor-push-ledger-cleanup',
  '17 4 * * *',
  $$delete from public.advisor_push_ledger where pushed_at < now() - interval '3 days'$$
);
