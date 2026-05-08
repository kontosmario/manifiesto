-- One-off: create an auth.users row + matching auth.identities row
-- with bcrypted password and email_confirmed_at = now() so the user
-- can sign in immediately (skips the email confirmation step).
--
-- The on_auth_user_created trigger auto-creates the public.profiles row.
--
-- Variables (passed via psql -v / `supabase db query` interpolation):
--   :email     — full email address (e.g. -v email="'user@example.com'")
--   :password  — plaintext (will be bcrypted; e.g. -v password="'StrongPass!2026'")
--   :name      — display name for raw_user_meta_data
--
-- IMPORTANT: never inline a default password in this file. A default
-- ("123456" was committed previously) becomes a known credential
-- against any environment where the script ran. All three variables
-- MUST be provided by the caller; the file errors out if not.

\if :{?email}
\else
\echo 'Missing required psql var :email — pass via -v email=\'""user@example.com""\''
\quit
\endif

\if :{?password}
\else
\echo 'Missing required psql var :password — pass via -v password=\'""StrongPass!2026""\''
\quit
\endif

\if :{?name}
\else
\set name '\'Tester\''
\endif

WITH new_user AS (
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    :email,
    crypt(:password, gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', :name),
    '', '', '', ''
  )
  RETURNING id, email
), new_identity AS (
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    id,
    jsonb_build_object('sub', id::text, 'email', email),
    'email',
    id::text,
    now(),
    now(),
    now()
  FROM new_user
  RETURNING user_id
)
SELECT email, id::text AS user_id FROM new_user;
