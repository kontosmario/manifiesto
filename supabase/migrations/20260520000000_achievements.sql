-- WHAT: Sistema de Achievements / Badges para Manifiesto.
--       Tabla catálogo (definición read-only) + tabla earned
--       (unlocks por usuario) + RPC `award_achievement` + triggers
--       en tablas señal (expenses, fixed_expenses, fixed_expense_payments,
--       user_streaks, savings_goals, monthly_summaries) para detectar
--       cuándo desbloquear.
--
-- WHY:  Audit engagement gaps §2.2. Los streaks ya enganchan a corto
--       plazo pero no celebran milestones puntuales (primer fijo
--       pagado, meta completada, ciclo cerrado bajo cupo). Los
--       achievements son el otro driver de retención — el dopamine
--       hit de desbloquear algo nuevo sin necesidad de un loop diario.
--
-- DESIGN:
--   - **Catálogo en DB, no en código** → si querés agregar/desactivar
--     un badge no necesitás re-deploy mobile. La app lee el catálogo
--     y los "earned" en una sola query.
--   - **Triggers no-blocking + best-effort** → si una detección falla
--     (raise notice, no exception) el flujo principal sigue. Un badge
--     fallido no rompe el insert del gasto.
--   - **Idempotencia** → la award function hace `on conflict do nothing`,
--     el mismo evento dos veces es no-op.
--   - **Realtime ON earned** → el cliente subscribe a inserts de su user
--     y muestra la modal de unlock al toque.
--
-- ROLLBACK (manual):
--   drop publication ... (revert realtime add)
--   drop trigger ... on expenses; ... on fixed_expenses; etc.
--   drop function award_achievement; tr_award_*;
--   drop table achievements_earned; achievements_catalog;

