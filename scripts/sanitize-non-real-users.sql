-- ════════════════════════════════════════════════════════════════════
-- One-off: borrar todos los users SALVO los whitelisted (data real).
--
-- Modo dry-run (default): solo lista qué se va a borrar.
-- Modo destructivo: setear con `-v dry_run=false` (psql) o cambiar la
-- variable v_dry_run abajo a false antes de correr.
--
-- USO:
--   1. Dry run (read-only):
--      psql "$SUPABASE_DB_URL" -f scripts/sanitize-non-real-users.sql -v dry_run=true
--   2. Si la lista es la esperada, ejecutar real:
--      psql "$SUPABASE_DB_URL" -f scripts/sanitize-non-real-users.sql -v dry_run=false
--
-- ALCANCE DEL DELETE:
--   El borrado es contra `auth.users`. Las FK con `on delete cascade`
--   se encargan de limpiar lo demás (family_members, expenses,
--   notifications, push_subscriptions, etc.). Las pocas FK con `set null`
--   (ej. created_by) dejan las filas pero anulan la referencia — eso es
--   intencional para no romper la familia si solo borras un miembro.
--   Como acá borramos dueños de familias enteras, las families con
--   FK `on delete cascade` también se van.
--
-- WHITELIST (NO se borran):
--   - kontosmario@gmail.com
--   - aye.tello18@gmail.com
-- ════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- Variables de control: psql las pasa con -v key=value
\if :{?dry_run}
\else
  \set dry_run true
\endif

\echo '════════════════════════════════════════════════════════════════════'
\echo 'sanitize-non-real-users.sql'
\echo 'dry_run = ' :dry_run
\echo '════════════════════════════════════════════════════════════════════'

begin;

-- ─── 1 · Identificar users a preservar ────────────────────────────────
do $$
declare
  v_keep uuid[];
  v_to_delete int;
begin
  select array_agg(id) into v_keep
  from auth.users
  where email in ('kontosmario@gmail.com', 'aye.tello18@gmail.com');

  if v_keep is null or array_length(v_keep, 1) = 0 then
    raise exception 'No se encontró ninguna de las cuentas whitelisted. Abortando para no borrar todo.';
  end if;

  raise notice 'Cuentas whitelisted (preservadas): % users', array_length(v_keep, 1);

  select count(*) into v_to_delete
  from auth.users
  where id <> all (v_keep);

  raise notice 'Cuentas a borrar: % users', v_to_delete;

  if v_to_delete = 0 then
    raise notice 'No hay nada que borrar.';
    return;
  end if;
end;
$$;

-- ─── 2 · Listar exactamente qué se va a borrar ────────────────────────
\echo ''
\echo '─── Cuentas que serán borradas (preview): ───'
select
  u.id,
  u.email,
  u.created_at,
  count(distinct fm.family_id) as families_member_of,
  count(distinct e.id) as expenses_count,
  count(distinct n.id) as notifications_count
from auth.users u
left join public.family_members fm on fm.user_id = u.id
left join public.expenses e on e.created_by = u.id
left join public.notifications n on n.user_id = u.id
where u.email not in ('kontosmario@gmail.com', 'aye.tello18@gmail.com')
group by u.id, u.email, u.created_at
order by u.created_at asc;

\echo ''
\echo '─── Cuentas preservadas: ───'
select
  u.id,
  u.email,
  u.created_at,
  count(distinct fm.family_id) as families_member_of,
  count(distinct e.id) as expenses_count,
  count(distinct n.id) as notifications_count
from auth.users u
left join public.family_members fm on fm.user_id = u.id
left join public.expenses e on e.created_by = u.id
left join public.notifications n on n.user_id = u.id
where u.email in ('kontosmario@gmail.com', 'aye.tello18@gmail.com')
group by u.id, u.email, u.created_at
order by u.email;

-- ─── 3 · Identificar familias huérfanas (sin owner whitelisted) ─────
-- Si una familia tiene SOLO miembros que vamos a borrar, también se va.
-- Esto está cubierto por on-delete-cascade en family_members → families,
-- pero lo listamos para transparencia.
\echo ''
\echo '─── Familias que quedarán huérfanas y se borrarán por cascade: ───'
select
  f.id,
  f.code,
  f.name,
  f.created_at,
  array_agg(distinct u.email) as member_emails
from public.families f
join public.family_members fm on fm.family_id = f.id
join auth.users u on u.id = fm.user_id
group by f.id, f.code, f.name, f.created_at
having not bool_or(u.email in ('kontosmario@gmail.com', 'aye.tello18@gmail.com'))
order by f.created_at asc;

-- ─── 4 · Ejecutar el delete (solo si no es dry_run) ──────────────────
\if :dry_run
  \echo ''
  \echo '════════════════════════════════════════════════════════════════════'
  \echo 'DRY RUN: nada se borró. Para ejecutar el delete real:'
  \echo '   psql "$SUPABASE_DB_URL" -f scripts/sanitize-non-real-users.sql -v dry_run=false'
  \echo '════════════════════════════════════════════════════════════════════'
  rollback;
\else
  \echo ''
  \echo '─── EJECUTANDO DELETE ───'

  delete from auth.users
  where email not in ('kontosmario@gmail.com', 'aye.tello18@gmail.com');

  \echo ''
  \echo '─── Resumen post-delete: ───'
  select
    count(*) as users_remaining,
    array_agg(email order by email) as emails
  from auth.users;

  select count(*) as families_remaining from public.families;
  select count(*) as expenses_remaining from public.expenses;
  select count(*) as notifications_remaining from public.notifications;

  \echo ''
  \echo '════════════════════════════════════════════════════════════════════'
  \echo 'DELETE COMPLETADO. Commiteando.'
  \echo '════════════════════════════════════════════════════════════════════'
  commit;
\endif
