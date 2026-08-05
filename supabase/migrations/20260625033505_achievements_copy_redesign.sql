-- WHAT: Reescribe title/body de los 18 logros del catálogo con copy único,
--       Rioplatense y memorable (rediseño de logros 2026-06-25). Cada título
--       distinto; microcopy que celebra el logro concreto y conecta con el
--       hábito. NO toca code, tier, sort_order, icon ni las condiciones de
--       desbloqueo (triggers server-side intactos). El `icon` (emoji) queda
--       de fallback; los íconos SVG únicos viven en el cliente (registry
--       `code → AchievementIcon`).
-- WHY:  Antes los íconos eran emojis reusados (🔥×4, 🌱×3, …) y varios títulos
--       sonaban genéricos. Cada hito ahora se siente único y especial.
-- Idempotente: UPDATE puro por code; re-aplicar da el mismo resultado.

update public.achievements_catalog as c set
  title = v.title,
  body = v.body
from (values
  ('first_expense',             'El primer brote',      'Cargaste tu primer gasto. Desde hoy, nada se te escapa.'),
  ('first_fixed',               'El armazón del mes',   'Tu primer fijo cargado: ya sabés qué se va sí o sí.'),
  ('first_paid_fixed',          'Cuenta saldada',       'Pagaste tu primer fijo y lo registraste. Cabeza liviana.'),
  ('first_goal',                'Le pusiste nombre',    'Tu primera meta tiene rumbo. Ahorrar para algo cambia todo.'),
  ('streak_7',                  'Siete al hilo',        'Una semana sin saltearte uno. El hábito ya asoma.'),
  ('streak_14',                 'Dos semanas en pie',   'Catorce días firmes. Ya no es esfuerzo, es costumbre.'),
  ('streak_30',                 'Un mes sin fallar',    '30 días seguidos. Esto ya echó raíces.'),
  ('streak_60',                 'Dos meses de raíz',    '60 días. La constancia ya tiene tronco propio.'),
  ('streak_90',                 'Leyenda viva',         '90 días sin perderte uno. Esto ya sos vos.'),
  ('goal_25',                   'Primer cuarto',        'Un cuarto de tu meta, juntado. Arrancar era lo difícil.'),
  ('goal_50',                   'Mitad y subiendo',     'La mitad ya es tuya. De acá se ve la cima.'),
  ('goal_75',                   'Casi en la mano',      'Tres cuartos. La meta dejó de ser idea.'),
  ('goal_completed',            'Meta florecida',       'Llegaste entera. Lo que planeaste, se hizo plata.'),
  ('first_cycle_under_budget',  'Te sobró mes',         'Cerraste tu primer ciclo gastando menos. Margen real, en tu bolsillo.'),
  ('no_spend_cycle_3',          'Tres días en calma',   'Tres jornadas sin gastar en un ciclo. El freno también se entrena.'),
  ('no_spend_cycle_7',          'Semana serena',        'Siete días sin gasto en el ciclo. Ya es un ritmo.'),
  ('no_spend_cycle_15',         'Medio ciclo zen',      'Quince días quietos. La mitad del mes, en paz.'),
  ('no_spend_lifetime_50',      'Cincuenta sin gastar', '50 días sin gasto desde que arrancaste. Veterana del freno.')
) as v(code, title, body)
where c.code = v.code;
