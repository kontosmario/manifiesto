-- i18n (2026-06-26): idioma preferido del usuario para localizar contenido
-- generado server-side (push notifications) cuando el usuario está offline.
-- El cliente lo sincroniza vía useLanguageSync (mismo patrón que timezone).
-- NULL → el servidor resuelve 'es' (fallback).

alter table public.profiles
  add column if not exists preferred_language text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_preferred_language_check'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_language_check
      check (preferred_language is null or preferred_language in ('es', 'en'));
  end if;
end $$;

comment on column public.profiles.preferred_language is
  'Idioma preferido del usuario (es|en). Sincronizado por el cliente (useLanguageSync). El servidor lo usa para localizar push notifications. NULL → resuelve es.';
