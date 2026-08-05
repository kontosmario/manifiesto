-- One-shot seed for a Home tab QA account (LEGACY — superseded by
-- 20260611000000_seed_apple_review_account.sql for App Store reviewers).
-- Creates `home.test@manifiesto.app` with an initial bootstrap password,
-- a single-member family, finance config, and enough data to exercise
-- every Home Sprint surface (cycle progress bar, top category chip,
-- próximo fijo chip, forecast trend, fijos coverage micro-text).
--
-- Unlike `seed_control_demo_account`, this seed uses the canonical
-- default categories from `category_templates` (the same ones a real
-- new user gets via `bootstrap_family`), so we test against the
-- production category set — not a hand-rolled subset.
--
-- Idempotent: bails if the user already exists.

do $$
declare
  v_user_id uuid;
  v_family_id uuid;
  v_today date := current_date;

  -- Cycle math: salary_payment_day = 1, so the cycle anchor is the
  -- first of the current month. Today (2026-04-29) lands ~28 days
  -- into a 30-day cycle — late mid-cycle, plenty of closed days to
  -- satisfy the top-category gate (≥14 closed days, ≥4 transactions).
  v_cycle_anchor date := date_trunc('month', v_today)::date;
  v_prev_cycle_anchor date := date_trunc('month', v_today - interval '1 month')::date;
  v_two_back_cycle_anchor date := date_trunc('month', v_today - interval '2 months')::date;

  -- Expense category ids (resolved from the consolidated 18-template
  -- set by name — see 20260424160000_consolidate_gastos_categories.sql).
  v_cat_otros uuid;
  v_cat_mercado uuid;
  v_cat_restaurantes uuid;
  v_cat_transporte uuid;
  v_cat_salud uuid;
  v_cat_suscripciones uuid;
  v_cat_ocio uuid;
  v_cat_belleza uuid;
  v_cat_ropa uuid;
  v_cat_servicios_exp uuid;

  -- Fijos category ids (default fixed_expense templates).
  v_fcat_servicios uuid;
  v_fcat_vivienda uuid;
  v_fcat_subs uuid;
  v_fcat_seguros uuid;
  v_fcat_cuotas uuid;

  -- Fijo ids
  v_fijo_alquiler uuid;
  v_fijo_internet uuid;
  v_fijo_spotify uuid;
  v_fijo_prepaga uuid;
  v_fijo_tarjeta uuid;

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
  where email = 'home.test@manifiesto.app';
  if v_user_id is not null then
    raise notice 'home.test@manifiesto.app already exists, skipping seed.';
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
    'home.test@manifiesto.app',
    -- LEGACY initial bootstrap password. This account is no longer used in prod.
    -- New seed (apple.review@manifiestoapp.com) supersedes this one.
    crypt('legacy-bootstrap-do-not-use', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Home QA"}'::jsonb,
    '', '', '', ''
  ) returning id into v_user_id;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', 'home.test@manifiesto.app'),
    'email',
    v_user_id::text,
    now(), now(), now()
  );

  update public.profiles
  set onboarding_completed_at = now(),
      timezone = 'America/Argentina/Buenos_Aires',
      avatar_animal = 'cat'
  where id = v_user_id;

  -- ── 2. Family + membership ──────────────────────────────────────
  insert into public.families (id, code)
  values (gen_random_uuid(), 'HOMETEST')
  returning id into v_family_id;

  insert into public.family_members (family_id, user_id, role)
  values (v_family_id, v_user_id, 'owner');

  -- ── 3. Finance config ───────────────────────────────────────────
  -- 2.5M income · 500K savings · pays salary on the 1st of the month
  -- so the cycle aligns with the calendar month. Salary already
  -- confirmed for current cycle so the home doesn't prompt the
  -- cycle-balance sheet on first open.
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
  -- Seed the canonical default set from category_templates — same
  -- exact set a real new user gets via bootstrap_family().
  insert into public.categories(family_id, template_id, name, scope)
  select v_family_id, t.id, t.name, 'expense'
  from public.category_templates t
  where t.scope = 'expense'
  order by t.sort_order;

  insert into public.categories(family_id, template_id, name, color, scope)
  select
    v_family_id, t.id, t.name,
    case t.name
      when 'Servicios'     then '#E8976A'
      when 'Vivienda'      then '#8DB46A'
      when 'Suscripciones' then '#C9A6E0'
      when 'Seguros'       then '#F2B58A'
      when 'Cuotas'        then '#6B9AD6'
      when 'Impuestos'     then '#C7A96A'
      when 'Deudas'        then '#D96A4F'
      when 'Inversiones'   then '#D9B84F'
      else '#8A8A8A'
    end,
    'fixed_expense'
  from public.category_templates t
  where t.scope = 'fixed_expense'
  order by t.sort_order;

  -- Resolve the consolidated 18-set ids we need for variable-expense seeding.
  select id into v_cat_otros         from public.categories where family_id = v_family_id and scope = 'expense' and lower(name) = lower('Otros');
  select id into v_cat_mercado       from public.categories where family_id = v_family_id and scope = 'expense' and lower(name) = lower('Mercado');
  select id into v_cat_restaurantes  from public.categories where family_id = v_family_id and scope = 'expense' and lower(name) = lower('Restaurantes');
  select id into v_cat_transporte    from public.categories where family_id = v_family_id and scope = 'expense' and lower(name) = lower('Transporte');
  select id into v_cat_salud         from public.categories where family_id = v_family_id and scope = 'expense' and lower(name) = lower('Salud');
  select id into v_cat_suscripciones from public.categories where family_id = v_family_id and scope = 'expense' and lower(name) = lower('Suscripciones');
  select id into v_cat_ocio          from public.categories where family_id = v_family_id and scope = 'expense' and lower(name) = lower('Ocio');
  select id into v_cat_belleza       from public.categories where family_id = v_family_id and scope = 'expense' and lower(name) = lower('Belleza');
  select id into v_cat_ropa          from public.categories where family_id = v_family_id and scope = 'expense' and lower(name) = lower('Ropa');
  select id into v_cat_servicios_exp from public.categories where family_id = v_family_id and scope = 'expense' and lower(name) = lower('Servicios');

  select id into v_fcat_servicios from public.categories where family_id = v_family_id and scope = 'fixed_expense' and lower(name) = lower('Servicios');
  select id into v_fcat_vivienda  from public.categories where family_id = v_family_id and scope = 'fixed_expense' and lower(name) = lower('Vivienda');
  select id into v_fcat_subs      from public.categories where family_id = v_family_id and scope = 'fixed_expense' and lower(name) = lower('Suscripciones');
  select id into v_fcat_seguros   from public.categories where family_id = v_family_id and scope = 'fixed_expense' and lower(name) = lower('Seguros');
  select id into v_fcat_cuotas    from public.categories where family_id = v_family_id and scope = 'fixed_expense' and lower(name) = lower('Cuotas');

  -- ── 5. Fixed expenses (≈900K mensuales = 36% del sueldo) ────────
  -- next_due_on is computed off `today` so the chip ranking stays
  -- meaningful regardless of when the migration runs:
  --   • Spotify     → today + 1   (mañana, "imminent peach" state)
  --   • Tarjeta     → today + 5
  --   • Prepaga     → today + 8
  --   • Internet    → today + 11
  --   • Alquiler    → today + 14  (edge of the 14-day horizon)
  --
  -- The próximo-fijo chip therefore picks up Spotify ("Mañana") and
  -- the imminent-tone branch of the icon. The fijos coverage
  -- micro-text uses cobertura = (sum-fijos / daily-income), which
  -- with these values lands around 11 of 30 días.
  insert into public.fixed_expenses (
    family_id, name, amount, kind, status, frequency,
    day_of_month, category_id, created_at, next_due_on, notify_days_before
  ) values
    (v_family_id, 'Alquiler',         700000, 'recurring', 'active', 'monthly',
       extract(day from v_today + 14)::int, v_fcat_vivienda,  v_two_back_cycle_anchor,
       v_today + 14, 3),
    (v_family_id, 'Internet+celular',  38000, 'recurring', 'active', 'monthly',
       extract(day from v_today + 11)::int, v_fcat_servicios, v_two_back_cycle_anchor,
       v_today + 11, 2),
    (v_family_id, 'Prepaga',           95000, 'recurring', 'active', 'monthly',
       extract(day from v_today + 8)::int,  v_fcat_seguros,   v_two_back_cycle_anchor,
       v_today + 8,  2),
    (v_family_id, 'Tarjeta Visa',      45000, 'recurring', 'active', 'monthly',
       extract(day from v_today + 5)::int,  v_fcat_cuotas,    v_two_back_cycle_anchor,
       v_today + 5,  2),
    (v_family_id, 'Spotify',           14000, 'recurring', 'active', 'monthly',
       extract(day from v_today + 1)::int,  v_fcat_subs,      v_two_back_cycle_anchor,
       v_today + 1,  1);

  select id into v_fijo_alquiler from public.fixed_expenses where family_id = v_family_id and name = 'Alquiler';
  select id into v_fijo_internet from public.fixed_expenses where family_id = v_family_id and name = 'Internet+celular';
  select id into v_fijo_spotify  from public.fixed_expenses where family_id = v_family_id and name = 'Spotify';
  select id into v_fijo_prepaga  from public.fixed_expenses where family_id = v_family_id and name = 'Prepaga';
  select id into v_fijo_tarjeta  from public.fixed_expenses where family_id = v_family_id and name = 'Tarjeta Visa';

  -- ── 6. Fixed expense payments (history only, current cycle pending) ─
  -- Two prior cycles fully paid → forecast engine sees a stable
  -- baseline. Current cycle: nothing paid yet, so the Fijos panel
  -- still has actionable items (matches the próximo-fijo chip).
  insert into public.fixed_expense_payments (fixed_expense_id, period_month, paid_at, paid_by) values
    (v_fijo_alquiler, v_two_back_cycle_anchor, v_two_back_cycle_anchor + 4  + interval '10 hour', v_user_id),
    (v_fijo_internet, v_two_back_cycle_anchor, v_two_back_cycle_anchor + 11 + interval '11 hour', v_user_id),
    (v_fijo_prepaga,  v_two_back_cycle_anchor, v_two_back_cycle_anchor + 8  + interval '12 hour', v_user_id),
    (v_fijo_tarjeta,  v_two_back_cycle_anchor, v_two_back_cycle_anchor + 5  + interval '13 hour', v_user_id),
    (v_fijo_spotify,  v_two_back_cycle_anchor, v_two_back_cycle_anchor + 1  + interval '14 hour', v_user_id),

    (v_fijo_alquiler, v_prev_cycle_anchor, v_prev_cycle_anchor + 4  + interval '10 hour', v_user_id),
    (v_fijo_internet, v_prev_cycle_anchor, v_prev_cycle_anchor + 11 + interval '11 hour', v_user_id),
    (v_fijo_prepaga,  v_prev_cycle_anchor, v_prev_cycle_anchor + 8  + interval '12 hour', v_user_id),
    (v_fijo_tarjeta,  v_prev_cycle_anchor, v_prev_cycle_anchor + 5  + interval '13 hour', v_user_id),
    (v_fijo_spotify,  v_prev_cycle_anchor, v_prev_cycle_anchor + 1  + interval '14 hour', v_user_id);

  -- ── 7. Variable expenses across the last 45 days ────────────────
  -- 45 days covers the full prior cycle + most of the current cycle,
  -- which:
  --   • gives the forecast engine ≥30 days of history (Sprint 3),
  --   • lands ~25-28 closed days of current cycle, satisfying the
  --     top-category gate (≥14 closed days, ≥4 transactions),
  --   • produces a Supermercado-heavy distribution so the Top
  --     category chip has a clear winner.
  --
  -- The skew is intentional: we want a recognisable winner, not a
  -- dead heat — otherwise the chip would show whichever category
  -- happened to win by 1 transaction.

  -- 25 (description, category) pairs. The category column is heavily
  -- biased toward Mercado so the Top-category chip has a clear winner
  -- after the cycle accumulates ≥4 transactions in that bucket.
  v_descriptions := array[
    'Compra del super', 'Café', 'Almuerzo', 'Verduras', 'Pan',
    'Subte', 'Colectivo', 'Uber', 'Nafta', 'Estacionamiento',
    'Farmacia', 'Vitaminas', 'Cine', 'Bar', 'Birra',
    'Spotify recarga', 'Limpieza', 'Cuaderno', 'Tijera',
    'Pasta dental', 'Shampoo', 'Quiosco', 'Fiambres', 'Helado',
    'Remera'
  ];
  v_categories := array[
    v_cat_mercado,       v_cat_otros,        v_cat_restaurantes, v_cat_mercado,      v_cat_mercado,
    v_cat_transporte,    v_cat_transporte,   v_cat_transporte,   v_cat_transporte,   v_cat_transporte,
    v_cat_salud,         v_cat_salud,        v_cat_ocio,         v_cat_ocio,         v_cat_ocio,
    v_cat_suscripciones, v_cat_otros,        v_cat_otros,        v_cat_belleza,
    v_cat_belleza,       v_cat_belleza,      v_cat_mercado,      v_cat_mercado,      v_cat_restaurantes,
    v_cat_ropa
  ];

  for v_offset in 1..45 loop
    v_expense_day := v_today - v_offset;
    v_expense_dow := extract(dow from v_expense_day);  -- 0=Sun..6=Sat
    v_seed := (v_offset * 7 + v_expense_dow * 3) % 100;

    -- ~10% no-spend, ~30% one expense, ~40% two, ~20% three.
    v_expense_count := case
      when v_seed < 10 then 0
      when v_seed < 40 then 1
      when v_seed < 80 then 2
      else 3
    end;

    -- Weekend bias.
    if v_expense_dow in (5, 6) and v_expense_count > 0 then
      v_expense_count := least(4, v_expense_count + 1);
    end if;

    for i in 1..v_expense_count loop
      v_picked_idx := ((v_offset * 11 + i * 17 + v_expense_dow) % array_length(v_descriptions, 1)) + 1;
      v_picked_cat := v_categories[v_picked_idx];
      v_picked_desc := v_descriptions[v_picked_idx];

      v_amount := case
        when v_picked_idx between 1 and 5  then 4500 + ((v_offset * 31 + i * 13) % 7) * 1500
        when v_picked_idx between 6 and 10 then 1800 + ((v_offset * 19 + i * 7) % 6) * 1200
        when v_picked_idx between 11 and 12 then 3500 + ((v_offset * 13) % 5) * 1500
        when v_picked_idx between 13 and 15 then 6000 + ((v_offset * 17 + i) % 8) * 2200
        when v_picked_idx = 16             then 8000
        when v_picked_idx between 17 and 21 then 1200 + ((v_offset * 23) % 5) * 800
        when v_picked_idx = 25             then 14000 + ((v_offset * 7) % 4) * 5000
        else 2500 + ((v_offset * 29 + i * 11) % 4) * 1500
      end;

      v_inserted_at := v_expense_day + interval '12 hour' + (i * interval '45 minutes');

      insert into public.expenses (
        family_id, category_id, description, price, created_by, created_at
      ) values (
        v_family_id, v_picked_cat, v_picked_desc, v_amount, v_user_id, v_inserted_at
      );
    end loop;
  end loop;

  -- ── 7b. Cleanup: undo unintended current-cycle fijo artefacts ──
  -- Inserting the fijos + their prior-cycle payments side-effects:
  --   • 5 extra rows in `fixed_expense_payments` (period_month=current
  --     cycle) created at seed time.
  --   • 5 expense rows linked via `commitment_id`, also at seed time.
  --   • 5 advances of `fixed_expenses.next_due_on` rolling each fijo
  --     forward by one frequency step (e.g., Spotify originally seeded
  --     at today+1 ends up at today+31).
  --
  -- We undo all three so the seeded state matches the spec
  -- ("current cycle: nothing paid yet, next due dates intact"),
  -- regardless of which background process triggered the cascade.

  delete from public.expenses
  where family_id = v_family_id
    and commitment_id is not null
    and created_at >= v_cycle_anchor::timestamptz;

  delete from public.fixed_expense_payments
  where fixed_expense_id in (
    v_fijo_alquiler, v_fijo_internet, v_fijo_spotify,
    v_fijo_prepaga, v_fijo_tarjeta
  )
    and period_month = v_cycle_anchor;

  -- Reset next_due_on (and day_of_month) to the originally intended
  -- offsets so the próximo-fijo chip and the chip date math line up
  -- with the seed's documented horizon (Spotify mañana, Tarjeta +5d,
  -- Prepaga +8d, Internet +11d, Alquiler +14d).
  update public.fixed_expenses
  set next_due_on = v_today + 1,
      day_of_month = extract(day from v_today + 1)::int
  where id = v_fijo_spotify;

  update public.fixed_expenses
  set next_due_on = v_today + 5,
      day_of_month = extract(day from v_today + 5)::int
  where id = v_fijo_tarjeta;

  update public.fixed_expenses
  set next_due_on = v_today + 8,
      day_of_month = extract(day from v_today + 8)::int
  where id = v_fijo_prepaga;

  update public.fixed_expenses
  set next_due_on = v_today + 11,
      day_of_month = extract(day from v_today + 11)::int
  where id = v_fijo_internet;

  update public.fixed_expenses
  set next_due_on = v_today + 14,
      day_of_month = extract(day from v_today + 14)::int
  where id = v_fijo_alquiler;

  -- ── 8. Savings goal (so the home savings card has a target) ─────
  insert into public.savings_goals (
    family_id, title, emoji, goal_amount, current_amount, target_months, is_active
  ) values (
    v_family_id, 'Vacaciones 2027', '✈️', 1200000, 320000, 10, true
  );

  raise notice 'Seeded home test account: home.test@manifiesto.app / family HOMETEST';
end $$;
