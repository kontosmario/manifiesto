create table if not exists public.category_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  quick_descriptions text[] not null default '{}',
  sort_order integer not null unique,
  created_at timestamptz not null default now()
);

alter table public.categories
add column if not exists template_id uuid null references public.category_templates(id) on delete set null;

insert into public.category_templates (name, quick_descriptions, sort_order)
values
  ('Gastos generales', array['Varios', 'Compra rápida', 'Reposición', 'Gasto menor']::text[], 1),
  ('Supermercado', array['Supermercado', 'Compra semanal', 'Compra mensual', 'Despensa']::text[], 2),
  ('Almacén y kiosco', array['Almacén', 'Kiosco', 'Bebidas', 'Snacks']::text[], 3),
  ('Verdulería y carnicería', array['Verdulería', 'Carnicería', 'Pollería', 'Fiambrería']::text[], 4),
  ('Panadería', array['Panadería', 'Pan', 'Facturas', 'Torta']::text[], 5),
  ('Delivery y salidas', array['Delivery', 'Restaurante', 'Café', 'Helado']::text[], 6),
  ('Limpieza y hogar', array['Limpieza', 'Perfumería', 'Papel higiénico', 'Detergente']::text[], 7),
  ('Mantenimiento del hogar', array['Ferretería', 'Arreglo', 'Reparación', 'Plomería']::text[], 8),
  ('Muebles y decoración', array['Mueble', 'Decoración', 'Bazar', 'Organización']::text[], 9),
  ('Alquiler', array['Alquiler', 'Seña', 'Ajuste', 'Pago de alquiler']::text[], 10),
  ('Expensas', array['Expensas', 'Administración', 'Consorcio', 'Extraordinarias']::text[], 11),
  ('Luz y gas', array['Luz', 'Gas', 'Boleta', 'Recarga']::text[], 12),
  ('Agua', array['Agua', 'Boleta de agua', 'Servicio de agua', 'Cooperativa']::text[], 13),
  ('Internet, cable y celular', array['Internet', 'Cable', 'Celular', 'Recarga']::text[], 14),
  ('Transporte público', array['Colectivo', 'Sube', 'Subte', 'Tren']::text[], 15),
  ('Combustible', array['Nafta', 'Gasoil', 'Carga', 'Estación de servicio']::text[], 16),
  ('Auto y movilidad', array['Estacionamiento', 'Peaje', 'Service', 'Lavado']::text[], 17),
  ('Salud y farmacia', array['Farmacia', 'Consulta', 'Medicamentos', 'Estudios']::text[], 18),
  ('Obra social y seguros', array['Obra social', 'Prepaga', 'Seguro', 'Cobertura']::text[], 19),
  ('Educación', array['Cuota', 'Curso', 'Materiales', 'Libros']::text[], 20),
  ('Niños', array['Colegio', 'Pañales', 'Juguetes', 'Guardería']::text[], 21),
  ('Mascotas', array['Alimento', 'Veterinaria', 'Arena', 'Peluquería']::text[], 22),
  ('Ropa y calzado', array['Ropa', 'Calzado', 'Accesorios', 'Abrigo']::text[], 23),
  ('Cuidado personal', array['Peluquería', 'Perfumería', 'Skincare', 'Higiene']::text[], 24),
  ('Ocio y entretenimiento', array['Cine', 'Salida', 'Juegos', 'Streaming']::text[], 25),
  ('Deportes y bienestar', array['Gimnasio', 'Yoga', 'Suplementos', 'Actividad']::text[], 26),
  ('Suscripciones y apps', array['Netflix', 'Spotify', 'iCloud', 'App']::text[], 27),
  ('Tecnología', array['Accesorio', 'Electrónica', 'Reparación', 'Periférico']::text[], 28),
  ('Impuestos y tasas', array['ABL', 'Municipal', 'Monotributo', 'Impuesto']::text[], 29),
  ('Deudas y tarjetas', array['Tarjeta', 'Préstamo', 'Cuota', 'Intereses']::text[], 30),
  ('Trámites y documentos', array['Documento', 'Certificado', 'Sellado', 'Gestión']::text[], 31),
  ('Regalos y celebraciones', array['Regalo', 'Cumpleaños', 'Fiesta', 'Souvenir']::text[], 32),
  ('Viajes y vacaciones', array['Hotel', 'Pasajes', 'Excursión', 'Reserva']::text[], 33),
  ('Trabajo y oficina', array['Insumos', 'Papelería', 'Envío', 'Herramienta']::text[], 34),
  ('Donaciones', array['Donación', 'Colecta', 'Aporte', 'Ayuda']::text[], 35),
  ('Emergencias e imprevistos', array['Urgencia', 'Reemplazo', 'Rotura', 'Imprevisto']::text[], 36)
on conflict (name) do update
set quick_descriptions = excluded.quick_descriptions,
    sort_order = excluded.sort_order;

update public.categories categories
set template_id = templates.id
from public.category_templates templates
where categories.template_id is null
  and lower(categories.name) = lower(templates.name);

insert into public.categories(family_id, template_id, name)
select families.id, templates.id, templates.name
from public.families families
cross join public.category_templates templates
where not exists (
  select 1
  from public.categories categories
  where categories.family_id = families.id
    and lower(categories.name) = lower(templates.name)
)
order by families.created_at, templates.sort_order;

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

  insert into public.categories(family_id, template_id, name)
  select v_existing_family_id, templates.id, templates.name
  from public.category_templates templates
  where not exists (
    select 1
    from public.categories categories
    where categories.family_id = v_existing_family_id
      and lower(categories.name) = lower(templates.name)
  )
  order by templates.sort_order;

  return query select v_existing_family_id, v_existing_family_code;
end;
$$;

revoke all on function public.bootstrap_family(text) from public;
grant execute on function public.bootstrap_family(text) to authenticated;

alter table public.category_templates enable row level security;

drop policy if exists "category_templates_select_authenticated" on public.category_templates;
create policy "category_templates_select_authenticated"
on public.category_templates
for select
to authenticated
using (true);
