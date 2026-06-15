-- supabase/migrations/20260620170000_notifications_audit_quickwins.sql
-- Auditoría de notificaciones por cron — quick wins (2026-06-15):
--  1. Cortar el check-in del MEDIODÍA (3→2; morning+evening ya son contextuales).
--  2. Mover zombies + price-hikes de la madrugada (~01:xx AR) a la mañana (~09:xx).
--  3. Sacar la notif zombie_detected genérica (redundante con zombie_alert granular).
--  4. Copy: "Gasto fijo: X vence hoy" (desambigua) + "Pago registrado: X" (fijos).

-- 1. Cortar midday (unschedule el cron; la rama de la función queda dead-code inerte).
do $mig$ begin
  if exists (select 1 from cron.job where jobname='notifications-midday') then
    perform cron.unschedule('notifications-midday');
  end if;
end $mig$;

-- 2. Reagendar a la mañana (09:xx AR = 12:xx UTC) para que se lean.
do $mig$ begin
  if exists (select 1 from cron.job where jobname='control_zombies') then
    perform cron.unschedule('control_zombies');
  end if;
  perform cron.schedule('control_zombies', '15 12 * * 1', $cmd$select public.cron_detect_zombies();$cmd$);
  if exists (select 1 from cron.job where jobname='control_price_hikes') then
    perform cron.unschedule('control_price_hikes');
  end if;
  perform cron.schedule('control_price_hikes', '5 12 * * *', $cmd$select public.cron_detect_price_hikes();$cmd$);
end $mig$;

-- 4b. fixed_paid → "Pago registrado: X"; un gasto regular queda "Nuevo gasto cargado".
create or replace function public.notify_expense_change()
returns trigger language plpgsql as $function$
begin
  perform public.emit_notification(
    new.family_id, null,
    case when new.commitment_id is not null
      then 'Pago registrado: ' || coalesce(nullif(btrim(new.description), ''), 'Gasto fijo')
      else 'Nuevo gasto cargado' end,
    concat(coalesce(nullif(btrim(new.description), ''), 'Sin descripción'), ' · $', coalesce(new.price, 0)::text),
    case when new.commitment_id is not null then 'fixed_paid' else 'expense_logged' end,
    'info', new.created_by,
    jsonb_build_object('route', case when new.commitment_id is not null then '/fixed-expenses' else '/expenses' end, 'expense_id', new.id, 'commitment_id', new.commitment_id, 'amount', new.price)
  );
  return new;
exception when others then return new;
end;
$function$;

-- 4a. list_pending_notifications con "Gasto fijo: " en el título de fixed_upcoming:
CREATE OR REPLACE FUNCTION public.list_pending_notifications(p_kind text)
 RETURNS TABLE(family_id uuid, user_id uuid, title text, body text, kind text, severity text, metadata jsonb, dedup_key text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          -- Ingresos extra del ciclo (income_events): misma ventana
          -- half-open que el cliente. Antes ignorados — el checkin
          -- contradecía el disponible del Home.
          + coalesce((
              select sum(ie.amount)
              from public.income_events ie
              where ie.family_id = c.family_id
                and ie.event_date >= c.cycle_start
                and ie.event_date < (c.cycle_start + interval '1 month')::date
            ), 0)
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
      'Gasto fijo: ' || coalesce(nullif(btrim(fe.name), ''), 'Compromiso')
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
        fe.next_due_on between v_today_ar and v_today_ar + 1
        or (
          coalesce(fe.notify_days_before, 0) > 1
          and fe.next_due_on = v_today_ar + coalesce(fe.notify_days_before, 0)
        )
      );

  end if;
end;
$function$
;

-- 3. cron_emit_weekly_insights SIN el bloque zombie_detected (redundante):
CREATE OR REPLACE FUNCTION public.cron_emit_weekly_insights()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_week_start date := date_trunc('week', v_today)::date;
  v_cycle_start date := date_trunc('month', v_today)::date;
  v_fam record;
  v_goal record;
  v_zombie_count integer;
  v_contrib_this_cycle numeric(12,2);
  v_target_pace numeric(12,2);
  v_months_remaining integer;
begin
  for v_fam in
    select f.id as family_id from public.families f
  loop
    begin
      -- Zombie subscriptions: REMOVIDO (2026-06-15). Era un COUNT genérico
      -- redundante con cron_detect_zombies → zombie_alert (granular por
      -- fixed_expense + accionable). v_zombie_count queda declarado, sin uso.

      -- Goal behind pace.
      for v_goal in
        select sg.id, sg.title, sg.goal_amount, sg.current_amount, sg.target_months
        from public.savings_goals sg
        where sg.family_id = v_fam.family_id and sg.is_active
      loop
        begin
          if coalesce(v_goal.target_months, 0) <= 0 or coalesce(v_goal.goal_amount, 0) <= 0 then
            continue;
          end if;

          v_months_remaining := greatest(1, coalesce(v_goal.target_months, 1));
          v_target_pace := (coalesce(v_goal.goal_amount, 0) - coalesce(v_goal.current_amount, 0))
                           / v_months_remaining;

          -- Approximate this cycle's contribution as the sum of positive deltas
          -- reflected in goal_contribution notifications since the cycle start.
          select coalesce(sum(((n.metadata ->> 'delta')::numeric)), 0)
          into v_contrib_this_cycle
          from public.notifications n
          where n.family_id = v_fam.family_id
            and n.kind = 'goal_contribution'
            and (n.metadata ->> 'goal_id') = v_goal.id::text
            and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date >= v_cycle_start;

          if v_target_pace > 0 and v_contrib_this_cycle < 0.3 * v_target_pace then
            if not exists (
              select 1 from public.notifications n
              where n.family_id = v_fam.family_id
                and n.kind = 'goal_behind'
                and (n.metadata ->> 'goal_id') = v_goal.id::text
                and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date >= v_week_start
            ) then
              perform public.emit_notification(
                v_fam.family_id,
                null,
                'Vas atrasado con ' || v_goal.title,
                'Este ciclo aportaste $' || to_char(round(v_contrib_this_cycle), 'FM999,999,999')
                  || ' · ritmo sugerido $' || to_char(round(v_target_pace), 'FM999,999,999') || '/mes.',
                'goal_behind',
                'warning',
                null,
                jsonb_build_object(
                  'route', '/savings-goal',
                  'goal_id', v_goal.id,
                  'contribution', v_contrib_this_cycle,
                  'target_pace', v_target_pace
                )
              );
            end if;
          end if;
        exception when others then null;
        end;
      end loop;
    exception when others then null;
    end;
  end loop;
exception when others then null;
end;
$function$
;
