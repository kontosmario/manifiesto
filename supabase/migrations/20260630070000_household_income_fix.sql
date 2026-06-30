-- Fix del ingreso del hogar: family_finance.monthly_income = Σ de las
-- contribuciones de TODOS los miembros (dueño incluido), excluyendo bloqueados.
--
-- Bug: el ingreso del dueño se escribía DIRECTO en family_finance.monthly_income
-- (onboarding upsert) y nunca en su monthly_income_contribution (quedaba 0). El
-- trigger recompute_family_income (Σ de contribuciones) pisaba ese monthly_income
-- en cuanto un miembro se unía → el ingreso del dueño se borraba. El fix de
-- cliente hace que el dueño escriba su ingreso como contribución (vía
-- update_my_income_contribution) y deja de escribir monthly_income directo, así
-- que el total es SIEMPRE la suma derivada.
--
-- Este migration: (1) recompute excluye bloqueados (un bloqueado = retirado del
-- hogar → su aporte se va con él); (2) repara la única familia ya corrupta.

-- (1) recompute_family_income — excluir miembros 'blocked' del sum.
create or replace function public.recompute_family_income()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_family_id uuid;
  v_total numeric(12,2);
begin
  if tg_op = 'DELETE' then
    v_family_id := old.family_id;
  else
    v_family_id := new.family_id;
  end if;

  select coalesce(sum(fm.monthly_income_contribution), 0)
    into v_total
  from public.family_members fm
  where fm.family_id = v_family_id
    and coalesce(fm.role, '') <> 'blocked';

  insert into public.family_finance (family_id, monthly_income)
  values (v_family_id, v_total)
  on conflict (family_id) do update
    set monthly_income = excluded.monthly_income;

  if tg_op = 'UPDATE' and old.family_id is distinct from new.family_id then
    select coalesce(sum(fm.monthly_income_contribution), 0)
      into v_total
    from public.family_members fm
    where fm.family_id = old.family_id
      and coalesce(fm.role, '') <> 'blocked';
    update public.family_finance
    set monthly_income = v_total
    where family_finance.family_id = old.family_id;
  end if;

  return null; -- AFTER trigger
end;
$function$;

-- (2) Reparación one-time de la única familia corrupta (c043d6a0, mario.test): el
-- ingreso del dueño (5.000.000) se perdió cuando maria se unió. Lo restauramos a su
-- contribución → el UPDATE dispara recompute → monthly_income vuelve a ser
-- 5.000.000 + 1.500.000 = 6.500.000. Guard de idempotencia (solo si quedó en 0);
-- en CI/local no matchea (mario.test no existe). El 5M no era recuperable del
-- audit_log (solo guarda {op, jwt_role}) — valor confirmado por el owner del repro.
update public.family_members
set monthly_income_contribution = 5000000
where family_id = 'c043d6a0-c105-49dc-a609-01d0c1dd3dca'
  and role = 'owner'
  and monthly_income_contribution = 0
  and user_id = (select id from auth.users where email = 'mario.test@manifiestoapp.com');
