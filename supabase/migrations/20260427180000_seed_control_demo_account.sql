-- One-shot seed for a demo account focused on the Control screen.
-- Creates `control.demo@manifiesto.app` with password `ControlDemo2026`,
-- a single-member family, realistic finance config, 5 fixed expenses
-- with payment history, ~60 days of variable expenses, and an active
-- savings goal — enough surface for every Control card to render with
-- meaningful data.
--
-- Idempotent: bails out at the top if the user already exists, so it's
-- safe to re-apply.

do $$
declare
  v_user_id uuid;
  v_family_id uuid;
  v_today date := current_date;
  v_cycle_anchor date := date_trunc('month', v_today)::date;
  v_prev_cycle_anchor date := date_trunc('month', v_today - interval '1 month')::date;
  v_two_back_cycle_anchor date := date_trunc('month', v_today - interval '2 months')::date;

  -- Category ids used in the loop
  v_cat_supermercado uuid;
  v_cat_almacen uuid;
  v_cat_delivery uuid;
  v_cat_transporte uuid;
  v_cat_combustible uuid;
  v_cat_salud uuid;
  v_cat_subs uuid;
  v_cat_ocio uuid;
  v_cat_personal uuid;
  v_cat_general uuid;

  -- Fijos category ids
  v_fcat_alquiler uuid;
  v_fcat_expensas uuid;
  v_fcat_internet uuid;
  v_fcat_luz uuid;
  v_fcat_subs_fijo uuid;
  v_fcat_gym uuid;

  -- Fijos
  v_fijo_alquiler uuid;
  v_fijo_expensas uuid;
  v_fijo_internet uuid;
  v_fijo_luz uuid;
  v_fijo_subs uuid;
  v_fijo_gym uuid;

  -- Loop helpers
  v_offset int;
  v_expense_day date;
  v_expense_dow int;
  v_expense_count int;
  v_seed int;
  v_amount numeric;
  v_descriptions text[];
  v_categories uuid[];
  v_picked_idx int;
  v_picked_cat uuid;
  v_picked_desc text;
  v_inserted_at timestamptz;
