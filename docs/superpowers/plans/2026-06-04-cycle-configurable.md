# Ciclo Configurable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir 4 tipos de ciclo de cobro (mensual / quincenal / semanal / custom) sin romper la app existente: familias actuales quedan en `monthly` por default silencioso, opción visible en Onboarding y en Settings.

**Architecture:** Una columna `cycle_type` + dos columnas auxiliares (`cycle_anchor_date`, `cycle_length_days`) en `family_finance`. Dos regímenes internos: `monthly` (month-anchored, lo de hoy) y rolling-N días (los otros tres). Helper SQL `compute_pay_cycle` centraliza la lógica plpgsql; `mobile/utils/pay-cycle.ts` la centraliza en TS. API pública `usePayCycle` queda intacta — todos los consumidores del ciclo no cambian.

**Tech Stack:** TypeScript, React Native + Expo SDK 54, Supabase (Postgres + plpgsql + TanStack React Query), Reanimated 3, Vitest (env node).

**Spec aprobado**: [2026-06-04-cycle-configurable-design.md](../specs/2026-06-04-cycle-configurable-design.md)

---

## File Structure

### Crear

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260604120000_cycle_config_support.sql` | Migración: columnas + check constraint + helper `compute_pay_cycle` + update de `home_snapshot` y `try_close_previous_cycle` |
| `mobile/utils/date-format.ts` | `MONTH_SHORT` extraído (hoy duplicado en use-fijos-controller y otros) + helpers de fecha es-AR |
| `mobile/utils/format-cycle-label.ts` | `formatCycleLabel(cycle, cycleType)` + `formatCycleSummary(config)` |
| `mobile/utils/finance-cycle-config.ts` | Tipo `FinanceCycleConfig` (discriminated union) + helper `financeToCycleConfig(finance)` |
| `mobile/components/ui/base-month-calendar.tsx` | Grilla pura de mes + selección de día (extraída de GastosMonthCalendar) |
| `mobile/components/finance/cycle-config-section.tsx` | `<CycleConfigSection value onChange>` — 4 chips + campos condicionales |
| `mobile/screens/settings/cycle-config-screen.tsx` | Screen con `<CycleConfigSection>` standalone + botón guardar |
| `mobile/app/(app)/settings/cycle-config.tsx` | Route file para la screen |
| `tests/unit/pay-cycle.test.ts` | Unit del módulo `pay-cycle.ts` (no existe hoy) |
| `tests/unit/format-cycle-label.test.ts` | Unit del helper de label |

### Modificar

| Archivo | Cambio |
|---|---|
| `mobile/features/finance/family-finance.model.ts` | Agregar 3 campos al storage + input + validador |
| `mobile/utils/pay-cycle.ts` | Split en `computeMonthAnchored` + `computeRollingN` + dispatcher por `FinanceCycleConfig` |
| `mobile/hooks/use-pay-cycle.ts` | Leer nuevos campos vía `financeToCycleConfig` |
| `mobile/components/gastos/gastos-month-calendar.tsx` | Delegar grilla a `BaseMonthCalendar`, mantener API previa |
| `mobile/components/home/onboarding/step-income.tsx` | Reemplazar `MonthDayPicker` por `<CycleConfigSection>` |
| `mobile/screens/settings/family-admin-screen.tsx` | Nueva fila "Ciclo de cobro" con navigation a `cycle-config-screen` |
| `mobile/features/fijos/use-fijos-controller.ts` | Usar `formatCycleLabel`, deprecar `MONTH_SHORT` local |
| Otros consumidores del cycle label | Migración a `formatCycleLabel` (Task 14) |

---

## Phase 1 — Backend foundation (SQL)

### Task 1: Migración — columnas + check + compute_pay_cycle helper

**Files:**
- Create: `supabase/migrations/20260604120000_cycle_config_support.sql`

- [ ] **Step 1: Crear la migración con columnas + helper plpgsql**

```sql
-- mobile/supabase/migrations/20260604120000_cycle_config_support.sql
--
-- Cycle config support: 4 tipos de ciclo (monthly/biweekly/weekly/custom).
-- Default 'monthly' preserva el comportamiento previo para todas las
-- familias existentes. Helper `compute_pay_cycle` centraliza la lógica
-- — usado por home_snapshot, try_close_previous_cycle, y cualquier RPC
-- futura.
--
-- Spec: docs/superpowers/specs/2026-06-04-cycle-configurable-design.md

alter table public.family_finance
  add column if not exists cycle_type text not null default 'monthly'
    check (cycle_type in ('monthly','biweekly','weekly','custom')),
  add column if not exists cycle_anchor_date date null,
  add column if not exists cycle_length_days smallint null
    check (cycle_length_days is null or cycle_length_days between 1 and 365);

alter table public.family_finance
  drop constraint if exists family_finance_cycle_config_valid;
alter table public.family_finance
  add constraint family_finance_cycle_config_valid check (
    (cycle_type = 'monthly'
        and cycle_anchor_date is null
        and cycle_length_days is null)
    or
    (cycle_type in ('biweekly','weekly','custom')
        and cycle_anchor_date is not null
        and cycle_length_days is not null
        and ((cycle_type = 'biweekly' and cycle_length_days = 14)
          or (cycle_type = 'weekly'   and cycle_length_days = 7)
          or (cycle_type = 'custom')))
  );

create or replace function public.compute_pay_cycle(
  p_today date,
  p_cycle_type text,
  p_salary_payment_day smallint,
  p_cycle_anchor_date date,
  p_cycle_length_days smallint
) returns table (cycle_start date, cycle_end_exclusive date, cycle_days int)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_day int;
  v_month_last_day int;
  v_diff_days int;
  v_period_index int;
begin
  if p_cycle_type = 'monthly' then
    v_day := coalesce(p_salary_payment_day::int, 1);
    -- Clamp a 28 minimum para no romper con Febrero etc. -- el cliente
    -- TS hace lo mismo via Math.min(month_last_day, paymentDay).
    if extract(day from p_today)::int >= v_day then
      v_month_last_day := extract(day from
        (date_trunc('month', p_today) + interval '1 month' - interval '1 day')
      )::int;
      cycle_start := make_date(
        extract(year from p_today)::int,
        extract(month from p_today)::int,
        least(v_day, v_month_last_day)
      );
    else
      v_month_last_day := extract(day from
        (date_trunc('month', p_today) - interval '1 day')
      )::int;
      cycle_start := make_date(
        extract(year from (p_today - interval '1 month'))::int,
        extract(month from (p_today - interval '1 month'))::int,
        least(v_day, v_month_last_day)
      );
    end if;
    cycle_end_exclusive := (cycle_start + interval '1 month')::date;
    cycle_days := (cycle_end_exclusive - cycle_start)::int;
  else
    -- biweekly / weekly / custom: rolling N días desde anchor.
    v_diff_days := (p_today - p_cycle_anchor_date)::int;
    v_period_index := floor(v_diff_days::numeric / p_cycle_length_days)::int;
    cycle_start := p_cycle_anchor_date + (v_period_index * p_cycle_length_days);
    cycle_end_exclusive := cycle_start + p_cycle_length_days;
    cycle_days := p_cycle_length_days;
  end if;
  return next;
end;
$$;

comment on function public.compute_pay_cycle is
  'Computes pay-cycle window for any cycle_type. Returns [start, end_exclusive). cycle_days = end - start. Used by home_snapshot + try_close_previous_cycle to share logic with mobile/utils/pay-cycle.ts.';
```

- [ ] **Step 2: Probar la migración localmente**

Run: `npx supabase db reset --linked` (si tenés env local) o validar con `npx supabase db lint`.

Expected: la migración aplica sin errores. La constraint nueva no rompe filas existentes (todas quedan con `cycle_type='monthly'` por default).

- [ ] **Step 3: Smoke test del helper con queries directas**

Connect via `npx supabase db query --linked` y correr:

```sql
-- monthly anchored on day 20, today is 2026-06-04 (before day 20 → previous month cycle)
select * from compute_pay_cycle('2026-06-04'::date, 'monthly', 20, null, null);
-- esperar: cycle_start=2026-05-20, cycle_end_exclusive=2026-06-20, cycle_days=31

-- biweekly, anchor 2026-05-23, today 2026-06-04 (12 días post-anchor → primer ciclo activo)
select * from compute_pay_cycle('2026-06-04'::date, 'biweekly', null, '2026-05-23'::date, 14);
-- esperar: cycle_start=2026-05-23, cycle_end_exclusive=2026-06-06, cycle_days=14

-- weekly, anchor 2026-05-30, today 2026-06-04 (5 días post → primer ciclo)
select * from compute_pay_cycle('2026-06-04'::date, 'weekly', null, '2026-05-30'::date, 7);
-- esperar: cycle_start=2026-05-30, cycle_end_exclusive=2026-06-06, cycle_days=7

-- custom N=10, anchor 2026-05-15, today 2026-06-04 (20 días → segundo ciclo)
select * from compute_pay_cycle('2026-06-04'::date, 'custom', null, '2026-05-15'::date, 10);
-- esperar: cycle_start=2026-06-04, cycle_end_exclusive=2026-06-14, cycle_days=10
```

Verificar a mano que los outputs matchean.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260604120000_cycle_config_support.sql
git commit -m "feat(db): cycle config support — columns + compute_pay_cycle helper"
```

---

### Task 2: home_snapshot usa compute_pay_cycle

**Files:**
- Create: `supabase/migrations/20260604120100_home_snapshot_uses_compute_pay_cycle.sql`

- [ ] **Step 1: Localizar la versión vigente de home_snapshot**

Run: `grep -l "create or replace function public.home_snapshot" supabase/migrations/*.sql | tail -1`
Expected: `supabase/migrations/20260601007000_home_snapshot_no_spend_days.sql` (la más reciente al momento de escribir el plan).

- [ ] **Step 2: Copiar el cuerpo completo de la RPC en una migración nueva**

