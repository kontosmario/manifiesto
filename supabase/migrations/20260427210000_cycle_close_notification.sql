-- Cycle-close summary notification.
--
-- When `close_monthly_cycle` writes a row to `monthly_summaries` we
-- now emit one notification per family member summarizing the close:
-- final mood, savings_delta vs income, top-cat name, days under cupo
-- count. The advisor surface (Asistente Financiero) reads it and
-- shows it as a "tu mes cerró" card; the in-app feed picks it up by
-- default. A separate push trigger (next migration) fires for high-
-- severity ones.
--
-- Trigger semantics:
--  - AFTER INSERT OR UPDATE on monthly_summaries
--  - Only fires if `total_variable_spent > 0` (sanity guard)
--  - Idempotent via the unique key in family_members; we emit once
--    per active member of the family.
--  - Kind: 'cycle_closed'. Severity is mood-derived: green→info,
--    yellow→info, red→warning. Title carries period_label, body
--    carries the headline number (savings_delta).

create or replace function public.notify_cycle_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member record;
  v_severity text;
  v_title text;
  v_body text;
  v_top_cat text;
  v_top_cat_amt numeric;
  v_days_under_cupo int;
  v_cupo_diario numeric;
begin
  -- Bail when nothing meaningful was rolled up (e.g., empty cycle).
  if coalesce(new.total_variable_spent, 0) <= 0 and coalesce(new.total_spent, 0) <= 0 then
    return new;
  end if;

  -- Severity from mood (defaults to info when null).
  v_severity := case
    when new.mood = 'red' then 'warning'
    when new.mood = 'yellow' then 'info'
    when new.mood = 'green' then 'success'
    else 'info'
  end;

  -- Pull top-cat name from category_breakdown if present.
  if new.category_breakdown is not null then
    select e.value->>'name', (e.value->>'total')::numeric
    into v_top_cat, v_top_cat_amt
    from jsonb_array_elements(new.category_breakdown) as e(value)
    order by (e.value->>'total')::numeric desc nulls last
    limit 1;
  end if;

  -- Days under cupo: walk daily_totals and count entries ≤ cupo.
  -- cupo = (monthly_income - savings_goal_amount) / N_days
  if new.monthly_income is not null and new.daily_totals is not null then
    v_cupo_diario := greatest(
      0,
      (coalesce(new.monthly_income, 0) - coalesce(new.savings_goal_amount, 0))
        / nullif(date_part('day', new.period_end::timestamp - new.period_start::timestamp)::int, 0)
    );
    select count(*)
    into v_days_under_cupo
    from jsonb_array_elements(new.daily_totals) as d(value)
    where coalesce((d.value->>'total')::numeric, 0) <= v_cupo_diario;
  end if;

  v_title := 'Cerró ' || coalesce(new.period_label, to_char(new.period_start, 'TMMonth YYYY'));
  v_body := case
    when new.savings_delta > 0 then
      'Guardaste $' || to_char(round(new.savings_delta), 'FM999G999G999')
        || coalesce(' · ' || v_top_cat || ' fue tu top', '')
    when new.savings_delta < 0 then
      'Te pasaste $' || to_char(round(abs(new.savings_delta)), 'FM999G999G999')
        || coalesce(' · ' || v_top_cat || ' pesó más', '')
    else
      coalesce(v_top_cat || ' fue tu top', 'Cerró el ciclo.')
  end;

  -- Emit one notification per active member of the family. We avoid
  -- duplicating if the same row updates multiple times within the
  -- same period_start (idempotency via NOT EXISTS guard).
  for v_member in
    select fm.user_id
    from public.family_members fm
    where fm.family_id = new.family_id
      and fm.role <> 'blocked'
  loop
    if not exists (
      select 1
      from public.notifications n
      where n.family_id = new.family_id
        and n.user_id = v_member.user_id
        and n.kind = 'cycle_closed'
        and n.metadata->>'period_start' = new.period_start::text
    ) then
      perform public.emit_notification(
        new.family_id,
        v_member.user_id,
        v_title,
        v_body,
        'cycle_closed',
        v_severity,
        null,
        jsonb_build_object(
          'period_start', new.period_start,
          'period_end', new.period_end,
          'period_label', new.period_label,
          'mood', new.mood,
          'savings_delta', new.savings_delta,
          'total_variable_spent', new.total_variable_spent,
          'top_category_name', v_top_cat,
          'top_category_amount', v_top_cat_amt,
          'days_under_cupo', v_days_under_cupo,
          'route', '/(app)/(tabs)/control'
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_cycle_closed on public.monthly_summaries;
create trigger trg_notify_cycle_closed
after insert or update of total_variable_spent, savings_delta, mood
on public.monthly_summaries
for each row
execute function public.notify_cycle_closed();

comment on function public.notify_cycle_closed() is
  'Emits a "cycle_closed" notification per family member when monthly_summaries gets written. Severity from mood (red→warning, green→success).';
