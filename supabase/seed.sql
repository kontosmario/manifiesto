-- ═══════════════════════════════════════════════════════════════════════════
-- Seed de DESARROLLO — Manifiesto
--
-- Corre automáticamente en `supabase db reset` (local) y a pedido contra
-- staging con `npm run db:seed:staging`. NUNCA contra producción: el guard de
-- abajo aborta si detecta datos reales.
--
-- Por qué existe: los estados que importan probar (ciclo a mitad de camino,
-- racha con huecos, fijo vencido, hogar dinámico, cuenta recién creada) tardan
-- semanas en aparecer solos. Acá se construyen en un comando.
--
-- Todas las cuentas usan la contraseña  Dev-2026!  y quedan con el email
-- confirmado, así que entrás directo sin pasar por el OTP.
--
--   dev.hogar@manifiesto.test    hogar compartido, ingreso fijo, mitad de ciclo
--   dev.pareja@manifiesto.test   miembro del hogar de arriba
--   dev.solo@manifiesto.test     unipersonal, ingreso dinámico
--   dev.nuevo@manifiesto.test    recién creada, sin datos (estados vacíos + tours)
--   dev.cerrado@manifiesto.test  con un ciclo anterior ya cerrado (Control → Meses)
--
-- Las fechas son RELATIVAS a current_date: el seed no se pudre con el tiempo.
-- Ver docs/operaciones/ambiente-dev.md
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- Sesión "sin usuario", pero con JSON válido.
--
-- El trigger audit_service_role_write() castea `request.jwt.claims` a json sin
-- tolerar el string vacío. En una sesión recién abierta (psql contra staging)
-- el setting no existe y CUALQUIER insert/delete auditado aborta con
-- "invalid input syntax for type json". Con '{}' auth.uid() sigue dando null
-- y el trigger no explota.
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{}', false);

-- ───────────────────────────────────────────────────────────────────────────
-- Guard: nunca sembrar sobre una base con datos reales.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_reales int;
begin
  select count(*) into v_reales
  from auth.users
  where email not like '%@manifiesto.test'
    and email not like '%@manifiesto.app'
    and email not like '%@manifiestoapp.com'
    and email not like '%.sim@%';

  if v_reales > 0 then
    raise exception
      'seed abortado: la base tiene % usuario(s) que no son de prueba. Este seed es solo para local/staging.', v_reales;
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- Purga de una corrida anterior.
--
-- Hace que el seed sea RE-EJECUTABLE, que es lo que se necesita en staging:
-- ahí no hay `db reset`, y como las fechas son relativas a hoy, volver a
-- sembrar es la forma de recuperar un ciclo "a mitad de camino" fresco.
--
-- Borra familias y usuarios; el resto se va por cascada (27 de 29 FKs contra
-- `families` y 25 de 37 contra `auth.users` son ON DELETE CASCADE). Las dos
-- que son SET NULL dejarían filas huérfanas, así que van explícitas.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_users    uuid[];
  v_families uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_users
  from auth.users where email like 'dev.%@manifiesto.test';

  if coalesce(array_length(v_users, 1), 0) = 0 then
    return;
  end if;

  select coalesce(array_agg(distinct family_id), '{}') into v_families
  from public.family_members where user_id = any(v_users);

  delete from public.achievements_earned where family_id = any(v_families);
  delete from public.audit_log
   where family_id = any(v_families) or user_id = any(v_users);

  -- Los miembros van ANTES que la familia. `trg_family_members_recompute_income`
  -- recalcula el ingreso del hogar en cada delete y hace upsert sobre
  -- family_finance; si la familia ya se borró por cascada, ese upsert viola la
  -- FK. Borrándolos primero el trigger corre con la familia todavía viva.
  delete from public.family_members where family_id = any(v_families);

  delete from public.families where id = any(v_families);
  delete from auth.users   where id = any(v_users);

  raise notice 'seed · purgadas % cuenta(s) de desarrollo de la corrida anterior',
    array_length(v_users, 1);
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- Helpers (viven en pg_temp: se evaporan al cerrar la sesión).
-- ───────────────────────────────────────────────────────────────────────────

