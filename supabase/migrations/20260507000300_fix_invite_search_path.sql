-- Hotfix: `generate_invite_code` couldn't see `gen_random_bytes`.
--
-- The previous function set `search_path = public`, but pgcrypto
-- (which provides `gen_random_bytes`) lives in the `extensions`
-- schema in Supabase by default. When the function ran, the bare
-- call `gen_random_bytes(p_length)` resolved to nothing in the
-- function's restricted search_path → 42883 "function does not
-- exist".
--
-- Fix: include `extensions` in the function's search_path. The
-- `peek_family_invite` and `consume_family_invite` RPCs from the
-- previous migration don't call `gen_random_bytes` directly so they
-- stay as-is; only `generate_invite_code` needs the fix.

create or replace function public.generate_invite_code(p_length int default 8)
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_alphabet_len int := length(v_alphabet);
  v_bytes bytea;
  v_code text := '';
  v_idx int;
  v_byte int;
begin
  v_bytes := gen_random_bytes(p_length);
  for v_idx in 0..(p_length - 1) loop
    v_byte := get_byte(v_bytes, v_idx);
    v_code := v_code || substr(v_alphabet, 1 + (v_byte % v_alphabet_len), 1);
  end loop;
  return v_code;
end;
$$;

-- `create_family_invite` calls `generate_invite_code` (which now
-- has the right search_path) but it ALSO has `set search_path = public`
-- on its own definition. The call to `public.generate_invite_code`
-- works fine via the explicit `public.` prefix already in the
-- previous migration; this is just a defensive recreate to make
-- sure the deployed version is consistent.
create or replace function public.create_family_invite()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_target_code text;
  v_attempts int := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id
    into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and (fm.blocked_at is null)
  limit 1;

  if v_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  loop
    v_target_code := public.generate_invite_code(8);
    begin
      insert into public.family_invites(code, family_id, created_by)
      values (v_target_code, v_family_id, v_user_id)
      returning family_invites.code, family_invites.expires_at
      into code, expires_at;
      return next;
      return;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 8 then
        raise exception 'Could not generate a unique invite code.';
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.create_family_invite() from public;
grant execute on function public.create_family_invite() to authenticated;
