-- supabase/migrations/20260620250000_currency_opt_in_no_default.sql
--
-- La conversión a dólares pasa a ser OPT-IN y sin asumir país.
--
-- Owner: "no deberíamos setear por default ARS, si soy de Colombia qué sentido
-- tiene". Correcto — defaultear local_currency = 'ARS' (20260620230000) hacía que
-- una cuenta nueva no-argentina heredara ARS y convirtiera con el blue, mal.
--
-- Cambios:
--   1. local_currency DROP DEFAULT → filas nuevas nacen NULL (sin moneda). La
--      conversión solo aplica cuando el usuario elige explícitamente su moneda.
--   2. usd_rate_enabled DEFAULT false → la feature arranca apagada (opt-in). El
--      usuario la prende + elige moneda desde el sheet de Settings.
--
-- Filas existentes conservan sus valores (cuentas AR actuales: local_currency =
-- 'ARS', usd_rate_enabled = true) — son todas argentinas, así que está bien. El
-- check constraint ya admite NULL (NULL in (...) → NULL → pasa). El RPC
-- home_snapshot() ya proyecta ambas columnas (20260620240000): sin cambios ahí.

ALTER TABLE public.family_finance
  ALTER COLUMN local_currency DROP DEFAULT;

ALTER TABLE public.family_finance
  ALTER COLUMN usd_rate_enabled SET DEFAULT false;
