-- Pin search_path on 4 trigger / helper functions that drifted from
-- the project standard. Without an explicit search_path, a future
-- `public` extension or shadowing function could change behavior or
-- open a privilege-escalation vector. The other 99+ functions in
-- the codebase already pin search_path; these were missed.
--
-- Closes P1 #9 of 2026-05-31 code review.

alter function public.notify_income_event_change() set search_path = public, pg_catalog;
alter function public.prevent_categories_delete() set search_path = public, pg_catalog;
alter function public.profiles_bootstrap_fields() set search_path = public, pg_catalog;
alter function public.touch_advisor_signal_dismissals_updated_at() set search_path = public, pg_catalog;
