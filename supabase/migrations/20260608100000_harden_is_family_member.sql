-- ============================================================
-- WHAT
--   Redefine `public.is_family_member(fam_id uuid)` para excluir
--   members con `role = 'blocked'`. Misma signature, mismo nombre;
--   cero cambios en las 40+ RLS policies que ya lo usan.
--
-- WHY (Code Review finding C1, SPRINT B)
--   El helper canónico fue introducido en
--   `20260413154000_mobile_baseline.sql:595-608` sin filtro de role.
--   Más tarde se agregó `is_family_member_active` en
--   `20260424001858_family_roles_admin.sql:74-87` con el filtro
--   correcto, pero apenas 3 RPCs migraron a usarlo. El resto del
--   sistema (40+ policies) sigue apoyándose en `is_family_member`,
--   lo que permite que un user marcado como blocked — que todavía
--   sostiene su JWT — siga leyendo (y en algunos cases
--   UPDATE/DELETE) datos de la familia.
--
--   Reemplazar la implementación del helper (en vez de hacer un
--   sweep policy-by-policy) es la opción menos invasiva:
--     - Mantiene la signature.
--     - Cero cambios en policies.
--     - Comportamiento se alinea con la intención documentada.
--
-- TRADE-OFF
--   Blocked users pierden TODO acceso a la family inmediatamente
--   (vs. acceso parcial actual). Esto es deseable: el rol 'blocked'
--   nunca debió otorgar lectura.
--
-- VERIFY
--   select prosrc like '%role <> ''blocked''%' as fixed
--   from pg_proc where proname = 'is_family_member';
-- ============================================================

create or replace function public.is_family_member(fam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = fam_id
      and fm.user_id = auth.uid()
      and fm.role <> 'blocked'
  );
$$;

revoke all on function public.is_family_member(uuid) from public;
grant execute on function public.is_family_member(uuid) to authenticated;
