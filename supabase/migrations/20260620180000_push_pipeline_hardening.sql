-- Push pipeline hardening (auditoría 2026-06-15)
-- ------------------------------------------------------------------
-- Contexto: la auditoría adversarial del pipeline de push encontró que
-- `processKind` (notifications-orchestrator) inserta filas con
-- emit_notifications_bulk (que solo devuelve un count) y NUNCA marca
-- pushed_at — dejando ~4.2k filas en NULL para siempre. Para poder
-- marcar SOLO las filas realmente entregadas (y evitar re-push de
-- duplicados deduplicados), el orchestrator necesita los ids de las
-- filas recién insertadas, no un count.
--
-- Esta migración:
--   1. emit_notifications_bulk_returning(p_rows): mismo INSERT con dedup
--      que emit_notifications_bulk, pero devuelve un jsonb array con
--      {id, family_id, user_id, title, body, metadata} de las filas
--      EFECTIVAMENTE insertadas (post-dedup). El orchestrator arma los
--      mensajes desde esas filas (no desde el input), así una fila
--      deduplicada no se vuelve a pushear, y marca pushed_at solo en las
--      entregadas.
--   2. Backfill one-shot: marca pushed_at=now() en las huérfanas viejas
--      (>24h, fuera de la ventana del backlog) para que el count de NULL
--      no crezca indefinidamente. Las recientes (<24h) se dejan por si
--      el backlog todavía las empuja.
--
-- emit_notifications_bulk (la vieja, count-only) se conserva intacta por
-- compatibilidad; processKind pasa a usar la nueva.

create or replace function public.emit_notifications_bulk_returning(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  with src as (
    select
      (r->>'family_id')::uuid as family_id,
      nullif(r->>'user_id','')::uuid as user_id,
      r->>'title' as title,
      r->>'body' as body,
      r->>'kind' as kind,
      r->>'severity' as severity,
      r->'metadata' as metadata,
      r->>'dedup_key' as dedup_key
    from jsonb_array_elements(p_rows) as r
  ),
  ins as (
    insert into public.notifications (
      family_id, user_id, title, body, kind, severity, metadata, dedup_key
    )
    select family_id, user_id, title, body, kind, severity, metadata, dedup_key
    from src
    on conflict (dedup_key) where dedup_key is not null do nothing
    returning id, family_id, user_id, title, body, metadata
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ins.id,
        'family_id', ins.family_id,
        'user_id', ins.user_id,
        'title', ins.title,
        'body', ins.body,
        'metadata', ins.metadata
      )
    ),
    '[]'::jsonb
  )
  into v_result
  from ins;

  return v_result;
end;
$function$;

grant execute on function public.emit_notifications_bulk_returning(jsonb) to service_role;

-- Backfill: las huérfanas (pushed_at NULL) de más de 24h ya están fuera
-- de la ventana del backlog (list_unpushed_notifications filtra a 24h),
-- así que marcarlas pushed no cambia ningún envío — solo limpia el
-- estado para que el conteo de NULL no se acumule. Chunked por seguridad.
do $backfill$
declare
  v_n integer;
begin
  loop
    with batch as (
      select id from public.notifications
      where pushed_at is null
        and created_at < now() - interval '24 hours'
      limit 5000
    )
    update public.notifications n
    set pushed_at = now()
    from batch
    where n.id = batch.id;
    get diagnostics v_n = row_count;
    exit when v_n = 0;
  end loop;
end;
$backfill$;
