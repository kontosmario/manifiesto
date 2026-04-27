-- One-off: create an auth.users row + matching auth.identities row
-- with bcrypted password and email_confirmed_at = now() so the user
-- can sign in immediately (skips the email confirmation step).
--
-- The on_auth_user_created trigger auto-creates the public.profiles row.
--
-- Variables (passed via psql -v / `supabase db query` interpolation):
--   :email     — full email address
--   :password  — plaintext (will be bcrypted)
--   :name      — display name for raw_user_meta_data

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
    'aye.tello18@gmail.com',
    crypt('123456', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Aye"}'::jsonb,
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
