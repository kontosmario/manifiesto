-- supabase/migrations/20260614002000_sprint_o_push_pii_reduction.sql
--
-- Sprint O · Audit #8 finding O-1 (2026-06-14) — PII leak in push payloads.
--
-- Problem:
--   `list_pending_notifications('fixed_upcoming')` (added in
--   20260512060000_notifications_pending_helpers.sql) builds rows that the
--   notifications-orchestrator forwards verbatim to APNs/FCM via Expo:
--     title = "<commitment_name> vence hoy"   ← leaks merchant / lender name
--     body  = "$<exact_amount>"               ← leaks exact peso amount
--     metadata.amount = <exact_amount>        ← same, in payload metadata
--
--   APNs and FCM are NOT end-to-end encrypted. Apple/Google staff, the OS
--   notification UI on the lock screen, third-party companions (CarPlay,
--   Watch, OS-level mirroring), shoulder-surfers, and any malware with
--   notification access see the full financial commitment by name + amount.
--
--   `morning_checkins` already only sends a generic body — there the
--   leak is the first name embedded in the title ("Buen día, María"),
--   which is social context, not financial. We keep that as a deliberate
--   product-vs-privacy trade-off (greeting feels personal, and a name
--   leak is far below an amount/lender-name leak on the sensitivity
--   scale).
--
--   Other kinds (`midday_checkins`, `evening_checkins`) already emit
--   only generic strings and need no change.
--
-- Fix:
--   Recreate `list_pending_notifications` so the `fixed_upcoming` branch
--   emits a generic title/body and a metadata blob that contains only
--   the route + fixed_expense_id (so the mobile client can deep-link
--   into the commitment screen). The actual amount and name stay
--   server-side; the client re-reads them via RLS once the user opens
--   the app and is already authenticated.
--
-- Mobile read-side compatibility:
--   `mobile/features/insights/control-signals.ts` reads `metadata.amount`
--   ONLY from `zombie_alert` notifications, not from `fixed_upcoming`.
--   `mobile/utils/notifications.ts` groups `fixed_upcoming` under "fijos"
--   without reading the metadata. No UI surfaces today read
--   `metadata.amount` from a `fixed_upcoming` row, so dropping the
--   field is safe. The notifications feed renders the persisted
--   notification row's `title` / `body`, both of which become the new
--   generic strings — that's the intended behavior, since the persisted
--   row is also forwarded to push.
--
-- Snapshot caveat:
--   `sql/supabase.sql` is a generated snapshot — not edited here. It
--   will be regenerated next time the snapshot script runs.
--
-- Idempotent: CREATE OR REPLACE.

create or replace function public.list_pending_notifications(p_kind text)
returns table (
  family_id uuid,
  user_id uuid,
  title text,
  body text,
  kind text,
  severity text,
  metadata jsonb,
  dedup_key text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_today_ar date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if p_kind = 'morning_checkins' then
    return query
    select
      fm.family_id,
      fm.user_id,
      -- Greeting: first name is acceptable PII (social, not financial).
      -- See migration header for the trade-off rationale.
      'Buen día, ' || split_part(coalesce(p.display_name, 'vos'), ' ', 1) as title,
      'Hoy tenés ~$' || to_char(round(greatest(0, (ff.monthly_income - coalesce(
        (select sum(fe2.amount) from public.fixed_expenses fe2
         where fe2.family_id = fm.family_id and coalesce(fe2.status,'active')='active'
         and coalesce(fe2.frequency,'monthly')='monthly'), 0)) / 30.0)), 'FM999,999,999')
        || ' para moverte con margen.' as body,
      'checkin_morning' as kind,
      'info' as severity,
      jsonb_build_object('route', '/') as metadata,
      'checkin_morning:' || fm.family_id::text || ':' || fm.user_id::text
        || ':' || v_today_ar::text as dedup_key
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    left join public.profiles p on p.id = fm.user_id
    where coalesce(ff.monthly_income, 0) > 0
      and fm.role <> 'blocked';

  elsif p_kind = 'midday_checkins' then
    return query
    select
      fm.family_id,
      fm.user_id,
      'Medio día' as title,
      'Pasá por la app y revisá cómo vas hoy.' as body,
      'checkin_midday' as kind,
      'info' as severity,
      jsonb_build_object('route', '/') as metadata,
      'checkin_midday:' || fm.family_id::text || ':' || fm.user_id::text
        || ':' || v_today_ar::text as dedup_key
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    where coalesce(ff.monthly_income, 0) > 0
      and fm.role <> 'blocked';

  elsif p_kind = 'evening_checkins' then
    return query
    select
      fm.family_id,
      fm.user_id,
      'Cierre del día' as title,
      'Anotá lo último de hoy y mantené la racha.' as body,
      'checkin_evening' as kind,
      'info' as severity,
      jsonb_build_object('route', '/expenses') as metadata,
      'checkin_evening:' || fm.family_id::text || ':' || fm.user_id::text
        || ':' || v_today_ar::text as dedup_key
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    where coalesce(ff.monthly_income, 0) > 0
      and fm.role <> 'blocked';

  elsif p_kind = 'fixed_upcoming' then
    -- Sprint O · Audit #8 O-1: GENERIC title/body and minimal metadata.
    -- APNs/FCM are NOT E2E encrypted — never include the commitment
    -- name or the amount in the push payload. The mobile client reads
    -- the actual amount via RLS once the user opens the app.
    return query
    select
      fe.family_id,
      null::uuid as user_id,
      'Tenés un compromiso por vencer' as title,
      'Abrí la app para ver los detalles' as body,
      'fixed_upcoming' as kind,
      'warning' as severity,
      jsonb_build_object(
        'route', '/fixed-expenses',
        'fixed_expense_id', fe.id
      ) as metadata,
      'fixed_upcoming:' || fe.id::text || ':' || v_today_ar::text as dedup_key
    from public.fixed_expenses fe
    where coalesce(fe.status, 'active') = 'active'
      and fe.next_due_on between v_today_ar and v_today_ar + 1;

  -- Otros kinds: streak_at_risk, streak_broken, weekly_insights se
  -- pueden agregar incrementalmente. Por ahora devolvemos vacío y la
  -- Edge orchestrator los maneja como no-op para esos kinds.
  end if;
end;
$$;

revoke all on function public.list_pending_notifications(text) from public;
grant execute on function public.list_pending_notifications(text) to service_role;

comment on function public.list_pending_notifications(text) is
  'Sprint O · Audit #8 O-1 (2026-06-14): fixed_upcoming push payloads no '
  'longer leak commitment name or amount (APNs/FCM not E2E encrypted). '
  'Metadata only carries route + fixed_expense_id so the client can '
  'deep-link; the mobile app reads the real amount via RLS on open.';
