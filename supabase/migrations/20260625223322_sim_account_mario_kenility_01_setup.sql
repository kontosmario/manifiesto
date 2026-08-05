DO $$
DECLARE
  v_family  uuid := '3d7f2031-50c9-47fa-8892-2b4cf95043ad';
  v_mario   uuid := 'ba9dd732-9434-4874-8021-66334dd98726';
  v_partner uuid := gen_random_uuid();
  v_birth   timestamptz := '2026-02-22 14:00:00-03';
  v_join    timestamptz := '2026-03-12 11:00:00-03';
BEGIN
  -- Guard de reproducibilidad: esta migración parchea la familia demo "kenility",
  -- que fue creada a mano desde la app en producción. En una base virgen (local o
  -- staging) esos UUIDs no existen y no hay nada que parchear, así que es un no-op.
  IF NOT EXISTS (SELECT 1 FROM public.families WHERE id = v_family) THEN
    RAISE NOTICE 'sim_account_kenility_01: familia demo ausente, se omite (esperado fuera de prod)';
    RETURN;
  END IF;

  UPDATE auth.users   SET created_at=v_birth, updated_at=v_birth WHERE id=v_mario;
  UPDATE public.profiles SET created_at=v_birth WHERE id=v_mario;
  UPDATE public.families SET created_at=v_birth, kind='shared' WHERE id=v_family;
  UPDATE public.family_members
     SET created_at=v_birth, role='owner', monthly_income_contribution=5000000
   WHERE family_id=v_family AND user_id=v_mario;
  UPDATE public.family_finance SET
     monthly_income=8000000, savings_goal_percent=12, current_cycle_anchor='2026-06-05',
     last_salary_confirmed_at='2026-06-05 09:00:00-03', updated_at=v_birth
   WHERE family_id=v_family;

  INSERT INTO auth.users(
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change)
  VALUES(
      v_partner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'valentina.rossi.sim@kenility.com', crypt('Simulado-2026!', gen_salt('bf')), v_join,
      v_join, v_join, '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Valentina Rossi"}'::jsonb, '', '', '', '');
  INSERT INTO auth.identities(provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES(v_partner::text, v_partner,
      jsonb_build_object('sub', v_partner::text, 'email', 'valentina.rossi.sim@kenility.com', 'email_verified', true),
      'email', v_join, v_join, v_join);
  UPDATE public.profiles SET
      display_name='Valentina Rossi', created_at=v_join, timezone='America/Argentina/Cordoba',
      avatar_animal='cat', onboarding_completed_at=v_join, previously_onboarded=true
    WHERE id=v_partner;
  INSERT INTO public.family_members(family_id, user_id, created_at, role, monthly_income_contribution)
  VALUES(v_family, v_partner, v_join, 'member', 3000000);

  INSERT INTO public.fixed_expenses(family_id,name,amount,kind,status,frequency,category_id,day_of_month,next_due_on,notify_days_before,created_at,updated_at) VALUES
    (v_family,'Alquiler',          2400000,'recurring','active','monthly','cac41c30-5972-4679-9eec-3b20a97ae605',10,'2026-07-10',3,v_birth,v_birth),
    (v_family,'Expensas',           480000,'recurring','active','monthly','a4dc6a6d-d034-4c8e-94a4-c27d967b9444',10,'2026-07-10',3,v_birth,v_birth),
    (v_family,'Internet + Cable',    64000,'recurring','active','monthly','a4dc6a6d-d034-4c8e-94a4-c27d967b9444',15,'2026-07-15',2,v_birth,v_birth),
    (v_family,'Celular',             41000,'recurring','active','monthly','a4dc6a6d-d034-4c8e-94a4-c27d967b9444',20,'2026-07-20',2,v_birth,v_birth),
    (v_family,'Gimnasio',            58000,'recurring','active','monthly','570bb329-f9e6-4e7b-b769-de577fe4e646', 5,'2026-07-05',2,v_birth,v_birth),
    (v_family,'Netflix + Spotify',   18500,'recurring','active','monthly','570bb329-f9e6-4e7b-b769-de577fe4e646', 8,'2026-07-08',1,v_birth,v_birth);

  INSERT INTO public.savings_goals(family_id,title,emoji,goal_amount,current_amount,target_months,is_active,created_at,updated_at) VALUES
    (v_family,'Vacaciones en Brasil','🏖️',4500000,2700000, 8,true,v_birth,                    now()),
    (v_family,'Fondo de emergencia', '🛟',3000000,1950000,10,true,v_birth + interval '20 days',now());
END $$;
