-- 4 achievements para el feature "Día sin gasto":
--   • Per-cycle (resetean cada ciclo de pago): 3 / 7 / 15 marcas
--     dentro del ciclo vigente.
--   • Lifetime: 50 marcas acumuladas (no reset).
--
-- Detección: trigger AFTER INSERT en streak_marked_days que cuenta
-- marcas en el ciclo vigente del usuario + marcas lifetime y llama
-- award_achievement con el code correspondiente. award_achievement
-- es idempotente (on conflict do nothing) — el trigger puede correr
-- N veces sin riesgo de duplicados.

-- ─── 1. Catalog rows ────────────────────────────────────────────
insert into public.achievements_catalog (code, title, body, icon, tier, sort_order)
values
  ('no_spend_cycle_3',
   'Tres veces sin gasto',
   'Cerraste 3 días sin gastos en un mismo ciclo. Bien hecho.',
   '🌱', 'bronze', 220),
  ('no_spend_cycle_7',
   'Semana templada',
   '7 días sin gastos en un mismo ciclo. Eso ya es un ritmo.',
   '🌿', 'silver', 221),
  ('no_spend_cycle_15',
   'Mitad de ciclo zen',
   '15 días sin gastos en un mismo ciclo. La mitad del ciclo en calma.',
   '🌳', 'gold', 222),
  ('no_spend_lifetime_50',
   'Ahorrador veterano',
   'Llegaste a 50 días sin gastos acumulados desde que empezaste.',
   '🏆', 'legendary', 223)
on conflict (code) do nothing;

-- ─── 2. Helper: resolve current pay-cycle start for a user ──────
create or replace function public.user_current_cycle_start(p_family_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    ff.current_cycle_anchor,
    date_trunc('month', current_date)::date
  )
  from public.family_finance ff
  where ff.family_id = p_family_id
  limit 1;
$$;

revoke all on function public.user_current_cycle_start(uuid) from public;
grant execute on function public.user_current_cycle_start(uuid) to authenticated;

-- ─── 3. Trigger function ────────────────────────────────────────
create or replace function public.no_spend_marked_award_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_start date;
  v_cycle_count int;
  v_lifetime_count int;
begin
  if new.user_id is null then
    return new;
  end if;

  v_cycle_start := public.user_current_cycle_start(new.family_id);

  select count(*)::int
  into v_cycle_count
  from public.streak_marked_days
  where user_id = new.user_id
    and family_id = new.family_id
    and marked_date >= v_cycle_start
    and marked_date <= current_date;

  select count(*)::int
  into v_lifetime_count
  from public.streak_marked_days
  where user_id = new.user_id;

  if v_cycle_count >= 3 then
    perform public.award_achievement(
      'no_spend_cycle_3',
      new.user_id,
      new.family_id,
      jsonb_build_object('marked_at', new.marked_at, 'cycle_count', v_cycle_count)
    );
  end if;

  if v_cycle_count >= 7 then
    perform public.award_achievement(
      'no_spend_cycle_7',
      new.user_id,
      new.family_id,
      jsonb_build_object('marked_at', new.marked_at, 'cycle_count', v_cycle_count)
    );
  end if;

  if v_cycle_count >= 15 then
    perform public.award_achievement(
      'no_spend_cycle_15',
      new.user_id,
      new.family_id,
      jsonb_build_object('marked_at', new.marked_at, 'cycle_count', v_cycle_count)
    );
  end if;

  if v_lifetime_count >= 50 then
    perform public.award_achievement(
      'no_spend_lifetime_50',
      new.user_id,
      new.family_id,
      jsonb_build_object('marked_at', new.marked_at, 'lifetime_count', v_lifetime_count)
    );
  end if;

  return new;
exception
  when others then
    raise notice 'no_spend_marked_award_trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists no_spend_marked_award_trigger on public.streak_marked_days;
create trigger no_spend_marked_award_trigger
after insert on public.streak_marked_days
for each row
execute function public.no_spend_marked_award_trigger();
