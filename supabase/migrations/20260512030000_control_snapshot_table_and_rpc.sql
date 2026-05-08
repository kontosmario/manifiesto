-- WHAT: control_snapshots (1 fila/familia) + RPC control_snapshot() que lee
--       y compute_control_snapshot(family) que escribe.
-- WHY: La pantalla Control hoy hace cálculos pesados client-side
--      (causal-engine, forecast-engine). Materializamos en server con
--      refresh cada 12h con fallback on-demand. Datos OK para tolerancia
--      12h del usuario; no depende de keys de home_snapshot (lee tablas
--      fuente directo: velocity_snapshots, category_limits, fixed_expenses).

-- ─── Tabla control_snapshots ───────────────────────────────────────────
create table if not exists public.control_snapshots (
  family_id uuid primary key references public.families(id) on delete cascade,
  forecast_close_amount numeric(14,2),
  forecast_overshoot_pct numeric(6,2),
  over_budget_categories jsonb not null default '[]'::jsonb,
  zombie_candidates jsonb not null default '[]'::jsonb,
  member_pressure jsonb not null default '[]'::jsonb,
  recommended_actions jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now()
);

alter table public.control_snapshots enable row level security;

drop policy if exists "control_snapshots_select_members" on public.control_snapshots;
create policy "control_snapshots_select_members"
on public.control_snapshots for select
to authenticated
using (public.is_family_member(family_id));

-- ─── compute helper (SECURITY DEFINER, escribe la fila) ────────────────
create or replace function public.compute_control_snapshot(p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_velocity record;
  v_finance record;
  v_libre numeric(14,2);
  v_overshoot_pct numeric(6,2);
  v_over_categories jsonb;
  v_zombies jsonb;
  v_member_pressure jsonb;
  v_actions jsonb := '[]'::jsonb;
begin
  -- Última velocity snapshot
  select * into v_velocity
  from public.velocity_snapshots
  where family_id = p_family_id
  order by snapshot_date desc
  limit 1;

  -- Datos financieros de la familia
  select * into v_finance from public.family_finance where family_id = p_family_id;

  if v_finance is null then
    -- Sin datos financieros: insertar fila vacía con defaults
    insert into public.control_snapshots (
      family_id, forecast_close_amount, forecast_overshoot_pct,
      over_budget_categories, zombie_candidates, member_pressure,
      recommended_actions, computed_at
    )
    values (
      p_family_id, null, 0,
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
      v_actions, now()
    )
    on conflict (family_id) do update set
      forecast_close_amount = excluded.forecast_close_amount,
      forecast_overshoot_pct = excluded.forecast_overshoot_pct,
      over_budget_categories = excluded.over_budget_categories,
      zombie_candidates = excluded.zombie_candidates,
      member_pressure = excluded.member_pressure,
      recommended_actions = excluded.recommended_actions,
      computed_at = excluded.computed_at;
    return;
  end if;

  -- Ingreso disponible = ingreso mensual - suma de fijos activos
  v_libre := coalesce(v_finance.monthly_income, 0)
           - coalesce((
               select sum(fe.amount)
               from public.fixed_expenses fe
               where fe.family_id = p_family_id
                 and coalesce(fe.status, 'active') = 'active'
             ), 0);

  -- Porcentaje de overshoot respecto al ingreso libre
  if v_libre > 0 and v_velocity.forecast_close_amount is not null then
    v_overshoot_pct := round(
      ((v_velocity.forecast_close_amount - v_libre) / v_libre) * 100, 2
    );
  else
    v_overshoot_pct := 0;
  end if;

  -- Categorías over-budget (top 3 por ratio gastado/cap)
  select coalesce(jsonb_agg(x order by ratio desc), '[]'::jsonb) into v_over_categories
  from (
    select jsonb_build_object(
      'category_id', cl.category_id,
      'monthly_cap', cl.monthly_cap::float8,
      'spent', spent::float8,
      'ratio', round(spent / nullif(cl.monthly_cap, 0), 3)::float8
    ) as x,
    (spent / nullif(cl.monthly_cap, 0)) as ratio
    from public.category_limits cl
    cross join lateral (
      select coalesce(sum(e.price), 0) as spent
      from public.expenses e
      where e.family_id = cl.family_id
        and e.category_id = cl.category_id
        and e.archived_at is null
    ) s
    where cl.family_id = p_family_id
      and cl.monthly_cap > 0
    order by ratio desc nulls last
    limit 3
  ) y;

  -- Candidatos zombie: fixed_expenses sin uso en 60+ días (top 3 por monto)
  select coalesce(jsonb_agg(jsonb_build_object(
    'fixed_expense_id', z.id,
    'name', z.name,
    'amount', z.amount::float8,
    'last_used_at', z.last_used_at
  ) order by z.amount desc), '[]'::jsonb) into v_zombies
  from (
    select fe.id, fe.name, fe.amount, fe.last_used_at
    from public.fixed_expenses fe
    where fe.family_id = p_family_id
      and coalesce(fe.status, 'active') = 'active'
      and coalesce(fe.kind, 'recurring') = 'recurring'
      and (fe.last_used_at is null or fe.last_used_at < now() - interval '60 days')
    order by fe.amount desc
    limit 3
  ) z;

  -- Presión por miembro: top 5 por gasto del ciclo activo
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', m.user_id,
    'total', m.total::float8
  ) order by m.total desc), '[]'::jsonb) into v_member_pressure
  from (
    select e.created_by as user_id, sum(e.price) as total
    from public.expenses e
    where e.family_id = p_family_id and e.archived_at is null
    group by e.created_by
    order by total desc
    limit 5
  ) m;

  -- Upsert de la fila materializada
  insert into public.control_snapshots (
    family_id, forecast_close_amount, forecast_overshoot_pct,
    over_budget_categories, zombie_candidates, member_pressure,
    recommended_actions, computed_at
  )
  values (
    p_family_id,
    v_velocity.forecast_close_amount,
    v_overshoot_pct,
    v_over_categories,
    v_zombies,
    v_member_pressure,
    v_actions,
    now()
  )
  on conflict (family_id) do update set
    forecast_close_amount = excluded.forecast_close_amount,
    forecast_overshoot_pct = excluded.forecast_overshoot_pct,
    over_budget_categories = excluded.over_budget_categories,
    zombie_candidates = excluded.zombie_candidates,
    member_pressure = excluded.member_pressure,
    recommended_actions = excluded.recommended_actions,
    computed_at = excluded.computed_at;
