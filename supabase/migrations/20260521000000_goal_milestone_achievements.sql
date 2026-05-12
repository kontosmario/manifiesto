-- WHAT: Adds 3 progressive achievement codes (goal_25/50/75) y reemplaza
--       `tr_award_goal_completed` por `tr_award_goal_milestones` que evalúa
--       los 4 thresholds (25 / 50 / 75 / 100) en una sola pasada.
--
-- WHY:  Hoy una savings_goal solo celebra al cierre (100%). El usuario que
--       junta 6 meses ve cero dopamina entre 0% y 99%. Agregar 3 hitos
--       intermedios convierte la meta en una sucesión de micro-celebraciones,
--       lo cual sostiene engagement durante el grueso del trayecto (donde
--       el progreso es lineal y la motivación cae).
--
-- DESIGN:
--   - Mismo patrón idempotente que streak_milestones: el milestone solo
--     dispara cuando current_amount CRUZA el threshold hacia arriba.
--     No re-dispara si bajás y volvés a subir (lo evita el unique
--     `(user_id, code)` PK + `on conflict do nothing` en award_achievement).
--   - Los 3 nuevos hitos comparten un único trigger function — eficiencia
--     y un solo lugar para tocar la lógica si los thresholds cambian.
--   - Tier progresivo: bronze → silver → gold → gold (completed ya existía
--     como gold antes, lo mantenemos para no romper galerías existentes).
--
-- ROLLBACK (manual):
--   delete from achievements_catalog where code in ('goal_25', 'goal_50', 'goal_75');
--   drop trigger savings_goals_award_milestones on savings_goals;
--   drop function tr_award_goal_milestones;
--   -- Restore previous tr_award_goal_completed if needed.

-- ─── 1. Seed catalog ─────────────────────────────────────────────
insert into public.achievements_catalog (code, title, body, icon, tier, sort_order)
values
  ('goal_25', 'Primer empujón',
    'Llevás un cuarto de la meta. Lo más difícil es arrancar.',
    '🌱', 'bronze', 96),
  ('goal_50', 'Mitad de camino',
    'La mitad de la meta ya está en tu poder. Imparable.',
    '🌿', 'silver', 97),
  ('goal_75', 'Tres cuartos',
    'Tres cuartos. La meta deja de ser idea y se vuelve agenda.',
    '🌳', 'gold', 98)
on conflict (code) do update
  set title = excluded.title,
      body = excluded.body,
      icon = excluded.icon,
      tier = excluded.tier,
      sort_order = excluded.sort_order;

-- ─── 2. Unified milestone trigger function ───────────────────────
-- Reemplaza `tr_award_goal_completed`. Mismo signature/behavior pero
-- evalúa los 4 hitos (25/50/75/100) en una sola pasada.
create or replace function public.tr_award_goal_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_thresholds numeric[] := array[0.25, 0.50, 0.75, 1.0];
  v_codes text[] := array['goal_25', 'goal_50', 'goal_75', 'goal_completed'];
  v_threshold numeric;
  v_code text;
  v_old_ratio numeric;
  v_new_ratio numeric;
  i int;
begin
  if v_user_id is null then return new; end if;
  if new.goal_amount is null or new.goal_amount <= 0 then return new; end if;

  -- Ratio nuevo vs viejo. Sin row previa (INSERT), old_ratio = 0 → todo
  -- threshold que la nueva cruce arriba se otorga retroactivamente
  -- (caso edge: import / backfill que crea la meta ya con plata).
  v_new_ratio := new.current_amount / new.goal_amount;
  v_old_ratio := case
    when old is null or old.goal_amount is null or old.goal_amount <= 0 then 0
    else old.current_amount / old.goal_amount
  end;

  -- Solo evaluamos si subió. Bajar (extraer plata) no destruye logros.
  if v_new_ratio <= v_old_ratio then return new; end if;

  for i in 1..array_length(v_thresholds, 1) loop
    v_threshold := v_thresholds[i];
    v_code := v_codes[i];
    if v_new_ratio >= v_threshold and v_old_ratio < v_threshold then
      perform public.award_achievement(
        v_code,
        v_user_id,
        new.family_id,
        jsonb_build_object(
          'goal_id', new.id,
          'amount', new.goal_amount,
          'progress', v_new_ratio
        )
      );
    end if;
  end loop;

  return new;
exception when others then
  raise notice 'tr_award_goal_milestones failed: %', sqlerrm;
  return new;
end;
$$;

-- ─── 3. Swap trigger ────────────────────────────────────────────
-- Drop el trigger viejo (que apuntaba a tr_award_goal_completed) y
-- monta el nuevo apuntando a tr_award_goal_milestones. Mantenemos
-- la función vieja `tr_award_goal_completed` definida para no romper
-- migrations downstream que la referencien por nombre — pero ya no
-- está ligada a ningún trigger.
drop trigger if exists savings_goals_award_completed on public.savings_goals;
drop trigger if exists savings_goals_award_milestones on public.savings_goals;
create trigger savings_goals_award_milestones
  after insert or update of current_amount on public.savings_goals
  for each row execute function public.tr_award_goal_milestones();
