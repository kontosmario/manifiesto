-- ─────────────────────────────────────────────────────────────────────
-- Auditoría 2026-06-11 (cuenta real kontosmario) — fixes de servidor
-- ─────────────────────────────────────────────────────────────────────
-- Hallazgos que cierra esta migración:
--
--   H1. PUSH BACKLOG. Los crons SQL legacy (rachas, zombies, price
--       hikes, weekly insights) emiten filas en `notifications` pero
--       NADIE las pushea (el orchestrator solo pushea lo que él mismo
--       inserta). Fix: columna `pushed_at` + RPCs de backlog; el
--       orchestrator gana el kind `push_backlog` (cron cada 30') que
--       relayea las filas recientes sin push de kinds cron-only.
--
--   H2. CHECKIN "HARDCODEADO". El checkin matinal decía siempre el
--       mismo número: `(ingreso − fijos)/30` — ignoraba el gasto real
--       del ciclo, el buffer y la posición del ciclo. Fix: cupo
--       restante REAL ((libre − gastado) / días restantes, con buffer),
--       con copy de recuperación si el plan ya está pasado. Además el
--       pending helper ahora respeta notification_preferences
--       (channel_inapp + kinds_muted) — antes los ignoraba.
--
--   H3. ZOMBIES FALSOS. `last_used_at` no lo escribe ningún flujo →
--       todo fijo activo calificaba de "sin uso reciente" (Claude AI y
--       Expensas pagados hace días aparecían como zombies). Fix:
--       condición payment-aware (un fijo PAGADO hace <60d no es
--       zombie) en compute_control_snapshot y cron_detect_zombies +
--       RPC `rpc_mark_fixed_expense_used` para el quick action
--       "¿Lo seguís usando?" del Asistente.
--
--   H4. CRONS DUPLICADOS. El handover (20260512070000) desagendaba los
--       cron_emit_* legacy, pero el stagger del Sprint Q los re-creó.
--       Fix: desagendar los 2 duplicados puros (morning-checkins y
--       fixed-upcoming — sus kinds los cubre el orchestrator). Los de
--       racha/weekly QUEDAN en SQL (tienen side effects: consumen
--       escudos) y ahora pushean vía H1.
--
-- Idempotente (create or replace / if not exists) — aplicada a prod
-- directo el 2026-06-11 con autorización del owner; este archivo
-- mantiene local/CI en paridad.
-- ─────────────────────────────────────────────────────────────────────

-- ═══ H1 · push backlog ══════════════════════════════════════════════

alter table public.notifications
  add column if not exists pushed_at timestamptz;

-- Solo las filas sin push entran al índice — el backlog scan es barato.
create index if not exists idx_notifications_unpushed
  on public.notifications (created_at)
  where pushed_at is null;

-- Kinds cron-only: emitidos por SQL sin push propio. Los kinds del
-- orchestrator (checkins, fixed_upcoming) NO van acá — él los pushea al
-- insertarlos. Los kinds sociales (gasto cargado por un miembro) van
-- por send-family-push directo desde la app — tampoco van acá.
create or replace function public.list_unpushed_notifications()
returns table (
  id uuid,
  family_id uuid,
  user_id uuid,
  title text,
  body text,
  kind text,
  metadata jsonb
)
language sql
security definer
stable
set search_path = public
as $$
  select n.id, n.family_id, n.user_id, n.title, n.body, n.kind, n.metadata
  from public.notifications n
  where n.pushed_at is null
    and n.created_at >= now() - interval '24 hours'
    and n.kind in (
      'streak_at_risk', 'streak_broken', 'shield_used', 'shield_auto_hint',
      'streak_recovery_nudge', 'zombie_alert', 'zombie_detected',
      'price_hike', 'goal_behind'
    )
  order by n.created_at asc
  limit 500;
$$;

revoke all on function public.list_unpushed_notifications() from public;
grant execute on function public.list_unpushed_notifications() to service_role;

create or replace function public.mark_notifications_pushed(p_ids uuid[])
returns integer
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.notifications
    set pushed_at = now()
    where id = any(p_ids) and pushed_at is null
    returning 1
  )
  select count(*)::integer from updated;