Crear `supabase/migrations/20260604120100_home_snapshot_uses_compute_pay_cycle.sql` que empieza con `create or replace function public.home_snapshot() returns jsonb language plpgsql ...`. Copiar el resto literal de la versión vigente.

- [ ] **Step 3: Reemplazar el bloque inline de cycle calc por una llamada al helper**

Localizar en el nuevo file el bloque (alrededor de líneas 73-99 en el original):

```sql
  select coalesce(ff.salary_payment_day, 1) into v_payment_day
  from public.family_finance ff
  where ff.family_id = v_family_id;

  if v_payment_day is null then
    v_payment_day := 1;
  end if;

  if extract(day from v_today)::int >= v_payment_day then
    v_cycle_start := date_trunc('day', make_date(
      ...
    ))::timestamptz;
  else
    v_cycle_start := date_trunc('day',
      ...
    )::timestamptz;
  end if;
  v_cycle_end := v_cycle_start + interval '1 month';
```

Reemplazar por:

```sql
  declare
    v_finance_cycle record;
  begin
    select
      ff.salary_payment_day,
      coalesce(ff.cycle_type, 'monthly') as cycle_type,
      ff.cycle_anchor_date,
      ff.cycle_length_days
    into v_finance_cycle
    from public.family_finance ff
    where ff.family_id = v_family_id;
  end;

  -- Helper retorna [start, end_exclusive). Para preservar el shape
  -- pre-existente del JSON (`payments_cycle_end` etc) seguimos
  -- castando a timestamptz y usando end_exclusive como `v_cycle_end`.
  select cycle_start::timestamptz, cycle_end_exclusive::timestamptz
  into v_cycle_start, v_cycle_end
  from public.compute_pay_cycle(
    v_today::date,
    coalesce(v_finance_cycle.cycle_type, 'monthly'),
    v_finance_cycle.salary_payment_day::smallint,
    v_finance_cycle.cycle_anchor_date,
    v_finance_cycle.cycle_length_days
  );

  -- Mantener v_payment_day para el resto de la función que sigue
  -- usándolo en el JSON output (`'salary_payment_day', v_payment_day`).
  v_payment_day := coalesce(v_finance_cycle.salary_payment_day, 1);
```

- [ ] **Step 4: Agregar los 3 nuevos campos al JSON de salida**

Localizar el bloque que arma `family_finance` en el output (línea ~116 del original) y agregar las tres columnas al `to_jsonb(...)`:

```sql
'family_finance', (
  select to_jsonb(ff_full) from (
    select
      ff.*,
      ff.cycle_type,
      ff.cycle_anchor_date,
      ff.cycle_length_days
    from public.family_finance ff
    where ff.family_id = v_family_id
  ) ff_full
),
```

(Si el bloque ya hace `select to_jsonb(ff)` con todas las columnas via `ff.*`, no hace falta cambio — las nuevas columnas vienen automáticamente. Verificar con `grep -A 6 "'family_finance'," <archivo>`.)

- [ ] **Step 5: Aplicar y smoke test**

Run: `npx supabase db push --linked`. Verificar que el output del home_snapshot RPC (via su test integration existente o consulta directa) sigue devolviendo el mismo shape para una familia con `cycle_type='monthly'` (default).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260604120100_home_snapshot_uses_compute_pay_cycle.sql
git commit -m "feat(db): home_snapshot uses compute_pay_cycle helper"
```

---

### Task 3: try_close_previous_cycle usa compute_pay_cycle

**Files:**
- Create: `supabase/migrations/20260604120200_try_close_previous_cycle_uses_helper.sql`

- [ ] **Step 1: Localizar la versión vigente y verificar uso de salary_payment_day**

Run: `grep -B 2 -A 50 "create or replace function public.try_close_previous_cycle" supabase/migrations/*.sql | grep -E "salary_payment_day|v_pay|cycle_start" | head -20`

Confirmar que la función usa `coalesce(v_finance.salary_payment_day, 1)` y luego computa cycle_start/cycle_end inline.

- [ ] **Step 2: Crear la migración con el mismo patrón de reemplazo**

```sql
-- supabase/migrations/20260604120200_try_close_previous_cycle_uses_helper.sql
--
-- Reemplaza el cycle calc inline en try_close_previous_cycle por el
-- helper compute_pay_cycle. Soporta los 4 tipos de ciclo.

create or replace function public.try_close_previous_cycle(p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_finance_cycle record;
  v_today date := current_date;
  v_cycle_start date;
  v_cycle_end_exclusive date;
  v_prev_cycle_start date;
  v_prev_cycle_end_exclusive date;
begin
  select
    coalesce(ff.cycle_type, 'monthly') as cycle_type,
    ff.salary_payment_day,
    ff.cycle_anchor_date,
    ff.cycle_length_days
  into v_finance_cycle
  from public.family_finance ff
  where ff.family_id = p_family_id;

  if not found then return; end if;

  select cycle_start, cycle_end_exclusive
  into v_cycle_start, v_cycle_end_exclusive
  from public.compute_pay_cycle(
    v_today,
    v_finance_cycle.cycle_type,
    v_finance_cycle.salary_payment_day::smallint,
    v_finance_cycle.cycle_anchor_date,
    v_finance_cycle.cycle_length_days
  );

  -- Ciclo anterior: usar (cycle_start - 1 day) como referencia para
  -- que el helper devuelva el ciclo previo en cualquier régimen.
  select cycle_start, cycle_end_exclusive
  into v_prev_cycle_start, v_prev_cycle_end_exclusive
  from public.compute_pay_cycle(
    (v_cycle_start - interval '1 day')::date,
    v_finance_cycle.cycle_type,
    v_finance_cycle.salary_payment_day::smallint,
    v_finance_cycle.cycle_anchor_date,
    v_finance_cycle.cycle_length_days
  );

  -- (resto del cuerpo original de la función — el bloque que arma el
  -- monthly_summary y lo inserta. Copiar literal desde la migración
  -- existente, reemplazando v_cycle_start/v_cycle_end por las nuevas
  -- variables. Si la lógica original usa "interval '1 month'" para
  -- derivar el período previo, swap por v_prev_cycle_start.)
  ...
end;
$$;
```

**Nota crítica**: para evitar regresión, el implementer debe COPIAR el cuerpo completo de la versión vigente y solo reemplazar el bloque de cycle calc. NO reescribir lógica de monthly_summary.

- [ ] **Step 3: Smoke test**

```sql
-- Setup: una familia con cycle_type='monthly', día 20
update public.family_finance
   set cycle_type='monthly', salary_payment_day=20
 where family_id = '<test-family-id>';

select public.try_close_previous_cycle('<test-family-id>'::uuid);
-- esperar: no error, la lógica de cierre ya documentada sigue corriendo
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260604120200_try_close_previous_cycle_uses_helper.sql
git commit -m "feat(db): try_close_previous_cycle uses compute_pay_cycle helper"
```

---

## Phase 2 — TypeScript foundation

### Task 4: Tipo FinanceCycleConfig + helper financeToCycleConfig

**Files:**
- Create: `mobile/utils/finance-cycle-config.ts`
- Test: `tests/unit/finance-cycle-config.test.ts`

- [ ] **Step 1: Escribir el test failing**

```ts
// tests/unit/finance-cycle-config.test.ts
import { describe, expect, it } from 'vitest'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'

describe('financeToCycleConfig', () => {
  it('returns monthly for legacy finance row (no cycle_type)', () => {
    const result = financeToCycleConfig({
      cycle_type: 'monthly',
      salary_payment_day: 20,
      cycle_anchor_date: null,
      cycle_length_days: null,
    } as any)
    expect(result).toEqual({ cycle_type: 'monthly', salary_payment_day: 20 })
  })

  it('returns biweekly with anchor + 14', () => {
    const result = financeToCycleConfig({
      cycle_type: 'biweekly',
      salary_payment_day: 1,
      cycle_anchor_date: '2026-05-23',
      cycle_length_days: 14,
    } as any)
    expect(result).toEqual({
      cycle_type: 'biweekly',
      cycle_anchor_date: '2026-05-23',
      cycle_length_days: 14,
    })
  })

  it('falls back to monthly + day 1 when finance is null', () => {
    const result = financeToCycleConfig(null)
    expect(result).toEqual({ cycle_type: 'monthly', salary_payment_day: 1 })
  })

  it('forces monthly when type is biweekly but anchor missing (defensive)', () => {
    const result = financeToCycleConfig({
      cycle_type: 'biweekly',
      salary_payment_day: 15,
      cycle_anchor_date: null,
      cycle_length_days: 14,
    } as any)
    expect(result).toEqual({ cycle_type: 'monthly', salary_payment_day: 15 })
  })
})
```

- [ ] **Step 2: Verificar que el test falla**

Run: `npm test -- --run tests/unit/finance-cycle-config.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar el módulo**

```ts
// mobile/utils/finance-cycle-config.ts
import type { FamilyFinance } from '@/features/finance/family-finance.model'

/**
 * Discriminated union que describe el ciclo activo de una familia.
 * Hay dos regímenes internos:
 *   - 'monthly': anclado a un día-del-mes (lógica AR clásica).
 *   - 'biweekly' | 'weekly' | 'custom': rolling N días desde un anchor.
 *
 * Lo consumen `getCurrentPayCycle` y `formatCycleLabel`.
 */
export type FinanceCycleConfig =
  | { cycle_type: 'monthly'; salary_payment_day: number }
  | { cycle_type: 'biweekly'; cycle_anchor_date: string; cycle_length_days: 14 }
  | { cycle_type: 'weekly'; cycle_anchor_date: string; cycle_length_days: 7 }
  | { cycle_type: 'custom'; cycle_anchor_date: string; cycle_length_days: number }

/**
 * Proyecta el row de `family_finance` al config tipado. Aplica defensas:
 *   - finance null/undefined → monthly + day 1
 *   - cycle_type rolling pero anchor missing → fallback a monthly (estado
 *     corrupto que no debería pasar, pero no queremos crashear el hook).
 */
