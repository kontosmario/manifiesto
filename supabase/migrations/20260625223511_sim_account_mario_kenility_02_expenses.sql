DO $$
DECLARE
  v_family uuid := '3d7f2031-50c9-47fa-8892-2b4cf95043ad';
  v_mario  uuid := 'ba9dd732-9434-4874-8021-66334dd98726';
  v_partner uuid;
  v_join  date := '2026-03-12';
  v_today date := '2026-06-25';
  cat_ids uuid[] := ARRAY[
    '25bd69c9-b07f-4038-8eb0-07312df58b95','25bd69c9-b07f-4038-8eb0-07312df58b95','25bd69c9-b07f-4038-8eb0-07312df58b95',
    '13ec1612-e1e1-45b9-ad20-0f502e9361b1','13ec1612-e1e1-45b9-ad20-0f502e9361b1','13ec1612-e1e1-45b9-ad20-0f502e9361b1',
    '6f85d09e-5c3e-4012-b340-963c62239d24','6f85d09e-5c3e-4012-b340-963c62239d24','6f85d09e-5c3e-4012-b340-963c62239d24',
    '9c7be928-3d66-4cbe-8f3a-2f71f246f27b','29a1f76f-3035-4d8b-9aec-6033d0ffae00','fd6f7c76-c48e-42d8-87b2-f879c0425753',
    '2cb5b507-8ce3-498c-b38d-497d00db02f7','70e9bbe7-60c9-46b8-bace-6aeac7a0eacf','653b3003-d628-4ae8-98ee-1e24466a8443']::uuid[];
  descs text[] := ARRAY['Supermercado','Verdulería','Carnicería','SUBE','Uber','Nafta','Café','Almuerzo',
    'Delivery PedidosYa','Salida','Farmacia','Ropa','Tecnología','Servicio','Varios'];
  los int[] := ARRAY[28000,7000,18000,3000,6000,38000,4500,11000,14000,25000,8000,35000,22000,12000,5000];
  his int[] := ARRAY[95000,26000,55000,8000,24000,72000,13000,38000,46000,90000,36000,145000,130000,48000,28000];
  d date; n int; i int; idx int; amt numeric; by_user uuid; ts timestamptz; hh int;
  fe record; mo date; pay date;
BEGIN
  -- Guard de reproducibilidad: ver 20260625223322_sim_account_mario_kenility_01_setup.
  IF NOT EXISTS (SELECT 1 FROM public.families WHERE id = v_family) THEN
    RAISE NOTICE 'sim_account_kenility_02: familia demo ausente, se omite (esperado fuera de prod)';
    RETURN;
  END IF;

  SELECT user_id INTO v_partner FROM public.family_members WHERE family_id=v_family AND role='member' LIMIT 1;

  -- variable expenses, ~88% of days (the rest are no-spend → garden gaps)
  FOR d IN SELECT generate_series('2026-02-22'::date, v_today, '1 day')::date LOOP
    IF random() < 0.12 THEN CONTINUE; END IF;
    n := 1 + floor(random()*2.6)::int;             -- 1..3 per day
    FOR i IN 1..n LOOP
      idx := 1 + floor(power(random(),1.6) * array_length(cat_ids,1))::int;  -- skew to everyday
      IF idx > 15 THEN idx := 15; END IF;
      amt := round((los[idx] + random()*(his[idx]-los[idx]))/100)*100;
      by_user := CASE WHEN d < v_join THEN v_mario
                      WHEN random() < 0.30 THEN v_partner ELSE v_mario END;
      hh := 8 + floor(random()*14)::int;
      ts := (d::timestamp + (hh||' hours')::interval + (floor(random()*60)||' minutes')::interval)
            AT TIME ZONE 'America/Argentina/Cordoba';
      INSERT INTO public.expenses(family_id, category_id, description, price, created_by, created_at)
      VALUES (v_family, cat_ids[idx], descs[idx], amt, by_user, ts);
    END LOOP;
  END LOOP;

  -- fixed payments (commitment_id) for Mar..Jun on each fijo's day_of_month
  FOR fe IN SELECT id, name, amount, category_id, day_of_month FROM public.fixed_expenses WHERE family_id=v_family LOOP
    FOR mo IN SELECT generate_series('2026-03-01'::date, '2026-06-01'::date, '1 month')::date LOOP
      pay := date_trunc('month', mo)::date + (fe.day_of_month - 1);
      IF pay <= v_today THEN
        INSERT INTO public.expenses(family_id, category_id, description, price, created_by, commitment_id, created_at)
        VALUES (v_family, fe.category_id, fe.name, fe.amount, v_mario, fe.id,
                (pay::timestamp + interval '9 hours') AT TIME ZONE 'America/Argentina/Cordoba');
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.fixed_expenses fx SET
     last_paid_at = (SELECT max(created_at) FROM public.expenses e WHERE e.commitment_id=fx.id),
     last_used_at = (SELECT max(created_at) FROM public.expenses e WHERE e.commitment_id=fx.id)
   WHERE fx.family_id=v_family;

  -- a few extra incomes
  INSERT INTO public.income_events(family_id, created_by, amount, kind, description, event_date, created_at) VALUES
    (v_family, v_mario,   850000,'bonus','Bono trimestral',        '2026-04-18','2026-04-18 12:00:00-03'),
    (v_family, v_partner, 320000,'gift', 'Regalo de cumpleaños',   '2026-05-09','2026-05-09 12:00:00-03'),
    (v_family, v_mario,  1200000,'bonus','Adelanto de aguinaldo',  '2026-06-15','2026-06-15 12:00:00-03');
END $$;
