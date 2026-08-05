-- ════════════════════════════════════════════════════════════════════
-- Jardín FAMILIAR: la racha pasa de (family_id, user_id) → family_id.
--
-- WHAT: "Cuidar el jardín del hogar". Un gasto o un día-sin-gasto de
-- CUALQUIER miembro planta el brote del día para TODA la familia. La
-- fuente de verdad pasa de `user_streaks` a la nueva `family_streaks`
-- (una fila por familia). `user_streaks` queda congelada como respaldo
-- (sin escritores) para rollback barato.
--
-- Decisiones de diseño (spec 2026-07-08-release-next-design.md):
--   · Timezone del "día" = tz del DUEÑO de la familia
--     (`family_local_timezone`): determinística, un hogar comparte huso.
--   · Escudos (freeze_tokens) = pozo FAMILIAR (cap 2, cadencia semanal).
--   · Logros streak_7..90 se otorgan a TODOS los miembros no bloqueados.
--   · `streak_marked_days` conserva autoría per-usuario; la DERIVACIÓN
--     une por familia (RLS pasa a visibilidad familiar).
--   · `garden_recovered_days` pasa a unicidad (family_id, day).
--   · Seed: replay de la actividad familiar completa + clamp generoso
--     con el máximo entre miembros — nadie pierde su racha en el cambio.
--   · `cron_emit_assistant_dormant` deja de leer user_streaks (queda
--     congelada) y deriva la actividad POR USUARIO de expenses∪marked.
--   · `family_member_stats` muestra la racha del HOGAR (igual para
--     todos los miembros).
-- ════════════════════════════════════════════════════════════════════

-- ─── 1 · Tabla family_streaks ────────────────────────────────────────

create table if not exists public.family_streaks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,

  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  total_days_logged integer not null default 0,

  last_logged_date date null,
  streak_broken_at timestamptz null,

  freeze_tokens smallint not null default 0 check (freeze_tokens between 0 and 2),
  days_since_last_token_grant integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (family_id)
);

alter table public.family_streaks enable row level security;

drop policy if exists "family_streaks_select_members" on public.family_streaks;
create policy "family_streaks_select_members"
on public.family_streaks
for select
using (public.is_family_member(family_id));

-- Sin policies de insert/update/delete: escriben solo las funciones
-- SECURITY DEFINER de abajo.

-- ─── 2 · family_local_timezone — tz del dueño ───────────────────────
-- El "día" de la racha familiar se corta en un solo huso por familia.
-- Dueño primero; si no hay (edge), cualquier miembro no bloqueado
-- (orden determinístico); último recurso el default del proyecto.

create or replace function public.family_local_timezone(p_family_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.timezone
      from public.family_members fm
      join public.profiles p on p.id = fm.user_id
      where fm.family_id = p_family_id and fm.role = 'owner'
      order by fm.user_id
      limit 1
    ),
    (
      select p.timezone
      from public.family_members fm
      join public.profiles p on p.id = fm.user_id
      where fm.family_id = p_family_id and coalesce(fm.role, '') <> 'blocked'
      order by fm.user_id
      limit 1
    ),
    'America/Argentina/Buenos_Aires'
  );
$$;

revoke execute on function public.family_local_timezone(uuid) from public, anon, authenticated;

-- ─── 3 · Motor familiar ──────────────────────────────────────────────
-- Se CONSERVAN las firmas de 3 argumentos para no romper callers:
-- `p_user_id` ya no segmenta el estado (solo atribuye el día recuperado
-- del jardín; puede ser null en paths de cron).

create or replace function public._advance_streak_internal(p_family_id uuid, p_user_id uuid, p_event_date date)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row public.family_streaks%rowtype;
  v_gap integer;
  v_new_streak integer;
  v_new_tokens smallint;
  v_new_days_since integer;