export function financeToCycleConfig(
  finance: Pick<
    FamilyFinance,
    'cycle_type' | 'salary_payment_day' | 'cycle_anchor_date' | 'cycle_length_days'
  > | null | undefined,
): FinanceCycleConfig {
  if (!finance) {
    return { cycle_type: 'monthly', salary_payment_day: 1 }
  }
  if (finance.cycle_type === 'monthly') {
    return {
      cycle_type: 'monthly',
      salary_payment_day: finance.salary_payment_day ?? 1,
    }
  }
  if (!finance.cycle_anchor_date || !finance.cycle_length_days) {
    return {
      cycle_type: 'monthly',
      salary_payment_day: finance.salary_payment_day ?? 1,
    }
  }
  if (finance.cycle_type === 'biweekly') {
    return {
      cycle_type: 'biweekly',
      cycle_anchor_date: finance.cycle_anchor_date,
      cycle_length_days: 14,
    }
  }
  if (finance.cycle_type === 'weekly') {
    return {
      cycle_type: 'weekly',
      cycle_anchor_date: finance.cycle_anchor_date,
      cycle_length_days: 7,
    }
  }
  return {
    cycle_type: 'custom',
    cycle_anchor_date: finance.cycle_anchor_date,
    cycle_length_days: finance.cycle_length_days,
  }
}
```

- [ ] **Step 4: Test pasa**

Run: `npm test -- --run tests/unit/finance-cycle-config.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/utils/finance-cycle-config.ts tests/unit/finance-cycle-config.test.ts
git commit -m "feat(mobile): FinanceCycleConfig type + financeToCycleConfig helper"
```

---

### Task 5: Extender FamilyFinance model con los 3 campos nuevos

**Files:**
- Modify: `mobile/features/finance/family-finance.model.ts`

- [ ] **Step 1: Agregar los campos al `FinanceStoragePayload`**

Editar `mobile/features/finance/family-finance.model.ts`. En la interface `FinanceStoragePayload` (líneas 3-26), agregar al final antes del cierre:

```ts
  /** Tipo de ciclo activo. Default 'monthly' para familias existentes. */
  cycle_type: 'monthly' | 'biweekly' | 'weekly' | 'custom'
  /** Para cycle_type rolling, fecha de inicio del primer ciclo (YYYY-MM-DD).
   *  NULL para cycle_type='monthly'. */
  cycle_anchor_date: string | null
  /** Para cycle_type rolling, días por ciclo (14/7/N). NULL para monthly. */
  cycle_length_days: number | null
```

- [ ] **Step 2: Agregar al `UpsertFamilyFinanceInput` y `FamilyFinanceInputSnapshot`**

En ambas interfaces (líneas 32-45 y 47-60), agregar:

```ts
  cycleType: 'monthly' | 'biweekly' | 'weekly' | 'custom'
  cycleAnchorDate: string | null
  cycleLengthDays: number | null
```

- [ ] **Step 3: Agregar defaults al `defaultFinanceValues()`**

En la función (líneas 121-136), agregar al return:

```ts
    cycle_type: 'monthly',
    cycle_anchor_date: null,
    cycle_length_days: null,
```

- [ ] **Step 4: Normalizar en `normalizeFinancePayload()`**

En el return de la función, agregar antes del cierre:

```ts
    cycle_type:
      payload?.cycle_type === 'biweekly' ||
      payload?.cycle_type === 'weekly' ||
      payload?.cycle_type === 'custom'
        ? payload.cycle_type
        : 'monthly',
    cycle_anchor_date:
      typeof payload?.cycle_anchor_date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(payload.cycle_anchor_date)
        ? payload.cycle_anchor_date
        : null,
    cycle_length_days:
      typeof payload?.cycle_length_days === 'number' &&
      Number.isInteger(payload.cycle_length_days) &&
      payload.cycle_length_days >= 1 &&
      payload.cycle_length_days <= 365
        ? payload.cycle_length_days
        : null,
```

- [ ] **Step 5: Mapear input → storage en `financeInputToStoragePayload`**

Agregar en el return:

```ts
    cycle_type: input.cycleType,
    cycle_anchor_date: input.cycleAnchorDate,
    cycle_length_days: input.cycleLengthDays,
```

- [ ] **Step 6: Validar en `validateFamilyFinanceInput`**

Agregar al bloque de validación después de las existentes:

```ts
  if (
    !['monthly', 'biweekly', 'weekly', 'custom'].includes(input.cycleType)
  ) {
    throw new Error('Tipo de ciclo invalido.')
  }
  if (input.cycleType === 'monthly') {
    if (input.cycleAnchorDate !== null || input.cycleLengthDays !== null) {
      throw new Error('Configuración mensual no debe tener anchor ni length.')
    }
  } else {
    if (
      typeof input.cycleAnchorDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.cycleAnchorDate)
    ) {
      throw new Error('Falta la fecha de inicio del ciclo.')
    }
    if (
      typeof input.cycleLengthDays !== 'number' ||
      !Number.isInteger(input.cycleLengthDays) ||
      input.cycleLengthDays < 1 ||
      input.cycleLengthDays > 365
    ) {
      throw new Error('Largo del ciclo invalido.')
    }
    if (input.cycleType === 'biweekly' && input.cycleLengthDays !== 14) {
      throw new Error('Quincenal debe ser cada 14 días.')
    }
    if (input.cycleType === 'weekly' && input.cycleLengthDays !== 7) {
      throw new Error('Semanal debe ser cada 7 días.')
    }
  }
```

- [ ] **Step 7: Mapear en `buildFamilyFinanceInput`**

Agregar al return:

```ts
    cycleType: snapshot.cycleType,
    cycleAnchorDate: snapshot.cycleAnchorDate,
    cycleLengthDays: snapshot.cycleLengthDays,
```

- [ ] **Step 8: Verificar typecheck**

Run: `npm run typecheck`
Expected: ningún error nuevo. Si los call-sites de `buildFamilyFinanceInput` rompen, Task 11 los arregla — por ahora declarar `as any` temporal NO. En su lugar, esta migración SOLO toca el model; los call-sites se actualizan en Task 11.

(Si el typecheck rompe ya: hacer el cambio en Task 11 ANTES de seguir con tareas 6-10 puede ser necesario. El subagent decide según el tamaño del fallout.)

- [ ] **Step 9: Commit**

```bash
git add mobile/features/finance/family-finance.model.ts
git commit -m "feat(finance): extend FamilyFinance model with cycle_type/anchor/length"
```

---

### Task 6: Refactor pay-cycle.ts con dispatcher

**Files:**
- Modify: `mobile/utils/pay-cycle.ts`
- Test: `tests/unit/pay-cycle.test.ts`

- [ ] **Step 1: Escribir tests failing primero**

```ts
// tests/unit/pay-cycle.test.ts
import { describe, expect, it } from 'vitest'
import { getCurrentPayCycle } from '@/utils/pay-cycle'

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('getCurrentPayCycle — monthly', () => {
  it('after payday → current month is start', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 4), {
      cycle_type: 'monthly',
      salary_payment_day: 20,
    })
    expect(cycle.start).toEqual(D(2026, 5, 20))
    expect(cycle.end).toEqual(D(2026, 6, 20))
    expect(cycle.days).toBe(31)
  })

  it('before payday → previous month is start', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 15), {
      cycle_type: 'monthly',
      salary_payment_day: 20,
    })
    expect(cycle.start).toEqual(D(2026, 5, 20))
  })

  it('today is payday → today is start', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 20), {
      cycle_type: 'monthly',
      salary_payment_day: 20,
    })
    expect(cycle.start).toEqual(D(2026, 6, 20))
  })
})

describe('getCurrentPayCycle — biweekly', () => {
  it('today = anchor → active cycle starts today', () => {
    const cycle = getCurrentPayCycle(D(2026, 5, 23), {
      cycle_type: 'biweekly',
      cycle_anchor_date: '2026-05-23',
      cycle_length_days: 14,
    })
    expect(cycle.start).toEqual(D(2026, 5, 23))
    expect(cycle.end).toEqual(D(2026, 6, 6))
    expect(cycle.days).toBe(14)
  })

  it('12 days post-anchor → first cycle still active', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 4), {
      cycle_type: 'biweekly',
      cycle_anchor_date: '2026-05-23',
      cycle_length_days: 14,
    })
    expect(cycle.start).toEqual(D(2026, 5, 23))
    expect(cycle.end).toEqual(D(2026, 6, 6))
  })

  it('14 days post-anchor → second cycle starts', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 6), {
      cycle_type: 'biweekly',
      cycle_anchor_date: '2026-05-23',
      cycle_length_days: 14,
    })
    expect(cycle.start).toEqual(D(2026, 6, 6))
  })
})

describe('getCurrentPayCycle — weekly', () => {
  it('basic: today = anchor + 3 days', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 4), {
      cycle_type: 'weekly',
      cycle_anchor_date: '2026-06-01',
      cycle_length_days: 7,
    })
    expect(cycle.start).toEqual(D(2026, 6, 1))
    expect(cycle.end).toEqual(D(2026, 6, 8))
    expect(cycle.days).toBe(7)
  })

  it('anchor in the future → returns the PRECEDING cycle (period_index negative)', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 4), {
      cycle_type: 'weekly',
      cycle_anchor_date: '2026-06-12',
      cycle_length_days: 7,
    })
    // diff = -8, period_index = floor(-8/7) = -2 (NO -1 con floor)
    // Wait: floor(-8/7) = floor(-1.14) = -2. start = anchor + -2*7 = jun 12 - 14 = may 29
    expect(cycle.start).toEqual(D(2026, 5, 29))
    expect(cycle.end).toEqual(D(2026, 6, 5))
  })
})

