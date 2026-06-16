-- Controles de PUSH del Asistente Financiero (cross-device).
-- ------------------------------------------------------------------
-- Decisión owner 2026-06-15: las prefs de delivery de push del asistente
-- van en notification_preferences (mismo dominio que el resto del push,
-- cross-device por estar en la cuenta) — NO per-device. Hardcodes que
-- reemplazan (use-advisor-notification-sync.ts):
--   · advisor_push_enabled  → "solo dentro de la app" (off = sin push)
--   · advisor_quiet_start/end → quiet hours (antes fijo 22→08)
--   · advisor_push_min_urgency → umbral de urgencia que dispara push
--     (antes fijo 'alta'); orden baja < media < alta.

alter table public.notification_preferences
  add column if not exists advisor_push_enabled boolean not null default true,
  add column if not exists advisor_quiet_start smallint not null default 22,
  add column if not exists advisor_quiet_end smallint not null default 8,
  add column if not exists advisor_push_min_urgency text not null default 'alta';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notification_preferences_advisor_urgency_chk'
  ) then
    alter table public.notification_preferences
      add constraint notification_preferences_advisor_urgency_chk
      check (advisor_push_min_urgency in ('alta', 'media', 'baja'));
  end if;
end $$;
