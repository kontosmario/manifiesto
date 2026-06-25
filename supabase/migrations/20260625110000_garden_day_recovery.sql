-- WHAT: "Plantar el día que faltó" — recovery del 6/7 en el jardín (decisión
--       owner: opción A, cuesta 1 escudo / freeze_token).
--   · Tabla garden_recovered_days: días plantados con ayuda (distintos de los
--     orgánicos; el grid los muestra como brote "recuperado" y NO florecen).
--   · RPC recover_garden_day(family, day): valida y consume 1 escudo. Solo la
--     semana RECIÉN cerrada, solo si es EXACTAMENTE 6/7, solo el día del hueco,
--     solo con escudo disponible. Anti-exploit: no arregla semanas viejas ni
--     fabrica semanas perfectas (la floración queda para el 7/7 orgánico).
-- WHY:  Recuperación gentil ("sin culpa") sin diluir el valor de la semana
--       perfecta. Espejo server-side de la lógica del cliente (deriveRecoverableGap).

create table if not exists public.garden_recovered_days (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

alter table public.garden_recovered_days enable row level security;

-- Cada quien ve sus propios días recuperados (el jardín es per-usuario).
drop policy if exists garden_recovered_select on public.garden_recovered_days;
create policy garden_recovered_select on public.garden_recovered_days
  for select using (user_id = auth.uid());
-- Escritura SOLO vía el RPC security-definer (no hay policy de insert/update/delete).

create or replace function public.recover_garden_day(p_family_id uuid, p_day date)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_tz text;
  v_today date;
  v_dow int;
  v_cur_monday date;
  v_prev_monday date;
  v_prev_sunday date;
  v_account_created date;
  v_tokens smallint;
  v_filled int;
  v_gap date;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not public.is_family_member(p_family_id) then
    raise exception 'Not a member of this family';
  end if;

  v_tz := public.user_local_timezone(v_user_id);
  v_today := (now() at time zone v_tz)::date;
  v_dow := extract(isodow from v_today)::int - 1;       -- Lunes = 0
  v_cur_monday := v_today - v_dow;
  v_prev_monday := v_cur_monday - 7;
  v_prev_sunday := v_cur_monday - 1;

  -- (1) Solo la semana recién cerrada (L→D anterior a la actual).
  if p_day < v_prev_monday or p_day > v_prev_sunday then
    raise exception 'NOT_RECOVERABLE_WEEK'
      using hint = 'Solo se puede recuperar un día de la semana recién cerrada.';
  end if;

  -- (2) El día no puede ser anterior a tu cuenta (no es un "salteado" real).
  select (p.created_at at time zone v_tz)::date into v_account_created
  from public.profiles p where p.id = v_user_id;
  if v_account_created is not null and p_day < v_account_created then
    raise exception 'DAY_BEFORE_ACCOUNT' using hint = 'Ese día es anterior a tu cuenta.';
  end if;

  -- (3) Necesitás al menos 1 escudo (freeze_token).
  select freeze_tokens into v_tokens
  from public.user_streaks where family_id = p_family_id and user_id = v_user_id;
  if coalesce(v_tokens, 0) < 1 then
    raise exception 'NO_TOKENS'
      using hint = 'No tenés semillas guardadas para recuperar el día.';
  end if;

  -- (4) La semana recién cerrada debe estar EXACTAMENTE 6/7 "llena" (gasto
  --     discrecional ∪ marca sin-gasto ∪ ya recuperado), y el único hueco = p_day.
  select
    count(*) filter (where x.filled),
    min(x.d) filter (where not x.filled)
  into v_filled, v_gap
  from (
    select dd.d,
      (
        exists (select 1 from public.expenses e
                where e.family_id = p_family_id and e.created_by = v_user_id
                  and e.commitment_id is null
                  and (e.created_at at time zone v_tz)::date = dd.d)
        or exists (select 1 from public.streak_marked_days m
                   where m.family_id = p_family_id and m.user_id = v_user_id and m.marked_date = dd.d)
        or exists (select 1 from public.garden_recovered_days r
                   where r.user_id = v_user_id and r.day = dd.d)
      ) as filled
    from (select (v_prev_monday + g)::date as d from generate_series(0, 6) g) dd
  ) x;

  if v_filled <> 6 then
    raise exception 'NOT_SIX_OF_SEVEN'
      using hint = 'La semana recién cerrada no tiene exactamente un día para recuperar.';
  end if;
  if v_gap is distinct from p_day then
    raise exception 'NOT_THE_GAP' using hint = 'Ese no es el día que faltó.';
  end if;

  -- (5) Consumir 1 escudo + registrar la recuperación (idempotente por el unique).
  update public.user_streaks
    set freeze_tokens = freeze_tokens - 1, updated_at = now()
    where family_id = p_family_id and user_id = v_user_id;
  insert into public.garden_recovered_days (family_id, user_id, day)
    values (p_family_id, v_user_id, p_day)
    on conflict (user_id, day) do nothing;

  select freeze_tokens into v_tokens
  from public.user_streaks where family_id = p_family_id and user_id = v_user_id;
  return jsonb_build_object('status', 'recovered', 'day', p_day, 'freeze_tokens', v_tokens);
end;
$function$;

grant execute on function public.recover_garden_day(uuid, date) to authenticated;
