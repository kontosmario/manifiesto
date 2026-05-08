-- WHAT: Helpers SQL para que la Edge orchestrator lea candidatos
--       y emita en bulk con deduplicación.
-- WHY: Mueve el bottleneck de fan-out a Edge sin perder la lógica
--      de negocio (idempotencia diaria) que hoy vive en cron_emit_*.

-- Agregar columna de dedup a notifications si no existe.
alter table public.notifications
  add column if not exists dedup_key text;

create unique index if not exists notifications_dedup_key_uq
  on public.notifications (dedup_key)
  where dedup_key is not null;

-- ─── list_pending_notifications ─────────────────────────────────────
-- Devuelve candidatos para un kind sin emitir nada.
-- Reutiliza la lógica de los cron_emit_* viejos.
create or replace function public.list_pending_notifications(p_kind text)
returns table (
  family_id uuid,
  user_id uuid,
  title text,
  body text,
  kind text,
  severity text,
  metadata jsonb,
  dedup_key text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_today_ar date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if p_kind = 'morning_checkins' then
    return query
    select
      fm.family_id,
      fm.user_id,
      'Buen día, ' || split_part(coalesce(p.display_name, 'vos'), ' ', 1) as title,
      'Hoy tenés ~$' || to_char(round(greatest(0, (ff.monthly_income - coalesce(
        (select sum(fe2.amount) from public.fixed_expenses fe2
         where fe2.family_id = fm.family_id and coalesce(fe2.status,'active')='active'
         and coalesce(fe2.frequency,'monthly')='monthly'), 0)) / 30.0)), 'FM999,999,999')
        || ' para moverte con margen.' as body,
      'checkin_morning' as kind,
      'info' as severity,
      jsonb_build_object('route', '/') as metadata,
      'checkin_morning:' || fm.family_id::text || ':' || fm.user_id::text
        || ':' || v_today_ar::text as dedup_key
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    left join public.profiles p on p.id = fm.user_id
    where coalesce(ff.monthly_income, 0) > 0
      and fm.role <> 'blocked';

  elsif p_kind = 'midday_checkins' then
    return query
    select
      fm.family_id,
      fm.user_id,
      'Medio día' as title,
      'Pasá por la app y revisá cómo vas hoy.' as body,
      'checkin_midday' as kind,
      'info' as severity,
      jsonb_build_object('route', '/') as metadata,
      'checkin_midday:' || fm.family_id::text || ':' || fm.user_id::text
        || ':' || v_today_ar::text as dedup_key
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    where coalesce(ff.monthly_income, 0) > 0
      and fm.role <> 'blocked';

  elsif p_kind = 'evening_checkins' then
    return query
    select
      fm.family_id,
      fm.user_id,
      'Cierre del día' as title,
      'Anotá lo último de hoy y mantené la racha.' as body,
      'checkin_evening' as kind,
      'info' as severity,
      jsonb_build_object('route', '/expenses') as metadata,
      'checkin_evening:' || fm.family_id::text || ':' || fm.user_id::text
        || ':' || v_today_ar::text as dedup_key
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    where coalesce(ff.monthly_income, 0) > 0
      and fm.role <> 'blocked';

  elsif p_kind = 'fixed_upcoming' then
    return query
    select
      fe.family_id,
      null::uuid as user_id,
      coalesce(nullif(btrim(fe.name), ''), 'Compromiso')
        || ' vence ' || (case when fe.next_due_on = v_today_ar then 'hoy' else 'mañana' end) as title,
      '$' || to_char(round(coalesce(fe.amount, 0)), 'FM999,999,999') as body,
      'fixed_upcoming' as kind,
      'warning' as severity,
      jsonb_build_object('route', '/fixed-expenses', 'fixed_expense_id', fe.id, 'amount', fe.amount, 'due_on', fe.next_due_on) as metadata,
      'fixed_upcoming:' || fe.id::text || ':' || v_today_ar::text as dedup_key
    from public.fixed_expenses fe
    where coalesce(fe.status, 'active') = 'active'
      and fe.next_due_on between v_today_ar and v_today_ar + 1;

  -- Otros kinds: streak_at_risk, streak_broken, weekly_insights se
  -- pueden agregar incrementalmente. Por ahora devolvemos vacío y la
  -- Edge orchestrator los maneja como no-op para esos kinds.
  end if;
end;
$$;

revoke all on function public.list_pending_notifications(text) from public;
grant execute on function public.list_pending_notifications(text) to service_role;

-- ─── emit_notifications_bulk ────────────────────────────────────────
-- Inserta N filas con on conflict do nothing por dedup_key.
-- Devuelve el conteo de filas efectivamente insertadas.
create or replace function public.emit_notifications_bulk(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
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
  )
  insert into public.notifications (
    family_id, user_id, title, body, kind, severity, metadata, dedup_key
  )
  select family_id, user_id, title, body, kind, severity, metadata, dedup_key
  from src
  on conflict (dedup_key) where dedup_key is not null do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.emit_notifications_bulk(jsonb) from public;
grant execute on function public.emit_notifications_bulk(jsonb) to service_role;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- drop function if exists public.list_pending_notifications(text);
-- drop function if exists public.emit_notifications_bulk(jsonb);
-- drop index if exists notifications_dedup_key_uq;
-- alter table public.notifications drop column if exists dedup_key;
