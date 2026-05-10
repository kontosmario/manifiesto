-- WHAT: RPC `gastos_snapshot()` que bundlea en una sola llamada las
--       4 RPCs existentes del Gastos screen (hero, calendar, categories,
--       primera página de paginated) más los datos de streak (row +
--       últimos 14 marked_days). Cliente seedéa todas las caches y
--       evita 6 round-trips en cold-start de la pantalla.
--
-- WHY: Cold-start de Gastos disparaba 6 RPCs paralelas:
--        - gastos_hero_summary       (~547ms)
--        - gastos_calendar_summary   (~545ms)
--        - gastos_categories_with_counts (~511ms)
--        - gastos_expenses_paginated (~547ms, primera página)
--        - user_streaks select       (~543ms)
--        - streak_marked_days select (~510ms)
--      Reemplazándolas por una sola RPC bajamos la latencia agregada
--      (paralelismo HTTP no escalaba más allá de 4–6 conexiones) y
--      reducimos server-load.
--
-- Implementación: el wrapper invoca las RPCs hijas (ya tienen su
-- propio scope check vía SECURITY DEFINER + auth.uid()) y agrega los
-- streaks via select directo. Además hace un membership-check propio
-- (defense in depth) antes de invocar nada.

create or replace function public.gastos_snapshot(
  p_family_id uuid,
  p_cycle_start timestamptz,
  p_cycle_end timestamptz,
  p_today date default current_date,
  p_cupo_diario numeric default 0,
  p_days_per_page int default 7,
  p_timezone text default 'America/Argentina/Buenos_Aires'
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  -- Defense in depth: las RPCs hijas también validan, pero queremos
  -- fail-fast aquí si el caller no es miembro activo de la family.
  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = v_user_id
      and fm.role <> 'blocked'
  ) then
    raise exception 'Not a family member';
  end if;

  -- Cap defensivo: days_per_page > 31 no tiene sentido (un ciclo
  -- completo). Evita que clientes inflados pidan paginas absurdas.
  if p_days_per_page > 31 then
    p_days_per_page := 31;
  elsif p_days_per_page < 1 then
    p_days_per_page := 1;
  end if;

  v_result := jsonb_build_object(
    'hero', public.gastos_hero_summary(
      p_family_id, p_cycle_start, p_cycle_end, p_today, p_timezone, null
    ),
    'calendar', public.gastos_calendar_summary(
      p_family_id, p_cycle_start, p_cycle_end, p_today, p_cupo_diario, p_timezone, null
    ),
    'categories', public.gastos_categories_with_counts(
      p_family_id, p_cycle_start, p_cycle_end
    ),
    'first_page', public.gastos_expenses_paginated(
      p_family_id, p_cycle_start, p_cycle_end, null, p_days_per_page, p_today, p_timezone, null
    ),
    'streak_row', (
      select jsonb_build_object(
        'current_streak', us.current_streak,
        'longest_streak', us.longest_streak,
        'total_days_logged', us.total_days_logged,
        'last_logged_date', us.last_logged_date,
        'freeze_tokens', us.freeze_tokens,
        'streak_broken_at', us.streak_broken_at
      )
      from public.user_streaks us
      where us.family_id = p_family_id
        and us.user_id = v_user_id
      limit 1
    ),
    'streak_marked_days', coalesce((
      select jsonb_agg(smd.marked_date order by smd.marked_date desc)
      from (
        select marked_date
        from public.streak_marked_days
        where family_id = p_family_id
          and user_id = v_user_id
        order by marked_date desc
        limit 14
      ) smd
    ), '[]'::jsonb)
  );

  return v_result;
end;
$$;

revoke all on function public.gastos_snapshot(
  uuid, timestamptz, timestamptz, date, numeric, int, text
) from public;
grant execute on function public.gastos_snapshot(
  uuid, timestamptz, timestamptz, date, numeric, int, text
) to authenticated;

-- ═══ DOWN ═══════════════════════════════════════════════════════════
-- drop function if exists public.gastos_snapshot(
--   uuid, timestamptz, timestamptz, date, numeric, int, text
-- );
