-- ════════════════════════════════════════════════════════════════════
-- E2E BACKEND — circuito completo contra la base REAL.
--
-- Crea usuarios desechables (@manifiestoapp.test), recorre:
--   bootstrap familia → modo dinámico semanal → ingresos + gastos
--   (triggers de jardín) → Guard 0 anti-fantasma → cierre de ciclo →
--   notificación con dedup → decisión "acumular" → reserva + release
--   re-anclado → defensivo de sueldo stale → invite → consume →
--   contribución de miembro → salida con notificación → teardown.
--
-- TODA aserción que falla hace RAISE EXCEPTION → la transacción entera
-- rollbackea y la base queda intacta. En éxito, el teardown final
-- elimina todo lo creado. Ejecutar completo en UNA transacción
-- (psql -1 / MCP execute_sql).
--
-- Nota: los INSERT directos corren como superuser (bypass RLS a
-- propósito — acá se testean FUNCIONES); las RPCs se llaman con
-- impersonación real (set_config request.jwt.claims) y ejercitan sus
-- guards internos (auth, owner, rate limit, caps).
-- ════════════════════════════════════════════════════════════════════

do $e2e$
declare
  v_owner uuid;
  v_member uuid;
  v_family uuid;
  v_summary record;
  v_code text;
  v_n int;
  v_amount numeric;
  v_anchor date;
  v_balance numeric;
  v_avail numeric;
  v_avail2 numeric;
  v_ov boolean;
  v_res jsonb;
  -- Fecha AR: el sistema fecha income_events en tz America/Argentina/
  -- Buenos_Aires; usar current_date (UTC) descuadra las ventanas del
  -- test entre las 00:00 y las 03:00 UTC.
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_prev_start date;
  v_prev_end date;