end;
$$;

revoke all on function public.compute_control_snapshot(uuid) from public;
grant execute on function public.compute_control_snapshot(uuid) to service_role;

-- ─── RPC pública: control_snapshot() ───────────────────────────────────
-- Lee la tabla materializada. Si no existe o tiene más de 12h, llama
-- compute_control_snapshot on-demand y devuelve fresco.
--
-- Nota de volatilidad: la función está marcada VOLATILE (no STABLE) porque
-- dentro llama a compute_control_snapshot() que hace INSERT/UPDATE. Postgres
-- no permite side-effects en funciones STABLE desde el planner; cambiar a
-- VOLATILE es la solución correcta y no tiene impacto negativo en el caller
-- (la app llama a esta RPC por demanda, no en un context donde STABLE
-- habilitaría una optimización de planner relevante).
create or replace function public.control_snapshot()
returns jsonb
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_row record;
  v_stale_threshold interval := interval '12 hours';
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id and fm.role <> 'blocked'
  limit 1;

  if v_family_id is null then
    return null;
  end if;

  select * into v_row from public.control_snapshots where family_id = v_family_id;

  -- Si la fila no existe o es stale (>12h), refrescar on-demand
  if v_row is null or v_row.computed_at < now() - v_stale_threshold then
    perform public.compute_control_snapshot(v_family_id);
    select * into v_row from public.control_snapshots where family_id = v_family_id;
  end if;

  -- Si por alguna razón compute no creó la fila, retornar null
  if v_row is null then
    return null;
  end if;

  return jsonb_build_object(
    'family_id', v_row.family_id,
    'forecast_close_amount', v_row.forecast_close_amount::float8,
    'forecast_overshoot_pct', v_row.forecast_overshoot_pct::float8,
    'over_budget_categories', v_row.over_budget_categories,
    'zombie_candidates', v_row.zombie_candidates,
    'member_pressure', v_row.member_pressure,
    'recommended_actions', v_row.recommended_actions,
    'computed_at', v_row.computed_at
  );
end;
$$;

revoke all on function public.control_snapshot() from public;
grant execute on function public.control_snapshot() to authenticated;

-- ═══ DOWN ══════════════════════════════════════════════════════════════
-- drop function if exists public.control_snapshot();
-- drop function if exists public.compute_control_snapshot(uuid);
-- drop table if exists public.control_snapshots;
