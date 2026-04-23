insert into public.categories(family_id, name)
select families.id, defaults.name
from public.families families
cross join (
  values
    ('Gastos generales'::text),
    ('Supermercado'::text),
    ('Almacén y kiosco'::text),
    ('Verdulería y carnicería'::text),
    ('Panadería'::text),
    ('Delivery y salidas'::text),
    ('Limpieza y hogar'::text),
    ('Mantenimiento del hogar'::text),
    ('Muebles y decoración'::text),
    ('Alquiler'::text),
    ('Expensas'::text),
    ('Luz y gas'::text),
    ('Agua'::text),
    ('Internet, cable y celular'::text),
    ('Transporte público'::text),
    ('Combustible'::text),
    ('Auto y movilidad'::text),
    ('Salud y farmacia'::text),
    ('Obra social y seguros'::text),
    ('Educación'::text),
    ('Niños'::text),
    ('Mascotas'::text),
    ('Ropa y calzado'::text),
    ('Cuidado personal'::text),
    ('Ocio y entretenimiento'::text),
    ('Deportes y bienestar'::text),
    ('Suscripciones y apps'::text),
    ('Tecnología'::text),
    ('Impuestos y tasas'::text),
    ('Deudas y tarjetas'::text),
    ('Trámites y documentos'::text),
    ('Regalos y celebraciones'::text),
    ('Viajes y vacaciones'::text),
    ('Trabajo y oficina'::text),
    ('Donaciones'::text),
    ('Emergencias e imprevistos'::text)
) as defaults(name)
where not exists (
  select 1
  from public.categories c
  where c.family_id = families.id
    and lower(c.name) = lower(defaults.name)
);

drop function if exists public.bootstrap_family();
drop function if exists public.bootstrap_family(text);
create or replace function public.bootstrap_family(p_preferred_code text default null)
returns table (family_id uuid, family_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_family_id uuid;
  v_existing_family_code text;
  v_target_code text;
  v_attempts integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id, f.code
    into v_existing_family_id, v_existing_family_code
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  where fm.user_id = v_user_id
  limit 1;

  if v_existing_family_id is not null then
    return query select v_existing_family_id, v_existing_family_code;
    return;
  end if;

  if p_preferred_code is not null and btrim(p_preferred_code) <> '' then
    v_target_code := upper(btrim(p_preferred_code));
  else
    v_target_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  end if;

  loop
    begin
      insert into public.families(code)
      values (v_target_code)
      returning id, code into v_existing_family_id, v_existing_family_code;
      exit;
    exception
      when unique_violation then
        v_attempts := v_attempts + 1;
        if v_attempts > 8 then
          raise exception 'Could not generate a unique family code.';
        end if;
        v_target_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    end;
  end loop;

  insert into public.family_members(family_id, user_id)
  values (v_existing_family_id, v_user_id)
  on conflict (user_id) do nothing;

  insert into public.categories(family_id, name)
  select v_existing_family_id, defaults.name
  from (
    values
      ('Gastos generales'::text),
      ('Supermercado'::text),
      ('Almacén y kiosco'::text),
      ('Verdulería y carnicería'::text),
      ('Panadería'::text),
      ('Delivery y salidas'::text),
      ('Limpieza y hogar'::text),
      ('Mantenimiento del hogar'::text),
      ('Muebles y decoración'::text),
      ('Alquiler'::text),
      ('Expensas'::text),
      ('Luz y gas'::text),
      ('Agua'::text),
      ('Internet, cable y celular'::text),
      ('Transporte público'::text),
      ('Combustible'::text),
      ('Auto y movilidad'::text),
      ('Salud y farmacia'::text),
      ('Obra social y seguros'::text),
      ('Educación'::text),
      ('Niños'::text),
      ('Mascotas'::text),
      ('Ropa y calzado'::text),
      ('Cuidado personal'::text),
      ('Ocio y entretenimiento'::text),
      ('Deportes y bienestar'::text),
      ('Suscripciones y apps'::text),
      ('Tecnología'::text),
      ('Impuestos y tasas'::text),
      ('Deudas y tarjetas'::text),
      ('Trámites y documentos'::text),
      ('Regalos y celebraciones'::text),
      ('Viajes y vacaciones'::text),
      ('Trabajo y oficina'::text),
      ('Donaciones'::text),
      ('Emergencias e imprevistos'::text)
  ) as defaults(name)
  where not exists (
    select 1
    from public.categories c
    where c.family_id = v_existing_family_id
      and lower(c.name) = lower(defaults.name)
  );

  return query select v_existing_family_id, v_existing_family_code;
end;
$$;

revoke all on function public.bootstrap_family(text) from public;
grant execute on function public.bootstrap_family(text) to authenticated;
