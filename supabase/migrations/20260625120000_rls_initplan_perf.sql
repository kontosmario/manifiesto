-- WHAT: RLS performance — envuelve `auth.uid()`/`current_setting()` en
--       `(select ...)` en todas las policies (lint `auth_rls_initplan`, 47).
-- WHY:  `auth.uid()` directo se re-evalúa POR FILA; envuelto en subquery el
--       planner lo evalúa UNA vez por statement (init-plan) → 10–100× en tablas
--       grandes. Es SEMÁNTICAMENTE IDÉNTICO (mismo valor, solo cacheado) → cero
--       cambio de acceso, solo perf. `is_family_member(family_id)` etc. NO se
--       envuelven (dependen de la fila). Idempotente: salta policies ya envueltas.

do $$
declare r record; stmt text;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        (qual like '%auth.uid()%' and qual not ilike '%( select auth.uid()%')
        or (with_check like '%auth.uid()%' and with_check not ilike '%( select auth.uid()%')
      )
  loop
    stmt := format('alter policy %I on public.%I', r.policyname, r.tablename);
    if r.qual is not null then
      stmt := stmt || ' using (' || replace(r.qual, 'auth.uid()', '(select auth.uid())') || ')';
    end if;
    if r.with_check is not null then
      stmt := stmt || ' with check (' || replace(r.with_check, 'auth.uid()', '(select auth.uid())') || ')';
    end if;
    execute stmt;
  end loop;
end $$;

-- audit_log: el INSERT chequea current_setting('request.jwt.claims') por fila.
alter policy audit_log_service_role_insert on public.audit_log
  with check (
    ((( select current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text)
    OR (CURRENT_USER = ANY (ARRAY['postgres'::name, 'supabase_admin'::name, 'service_role'::name]))
  );
