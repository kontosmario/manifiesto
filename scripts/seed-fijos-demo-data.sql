-- One-off seed for demo data in kontosmario@gmail.com's family.
-- Idempotent: skips if a fijo with the same name already exists.
-- Inserts fijos that mirror the V1 Cuaderno FIJOS_ITEMS design,
-- along with 2 historical expense rows per fijo so the sparkline has
-- data to render. Designed to be run via psql against the remote.

do $$
declare
  v_user_id uuid;
  v_family_id uuid;
  v_today date := current_date;
  v_day integer := extract(day from v_today)::integer;
  v_this_month date := date_trunc('month', v_today)::date;
  v_last_month date := (v_this_month - interval '1 month')::date;
  v_two_months_ago date := (v_this_month - interval '2 months')::date;
  r record;
  v_cat_id uuid;
  v_fijo_id uuid;
begin
  select id into v_user_id
  from auth.users
  where email = 'kontosmario@gmail.com';

  if v_user_id is null then
    raise notice 'kontosmario@gmail.com not found; nothing to seed.';
    return;
  end if;

  select family_id into v_family_id
  from public.family_members
  where user_id = v_user_id
  limit 1;

  if v_family_id is null then
    raise notice 'kontosmario has no family; nothing to seed.';
    return;
  end if;

  raise notice 'Seeding fijos demo data for family %', v_family_id;

  -- Walk the FIJOS_ITEMS design list. `hist` arrays approximate the
  -- sparkline shape (oldest → newest); we store the oldest two as
  -- expense rows (2 months ago + 1 month ago). The current amount
  -- represents the commitment's `amount` today.
  for r in
    select *
    from (values
      ('Alquiler',              'Vivienda',      420000, 5,  'monthly',   'paid',     array[400000, 400000, 420000]),
      ('Expensas',              'Vivienda',       95000, 10, 'monthly',   'paid',     array[88000,  90000,  95000]),
      ('Edenor (luz)',          'Servicios',      32500, 18, 'monthly',   'pending',  array[18000,  28000,  32500]),
      ('Metrogas',              'Servicios',      18400, 22, 'monthly',   'pending',  array[24000,  21000,  18400]),
      ('AySA (agua)',           'Servicios',       8900, 28, 'monthly',   'pending',  array[8900,   8900,   8900]),
      ('Internet Telecentro',   'Servicios',      24500, 15, 'monthly',   'paid',     array[20000,  22000,  24500]),
      ('Netflix',               'Suscripciones',   8900, 7,  'monthly',   'paid',     array[6800,   8900,   8900]),
      ('Spotify Familiar',      'Suscripciones',   5500, 12, 'monthly',   'paid',     array[5500,   5500,   5500]),
      ('Disney+',               'Suscripciones',   4200, 20, 'monthly',   'pending',  array[4200,   4200,   4200]),
      ('iCloud 200GB',          'Suscripciones',   1300, 3,  'monthly',   'paid',     array[900,    1300,   1300]),
      ('Gym Smartfit',          'Suscripciones',  14000, 25, 'monthly',   'pending',  array[14000,  14000,  14000]),
      ('Seguro auto',           'Seguros',        38000, 14, 'monthly',   'paid',     array[34000,  36000,  38000]),
      ('Prepaga Swiss Medical', 'Seguros',       185000, 8,  'monthly',   'paid',     array[160000, 172000, 185000]),
      ('Cuota iPhone',          'Cuotas',         52000, 20, 'monthly',   'pending',  array[52000,  52000,  52000]),
      ('Préstamo Banco',        'Cuotas',         78000, 25, 'monthly',   'pending',  array[78000,  78000,  78000]),
      ('ABL (Impuesto)',        'Impuestos',      22000, 15, 'monthly',   'paid',     array[20000,  21000,  22000]),
      ('Deuda mamá',            'Deudas',         50000, 30, 'monthly',   'pending',  array[50000,  50000,  50000])
    ) as t(name, cat_name, amount, day_of_month, frequency, status, hist)
  loop
    -- Resolve the fixed_expense category id (scope = 'fixed_expense').
    select id into v_cat_id
    from public.categories
    where family_id = v_family_id
      and scope = 'fixed_expense'
      and lower(name) = lower(r.cat_name)
    limit 1;

    if v_cat_id is null then
      raise notice 'Missing fijos category % — skipping %.', r.cat_name, r.name;
      continue;
    end if;

    -- Skip if already seeded.
    select id into v_fijo_id
    from public.fixed_expenses
    where family_id = v_family_id
      and name = r.name;

    if v_fijo_id is not null then
      raise notice 'Already present: % — skipping.', r.name;
      continue;
    end if;

    insert into public.fixed_expenses (
      family_id,
      name,
      amount,
      kind,
      status,
      frequency,
      category_id,
      day_of_month,
      next_due_on,
      last_paid_at
    )
    values (
      v_family_id,
      r.name,
      r.amount,
      'recurring',
      'active',
      r.frequency::text,
      v_cat_id,
      r.day_of_month,
      make_date(
        extract(year from v_today)::integer,
        case when r.day_of_month < v_day then extract(month from v_today)::integer + 1
             else extract(month from v_today)::integer end,
        r.day_of_month
      ),
      case when r.status = 'paid' then (v_today - interval '2 days')::timestamptz else null end
    )
    returning id into v_fijo_id;

    -- Historical expense rows for the sparkline. 2 months ago + 1
    -- month ago. The 3rd point (hist[3]) is the current amount, which
    -- lives on fixed_expenses.amount and isn't duplicated as an
    -- expense — the client appends it when building the trendline.
    insert into public.expenses (
      family_id,
      category_id,
      commitment_id,
      description,
      price,
      created_by,
      created_at
    ) values
      (
        v_family_id,
        v_cat_id,
        v_fijo_id,
        r.name,
        (r.hist)[1],
        v_user_id,
        v_two_months_ago + (r.day_of_month - 1)
      ),
      (
        v_family_id,
        v_cat_id,
        v_fijo_id,
        r.name,
        (r.hist)[2],
        v_user_id,
        v_last_month + (r.day_of_month - 1)
      );

    -- If the status is 'paid' we also record this month's payment —
    -- both in expenses (for the ring's paid slice) and in
    -- fixed_expense_payments (so the commitment is flagged as paid
    -- this cycle in the aggregate).
    if r.status = 'paid' then
      insert into public.expenses (
        family_id,
        category_id,
        commitment_id,
        description,
        price,
        created_by,
        created_at
      ) values (
        v_family_id,
        v_cat_id,
        v_fijo_id,
        r.name,
        r.amount,
        v_user_id,
        v_this_month + (r.day_of_month - 1)
      );

      insert into public.fixed_expense_payments (
        fixed_expense_id,
        period_month,
        paid_by
      )
      values (v_fijo_id, v_this_month, v_user_id)
      on conflict do nothing;
    end if;
  end loop;

  raise notice 'Fijos demo seed complete for family %.', v_family_id;
end;
$$;