describe('getCurrentPayCycle — custom', () => {
  it('N=10, today = 20 days post-anchor → second cycle', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 4), {
      cycle_type: 'custom',
      cycle_anchor_date: '2026-05-15',
      cycle_length_days: 10,
    })
    // diff=20, period_index=2, start = may 15 + 20 = jun 4
    expect(cycle.start).toEqual(D(2026, 6, 4))
    expect(cycle.end).toEqual(D(2026, 6, 14))
    expect(cycle.days).toBe(10)
  })

  it('N=1 (daily) — today is its own cycle', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 4), {
      cycle_type: 'custom',
      cycle_anchor_date: '2026-06-01',
      cycle_length_days: 1,
    })
    expect(cycle.start).toEqual(D(2026, 6, 4))
    expect(cycle.end).toEqual(D(2026, 6, 5))
  })
})
```

- [ ] **Step 2: Test falla**

Run: `npm test -- --run tests/unit/pay-cycle.test.ts`
Expected: FAIL (la signature de `getCurrentPayCycle` cambió — acepta `FinanceCycleConfig` ahora).

- [ ] **Step 3: Refactorizar pay-cycle.ts**

Reemplazar `mobile/utils/pay-cycle.ts` por:

```ts
import { DAY_MS } from '@/utils/time'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'

export interface PayCycle {
  start: Date
  end: Date
  weeks: number
  days: number
}

