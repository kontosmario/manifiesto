-- WHAT: Marca helpers de RLS como STABLE + LEAKPROOF.
-- WHY: Postgres puede llamar STABLE LEAKPROOF helpers una vez por query
--      en vez de por fila. Sin esto, una RLS policy que use is_family_member
--      en un SELECT con muchas filas se ejecuta N veces.
--
-- LIMITACIÓN — Supabase Cloud:
--   ALTER FUNCTION ... LEAKPROOF requiere superuser. En Supabase Cloud
--   el rol `postgres` NO es superuser, entonces el LEAKPROOF puede fallar.
--   En ese caso, el bloque captura `insufficient_privilege` y aplica solo
--   STABLE como fallback (que no requiere superuser y mantiene parte del
--   beneficio: el planner cachea resultados a nivel statement).
--
-- LEAKPROOF SAFETY:
--   Las dos funciones son `select exists(...)` puras: no hacen RAISE
--   EXCEPTION con datos de los argumentos, no tienen side-effects, no
--   exponen información de timing relevante. Marcar LEAKPROOF es seguro.

do $$
begin
  alter function public.is_family_member(uuid) stable leakproof;
exception when insufficient_privilege then
  raise notice 'is_family_member LEAKPROOF requires superuser (skipping en este entorno: %). Falling back to STABLE only.', sqlerrm;
  begin
    alter function public.is_family_member(uuid) stable;
  exception when others then
    raise notice 'is_family_member STABLE fallback also failed: %', sqlerrm;
  end;
end;
$$;

do $$
begin
  alter function public.is_family_owner(uuid) stable leakproof;
exception when insufficient_privilege then
  raise notice 'is_family_owner LEAKPROOF requires superuser (skipping en este entorno: %). Falling back to STABLE only.', sqlerrm;
  begin
    alter function public.is_family_owner(uuid) stable;
  exception when others then
    raise notice 'is_family_owner STABLE fallback also failed: %', sqlerrm;
  end;
end;
$$;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- alter function public.is_family_member(uuid) stable not leakproof;
-- alter function public.is_family_owner(uuid) stable not leakproof;
