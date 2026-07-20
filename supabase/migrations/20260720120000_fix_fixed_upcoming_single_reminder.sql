-- FIX (2026-07-20): fixed_upcoming avisaba el MISMO gasto varios días seguidos.
--
-- Causa raíz (bug de server): la rama `fixed_upcoming` de
-- list_pending_notifications tenía una ventana SOLAPADA —
--   next_due_on between today and today+1   (hoy/mañana)
--   OR next_due_on = today + notify_days_before
-- — así que un fijo con notify_days_before=2 caía en 3 días distintos (D-2,
-- D-1, D). Como el dedup_key incluía `today_local`, el `on conflict do nothing`
-- solo frenaba repeticiones del MISMO día, nunca entre días → el usuario recibía
-- "vence en 2 días", "vence mañana", "vence hoy" (y el digest re-listaba los
-- mismos fijos cada día). Afectaba a toda familia con fijos próximos (medido:
-- 7 usuarios / 6 familias, hasta 3 días por gasto).
--
-- Fix: UN solo recordatorio por vencimiento, en UN único día por gasto:
--   day_reminder = LEAST( GREATEST(due_on - lead, created_date + 1), due_on )
-- lead = notify_days_before (null→1 día antes, 0→el día, clamp >=0). En el caso
-- normal = due_on - lead (el día del lead). El `created_date + 1` cubre las ALTAS
-- TARDÍAS (fijo creado después de la corrida diaria del cron, con el día del lead
-- ya pasado): empuja el aviso al 1er día en que el fijo ya existía cuando corre
-- el cron, clampeado a due_on → nunca se pierde por alta tardía. Ventana de
-- IGUALDAD (un solo día) → el digest agrupa un set distinto por día sin re-listar,
-- e inmune a "marco leído → reaparece" (el cron solo lo evalúa ese día). El
-- dedup_key per-gasto pasa a ser por OCURRENCIA (id + due_on), no por fecha.
--
-- POR QUÉ un solo día y no una ventana de rango con catch-up: una ventana
-- [today .. today+lead] reintroduce el digest diario y, con dedup por NOT EXISTS
-- contra `notifications` (efímeras: hard-delete al marcar leído), re-dispararía al
-- borrar la fila y re-avisaría a los miembros del digest (que no dejan clave por
-- ocurrencia). El día único con `created_date + 1` da resiliencia a altas tardías
-- SIN esos problemas. TRADE-OFF aceptado: si la ÚNICA corrida del día (cron
-- 'notifications-fixed-upcoming', ~12:00 UTC) FALLA justo el day_reminder de un
-- gasto, esa ocurrencia se pierde. Es una falla de infra rara; el spam diario
-- (lo reportado) era el bug.
--
-- ⚠️ DRIFT: list_pending_notifications tiene DRIFT en prod — 20260708250000 y
-- 20260708260000 parchearon la rama morning_checkin vía pg_get_functiondef +
-- replace() (NO con CREATE OR REPLACE literal, por eso no aparecen en un grep de
-- la definición). Un CREATE OR REPLACE con el cuerpo de 20260708170000 REVERTIRÍA
-- esos parches. Por eso acá se PARCHEA igual que ellos: se lee la definición VIVA
-- y se reemplazan SOLO los strings de la rama fixed_upcoming (ventana + dedup_key),
-- preservando todo lo demás sea cual sea. Aplicar con apply_migration, NO db push.

do $do$
declare
  v_src text;
begin
  v_src := pg_get_functiondef('public.list_pending_notifications(text)'::regprocedure);

  -- (1) Ventana fixed_upcoming: solapada (2-3 avisos) → un solo día por gasto
  -- con created-aware. `\s+` tolera el salto de línea/indentado de pg_get_functiondef.
  v_src := regexp_replace(
    v_src,
    'where fe\.next_due_on between m\.today_local and m\.today_local \+ 1\s+or \(coalesce\(fe\.notify_days_before, 0\) > 1 and fe\.next_due_on = m\.today_local \+ coalesce\(fe\.notify_days_before, 0\)\)',
    'where m.today_local = least(greatest(fe.next_due_on - greatest(coalesce(fe.notify_days_before, 1), 0), (fe.created_at at time zone m.user_tz)::date + 1), fe.next_due_on)',
    'g'
  );

  -- (2) dedup_key per-gasto: por fecha (today_local) → por OCURRENCIA (due_on).
  -- El del digest ('fixed_upcoming_digest:' || a.family_id ...) NO matchea → intacto.
  v_src := replace(
    v_src,
    '''fixed_upcoming:'' || d.id::text || '':'' || d.user_id::text || '':'' || d.today_local::text as dedup_key',
    '''fixed_upcoming:'' || d.id::text || '':'' || d.next_due_on::text || '':'' || d.user_id::text as dedup_key'
  );

  -- Guard: si algún patrón no matcheó (pg_get_functiondef cambió el formato de la
  -- rama), abortar en vez de aplicar el fix a medias.
  if position('(fe.created_at at time zone m.user_tz)::date + 1' in v_src) = 0
     or position('d.next_due_on::text || '':'' || d.user_id::text as dedup_key' in v_src) = 0 then
    raise exception 'fix fixed_upcoming: los substrings no matchearon la definición viva — revisar el formato de pg_get_functiondef';
  end if;

  execute v_src;
end
$do$;