export function normalizeToStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function capitalizeText(value: string): string {
  if (!value) return value
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

/** Parse YYYY-MM-DD a Date local anclado a medianoche. Evita el off-by-one
 *  por tz de `new Date("YYYY-MM-DD")` que UTC-parsea. */
export function parseLocalDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function buildPayDate(year: number, month: number, paymentDay: number): Date {
  const monthLastDay = new Date(year, month + 1, 0).getDate()
  const normalizedPaymentDay = Math.min(Math.max(1, paymentDay), monthLastDay)
  return normalizeToStartOfDay(new Date(year, month, normalizedPaymentDay))
}

function computeMonthAnchored(
  today: Date,
  paymentDay: number,
  freezeUntilSalaryConfirmation: boolean,
): PayCycle {
  const todayNormalized = normalizeToStartOfDay(today)
  const currentMonthPayDate = buildPayDate(
    todayNormalized.getFullYear(),
    todayNormalized.getMonth(),
    paymentDay,
  )

  const cycleStart =
    freezeUntilSalaryConfirmation && todayNormalized >= currentMonthPayDate
      ? buildPayDate(todayNormalized.getFullYear(), todayNormalized.getMonth() - 1, paymentDay)
      : todayNormalized >= currentMonthPayDate
        ? currentMonthPayDate
        : buildPayDate(todayNormalized.getFullYear(), todayNormalized.getMonth() - 1, paymentDay)

  const cycleEnd =
    freezeUntilSalaryConfirmation && todayNormalized >= currentMonthPayDate
      ? currentMonthPayDate
      : buildPayDate(cycleStart.getFullYear(), cycleStart.getMonth() + 1, paymentDay)

  const cycleDays = Math.max(
    1,
    Math.round((cycleEnd.getTime() - cycleStart.getTime()) / DAY_MS),
  )

  return {
    start: cycleStart,
    end: cycleEnd,
    weeks: Math.max(1, Math.ceil(cycleDays / 7)),
    days: cycleDays,
  }
}

function computeRollingN(
  today: Date,
  anchorDate: string,
  lengthDays: number,
): PayCycle {
  const todayNormalized = normalizeToStartOfDay(today)
  const anchor = parseLocalDateKey(anchorDate)
  const diffDays = Math.floor((todayNormalized.getTime() - anchor.getTime()) / DAY_MS)
  // `Math.floor` con negativos da el período correcto para anchor futuro:
  // diff=-8 con length=7 → floor(-1.14)=-2 → start = anchor + (-2*7) = anchor - 14
  const periodIndex = Math.floor(diffDays / lengthDays)
  const start = new Date(anchor)
  start.setDate(start.getDate() + periodIndex * lengthDays)
  const end = new Date(start)
  end.setDate(end.getDate() + lengthDays)
  return {
    start,
    end,
    days: lengthDays,
    weeks: Math.max(1, Math.ceil(lengthDays / 7)),
  }
}

/**
 * Computes the active pay cycle window for any cycle_type.
 *
 * For `monthly`: ancla al día-del-mes (lógica preservada del before-cycle-
 * config refactor). Para los rolling types: encuentra el período activo
 * que contiene `referenceDate`, soportando anchor pasado o futuro.
 *
 * `freezeUntilSalaryConfirmation` solo aplica a monthly — es la lógica
 * de "freeze el ciclo en el límite cuando el sueldo no fue confirmado".
 * Para rolling types es no-op (no tiene sentido conceptual).
 */
export function getCurrentPayCycle(
  referenceDate: Date,
  config: FinanceCycleConfig,
  freezeUntilSalaryConfirmation = false,
): PayCycle {
  if (config.cycle_type === 'monthly') {
    return computeMonthAnchored(referenceDate, config.salary_payment_day, freezeUntilSalaryConfirmation)
  }
  return computeRollingN(referenceDate, config.cycle_anchor_date, config.cycle_length_days)
}
```

- [ ] **Step 4: Tests pasan**

Run: `npm test -- --run tests/unit/pay-cycle.test.ts`
Expected: 10 tests pass.

- [ ] **Step 5: Adaptar `usePayCycle` en `mobile/hooks/use-pay-cycle.ts`**

Reemplazar el body del hook:

```ts
import { useMemo } from 'react'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { DEFAULT_SALARY_PAYMENT_DAY } from '@/features/finance/family-finance.model'
import {
  buildPayDate,
  getCurrentPayCycle,
  normalizeToStartOfDay,
  type PayCycle,
} from '@/utils/pay-cycle'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'

export interface UsePayCycleResult {
  cycle: PayCycle
  salaryPaymentDay: number
  today: Date
  isSalaryPendingConfirmation: boolean
}

export function usePayCycle(familyId?: string): UsePayCycleResult {
  const financeQuery = useFamilyFinance(familyId)
  const finance = financeQuery.data

  return useMemo(() => {
    const today = normalizeToStartOfDay(new Date())
    const config = financeToCycleConfig(finance)
    const salaryPaymentDay =
      config.cycle_type === 'monthly'
        ? config.salary_payment_day
        : (finance?.salary_payment_day ?? DEFAULT_SALARY_PAYMENT_DAY)

    // freezeUntilSalaryConfirmation solo aplica a monthly: para rolling
    // types el ciclo activo viene del anchor + length, no del "día de
    // cobro" que se confirma manualmente. Mantener semántica previa.
    const currentMonthPayDate = buildPayDate(
      today.getFullYear(),
      today.getMonth(),
      salaryPaymentDay,
    )
    const lastConfirmed = parseConfirmedDate(finance?.last_salary_confirmed_at ?? null)
    const isSalaryPendingConfirmation =
      config.cycle_type === 'monthly' &&
      today >= currentMonthPayDate &&
      (!lastConfirmed || lastConfirmed < currentMonthPayDate)

    const cycle = getCurrentPayCycle(today, config, isSalaryPendingConfirmation)
    return { cycle, salaryPaymentDay, today, isSalaryPendingConfirmation }
  }, [
    finance?.cycle_type,
    finance?.salary_payment_day,
    finance?.cycle_anchor_date,
    finance?.cycle_length_days,
    finance?.last_salary_confirmed_at,
  ])
}

function parseConfirmedDate(raw: string | null): Date | null {
  if (!raw) return null
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return normalizeToStartOfDay(parsed)
}
```

- [ ] **Step 6: Typecheck completo**

Run: `npm run typecheck`
Expected: errores SOLO en call-sites de `getCurrentPayCycle` que pasaban `(date, paymentDay)`. Localizarlos:

Run: `grep -rn "getCurrentPayCycle(" mobile/ --include="*.ts" --include="*.tsx" | grep -v "use-pay-cycle.ts\|pay-cycle.ts"`

Estos call-sites necesitan migrar al nuevo shape (`config: FinanceCycleConfig`). El sub-task 6b lo cubre.

- [ ] **Step 7: Migrar call-sites externos a getCurrentPayCycle**

Para cada match del grep anterior, el caller ya tiene un `family_finance` row (típicamente vía useFamilyFinance). Cambiar:

```ts
// antes
getCurrentPayCycle(today, finance.salary_payment_day, freeze)
// después
import { financeToCycleConfig } from '@/utils/finance-cycle-config'
getCurrentPayCycle(today, financeToCycleConfig(finance), freeze)
```

(Call-sites esperables: `mobile/features/family/family-dashboard-model.ts` línea ~167, y posiblemente uno o dos más.)

- [ ] **Step 8: Typecheck limpio**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Suite completa**

Run: `npm test -- --run`
Expected: todos los tests previos siguen pasando. Si rompen tests de family-dashboard/insights, son fallout esperado del cambio de signature — repararlos con `financeToCycleConfig`.

- [ ] **Step 10: Commit**

```bash
git add mobile/utils/pay-cycle.ts mobile/hooks/use-pay-cycle.ts tests/unit/pay-cycle.test.ts mobile/features/family/family-dashboard-model.ts
git commit -m "refactor(pay-cycle): dispatch on FinanceCycleConfig, support rolling-N regimes"
```

---

### Task 7: format-cycle-label.ts + extract MONTH_SHORT

**Files:**
- Create: `mobile/utils/date-format.ts`
- Create: `mobile/utils/format-cycle-label.ts`
- Test: `tests/unit/format-cycle-label.test.ts`

- [ ] **Step 1: Crear `date-format.ts` con MONTH_SHORT extraído**

```ts
// mobile/utils/date-format.ts
//
// Constantes y helpers de formato de fecha es-AR. Centralizado para
// evitar la duplicación que existía hoy en use-fijos-controller.ts y
// otros lugares.

export const MONTH_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const

export const WEEKDAY_SHORT = [
  'dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb',
] as const

/** "20 may" — sin año, fechas dentro del ciclo activo. */
export function formatDayMonthShort(date: Date): string {
  return `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`
}

/** "vie 20 may" — variante con día de la semana. */
export function formatWeekdayDayMonth(date: Date): string {
  return `${WEEKDAY_SHORT[date.getDay()]} ${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`
}
```

- [ ] **Step 2: Test failing del formatter**

```ts
// tests/unit/format-cycle-label.test.ts
import { describe, expect, it } from 'vitest'
import { formatCycleLabel, formatCycleSummary } from '@/utils/format-cycle-label'

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('formatCycleLabel', () => {
  it('monthly: "20 may → 19 jun"', () => {
    const result = formatCycleLabel(
      { start: D(2026, 5, 20), end: D(2026, 6, 20), days: 31, weeks: 5 },
      'monthly',
    )
    // end es exclusive — el label muestra el último día inclusive (end - 1d)
    expect(result).toBe('20 may → 19 jun')
  })

  it('biweekly: "20 may → 2 jun · quincena"', () => {
    const result = formatCycleLabel(
      { start: D(2026, 5, 20), end: D(2026, 6, 3), days: 14, weeks: 2 },
      'biweekly',
    )
    expect(result).toBe('20 may → 2 jun · quincena')
  })

  it('weekly: "20 may → 26 may · semana"', () => {
    const result = formatCycleLabel(
      { start: D(2026, 5, 20), end: D(2026, 5, 27), days: 7, weeks: 1 },
      'weekly',
    )
    expect(result).toBe('20 may → 26 may · semana')
  })

  it('custom: "20 may → 29 may · cada 10 días"', () => {
    const result = formatCycleLabel(
      { start: D(2026, 5, 20), end: D(2026, 5, 30), days: 10, weeks: 2 },
      'custom',
    )
    expect(result).toBe('20 may → 29 may · cada 10 días')
  })
})

describe('formatCycleSummary', () => {
  it('monthly · día 20', () => {
    expect(formatCycleSummary({ cycle_type: 'monthly', salary_payment_day: 20 }))
      .toBe('Mensual · día 20')
  })
  it('biweekly summary', () => {
    expect(formatCycleSummary({
      cycle_type: 'biweekly', cycle_anchor_date: '2026-06-06', cycle_length_days: 14,
    })).toBe('Quincenal · desde 6 jun')
  })
  it('weekly summary', () => {
    expect(formatCycleSummary({
      cycle_type: 'weekly', cycle_anchor_date: '2026-06-04', cycle_length_days: 7,
    })).toBe('Semanal · desde jue 4 jun')
  })
  it('custom summary', () => {
    expect(formatCycleSummary({
      cycle_type: 'custom', cycle_anchor_date: '2026-05-15', cycle_length_days: 10,
    })).toBe('Custom · cada 10 días')
  })
})
```

- [ ] **Step 3: Test falla**

Run: `npm test -- --run tests/unit/format-cycle-label.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 4: Implementar el formatter**

```ts
// mobile/utils/format-cycle-label.ts
import type { PayCycle } from '@/utils/pay-cycle'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { formatDayMonthShort, formatWeekdayDayMonth, MONTH_SHORT, WEEKDAY_SHORT } from '@/utils/date-format'

/**
 * Label del ciclo activo para mostrar en hero de Home / Gastos / Fijos.
 * Convención de la app: `end` es exclusive (medianoche del día siguiente
 * al último del ciclo), por eso el label muestra `end - 1d`.
 */
export function formatCycleLabel(
  cycle: PayCycle,
  cycleType: FinanceCycleConfig['cycle_type'],
): string {
  const lastDay = new Date(cycle.end)
  lastDay.setDate(lastDay.getDate() - 1)
  const range = `${formatDayMonthShort(cycle.start)} → ${formatDayMonthShort(lastDay)}`
  if (cycleType === 'monthly') return range
  if (cycleType === 'biweekly') return `${range} · quincena`
  if (cycleType === 'weekly') return `${range} · semana`
  return `${range} · cada ${cycle.days} días`
}

/**
 * Summary del config (no del ciclo activo) para mostrar en la fila de
 * Settings como "Ciclo de cobro · <valor>".
 */
export function formatCycleSummary(config: FinanceCycleConfig): string {
  if (config.cycle_type === 'monthly') {
    return `Mensual · día ${config.salary_payment_day}`
  }
  const [y, m, d] = config.cycle_anchor_date.split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1)
  if (config.cycle_type === 'biweekly') {
    return `Quincenal · desde ${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`
  }
  if (config.cycle_type === 'weekly') {
    return `Semanal · desde ${WEEKDAY_SHORT[date.getDay()]} ${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`
  }
  return `Custom · cada ${config.cycle_length_days} días`
}
```

- [ ] **Step 5: Tests pasan**

Run: `npm test -- --run tests/unit/format-cycle-label.test.ts`
Expected: 8 tests pass.

- [ ] **Step 6: Migrar `MONTH_SHORT` duplicado en use-fijos-controller**

Editar `mobile/features/fijos/use-fijos-controller.ts`:
1. Remover el const local `MONTH_SHORT` (líneas 76-79).
2. Importar `import { MONTH_SHORT } from '@/utils/date-format'` arriba.
3. Verificar que el uso en `cycleLabel` sigue compilando.

(Si encontrás otras duplicaciones grep `grep -rn "MONTH_SHORT\|'ene', 'feb'" mobile/ --include="*.ts" --include="*.tsx"`, migrar también.)

- [ ] **Step 7: Suite + typecheck**

Run: `npm run typecheck && npm test -- --run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add mobile/utils/date-format.ts mobile/utils/format-cycle-label.ts tests/unit/format-cycle-label.test.ts mobile/features/fijos/use-fijos-controller.ts
git commit -m "feat(utils): formatCycleLabel + formatCycleSummary; extract MONTH_SHORT"
```

---

## Phase 3 — UI components

### Task 8: Extract BaseMonthCalendar from GastosMonthCalendar

**Files:**
- Read: `mobile/components/gastos/gastos-month-calendar.tsx` (entendimiento)
- Create: `mobile/components/ui/base-month-calendar.tsx`
- Modify: `mobile/components/gastos/gastos-month-calendar.tsx`

- [ ] **Step 1: Leer la implementación actual**

Run: `wc -l mobile/components/gastos/gastos-month-calendar.tsx`
Expected: ~400-600 líneas. Leer las secciones que (a) computan la grilla de días del ciclo, (b) renderizan cada celda, (c) manejan tap-to-select. Aislarlas mentalmente del header del ciclo / day-detail / chevrons.

- [ ] **Step 2: Crear `BaseMonthCalendar` con la API mínima**

```tsx
// mobile/components/ui/base-month-calendar.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useAppTheme } from '@/theme/theme-provider'

export interface BaseMonthCalendarDay {
  /** YYYY-MM-DD local */
  isoDate: string
  /** Día-del-mes (1-31) */
  dayOfMonth: number
  /** Posición en la grilla (1-7 para columnas) */
  weekday: number
  /** True si es el "today" para los markers */
  isToday: boolean
  /** True si está dentro del rango permitido (selectable) */
  selectable: boolean
}

export interface BaseMonthCalendarProps {
  /** Año/mes a renderizar (mes 0-11) */
  year: number
  month: number
  /** Día seleccionado, o null */
  selectedIsoDate: string | null
  /** "Hoy" del user (en local tz) */
  today: Date
  /** Rango permitido (incluyente ambos lados). Días fuera se deshabilitan. */
  allowedRange?: { startIso: string; endIso: string }
  /** 0 = lunes primero (default), 1 = domingo primero */
  firstWeekdayOffset?: number
  /** Render opcional de decoraciones por día (moods, marks, etc) */
  renderDayDecorator?: (day: BaseMonthCalendarDay) => React.ReactNode
  onSelectDay: (isoDate: string) => void
}

export function BaseMonthCalendar({
  year,
  month,
  selectedIsoDate,
  today,
  allowedRange,
  firstWeekdayOffset = 0,
  renderDayDecorator,
  onSelectDay,
}: BaseMonthCalendarProps) {
  const { theme } = useAppTheme()
  const days = buildMonthGrid(year, month, today, allowedRange, firstWeekdayOffset)

  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.grid}>
      {WEEKDAY_HEADERS(firstWeekdayOffset).map((label) => (
        <View key={`h-${label}`} style={styles.headerCell}>
          <Text style={[styles.headerText, { color: theme.colors.textMuted }]}>{label}</Text>
        </View>
      ))}
      {days.map((day, idx) => {
        if (!day) {
          return <View key={`spacer-${idx}`} style={styles.cell} />
        }
        const isSelected = day.isoDate === selectedIsoDate
        return (
          <Pressable
            key={day.isoDate}
            onPress={() => day.selectable && onSelectDay(day.isoDate)}
            disabled={!day.selectable}
            style={[
              styles.cell,
              isSelected && { backgroundColor: theme.colors.primary, borderRadius: 12 },
              !day.selectable && styles.disabled,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: !day.selectable }}
            accessibilityLabel={`${day.dayOfMonth}`}
          >
            <Text
              style={[
                styles.cellText,
                {
                  color: isSelected
                    ? theme.colors.background
                    : day.isToday
                      ? theme.colors.primary
                      : theme.colors.text,
                  fontWeight: day.isToday || isSelected ? '700' : '500',
                },
              ]}
            >
              {day.dayOfMonth}
            </Text>
            {renderDayDecorator?.(day)}
          </Pressable>
        )
      })}
    </Animated.View>
  )
}

function WEEKDAY_HEADERS(firstWeekdayOffset: number): string[] {
  const base = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  if (firstWeekdayOffset === 1) return ['D', ...base.slice(0, 6)]
  return base
}

function buildMonthGrid(
  year: number,
  month: number,
  today: Date,
  allowedRange: { startIso: string; endIso: string } | undefined,
  firstWeekdayOffset: number,
): (BaseMonthCalendarDay | null)[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const todayIso = formatIso(today)
  // Padding inicial: cuántas celdas vacías antes del día 1
  const dayOfWeek = firstDay.getDay() // 0 = dom
  const padCount = firstWeekdayOffset === 0
    ? (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
    : dayOfWeek
  const grid: (BaseMonthCalendarDay | null)[] = Array(padCount).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d)
    const iso = formatIso(date)
    const selectable = allowedRange
      ? iso >= allowedRange.startIso && iso <= allowedRange.endIso
      : true
    grid.push({
      isoDate: iso,
      dayOfMonth: d,
      weekday: date.getDay(),
      isToday: iso === todayIso,
      selectable,
    })
  }
  return grid
}

function formatIso(d: Date): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  headerCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  cell: {
    width: `${(100 / 7) - 0.5}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: 14 },
  disabled: { opacity: 0.25 },
})
```

- [ ] **Step 3: Refactorizar `GastosMonthCalendar` para delegar**

Localizar dentro de `mobile/components/gastos/gastos-month-calendar.tsx` el bloque que renderiza la grilla (Pressables que muestran días con moods). Reemplazar por:

```tsx
import { BaseMonthCalendar } from '@/components/ui/base-month-calendar'

