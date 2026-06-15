-- user_advisor_prefs — preferencias EXPLÍCITAS del Asistente Financiero
-- ------------------------------------------------------------------
-- Hasta ahora toda la personalización del asistente era IMPLÍCITA (se
-- infiere de advisor_interactions). Esta tabla agrega override explícito:
--   · persona_override: el usuario fija su perfil en vez de la inferencia
--     (inferPersona). use_inferred_persona=false activa el override.
--   · advisor_enabled: kill-switch total (off = no se computan señales).
-- Solo COMPORTAMIENTO del asistente. Las prefs de DELIVERY de push del
-- asistente (quiet hours, urgencia mínima, solo-in-app) viven en
-- notification_preferences (cross-device, mismo dominio que el resto del
-- push). RLS espejo de notification_preferences (select/insert/update own).

create table if not exists public.user_advisor_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  use_inferred_persona boolean not null default true,
  persona_override text
    check (persona_override in ('planner', 'firefighter', 'avoider', 'optimizer')),
  advisor_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_advisor_prefs enable row level security;

create policy user_advisor_prefs_select_own
  on public.user_advisor_prefs for select
  using (auth.uid() = user_id);

create policy user_advisor_prefs_insert_own
  on public.user_advisor_prefs for insert
  with check (auth.uid() = user_id);

create policy user_advisor_prefs_update_own
  on public.user_advisor_prefs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.user_advisor_prefs to authenticated;
