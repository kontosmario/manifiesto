-- Paridad repo ↔ prod: `advisor_push_allowed_recipients` sin `#variable_conflict`.
--
-- La versión VIVA en prod lleva la directiva `#variable_conflict use_column`,
-- pero ninguna migración la produce: se aplicó a mano. Una base reconstruida
-- desde las migraciones (local / staging) quedaba con la función SIN la
-- directiva, y ahí el parámetro OUT `user_id` es ambiguo contra la columna
-- `user_id` del `on conflict (user_id, kind)` → la función falla en runtime con
-- "column reference user_id is ambiguous".
--
-- Esta migración deja el repo diciendo lo que prod ya hace. En prod es un no-op
-- exacto (el cuerpo es idéntico al vivo); en local y staging arregla la función.
--
-- Detectado el 2026-08-04 con `supabase db diff --linked` al montar el ambiente
-- de desarrollo. Ver docs/operaciones/ambiente-dev.md.

CREATE OR REPLACE FUNCTION public.advisor_push_allowed_recipients(p_user_ids uuid[], p_kind text, p_cooldown_seconds integer)
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- OUT `user_id` colisiona con la columna user_id en `on conflict (user_id,...)`;
-- resolver identificadores ambiguos a la COLUMNA.
#variable_conflict use_column
begin
  return query
  insert into public.advisor_push_ledger as l (user_id, kind, pushed_at)
  select distinct u, p_kind, now()
  from unnest(coalesce(p_user_ids, array[]::uuid[])) as u
  where u is not null
  on conflict (user_id, kind) do update
    set pushed_at = now()
    where l.pushed_at < now() - make_interval(secs => greatest(coalesce(p_cooldown_seconds, 0), 0))
  returning l.user_id;
end;
$function$;