-- ─── 1. Catalog (read-only metadata) ─────────────────────────────
create table if not exists public.achievements_catalog (
  code text primary key,
  title text not null,
  body text not null,
  icon text not null default '🏆',
  tier text not null default 'bronze'
    check (tier in ('bronze', 'silver', 'gold', 'legendary')),
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.achievements_catalog is
  'Definiciones inmutables de cada achievement. Editable solo por '
  'service_role. Authenticated users tienen SELECT para construir la '
  'gallery con los códigos earned vs locked.';

-- ─── 2. Earned (per-user unlock log) ─────────────────────────────
create table if not exists public.achievements_earned (
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null references public.achievements_catalog(code) on delete restrict,
  family_id uuid null references public.families(id) on delete set null,
  earned_at timestamptz not null default now(),
  -- Optional context payload (e.g. {"streak": 30} para streak_30,
  -- {"goal_id": "<uuid>"} para goal_completed). El cliente lo puede
  -- usar para personalizar la celebración.
  context jsonb null,
  primary key (user_id, code)
);

create index if not exists achievements_earned_user_recent_idx
  on public.achievements_earned (user_id, earned_at desc);

comment on table public.achievements_earned is
  'Un row por (user, code). PK natural garantiza un solo unlock por '
  'achievement por usuario.';

-- ─── 3. RLS ──────────────────────────────────────────────────────
alter table public.achievements_catalog enable row level security;
alter table public.achievements_earned enable row level security;

-- Catalog: cualquier authenticated lo lee (es metadata pública dentro
-- del producto). Nadie con auth.uid() lo modifica.
drop policy if exists "catalog_select_authenticated" on public.achievements_catalog;
create policy "catalog_select_authenticated"
  on public.achievements_catalog
  for select
  to authenticated
  using (true);

-- Earned: cada user lee SOLO los propios.
drop policy if exists "earned_select_own" on public.achievements_earned;
create policy "earned_select_own"
  on public.achievements_earned
  for select
  to authenticated
  using (user_id = auth.uid());

-- Inserts SOLO via service_role (vía la award function SECURITY DEFINER).
-- No policy `for insert` to authenticated → no path para que el cliente
-- inserte directo (defense in depth contra unlocks fraudulentos).

-- ─── 4. award_achievement RPC ────────────────────────────────────
-- Función central que los triggers invocan para grabar un unlock.
-- Idempotente: doble award del mismo (user, code) es no-op gracias al
-- on conflict do nothing. Retorna true si efectivamente insertó, false
-- si ya existía.
create or replace function public.award_achievement(
  p_code text,
  p_user_id uuid,
  p_family_id uuid default null,
  p_context jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted boolean;
  v_exists boolean;
begin
  -- Validar que el code existe + está activo. Defensa contra typos en
  -- triggers que de otro modo fallarían silenciosamente.
  select exists (
    select 1 from public.achievements_catalog
    where code = p_code and is_active = true
  ) into v_exists;

  if not v_exists then
    raise notice 'award_achievement: unknown or inactive code %', p_code;
    return false;
  end if;

  insert into public.achievements_earned (user_id, code, family_id, context)
  values (p_user_id, p_code, p_family_id, p_context)
  on conflict (user_id, code) do nothing;

  -- ROW_COUNT da 1 si insertó, 0 si conflict.
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.award_achievement(text, uuid, uuid, jsonb) from public;
grant execute on function public.award_achievement(text, uuid, uuid, jsonb) to service_role;
-- NO grant to authenticated — solo los triggers (que corren con definer
-- privileges) y service_role pueden invocar. El cliente no debe
-- self-otorgar achievements.

-- ─── 5. Triggers de detección ────────────────────────────────────

-- 5.a · First expense per user
create or replace function public.tr_award_first_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo otorga si éste es realmente el primer gasto del usuario.
  -- Chequeo barato: COUNT(*) FILTER LIMIT 2 evita scan completo en
  -- usuarios con miles de gastos.
  if (
    select count(*) from public.expenses
    where created_by = new.created_by
      and id <> new.id
    limit 1
  ) = 0 then
    perform public.award_achievement('first_expense', new.created_by, new.family_id);
  end if;
  return new;
exception when others then
  -- Defense-in-depth: un fallo en el award no debe romper el INSERT
  -- del gasto. Loguea y sigue.
  raise notice 'tr_award_first_expense failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists expenses_award_first_expense on public.expenses;
create trigger expenses_award_first_expense
  after insert on public.expenses
  for each row execute function public.tr_award_first_expense();

-- 5.b · First fixed expense per family-member
create or replace function public.tr_award_first_fixed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return new; end if;
  if (
    select count(*) from public.fixed_expenses
    where family_id = new.family_id
      and id <> new.id
    limit 1
  ) = 0 then
    perform public.award_achievement('first_fixed', v_user_id, new.family_id);
  end if;
  return new;
exception when others then
  raise notice 'tr_award_first_fixed failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists fixed_expenses_award_first on public.fixed_expenses;
create trigger fixed_expenses_award_first
  after insert on public.fixed_expenses
  for each row execute function public.tr_award_first_fixed();

-- 5.c · First fixed expense payment
create or replace function public.tr_award_first_paid_fixed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
begin
  if v_user_id is null then return new; end if;
  select family_id into v_family_id
  from public.fixed_expenses
  where id = new.fixed_expense_id;
  if v_family_id is null then return new; end if;

  if (
    select count(*) from public.fixed_expense_payments fep
    join public.fixed_expenses fe on fe.id = fep.fixed_expense_id
    where fe.family_id = v_family_id
      and fep.id <> new.id
    limit 1
  ) = 0 then
    perform public.award_achievement('first_paid_fixed', v_user_id, v_family_id);
  end if;
  return new;
exception when others then
  raise notice 'tr_award_first_paid_fixed failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists fixed_expense_payments_award_first on public.fixed_expense_payments;
create trigger fixed_expense_payments_award_first
  after insert on public.fixed_expense_payments
  for each row execute function public.tr_award_first_paid_fixed();

-- 5.d · Streak milestones (7, 14, 30, 60, 90)
-- Solo dispara cuando current_streak cruza un threshold hacia arriba.
-- No usa auth.uid() — el row tiene user_id propio.
create or replace function public.tr_award_streak_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thresholds int[] := array[7, 14, 30, 60, 90];
  v_threshold int;
  v_code text;
  v_old int := coalesce(old.current_streak, 0);
  v_new int := coalesce(new.current_streak, 0);
begin
  if v_new <= v_old then return new; end if;
  foreach v_threshold in array v_thresholds loop
    if v_new >= v_threshold and v_old < v_threshold then
      v_code := 'streak_' || v_threshold::text;
      perform public.award_achievement(
        v_code,
        new.user_id,
        new.family_id,
        jsonb_build_object('streak', v_new)
      );
    end if;
  end loop;
  return new;
exception when others then
  raise notice 'tr_award_streak_milestones failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists user_streaks_award_milestones on public.user_streaks;
create trigger user_streaks_award_milestones
  after update of current_streak on public.user_streaks
  for each row execute function public.tr_award_streak_milestones();

-- También dispara en INSERT — primer gasto crea la fila con
-- current_streak=1, no se cruza ningún threshold, OK; pero si el
-- backfill inicial setea un streak alto (raro pero defensive),
-- otorgamos el milestone retroactivamente.
create or replace function public.tr_award_streak_milestones_initial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thresholds int[] := array[7, 14, 30, 60, 90];
  v_threshold int;
  v_code text;
  v_new int := coalesce(new.current_streak, 0);
begin
  foreach v_threshold in array v_thresholds loop
    if v_new >= v_threshold then
      v_code := 'streak_' || v_threshold::text;
      perform public.award_achievement(
        v_code,
        new.user_id,
        new.family_id,
        jsonb_build_object('streak', v_new)
      );
    end if;
  end loop;
  return new;
exception when others then
  raise notice 'tr_award_streak_milestones_initial failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists user_streaks_award_milestones_insert on public.user_streaks;
create trigger user_streaks_award_milestones_insert
  after insert on public.user_streaks
  for each row execute function public.tr_award_streak_milestones_initial();

-- 5.e · Savings goal completed (current_amount >= goal_amount)
create or replace function public.tr_award_goal_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return new; end if;
  if new.current_amount >= new.goal_amount
     and (old is null or old.current_amount < old.goal_amount)
  then
    perform public.award_achievement(
      'goal_completed',
      v_user_id,
      new.family_id,
      jsonb_build_object('goal_id', new.id, 'amount', new.goal_amount)
    );
  end if;
  return new;
exception when others then
  raise notice 'tr_award_goal_completed failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists savings_goals_award_completed on public.savings_goals;
create trigger savings_goals_award_completed
  after insert or update of current_amount on public.savings_goals
  for each row execute function public.tr_award_goal_completed();

-- 5.f · First goal created
create or replace function public.tr_award_first_goal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return new; end if;
  if (
    select count(*) from public.savings_goals
    where family_id = new.family_id
      and id <> new.id
    limit 1
  ) = 0 then
    perform public.award_achievement('first_goal', v_user_id, new.family_id);
  end if;
  return new;
exception when others then
  raise notice 'tr_award_first_goal failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists savings_goals_award_first on public.savings_goals;
create trigger savings_goals_award_first
  after insert on public.savings_goals
  for each row execute function public.tr_award_first_goal();

-- 5.g · First cycle closed under budget (via monthly_summaries)
create or replace function public.tr_award_first_cycle_under_budget()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_total_budget numeric;
begin
  -- under-budget: total_spent < monthly_income at cierre.
  -- monthly_summaries no tiene monthly_income directo; lo leemos
  -- desde family_finance al momento del cierre.
  select fm.user_id into v_user_id
  from public.family_members fm
  where fm.family_id = new.family_id
    and fm.role <> 'blocked'
  limit 1;
  if v_user_id is null then return new; end if;

  select monthly_income into v_total_budget
  from public.family_finance
  where family_id = new.family_id;
  if v_total_budget is null or v_total_budget <= 0 then return new; end if;

  if new.total_spent < v_total_budget then
    perform public.award_achievement(
      'first_cycle_under_budget',
      v_user_id,
      new.family_id,
      jsonb_build_object('saved', v_total_budget - new.total_spent)
    );
  end if;
  return new;
exception when others then
  raise notice 'tr_award_first_cycle_under_budget failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists monthly_summaries_award_under_budget on public.monthly_summaries;
create trigger monthly_summaries_award_under_budget
  after insert on public.monthly_summaries
  for each row execute function public.tr_award_first_cycle_under_budget();

-- ─── 6. Seed del catálogo inicial ────────────────────────────────
-- 11 achievements para v1. Mix de logros tempranos (engagement) +
-- milestones de mediano/largo plazo (retención). Tier escalado.
insert into public.achievements_catalog (code, title, body, icon, tier, sort_order)
values
  ('first_expense', 'El primer paso',
    'Cargaste tu primer gasto. Bienvenida al control.',
    '🌱', 'bronze', 10),
  ('first_fixed', 'El esqueleto del mes',
    'Agregaste tu primer gasto fijo. Ya sabés qué se va sí o sí.',
    '📅', 'bronze', 20),
  ('first_paid_fixed', 'Fijo en orden',
    'Registraste el primer pago de un fijo. Cero deuda mental.',
    '✅', 'bronze', 30),
  ('first_goal', 'Norte definido',
    'Creaste tu primera meta de ahorro. Saber para qué ayuda.',
    '🎯', 'bronze', 40),
  ('streak_7', 'Una semana firme',
    '7 días seguidos cargando. La constancia es la verdadera magia.',
    '🔥', 'bronze', 50),
  ('streak_14', 'Dos semanas',
    '14 días sin saltearte ni uno. Ya empieza a ser hábito.',
    '🔥', 'silver', 60),
  ('streak_30', 'Un mes imparable',
    '30 días seguidos. La racha empieza a cuidarse sola.',
    '🔥', 'silver', 70),
  ('streak_60', 'Dos meses',
    '60 días mes a mes sin perderse uno. Disciplinada.',
    '🔥', 'gold', 80),
  ('streak_90', 'Leyenda',
    '90 días sin saltarse uno. Esto ya es identidad.',
    '👑', 'legendary', 90),
  ('goal_completed', 'Meta alcanzada',
    'Llegaste a una meta entera. Lo planeado se hizo plata.',
    '🏆', 'gold', 100),
  ('first_cycle_under_budget', 'Cerraste bajo cupo',
    'Tu primer mes cerrado gastando menos de lo que tenías. Margen real.',
    '💰', 'silver', 110)
on conflict (code) do update
  set title = excluded.title,
      body = excluded.body,
      icon = excluded.icon,
      tier = excluded.tier,
      sort_order = excluded.sort_order;

-- ─── 7. Realtime publication ─────────────────────────────────────
-- Habilita que los clientes se suscriban a inserts de su propia fila
-- de earned. Idempotente — solo agrega si no estaba.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'achievements_earned'
  ) then
    alter publication supabase_realtime add table public.achievements_earned;
  end if;
end $$;
