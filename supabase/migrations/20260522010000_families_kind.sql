-- Modo soltero (familia invisible): marca el tipo de espacio.
-- 'shared' = familia/pareja (comportamiento actual, default).
-- 'solo'   = un único usuario; la UI oculta conceptos de familia.
-- Forward-compatible con la futura abstracción workspaces.type (pymes).
-- Ver docs/auditorias/expansion-multisegmento-2026-05-22/spec-modo-soltero-v1.md

alter table public.families
  add column if not exists kind text not null default 'shared'
  check (kind in ('solo','shared'));

-- Setea el kind de la familia del caller. Solo el owner puede hacerlo.
-- Se usa en onboarding del modo solo: bootstrap_family() crea 'shared'
-- por default y luego esta RPC lo flipea a 'solo'. Evita recrear el
-- cuerpo (~100 líneas) de bootstrap_family.
create or replace function public.set_family_kind(p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_kind text := case when p_kind in ('solo','shared') then p_kind else 'shared' end;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
  limit 1;

  if v_family_id is null then
    raise exception 'No family for current user';
  end if;

  if not public.is_family_owner(v_family_id) then
    raise exception 'Only the family owner can set the family kind';
  end if;

  update public.families set kind = v_kind where id = v_family_id;
  return v_kind;
end;
$$;

revoke all on function public.set_family_kind(text) from public;
grant execute on function public.set_family_kind(text) to authenticated;
