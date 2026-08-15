-- ═══════════════════════════════════════════════════════════════════
-- SEED DE QA — deuda por cuotas (Fijos) + movimientos de ediciones
-- cerradas (Gastos).  Integración del 2026-08-14.
--
-- CÓMO SE USA
--   1. Poné el email de la cuenta de QA en v_email (abajo).
--   2. Corré el archivo ENTERO (una sola transacción implícita).
--   3. Abrí la app con esa cuenta y seguí el checklist del final.
--   4. Para dejar la cuenta como estaba: scripts/qa/teardown-qa-fijos-y-ediciones.sql
--
-- QUÉ CREA (todo prefijado 'QA ·' para poder borrarlo después)
--   Fijos:      F1..F6, un escenario por regla del bundle
--   Ediciones:  E1 (cerrada CON movimientos)  ·  E2 (cerrada purgada)
--
-- SEGURO DE RE-CORRER: borra su propio rastro antes de sembrar.
-- NO toca datos que no haya creado él mismo.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  -- ─── CONFIGURÁ ESTO ──────────────────────────────────────────────
  v_email text := 'ciclo.extendido@manifiestoapp.com';
  -- ─────────────────────────────────────────────────────────────────

  v_user   uuid;
  v_family uuid;
  v_cat    uuid;
  v_cat2   uuid;
  v_fijo   uuid;
  v_hoy    date := current_date;
  -- Ventana de la edición cerrada E1: el mes calendario anterior.
  v_e1_ini date := date_trunc('month', v_hoy - interval '1 month')::date;
  v_e1_fin date := date_trunc('month', v_hoy)::date;          -- exclusivo
  -- Ventana de E2 (purgada): dos meses atrás.
  v_e2_ini date := date_trunc('month', v_hoy - interval '2 months')::date;
  v_e2_fin date := date_trunc('month', v_hoy - interval '1 month')::date;
  v_dia    date;
  v_total  numeric := 0;
  v_n      int := 0;