begin
  insert into public.family_streaks (family_id)
  values (p_family_id)
  on conflict (family_id) do nothing;

  select * into v_row
  from public.family_streaks
  where family_id = p_family_id
  for update;

  -- Recovery: racha rota (current = 0, broken_at seteado). El primer
  -- registro presente reinicia en día 1 y limpia el marcador.
  if v_row.streak_broken_at is not null and v_row.current_streak = 0 then
    if v_row.last_logged_date = p_event_date then
      return;
    end if;
    update public.family_streaks
    set current_streak = 1,
        longest_streak = greatest(v_row.longest_streak, 1),
        total_days_logged = v_row.total_days_logged + 1,
        last_logged_date = p_event_date,
        streak_broken_at = null,
        days_since_last_token_grant = 1,
        updated_at = now()
    where id = v_row.id;
    return;
  end if;

  -- Case 0: mismo día → idempotente.
  if v_row.last_logged_date is not null and v_row.last_logged_date = p_event_date then
    return;
  end if;

  -- Case 1: primer registro de la familia.
  if v_row.last_logged_date is null then
    update public.family_streaks
    set current_streak = 1,
        longest_streak = greatest(v_row.longest_streak, 1),
        total_days_logged = v_row.total_days_logged + 1,
        last_logged_date = p_event_date,
        streak_broken_at = null,
        days_since_last_token_grant = 1,
        updated_at = now()
    where id = v_row.id;
    return;
  end if;

  v_gap := p_event_date - v_row.last_logged_date;

  -- Case 2: día consecutivo (gap = 1). Escudo cada 7 días de racha.
  if v_gap = 1 then
    v_new_streak := v_row.current_streak + 1;
    v_new_days_since := v_row.days_since_last_token_grant + 1;
    v_new_tokens := v_row.freeze_tokens;
    if v_new_days_since >= 7 and v_new_tokens < 2 then
      v_new_tokens := v_new_tokens + 1;
      v_new_days_since := 0;
    end if;
    update public.family_streaks
    set current_streak = v_new_streak,
        longest_streak = greatest(v_row.longest_streak, v_new_streak),
        total_days_logged = v_row.total_days_logged + 1,
        last_logged_date = p_event_date,
        streak_broken_at = null,
        freeze_tokens = v_new_tokens,
        days_since_last_token_grant = v_new_days_since,
        updated_at = now()
    where id = v_row.id;
    return;
  end if;

  -- Case 3: exactamente un día faltado + escudo → consume y avanza.
  if v_gap = 2 and v_row.freeze_tokens > 0 then
    v_new_streak := v_row.current_streak + 1;
    v_new_days_since := v_row.days_since_last_token_grant + 2;
    v_new_tokens := v_row.freeze_tokens - 1;
    if v_new_days_since >= 7 and v_new_tokens < 2 then
      v_new_tokens := v_new_tokens + 1;
      v_new_days_since := 0;
    end if;
    update public.family_streaks
    set current_streak = v_new_streak,
        longest_streak = greatest(v_row.longest_streak, v_new_streak),
        total_days_logged = v_row.total_days_logged + 1,
        last_logged_date = p_event_date,
        streak_broken_at = null,
        freeze_tokens = v_new_tokens,
        days_since_last_token_grant = v_new_days_since,
        updated_at = now()
    where id = v_row.id;
    -- Auto-recuperación del jardín (día puenteado = p_event_date - 1).
    -- Sub-bloque aislado: un fallo del insert NUNCA revierte el avance.
    begin
      insert into public.garden_recovered_days (family_id, user_id, day)
      values (p_family_id, p_user_id, p_event_date - 1)
      on conflict (family_id, day) do nothing;
    exception when others then null;
    end;
    return;
  end if;

  -- Case 4: gap no cubrible → tratado como recovery (día 1 fresco).
  update public.family_streaks
  set current_streak = 1,
      longest_streak = greatest(v_row.longest_streak, 1),
      total_days_logged = v_row.total_days_logged + 1,
      last_logged_date = p_event_date,
      streak_broken_at = null,
      days_since_last_token_grant = 1,
      updated_at = now()
  where id = v_row.id;
end;
$function$;

revoke execute on function public._advance_streak_internal(uuid, uuid, date) from public, anon, authenticated;

