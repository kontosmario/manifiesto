-- Quick win #1 (bug) — la racha no reflejaba un import masivo (OCR/captura).
--
-- Causa raíz: `advance_streak` es "backdate-proof" (descarta event_date < hoy en
-- la tz de la familia), así que los gastos importados con fecha PASADA encienden
-- el jardín (el grid se deriva client-side de `created_at`) pero NO avanzan
-- `family_streaks`. El número de racha queda desalineado con el jardín.
-- `recompute_family_streak` SÍ honra el historial (replay honesto), pero está
-- revocado del cliente (public/anon/authenticated).
--
-- Este RPC expone un recompute seguro para el cliente, con dos garantías:
--   1) Auth: solo un MIEMBRO de la familia puede dispararlo (is_family_member).
--   2) MONOTÓNICO: nunca BAJA la racha actual. Un import histórico no debe
--      castigar al usuario (filosofía "sin culpa"); solo la deja SUBIR para
--      reflejar días reales que el trigger backdate-proof había descartado.
--
-- `recompute_family_streak` ya preserva longest_streak y freeze_tokens; y
-- `award_achievement` es idempotente (on conflict do nothing), así que un
-- re-award solo otorga hitos genuinamente ganados por los días importados.
create or replace function public.resync_family_streak(p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_current integer;
begin
  if not public.is_family_member(p_family_id) then
    raise exception 'Not a member of this family' using errcode = '42501';
  end if;

  -- Valor mostrado al usuario ANTES del recompute (para la guarda monotónica).
  select current_streak into v_prev_current
  from public.family_streaks
  where family_id = p_family_id;

  perform public.recompute_family_streak(p_family_id);

  -- Guarda monotónica: si el replay honesto BAJÓ la racha (p.ej. estaba inflada
  -- por el seed clamp o por días cron-bridged), restauramos el valor previo.
  -- (Es un UPDATE, no dispara el trigger de hitos que es AFTER INSERT.)
  if v_prev_current is not null then
    update public.family_streaks
    set current_streak = v_prev_current
    where family_id = p_family_id
      and current_streak < v_prev_current;
  end if;
end;
$$;

revoke all on function public.resync_family_streak(uuid) from public, anon;
grant execute on function public.resync_family_streak(uuid) to authenticated;
