-- WHAT: RPC bulk para batchear eventos de telemetría del home en una
--       sola llamada en vez de N round-trips (uno por evento).
-- WHY: Cold-start del home dispara 3-7 logHomeEvent (home.opened +
--      home.element_shown × N). Cada uno era un POST separado a
--      /rest/v1/rpc/log_home_event → server-load redundante + N
--      ratelimits enforcement. El cliente ya hace queue + flush
--      debounced (50ms o 20 eventos máx) y manda un único array.
--      Server hace UN insert masivo en home_telemetry.
--
-- Misma seguridad que log_home_event:
--   - SECURITY DEFINER + search_path bloqueado.
--   - Validación de membership por family_id (cada evento del batch).
--   - Rate limit (60/min/user, mismo cap pero ahora cubre el batch
--     entero — un batch de 20 eventos cuenta como UNA llamada al
--     enforce_rate_limit).
--   - Cap por evento: event ≤64 chars, element_id ≤128, slot ≤64,
--     context ≤4KB octets (defensivo, idéntico al per-event).
--   - Cap por batch: ≤50 eventos por llamada (defensivo contra abuse).

create or replace function public.log_home_events_bulk(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'p_events must be a jsonb array';
  end if;

  v_count := jsonb_array_length(p_events);

  if v_count = 0 then
    return 0;
  end if;

  if v_count > 50 then
    raise exception 'Batch too large (% events; max 50)', v_count;
  end if;

  -- Rate limit aplicado UNA vez por batch (no por evento). Mantiene
  -- el budget de 60 calls/min/user como el log_home_event original.
  perform public.enforce_rate_limit('log_home_events_bulk', 60, 60);

  -- Validar cada fila + insertar de una. CTE valida en PostgreSQL
  -- antes del INSERT; si alguno rompe los caps el batch entero falla
  -- (atomic, igual que el per-event original que abortaba el solo).
  with src as (
    select
      (e->>'family_id')::uuid                            as family_id,
      coalesce(e->>'event', '')                          as event,
      coalesce(e->>'element_id', '')                     as element_id,
      coalesce(e->>'slot', '')                           as slot,
      coalesce(e->'context', '{}'::jsonb)                as context
    from jsonb_array_elements(p_events) e
  ),
  validated as (
    select
      family_id,
      event,
      nullif(element_id, '') as element_id,
      nullif(slot, '')       as slot,
      context
    from src
    where length(event) between 1 and 64
      and length(element_id) <= 128
      and length(slot) <= 64
      and octet_length(context::text) <= 4096
      and public.is_family_member_active(family_id)
  )
  insert into public.home_telemetry (
    user_id, family_id, event, element_id, slot, context
  )
  select auth.uid(), family_id, event, element_id, slot, context
  from validated;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.log_home_events_bulk(jsonb) from public;
grant execute on function public.log_home_events_bulk(jsonb) to authenticated;

-- ═══ DOWN ═════════════════════════════════════════════════════════════
-- drop function if exists public.log_home_events_bulk(jsonb);
