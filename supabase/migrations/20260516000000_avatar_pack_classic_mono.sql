-- Avatar pack swap (segunda iteración): pasamos del pack relief
-- argentino multicolor (24 slugs: yaguareté, ñandú, cóndor, etc) al
-- pack monocromo clásico de svgrepo (42 slugs en inglés, siluetas
-- planas con currentColor tintado por theme). El relief pack tenía
-- buena identidad visual pero era más cargado de lo que el usuario
-- quería; este pack es "más sencillo" y también más barato de
-- renderear (peso del bundle: 3.9MB → 268KB).
--
-- Slugs excluidos a propósito: beetle, chameleon, cobra, sea-ray,
-- sloth, snake, spider, toucan (los 8 que el usuario no quiso).
--
-- Migration order:
--   1) UPSERT los 42 slugs nuevos.
--   2) Re-mapear las 24 slugs del pack relief actual hacia los
--      slugs nuevos cuando hay equivalencia clara (ej:
--      mariposa → butterfly, ballena → whale, yaguareté → tiger).
--   3) DELETE las slugs viejas. El FK ON DELETE SET NULL nullifica
--      los perfiles que apuntaban a slugs sin equivalencia y el
--      BEFORE UPDATE trigger `trg_profiles_bootstrap` les asigna
--      una slug random nueva.

-- 1. Insert / refresh new pack. ON CONFLICT keeps labels in sync.
insert into public.avatar_animals (slug, label) values
  ('alpaca',     'Alpaca'),
  ('anteater',   'Oso hormiguero'),
  ('bat',        'Murcielago'),
  ('butterfly',  'Mariposa'),
  ('camel',      'Camello'),
  ('cat',        'Gato'),
  ('cow',        'Vaca'),
  ('crab',       'Cangrejo'),
  ('crocodile',  'Cocodrilo'),
  ('dog',        'Perro'),
  ('duck',       'Pato'),
  ('elephant',   'Elefante'),
  ('elk',        'Alce'),
  ('fish',       'Pez'),
  ('frog',       'Rana'),
  ('giraffe',    'Jirafa'),
  ('hippo',      'Hipopotamo'),
  ('husky',      'Husky'),
  ('kangaroo',   'Canguro'),
  ('lion',       'Leon'),
  ('macaw',      'Guacamayo'),
  ('manatee',    'Manati'),
  ('mianyang',   'Carnero'),
  ('monkey',     'Mono'),
  ('mouse',      'Raton'),
  ('octopus',    'Pulpo'),
  ('ostrich',    'Avestruz'),
  ('owl',        'Buho'),
  ('panda',      'Panda'),
  ('pelican',    'Pelicano'),
  ('penguin',    'Pinguino'),
  ('pig',        'Cerdo'),
  ('rabbit',     'Conejo'),
  ('raccoon',    'Mapache'),
  ('rhino',      'Rinoceronte'),
  ('rooster',    'Gallo'),
  ('shark',      'Tiburon'),
  ('squirrel',   'Ardilla'),
  ('swan',       'Cisne'),
  ('tiger',      'Tigre'),
  ('turtle',     'Tortuga'),
  ('whale',      'Ballena')
on conflict (slug) do update set label = excluded.label;

-- 2. Map current relief-pack slugs → new pack equivalents where the
--    correspondence is obvious. Anything not listed falls through to
--    step 3 and gets nullified + reassigned random.
update public.profiles
   set avatar_animal = case avatar_animal
     when 'alpaca'         then 'alpaca'
     when 'ballena'        then 'whale'
     when 'capibara'       then 'mouse'      -- rodent closest
     when 'cerdo'          then 'pig'
     when 'colibri'        then 'macaw'      -- tropical bird closest
     when 'condor'         then 'owl'        -- large bird closest
     when 'flamenco'       then 'pelican'    -- pink-ish wading bird closest
     when 'gallina'        then 'rooster'
     when 'gato'           then 'cat'
     when 'hornero'        then 'owl'        -- bird closest
     when 'lechuza'        then 'owl'
     when 'lobo-gris'      then 'husky'      -- canid closest
     when 'lobo-marino'    then 'manatee'    -- marine mammal closest
     when 'mariposa'       then 'butterfly'
     when 'mono-aullador'  then 'monkey'
     when 'nandu'          then 'ostrich'
     when 'nutria'         then 'manatee'    -- aquatic mammal closest
     when 'pato'           then 'duck'
     when 'perro'          then 'dog'
     when 'pinguino'       then 'penguin'
     when 'puma'           then 'lion'       -- big cat closest
     when 'tatu-carreta'   then 'anteater'   -- south american mammal closest
     when 'tortuga'        then 'turtle'
     when 'yaguarete'      then 'tiger'      -- spotted big cat closest
     else avatar_animal
   end
 where avatar_animal in (
   'alpaca','ballena','capibara','cerdo','colibri','condor','flamenco',
   'gallina','gato','hornero','lechuza','lobo-gris','lobo-marino',
   'mariposa','mono-aullador','nandu','nutria','pato','perro',
   'pinguino','puma','tatu-carreta','tortuga','yaguarete'
 );

-- 3. Drop every slug that doesn't belong to the new pack. FK ON DELETE
--    SET NULL nullifies any remaining profile reference; the
--    bootstrap trigger reassigns a fresh random slug from the new
--    pool. After step 2 there shouldn't be many of those — the
--    explicit mapping above covers all 24 of the relief pack's slugs.
delete from public.avatar_animals
 where slug not in (
   'alpaca','anteater','bat','butterfly','camel','cat','cow','crab',
   'crocodile','dog','duck','elephant','elk','fish','frog','giraffe',
   'hippo','husky','kangaroo','lion','macaw','manatee','mianyang',
   'monkey','mouse','octopus','ostrich','owl','panda','pelican',
   'penguin','pig','rabbit','raccoon','rhino','rooster','shark',
   'squirrel','swan','tiger','turtle','whale'
 );

-- 4. Defensive backfill: any profile still null gets a random pick.
update public.profiles p
   set avatar_animal = (
     select slug from public.avatar_animals order by random() limit 1
   )
 where p.avatar_animal is null;
