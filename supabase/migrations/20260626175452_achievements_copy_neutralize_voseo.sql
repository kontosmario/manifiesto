-- Neutraliza voseo rioplatense → español neutro LatAm en el catálogo de logros.
-- Solo 3 filas tenían marcadores (sabés, sos/vos, acá). Resto del catálogo ya era neutro.
update achievements_catalog set body = 'Tu primer fijo cargado: ya sabes qué se va sí o sí.'
  where code = 'first_fixed';
update achievements_catalog set body = '90 días sin perderte uno. Esto ya eres tú.'
  where code = 'streak_90';
update achievements_catalog set body = 'La mitad ya es tuya. De aquí se ve la cima.'
  where code = 'goal_50';
