-- Tour-seen state movido de SecureStore device-local a profiles.
-- Spec: docs/superpowers/specs/2026-05-27-tour-seen-backend-sync-design.md
--
-- Mover el estado al backend resuelve dos inconsistencias:
--   1. logout borraba tour-seen.* y la siguiente sesión del mismo
--      usuario veía todos los tours de nuevo
--   2. el mismo usuario en otro device veía los tours de nuevo

alter table public.profiles
  add column if not exists home_tour_seen_at    timestamptz,
  add column if not exists gastos_tour_seen_at  timestamptz,
  add column if not exists fijos_tour_seen_at   timestamptz,
  add column if not exists control_tour_seen_at timestamptz;

-- Backfill: usuarios con onboarding completado antes del deploy de
-- tours (2026-05-26). Ya conocen la app; marcamos todos vistos para
-- no molestar con tutoriales retroactivos. Reemplaza la lógica que
-- antes vivía en `useBackfillExistingUser` (device-local).
update public.profiles
set home_tour_seen_at    = now(),
    gastos_tour_seen_at  = now(),
    fijos_tour_seen_at   = now(),
    control_tour_seen_at = now()
where onboarding_completed_at is not null
  and onboarding_completed_at < '2026-05-26T00:00:00Z';

-- mark_tour_seen: idempotente vía COALESCE para preservar el primer
-- visto (importante para analytics futuro).
create or replace function public.mark_tour_seen(tour_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  case tour_key
    when 'home' then
      update public.profiles
      set home_tour_seen_at = coalesce(home_tour_seen_at, now())
      where id = v_user_id;
    when 'gastos' then
      update public.profiles
      set gastos_tour_seen_at = coalesce(gastos_tour_seen_at, now())
      where id = v_user_id;
    when 'fijos' then
      update public.profiles
      set fijos_tour_seen_at = coalesce(fijos_tour_seen_at, now())
      where id = v_user_id;
    when 'control' then
      update public.profiles
      set control_tour_seen_at = coalesce(control_tour_seen_at, now())
      where id = v_user_id;
    else
      raise exception 'Unknown tour_key: %', tour_key;
  end case;
end $$;

-- reset_tour_seen: settea la columna a NULL para que el tour vuelva
-- a auto-firar la próxima vez que el user visite la pantalla.
create or replace function public.reset_tour_seen(tour_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  case tour_key
    when 'home' then
      update public.profiles set home_tour_seen_at = null where id = v_user_id;
    when 'gastos' then
      update public.profiles set gastos_tour_seen_at = null where id = v_user_id;
    when 'fijos' then
      update public.profiles set fijos_tour_seen_at = null where id = v_user_id;
    when 'control' then
      update public.profiles set control_tour_seen_at = null where id = v_user_id;
    else
      raise exception 'Unknown tour_key: %', tour_key;
  end case;
end $$;

-- reset_all_tours_seen: para Settings → "Volver a ver todos los tutoriales".
create or replace function public.reset_all_tours_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set home_tour_seen_at    = null,
      gastos_tour_seen_at  = null,
      fijos_tour_seen_at   = null,
      control_tour_seen_at = null
  where id = v_user_id;
end $$;

revoke all on function public.mark_tour_seen(text)      from public;
revoke all on function public.reset_tour_seen(text)     from public;
revoke all on function public.reset_all_tours_seen()    from public;

grant execute on function public.mark_tour_seen(text)      to authenticated;
grant execute on function public.reset_tour_seen(text)     to authenticated;
grant execute on function public.reset_all_tours_seen()    to authenticated;
