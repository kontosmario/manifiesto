-- Onboarding foundation: gate via profiles.onboarding_completed_at,
-- random animal avatar seeded on profile creation, and server-side
-- name sanitization so emojis / control chars / HTML meta never reach
-- the UI regardless of client guard.

-- 1. schema
alter table public.profiles
  add column if not exists avatar_animal text null,
  add column if not exists onboarding_completed_at timestamptz null;

create index if not exists profiles_onboarding_idx
  on public.profiles (onboarding_completed_at)
  where onboarding_completed_at is null;

-- 2. animal pool. The slug list must stay in sync with the SVG assets
--    shipped in mobile/assets/avatars/.
create table if not exists public.avatar_animals (
  slug text primary key,
  label text not null
);

insert into public.avatar_animals (slug, label) values
  ('alpaca', 'Alpaca'), ('anteater', 'Oso hormiguero'), ('bat', 'Murcielago'),
  ('beetle', 'Escarabajo'), ('butterfly', 'Mariposa'), ('camel', 'Camello'),
  ('cat', 'Gato'), ('chameleon', 'Camaleon'), ('cobra', 'Cobra'),
  ('crab', 'Cangrejo'), ('crocodile', 'Cocodrilo'), ('dog', 'Perro'),
  ('duck', 'Pato'), ('elephant', 'Elefante'), ('elk', 'Alce'),
  ('fish', 'Pez'), ('frog', 'Rana'), ('giraffe', 'Jirafa'),
  ('hippo', 'Hipopotamo'), ('husky', 'Husky'), ('kangaroo', 'Canguro'),
  ('lion', 'Leon'), ('macaw', 'Guacamayo'), ('manatee', 'Manati'),
  ('mianyang', 'Carnero'), ('monkey', 'Mono'), ('mouse', 'Raton'),
  ('octopus', 'Pulpo'), ('ostrich', 'Avestruz'), ('owl', 'Buho'),
  ('panda', 'Panda'), ('pelican', 'Pelicano'), ('penguin', 'Pinguino'),
  ('pig', 'Cerdo'), ('raccoon', 'Mapache'), ('rhino', 'Rinoceronte'),
  ('rooster', 'Gallo'), ('sea-ray', 'Mantarraya'), ('shark', 'Tiburon'),
  ('sloth', 'Oso perezoso'), ('snake', 'Serpiente'), ('sparrow', 'Gorrion'),
  ('spider', 'Arana'), ('squirrel', 'Ardilla'), ('swan', 'Cisne'),
  ('tiger', 'Tigre'), ('toucan', 'Tucan'), ('turkey', 'Pavo'),
  ('whale', 'Ballena'), ('zebra', 'Cebra')
on conflict (slug) do update set label = excluded.label;

alter table public.avatar_animals enable row level security;

drop policy if exists "avatar_animals_select_all" on public.avatar_animals;
create policy "avatar_animals_select_all"
on public.avatar_animals for select
to authenticated using (true);

alter table public.profiles
  drop constraint if exists profiles_avatar_animal_fk;
alter table public.profiles
  add constraint profiles_avatar_animal_fk
  foreign key (avatar_animal) references public.avatar_animals(slug)
  on delete set null;

-- 3. sanitize_display_name(text). Whitelist approach: keeps Unicode
--    letters, digits, spaces, hyphens, apostrophes and periods. Every
--    other char (emoji, pictograph, HTML meta, backtick, control) gets
--    dropped.
create or replace function public.sanitize_display_name(raw text)
returns text
language plpgsql
immutable
as $$
declare
  v text := coalesce(raw, '');
begin
  v := regexp_replace(v, '[^[:alpha:][:digit:] \-''.]', '', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');
  v := btrim(v);
  return v;
end;
$$;

-- 4. profiles trigger: sanitize + seed avatar on insert / name update
create or replace function public.profiles_bootstrap_fields()
returns trigger
language plpgsql
as $$
declare
  v_slug text;
begin
  new.display_name := public.sanitize_display_name(new.display_name);
  if length(new.display_name) = 0 then
    new.display_name := 'Usuario';
  end if;
  if length(new.display_name) > 40 then
    new.display_name := substr(new.display_name, 1, 40);
  end if;

  if tg_op = 'INSERT' or new.avatar_animal is null then
    select slug into v_slug from public.avatar_animals order by random() limit 1;
    new.avatar_animal := v_slug;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_bootstrap on public.profiles;
create trigger trg_profiles_bootstrap
before insert or update of display_name, avatar_animal on public.profiles
for each row execute function public.profiles_bootstrap_fields();

-- 5. Backfill: seed a random animal on any existing profile that
--    doesn't have one, and mark users who already have a family with
--    monthly_income > 0 as onboarding-complete (so they skip the
--    wizard the next time they log in).
update public.profiles p
set avatar_animal = (
  select slug from public.avatar_animals order by random() limit 1
)
where p.avatar_animal is null;

update public.profiles p
set onboarding_completed_at = now()
where p.onboarding_completed_at is null
  and exists (
    select 1
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    where fm.user_id = p.id
      and ff.monthly_income > 0
  );
