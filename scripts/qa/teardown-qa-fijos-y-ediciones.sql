-- Deshace lo que sembró scripts/qa/seed-qa-fijos-y-ediciones.sql.
-- Solo borra filas con el prefijo 'QA ·': no toca datos reales de la cuenta.
--
-- OJO: el seed archiva (archived_at) los gastos que la cuenta ya tenía en la
-- ventana de la Edición 1, porque es lo que hace un cierre real. Este teardown
-- los DESARCHIVA para dejar la cuenta como estaba.

do $$
declare
  v_email  text := 'ciclo.extendido@manifiestoapp.com';   -- el mismo del seed
  v_user   uuid;
  v_family uuid;
  v_ini    date;
  v_fin    date;
  v_n      int;
begin
  select id into v_user from auth.users where email = v_email;
  if v_user is null then raise exception 'No existe el usuario %.', v_email; end if;

  select family_id into v_family from public.family_members
   where user_id = v_user order by (role = 'owner') desc limit 1;

  -- Ventana de la Edición 1, para desarchivar lo que era de la cuenta.
  select period_start, period_end into v_ini, v_fin
    from public.monthly_summaries
   where family_id = v_family and period_label = 'QA · Edición con movimientos';

  delete from public.fixed_expense_payments
   where fixed_expense_id in (
     select id from public.fixed_expenses
      where family_id = v_family and name like 'QA ·%');

  delete from public.expenses
   where family_id = v_family and description like 'QA ·%';
  get diagnostics v_n = row_count;

  delete from public.fixed_expenses
   where family_id = v_family and name like 'QA ·%';

  delete from public.monthly_summaries
   where family_id = v_family and period_label like 'QA ·%';

  if v_ini is not null then
    update public.expenses
       set archived_at = null
     where family_id = v_family
       and created_at >= v_ini::timestamptz
       and created_at <  v_fin::timestamptz;
  end if;

  raise notice 'QA limpiado para % · % movimientos QA borrados · ventana % → % desarchivada',
    v_email, v_n, v_ini, v_fin;
end $$;
