-- Gastos screen — split del endpoint monolítico en 5 RPCs especializadas
-- + 1 índice compuesto. Cada RPC sirve exactamente lo que un surface
-- necesita, así el cliente baja sólo lo que va a renderizar.
-- Ver `docs/gastos-architecture-v2.md` para el diseño completo.
--
-- RPCs:
--   1. gastos_hero_summary           → agregados del hero card
--   2. gastos_calendar_summary       → 1 row/día con mood server-side
--   3. gastos_categories_with_counts → categorías + count por ciclo
--   4. gastos_expenses_paginated     → cursor-based, 2 días/page
--   5. gastos_expenses_for_day       → expenses del día seleccionado
--
-- Index:
--   expenses_family_category_created_idx → acelera filter-by-category
--   queries en cualquier rango de fechas, partial sobre gastos
--   variables (commitment_id is null).
--
-- Todas las funciones son `security invoker stable` — la RLS de
-- `expenses` y `categories` aplica al caller. No requieren chequeos
-- internos porque RLS ya filtra cross-family.

-- ─── Index compuesto ────────────────────────────────────────────────
-- Acelera queries que filtran por (family_id, category_id) en un
-- rango de created_at, que es exactamente lo que hacen las nuevas
-- RPCs cuando el usuario filtra por categoría. Partial: sólo gastos
-- variables (excluye los pagos auto-generados de fijos).
create index if not exists expenses_family_category_created_idx
  on public.expenses (family_id, category_id, created_at desc)
  where commitment_id is null;

-- ─── 1. gastos_hero_summary ─────────────────────────────────────────
create or replace function public.gastos_hero_summary(
  p_family_id uuid,
  p_cycle_start timestamptz,
  p_cycle_end timestamptz,
  p_today date default current_date,
  p_timezone text default 'America/Argentina/Buenos_Aires',
  p_category_id uuid default null
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with cycle_expenses as (
    select e.category_id, abs(e.price) as amount, e.created_at
    from public.expenses e
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= p_cycle_start
      and e.created_at < p_cycle_end
      and (p_category_id is null or e.category_id = p_category_id)
  ),
  totals as (
    select
      coalesce(sum(amount), 0)::numeric as total,
      count(*)::int as count
    from cycle_expenses
  ),
  by_cat as (
    select
      e.category_id,
      c.name,
      c.color,
      sum(e.amount) as amount
    from cycle_expenses e
    join public.categories c on c.id = e.category_id
    group by e.category_id, c.name, c.color
    order by sum(e.amount) desc
    limit 3
  ),
  -- Last 7 calendar days from p_today (oldest first → newest last).
  -- Bars normalized to [0, 1] by max — empty days come back as 0.
  last_7_days as (
    select (p_today - generate_series(0, 6))::date as local_date
  ),
  bars_raw as (
    select
      l.local_date,
      coalesce(sum(e.amount), 0)::numeric as total
    from last_7_days l
    left join cycle_expenses e
      on ((e.created_at at time zone p_timezone)::date) = l.local_date
    group by l.local_date
  ),
  bars_max as (
    select greatest(max(total), 1) as max_total from bars_raw
  ),
  bars_array as (
    select coalesce(jsonb_agg(
      round((total / (select max_total from bars_max))::numeric, 4)
      order by local_date asc
    ), '[]'::jsonb) as data
    from bars_raw
  ),
  cycle_days_elapsed as (
    select greatest(1, least(
      (extract(epoch from (p_cycle_end - p_cycle_start)) / 86400)::int,
      (p_today - p_cycle_start::date + 1)
    ))::int as value
  )
  select jsonb_build_object(
    'total', (select total from totals),
    'count', (select count from totals),
    'cycle_days_elapsed', (select value from cycle_days_elapsed),
    'average_daily',
      round(((select total from totals) / nullif((select value from cycle_days_elapsed), 0))::numeric, 0),
    'top_categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', category_id,
        'name', name,
        'color', color,
        'amount', amount,
        'percent',
          coalesce(round((amount / nullif((select total from totals), 0)) * 100)::int, 0)
      ) order by amount desc)
      from by_cat
    ), '[]'::jsonb),
    'recent_daily_bars', (select data from bars_array)
  )
$$;

revoke all on function public.gastos_hero_summary(
  uuid, timestamptz, timestamptz, date, text, uuid
) from public;
grant execute on function public.gastos_hero_summary(
  uuid, timestamptz, timestamptz, date, text, uuid
) to authenticated;

