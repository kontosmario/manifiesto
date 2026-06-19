-- Moneda local del hogar + cache de cotizaciones USD.
--
-- Contexto: el hogar opera en UNA moneda (ARS por default; el resto de LatAm
-- usa "$" igual, así que el formateo no cambia — solo cambia la cotización USD).
-- La cotización se trae automáticamente del backend (edge function `usd-rate`):
-- para ARS pega a dolarapi (blue), para el resto a open.er-api. Antes el rate
-- era 100% manual (family_finance.usd_rate); ahora el manual queda como
-- override opcional y el default es el automático según `local_currency`.

-- ─── 1. local_currency en family_finance ────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'family_finance'
      and column_name = 'local_currency'
  ) then
    alter table public.family_finance
      add column local_currency text not null default 'ARS'
        check (local_currency in
          ('ARS', 'CLP', 'COP', 'MXN', 'UYU', 'PEN', 'BRL', 'USD'));
  end if;
exception
  when duplicate_column then null;
end $$;

comment on column public.family_finance.local_currency is
  'Moneda operativa del hogar (ISO 4217). Default ARS. Determina contra qué moneda se trae la cotización USD (edge function usd-rate).';

-- ─── 2. Cache compartido de cotizaciones USD ─────────────────────────────────
-- rate_per_usd = unidades de moneda local por 1 USD (ej. ARS 1480 → 1 USD).
-- Lo escribe SOLO el edge function `usd-rate` (service_role); los clientes lo
-- consumen a través de esa function (que cachea con TTL + fallback al último
-- valor si la fuente está caída), no leyendo la tabla directo.
create table if not exists public.usd_rate_cache (
  currency text primary key
    check (currency in ('ARS', 'CLP', 'COP', 'MXN', 'UYU', 'PEN', 'BRL', 'USD')),
  rate_per_usd numeric not null check (rate_per_usd > 0),
  source text not null,
  as_of timestamptz not null,
  updated_at timestamptz not null default now()
);

comment on table public.usd_rate_cache is
  'Cache de cotizaciones USD por moneda. rate_per_usd = moneda local por 1 USD. Escribe solo el edge function usd-rate (service_role).';

alter table public.usd_rate_cache enable row level security;

-- Lectura para authenticated (por si en el futuro se lee directo); la escritura
-- queda solo para service_role al NO declarar policy de insert/update.
drop policy if exists "usd_rate_cache_select_authenticated" on public.usd_rate_cache;
create policy "usd_rate_cache_select_authenticated"
  on public.usd_rate_cache
  for select
  to authenticated
  using (true);
