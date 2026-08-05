-- `dispatch_notifications_kind` tenía la URL de PRODUCCIÓN hardcodeada.
--
--   v_url text := 'https://xaquigyhylzvuyfslkqq.supabase.co/functions/v1/notifications-orchestrator';
--
-- (viene de 20260709000322_sync_prod_function_sources, que codificó el fuente
-- vivo de prod tal cual estaba).
--
-- Con un solo ambiente nunca molestó. Con staging es un cruce peligroso: el
-- cron de staging llamaría a la edge function de PRODUCCIÓN. Hoy no explota de
-- casualidad — el vault de staging estaba vacío y la función hace return antes —
-- pero apenas se configura staging para probar push, empieza a golpear el
-- proyecto equivocado.
--
-- Fix: cada ambiente DECLARA su propia URL. Dos fuentes, en orden:
--
--   1. secreto `orchestrator_url` en el vault  (lo normal)
--   2. GUC `app.settings.orchestrator_url`     (escotilla para self-hosted)
--
-- Si ninguna está, la función NO adivina: hace skip con un warning. Es a
-- propósito y es la decisión importante del cambio — el default anterior era
-- "mandale a prod", que es el peor resultado posible desde un ambiente de
-- pruebas. Preferimos no notificar antes que notificar al proyecto equivocado.
--
-- ⚠️ ORDEN DE DEPLOY: antes de que esta migración llegue a un ambiente, ese
-- ambiente tiene que tener el secreto cargado:
--
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/notifications-orchestrator',
--     'orchestrator_url',
--     'URL del orchestrator de ESTE ambiente');
--
-- En prod ya quedó cargado el 2026-08-05 con su URL actual, así que esta
-- migración es un no-op de comportamiento allá. Ver docs/operaciones/ambiente-dev.md.
--
-- (Nota: NO se puede derivar el ref del JWT del service role, porque el vault
-- guarda un secreto de cron dedicado — 64 hex, no un JWT. Ver el comentario del
-- audit 2026-06-11 en notifications-orchestrator/index.ts.)

CREATE OR REPLACE FUNCTION public.dispatch_notifications_kind(p_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key text;
  v_url text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'orchestrator_service_role_key'
  limit 1;

  if v_key is null then
    raise notice 'orchestrator service key not in vault; skipping dispatch for kind=%', p_kind;
    return;
  end if;

  -- (1) URL declarada por el ambiente en el vault.
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'orchestrator_url'
  limit 1;

  -- (2) Escotilla por GUC.
  if v_url is null or v_url = '' then
    v_url := nullif(current_setting('app.settings.orchestrator_url', true), '');
  end if;

  -- (3) Sin URL declarada NO se adivina: mandarle push a los usuarios de otro
  -- ambiente es peor que no mandar nada.
  if v_url is null then
    raise warning
      'dispatch_notifications_kind: este ambiente no declaró su orchestrator_url (vault o app.settings); no se despacha kind=%',
      p_kind;
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('kind', p_kind)
  );
end;
$function$;

-- El lockdown de 20260630034907 sobrevive al CREATE OR REPLACE (los privilegios
-- se preservan), pero lo re-afirmamos por si la base se reconstruye desde cero.
revoke execute on function public.dispatch_notifications_kind(text) from public, anon, authenticated;