$$;

revoke all on function public.mark_notifications_pushed(uuid[]) from public;
grant execute on function public.mark_notifications_pushed(uuid[]) to service_role;

-- ═══ H2 · pending helper v2 (cupo real + preferences) ═══════════════

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
    with member as (
      select
        fm.family_id,
        fm.user_id,
        coalesce(p.display_name, 'vos') as display_name,
        ff.monthly_income,
        coalesce(ff.salary_payment_day, 1) as salary_day,
        coalesce(ff.savings_goal, 0) as savings_goal,
        coalesce(ff.daily_budget_buffer_mode, 'none') as buffer_mode,
        coalesce(ff.daily_budget_buffer_value, 0) as buffer_value
      from public.family_members fm
      join public.family_finance ff on ff.family_id = fm.family_id
      left join public.profiles p on p.id = fm.user_id
      left join public.notification_preferences np on np.user_id = fm.user_id
      where coalesce(ff.monthly_income, 0) > 0
        and fm.role <> 'blocked'
        -- Preferencias (antes ignoradas por este helper — H2):
        and coalesce(np.channel_inapp, true)
        and not ('checkin_morning' = any (coalesce(np.kinds_muted, array[]::text[])))
    ),
    cycle as (
      select
        m.*,
        -- Inicio del ciclo: el salary_day más reciente (clampeado al
        -- último día del mes corto). Mismo algoritmo que la velocity fn.
        case
          when extract(day from v_today_ar)::int >= least(
            m.salary_day,
            extract(day from (date_trunc('month', v_today_ar) + interval '1 month' - interval '1 day'))::int
          )
          then make_date(
            extract(year from v_today_ar)::int,
            extract(month from v_today_ar)::int,
            least(m.salary_day, extract(day from (date_trunc('month', v_today_ar) + interval '1 month' - interval '1 day'))::int)
          )
          else make_date(
            extract(year from (v_today_ar - interval '1 month'))::int,
            extract(month from (v_today_ar - interval '1 month'))::int,
            least(m.salary_day, extract(day from (date_trunc('month', v_today_ar) - interval '1 day'))::int)
          )
        end as cycle_start
      from member m
    ),
    computed as (
      select
        c.*,
        (c.cycle_start + interval '1 month')::date as cycle_end,
        greatest(1, ((c.cycle_start + interval '1 month')::date - v_today_ar)) as dias_restantes,
        greatest(0,
          c.monthly_income
          - coalesce((
              select sum(public.fixed_expense_monthly_equivalent(fe.amount, fe.frequency))
              from public.fixed_expenses fe
              where fe.family_id = c.family_id
                and coalesce(fe.status, 'active') = 'active'
            ), 0)
          - c.savings_goal
        ) as libre,
        coalesce((
          select sum(e.price)
          from public.expenses e
          where e.family_id = c.family_id
            and e.archived_at is null
            and e.commitment_id is null
            and e.created_at >= c.cycle_start::timestamptz
        ), 0) as gastado
      from cycle c
    ),
    final as (
      select
        x.*,
        (x.libre - x.gastado) as restante,
        -- Cupo de hoy: restante repartido en los días que quedan, con
        -- el buffer del usuario aplicado (espejo del Home).
        case
          when x.buffer_mode = 'percent'
            then greatest(0, (x.libre - x.gastado) / x.dias_restantes) * greatest(0, 1 - x.buffer_value / 100.0)
          when x.buffer_mode = 'fixed'
            then greatest(0, greatest(0, (x.libre - x.gastado) / x.dias_restantes) - x.buffer_value)
          else greatest(0, (x.libre - x.gastado) / x.dias_restantes)
        end as cupo_hoy
      from computed x
    )
    select
      f.family_id,
      f.user_id,
      'Buen día, ' || split_part(btrim(f.display_name), ' ', 1) as title,
      case
        when f.restante > 0 then
          'Hoy tenés ~$' || to_char(round(f.cupo_hoy), 'FM999,999,999')
            || ' para gustos. Quedan $' || to_char(round(f.restante), 'FM999,999,999')
            || ' del mes.'
        else
          'Este mes ya vas $' || to_char(round(abs(f.restante)), 'FM999,999,999')
            || ' arriba del plan. Hoy ideal: $0 en gustos.'
      end as body,
      'checkin_morning' as kind,
      case when f.restante > 0 then 'info' else 'warning' end as severity,
      jsonb_build_object('route', '/', 'cupo_hoy', round(f.cupo_hoy), 'restante', round(f.restante)) as metadata,
      'checkin_morning:' || f.family_id::text || ':' || f.user_id::text || ':' || v_today_ar::text as dedup_key
    from final f;

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
    left join public.notification_preferences np on np.user_id = fm.user_id
    where coalesce(ff.monthly_income, 0) > 0
      and fm.role <> 'blocked'
      and coalesce(np.channel_inapp, true)
      and not ('checkin_midday' = any (coalesce(np.kinds_muted, array[]::text[])));

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
    left join public.notification_preferences np on np.user_id = fm.user_id
    where coalesce(ff.monthly_income, 0) > 0
      and fm.role <> 'blocked'
      and coalesce(np.channel_inapp, true)
      and not ('checkin_evening' = any (coalesce(np.kinds_muted, array[]::text[])));

  elsif p_kind = 'fixed_upcoming' then
    return query
    select
      fe.family_id,
      null::uuid as user_id,
      coalesce(nullif(btrim(fe.name), ''), 'Compromiso')
        || ' vence ' || (case when fe.next_due_on = v_today_ar then 'hoy'
                              when fe.next_due_on = v_today_ar + 1 then 'mañana'
                              else 'en ' || (fe.next_due_on - v_today_ar) || ' días' end) as title,
      '$' || to_char(round(coalesce(fe.amount, 0)), 'FM999,999,999') as body,
      'fixed_upcoming' as kind,
      'warning' as severity,
      jsonb_build_object('route', '/fixed-expenses', 'fixed_expense_id', fe.id, 'amount', fe.amount, 'due_on', fe.next_due_on) as metadata,
      'fixed_upcoming:' || fe.id::text || ':' || v_today_ar::text as dedup_key
    from public.fixed_expenses fe
    where coalesce(fe.status, 'active') = 'active'
      and (
        -- Ventana default: vence hoy o mañana…
        fe.next_due_on between v_today_ar and v_today_ar + 1
        -- …o el aviso anticipado que el user configuró en el fijo
        -- (notify_days_before — antes ignorado, H2).
        or (
          coalesce(fe.notify_days_before, 0) > 1
          and fe.next_due_on = v_today_ar + coalesce(fe.notify_days_before, 0)
        )
      );

  end if;
