-- ═════════════════════════════════════════════════════════════════════
-- Checkin matinal: el cupo incluye los ingresos extra del ciclo
-- ═════════════════════════════════════════════════════════════════════
--
-- Auditoría 2026-06-11 (continuación): Home y Control ya suman los
-- `income_events` del ciclo (transferencias, bonos, regalos) al
-- presupuesto disponible, pero el checkin matinal del orchestrator
-- seguía calculando `libre = sueldo − fijos − ahorro` ignorándolos.
-- Caso real: una transferencia de $640k no movía el "Hoy tenés ~$X
-- para gustos" — la notificación contradecía lo que el Home mostraba.
--
-- Fix: `libre` pasa a ser `greatest(0, sueldo + ingresos_extra − fijos
-- − ahorro)`, con ingresos_extra = sum(income_events) del ciclo en la
-- misma ventana half-open [cycle_start, cycle_start + 1 mes) que usa
-- el cliente (`useCycleIncomeEventsTotal`). El resto de la función se
-- replica verbatim de 20260615010000.

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
        fe.next_due_on between v_today_ar and v_today_ar + 1
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