-- ─── 2. gastos_calendar_summary ─────────────────────────────────────
create or replace function public.gastos_calendar_summary(
  p_family_id uuid,
  p_cycle_start timestamptz,
  p_cycle_end timestamptz,
  p_today date default current_date,
  p_cupo_diario numeric default 0,
  p_timezone text default 'America/Argentina/Buenos_Aires',
  p_category_id uuid default null
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with elapsed_days as (
    -- One row per cycle day that has already elapsed (<= today).
    select
      d::date as iso_date,
      extract(day from d)::int as day_of_month
    from generate_series(
      p_cycle_start::date,
      least((p_cycle_end - interval '1 day')::date, p_today),
      interval '1 day'
    ) d
  ),
  per_day as (
    select
      ((e.created_at at time zone p_timezone)::date) as local_date,
      sum(abs(e.price)) as total,
      count(*)::int as count
    from public.expenses e
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= p_cycle_start
      and e.created_at < p_cycle_end
      and (p_category_id is null or e.category_id = p_category_id)
    group by local_date
  ),
  -- Anchor for the green/amber/red thresholds. Prefer cupo_diario
  -- when configured; fall back to running cycle average.
  fallback_avg as (
    select
      coalesce(
        (select sum(total) from per_day) /
        nullif((select count(*) from elapsed_days), 0),
        0
      ) as value
  ),
  anchor_value as (
    select case
      when p_cupo_diario > 0 then p_cupo_diario
      else (select value from fallback_avg)
    end as anchor
  )
  select jsonb_build_object(
    'days', coalesce(jsonb_agg(jsonb_build_object(
      'iso_date', d.iso_date,
      'day', d.day_of_month,
      'total', coalesce(p.total, 0),
      'count', coalesce(p.count, 0),
      'mood', case
        when coalesce(p.total, 0) = 0 then 'empty'
        when coalesce(p.total, 0) > (select anchor from anchor_value) * 1.3 then 'red'
        when coalesce(p.total, 0) > (select anchor from anchor_value) then 'amber'
        else 'green'
      end
    ) order by d.iso_date asc), '[]'::jsonb)
  )
  from elapsed_days d
  left join per_day p on p.local_date = d.iso_date
$$;

revoke all on function public.gastos_calendar_summary(
  uuid, timestamptz, timestamptz, date, numeric, text, uuid
) from public;
grant execute on function public.gastos_calendar_summary(
  uuid, timestamptz, timestamptz, date, numeric, text, uuid
) to authenticated;

-- ─── 3. gastos_categories_with_counts ───────────────────────────────
create or replace function public.gastos_categories_with_counts(
  p_family_id uuid,
  p_cycle_start timestamptz,
  p_cycle_end timestamptz
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with counts as (
    select e.category_id, count(*)::int as cnt
    from public.expenses e
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= p_cycle_start
      and e.created_at < p_cycle_end
    group by e.category_id
  )
  select jsonb_build_object(
    'categories', coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'color', c.color,
      'count_in_cycle', coalesce(co.cnt, 0)
    ) order by coalesce(co.cnt, 0) desc, c.name asc), '[]'::jsonb)
  )
  from public.categories c
  left join counts co on co.category_id = c.id
  where c.family_id = p_family_id
    and c.scope = 'expense'
$$;

revoke all on function public.gastos_categories_with_counts(
  uuid, timestamptz, timestamptz
) from public;
grant execute on function public.gastos_categories_with_counts(
  uuid, timestamptz, timestamptz
) to authenticated;

