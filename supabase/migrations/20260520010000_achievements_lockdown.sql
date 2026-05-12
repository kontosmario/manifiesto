-- WHAT: Lockdown explícito de `award_achievement`. Solo service_role
--       (y por extensión los triggers SECURITY DEFINER que la invocan)
--       deben poder otorgar achievements. Authenticated users no.
--
-- WHY:  El `revoke ... from public` de la migración previa no afecta
--       el grant default que Supabase da a `authenticated` sobre toda
--       función pública. Sin este lockdown, un usuario logueado podría
--       llamar `select public.award_achievement('streak_90', auth.uid())`
--       y auto-otorgarse cualquier badge.
--
--       Mismo defense-in-depth fix que hicimos para
--       `admin_delete_account` en migration 20260518010000.

revoke all on function public.award_achievement(text, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.award_achievement(text, uuid, uuid, jsonb) to service_role;
