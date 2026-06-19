-- Limpieza única de push tokens huérfanos (cross-account leak).
--
-- Contexto: `push_subscriptions` tiene unique (user_id, endpoint), NO
-- unique(endpoint). El endpoint de Expo es por device/instalación, así que un
-- device tiene un solo usuario activo a la vez. Pero al cambiar de cuenta en el
-- mismo device (o si el logout best-effort no limpió), quedaban DOS filas con el
-- mismo endpoint (una por cada usuario). Los crons mandan por family_id → la
-- fila huérfana recibía las notifs family-wide de la familia vieja en este
-- device: el bug de "me llegan fijos / Buen día de otra cuenta".
--
-- El fix definitivo (no crear nuevos duplicados) vive en la edge function
-- register-push-subscription: al registrar, borra las filas del mismo endpoint
-- de otros usuarios. Esta migración limpia los duplicados YA existentes en prod,
-- conservando por endpoint la fila más reciente (por last_used_at, con fallback
-- a updated_at/created_at; desempate por id). Idempotente.

delete from public.push_subscriptions a
using public.push_subscriptions b
where a.endpoint = b.endpoint
  and a.id <> b.id
  and (
    coalesce(a.last_used_at, a.updated_at, a.created_at)
      < coalesce(b.last_used_at, b.updated_at, b.created_at)
    or (
      coalesce(a.last_used_at, a.updated_at, a.created_at)
        = coalesce(b.last_used_at, b.updated_at, b.created_at)
      and a.id < b.id
    )
  );