end;
$$;

revoke all on function public.list_pending_notifications(text) from public;
grant execute on function public.list_pending_notifications(text) to service_role;

-- ═══ H3 · zombies payment-aware + confirm-use RPC ═══════════════════

create or replace function public.rpc_mark_fixed_expense_used(p_fixed_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid;
begin
  select fe.family_id into v_family
  from public.fixed_expenses fe
  where fe.id = p_fixed_expense_id;

  if v_family is null or not public.is_family_member(v_family) then
    raise exception 'No autorizado.';
  end if;

  update public.fixed_expenses
  set last_used_at = now(), updated_at = now()
  where id = p_fixed_expense_id;
end;
$$;

revoke all on function public.rpc_mark_fixed_expense_used(uuid) from public;
grant execute on function public.rpc_mark_fixed_expense_used(uuid) to authenticated;

-- zombie_candidates payment-aware (cuerpo completo regenerado de prod
-- con la condición corregida — ver H3 arriba):
CREATE OR REPLACE FUNCTION public.compute_control_snapshot(p_family_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- Auditoría 2026-06-11 (H3): payment-aware. `last_used_at` es
      -- opt-in (lo setea el quick action "lo sigo usando"); con NULL,
      -- TODO fijo activo calificaba de zombie. Un fijo PAGADO hace
      -- <60 días no es zombie: el pago es señal de vida del commitment.
      and greatest(
            coalesce(fe.last_used_at, '-infinity'::timestamptz),
            coalesce(fe.last_paid_at, '-infinity'::timestamptz)
          ) < now() - interval '60 days'
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
$function$

;

-- cron_detect_zombies payment-aware + kind real:
CREATE OR REPLACE FUNCTION public.cron_detect_zombies()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rec record;
  v_payment_count int;
begin
  for v_rec in
    select fe.id, fe.family_id, fe.name, fe.amount, fe.last_used_at
    from public.fixed_expenses fe
    where coalesce(fe.status, 'active') = 'active'
      -- Auditoría 2026-06-11 (H3): el filtro kind='periodic' nunca
      -- matcheaba (los fijos reales usan kind='recurring') y la
      -- condición de uso flageaba todo NULL. Igual que en
      -- compute_control_snapshot: pago reciente = commitment vivo.
      and coalesce(fe.kind, 'recurring') = 'recurring'
      and greatest(
            coalesce(fe.last_used_at, '-infinity'::timestamptz),
            coalesce(fe.last_paid_at, '-infinity'::timestamptz)
          ) < now() - interval '60 days'
  loop
    begin
      select count(*)::int into v_payment_count
      from public.fixed_expense_payments fep
      where fep.fixed_expense_id = v_rec.id;

      if coalesce(v_payment_count, 0) < 2 then
        continue;
      end if;

      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id
          and n.kind = 'zombie_alert'
          and (n.metadata ->> 'fixed_expense_id') = v_rec.id::text
          and n.created_at >= now() - interval '14 days'
      ) then
        continue;
      end if;

      perform public.emit_notification(
        v_rec.family_id,
        null,
        'Suscripción sin usar',
        coalesce(nullif(btrim(v_rec.name), ''), 'Compromiso')
          || ' · $' || to_char(round(coalesce(v_rec.amount, 0)), 'FM999,999,999')
          || ' sin movimiento hace 60+ días.',
        'zombie_alert',
        'warning',
        null,
        jsonb_build_object(
          'route', '/fixed-expenses',
          'fixed_expense_id', v_rec.id,
          'name', v_rec.name,
          'amount', v_rec.amount
        )
      );
    exception when others then
      raise notice 'zombie detect failed for fixed_expense %: %',
        v_rec.id, sqlerrm;
    end;
  end loop;
exception when others then
  raise notice 'cron_detect_zombies: %', sqlerrm;
end;
$function$

;

-- ═══ H4 · consolidación de crons ════════════════════════════════════
-- Desagendar los 2 legacy cuyos kinds cubre el orchestrator (el
-- handover los había sacado; el stagger del Sprint Q los re-creó).
-- Los de racha/weekly QUEDAN en SQL (side effects) y pushean vía H1.
do $$
begin
  begin perform cron.unschedule('morning-checkins'); exception when others then null; end;
  begin perform cron.unschedule('fixed-upcoming'); exception when others then null; end;
  -- Backlog relay cada 30': pushea lo que los crons SQL insertan.
  begin perform cron.unschedule('notifications-push-backlog'); exception when others then null; end;
  perform cron.schedule(
    'notifications-push-backlog', '*/30 * * * *',
    $cron$select public.dispatch_notifications_kind('push_backlog')$cron$
  );
exception when others then
  raise notice 'cron consolidation skipped: %', sqlerrm;
end $$;
