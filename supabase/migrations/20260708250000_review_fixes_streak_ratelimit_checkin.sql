-- ════════════════════════════════════════════════════════════════════
-- FIXES del code review exhaustivo pre-build (2026-07-08, fase 2).
-- Misma técnica de cirugía verbatim-base que 20260708230000/240000
-- (ancla ambigua ABORTA; ausente WARNING+skip para replays frescos).
--
-- Hallazgos confirmados por verificación adversarial:
--  R1 recompute_family_streak (invocada por unmark_no_expense_day):
--     el replay ignoraba garden_recovered_days (días puenteados por el
--     escudo del cron no dejan fila de actividad) y reconstruía
--     freeze_tokens desde 0 → des-marcar un día podía COLAPSAR la racha
--     familiar y borrar escudos de todo el hogar.
--  R2 mark_no_expense_day: la redefinición 20260708120000 perdió el
--     filtro `commitment_id is null` que 20260621000000 había agregado
--     a propósito → un débito automático de fijo bloqueaba marcar "día
--     sin gastos" (y el check-in vespertino, que SÍ filtra fijos,
--     invitaba a marcarlo → rechazo garantizado).
--  R3 enforce_rate_limit: mensaje 'Demasiados intentos...' P0001 sin
--     hint — el cliente parsea 'rate_limit_exceeded' + errcode 54000 +
--     hint 'retry_after_<seg>' (error-message.ts) → los 7 RPCs del shim
--     mostraban error crudo voseo sin retry-after. Contrato restaurado.
--  R4 list_pending_notifications (morning): dinámico sin ingresos tiene
--     raw_cycle_balance=0 y caía en el copy de exceso → notif diaria
--     'ya vas $0 arriba del plan' con severity warning. Rama nueva para
--     $0 (dinámico sin presupuesto → CTA de primer ingreso; resto →
--     copy neutral) y severity info para balance ≥ 0.
-- ════════════════════════════════════════════════════════════════════

create function pg_temp.patch_fn(p_fn regprocedure, p_from text, p_to text)
returns void language plpgsql as $helper$
declare
  src text;
  n int;
begin
  src := pg_get_functiondef(p_fn);
  n := (length(src) - length(replace(src, p_from, ''))) / length(p_from);
  if n > 1 then
    raise exception 'patch_fn %: ancla ambigua (% veces)', p_fn, n;
  end if;
  if n = 0 then
    raise warning 'patch_fn %: ancla ausente — parche omitido (replay en entorno fresco)', p_fn;
    return;
  end if;
  execute replace(src, p_from, p_to);
end;
$helper$;