// dentro del componente, donde antes había la grilla manual:
<BaseMonthCalendar
  year={cycleStart.getFullYear()}
  month={cycleStart.getMonth()}
  selectedIsoDate={selectedDay != null ? formatIsoForSelectedDay(selectedDay) : null}
  today={new Date()}
  allowedRange={{ startIso: formatLocalDateKey(cycleStart), endIso: formatLocalDateKey(cycleEnd) }}
  firstWeekdayOffset={firstWeekdayOffset}
  onSelectDay={(iso) => {
    const day = parseInt(iso.slice(8, 10), 10)
    onSelectDay(day)
  }}
  renderDayDecorator={(day) => {
    const mood = dayMoods[day.dayOfMonth]
    const isNoSpend = noSpendMarkedDates?.has(day.isoDate)
    if (!mood && !isNoSpend) return null
    return (
      // copiar exactamente las decoraciones (BreatheDot, mood color, etc)
      // que el GastosMonthCalendar usa hoy. Es UN nodo overlay encima del Pressable.
    )
  }}
/>
```

El day-detail panel, chevrons, callbacks `onRegisterForgottenExpense`/`onMarkNoSpend` se quedan en `GastosMonthCalendar` sin cambio — solo la grilla cambia su renderer interno.

- [ ] **Step 4: Smoke manual de Gastos**

Run: `npx expo export --platform ios --output-dir /tmp/expo-bundle-check`
Expected: bundle OK. Abrir la pantalla Gastos en device/sim, verificar que (a) la grilla se ve, (b) los moods aparecen, (c) tap-to-filter funciona, (d) no-spend marks se ven.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/ui/base-month-calendar.tsx mobile/components/gastos/gastos-month-calendar.tsx
git commit -m "refactor(ui): extract BaseMonthCalendar; GastosMonthCalendar delegates grid render"
```

---

### Task 9: CycleConfigSection component

**Files:**
- Create: `mobile/components/finance/cycle-config-section.tsx`

- [ ] **Step 1: Implementar el componente**

```tsx
// mobile/components/finance/cycle-config-section.tsx
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View, TextInput } from 'react-native'
import { MonthDayPicker } from '@/components/ui/month-day-picker'
import { BaseMonthCalendar } from '@/components/ui/base-month-calendar'
import { useAppTheme } from '@/theme/theme-provider'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { normalizeToStartOfDay, formatLocalDateKey } from '@/utils/pay-cycle'

interface CycleTypeChipDef {
  type: FinanceCycleConfig['cycle_type']
  title: string
  subtitle: string
}

const CYCLE_TYPES: CycleTypeChipDef[] = [
  { type: 'monthly',  title: 'Mensual',   subtitle: 'Una vez al mes' },
  { type: 'biweekly', title: 'Quincenal', subtitle: 'Cada 14 días' },
  { type: 'weekly',   title: 'Semanal',   subtitle: 'Cada 7 días' },
  { type: 'custom',   title: 'Custom',    subtitle: 'Cada N días' },
]

const HELPER: Record<FinanceCycleConfig['cycle_type'], string> = {
  monthly:  'El ciclo dura 28-31 días según el mes.',
  biweekly: 'A partir de esta fecha, cada 14 días.',
  weekly:   'A partir de esta fecha, cada 7 días.',
  custom:   'Indicá la fecha y la duración del ciclo en días.',
}

interface CycleConfigSectionProps {
  value: FinanceCycleConfig
  onChange: (next: FinanceCycleConfig) => void
}

export function CycleConfigSection({ value, onChange }: CycleConfigSectionProps) {
  const { theme } = useAppTheme()
  const [customLengthText, setCustomLengthText] = useState(
    value.cycle_type === 'custom' ? String(value.cycle_length_days) : '10',
  )
  const today = useMemo(() => normalizeToStartOfDay(new Date()), [])

  const handleTypeChange = (next: FinanceCycleConfig['cycle_type']) => {
    if (next === value.cycle_type) return
    if (next === 'monthly') {
      onChange({ cycle_type: 'monthly', salary_payment_day: 15 })
      return
    }
    // Para rolling types, default anchor = today
    const todayIso = formatLocalDateKey(today)
    if (next === 'biweekly') {
      onChange({ cycle_type: 'biweekly', cycle_anchor_date: todayIso, cycle_length_days: 14 })
      return
    }
    if (next === 'weekly') {
      onChange({ cycle_type: 'weekly', cycle_anchor_date: todayIso, cycle_length_days: 7 })
      return
    }
    onChange({
      cycle_type: 'custom',
      cycle_anchor_date: todayIso,
      cycle_length_days: parseLengthOr(customLengthText, 10),
    })
  }

  const handleAnchorChange = (iso: string) => {
    if (value.cycle_type === 'monthly') return
    onChange({ ...value, cycle_anchor_date: iso })
  }

  const handleCustomLengthChange = (text: string) => {
    setCustomLengthText(text)
    if (value.cycle_type !== 'custom') return
    const n = parseLengthOr(text, value.cycle_length_days)
    onChange({ ...value, cycle_length_days: n })
  }

  return (
    <View style={styles.container}>
      <View style={styles.chipsRow}>
        {CYCLE_TYPES.map((def) => {
          const selected = def.type === value.cycle_type
          return (
            <Pressable
              key={def.type}
              onPress={() => handleTypeChange(def.type)}
              style={[
                styles.chip,
                {
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? `${theme.colors.primary}1A` : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipTitle, { color: theme.colors.text }]}>{def.title}</Text>
              <Text style={[styles.chipSubtitle, { color: theme.colors.textMuted }]}>{def.subtitle}</Text>
            </Pressable>
          )
        })}
      </View>

      {value.cycle_type === 'monthly' ? (
        <View>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>DÍA DEL MES EN QUE COBRÁS</Text>
          <MonthDayPicker
            value={value.salary_payment_day}
            onChange={(d) => onChange({ cycle_type: 'monthly', salary_payment_day: d })}
          />
        </View>
      ) : (
        <View>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>¿CUÁNDO ES TU PRÓXIMO COBRO?</Text>
          <BaseMonthCalendar
            year={parseAnchorYear(value.cycle_anchor_date, today)}
            month={parseAnchorMonth(value.cycle_anchor_date, today)}
            selectedIsoDate={value.cycle_anchor_date}
            today={today}
            onSelectDay={handleAnchorChange}
          />
          {value.cycle_type === 'custom' ? (
            <View style={styles.lengthRow}>
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>CADA CUÁNTOS DÍAS COBRÁS</Text>
              <TextInput
                value={customLengthText}
                onChangeText={handleCustomLengthChange}
                keyboardType="number-pad"
                maxLength={3}
                style={[styles.lengthInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
              />
            </View>
          ) : null}
        </View>
      )}

      <Text style={[styles.helper, { color: theme.colors.textMuted }]}>{HELPER[value.cycle_type]}</Text>
    </View>
  )
}

function parseLengthOr(text: string, fallback: number): number {
  const n = parseInt(text, 10)
  if (!Number.isInteger(n) || n < 1 || n > 365) return fallback
  return n
}
function parseAnchorYear(iso: string, today: Date): number {
  return parseInt(iso.slice(0, 4), 10) || today.getFullYear()
}
function parseAnchorMonth(iso: string, today: Date): number {
  return (parseInt(iso.slice(5, 7), 10) || today.getMonth() + 1) - 1
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    width: '47%',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  chipTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  chipSubtitle: { fontSize: 11 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginBottom: 8 },
  lengthRow: { marginTop: 14, gap: 6 },
  lengthInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
    width: 110,
  },
  helper: { fontSize: 12, marginTop: 6 },
})
```

- [ ] **Step 2: Typecheck + bundle**

Run: `npm run typecheck && npx expo export --platform ios --output-dir /tmp/expo-bundle-check 2>&1 | tail -5`
Expected: typecheck PASS, bundle OK.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/finance/cycle-config-section.tsx
git commit -m "feat(ui): CycleConfigSection — 4-type picker with conditional anchor"
```

---

## Phase 4 — Onboarding

### Task 10: Wire CycleConfigSection en step-income

**Files:**
- Modify: `mobile/components/home/onboarding/step-income.tsx`
- Modify: el screen padre que pasa props (`mobile/screens/home/onboarding-screen.tsx` o equivalente)

- [ ] **Step 1: Localizar el screen padre**

Run: `grep -rn "StepIncome\|step-income" mobile/screens/ mobile/app/ --include="*.tsx" | grep -v "components/home/onboarding/step-income"`
Expected: 1-2 matches en onboarding-screen.

- [ ] **Step 2: Modificar `step-income.tsx`**

Reemplazar el contenido:

```tsx
import { StyleSheet, Text, View } from 'react-native'
import { AmountCard } from '@/components/home/amount-card'
import { RiseView } from '@/components/home/animated/rise-view'
import { CycleConfigSection } from '@/components/finance/cycle-config-section'
import { parsePrice } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'

