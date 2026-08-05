-- Enrichment seed for the demo account so the Asistente Financiero
-- can fire as many of its 22 active signals as possible. Layers on
-- top of `20260427180000_seed_control_demo_account.sql` — that one
-- creates the user/family/finance/categories/fijos plus 60 days of
-- variable expenses; this migration adds:
--
--   1. A second family member (`control.demo.partner@manifiesto.app`)
--      so `member-imbalance` can compute a meaningful split.
--   2. Three same-amount discretionary expenses on different days →
--      `undetected-sub` (suscripción no registrada).
--   3. Today's discretionary spend pushing the user over today's cupo
--      → `recovery-path`.
--   4. Bumped Ocio expenses in the last 7 days → `cat-accel` (with
--      spike-vs-trend variant).
--   5. `next_due_on` for 3 fijos rolled forward into the next 7 days
--      → `stress-week`.
--   6. `velocity_snapshots` row for today with `stress_level='warn'`
--      → `velocity-warning`.
--   7. `category_limits` row for "Ocio y entretenimiento" with a low
--      cap currently breached → `cap-breach`.
--   8. `user_streaks` row with `current_streak = 5` → `streak-ok`.
--   9. One `zombie_alert` and one `price_hike` notification → both
--      surface as advisor cards.
--  10. Tweak the two-back monthly_summary's `monthly_income` so the
--      3-month average diverges from current → `income-volatility`.
--
-- Idempotent via sentinel: presence of the partner user.

do $$
declare
  v_user_id uuid;
  v_partner_id uuid;
  v_family_id uuid;
  v_today date := current_date;
  v_cycle_anchor date := date_trunc('month', v_today)::date;
  v_two_back_cycle_anchor date := date_trunc('month', v_today - interval '2 months')::date;

  v_cat_ocio uuid;
  v_cat_subs uuid;
  v_cat_delivery uuid;
  v_cat_supermercado uuid;
  v_cat_general uuid;

  v_fijo_alquiler uuid;
  v_fijo_expensas uuid;
  v_fijo_internet uuid;
  v_fijo_luz uuid;
  v_fijo_subs uuid;
  v_fijo_gym uuid;

  v_offset int;