-- ─── 4. gastos_expenses_paginated ───────────────────────────────────
-- Cursor-based paging by local-day. Returns the N most recent days
-- with at least one expense (skips empty days). The cursor is the
-- ISO date that was the OLDEST day of the previous page; the new
-- page returns days STRICTLY before that cursor.
--
--   p_before_iso_date = null  → start from p_today (initial load)
--   p_before_iso_date set     → next page (cursor strictly before it)
--
-- `next_cursor` in the response = oldest day of the current page,
-- to be passed back as `p_before_iso_date` next time. `has_more`
-- mirrors `next_cursor is not null` for callers that want a quick
-- boolean.
create or replace function public.gastos_expenses_paginated(
  p_family_id uuid,
  p_cycle_start timestamptz,
  p_cycle_end timestamptz,
  p_before_iso_date date default null,
  p_days_per_page int default 2,
  p_today date default current_date,
  p_timezone text default 'America/Argentina/Buenos_Aires',
  p_category_id uuid default null
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with expense_rows as (
    select
      e.id,
      e.family_id,
      e.category_id,
      e.commitment_id,
      e.description,
      e.price,
      e.created_by,
      e.created_at,
      c.name as category_name,
      c.color as category_color,
      p.display_name as creator_display_name,
      ((e.created_at at time zone p_timezone)::date) as local_date
    from public.expenses e
    left join public.categories c on c.id = e.category_id
    left join public.profiles p on p.id = e.created_by
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= p_cycle_start
      and e.created_at < p_cycle_end
      and (p_category_id is null or e.category_id = p_category_id)
      and (
        (p_before_iso_date is null
          and ((e.created_at at time zone p_timezone)::date) <= p_today)
        or
        (p_before_iso_date is not null
          and ((e.created_at at time zone p_timezone)::date) < p_before_iso_date)
      )
  ),
  distinct_days as (
    select distinct local_date
    from expense_rows
    order by local_date desc
    limit p_days_per_page
  ),
  selected_rows as (
    select er.*
    from expense_rows er
    where er.local_date in (select local_date from distinct_days)
  ),
  page_min as (
    select min(local_date) as min_date from distinct_days
  ),
  next_cursor_calc as (
    select case
      when (select min_date from page_min) is null then null
      when exists (
        select 1 from expense_rows
        where local_date < (select min_date from page_min)
      ) then (select min_date from page_min)
      else null
    end as cursor_date
  )
  select jsonb_build_object(
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sr.id,
        'family_id', sr.family_id,
        'category_id', sr.category_id,
        'category_name', sr.category_name,
        'category_color', sr.category_color,
        'commitment_id', sr.commitment_id,
        'description', sr.description,
        'price', sr.price,
        'created_at', sr.created_at,
        'created_by', sr.created_by,
        'creator_display_name', sr.creator_display_name,
        'iso_date', sr.local_date
      ) order by sr.created_at desc)
      from selected_rows sr
    ), '[]'::jsonb),
    'next_cursor', (select cursor_date from next_cursor_calc),
    'has_more', (select cursor_date from next_cursor_calc) is not null
  )
$$;

revoke all on function public.gastos_expenses_paginated(
  uuid, timestamptz, timestamptz, date, int, date, text, uuid
) from public;
grant execute on function public.gastos_expenses_paginated(
  uuid, timestamptz, timestamptz, date, int, date, text, uuid
) to authenticated;

-- ─── 5. gastos_expenses_for_day ─────────────────────────────────────
-- Returns ALL expenses for a single local-day. Used when the user
-- taps a day in the calendar — the screen surfaces only that day's
-- movements without paginating across the cycle.
create or replace function public.gastos_expenses_for_day(
  p_family_id uuid,
  p_iso_date date,
  p_timezone text default 'America/Argentina/Buenos_Aires',
  p_category_id uuid default null
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with rows as (
    select
      e.id,
      e.family_id,
      e.category_id,
      e.commitment_id,
      e.description,
      e.price,
      e.created_by,
      e.created_at,
      c.name as category_name,
      c.color as category_color,
      p.display_name as creator_display_name
    from public.expenses e
    left join public.categories c on c.id = e.category_id
    left join public.profiles p on p.id = e.created_by
    where e.family_id = p_family_id
      and e.commitment_id is null
      and ((e.created_at at time zone p_timezone)::date) = p_iso_date
      and (p_category_id is null or e.category_id = p_category_id)
  )
  select jsonb_build_object(
    'expenses', coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'family_id', family_id,
      'category_id', category_id,
      'category_name', category_name,
      'category_color', category_color,
      'commitment_id', commitment_id,
      'description', description,
      'price', price,
      'created_at', created_at,
      'created_by', created_by,
      'creator_display_name', creator_display_name,
      'iso_date', p_iso_date
    ) order by created_at desc), '[]'::jsonb)
  )
  from rows
$$;

revoke all on function public.gastos_expenses_for_day(
  uuid, date, text, uuid
) from public;
grant execute on function public.gastos_expenses_for_day(
  uuid, date, text, uuid
) to authenticated;

-- Force PostgREST to re-read schema so the new RPCs are callable
-- via supabase.rpc(...) immediately after deploy.
notify pgrst, 'reload schema';