interface StepIncomeProps {
  monthlyIncomeRaw: string
  cycleConfig: FinanceCycleConfig
  onRequestNumpad: () => void
  onChangeCycleConfig: (next: FinanceCycleConfig) => void
  isNumpadActive?: boolean
  amountCardRef?: (node: View | null) => void
}

export function StepIncome({
  monthlyIncomeRaw,
  cycleConfig,
  onRequestNumpad,
  onChangeCycleConfig,
  isNumpadActive = false,
  amountCardRef,
}: StepIncomeProps) {
  const { theme } = useAppTheme()
  const parsed = parsePrice(monthlyIncomeRaw)
  const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0

  return (
    <View style={styles.stack}>
      <RiseView>
        <Text style={[styles.title, { color: theme.colors.text }]}>Tu sueldo base</Text>
        <Text style={[styles.subcopy, { color: theme.colors.textMuted }]}>
          Lo usamos para calcular tu presupuesto del día.
        </Text>
      </RiseView>

      <RiseView delay={80}>
        <View ref={amountCardRef}>
          <AmountCard
            amount={amount}
            isActive={isNumpadActive}
            onPress={onRequestNumpad}
            label="Sueldo mensual"
          />
        </View>
      </RiseView>

      <RiseView delay={140}>
        <Text style={[styles.eyebrow, styles.dayEyebrow, { color: theme.colors.textMuted }]}>
          TU CICLO DE COBRO
        </Text>
        <CycleConfigSection value={cycleConfig} onChange={onChangeCycleConfig} />
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
          Siempre puedes editarlo desde Ajustes.
        </Text>
      </RiseView>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  subcopy: { fontSize: 13, marginTop: 4 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  dayEyebrow: { marginBottom: 8 },
  hint: { marginTop: 10, fontSize: 12 },
})
```

- [ ] **Step 3: Migrar el screen padre**

En el archivo que renderiza `<StepIncome>`, reemplazar:
- estado `salaryPaymentDay: number` por `cycleConfig: FinanceCycleConfig` con default `{ cycle_type: 'monthly', salary_payment_day: 15 }`
- handler `onChangeSalaryDay` por `onChangeCycleConfig`
- al guardar (mutation): mapear `cycleConfig` → los 3 campos del input (`cycleType`, `cycleAnchorDate`, `cycleLengthDays`) además del existente `salaryPaymentDay` (que se preserva cuando `cycle_type === 'monthly'`)

Pseudocódigo de la mutación:

```ts
const input = buildFamilyFinanceInput({
  // ... otros campos existentes
  salaryPaymentDay: cycleConfig.cycle_type === 'monthly' ? cycleConfig.salary_payment_day : 1,
  cycleType: cycleConfig.cycle_type,
  cycleAnchorDate: cycleConfig.cycle_type === 'monthly' ? null : cycleConfig.cycle_anchor_date,
  cycleLengthDays: cycleConfig.cycle_type === 'monthly' ? null : cycleConfig.cycle_length_days,
})
```

- [ ] **Step 4: Typecheck + bundle**

Run: `npm run typecheck && npx expo export --platform ios --output-dir /tmp/expo-bundle-check 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 5: Smoke manual de onboarding**

Abrir onboarding en device fresh (limpiar AsyncStorage o usar simulator clean). Verificar:
- Step income carga con "Mensual · día 15" preseleccionado.
- Cambiar a Quincenal muestra el calendario.
- Cambiar a Custom muestra calendario + input de N.
- Volver a Mensual restaura el MonthDayPicker.
- Continuar al siguiente step guarda en DB correctamente.

- [ ] **Step 6: Commit**

```bash
git add mobile/components/home/onboarding/step-income.tsx mobile/screens/home/onboarding-screen.tsx
git commit -m "feat(onboarding): step-income uses CycleConfigSection for 4-type picker"
```

---

## Phase 5 — Settings

### Task 11: cycle-config-screen + Settings row

**Files:**
- Create: `mobile/screens/settings/cycle-config-screen.tsx`
- Create: `mobile/app/(app)/settings/cycle-config.tsx`
- Modify: `mobile/screens/settings/family-admin-screen.tsx`

- [ ] **Step 1: Crear la screen detalle**

```tsx
// mobile/screens/settings/cycle-config-screen.tsx
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { CycleConfigSection } from '@/components/finance/cycle-config-section'
import { useFamilyFinance, useUpsertFamilyFinance, buildFamilyFinanceInput } from '@/features/finance/use-family-finance'
import { useActiveFamilyId } from '@/features/family/use-active-family-id' // ajustar al hook real del repo
import { financeToCycleConfig, type FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { useAppTheme } from '@/theme/theme-provider'
import { toast } from '@/lib/toast-bus'

export function CycleConfigScreen() {
  const router = useRouter()
  const { theme } = useAppTheme()
  const familyId = useActiveFamilyId()
  const financeQuery = useFamilyFinance(familyId)
  const upsert = useUpsertFamilyFinance(familyId)

  const initial = financeToCycleConfig(financeQuery.data)
  const [config, setConfig] = useState<FinanceCycleConfig>(initial)
  const dirty = JSON.stringify(config) !== JSON.stringify(initial)

  const handleSave = async () => {
    if (!financeQuery.data) return
    const input = buildFamilyFinanceInput({
      // copiar todos los campos previos del snapshot
      dailyBudgetBufferMode: financeQuery.data.daily_budget_buffer_mode,
      dailyBudgetBufferValue: financeQuery.data.daily_budget_buffer_value,
      dailyBudgetCheckinHour: financeQuery.data.daily_budget_checkin_hour,
      dailyBudgetNudgesEnabled: financeQuery.data.daily_budget_nudges_enabled,
      monthlyIncome: financeQuery.data.monthly_income,
      savingsGoal: financeQuery.data.savings_goal,
      savingsGoalPercent: financeQuery.data.savings_goal_percent,
      usdExchangeRate: financeQuery.data.usd_exchange_rate,
      lastSalaryConfirmedAt: financeQuery.data.last_salary_confirmed_at,
      currentCycleStartingBalance: financeQuery.data.current_cycle_starting_balance,
      currentCycleAnchor: financeQuery.data.current_cycle_anchor,
      // cycle config: el delta
      salaryPaymentDay: config.cycle_type === 'monthly' ? config.salary_payment_day : 1,
      cycleType: config.cycle_type,
      cycleAnchorDate: config.cycle_type === 'monthly' ? null : config.cycle_anchor_date,
      cycleLengthDays: config.cycle_type === 'monthly' ? null : config.cycle_length_days,
    })
    try {
      await upsert.mutateAsync(input)
      toast.success('Ciclo actualizado.')
      router.back()
    } catch (e) {
      toast.error('No se pudo guardar el ciclo.')
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: theme.colors.text }]}>Ciclo de cobro</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          Cambiar el tipo aplica al próximo cobro. El ciclo actual sigue su curso.
        </Text>
        <CycleConfigSection value={config} onChange={setConfig} />
      </ScrollView>
      <View style={[styles.footer, { borderColor: theme.colors.border }]}>
        <Pressable
          onPress={handleSave}
          disabled={!dirty || upsert.isPending}
          style={[
            styles.saveBtn,
            { backgroundColor: dirty ? theme.colors.primary : theme.colors.border },
          ]}
        >
          <Text style={[styles.saveBtnText, { color: theme.colors.background }]}>
            {upsert.isPending ? 'Guardando…' : 'Guardar'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 16, paddingBottom: 100 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  subtitle: { fontSize: 13, marginBottom: 10 },
  footer: { padding: 16, borderTopWidth: 1 },
  saveBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '700' },
})
```

(Nota: el hook `useActiveFamilyId` se llama distinto en el repo — el sub-agent debe greppear `grep -rn "useActiveFamilyId\|activeFamilyId\|useCurrentFamily" mobile/features/family/` y usar el nombre real.)

- [ ] **Step 2: Crear el route file**

```tsx
// mobile/app/(app)/settings/cycle-config.tsx
import { CycleConfigScreen } from '@/screens/settings/cycle-config-screen'
export default CycleConfigScreen
```

- [ ] **Step 3: Agregar la fila en family-admin-screen**

Localizar dentro de `mobile/screens/settings/family-admin-screen.tsx` la sección donde están las filas existentes ("Sueldo familiar", "Meta de ahorro", "Cotización USD"). Agregar una nueva fila siguiendo el mismo patrón visual:

```tsx
import { formatCycleSummary } from '@/utils/format-cycle-label'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'
import { useRouter } from 'expo-router'

// dentro del componente:
const cycleConfig = financeToCycleConfig(financeQuery.data)
const router = useRouter()

// fila nueva:
<SettingsRow
  label="Ciclo de cobro"
  value={formatCycleSummary(cycleConfig)}
  onPress={() => router.push('/settings/cycle-config')}
/>
```

(Usar el componente Row real que la screen ya tiene. Si tiene un patrón distinto, replicarlo. El sub-agent debe leer la screen primero.)

- [ ] **Step 4: Typecheck + bundle**

Run: `npm run typecheck && npx expo export --platform ios --output-dir /tmp/expo-bundle-check 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 5: Smoke manual settings**

En la app: Settings → Finanzas familiares → la nueva fila aparece con el valor correcto. Tap → screen detalle. Cambiar tipo → calendario aparece. Guardar → vuelve a la lista con valor actualizado.

- [ ] **Step 6: Commit**

```bash
git add mobile/screens/settings/cycle-config-screen.tsx mobile/app/\(app\)/settings/cycle-config.tsx mobile/screens/settings/family-admin-screen.tsx
git commit -m "feat(settings): cycle-config screen + new row in family admin"
```

---

## Phase 6 — Copy rollout

### Task 12: Rollout de formatCycleLabel a hero cards

**Files:**
- Modify: `mobile/features/fijos/use-fijos-controller.ts` (ya tocado parcialmente en Task 7)
- Modify: hero copy en `mobile/screens/home/home-screen.tsx`, `mobile/screens/home/gastos-v2-screen.tsx`, `mobile/features/insights/control-signals-copy.ts` (si tienen labels inline del ciclo)

- [ ] **Step 1: Localizar todos los call-sites que arman label inline**

Run: `grep -rn "MONTH_SHORT\|MONTH_NAMES\|→.*${MONTH" mobile/ --include="*.tsx" --include="*.ts" | grep -v "date-format.ts\|format-cycle-label.ts" | head -20`

Para cada uno donde el contexto es "label del ciclo activo": reemplazar la construcción manual por `formatCycleLabel(cycle, cycleType)`.

- [ ] **Step 2: Modificar `use-fijos-controller.ts`**

Localizar el `cycleLabel` useMemo (líneas ~224-228 del archivo original):

```ts
// antes
const cycleLabel = useMemo(() => {
  const start = cycle.start
  const end = cycle.end
  return `${start.getDate()} ${MONTH_SHORT[start.getMonth()]} → ${end.getDate()} ${MONTH_SHORT[end.getMonth()]}`
}, [cycle.start, cycle.end])

// después
import { formatCycleLabel } from '@/utils/format-cycle-label'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'
// ya tenés financeQuery — pasar el cycle_type:
const cycleType = financeToCycleConfig(financeQuery.data).cycle_type
const cycleLabel = useMemo(
  () => formatCycleLabel(cycle, cycleType),
  [cycle, cycleType],
)
```

- [ ] **Step 3: Para cada otro call-site identificado**

Hacer el reemplazo análogo. Si el call-site no tiene acceso fácil a `cycle_type`, leerlo de `useFamilyFinance(familyId)` y pasarlo a `formatCycleLabel`.

- [ ] **Step 4: Typecheck + bundle**

Run: `npm run typecheck && npx expo export --platform ios --output-dir /tmp/expo-bundle-check 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/fijos/use-fijos-controller.ts mobile/screens/home/home-screen.tsx mobile/screens/home/gastos-v2-screen.tsx mobile/features/insights/control-signals-copy.ts
git commit -m "feat(copy): rollout formatCycleLabel to home/gastos/fijos hero cards"
```

---

## Phase 7 — Mid-cycle change UX polish

### Task 13: Mensaje contextual en CycleConfigSection

**Files:**
- Modify: `mobile/components/finance/cycle-config-section.tsx`

- [ ] **Step 1: Agregar prop opcional `currentConfig`**

Modificar el componente para que opcionalmente reciba el config previo:

```ts
interface CycleConfigSectionProps {
  value: FinanceCycleConfig
  onChange: (next: FinanceCycleConfig) => void
  /** Cuando el componente se usa en Settings (vs onboarding), pasar el
   *  config ACTUALMENTE persistido. Si el `value` difiere en tipo,
   *  mostramos un mensaje "el cambio aplicará al próximo cobro". */
  currentConfig?: FinanceCycleConfig
}
```

Renderizar el mensaje cuando aplica:

```tsx
{currentConfig && currentConfig.cycle_type !== value.cycle_type ? (
  <View style={[styles.notice, { borderColor: theme.colors.border }]}>
    <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>
      Estás cambiando tu ciclo de {labelOf(currentConfig.cycle_type)} a {labelOf(value.cycle_type)}.
      El cambio aplica al próximo cobro que indicaste.
    </Text>
  </View>
) : null}

function labelOf(t: FinanceCycleConfig['cycle_type']): string {
  return t === 'monthly' ? 'Mensual'
    : t === 'biweekly' ? 'Quincenal'
    : t === 'weekly' ? 'Semanal'
    : 'Custom'
}
```

```ts
notice: {
  marginTop: 10,
  padding: 12,
  borderRadius: 10,
  borderWidth: 1,
},
noticeText: { fontSize: 12, lineHeight: 18 },
```

- [ ] **Step 2: En `cycle-config-screen` pasar el `currentConfig`**

```tsx
<CycleConfigSection value={config} onChange={setConfig} currentConfig={initial} />
```

(En onboarding NO pasar — no hay "current" todavía.)

- [ ] **Step 3: Typecheck + bundle + commit**

Run: `npm run typecheck && npx expo export --platform ios --output-dir /tmp/expo-bundle-check 2>&1 | tail -5`

```bash
git add mobile/components/finance/cycle-config-section.tsx mobile/screens/settings/cycle-config-screen.tsx
git commit -m "feat(ui): cycle config section shows transition notice in settings"
```

---

## Phase 8 — Final verification

### Task 14: Test suite + bundle + manual smoke

- [ ] **Step 1: Suite completa**

Run: `npm test -- --run`
Expected: 503+ tests pass (lo previo + los nuevos). Si alguno rompe, investigar — un break aquí indica que un consumidor del ciclo no migró.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Bundle**

Run: `npx expo export --platform ios --output-dir /tmp/expo-bundle-check 2>&1 | tail -5`
Expected: bundle OK ~8.7MB.

- [ ] **Step 4: Smoke manual con los 4 tipos**

Sobre un device/sim, para cada `cycle_type`:

| Tipo | Setup | Verificar |
|---|---|---|
| `monthly` | Settings → Mensual día 20 | Home hero label "20 may → 19 jun". Fijos / Gastos consistentes. |
| `biweekly` | Settings → Quincenal, anchor hoy | Label "X may → Y jun · quincena". El ciclo dura 14 días. |
| `weekly` | Settings → Semanal, anchor hoy | Label "X may → Y may · semana". El ciclo dura 7 días. |
| `custom` (N=10) | Settings → Custom, anchor hoy, N=10 | Label "X may → Y may · cada 10 días". |

- [ ] **Step 5: Smoke del flow mid-cycle change**

- Estando en Mensual día 20, ir a Settings → Ciclo de cobro → cambiar a Quincenal.
- Pickear anchor = HOY (mid-mes).
- Guardar.
- Verificar: el ciclo activo SIGUE siendo el mensual hasta que today >= anchor. (Si anchor = hoy, la transición es inmediata por floor() — ese es el comportamiento esperado.)
- Pickear anchor = en 5 días. Guardar.
- Verificar: el ciclo activo sigue siendo el mensual. Forzar `today` (no es trivial sin tooling) o validar conceptualmente que el cómputo en TS retorna la ventana monthly hasta cruzar el anchor.

- [ ] **Step 6: Commit final si hubo polish**

(Solo si encontraste y arreglaste algo durante el smoke.)

```bash
git add <files>
git commit -m "polish(cycle): smoke fixes from final verification"
```

---

### Task 15: Final code review + merge

- [ ] **Step 1: Pedir review con superpowers:requesting-code-review**

Dispatch un code reviewer subagent sobre el branch completo:

```
BASE_SHA=$(git merge-base main HEAD)
HEAD_SHA=$(git rev-parse HEAD)
```

Pasar al subagent: el spec doc + el plan + los SHAs. Que reporte si algo se desvió del spec o tiene problemas de calidad.

- [ ] **Step 2: Aplicar feedback**

Fix issues críticos/importantes según el reviewer.

- [ ] **Step 3: Merge a main**

```bash
git checkout main
git merge --no-ff feature/cycle-config-leftover-decisions -m "Merge branch 'feature/cycle-config-leftover-decisions' — Spec A: ciclo configurable"
```

(Push a remote cuando vos decidas.)

---

## Self-Review (controller-driven)

**Spec coverage check** (recorrido por sección del spec):

| Sección spec | Task(s) que la implementa |
|---|---|
| §3 Modelo de datos | Task 1 |
| §4 Capa de cómputo TS | Tasks 4, 6 |
| §5 RPCs backend | Tasks 1 (helper), 2 (home_snapshot), 3 (try_close) |
| §6.1 BaseMonthCalendar refactor | Task 8 |
| §6.2 CycleConfigSection | Task 9 |
| §6.3 Anchor date timezone | Task 4 (parseLocalDateKey) + Task 9 |
| §7 Onboarding | Task 10 |
| §8 Settings | Task 11 |
| §8.3 Mid-cycle change UX | Task 13 |
| §9 Copy / labels | Task 7 + Task 12 |
| §10 Edge cases | Cubiertos por tests en Task 6 |
| §11 Testing | Tasks 4, 6, 7 (unit). Smoke manual en Task 14. |
| §12 Riesgos | Mitigaciones distribuidas (cache via existing syncAllAfterMutation, tz via parseLocalDateKey, RPC paridad via Task 1 step 3 smoke). |

**Placeholder scan**: el plan tiene **DOS** referencias a "ajustar al hook real del repo" / "leer la screen primero" (Tasks 11, 12). Justificadas — son call-sites con nombres que varían por convención y el subagent debe greppear para confirmar. NO son TBDs en la lógica; son indicadores explícitos para el subagent.

**Type consistency**: `FinanceCycleConfig` se define en Task 4 y se usa con la misma forma en Tasks 5, 6, 7, 9, 10, 11, 12, 13. ✓ `formatCycleLabel(cycle, cycleType)` signature consistente entre Task 7 y Task 12. ✓ `BaseMonthCalendarProps` define `onSelectDay: (isoDate: string) => void` y se usa así en Task 9 (CycleConfigSection.handleAnchorChange). ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-04-cycle-configurable.md`. Dos opciones de ejecución:

**1. Subagent-Driven (recommended)** — Yo dispatching un subagent fresh por task, review entre tasks, iteración rápida. Mantiene mi contexto limpio para coordinación.

**2. Inline Execution** — Ejecutamos en esta sesión con `executing-plans`, batch execution con checkpoints para que revises.

¿Cuál preferís?
