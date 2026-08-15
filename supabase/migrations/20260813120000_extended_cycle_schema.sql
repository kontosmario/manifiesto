-- Ciclo extendido · 1/5 — schema aditivo DORMANTE.
--
-- Contexto: docs/PRE-DEPLOY-V2-CICLO-EXTENDIDO.md.
-- Cuando pasa el día de cobro y el usuario no confirma, el ciclo se congela y
-- todo gasto posterior queda en limbo. El modelo correcto (decisión del owner):
-- "no cobraste ⇒ no hay ciclo nuevo, el actual se ESTIRA hasta que confirmes".
--
-- La mitad de saldo vivo es 100% cliente y necesita build. Esta tanda de
-- migraciones deja el backend LISTO y DORMANTE: nada cambia para el build de
-- producción, y cada usuario hace su propio cutover cuando el build V2 le
-- estampe `cycle_model = 'extended'` al confirmar el cobro.
--
-- Esta migración es puramente aditiva: dos columnas, cero backfill, cero
-- cambio de comportamiento.

-- `nominal_period_end`: el fin NOMINAL del ciclo (el payday configurado),
-- mientras `period_end` pasa a registrar el fin REAL (la confirmación).
-- Sin esto, la UI del build V2 no puede pintar los días de extensión de un
-- ciclo cerrado: derivarlo de `salary_payment_day` miente si el usuario
-- cambió su día de cobro después del cierre (doc §3.2).
-- Nullable y SIN backfill deliberadamente: los summaries viejos no saben cuál
-- era su fin nominal, y NULL es la respuesta honesta ("no registrado").
alter table public.monthly_summaries
  add column if not exists nominal_period_end date;

comment on column public.monthly_summaries.nominal_period_end is
  'Fin NOMINAL del ciclo (payday configurado). period_end es el fin REAL: con '
  'cycle_model=extended difiere cuando el cobro se confirmó tarde. NULL en '
  'summaries anteriores a 2026-08 (sin backfill: derivarlo miente si el '
  'usuario cambió su salary_payment_day).';

-- `cycle_model`: el gate per-family de toda la feature.
--   'nominal'  → comportamiento actual, byte por byte (default).
--   'extended' → el ciclo se estira hasta la confirmación del cobro.
-- Solo el cliente V2 lo escribe (en el mismo upsert del confirm de sueldo).
-- El cliente de producción NO puede escribirlo: su upsert de family_finance
-- arma el body con una lista FIJA de campos (destructuring explícito en
-- mobile/features/finance/family-finance.repository.ts), nunca un spread del
-- row — así que ni lo escribe ni lo pisa al guardar otros ajustes.
alter table public.family_finance
  add column if not exists cycle_model text not null default 'nominal';

comment on column public.family_finance.cycle_model is
  'Modelo de ciclo: nominal (congela en el payday, comportamiento histórico) o '
  'extended (el ciclo se estira hasta que se confirma el cobro). Lo activa el '
  'cliente V2 al confirmar; el backend queda dormante hasta entonces.';

-- `add constraint if not exists` no existe en Postgres → do-block idempotente
-- para que el replay del ledger no falle.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.family_finance'::regclass
      and conname = 'family_finance_cycle_model_check'
  ) then
    alter table public.family_finance
      add constraint family_finance_cycle_model_check
      check (cycle_model in ('nominal', 'extended'));
  end if;
end $$;

-- Sin grants ni cambios de RLS: ambas columnas heredan los de su tabla.
-- family_finance ya es update owner-only; monthly_summaries ya es select para
-- miembros del hogar.
