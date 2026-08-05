-- WHAT: Consolida las policies permissive duplicadas de savings_goals
--       (lint `multiple_permissive_policies`): cada DELETE/INSERT/UPDATE tenía una
--       policy "member" + una "owner". Postgres ya las OR-ea → mergear en una sola
--       con `(member OR owner)` es SEMÁNTICAMENTE IDÉNTICO y evita evaluar 2
--       policies por fila.
-- WHY:  Perf (1 policy en vez de 2 por statement) sin cambiar acceso. `is_family_owner`
--       es subconjunto de `is_family_member`, pero mantengo el OR para equivalencia
--       EXACTA (cubre cualquier edge donde difieran).
-- NOTE: expenses INSERT (active vs created_by_self) NO se toca — tiene lógica/roles
--       distintos y amerita decisión del owner (ver auditoría).

-- DELETE
drop policy if exists savings_goals_delete_members on public.savings_goals;
drop policy if exists savings_goals_delete_owner on public.savings_goals;
create policy savings_goals_delete on public.savings_goals
  for delete to public
  using (is_family_member(family_id) or is_family_owner(family_id));

-- INSERT
drop policy if exists savings_goals_insert_members on public.savings_goals;
drop policy if exists savings_goals_insert_owner on public.savings_goals;
create policy savings_goals_insert on public.savings_goals
  for insert to public
  with check (is_family_member(family_id) or is_family_owner(family_id));

-- UPDATE
drop policy if exists savings_goals_update_members on public.savings_goals;
drop policy if exists savings_goals_update_owner on public.savings_goals;
create policy savings_goals_update on public.savings_goals
  for update to public
  using (is_family_member(family_id) or is_family_owner(family_id))
  with check (is_family_member(family_id) or is_family_owner(family_id));