begin
  -- Guard de reproducibilidad: los seeds de cuentas demo solo corren si se piden
  -- explícitamente. En prod ya se aplicaron (y sus cuentas fueron dadas de baja);
  -- en una base nueva (local o staging) el dato de desarrollo viene de
  -- supabase/seed.sql, no de migraciones. Ver docs/operaciones/ambiente-dev.md.
  if coalesce(current_setting('manifiesto.seed_demo_accounts', true), 'off') <> 'on' then
    raise notice 'seed de cuenta demo omitido (activar con: set manifiesto.seed_demo_accounts = ''on'')';
    return;
  end if;

  -- ── Bail if user already exists ─────────────────────────────────
  select id into v_user_id
  from auth.users
  where email = 'control.demo@manifiesto.app';
  if v_user_id is not null then
    raise notice 'control.demo@manifiesto.app already exists, skipping seed.';
    return;
  end if;

  -- ── 1. Auth user ────────────────────────────────────────────────
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'control.demo@manifiesto.app',
    crypt('ControlDemo2026', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Control Demo"}'::jsonb,
    '', '', '', ''
  ) returning id into v_user_id;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', 'control.demo@manifiesto.app'),
    'email',
    v_user_id::text,
    now(), now(), now()
  );

  -- The handle_new_user_profile trigger inserts the profile row with
  -- the display_name from raw_user_meta_data. We just patch the
  -- onboarding/timezone/avatar to land the user straight on the
  -- dashboard without the wizard.
  update public.profiles
  set onboarding_completed_at = now(),
      timezone = 'America/Argentina/Buenos_Aires',
      avatar_animal = 'panda'
  where id = v_user_id;

  -- ── 2. Family + membership ──────────────────────────────────────
  insert into public.families (id, code)
  values (gen_random_uuid(), 'CTRLDEMO')
  returning id into v_family_id;

  insert into public.family_members (family_id, user_id, role)
  values (v_family_id, v_user_id, 'owner');

  -- ── 3. Finance config ───────────────────────────────────────────
  -- 2.5M income · 500K savings · pays salary on the 1st · cycle
  -- already confirmed for the current month so the home doesn't
  -- prompt the cycle-balance sheet on first open.
  insert into public.family_finance (
    family_id, monthly_income, savings_goal, savings_goal_percent,
    usd_exchange_rate, salary_payment_day,
    last_salary_confirmed_at, current_cycle_anchor,
    daily_budget_buffer_mode, daily_budget_buffer_value
  ) values (
    v_family_id, 2500000, 500000, 20,
    1100, 1,
    now(), v_cycle_anchor,
    'none', 0
  );

  -- ── 4. Categories ───────────────────────────────────────────────
  insert into public.categories (family_id, name, scope) values
    (v_family_id, 'Gastos generales',          'expense'),
    (v_family_id, 'Supermercado',              'expense'),
    (v_family_id, 'Almacén y kiosco',          'expense'),
    (v_family_id, 'Delivery y salidas',        'expense'),
    (v_family_id, 'Transporte público',        'expense'),
    (v_family_id, 'Combustible',               'expense'),
    (v_family_id, 'Salud y farmacia',          'expense'),
    (v_family_id, 'Suscripciones y apps',      'expense'),
    (v_family_id, 'Ocio y entretenimiento',    'expense'),
    (v_family_id, 'Cuidado personal',          'expense'),
    (v_family_id, 'Alquiler',                  'fixed_expense'),
    (v_family_id, 'Expensas',                  'fixed_expense'),
    (v_family_id, 'Internet, cable y celular', 'fixed_expense'),
    (v_family_id, 'Luz y gas',                 'fixed_expense'),
    (v_family_id, 'Suscripciones y apps',      'fixed_expense'),
    (v_family_id, 'Deportes y bienestar',      'fixed_expense');

  select id into v_cat_general      from public.categories where family_id = v_family_id and name = 'Gastos generales' and scope = 'expense';
  select id into v_cat_supermercado from public.categories where family_id = v_family_id and name = 'Supermercado' and scope = 'expense';
  select id into v_cat_almacen      from public.categories where family_id = v_family_id and name = 'Almacén y kiosco' and scope = 'expense';
  select id into v_cat_delivery     from public.categories where family_id = v_family_id and name = 'Delivery y salidas' and scope = 'expense';
  select id into v_cat_transporte   from public.categories where family_id = v_family_id and name = 'Transporte público' and scope = 'expense';
  select id into v_cat_combustible  from public.categories where family_id = v_family_id and name = 'Combustible' and scope = 'expense';
  select id into v_cat_salud        from public.categories where family_id = v_family_id and name = 'Salud y farmacia' and scope = 'expense';
  select id into v_cat_subs         from public.categories where family_id = v_family_id and name = 'Suscripciones y apps' and scope = 'expense';
  select id into v_cat_ocio         from public.categories where family_id = v_family_id and name = 'Ocio y entretenimiento' and scope = 'expense';
  select id into v_cat_personal     from public.categories where family_id = v_family_id and name = 'Cuidado personal' and scope = 'expense';

  select id into v_fcat_alquiler   from public.categories where family_id = v_family_id and name = 'Alquiler' and scope = 'fixed_expense';
  select id into v_fcat_expensas   from public.categories where family_id = v_family_id and name = 'Expensas' and scope = 'fixed_expense';
  select id into v_fcat_internet   from public.categories where family_id = v_family_id and name = 'Internet, cable y celular' and scope = 'fixed_expense';
  select id into v_fcat_luz        from public.categories where family_id = v_family_id and name = 'Luz y gas' and scope = 'fixed_expense';
  select id into v_fcat_subs_fijo  from public.categories where family_id = v_family_id and name = 'Suscripciones y apps' and scope = 'fixed_expense';
  select id into v_fcat_gym        from public.categories where family_id = v_family_id and name = 'Deportes y bienestar' and scope = 'fixed_expense';

  -- ── 5. Fixed expenses (≈900K mensuales = 36% del sueldo) ────────
  insert into public.fixed_expenses (
    family_id, name, amount, kind, status, frequency, day_of_month, category_id, created_at, next_due_on, notify_days_before
  ) values
    (v_family_id, 'Alquiler',          700000, 'recurring', 'active', 'monthly', 5,  v_fcat_alquiler,  v_two_back_cycle_anchor, v_cycle_anchor + 4,  3),
    (v_family_id, 'Expensas',          120000, 'recurring', 'active', 'monthly', 10, v_fcat_expensas,  v_two_back_cycle_anchor, v_cycle_anchor + 9,  2),
    (v_family_id, 'Internet+celular',   38000, 'recurring', 'active', 'monthly', 15, v_fcat_internet,  v_two_back_cycle_anchor, v_cycle_anchor + 14, 2),
    (v_family_id, 'Luz y gas',          22000, 'recurring', 'active', 'monthly', 18, v_fcat_luz,       v_two_back_cycle_anchor, v_cycle_anchor + 17, 2),
    (v_family_id, 'Streaming',          14000, 'recurring', 'active', 'monthly', 22, v_fcat_subs_fijo, v_two_back_cycle_anchor, v_cycle_anchor + 21, 1),
    (v_family_id, 'Gym',                25000, 'recurring', 'active', 'monthly', 7,  v_fcat_gym,       v_two_back_cycle_anchor, v_cycle_anchor + 6,  2);

  select id into v_fijo_alquiler from public.fixed_expenses where family_id = v_family_id and name = 'Alquiler';
  select id into v_fijo_expensas from public.fixed_expenses where family_id = v_family_id and name = 'Expensas';
  select id into v_fijo_internet from public.fixed_expenses where family_id = v_family_id and name = 'Internet+celular';
  select id into v_fijo_luz      from public.fixed_expenses where family_id = v_family_id and name = 'Luz y gas';
  select id into v_fijo_subs     from public.fixed_expenses where family_id = v_family_id and name = 'Streaming';
  select id into v_fijo_gym      from public.fixed_expenses where family_id = v_family_id and name = 'Gym';

  -- ── 6. Fixed expense payments (history + partial current month) ─
  -- Month -2: all 6 paid. Month -1: all 6 paid. Current month:
  -- alquiler + gym + internet pagos; expensas/luz/streaming pendientes.
  insert into public.fixed_expense_payments (fixed_expense_id, period_month, paid_at, paid_by) values
    (v_fijo_alquiler, v_two_back_cycle_anchor,                    v_two_back_cycle_anchor + 4  + interval '10 hour', v_user_id),
    (v_fijo_expensas, v_two_back_cycle_anchor,                    v_two_back_cycle_anchor + 9  + interval '11 hour', v_user_id),
    (v_fijo_internet, v_two_back_cycle_anchor,                    v_two_back_cycle_anchor + 14 + interval '12 hour', v_user_id),
    (v_fijo_luz,      v_two_back_cycle_anchor,                    v_two_back_cycle_anchor + 17 + interval '13 hour', v_user_id),
    (v_fijo_subs,     v_two_back_cycle_anchor,                    v_two_back_cycle_anchor + 21 + interval '14 hour', v_user_id),
    (v_fijo_gym,      v_two_back_cycle_anchor,                    v_two_back_cycle_anchor + 6  + interval '15 hour', v_user_id),

    (v_fijo_alquiler, v_prev_cycle_anchor,                        v_prev_cycle_anchor + 4  + interval '10 hour',     v_user_id),
    (v_fijo_expensas, v_prev_cycle_anchor,                        v_prev_cycle_anchor + 9  + interval '11 hour',     v_user_id),
    (v_fijo_internet, v_prev_cycle_anchor,                        v_prev_cycle_anchor + 14 + interval '12 hour',     v_user_id),
    (v_fijo_luz,      v_prev_cycle_anchor,                        v_prev_cycle_anchor + 17 + interval '13 hour',     v_user_id),
    (v_fijo_subs,     v_prev_cycle_anchor,                        v_prev_cycle_anchor + 21 + interval '14 hour',     v_user_id),
    (v_fijo_gym,      v_prev_cycle_anchor,                        v_prev_cycle_anchor + 6  + interval '15 hour',     v_user_id),

    -- Current month — partial: alquiler, gym, internet ya pagados
    (v_fijo_alquiler, v_cycle_anchor,                              v_cycle_anchor + 4  + interval '10 hour',          v_user_id),
    (v_fijo_internet, v_cycle_anchor,                              v_cycle_anchor + 14 + interval '12 hour',          v_user_id),
    (v_fijo_gym,      v_cycle_anchor,                              v_cycle_anchor + 6  + interval '15 hour',          v_user_id);

  -- ── 7. Variable expenses across the last 60 days ────────────────
  -- Deterministic-ish distribution: each day, the offset modulo
  -- decides how many expenses, which categories, and amounts. We
  -- aim for ~$22-32K/day average so the cupo math (~$36K/day) shows
  -- a healthy mix of "bajo cupo" and occasional "sobre cupo" days,
  -- plus a handful of $0 days for the no-spend signal.

  v_descriptions := array[
    'Compra del super', 'Café', 'Almuerzo', 'Verduras', 'Pan',
    'Subte', 'Colectivo', 'Uber', 'Nafta', 'Estacionamiento',
    'Farmacia', 'Vitaminas', 'Cine', 'Bar', 'Birra',
    'Spotify', 'Netflix', 'Limpieza', 'Cuaderno', 'Tijera',
    'Pasta dental', 'Shampoo', 'Quiosco', 'Fiambres', 'Helado'
  ];
  v_categories := array[
    v_cat_supermercado, v_cat_general, v_cat_delivery, v_cat_supermercado, v_cat_almacen,
    v_cat_transporte, v_cat_transporte, v_cat_transporte, v_cat_combustible, v_cat_combustible,
    v_cat_salud, v_cat_salud, v_cat_ocio, v_cat_ocio, v_cat_ocio,
    v_cat_subs, v_cat_subs, v_cat_general, v_cat_general, v_cat_personal,
    v_cat_personal, v_cat_personal, v_cat_almacen, v_cat_almacen, v_cat_delivery
  ];

  for v_offset in 1..60 loop
    v_expense_day := v_today - v_offset;
    v_expense_dow := extract(dow from v_expense_day);  -- 0=Sun..6=Sat
    v_seed := (v_offset * 7 + v_expense_dow * 3) % 100;

    -- ~12% no-spend days, ~28% one expense, ~38% two, ~22% three.
    v_expense_count := case
      when v_seed < 12 then 0
      when v_seed < 40 then 1
      when v_seed < 78 then 2
      else 3
    end;

    -- Weekend bias: viernes/sábado tienden a tener un gasto extra
    if v_expense_dow in (5, 6) and v_expense_count > 0 then
      v_expense_count := least(4, v_expense_count + 1);
    end if;

    for i in 1..v_expense_count loop
      v_picked_idx := ((v_offset * 11 + i * 17 + v_expense_dow) % array_length(v_descriptions, 1)) + 1;
      v_picked_cat := v_categories[v_picked_idx];
      v_picked_desc := v_descriptions[v_picked_idx];

      -- Base amount with mild variance. Big-ticket items on first
      -- expense of weekend days (delivery / salidas).
      v_amount := case
        when v_picked_idx between 1 and 5  then 4500 + ((v_offset * 31 + i * 13) % 7) * 1500   -- comida/super 4.5K-15K
        when v_picked_idx between 6 and 10 then 1800 + ((v_offset * 19 + i * 7) % 6) * 1200    -- transporte 1.8K-9K
        when v_picked_idx between 11 and 12 then 3500 + ((v_offset * 13) % 5) * 1500            -- salud 3.5K-10K
        when v_picked_idx between 13 and 15 then 6000 + ((v_offset * 17 + i) % 8) * 2200       -- ocio 6K-22K
        when v_picked_idx between 16 and 17 then 8000                                            -- subs flat
        when v_picked_idx between 18 and 22 then 1200 + ((v_offset * 23) % 5) * 800             -- otros 1.2K-5.2K
        else 2500 + ((v_offset * 29 + i * 11) % 4) * 1500
      end;

      -- Stamp at midday + i*45 minutes so the streak trigger sees
      -- distinct same-day inserts but they all roll into one BA day.
      v_inserted_at := v_expense_day + interval '12 hour' + (i * interval '45 minutes');

      insert into public.expenses (
        family_id, category_id, description, price, created_by, created_at
      ) values (
        v_family_id, v_picked_cat, v_picked_desc, v_amount, v_user_id, v_inserted_at
      );
    end loop;
  end loop;

  -- ── 8. Savings goal ─────────────────────────────────────────────
  insert into public.savings_goals (
    family_id, title, emoji, goal_amount, current_amount, target_months, is_active
  ) values (
    v_family_id, 'Mar del Plata 2027', '🏖️', 1500000, 480000, 8, true
  );

  raise notice 'Seeded control demo account: control.demo@manifiesto.app / family CTRLDEMO';
end $$;