begin
  -- Guard de reproducibilidad: los seeds de cuentas demo solo corren si se piden
  -- explícitamente. En prod ya se aplicaron (y sus cuentas fueron dadas de baja);
  -- en una base nueva (local o staging) el dato de desarrollo viene de
  -- supabase/seed.sql, no de migraciones. Ver docs/operaciones/ambiente-dev.md.
  if coalesce(current_setting('manifiesto.seed_demo_accounts', true), 'off') <> 'on' then
    raise notice 'seed de cuenta demo omitido (activar con: set manifiesto.seed_demo_accounts = ''on'')';
    return;
  end if;

  -- ── Resolve demo user and family ───────────────────────────────
  select id into v_user_id
  from auth.users
  where email = 'control.demo@manifiesto.app';
  if v_user_id is null then
    raise notice 'control.demo not seeded yet — skipping advisor enrichment.';
    return;
  end if;

  select family_id into v_family_id
  from public.family_members
  where user_id = v_user_id
  limit 1;
  if v_family_id is null then
    raise notice 'control.demo has no family — skipping advisor enrichment.';
    return;
  end if;

  -- ── Idempotency sentinel ───────────────────────────────────────
  select id into v_partner_id
  from auth.users
  where email = 'control.demo.partner@manifiesto.app';
  if v_partner_id is not null then
    raise notice 'advisor enrichment already applied — skipping.';
    return;
  end if;

  -- ── Resolve categories used below ──────────────────────────────
  select id into v_cat_ocio        from public.categories where family_id = v_family_id and name = 'Ocio y entretenimiento'  and scope = 'expense';
  select id into v_cat_subs        from public.categories where family_id = v_family_id and name = 'Suscripciones y apps'    and scope = 'expense';
  select id into v_cat_delivery    from public.categories where family_id = v_family_id and name = 'Delivery y salidas'      and scope = 'expense';
  select id into v_cat_supermercado from public.categories where family_id = v_family_id and name = 'Supermercado'           and scope = 'expense';
  select id into v_cat_general     from public.categories where family_id = v_family_id and name = 'Gastos generales'        and scope = 'expense';

  select id into v_fijo_alquiler from public.fixed_expenses where family_id = v_family_id and name = 'Alquiler';
  select id into v_fijo_expensas from public.fixed_expenses where family_id = v_family_id and name = 'Expensas';
  select id into v_fijo_internet from public.fixed_expenses where family_id = v_family_id and name = 'Internet+celular';
  select id into v_fijo_luz      from public.fixed_expenses where family_id = v_family_id and name = 'Luz y gas';
  select id into v_fijo_subs     from public.fixed_expenses where family_id = v_family_id and name = 'Streaming';
  select id into v_fijo_gym      from public.fixed_expenses where family_id = v_family_id and name = 'Gym';

  -- ── 1. Second family member ────────────────────────────────────
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
    'control.demo.partner@manifiesto.app',
    crypt('ControlDemo2026', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Control Demo Partner"}'::jsonb,
    '', '', '', ''
  ) returning id into v_partner_id;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_partner_id,
    jsonb_build_object('sub', v_partner_id::text, 'email', 'control.demo.partner@manifiesto.app'),
    'email',
    v_partner_id::text,
    now(), now(), now()
  );

  update public.profiles
  set onboarding_completed_at = now(),
      timezone = 'America/Argentina/Buenos_Aires',
      avatar_animal = 'cat'
  where id = v_partner_id;

  insert into public.family_members (family_id, user_id, role)
  values (v_family_id, v_partner_id, 'member')
  on conflict do nothing;

  -- A handful of small expenses attributed to the partner so
  -- member-imbalance kicks in (owner ends up with ≥ 80% of the cycle).
  insert into public.expenses (family_id, category_id, description, price, created_by, created_at) values
    (v_family_id, v_cat_supermercado, 'Verdulería',  6_400, v_partner_id, v_cycle_anchor + interval '8 day 11 hour'),
    (v_family_id, v_cat_delivery,     'Helado',      4_200, v_partner_id, v_cycle_anchor + interval '12 day 19 hour'),
    (v_family_id, v_cat_general,      'Pan',         2_800, v_partner_id, v_cycle_anchor + interval '15 day 9 hour'),
    (v_family_id, v_cat_supermercado, 'Yerba',       3_900, v_partner_id, v_cycle_anchor + interval '18 day 16 hour');

  -- ── 2. Undetected subscription pattern (3× $8.500 disc.) ───────
  -- Three different days, same exact amount, no commitment_id —
  -- exactly the heuristic for `undetected-sub`. Distributed across
  -- the current cycle so the buckets-by-day check passes.
  insert into public.expenses (family_id, category_id, description, price, created_by, created_at) values
    (v_family_id, v_cat_subs, 'Cargo plataforma', 8_500, v_user_id, v_cycle_anchor + interval '3 day 10 hour'),
    (v_family_id, v_cat_subs, 'Cargo plataforma', 8_500, v_user_id, v_cycle_anchor + interval '13 day 10 hour'),
    (v_family_id, v_cat_subs, 'Cargo plataforma', 8_500, v_user_id, v_cycle_anchor + interval '23 day 10 hour');

  -- ── 3. Bumped Ocio expenses in last 7 days (cat-accel + spike) ─
  -- These force the top-cat to be Ocio, with ≥70% of the cycle's
  -- Ocio spend concentrated in the last 7 days → spike branch of
  -- cat-accel (copy: "puede ser un gasto puntual").
  for v_offset in 0..6 loop
    insert into public.expenses (family_id, category_id, description, price, created_by, created_at)
    values (
      v_family_id,
      v_cat_ocio,
      case when v_offset % 2 = 0 then 'Cena con amigos' else 'Bar' end,
      18_000 + (v_offset * 1500),
      v_user_id,
      (v_today - v_offset) + interval '21 hour'
    );
  end loop;

  -- ── 4. Today's overspend (recovery-path) ───────────────────────
  -- Aim for ~$80K today: cupo diario ≈ $32K (2.0M libre / 30 días),
  -- so this lands the user at >2× cupo for today → recovery-path
  -- with delta < 0 + diasRestantes > 1.
  insert into public.expenses (family_id, category_id, description, price, created_by, created_at) values
    (v_family_id, v_cat_delivery, 'Almuerzo trabajo', 14_500, v_user_id, v_today + interval '13 hour'),
    (v_family_id, v_cat_ocio,     'Café con amigo',    7_800, v_user_id, v_today + interval '17 hour'),
    (v_family_id, v_cat_delivery, 'Cena delivery',    32_400, v_user_id, v_today + interval '21 hour 15 minutes'),
    (v_family_id, v_cat_general,  'Cargador celular', 28_900, v_user_id, v_today + interval '15 hour');

  -- ── 5. Roll fijos' next_due_on into the next 7 days ────────────
  -- 3 fijos due in 1, 3 and 5 days from today → stress-week fires
  -- regardless of when this migration runs.
  update public.fixed_expenses
  set next_due_on = v_today + 1
  where id = v_fijo_expensas;
  update public.fixed_expenses
  set next_due_on = v_today + 3
  where id = v_fijo_luz;
  update public.fixed_expenses
  set next_due_on = v_today + 5
  where id = v_fijo_subs;

  -- ── 6. Velocity snapshot — stress_level=warn ──────────────────
  insert into public.velocity_snapshots (
    family_id, snapshot_date,
    avg_daily_last_7, avg_daily_last_30,
    momentum, forecast_close_amount, stress_level
  ) values (
    v_family_id, v_today,
    52_000, 31_500,
    1.65,    -- 65% faster than 30-day average
    2_350_000,
    'warn'
  )
  on conflict (family_id, snapshot_date) do update set
    avg_daily_last_7 = excluded.avg_daily_last_7,
    avg_daily_last_30 = excluded.avg_daily_last_30,
    momentum = excluded.momentum,
    forecast_close_amount = excluded.forecast_close_amount,
    stress_level = excluded.stress_level;

  -- ── 7. Category cap on Ocio (50K) — already breached ───────────
  insert into public.category_limits (
    family_id, category_id, monthly_cap, warning_threshold_pct
  ) values (
    v_family_id, v_cat_ocio, 50_000, 75
  )
  on conflict (family_id, category_id) do update set
    monthly_cap = excluded.monthly_cap,
    warning_threshold_pct = excluded.warning_threshold_pct;

  -- ── 8. Streak — 5 days on cycle ────────────────────────────────
  insert into public.user_streaks (
    family_id, user_id,
    current_streak, longest_streak, total_days_logged,
    last_logged_date, freeze_tokens, days_since_last_token_grant
  ) values (
    v_family_id, v_user_id,
    5, 12, 28,
    v_today,
    1, 3
  )
  on conflict (family_id, user_id) do update set
    current_streak = excluded.current_streak,
    longest_streak = greatest(public.user_streaks.longest_streak, excluded.longest_streak),
    total_days_logged = excluded.total_days_logged,
    last_logged_date = excluded.last_logged_date,
    freeze_tokens = excluded.freeze_tokens;

  -- ── 9. Notifications — zombie + price-hike ─────────────────────
  -- zombie_alert: streaming hasn't been opened in 60+ days.
  perform public.emit_notification(
    v_family_id, v_user_id,
    'Streaming no la venís usando',
    'Hace 64 días que no abrís Streaming. Cancelarla te ahorraría $168.000 al año.',
    'zombie_alert',
    'warning',
    null,
    jsonb_build_object(
      'fixed_expense_id', v_fijo_subs,
      'name', 'Streaming',
      'amount', 14000,
      'days_unused', 64,
      'route', '/(app)/add-fixed-expense?id=' || v_fijo_subs
    )
  );

  -- price_hike: gym price went up 22%.
  perform public.emit_notification(
    v_family_id, v_user_id,
    'Gym subió 22%',
    'Pasó de $20.500 a $25.000. Si comparás otros gimnasios, podés ahorrar.',
    'price_hike',
    'info',
    null,
    jsonb_build_object(
      'fixed_expense_id', v_fijo_gym,
      'name', 'Gym',
      'previous_amount', 20500,
      'new_amount', 25000,
      'delta_pct', 21.95,
      'route', '/(app)/add-fixed-expense?id=' || v_fijo_gym
    )
  );

  -- ── 10. Income volatility — tweak two-back summary's income ────
  -- Move the two-back cycle's stored income to 2.0M (vs current
  -- 2.5M). 3-month avg diverges by >10% → income-volatility fires
  -- with the "your income is up" branch.
  update public.monthly_summaries
  set monthly_income = 2_000_000
  where family_id = v_family_id
    and period_start = v_two_back_cycle_anchor;

  raise notice 'Advisor enrichment applied: partner user, undetected-sub trio, today overspend, Ocio bump, fijos in 7d, velocity warn, Ocio cap breach, racha=5, zombie+hike notifs, income variance.';
end $$;