-- Wrapper backdate-proof: solo eventos de hoy-o-futuro (en tz FAMILIAR)
-- tocan la racha. Firma preservada; p_user_id pasa a ser atribución.
create or replace function public.advance_streak(p_family_id uuid, p_user_id uuid, p_event_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today_local date;
  v_tz text;
begin
  v_tz := public.family_local_timezone(p_family_id);
  v_today_local := (now() at time zone v_tz)::date;
  if p_event_date < v_today_local then
    return;
  end if;
  perform public._advance_streak_internal(p_family_id, p_user_id, p_event_date);
end;
$$;

revoke execute on function public.advance_streak(uuid, uuid, date) from public, anon, authenticated;

-- Replay histórico de TODA la actividad de la familia (gastos de
-- cualquier miembro ∪ días marcados de cualquier miembro), en tz
-- familiar. Resetea y reconstruye la fila.
create or replace function public.recompute_family_streak(p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_tz text;
  v_prior_longest integer := 0;
begin
  v_tz := public.family_local_timezone(p_family_id);

  -- `longest_streak` es un récord de VIDA (monotónico). El replay puede
  -- reconstruir menos que lo vivido: días puenteados por el cron de
  -- medianoche no dejan fila de actividad, y el seed 2026-07-08 clampeó
  -- generosamente desde user_streaks. Nunca degradarlo en un recompute.
  select fs.longest_streak into v_prior_longest
  from public.family_streaks fs
  where fs.family_id = p_family_id;

  delete from public.family_streaks
  where family_id = p_family_id;

  for r in
    select event_date from (
      select distinct (e.created_at at time zone v_tz)::date as event_date
        from public.expenses e
        where e.family_id = p_family_id and e.created_by is not null
      union
      select distinct md.marked_date as event_date
        from public.streak_marked_days md
        where md.family_id = p_family_id
    ) days
    order by event_date asc
  loop
    perform public._advance_streak_internal(p_family_id, null, r.event_date);
  end loop;

  if coalesce(v_prior_longest, 0) > 0 then
    insert into public.family_streaks (family_id, longest_streak)
    values (p_family_id, v_prior_longest)
    on conflict (family_id) do update
      set longest_streak = greatest(public.family_streaks.longest_streak, excluded.longest_streak),
          updated_at = now();
  end if;
end;
$$;

revoke execute on function public.recompute_family_streak(uuid) from public, anon, authenticated;

-- Shim de compatibilidad: cualquier caller viejo de la versión
-- per-usuario recomputa la racha familiar.
create or replace function public.recompute_user_streak(p_family_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_family_streak(p_family_id);
end;
$$;

revoke execute on function public.recompute_user_streak(uuid, uuid) from public, anon, authenticated;

-- ─── 4 · garden_recovered_days → familia ─────────────────────────────
-- El día recuperado es del hogar: unicidad (family_id, day), autoría
-- opcional, visibilidad familiar.

-- Dedup previo (si dos miembros recuperaron el mismo día): conserva la
-- fila más vieja.
delete from public.garden_recovered_days a
using public.garden_recovered_days b
where a.family_id = b.family_id
  and a.day = b.day
  and a.ctid > b.ctid;

alter table public.garden_recovered_days
  drop constraint if exists garden_recovered_days_user_id_day_key;

create unique index if not exists garden_recovered_days_family_day_key
  on public.garden_recovered_days (family_id, day);

alter table public.garden_recovered_days
  alter column user_id drop not null;

drop policy if exists garden_recovered_select on public.garden_recovered_days;
create policy garden_recovered_select on public.garden_recovered_days
  for select using (public.is_family_member(family_id));

-- ─── 5 · streak_marked_days → visibilidad familiar ───────────────────
-- La autoría (user_id) se conserva; todos los miembros VEN las marcas
-- del hogar (la derivación del jardín las une).

drop policy if exists "streak_marked_days_select_own" on public.streak_marked_days;
drop policy if exists "streak_marked_days_select_family" on public.streak_marked_days;
create policy "streak_marked_days_select_family"
on public.streak_marked_days
for select
using (public.is_family_member(family_id));

-- ─── 6 · Trigger de expenses — tz familiar + auto-revert familiar ────

create or replace function public.expenses_trigger_advance_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_event_date date;
begin
  if new.created_by is null then
    return new;
  end if;
  v_tz := public.family_local_timezone(new.family_id);
  v_event_date := (new.created_at at time zone v_tz)::date;

  -- Auto-revert: un gasto real reemplaza cualquier marca "sin gastos"
  -- del MISMO día local — de cualquier miembro (el día es del hogar).
  delete from public.streak_marked_days
  where family_id = new.family_id
    and marked_date = v_event_date;

  perform public.advance_streak(new.family_id, new.created_by, v_event_date);
  return new;
exception
  when others then
    -- Nunca bloquear el insert de un gasto por bookkeeping de racha.
    return new;
end;
$$;

revoke execute on function public.expenses_trigger_advance_streak() from public, anon, authenticated;

-- ─── 7 · mark / unmark — el "sin gastos" valida contra el hogar ──────

create or replace function public.mark_no_expense_day(
  p_family_id uuid,
  p_date date default null,
  p_force boolean default false
)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tz text;
  v_today date;
  v_target date;
  v_has_expenses boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_family_member(p_family_id) then
    raise exception 'Not a member of this family';
  end if;

  v_tz := public.family_local_timezone(p_family_id);
  v_today := (now() at time zone v_tz)::date;
  v_target := coalesce(p_date, v_today);

  if v_target > v_today then
    raise exception 'FUTURE_DATE_NOT_ALLOWED'
      using hint = 'Cannot mark a future date as no-spend.';
  end if;

  -- ¿Algún miembro del hogar ya registró un gasto ese día local?
  select exists(
    select 1
    from public.expenses e
    where e.family_id = p_family_id
      and e.created_by is not null
      and (e.created_at at time zone v_tz)::date = v_target
  ) into v_has_expenses;

  if v_has_expenses then
    if v_target < v_today then
      raise exception 'EXPENSES_EXIST_ON_DATE'
        using hint = 'That day already has registered expenses; it cannot be marked as no-spend.';
    end if;
    if not p_force then
      raise exception 'EXPENSES_EXIST_ON_DATE'
        using hint = 'Today already has expenses; pass p_force = true to mark anyway.';
    end if;
  end if;

  insert into public.streak_marked_days (family_id, user_id, marked_date)
  values (p_family_id, v_user_id, v_target)
  on conflict (family_id, user_id, marked_date) do nothing;

  perform public.advance_streak(p_family_id, v_user_id, v_target);

  return v_target;
end;
$$;

revoke all on function public.mark_no_expense_day(uuid, date, boolean) from public;
revoke execute on function public.mark_no_expense_day(uuid, date, boolean) from anon;
grant execute on function public.mark_no_expense_day(uuid, date, boolean) to authenticated;

create or replace function public.unmark_no_expense_day(
  p_family_id uuid,
  p_date date default null
)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tz text;
  v_today date;
  v_target date;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_family_member(p_family_id) then
    raise exception 'Not a member of this family';
  end if;

  v_tz := public.family_local_timezone(p_family_id);
  v_today := (now() at time zone v_tz)::date;
  v_target := coalesce(p_date, v_today);

  -- Solo se revierte la marca PROPIA (autoría preservada); si otro
  -- miembro marcó el mismo día, su marca sigue sosteniendo el brote.
  delete from public.streak_marked_days
  where family_id = p_family_id
    and user_id = v_user_id
    and marked_date = v_target;

  perform public.recompute_family_streak(p_family_id);

  return v_target;
end;
$$;

revoke all on function public.unmark_no_expense_day(uuid, date) from public;
revoke execute on function public.unmark_no_expense_day(uuid, date) from anon;
grant execute on function public.unmark_no_expense_day(uuid, date) to authenticated;

-- ─── 8 · Crons de racha → familia con fan-out a miembros ─────────────

-- Medianoche: puentea con escudo del pozo familiar o marca la rotura.
-- La notificación del escudo va a TODOS los miembros no bloqueados
-- (cada uno en su idioma). "Sin culpa": la rotura no notifica.
create or replace function public.cron_emit_streak_broken()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_rec record;
  v_member record;
  v_tz text;
  v_today_local date;
  v_local_hour integer;
  v_new_tokens smallint;
begin
  for v_rec in
    select fs.id, fs.family_id,
           fs.current_streak, fs.longest_streak,
           fs.freeze_tokens, fs.last_logged_date, fs.streak_broken_at
    from public.family_streaks fs
    where fs.current_streak > 0
      and fs.streak_broken_at is null
  loop
    begin
      v_tz := public.family_local_timezone(v_rec.family_id);
      v_today_local := (now() at time zone v_tz)::date;
      v_local_hour := extract(hour from (now() at time zone v_tz))::int;

      if v_rec.last_logged_date is null then
        continue;
      end if;
      if v_rec.last_logged_date >= v_today_local - 1 then
        continue;
      end if;

      if v_rec.last_logged_date = v_today_local - 2 and v_rec.freeze_tokens > 0 then
        v_new_tokens := v_rec.freeze_tokens - 1;
        update public.family_streaks
        set freeze_tokens = v_new_tokens,
            last_logged_date = v_today_local - 1,
            updated_at = now()
        where id = v_rec.id;

        -- Auto-recuperación del jardín del hogar (ayer).
        begin
          insert into public.garden_recovered_days (family_id, user_id, day)
          values (v_rec.family_id, null, v_today_local - 1)
          on conflict (family_id, day) do nothing;
        exception when others then null;
        end;

        if v_local_hour between 9 and 21 then
          for v_member in
            select fm.user_id, coalesce(p.preferred_language, 'es') as lang
            from public.family_members fm
            left join public.profiles p on p.id = fm.user_id
            where fm.family_id = v_rec.family_id
              and coalesce(fm.role, '') <> 'blocked'
          loop
            if exists (
              select 1 from public.notifications n
              where n.family_id = v_rec.family_id
                and n.user_id = v_member.user_id
                and n.kind = 'shield_used'
                and (n.created_at at time zone v_tz)::date = v_today_local
            ) then continue; end if;
            perform public.emit_notification(
              v_rec.family_id,
              v_member.user_id,
              case when v_member.lang = 'en' then 'Your shield saved the streak' else 'Tu escudo salvó la racha' end,
              case when v_member.lang = 'en'
                   then 'Nobody logged yesterday, but 1 shield was used. Your home has ' || v_new_tokens || ' left.'
                   else 'Nadie registró ayer, pero se consumió 1 escudo. Al hogar le quedan ' || v_new_tokens || '.' end,
              'shield_used',
              'info',
              null,
              jsonb_build_object('route', '/expenses', 'freeze_tokens', v_new_tokens)
            );
          end loop;
        end if;
        continue;
      end if;

      update public.family_streaks
      set current_streak = 0,
          streak_broken_at = now(),
          days_since_last_token_grant = 0,
          updated_at = now()
      where id = v_rec.id;
    exception when others then null;
    end;
  end loop;
exception when others then null;
end;
$function$;

revoke execute on function public.cron_emit_streak_broken() from public, anon, authenticated;

-- 19–21h (tz familiar): recordatorio suave si el hogar aún no plantó hoy.
create or replace function public.cron_emit_streak_at_risk()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_rec record; v_member record; v_tz text; v_today_local date; v_local_hour integer;
  v_kind text; v_title text; v_body text; v_severity text;
begin
  for v_rec in
    select fs.family_id, fs.current_streak, fs.freeze_tokens, fs.last_logged_date
    from public.family_streaks fs
    where fs.current_streak > 0 and fs.streak_broken_at is null
  loop
    begin
      v_tz := public.family_local_timezone(v_rec.family_id);
      v_today_local := (now() at time zone v_tz)::date;
      v_local_hour := extract(hour from (now() at time zone v_tz))::int;
      if v_local_hour < 19 or v_local_hour > 21 then continue; end if;
      if v_rec.last_logged_date = v_today_local then continue; end if;

      if v_rec.freeze_tokens > 0 then
        v_kind := 'shield_auto_hint';
      else
        v_kind := 'streak_at_risk';
      end if;

      for v_member in
        select fm.user_id,
               coalesce(np.kinds_muted, array[]::text[]) as kinds_muted,
               coalesce(np.nudges_enabled, true) as nudges_enabled,
               coalesce(np.channel_inapp, true) as channel_inapp,
               coalesce(p.preferred_language, 'es') as lang
        from public.family_members fm
        left join public.notification_preferences np on np.user_id = fm.user_id
        left join public.profiles p on p.id = fm.user_id
        where fm.family_id = v_rec.family_id
          and coalesce(fm.role, '') <> 'blocked'
      loop
        if not v_member.nudges_enabled or not v_member.channel_inapp then continue; end if;
        if v_kind = any (v_member.kinds_muted) then continue; end if;

        if v_kind = 'shield_auto_hint' then
          v_title := case when v_member.lang = 'en' then 'Your garden is waiting 🌱' else 'Tu jardín te espera 🌱' end;
          v_body := case when v_member.lang = 'en' then 'If nobody at home logs a movement today, a saved seed will cover the day.'
                         else 'Si hoy nadie del hogar registra un movimiento, una semilla guardada cubre el día.' end;
          v_severity := 'info';
        else
          v_title := case when v_member.lang = 'en' then 'Your garden is waiting 🌱' else 'Tu jardín te espera 🌱' end;
          v_body := case when v_member.lang = 'en' then 'Log the day whenever you can and add a sprout to your home''s garden.'
                         else 'Registrá el día cuando puedas y sumás un brote al jardín del hogar.' end;
          v_severity := 'info';
        end if;

        if exists (
          select 1 from public.notifications n
          where n.family_id = v_rec.family_id and n.user_id = v_member.user_id and n.kind = v_kind
            and (n.created_at at time zone v_tz)::date = v_today_local
        ) then continue; end if;

        perform public.emit_notification(v_rec.family_id, v_member.user_id, v_title, v_body, v_kind, v_severity, null,
          jsonb_build_object('route', '/expenses', 'current_streak', v_rec.current_streak, 'freeze_tokens', v_rec.freeze_tokens));
      end loop;
    exception when others then null;
    end;
  end loop;
exception when others then null;
end; $function$;

revoke execute on function public.cron_emit_streak_at_risk() from public, anon, authenticated;

-- Nudges graduados post-rotura (días 1/3/7/14), por miembro y en su idioma.
create or replace function public.cron_emit_streak_recovery_nudge()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_rec record; v_member record; v_tz text; v_today_local date; v_local_hour integer;
  v_days_since integer; v_milestone integer; v_title text; v_body text; v_seed bigint; v_pick integer;
begin
  for v_rec in
    select fs.family_id, fs.longest_streak, fs.streak_broken_at
    from public.family_streaks fs
    where fs.streak_broken_at is not null and fs.current_streak = 0
      and fs.streak_broken_at > now() - interval '15 days'
  loop
    begin
      v_tz := public.family_local_timezone(v_rec.family_id);
      v_today_local := (now() at time zone v_tz)::date;
      v_local_hour := extract(hour from (now() at time zone v_tz))::int;
      if v_local_hour < 10 or v_local_hour > 20 then continue; end if;
      v_days_since := v_today_local - (v_rec.streak_broken_at at time zone v_tz)::date;
      if v_days_since not in (1, 3, 7, 14) then continue; end if;
      v_milestone := v_days_since;

      for v_member in
        select fm.user_id,
               coalesce(np.kinds_muted, array[]::text[]) as kinds_muted,
               coalesce(np.nudges_enabled, true) as nudges_enabled,
               coalesce(np.channel_inapp, true) as channel_inapp,
               coalesce(p.preferred_language, 'es') as lang
        from public.family_members fm
        left join public.notification_preferences np on np.user_id = fm.user_id
        left join public.profiles p on p.id = fm.user_id
        where fm.family_id = v_rec.family_id
          and coalesce(fm.role, '') <> 'blocked'
      loop
        if not v_member.nudges_enabled or not v_member.channel_inapp then continue; end if;
        if 'streak_recovery_nudge' = any (v_member.kinds_muted) then continue; end if;
        if exists (
          select 1 from public.notifications n
          where n.family_id = v_rec.family_id and n.user_id = v_member.user_id
            and n.kind = 'streak_recovery_nudge' and (n.metadata->>'nudge_day')::int = v_milestone
        ) then continue; end if;

        v_seed := abs(hashtextextended(v_member.user_id::text, v_milestone));
        v_pick := (v_seed % 3)::int;
        if v_milestone = 1 then
          if v_member.lang = 'en' then
            v_title := 'Today is a good day to come back';
            v_body := case v_pick
              when 0 then case when v_rec.longest_streak >= 7
                  then 'Your home''s record of ' || v_rec.longest_streak || ' days is still yours. One expense and you start a new streak.'
                  else 'A new streak starts with a single log. Today could be that day.' end
              when 1 then 'Log the first thing you spend today and you''re back in. It''s that simple.'
              else 'Yesterday is over. Today you can start day 1 of your next record.' end;
          else
            v_title := 'Hoy es buen día para volver';
            v_body := case v_pick
              when 0 then case when v_rec.longest_streak >= 7
                  then 'La marca de ' || v_rec.longest_streak || ' días sigue siendo del hogar. Un gasto y arrancan otra racha.'
                  else 'Una racha nueva empieza con un solo registro. Hoy puede ser ese día.' end
              when 1 then 'Anotá lo primero que gastes hoy y vuelven al ruedo. Es así de simple.'
              else 'Ayer pasó. Hoy pueden arrancar el día 1 del próximo récord.' end;
          end if;
        elsif v_milestone = 3 then
          if v_member.lang = 'en' then
            v_title := 'Three days without logging';
            v_body := case v_pick
              when 0 then 'Coming back is easier than keeping it up — a single movement and the streak restarts.'
              when 1 then 'A coffee, an errand, whatever. Just one expense to start again.'
              else 'No need to wait for Monday. You can come back today.' end;
          else
            v_title := 'Tres días sin registrar';
            v_body := case v_pick
              when 0 then 'Volver es más fácil que mantener — un solo movimiento y la racha se reactiva.'
              when 1 then 'Un café, un mandado, lo que sea. Basta con un gasto para arrancar de nuevo.'
              else 'No hace falta esperar al lunes. Pueden volver hoy mismo.' end;
          end if;
        elsif v_milestone = 7 then
          if v_member.lang = 'en' then
            v_title := 'A week — but you''re still on time';
            v_body := case v_pick
              when 0 then 'Your garden is still here waiting. Log an expense today and you''re back in the game.'
              when 1 then case when v_rec.longest_streak >= 14
                  then 'Your home once reached ' || v_rec.longest_streak || ' days. You can do it again.'
                  else 'Don''t look at what happened — look at what''s coming. Today is day 1.' end
              else 'Sometimes the best streak starts after a pause. Give it a try today.' end;
          else
            v_title := 'Una semana — pero todavía están a tiempo';
            v_body := case v_pick
              when 0 then 'El jardín sigue acá esperando. Un gasto registrado hoy y vuelven al juego.'
              when 1 then case when v_rec.longest_streak >= 14
                  then 'El hogar llegó a ' || v_rec.longest_streak || ' días una vez. Pueden volver a hacerlo.'
                  else 'No miren lo que pasó — miren lo que viene. Hoy es el día 1.' end
              else 'A veces la mejor racha empieza después de una pausa. Prueben hoy.' end;
          end if;
        else
          if v_member.lang = 'en' then
            v_title := 'One last note before letting go';
            v_body := case v_pick
              when 0 then case when v_rec.longest_streak >= 14
                  then 'Your home''s ' || v_rec.longest_streak || ' days are still a record. If you want to come back, today is a good time.'
                  else 'If you want to pick the habit back up, today is a good time. We won''t insist anymore.' end
              when 1 then 'If you come back at some point, it''ll be day 1 of something new. We''ll leave you in peace for now.'
              else 'This is the last one. If you return, we''ll celebrate. If not, that''s fine too.' end;
          else
            v_title := 'Última nota antes de soltar';
            v_body := case v_pick
              when 0 then case when v_rec.longest_streak >= 14
                  then 'Los ' || v_rec.longest_streak || ' días del hogar siguen siendo récord. Si quieren volver, hoy es buen momento.'
                  else 'Si quieren retomar el hábito, hoy es buen momento. No vamos a insistir más.' end
              when 1 then 'Si vuelven en algún momento, va a ser el día 1 de algo nuevo. Los dejamos en paz por ahora.'
              else 'Esta es la última. Si retoman, lo celebramos. Si no, también.' end;
          end if;
        end if;

        perform public.emit_notification(v_rec.family_id, v_member.user_id, v_title, v_body,
          'streak_recovery_nudge', 'info', null,
          jsonb_build_object('route', '/expenses', 'nudge_day', v_milestone, 'longest_streak', v_rec.longest_streak));
      end loop;
    exception when others then null;
    end;
  end loop;
exception when others then null;
end; $function$;

revoke execute on function public.cron_emit_streak_recovery_nudge() from public, anon, authenticated;

-- ─── 9 · cron_emit_assistant_dormant — actividad POR USUARIO real ────
-- user_streaks queda congelada; el "dormido" es del USUARIO (no del
-- hogar), así que se deriva de su propia actividad: sus gastos ∪ sus
-- días marcados. Copy y gates idénticos a 20260630000000.

-- El cron corre cada hora y hace max(created_at) por miembro: índice
-- compuesto para que ese max sea un lookup y no un scan de las filas
-- del usuario (el índice FK existente cubre solo created_by).
create index if not exists expenses_created_by_created_at_idx
  on public.expenses (created_by, created_at desc);

create or replace function public.cron_emit_assistant_dormant()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_rec record;
  v_tz text;
  v_today_local date;
  v_local_hour integer;
  v_local_dow integer;
  v_last_logged date;
  v_days_since integer;
  v_title text;
  v_body text;
begin
  for v_rec in
    select fm.family_id, fm.user_id,
           coalesce(p.preferred_language, 'es') as lang,
           la.last_expense_at,
           lm.last_marked
    from public.family_members fm
    left join public.notification_preferences np on np.user_id = fm.user_id
    left join public.profiles p on p.id = fm.user_id
    left join lateral (
      select max(e.created_at) as last_expense_at
      from public.expenses e
      where e.family_id = fm.family_id and e.created_by = fm.user_id
    ) la on true
    left join lateral (
      select max(md.marked_date) as last_marked
      from public.streak_marked_days md
      where md.family_id = fm.family_id and md.user_id = fm.user_id
    ) lm on true
    where coalesce(fm.role, '') <> 'blocked'
      -- Pre-filtro grueso (server-date): descarta usuarios activos sin
      -- pagar la conversión de tz. Holgura de 1 día; gate fino abajo.
      and (la.last_expense_at is null or la.last_expense_at <= now() - interval '6 days')
      and (lm.last_marked is null or lm.last_marked <= current_date - 6)
      -- Nunca notificamos a quien no registró NADA jamás (no hay episodio).
      and (la.last_expense_at is not null or lm.last_marked is not null)
      and coalesce(np.nudges_enabled, true)
      and coalesce(np.channel_inapp, true)
      and not ('assistant_dormant' = any (coalesce(np.kinds_muted, array[]::text[])))
  loop
    begin
      v_tz := public.user_local_timezone(v_rec.user_id);
      v_today_local := (now() at time zone v_tz)::date;
      v_local_hour := extract(hour from (now() at time zone v_tz))::int;
      -- Ventana suave: 11h local, martes o jueves. No invasivo.
      if v_local_hour <> 11 then continue; end if;
      v_local_dow := extract(dow from v_today_local)::int; -- 0=dom..6=sáb
      if v_local_dow not in (2, 4) then continue; end if;

      v_last_logged := greatest(
        case when v_rec.last_expense_at is not null
             then (v_rec.last_expense_at at time zone v_tz)::date end,
        v_rec.last_marked
      );
      if v_last_logged is null then continue; end if;

      -- Dormido: sin registrar hace una semana o más.
      v_days_since := v_today_local - v_last_logged;
      if v_days_since < 7 then continue; end if;
      -- Un único aviso por episodio de inactividad (anclado a la última
      -- actividad): si retoma y vuelve a dormirse, cambia el episodio.
      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id and n.user_id = v_rec.user_id
          and n.kind = 'assistant_dormant'
          and n.metadata->>'episode' = v_last_logged::text
      ) then continue; end if;
      if v_rec.lang = 'en' then
        v_title := 'Your assistant needs data';
        v_body := 'It''s been a week without logging. Without spending data it can''t size your daily budget or spot patterns — it just stays quiet. Log one expense and it reads your rhythm again.';
      else
        v_title := 'Tu asistente necesita datos';
        v_body := 'Hace una semana que no registras gastos. Sin datos no puede calcular tu cupo ni anticipar nada — se queda en silencio. Registra un gasto y vuelve a leerte el ritmo.';
      end if;
      perform public.emit_notification(
        v_rec.family_id, v_rec.user_id, v_title, v_body,
        'assistant_dormant', 'info', null,
        jsonb_build_object(
          'url', '/(app)/(tabs)/control',
          'episode', v_last_logged::text,
          'days_since', v_days_since));
    exception when others then null;
    end;
  end loop;
exception when others then null;
end; $function$;

revoke execute on function public.cron_emit_assistant_dormant() from public, anon, authenticated;

-- ─── 10 · family_member_stats — racha del hogar ──────────────────────
-- La racha ya no es per-miembro; el admin ve la racha del HOGAR (misma
-- para todas las filas). El resto de las stats sigue per-miembro.

create or replace function public.family_member_stats()
returns table (
  user_id uuid,
  display_name text,
  avatar_animal text,
  role text,
  blocked_at timestamptz,
  member_since timestamptz,
  expenses_count integer,
  expenses_total numeric,
  fixed_paid_count integer,
  current_streak integer,
  longest_streak integer,
  last_expense_at timestamptz,
  spend_share_pct numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_cycle_start date := date_trunc('month', current_date)::date;
  v_cycle_end date := (v_cycle_start + interval '1 month')::date;
  v_total_spent numeric;
begin
  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = auth.uid() and fm.role <> 'blocked'
  limit 1;

  if v_family_id is null then
    return;
  end if;

  select coalesce(sum(price), 0) into v_total_spent
  from public.expenses
  where family_id = v_family_id
    and created_at >= v_cycle_start
    and created_at < v_cycle_end;

  return query
  select
    fm.user_id,
    coalesce(p.display_name, 'Usuario') as display_name,
    p.avatar_animal,
    fm.role,
    fm.blocked_at,
    fm.created_at as member_since,
    coalesce(ec.cnt, 0)::int as expenses_count,
    coalesce(ec.total, 0)::numeric as expenses_total,
    coalesce(fc.paid_count, 0)::int as fixed_paid_count,
    coalesce(fs.current_streak, 0)::int as current_streak,
    coalesce(fs.longest_streak, 0)::int as longest_streak,
    ec.last_at as last_expense_at,
    case when v_total_spent > 0
      then round((coalesce(ec.total, 0) / v_total_spent) * 100, 1)
      else 0::numeric
    end as spend_share_pct
  from public.family_members fm
  left join public.profiles p on p.id = fm.user_id
  left join public.family_streaks fs
    on fs.family_id = fm.family_id
  left join lateral (
    select count(*)::int as cnt,
           sum(e.price) as total,
           max(e.created_at) as last_at
    from public.expenses e
    where e.family_id = fm.family_id
      and e.created_by = fm.user_id
      and e.created_at >= v_cycle_start
      and e.created_at < v_cycle_end
  ) ec on true
  left join lateral (
    select count(*)::int as paid_count
    from public.fixed_expense_payments p
    where p.paid_by = fm.user_id
      and p.period_month = v_cycle_start
  ) fc on true
  where fm.family_id = v_family_id
  order by
    case fm.role when 'owner' then 0 when 'member' then 1 else 2 end,
    fm.created_at asc;
end;
$$;

revoke all on function public.family_member_stats() from public;
revoke execute on function public.family_member_stats() from anon;
grant execute on function public.family_member_stats() to authenticated;

-- ─── 11 · gastos_snapshot — streak familiar + marcas del hogar ───────
-- El límite de marked_days sube 14 → 35: ahora agrupa marcas de todos
-- los miembros y la grilla del jardín cubre hasta 5 semanas.

create or replace function public.gastos_snapshot(
  p_family_id uuid,
  p_cycle_start timestamptz,
  p_cycle_end timestamptz,
  p_today date default current_date,
  p_cupo_diario numeric default 0,
  p_days_per_page int default 7,
  p_timezone text default 'America/Argentina/Buenos_Aires'
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = v_user_id
      and fm.role <> 'blocked'
  ) then
    raise exception 'Not a family member';
  end if;

  if p_days_per_page > 31 then
    p_days_per_page := 31;
  elsif p_days_per_page < 1 then
    p_days_per_page := 1;
  end if;

  v_result := jsonb_build_object(
    'hero', public.gastos_hero_summary(
      p_family_id, p_cycle_start, p_cycle_end, p_today, p_timezone, null
    ),
    'calendar', public.gastos_calendar_summary(
      p_family_id, p_cycle_start, p_cycle_end, p_today, p_cupo_diario, p_timezone, null
    ),
    'categories', public.gastos_categories_with_counts(
      p_family_id, p_cycle_start, p_cycle_end
    ),
    'first_page', public.gastos_expenses_paginated(
      p_family_id, p_cycle_start, p_cycle_end, null, p_days_per_page, p_today, p_timezone, null
    ),
    'streak_row', (
      select jsonb_build_object(
        'current_streak', fs.current_streak,
        'longest_streak', fs.longest_streak,
        'total_days_logged', fs.total_days_logged,
        'last_logged_date', fs.last_logged_date,
        'freeze_tokens', fs.freeze_tokens,
        'streak_broken_at', fs.streak_broken_at
      )
      from public.family_streaks fs
      where fs.family_id = p_family_id
      limit 1
    ),
    'streak_marked_days', coalesce((
      select jsonb_agg(smd.marked_date order by smd.marked_date desc)
      from (
        select distinct marked_date
        from public.streak_marked_days
        where family_id = p_family_id
        order by marked_date desc
        limit 35
      ) smd
    ), '[]'::jsonb)
  );

  return v_result;
end;
$$;

revoke all on function public.gastos_snapshot(
  uuid, timestamptz, timestamptz, date, numeric, int, text
) from public;
revoke execute on function public.gastos_snapshot(
  uuid, timestamptz, timestamptz, date, numeric, int, text
) from anon;
grant execute on function public.gastos_snapshot(
  uuid, timestamptz, timestamptz, date, numeric, int, text
) to authenticated;

-- ─── 12 · Seed — replay familiar + clamp generoso ────────────────────
-- Corre ANTES de crear los triggers de logros sobre family_streaks para
-- no disparar una tormenta retroactiva de logros/celebraciones.
-- Replay honesto de la actividad del hogar; después, clamp con el mejor
-- valor entre miembros para que NADIE pierda su racha con el cambio.

do $$
declare
  v_fam record;
  v_best record;
begin
  for v_fam in select distinct us.family_id from public.user_streaks us loop
    begin
      perform public.recompute_family_streak(v_fam.family_id);

      -- El replay pudo no crear fila (p.ej. actividad borrada); asegurar.
      insert into public.family_streaks (family_id)
      values (v_fam.family_id)
      on conflict (family_id) do nothing;

      select max(us.current_streak) as max_current,
             max(us.longest_streak) as max_longest,
             max(us.freeze_tokens) as max_tokens,
             max(us.last_logged_date) as max_last
      into v_best
      from public.user_streaks us
      where us.family_id = v_fam.family_id;

      update public.family_streaks fs
      set current_streak = greatest(fs.current_streak, coalesce(v_best.max_current, 0)),
          longest_streak = greatest(fs.longest_streak, coalesce(v_best.max_longest, 0)),
          freeze_tokens = least(2, greatest(fs.freeze_tokens, coalesce(v_best.max_tokens, 0)))::smallint,
          last_logged_date = greatest(fs.last_logged_date, v_best.max_last),
          streak_broken_at = case
            when greatest(fs.current_streak, coalesce(v_best.max_current, 0)) > 0 then null
            else fs.streak_broken_at
          end,
          updated_at = now()
      where fs.family_id = v_fam.family_id;
    exception when others then
      raise notice 'family streak seed failed for %: %', v_fam.family_id, sqlerrm;
    end;
  end loop;
end $$;

-- ─── 13 · Logros de racha → family_streaks (a todos los miembros) ────
-- Los triggers viejos sobre user_streaks se eliminan (la tabla queda
-- sin escritores; dejarlos invita a double-awards ante cualquier write
-- accidental).

drop trigger if exists user_streaks_award_milestones on public.user_streaks;
drop trigger if exists user_streaks_award_milestones_insert on public.user_streaks;

create or replace function public.tr_award_family_streak_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thresholds int[] := array[7, 14, 30, 60, 90];
  v_threshold int;
  v_code text;
  v_member record;
  v_old int := coalesce(old.current_streak, 0);
  v_new int := coalesce(new.current_streak, 0);
begin
  if v_new <= v_old then return new; end if;
  foreach v_threshold in array v_thresholds loop
    if v_new >= v_threshold and v_old < v_threshold then
      v_code := 'streak_' || v_threshold::text;
      for v_member in
        select fm.user_id
        from public.family_members fm
        where fm.family_id = new.family_id
          and coalesce(fm.role, '') <> 'blocked'
      loop
        perform public.award_achievement(
          v_code,
          v_member.user_id,
          new.family_id,
          jsonb_build_object('streak', v_new)
        );
      end loop;
    end if;
  end loop;
  return new;
exception when others then
  raise notice 'tr_award_family_streak_milestones failed: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function public.tr_award_family_streak_milestones() from public, anon, authenticated;

drop trigger if exists family_streaks_award_milestones on public.family_streaks;
create trigger family_streaks_award_milestones
  after update of current_streak on public.family_streaks
  for each row execute function public.tr_award_family_streak_milestones();

create or replace function public.tr_award_family_streak_milestones_initial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thresholds int[] := array[7, 14, 30, 60, 90];
  v_threshold int;
  v_code text;
  v_member record;
  v_new int := coalesce(new.current_streak, 0);
begin
  foreach v_threshold in array v_thresholds loop
    if v_new >= v_threshold then
      v_code := 'streak_' || v_threshold::text;
      for v_member in
        select fm.user_id
        from public.family_members fm
        where fm.family_id = new.family_id
          and coalesce(fm.role, '') <> 'blocked'
      loop
        perform public.award_achievement(
          v_code,
          v_member.user_id,
          new.family_id,
          jsonb_build_object('streak', v_new)
        );
      end loop;
    end if;
  end loop;
  return new;
exception when others then
  raise notice 'tr_award_family_streak_milestones_initial failed: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function public.tr_award_family_streak_milestones_initial() from public, anon, authenticated;

drop trigger if exists family_streaks_award_milestones_insert on public.family_streaks;
create trigger family_streaks_award_milestones_insert
  after insert on public.family_streaks
  for each row execute function public.tr_award_family_streak_milestones_initial();

-- ─── 14 · Deprecaciones ──────────────────────────────────────────────
-- `recover_garden_day` (plantado manual) ya no tenía caller y su
-- predicado per-usuario quedó incompatible con el jardín familiar.
drop function if exists public.recover_garden_day(uuid, date);
