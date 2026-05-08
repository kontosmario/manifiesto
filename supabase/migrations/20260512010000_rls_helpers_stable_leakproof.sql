-- WHAT: Marca helpers de RLS como STABLE + LEAKPROOF.
-- WHY: Postgres puede llamar STABLE LEAKPROOF helpers una vez por query
--      en vez de por fila. Sin esto, una RLS policy que use is_family_member
--      en un SELECT con muchas filas se ejecuta N veces. Las funciones
--      hacen un único SELECT contra family_members con WHERE family_id = $1
--      y user_id = auth.uid(); no exponen información sensible (LEAKPROOF
--      es seguro porque solo retorna boolean basado en datos del usuario
--      autenticado).

do $$
begin
  alter function public.is_family_member(uuid) stable leakproof;
exception when others then
  raise notice 'is_family_member alter failed: %', sqlerrm;
end;
$$;

do $$
begin
  alter function public.is_family_owner(uuid) stable leakproof;
exception when others then
  raise notice 'is_family_owner alter failed: %', sqlerrm;
end;
$$;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- alter function public.is_family_member(uuid) volatile;
-- alter function public.is_family_owner(uuid) volatile;