begin
  select id into v_user from auth.users where email = v_email;
  if v_user is null then
    raise exception 'No existe el usuario %. Cambiá v_email.', v_email;
  end if;

  select family_id into v_family
  from public.family_members where user_id = v_user
  order by (role = 'owner') desc limit 1;
  if v_family is null then
    raise exception 'El usuario % no pertenece a ninguna familia.', v_email;
  end if;

  select id into v_cat  from public.categories order by name limit 1;
  select id into v_cat2 from public.categories order by name desc limit 1;

  -- ─── LIMPIEZA DE UN RUN ANTERIOR ────────────────────────────────
  delete from public.fixed_expense_payments
   where fixed_expense_id in (
     select id from public.fixed_expenses
      where family_id = v_family and name like 'QA ·%');
  delete from public.expenses
   where family_id = v_family and description like 'QA ·%';
  delete from public.fixed_expenses
   where family_id = v_family and name like 'QA ·%';
  delete from public.monthly_summaries
   where family_id = v_family and period_label like 'QA ·%';

  -- ═══ FIJOS ══════════════════════════════════════════════════════

  -- F1 · mensual con 3 cuotas vencidas.
  --     Esperado: tab Vencidos, chip "Debes 3 cuotas", monto = 3 × $12.000.
  --     Pagalo 3 veces: 3 → 2 → 1 → pasa a Pagados.
  insert into public.fixed_expenses
    (family_id, name, amount, kind, status, frequency, category_id,
     next_due_on, day_of_month)
  values
    (v_family, 'QA · F1 mensual con 3 cuotas', 12000, 'recurring', 'active',
     'monthly', v_cat, (v_hoy - interval '3 months')::date,
     extract(day from v_hoy)::smallint);

  -- F2 · SEMANAL vencido hace 3 semanas.
  --     Esperado: VENCIDO **sin** contador de cuotas (el backend solo deja
  --     pagar una cuota por mes calendario, así que no se anuncia deuda
  --     múltiple). Pagalo una vez: debe aceptar. Un segundo pago en el
  --     mismo mes rebota — eso es correcto, no es un bug.
  insert into public.fixed_expenses
    (family_id, name, amount, kind, status, frequency, category_id,
     next_due_on, day_of_month)
  values
    (v_family, 'QA · F2 semanal vencido', 3500, 'recurring', 'active',
     'weekly', v_cat, (v_hoy - interval '21 days')::date,
     extract(day from v_hoy)::smallint);

  -- F3 · mensual PAGADO este mes, al día.
  --     Esperado: tab Pagados. Editalo (cambiá el monto o el día) y
  --     confirmá que NO reaparece como pendiente. Éste es el bug viejo.
  insert into public.fixed_expenses
    (family_id, name, amount, kind, status, frequency, category_id,
     next_due_on, day_of_month, last_paid_at)
  values
    (v_family, 'QA · F3 pagado, editalo', 8000, 'recurring', 'active',
     'monthly', v_cat, (v_hoy + interval '1 month')::date,
     extract(day from v_hoy)::smallint, now())
  returning id into v_fijo;
  insert into public.fixed_expense_payments
    (fixed_expense_id, period_month, paid_at, paid_by)
  values (v_fijo, date_trunc('month', v_hoy)::date, now(), v_user);

  -- F4 · TRIMESTRAL pagado por adelantado (próxima cuota en 2 meses).
  --     Esperado: sigue "Pagado" (regla de cobertura). No-regresión.
  insert into public.fixed_expenses
    (family_id, name, amount, kind, status, frequency, category_id,
     next_due_on, day_of_month, last_paid_at)
  values
    (v_family, 'QA · F4 trimestral adelantado', 25000, 'recurring', 'active',
     'quarterly', v_cat2, (v_hoy + interval '2 months')::date,
     extract(day from v_hoy)::smallint, now() - interval '10 days');

  -- F5 · EN CUOTAS: 10 de 12 pagadas (quedan 2) pero 4 meses de atraso.
  --     Esperado: el contador NO dice 4 — se capea a las 2 que quedan.
  insert into public.fixed_expenses
    (family_id, name, amount, kind, status, frequency, category_id,
     next_due_on, day_of_month, installments_total, installments_paid)
  values
    (v_family, 'QA · F5 cuotas capeadas', 5000, 'installment', 'active',
     'monthly', v_cat, (v_hoy - interval '4 months')::date,
     extract(day from v_hoy)::smallint, 12, 10);

  -- F6 · PAUSADO con vencimiento viejo.
  --     Esperado: cuenta como 1 cuota, NO multiplica el monto vencido
  --     (su pago rebotaría contra el guard de "solo compromisos activos").
  insert into public.fixed_expenses
    (family_id, name, amount, kind, status, frequency, category_id,
     next_due_on, day_of_month)
  values
    (v_family, 'QA · F6 pausado vencido', 9000, 'recurring', 'paused',
     'monthly', v_cat2, (v_hoy - interval '3 months')::date,
     extract(day from v_hoy)::smallint);

  -- ═══ EDICIONES CERRADAS ═════════════════════════════════════════

  -- E1 · edición cerrada CON movimientos conservados (el caso nuevo).
  --     6 gastos repartidos en 3 días de la ventana.
  for i in 1..6 loop
    v_dia := v_e1_ini + ((i - 1) / 2) * 7;          -- días 1, 8, 15
    insert into public.expenses
      (family_id, category_id, description, price, created_by,
       created_at, archived_at)
    values
      (v_family,
       case when i % 2 = 0 then v_cat2 else v_cat end,
       'QA · E1 movimiento ' || i,
       1000 * i,
       v_user,
       (v_dia + interval '13 hours')::timestamptz,
       now());
  end loop;

  -- Un cierre real archiva TODO lo que cae en la ventana. Si la cuenta ya
  -- tenía gastos en ese mes, también entran — y el resumen se calcula
  -- sobre esa realidad. Sin esto, hero y feed no cuadrarían y el QA
  -- perseguiría un desfase que lo habría creado este mismo script.
  update public.expenses
     set archived_at = coalesce(archived_at, now())
   where family_id = v_family
     and created_at >= v_e1_ini::timestamptz
     and created_at <  v_e1_fin::timestamptz;

  select coalesce(sum(price), 0), count(*)
    into v_total, v_n
    from public.expenses
   where family_id = v_family
     and commitment_id is null
     and created_at >= v_e1_ini::timestamptz
     and created_at <  v_e1_fin::timestamptz;

  insert into public.monthly_summaries
    (family_id, period_start, period_end, period_label,
     total_variable_spent, total_spent, expenses_count,
     monthly_income, category_breakdown, daily_totals)
  values
    (v_family, v_e1_ini, v_e1_fin,
     'QA · Edición con movimientos',
     v_total, v_total, v_n, 500000,
     -- Categorías reales de la ventana, top 3, con su porcentaje.
     coalesce((
       select jsonb_agg(x) from (
         select jsonb_build_object(
                  'name',  c.name,
                  'total', sum(e.price),
                  'pct',   round(sum(e.price) * 100.0 / nullif(v_total, 0))) as x
           from public.expenses e
           join public.categories c on c.id = e.category_id
          where e.family_id = v_family
            and e.commitment_id is null
            and e.created_at >= v_e1_ini::timestamptz
            and e.created_at <  v_e1_fin::timestamptz
          group by c.name
          order by sum(e.price) desc
          limit 3) t), '[]'::jsonb),
     -- Totales por día reales (mismo bucketeo por tz AR que usa el cierre).
     coalesce((
       select jsonb_agg(jsonb_build_object(
                'date',  to_char(d.dia, 'YYYY-MM-DD'),
                'total', d.total))
         from (select (e.created_at at time zone 'America/Argentina/Buenos_Aires')::date as dia,
                      sum(e.price) as total
                 from public.expenses e
                where e.family_id = v_family
                  and e.commitment_id is null
                  and e.created_at >= v_e1_ini::timestamptz
                  and e.created_at <  v_e1_fin::timestamptz
                group by 1 order by 1) d), '[]'::jsonb));

  -- E2 · edición cerrada SIN movimientos conservados (purgada).
  --     Busca hacia atrás el primer mes SIN gastos de esta familia, para
  --     no pisar datos reales ni contradecirse a sí misma.
  v_e2_ini := null;
  for i in 3..15 loop
    if not exists (
      select 1 from public.expenses
       where family_id = v_family
         and created_at >= date_trunc('month', v_hoy - (i || ' months')::interval)::timestamptz
         and created_at <  date_trunc('month', v_hoy - ((i-1) || ' months')::interval)::timestamptz)
    then
      v_e2_ini := date_trunc('month', v_hoy - (i || ' months')::interval)::date;
      v_e2_fin := date_trunc('month', v_hoy - ((i-1) || ' months')::interval)::date;
      exit;
    end if;
  end loop;

  if v_e2_ini is null then
    raise notice 'QA · sin mes libre para la edición purgada: se omite E2.';
  else
    insert into public.monthly_summaries
      (family_id, period_start, period_end, period_label,
       total_variable_spent, total_spent, expenses_count,
       monthly_income, category_breakdown, daily_totals)
    values
      (v_family, v_e2_ini, v_e2_fin,
       'QA · Edición purgada',
       84000, 84000, 23, 500000,
       jsonb_build_array(jsonb_build_object('name','Mercado','total',84000,'pct',100)),
       jsonb_build_array(
         jsonb_build_object('date', to_char(v_e2_ini + 4, 'YYYY-MM-DD'), 'total', 30000),
         jsonb_build_object('date', to_char(v_e2_ini + 11, 'YYYY-MM-DD'), 'total', 54000)));
  end if;

  raise notice '─────────────────────────────────────────────';
  raise notice 'QA sembrado para % (familia %)', v_email, v_family;
  raise notice '  Fijos:     F1..F6';
  raise notice '  Edición 1: % → % · % movimientos · total %', v_e1_ini, v_e1_fin, v_n, v_total;
  raise notice '  Edición 2: % → % · purgada (sin movimientos)', v_e2_ini, v_e2_fin;
  raise notice '─────────────────────────────────────────────';
end $$;