-- R1a · declarar acumulador del saldo previo de escudos
select pg_temp.patch_fn(
  'public.recompute_family_streak(uuid)'::regprocedure,
  'v_prior_longest integer := 0;
begin',
  'v_prior_longest integer := 0;
  v_prior_tokens integer := 0;
begin');

-- R1b · capturar freeze_tokens antes del delete
select pg_temp.patch_fn(
  'public.recompute_family_streak(uuid)'::regprocedure,
  'select fs.longest_streak into v_prior_longest
  from public.family_streaks fs
  where fs.family_id = p_family_id;',
  'select fs.longest_streak, fs.freeze_tokens
    into v_prior_longest, v_prior_tokens
  from public.family_streaks fs
  where fs.family_id = p_family_id;');

-- R1c · el replay incluye los días puenteados por el escudo
select pg_temp.patch_fn(
  'public.recompute_family_streak(uuid)'::regprocedure,
  'select distinct md.marked_date as event_date
        from public.streak_marked_days md
        where md.family_id = p_family_id
    ) days',
  'select distinct md.marked_date as event_date
        from public.streak_marked_days md
        where md.family_id = p_family_id
      union
      -- Días PUENTEADOS por el escudo del cron: actividad consolidada
      -- del jardín; sin ellos el replay encuentra el hueco sin token y
      -- colapsa la racha (review 2026-07-08).
      select distinct grd.day as event_date
        from public.garden_recovered_days grd
        where grd.family_id = p_family_id
    ) days');

-- R1d · restaurar el saldo de escudos (economía NO re-derivable: el
--       puente del cron consume sin avanzar el reloj de grants y los
--       seedeados del 2026-07-08 no tienen historia replayable)
select pg_temp.patch_fn(
  'public.recompute_family_streak(uuid)'::regprocedure,
  'set longest_streak = greatest(public.family_streaks.longest_streak, excluded.longest_streak),
          updated_at = now();
  end if;',
  'set longest_streak = greatest(public.family_streaks.longest_streak, excluded.longest_streak),
          updated_at = now();
  end if;

  if coalesce(v_prior_tokens, 0) > 0 then
    insert into public.family_streaks (family_id, freeze_tokens)
    values (p_family_id, v_prior_tokens)
    on conflict (family_id) do update
      set freeze_tokens = greatest(public.family_streaks.freeze_tokens, excluded.freeze_tokens),
          updated_at = now();
  end if;');

-- R2 · mark_no_expense_day: los pagos de fijos no son "gasto del día"
select pg_temp.patch_fn(
  'public.mark_no_expense_day(uuid, date, boolean)'::regprocedure,
  'where e.family_id = p_family_id
      and e.created_by is not null
      and (e.created_at at time zone v_tz)::date = v_target',
  'where e.family_id = p_family_id
      and e.created_by is not null
      -- Débitos automáticos de fijos NO bloquean el día sin gastos
      -- (filtro de 20260621000000 perdido en la redefinición familiar;
      -- restaurado en el review 2026-07-08 — alineado con los builders
      -- de midday/evening que ya filtran commitment_id).
      and e.commitment_id is null
      and (e.created_at at time zone v_tz)::date = v_target');

-- R3 · enforce_rate_limit: contrato de error parseable por el cliente
select pg_temp.patch_fn(
  'public.enforce_rate_limit(text, integer, integer)'::regprocedure,
  'raise exception ''Demasiados intentos. Esperá un momento e intentá de nuevo.''
      using errcode = ''P0001'';',
  '-- Contrato que parsea el cliente (error-message.ts): prefijo
    -- ''rate_limit_exceeded'', errcode 54000 y hint ''retry_after_<seg>''
    -- (review 2026-07-08: el shim de check_rate_limit lo había perdido
    -- al delegar acá y los 7 RPCs mostraban el error crudo).
    raise exception ''rate_limit_exceeded: % calls in % seconds (max %)'',
        v_attempts, p_window_seconds, p_max_attempts
      using errcode = ''54000'',
            hint = ''retry_after_'' || greatest(1, ceil(extract(epoch from
              (v_window_start + make_interval(secs => p_window_seconds) - now()))))::int::text;');

-- R4a · exponer income_mode en la CTE final del morning check-in
select pg_temp.patch_fn(
  'public.list_pending_notifications(text)'::regprocedure,
  'd.daily_budget, d.available_today, d.raw_cycle_balance
      from cycle c',
  'd.daily_budget, d.available_today, d.raw_cycle_balance, c.income_mode
      from cycle c');

-- R4b · balance $0 no es "pasado del plan"
select pg_temp.patch_fn(
  'public.list_pending_notifications(text)'::regprocedure,
  'else
          case when f.lang = ''en'' then ''This cycle you''''re already $'' || to_char(round(abs(f.raw_cycle_balance)), ''FM999,999,999'') || '' over plan. Best today: $0 on extras.''
               else ''Este ciclo ya vas $'' || to_char(round(abs(f.raw_cycle_balance)), ''FM999,999,999'') || '' arriba del plan. Hoy ideal: $0 en gustos.'' end
      end as body,',
  'when f.raw_cycle_balance = 0 and coalesce(f.income_mode, ''fixed'') = ''dynamic'' and coalesce(f.daily_budget, 0) = 0 then
          -- DINÁMICO sin presupuesto todavía: $0 no es exceso, es un
          -- ciclo sin ingresos cargados (review 2026-07-08).
          case when f.lang = ''en'' then ''Log your first income of the cycle to see your daily allowance 🌱''
               else ''Cargá tu primer ingreso del ciclo para ver tu cupo del día 🌱'' end
        when f.raw_cycle_balance = 0 then
          case when f.lang = ''en'' then ''You''''re exactly on plan this cycle. Best today: $0 on extras.''
               else ''Vas exacto al plan este ciclo. Hoy ideal: $0 en gustos.'' end
        else
          case when f.lang = ''en'' then ''This cycle you''''re already $'' || to_char(round(abs(f.raw_cycle_balance)), ''FM999,999,999'') || '' over plan. Best today: $0 on extras.''
               else ''Este ciclo ya vas $'' || to_char(round(abs(f.raw_cycle_balance)), ''FM999,999,999'') || '' arriba del plan. Hoy ideal: $0 en gustos.'' end
      end as body,');

-- R4c · severity: balance exacto en 0 no es warning
select pg_temp.patch_fn(
  'public.list_pending_notifications(text)'::regprocedure,
  'case when not f.confirmado then ''warning'' when f.raw_cycle_balance > 0 then ''info'' else ''warning'' end as severity,',
  'case when not f.confirmado then ''warning'' when f.raw_cycle_balance >= 0 then ''info'' else ''warning'' end as severity,');

-- R5 · trigger del switch de modo: el sueldo del hogar se re-deriva en
--     el MOMENTO del cambio (review 2026-07-08). Sin esto: a dinámico,
--     monthly_income quedaba stale >0 (Fijos mostraba "% de tu sueldo"
--     contra un sueldo inexistente) hasta que algún cambio de miembros
--     disparara el recompute; y de vuelta a fijo quedaba en 0 (Home en
--     "Configurá tu sueldo") aunque las contribuciones siguieran
--     cargadas. BEFORE UPDATE ⇒ sin recursión ni segundo UPDATE.
create or replace function public.trg_family_finance_income_mode_switch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(new.income_mode, 'fixed') = 'dynamic' then
    new.monthly_income := 0;
  else
    select coalesce(sum(fm.monthly_income_contribution), 0)
      into new.monthly_income
    from public.family_members fm
    where fm.family_id = new.family_id
      and fm.blocked_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_family_finance_income_mode_switch()
  from public, anon, authenticated;

drop trigger if exists family_finance_income_mode_switch on public.family_finance;
create trigger family_finance_income_mode_switch
  before update of income_mode on public.family_finance
  for each row
  when (old.income_mode is distinct from new.income_mode)
  execute function public.trg_family_finance_income_mode_switch();

-- R6 · peek_family_invite expone income_mode (metadata de modo, no dato
--     financiero — el hardening 2026-06-30 sigue intacto): el paso 4 del
--     onboarding de un miembro que se une necesita saber si el hogar es
--     dinámico para no pedirle un aporte mensual inerte.
select pg_temp.patch_fn(
  'public.peek_family_invite(text)'::regprocedure,
  '''monthly_income'', 0,',
  '''monthly_income'', 0,
    ''income_mode'', coalesce((
      select ff.income_mode from public.family_finance ff
      where ff.family_id = v_family_id
    ), ''fixed''),');
