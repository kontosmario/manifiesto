-- supabase/migrations/20260613000100_sprint_h_cancel_account_deletion_rate_limit.sql
--
-- Sprint H · H3 — Rate-limit `cancel_account_deletion`.
--
-- Por qué:
--   `request_account_deletion` ya quedaba protegido contra abuso porque
--   solo el dueño autenticado puede activarlo y la ventana es de 30
--   días. Su contraparte `cancel_account_deletion` (m20260517) no tenía
--   ningún throttle. En sí mismo es low-impact (toggle de un timestamp
--   en `profiles`), pero:
--     · Mantenemos paridad con el resto de RPCs sensibles (M3).
--     · Si el row crece (futuros side-effects: audit log, push re-
--       subscribe), el cap evita run-aways accidentales.
--     · Evita que un atacante con session token robado spamee
--       cancel/request en loop para confundir al sistema de retención.
--
-- Cuota:
--   5 / hora — un usuario legítimo rara vez vuelve a cancel después de
--   un par de toggles; 5/h cubre flap de red sin abrir ventana.

create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  -- H3: rate limit. `check_rate_limit` (m20260609010000) hace UPSERT
  -- atómico + RAISE con `hint = retry_after_<sec>` que el cliente ya
  -- sabe parsear (utils/error-message.ts → parseRateLimitMessage).
  perform public.check_rate_limit('cancel_account_deletion', 5, 3600);

  update public.profiles
    set deletion_scheduled_at = null
    where id = v_user_id;
end;
$$;

revoke all on function public.cancel_account_deletion() from public;
grant execute on function public.cancel_account_deletion() to authenticated;