begin
  v_prev_start := v_today - 7;
  v_prev_end := v_today;
  ------------------------------------------------------------------
  -- 0 · PRE-CLEAN de corridas anteriores (idempotencia)
  ------------------------------------------------------------------
  perform set_config('app.allow_delete_categories', 'on', true);
  -- audit_log y rpc_rate_limits no tienen FK: sin esto, cada corrida
  -- deja filas huérfanas committeadas en prod (review 2026-07-08).
  delete from public.audit_log
   where user_id in (select id from auth.users where email like 'e2e.%@manifiestoapp.test');
  delete from public.rpc_rate_limits
   where user_id in (select id from auth.users where email like 'e2e.%@manifiestoapp.test');
  delete from public.families f
   where f.id in (
     select fm.family_id from public.family_members fm
     join auth.users u on u.id = fm.user_id
     where u.email like 'e2e.%@manifiestoapp.test');
  delete from auth.users where email like 'e2e.%@manifiestoapp.test';

  ------------------------------------------------------------------
  -- 1 · USUARIOS de prueba
  ------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
    'authenticated', 'authenticated', 'e2e.owner@manifiestoapp.test',
    extensions.crypt(md5(random()::text), extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"E2E Owner"}'::jsonb, '', '', '', ''
  ) returning id into v_owner;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
    'authenticated', 'authenticated', 'e2e.member@manifiestoapp.test',
    extensions.crypt(md5(random()::text), extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"E2E Member"}'::jsonb, '', '', '', ''
  ) returning id into v_member;

  if not exists (select 1 from public.profiles where id = v_owner) then
    raise exception 'E2E FAIL [1]: el trigger de profiles no creó el profile del owner';
  end if;

  ------------------------------------------------------------------
  -- 2 · BOOTSTRAP de familia (RPC real, impersonado)
  ------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  select family_id into v_family from public.bootstrap_family();
  if v_family is null then
    raise exception 'E2E FAIL [2]: bootstrap_family no devolvió familia';
  end if;
  if not exists (select 1 from public.family_members
                  where family_id = v_family and user_id = v_owner and role = 'owner') then
    raise exception 'E2E FAIL [2]: membership owner no creada';
  end if;

  ------------------------------------------------------------------
  -- 3 · Config DINÁMICO semanal (ciclo actual [hoy, hoy+7))
  ------------------------------------------------------------------
  update public.family_finance
     set income_mode = 'dynamic', monthly_income = 0,
         savings_goal = 0, savings_goal_percent = 0,
         cycle_type = 'weekly', cycle_anchor_date = v_today,
         cycle_length_days = 7
   where family_id = v_family;

  -- Ingresos y gastos en la semana ANTERIOR [hoy-7, hoy)
  insert into public.income_events (family_id, created_by, amount, kind, description, event_date)
  values (v_family, v_owner, 300000, 'freelance', 'E2E ingreso 1', v_prev_start + 1),
         (v_family, v_owner, 200000, 'sale', 'E2E ingreso 2', v_prev_start + 3);

  insert into public.expenses (family_id, category_id, description, price, created_by, created_at)
  select v_family, c.id, 'E2E gasto ' || g, 40000, v_owner,
         (v_prev_start + g)::timestamp + interval '15 hours'
  from generate_series(1, 3) g,
       lateral (select id from public.categories
                 where family_id is null and scope = 'expense' limit 1) c;

  -- Jardín FAMILIAR: un gasto de HOY avanza la racha del hogar.
  -- (Los gastos BACKDATEADOS no la avanzan en vivo POR DISEÑO —
  -- advance_streak ignora p_event_date < hoy local; el replay
  -- recompute_family_streak es la herramienta para históricos.)
  insert into public.expenses (family_id, category_id, description, price, created_by)
  select v_family, c.id, 'E2E gasto hoy', 5000, v_owner
  from (select id from public.categories
         where family_id is null and scope = 'expense' limit 1) c;
  if not exists (select 1 from public.family_streaks
                  where family_id = v_family and current_streak >= 1) then
    raise exception 'E2E FAIL [3]: el gasto de hoy no avanzó la racha familiar';
  end if;

  ------------------------------------------------------------------
  -- 4 · GUARD 0 anti-fantasma: familia creada HOY no cierra la semana
  --     previa (que terminó hoy) — el cierre debe rebotar
  ------------------------------------------------------------------
  v_res := public.close_monthly_cycle(v_family, v_prev_start, v_prev_end, false);
  if v_res->>'status' <> 'family_too_new' then
    raise exception 'E2E FAIL [4]: Guard 0 no rebotó (status=%)', v_res->>'status';
  end if;

  -- Backdate de la familia (simula cuenta con historia) y cierre real
  update public.families set created_at = now() - interval '30 days' where id = v_family;
  v_res := public.close_monthly_cycle(v_family, v_prev_start, v_prev_end, false);
  if v_res->>'status' <> 'closed' then
    raise exception 'E2E FAIL [4b]: el cierre no cerró (status=%)', v_res->>'status';
  end if;

  ------------------------------------------------------------------
  -- 5 · SUMMARY del cierre dinámico: números canónicos
  ------------------------------------------------------------------
  select * into v_summary from public.monthly_summaries
   where family_id = v_family order by period_start desc limit 1;

  if v_summary.extra_income <> 500000 then
    raise exception 'E2E FAIL [5]: extra_income=% (esperaba 500000)', v_summary.extra_income;
  end if;
  if v_summary.total_spent <> 120000 then
    raise exception 'E2E FAIL [5]: total_spent=% (esperaba 120000)', v_summary.total_spent;
  end if;
  if v_summary.monthly_income <> 0 then
    raise exception 'E2E FAIL [5]: monthly_income=% (dinámico debe persistir 0)', v_summary.monthly_income;
  end if;
  if v_summary.savings_delta <> 380000 then
    raise exception 'E2E FAIL [5]: savings_delta=% (esperaba 380000 = 500000-120000)', v_summary.savings_delta;
  end if;
  if v_summary.mood <> 'green' then
    raise exception 'E2E FAIL [5]: mood=% (esperaba green)', v_summary.mood;
  end if;
  if v_summary.period_label !~ '–' then
    raise exception 'E2E FAIL [5]: period_label=% (ciclo corto debe ser rango)', v_summary.period_label;
  end if;
  select count(*) into v_n from public.expenses
   where family_id = v_family and archived_at is null
     and created_at >= v_prev_start::timestamptz
     and created_at < v_prev_end::timestamptz;
  if v_n <> 0 then
    raise exception 'E2E FAIL [5]: % gastos de la ventana cerrada sin archivar', v_n;
  end if;

  -- Notificación de cierre: emitida con "Te sobró" y DEDUP en re-cierre
  select count(*) into v_n from public.notifications
   where family_id = v_family and kind = 'cycle_closed' and body like 'Te sobró%';
  if v_n <> 1 then
    raise exception 'E2E FAIL [5]: notificación de cierre=% (esperaba 1 con Te sobró)', v_n;
  end if;
  v_res := public.close_monthly_cycle(v_family, v_prev_start, v_prev_end, true); -- force upsert
  select count(*) into v_n from public.notifications
   where family_id = v_family and kind = 'cycle_closed';
  if v_n <> 1 then
    raise exception 'E2E FAIL [5]: dedup falló — % notificaciones tras re-cierre', v_n;
  end if;

  ------------------------------------------------------------------
  -- 6 · DECISIÓN "acumular" (RPC real): arrastre al ciclo nuevo
  ------------------------------------------------------------------
  perform public.apply_month_close_decision(
    (select id from public.monthly_summaries where family_id = v_family limit 1),
    'acumular', null, null);
  select amount into v_amount from public.income_events
   where family_id = v_family and description like 'Sobrante de%';
  if coalesce(v_amount, 0) <> 380000 then
    raise exception 'E2E FAIL [6]: arrastre=% (esperaba 380000)', v_amount;
  end if;

  ------------------------------------------------------------------
  -- 7 · RESERVA + RELEASE re-anclado (fix 20260708210000) y
  --     defensivo de sueldo stale (fix 20260708170000)
  ------------------------------------------------------------------
  select d.available_today into v_avail
    from public.cycle_disponible(v_family, v_today) d;

  update public.family_finance set monthly_reserve_amount = 50000
   where family_id = v_family;
  perform public.apply_reserve_decision(50000, 'cycle', null);

  select ff.current_cycle_anchor, ff.current_cycle_starting_balance,
         ff.monthly_reserve_amount
    into v_anchor, v_balance, v_amount
    from public.family_finance ff where ff.family_id = v_family;
  if v_anchor <> v_today then
    raise exception 'E2E FAIL [7]: release no re-ancló (anchor=%, esperaba %)', v_anchor, v_today;
  end if;
  if v_balance <> 50000 or v_amount <> 0 then
    raise exception 'E2E FAIL [7]: balance=%/reserva=% (esperaba 50000/0)', v_balance, v_amount;
  end if;
  select d.available_today, d.has_override into v_avail2, v_ov
    from public.cycle_disponible(v_family, v_today) d;
  if not v_ov or v_avail2 <> v_avail + 50000 then
    raise exception 'E2E FAIL [7]: release invisible (antes=%, después=%, ov=%)', v_avail, v_avail2, v_ov;
  end if;

  -- Sueldo STALE: una contribución en dinámico NO debe inflar el cupo
  perform public.update_my_income_contribution(999999);
  select d.available_today into v_avail2
    from public.cycle_disponible(v_family, v_today) d;
  if v_avail2 <> v_avail + 50000 then
    raise exception 'E2E FAIL [7b]: sueldo stale filtrado al presupuesto dinámico (%->%)', v_avail + 50000, v_avail2;
  end if;
  -- Post-fix A1 (20260708230000): recompute_family_income ya no estampa
  -- sueldo fantasma en la family_finance dinámica (protección en la
  -- FUENTE, no solo defensiva del lector)
  select ff.monthly_income into v_amount
    from public.family_finance ff where ff.family_id = v_family;
  if v_amount <> 0 then
    raise exception 'E2E FAIL [7c]: recompute estampó sueldo fantasma % en dinámico', v_amount;
  end if;

  ------------------------------------------------------------------
  -- 8 · INVITE → CONSUME → contribución → SALIDA de miembro
  ------------------------------------------------------------------
  select code into v_code from public.create_family_invite();
  if v_code is null or length(v_code) <> 8 then
    raise exception 'E2E FAIL [8]: invite code inválido (%)', v_code;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  v_res := public.peek_family_invite(v_code);
  if (v_res->>'member_count')::int <> 1 then
    raise exception 'E2E FAIL [8]: peek member_count=% (esperaba 1)', v_res->>'member_count';
  end if;
  perform public.consume_family_invite(v_code);
  if not exists (select 1 from public.family_members
                  where family_id = v_family and user_id = v_member and role = 'member') then
    raise exception 'E2E FAIL [8]: consume no creó la membresía';
  end if;

  perform public.update_my_income_contribution(150000);
  perform public.leave_current_family();
  if exists (select 1 from public.family_members
              where family_id = v_family and user_id = v_member) then
    raise exception 'E2E FAIL [8]: el miembro no salió';
  end if;
  if not exists (select 1 from public.notifications
                  where family_id = v_family and kind = 'member_left') then
    raise exception 'E2E FAIL [8]: falta la notificación member_left';
  end if;

  ------------------------------------------------------------------
  -- 9 · TEARDOWN (owner elimina el hogar para todos + usuarios fuera)
  ------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.leave_current_family();
  if exists (select 1 from public.families where id = v_family) then
    raise exception 'E2E FAIL [9]: la familia no se eliminó en el teardown';
  end if;
  delete from public.audit_log where user_id in (v_owner, v_member) or family_id = v_family;
  delete from public.rpc_rate_limits where user_id in (v_owner, v_member);
  delete from auth.users where id in (v_owner, v_member);

  raise notice '════ E2E BACKEND: 9/9 etapas OK ════';
end;
$e2e$;
