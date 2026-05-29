-- Repair: achievements_catalog no es legible por el cliente autenticado
-- en la base remota.
--
-- Síntoma (galería "Logros"): muestra "1 / 0" — 1 earned, 0 en catálogo.
-- El cliente autenticado lee su fila de `achievements_earned`
-- (policy `earned_select_own` OK) pero recibe 0 filas de
-- `achievements_catalog`. Como la fila earned tiene FK al `code` del
-- catálogo, el catálogo TIENE filas — el award las usó (corre como
-- service_role, bypassa RLS). Conclusión: en la base remota falta (o se
-- perdió) la policy `catalog_select_authenticated`, así que RLS le
-- niega el SELECT al rol `authenticated` → galería vacía.
--
-- Esta migración es idempotente y no destructiva:
--   1. Re-asegura RLS + recrea la policy de SELECT del catálogo.
--   2. Re-siembra el catálogo con `on conflict do update` (corrige
--      además el caso —improbable— de que falten filas, sin duplicar
--      ni borrar nada).
-- Replica el seed canónico de:
--   · 20260520000000_achievements.sql
--   · 20260521000000_goal_milestone_achievements.sql

-- ─── 1. RLS + policy de lectura del catálogo ─────────────────────
alter table public.achievements_catalog enable row level security;

drop policy if exists "catalog_select_authenticated" on public.achievements_catalog;
create policy "catalog_select_authenticated"
  on public.achievements_catalog
  for select
  to authenticated
  using (true);

-- ─── 2. Re-seed idempotente del catálogo ─────────────────────────
insert into public.achievements_catalog (code, title, body, icon, tier, sort_order)
values
  ('first_expense', 'El primer paso',
    'Cargaste tu primer gasto. Bienvenida al control.',
    '🌱', 'bronze', 10),
  ('first_fixed', 'El esqueleto del mes',
    'Agregaste tu primer gasto fijo. Ya sabés qué se va sí o sí.',
    '📅', 'bronze', 20),
  ('first_paid_fixed', 'Fijo en orden',
    'Registraste el primer pago de un fijo. Cero deuda mental.',
    '✅', 'bronze', 30),
  ('first_goal', 'Norte definido',
    'Creaste tu primera meta de ahorro. Saber para qué ayuda.',
    '🎯', 'bronze', 40),
  ('streak_7', 'Una semana firme',
    '7 días seguidos cargando. La constancia es la verdadera magia.',
    '🔥', 'bronze', 50),
  ('streak_14', 'Dos semanas',
    '14 días sin saltearte ni uno. Ya empieza a ser hábito.',
    '🔥', 'silver', 60),
  ('streak_30', 'Un mes imparable',
    '30 días seguidos. La racha empieza a cuidarse sola.',
    '🔥', 'silver', 70),
  ('streak_60', 'Dos meses',
    '60 días mes a mes sin perderse uno. Disciplinada.',
    '🔥', 'gold', 80),
  ('streak_90', 'Leyenda',
    '90 días sin saltarse uno. Esto ya es identidad.',
    '👑', 'legendary', 90),
  ('goal_completed', 'Meta alcanzada',
    'Llegaste a una meta entera. Lo planeado se hizo plata.',
    '🏆', 'gold', 100),
  ('first_cycle_under_budget', 'Cerraste bajo cupo',
    'Tu primer mes cerrado gastando menos de lo que tenías. Margen real.',
    '💰', 'silver', 110),
  ('goal_25', 'Primer empujón',
    'Llevás un cuarto de la meta. Lo más difícil es arrancar.',
    '🌱', 'bronze', 96),
  ('goal_50', 'Mitad de camino',
    'La mitad de la meta ya está en tu poder. Imparable.',
    '🌿', 'silver', 97),
  ('goal_75', 'Tres cuartos',
    'Tres cuartos. La meta deja de ser idea y se vuelve agenda.',
    '🌳', 'gold', 98)
on conflict (code) do update
  set title = excluded.title,
      body = excluded.body,
      icon = excluded.icon,
      tier = excluded.tier,
      sort_order = excluded.sort_order,
      is_active = true;