-- Crea un usuario confirmado y devuelve su id. Idempotente por email.
create or replace function pg_temp.dev_user(
  p_email text,
  p_name  text,
  p_tz    text default 'America/Argentina/Buenos_Aires'
) returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is not null then
    return v_id;
  end if;

  v_id := gen_random_uuid();

  insert into auth.users(
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values(
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, extensions.crypt('Dev-2026!', extensions.gen_salt('bf')), now(),
    now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', p_name),
    '', '', '', '');

  insert into auth.identities(
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values(
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now());

  -- El trigger on_auth_user_created ya creó el profile; acá lo completamos.
  update public.profiles
     set display_name            = p_name,
         timezone                = p_tz,
         onboarding_completed_at = now(),
         previously_onboarded    = true
   where id = v_id;

  return v_id;
end $$;

-- Suplanta a un usuario para que auth.uid() lo devuelva. Así el seed puede
-- llamar a los RPC reales de la app (bootstrap_family, etc.) en vez de
-- reimplementar su lógica — y no se desincroniza cuando esa lógica cambia.
create or replace function pg_temp.dev_act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    false);
end $$;

-- Vuelve a "sin usuario". Tiene que ser un JSON válido y VACÍO, no un string
-- vacío: el trigger audit_service_role_write() castea este setting a json sin
-- tolerar '' y aborta cualquier INSERT con "invalid input syntax for type json".
create or replace function pg_temp.dev_act_as_nobody()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{}', false);
end $$;

-- id de categoría global por nombre y alcance.
create or replace function pg_temp.dev_cat(p_name text, p_scope text default 'expense')
returns uuid language sql stable as $$
  select id from public.categories
  where family_id is null and scope = p_scope and name = p_name
  limit 1;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ESCENARIO 1 — Hogar compartido, ingreso fijo, a mitad de ciclo.
--
-- Dos miembros, sueldo el día 1, ~3 semanas de gastos cargados con huecos
-- deliberados (días sin gasto → la racha del jardín tiene sentido), 5 fijos
-- (uno ya vencido, uno por vencer esta semana) y 2 metas de ahorro.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_owner   uuid;
  v_pareja  uuid;
  v_family  uuid;
  -- El ancla se calcula 18 días ATRÁS en vez de fijarla al día 1, para que el
  -- hogar caiga siempre a mitad de ciclo sin importar qué día corras el seed
  -- (anclado al 1, correrlo un día 3 daba un ciclo casi vacío). El payday se
  -- clampea a 28 para no pisar el borde de febrero.
  v_payday  int  := least(extract(day from current_date - 18)::int, 28);
  v_anchor  date := make_date(
                      extract(year  from current_date - 18)::int,
                      extract(month from current_date - 18)::int,
                      v_payday);
  v_nacida  timestamptz := now() - interval '5 months';
  d         date;
  v_cat     uuid;
  v_monto   numeric;
  v_desc    text;
  v_dia     int;
  v_descs   text[] := array[
    'Supermercado','Verdulería','Panadería','Carnicería','Kiosco',
    'Café','Almuerzo','Delivery','Cena afuera',
    'SUBE','Nafta','Uber','Estacionamiento',
    'Farmacia','Peluquería','Librería','Regalo'];
  v_cats    text[] := array[
    'Mercado','Mercado','Mercado','Mercado','Mercado',
    'Comida y salidas','Comida y salidas','Comida y salidas','Comida y salidas',
    'Transporte','Transporte','Transporte','Transporte',
    'Salud','Cuidado personal','Educación','Regalos y donaciones'];
begin
  v_owner  := pg_temp.dev_user('dev.hogar@manifiesto.test',  'Mario');
  v_pareja := pg_temp.dev_user('dev.pareja@manifiesto.test', 'Lucía');

  -- Familia creada por el RPC real de la app.
  perform pg_temp.dev_act_as(v_owner);
  select f.family_id into v_family from public.bootstrap_family() f;
  perform pg_temp.dev_act_as_nobody();

  update public.families set kind = 'shared', created_at = v_nacida where id = v_family;

  insert into public.family_members(family_id, user_id, role, monthly_income_contribution, created_at)
  values (v_family, v_pareja, 'member', 900000, v_nacida + interval '3 days')
  on conflict (user_id) do nothing;

  update public.family_members
     set monthly_income_contribution = 1500000, created_at = v_nacida
   where family_id = v_family and user_id = v_owner;

  -- Config financiera: ciclo mensual anclado al payday, 10% de ahorro.
  update public.family_finance
     set monthly_income           = 2400000,
         salary_payment_day       = v_payday,
         savings_goal_percent     = 10,
         current_cycle_anchor     = v_anchor,
         last_salary_confirmed_at = v_anchor + interval '9 hours',
         cycle_type               = 'monthly',
         income_mode              = 'fixed',
         local_currency           = 'ARS',
         daily_budget_buffer_mode = 'percent',
         daily_budget_buffer_value= 10,
         updated_at               = now()
   where family_id = v_family;

  -- Gastos fijos: uno vencido (Luz), uno inminente (Internet), uno en cuotas.
  insert into public.fixed_expenses(
    family_id, name, amount, kind, status, frequency, category_id,
    day_of_month, next_due_on, notify_days_before,
    installments_total, installments_paid, created_at, updated_at)
  values
  -- Fechas relativas a HOY para que siempre haya un vencido, uno inminente y
  -- otros más lejos, en vez de depender del día del mes en que corras el seed.
    (v_family, 'Alquiler',        850000, 'recurring',   'active', 'monthly',
       pg_temp.dev_cat('Vivienda','fixed_expense'),
       extract(day from current_date + 12)::int, current_date + 12, 3, null, 0, v_nacida, now()),
    (v_family, 'Luz',              48000, 'recurring',   'active', 'monthly',
       pg_temp.dev_cat('Servicios','fixed_expense'),
       extract(day from current_date - 3)::int,  current_date - 3,  2, null, 0, v_nacida, now()),
    (v_family, 'Internet',         39000, 'recurring',   'active', 'monthly',
       pg_temp.dev_cat('Servicios','fixed_expense'),
       extract(day from current_date + 2)::int,  current_date + 2,  2, null, 0, v_nacida, now()),
    (v_family, 'Gimnasio',         32000, 'recurring',   'active', 'monthly',
       pg_temp.dev_cat('Deporte','fixed_expense'),
       extract(day from current_date + 6)::int,  current_date + 6,  1, null, 0, v_nacida, now()),
    (v_family, 'Notebook en cuotas', 95000, 'installment', 'active', 'monthly',
       pg_temp.dev_cat('Cuotas y deudas','fixed_expense'),
       extract(day from current_date + 9)::int,  current_date + 9,  3, 12, 4, v_nacida, now());

  -- Metas de ahorro, uno cerca del objetivo para ver el estado "casi".
  insert into public.savings_goals(
    family_id, title, emoji, goal_amount, current_amount, target_months, is_active, created_at, updated_at)
  values
    (v_family, 'Vacaciones',        '🏖️', 1800000,  1440000, 8,  true, v_nacida, now()),
    (v_family, 'Fondo de emergencia','🛟', 3000000,   620000, 18, true, v_nacida + interval '20 days', now());

  -- Gastos variables del ciclo en curso. ~1 de cada 6 días queda SIN gasto,
  -- para que la racha del jardín tenga huecos reales que mostrar.
  d := v_anchor;
  while d <= current_date loop
    v_dia := (extract(day from d))::int;
    if v_dia % 6 <> 0 then
      for i in 1..(1 + (v_dia % 3)) loop
        v_desc  := v_descs[1 + ((v_dia * 7 + i * 3) % array_length(v_descs, 1))];
        v_cat   := pg_temp.dev_cat(v_cats[1 + ((v_dia * 7 + i * 3) % array_length(v_cats, 1))]);
        v_monto := 3500 + ((v_dia * 1237 + i * 811) % 42000);

        insert into public.expenses(family_id, category_id, description, price, created_by, created_at)
        values (
          v_family, v_cat, v_desc, v_monto,
          case when (v_dia + i) % 3 = 0 then v_pareja else v_owner end,
          d + interval '13 hours' + (i * interval '2 hours'));
      end loop;
    end if;
    d := d + 1;
  end loop;

  -- Un ingreso extra a mitad de ciclo (freelance).
  insert into public.income_events(family_id, created_by, amount, kind, description, event_date, created_at)
  values (v_family, v_owner, 180000, 'freelance', 'Trabajo de fin de semana',
          v_anchor + 12, (v_anchor + 12) + interval '18 hours');

  raise notice 'seed · hogar compartido listo (familia %)', v_family;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- ESCENARIO 2 — Unipersonal con ingreso DINÁMICO.
--
-- No hay sueldo fijo: el disponible sale de los ingresos que se van cargando.
-- Sirve para probar el modo dinámico, que calcula el cupo distinto.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_uid    uuid;
  v_family uuid;
  v_nacida timestamptz := now() - interval '3 months';
  -- Mismo criterio que el hogar compartido: ancla 18 días atrás para caer
  -- siempre a mitad de ciclo.
  v_payday int  := least(extract(day from current_date - 18)::int, 28);
  v_anchor date := make_date(
                     extract(year  from current_date - 18)::int,
                     extract(month from current_date - 18)::int,
                     v_payday);
  d        date;
  v_dia    int;
begin
  v_uid := pg_temp.dev_user('dev.solo@manifiesto.test', 'Sofía', 'America/Argentina/Cordoba');

  perform pg_temp.dev_act_as(v_uid);
  select f.family_id into v_family from public.bootstrap_family() f;
  perform pg_temp.dev_act_as_nobody();

  update public.families set kind = 'solo', created_at = v_nacida where id = v_family;
  update public.family_members set created_at = v_nacida
   where family_id = v_family and user_id = v_uid;

  update public.family_finance
     set income_mode           = 'dynamic',
         monthly_income        = 0,
         salary_payment_day    = v_payday,
         savings_goal_percent  = 15,
         current_cycle_anchor  = v_anchor,
         cycle_type            = 'monthly',
         local_currency        = 'ARS',
         updated_at            = now()
   where family_id = v_family;

  -- Ingresos irregulares: así se ve el hogar dinámico.
  insert into public.income_events(family_id, created_by, amount, kind, description, event_date, created_at)
  values
    (v_family, v_uid, 420000, 'freelance', 'Proyecto diseño',  current_date - 22, now() - interval '22 days'),
    (v_family, v_uid, 260000, 'freelance', 'Retoque de marca', current_date - 11, now() - interval '11 days'),
    (v_family, v_uid,  95000, 'sale',      'Venta usados',     current_date -  4, now() - interval '4 days');

  insert into public.fixed_expenses(
    family_id, name, amount, kind, status, frequency, category_id,
    day_of_month, next_due_on, notify_days_before, created_at, updated_at)
  values
    (v_family, 'Monotributo', 37000, 'recurring', 'active', 'monthly',
       pg_temp.dev_cat('Impuestos','fixed_expense'),
       extract(day from current_date + 8)::int, current_date + 8, 3, v_nacida, now()),
    (v_family, 'Coworking',   85000, 'recurring', 'active', 'monthly',
       pg_temp.dev_cat('Otros','fixed_expense'),
       extract(day from current_date + 1)::int, current_date + 1, 2, v_nacida, now());

  d := v_anchor;
  while d <= current_date loop
    v_dia := (extract(day from d))::int;
    if v_dia % 4 <> 0 then
      insert into public.expenses(family_id, category_id, description, price, created_by, created_at)
      values (
        v_family,
        pg_temp.dev_cat(case when v_dia % 3 = 0 then 'Comida y salidas' else 'Mercado' end),
        case when v_dia % 3 = 0 then 'Almuerzo' else 'Compras' end,
        4200 + ((v_dia * 971) % 26000),
        v_uid,
        d + interval '14 hours');
    end if;
    d := d + 1;
  end loop;

  raise notice 'seed · hogar dinámico listo (familia %)', v_family;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- ESCENARIO 3 — Cuenta recién creada, sin un solo dato.
--
-- Para probar estados vacíos, el onboarding financiero y los 4 tours, que solo
-- disparan cuando las marcas de "ya lo vio" están en null.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_uid    uuid;
  v_family uuid;
begin
  v_uid := pg_temp.dev_user('dev.nuevo@manifiesto.test', 'Test Nuevo');

  perform pg_temp.dev_act_as(v_uid);
  select f.family_id into v_family from public.bootstrap_family() f;
  perform pg_temp.dev_act_as_nobody();

  update public.families set kind = 'solo' where id = v_family;

  -- Tours sin ver y onboarding sin cerrar: la app arranca de cero de verdad.
  update public.profiles
     set home_tour_seen_at       = null,
         gastos_tour_seen_at     = null,
         fijos_tour_seen_at      = null,
         control_tour_seen_at    = null,
         onboarding_completed_at = null,
         previously_onboarded    = false
   where id = v_uid;

  raise notice 'seed · cuenta nueva lista (familia %)', v_family;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- ESCENARIO 4 — Hogar con un ciclo anterior YA CERRADO.
--
-- Cierra el ciclo con el RPC real (close_monthly_cycle), así el resumen mensual
-- queda calculado por el mismo código que corre en producción. Habilita probar
-- Control → Meses, el wrapped de cierre y la decisión de sobrante.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_uid      uuid;
  v_family   uuid;
  v_ciclo_ini date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_ciclo_fin date := date_trunc('month', current_date)::date;
  v_nacida   timestamptz := now() - interval '8 months';
  d          date;
  v_dia      int;
begin
  v_uid := pg_temp.dev_user('dev.cerrado@manifiesto.test', 'Jorge');

  perform pg_temp.dev_act_as(v_uid);
  select f.family_id into v_family from public.bootstrap_family() f;
  perform pg_temp.dev_act_as_nobody();

  -- close_monthly_cycle tiene un guard que ignora familias recién creadas
  -- (el "cierre fantasma"). Hay que envejecerla antes de cerrarle un ciclo.
  update public.families set kind = 'solo', created_at = v_nacida where id = v_family;
  update public.family_members set created_at = v_nacida
   where family_id = v_family and user_id = v_uid;

  update public.family_finance
     set monthly_income           = 1600000,
         salary_payment_day       = 1,
         savings_goal_percent     = 12,
         current_cycle_anchor     = v_ciclo_ini,
         last_salary_confirmed_at = v_ciclo_ini + interval '9 hours',
         cycle_type               = 'monthly',
         income_mode              = 'fixed',
         local_currency           = 'ARS',
         updated_at               = now()
   where family_id = v_family;

  -- Gastos del ciclo que vamos a cerrar.
  d := v_ciclo_ini;
  while d < v_ciclo_fin loop
    v_dia := (extract(day from d))::int;
    if v_dia % 5 <> 0 then
      insert into public.expenses(family_id, category_id, description, price, created_by, created_at)
      values (
        v_family,
        pg_temp.dev_cat(case when v_dia % 4 = 0 then 'Transporte'
                             when v_dia % 3 = 0 then 'Comida y salidas'
                             else 'Mercado' end),
        'Gasto del ciclo anterior',
        5000 + ((v_dia * 1493) % 38000),
        v_uid,
        d + interval '12 hours');
    end if;
    d := d + 1;
  end loop;

  -- Cierre con el RPC real de producción.
  perform public.close_monthly_cycle(v_family, v_ciclo_ini, v_ciclo_fin, true);

  -- El ciclo nuevo arranca hoy.
  update public.family_finance
     set current_cycle_anchor     = v_ciclo_fin,
         last_salary_confirmed_at = v_ciclo_fin + interval '9 hours'
   where family_id = v_family;

  raise notice 'seed · hogar con ciclo cerrado listo (familia %)', v_family;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- Resumen de lo sembrado.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  r record;
begin
  raise notice '─────────────────────────────────────────────';
  raise notice 'Seed de desarrollo aplicado. Contraseña: Dev-2026!';
  for r in
    select u.email,
           f.kind,
           ff.income_mode,
           (select count(*) from public.expenses e where e.family_id = f.id)        as gastos,
           (select count(*) from public.fixed_expenses x where x.family_id = f.id)  as fijos,
           (select count(*) from public.monthly_summaries m where m.family_id = f.id) as cierres
    from auth.users u
    join public.family_members fm on fm.user_id = u.id
    join public.families f        on f.id = fm.family_id
    left join public.family_finance ff on ff.family_id = f.id
    where u.email like 'dev.%@manifiesto.test' and fm.role = 'owner'
    order by u.email
  loop
    raise notice '  % · % / % · % gastos, % fijos, % cierres',
      rpad(r.email, 30), r.kind, coalesce(r.income_mode,'-'), r.gastos, r.fijos, r.cierres;
  end loop;
  raise notice '─────────────────────────────────────────────';
end $$;
