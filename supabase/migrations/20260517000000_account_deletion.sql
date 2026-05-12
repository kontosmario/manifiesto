-- WHAT: Account deletion flow para cumplir App Store Guideline 5.1.1(v).
--       Agrega columna `profiles.deletion_scheduled_at` + RPCs para
--       solicitar borrado y cancelarlo dentro de la ventana de gracia.
-- WHY:  Apple exige que cualquier app con creación de cuenta ofrezca un
--       mecanismo in-app para eliminar la cuenta con la misma prominencia
--       que el signup. Sin esto, App Review rechaza automáticamente.
--       Implementamos soft-delete con gracia de 30 días — el procesado
--       final del `auth.users` row (que dispara los cascades a todas las
--       tablas del esquema public) corre en una cron job aparte / edge
--       function con service-role.

-- ─── 1. Columna deletion_scheduled_at ────────────────────────────────
alter table public.profiles
  add column if not exists deletion_scheduled_at timestamptz null;

comment on column public.profiles.deletion_scheduled_at is
  'Si no es null, el usuario solicitó borrar su cuenta. El procesador '
  'background borra el auth.users row cuando este timestamp <= now(), '
  'lo que cascadea a todas las tablas del esquema public.';

create index if not exists profiles_deletion_scheduled_idx
  on public.profiles (deletion_scheduled_at)
  where deletion_scheduled_at is not null;

-- ─── 2. RPC request_account_deletion ─────────────────────────────────
-- Programa la baja del usuario actual con 30 días de gracia.
-- Si el usuario es owner de una familia con otros miembros activos,
-- bloquea hasta que transfiera ownership (`family_transfer_ownership`).
create or replace function public.request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_other_active int;
  v_scheduled_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  -- Si es owner de una familia, asegurarse de que no queden otros
  -- miembros activos esperándolo. Forzar transfer primero.
  select fm.family_id into v_family_id
    from public.family_members fm
    where fm.user_id = v_user_id
      and fm.role = 'owner'
      and fm.blocked_at is null
    limit 1;

  if v_family_id is not null then
    select count(*) into v_other_active
      from public.family_members
      where family_id = v_family_id
        and user_id <> v_user_id
        and blocked_at is null;

    if v_other_active > 0 then
      raise exception
        'Sos dueño de una familia con otros miembros. Transferí ownership antes de borrar tu cuenta.'
        using errcode = 'P0001';
    end if;
  end if;

  v_scheduled_at := now() + interval '30 days';

  update public.profiles
    set deletion_scheduled_at = v_scheduled_at
    where id = v_user_id;

  -- Disparamos la limpieza de credenciales sensibles inmediatamente
  -- para que durante la ventana de gracia el atacante con acceso al
  -- mail no pueda re-loguearse con biometric / mantener push.
  delete from public.push_subscriptions where user_id = v_user_id;

  return v_scheduled_at;
end;
$$;

revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

-- ─── 3. RPC cancel_account_deletion ──────────────────────────────────
-- Permite al usuario revertir la solicitud durante la gracia.
create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  update public.profiles
    set deletion_scheduled_at = null
    where id = v_user_id;
end;
$$;

revoke all on function public.cancel_account_deletion() from public;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ─── 4. Vista para el procesador background ─────────────────────────
-- Lista los auth.users.id elegibles para hard-delete (gracia vencida).
-- Solo accesible por service_role.
create or replace view public.account_deletions_due as
  select id as user_id, deletion_scheduled_at
    from public.profiles
    where deletion_scheduled_at is not null
      and deletion_scheduled_at <= now();

revoke all on public.account_deletions_due from public;
grant select on public.account_deletions_due to service_role;

-- ─── 5. Helper para edge function: hard delete del usuario ──────────
-- Wrapper service_role-only que dispara los cascades. Lo separamos en
-- una función dedicada para que el procesador no necesite saber el
-- esquema interno; solo invoca y mide success/failure.
create or replace function public.admin_delete_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Doble-check que efectivamente está programado para borrar — evita
  -- que un edge function bug borre cuentas sin solicitud explícita.
  if not exists (
    select 1 from public.profiles
      where id = p_user_id
        and deletion_scheduled_at is not null
        and deletion_scheduled_at <= now()
  ) then
    raise exception 'El usuario % no está marcado para borrar', p_user_id
      using errcode = 'P0001';
  end if;

  -- Cascadas: auth.users -> profiles (on delete cascade) -> todo lo
  -- demás vía FKs ya definidas en el schema (`on delete cascade`).
  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_delete_account(uuid) from public;
grant execute on function public.admin_delete_account(uuid) to service_role;

-- DOWN (manual):
-- drop function if exists public.admin_delete_account(uuid);
-- drop view if exists public.account_deletions_due;
-- drop function if exists public.cancel_account_deletion();
-- drop function if exists public.request_account_deletion();
-- drop index if exists profiles_deletion_scheduled_idx;
-- alter table public.profiles drop column if exists deletion_scheduled_at;
