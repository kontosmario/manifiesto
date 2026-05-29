-- "Manifiesto Wrapped" seen-state, atado al rollup del cierre de ciclo.
--
-- La card "VS mes" y un botón nuevo en el header de Control pueden lanzar
-- el CycleWrappedModal del último cierre. Para no pulsar el botón de
-- discoverability eternamente, marcamos por-cierre si ya se vio.
--
-- Modelo: una columna en `monthly_summaries` (por familia, igual que el
-- resto del rollup). En familia compartida, una vez que un miembro lo ve,
-- el pulse se apaga para la familia. Mismo molde que `mark_tour_seen`.

alter table public.monthly_summaries
  add column if not exists wrapped_seen_at timestamptz;

-- mark_cycle_wrapped_seen: marca el cierre como visto (idempotente vía
-- COALESCE para preservar el primer visto). Verifica que el caller sea
-- miembro de la familia dueña del summary antes de tocar nada.
create or replace function public.mark_cycle_wrapped_seen(p_summary_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select family_id into v_family_id
  from public.monthly_summaries
  where id = p_summary_id;

  if v_family_id is null then
    raise exception 'Summary not found';
  end if;

  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = v_family_id
      and fm.user_id = v_user_id
  ) then
    raise exception 'Not a member of this family';
  end if;

  update public.monthly_summaries
  set wrapped_seen_at = coalesce(wrapped_seen_at, now())
  where id = p_summary_id;
end $$;

grant execute on function public.mark_cycle_wrapped_seen(uuid) to authenticated;
