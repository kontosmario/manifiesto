# Ciclo configurable — Design Spec (Spec A)

**Fecha**: 2026-06-04
**Branch**: `feature/cycle-config-leftover-decisions`
**Estado**: Aprobado para implementación
**Predecesor de**: Spec B (Decisión sobre saldo a favor del ciclo) — diseñada después de este.

---

## 1. Objetivo

Soportar 4 modelos de cobro distintos en la app, en vez del mensual hardcoded actual:

1. **Mensual** — cobra día X del mes (hoy, AR típico)
2. **Quincenal** — cobra cada 14 días (MX aproximado)
3. **Semanal** — cobra cada 7 días (US típico)
4. **Custom** — cobra cada N días (edge cases)

Sin romper la app existente: familias activas hoy quedan en `monthly` por default silencioso, cero fricción para ellas. La opción de cambiar vive en Settings (y en Onboarding para nuevos users).

## 2. Contexto

Hoy el ciclo es hardcoded a "mes calendario tipo argentino" — un solo input configurable: `family_finance.salary_payment_day` (1-31). El cómputo de la ventana del ciclo vive en dos lugares:

- **Mobile**: `mobile/utils/pay-cycle.ts` → `getCurrentPayCycle(referenceDate, paymentDay)` retorna `{start, end, days, weeks}`.
- **Backend (autoritativo)**: RPCs `home_snapshot`, `gastos_snapshot`, `try_close_previous_cycle_month_step` computan la ventana plpgsql-side leyendo `family_finance.salary_payment_day`.

Toda la app lee de un solo hook (`usePayCycle`) que wraps `getCurrentPayCycle`. ~15 consumidores: `home`, `gastos`, `fijos`, `control-v2`, `forecast-engine`, `family-dashboard-model`, etc.

## 3. Modelo de datos

### 3.1. Schema en `family_finance`

```sql
alter table public.family_finance
  add column cycle_type text not null default 'monthly'
    check (cycle_type in ('monthly','biweekly','weekly','custom')),
  add column cycle_anchor_date date null,
  add column cycle_length_days smallint null
    check (cycle_length_days is null or cycle_length_days between 1 and 365);

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
```

### 3.2. Reglas de interpretación

| `cycle_type` | Anchor | Length | Cómputo |
|---|---|---|---|
| `monthly` | `salary_payment_day` (existente) | Variable (28-31) | Mes calendario anclado a día X |
| `biweekly` | `cycle_anchor_date` | `cycle_length_days = 14` | Rolling 14 días desde anchor |
| `weekly` | `cycle_anchor_date` | `cycle_length_days = 7` | Rolling 7 días desde anchor |
| `custom` | `cycle_anchor_date` | `cycle_length_days = N` (1-365) | Rolling N días desde anchor |

Para `biweekly` y `weekly` persistimos el `cycle_length_days` aunque sea derivable del tipo — simplifica queries SQL y mantiene Custom como el único tipo donde el número es realmente libre.

### 3.3. Migración

- Toda fila existente queda con `cycle_type = 'monthly'` (default de la columna).
- `salary_payment_day` se preserva como anchor para el modo `monthly`.
- Cero migración de UX para users existentes — la app sigue exactamente igual hasta que el user entre a Settings.

## 4. Capa de cómputo (`mobile/utils/pay-cycle.ts`)

### 4.1. API pública (sin cambios)

```ts
export interface PayCycle {
  start: Date
  end: Date
  weeks: number
  days: number
}

export function getCurrentPayCycle(
  referenceDate: Date,
  financeConfig: FinanceCycleConfig,
  freezeUntilSalaryConfirmation?: boolean,
): PayCycle
```

`FinanceCycleConfig` es un tipo nuevo:
```ts
export type FinanceCycleConfig =
  | { cycle_type: 'monthly'; salary_payment_day: number }
  | { cycle_type: 'biweekly'; cycle_anchor_date: string; cycle_length_days: 14 }
  | { cycle_type: 'weekly'; cycle_anchor_date: string; cycle_length_days: 7 }
  | { cycle_type: 'custom'; cycle_anchor_date: string; cycle_length_days: number }
```

### 4.2. Implementación interna

```ts
function computeMonthAnchored(today: Date, dayOfMonth: number): PayCycle {
  // Lógica actual extraída literalmente — comportamiento idéntico.
}

function computeRollingN(today: Date, anchorDate: Date, lengthDays: number): PayCycle {
  const dayMs = 86_400_000
  const diffDays = Math.floor((today.getTime() - anchorDate.getTime()) / dayMs)
  const periodIndex = Math.floor(diffDays / lengthDays)
  const start = new Date(anchorDate)
  start.setDate(start.getDate() + periodIndex * lengthDays)
  const end = new Date(start)
  end.setDate(end.getDate() + lengthDays - 1)
  return { start, end, days: lengthDays, weeks: Math.ceil(lengthDays / 7) }
}

export function getCurrentPayCycle(today, config, freeze): PayCycle {
  if (config.cycle_type === 'monthly') {
    return computeMonthAnchored(today, config.salary_payment_day)
  }
  const anchor = parseLocalDate(config.cycle_anchor_date)
  return computeRollingN(today, anchor, config.cycle_length_days)
}
```

`computeRollingN` funciona para anchor pasado o futuro (negativo) — soporta "el user configuró hoy, su próximo cobro es viernes".

### 4.3. `usePayCycle` adaptado

```ts
export function usePayCycle(familyId: string) {
  const financeQuery = useFamilyFinance(familyId)
  const today = useToday()
  const config = financeToCycleConfig(financeQuery.data)
  return {
    cycle: getCurrentPayCycle(today, config),
    today,
  }
}
```

Nuevo helper `financeToCycleConfig(finance: FamilyFinance | null): FinanceCycleConfig` que extrae los campos correctos según `cycle_type` y aplica defaults seguros (monthly + day 1) cuando finance es null/cargando.

**Cero consumidor del hook cambia su interfaz.**

## 5. RPCs backend

### 5.1. Funciones afectadas

Detectadas por el Explore agent:
- `home_snapshot()` — calcula `v_cycle_start` / `v_cycle_end` desde `salary_payment_day` (líneas ~87-104 en `20260601007000_home_snapshot_no_spend_days.sql`).
- `gastos_snapshot()` — equivalente para Gastos.
- `try_close_previous_cycle_month_step()` — lógica de cierre de ciclo previo.
- Cualquier otra RPC que lea `salary_payment_day` para computar ventana.

### 5.2. Helper plpgsql centralizado

Creamos una función SQL inmutable:

```sql
create or replace function public.compute_pay_cycle(
  p_today date,
  p_cycle_type text,
  p_salary_payment_day smallint,
  p_cycle_anchor_date date,
  p_cycle_length_days smallint
) returns table (cycle_start date, cycle_end date, cycle_days int)
language plpgsql immutable as $$
declare
  v_diff_days int;
  v_period_index int;
begin
  if p_cycle_type = 'monthly' then
    -- Lógica actual extraída de home_snapshot
    if extract(day from p_today)::int >= coalesce(p_salary_payment_day, 1) then
      cycle_start := make_date(extract(year from p_today)::int,
                               extract(month from p_today)::int,
                               coalesce(p_salary_payment_day, 1));
    else
      cycle_start := make_date(extract(year from (p_today - interval '1 month'))::int,
                               extract(month from (p_today - interval '1 month'))::int,
                               coalesce(p_salary_payment_day, 1));
    end if;
    cycle_end := cycle_start + interval '1 month' - interval '1 day';
    cycle_days := (cycle_end - cycle_start + 1)::int;
  else
    v_diff_days := p_today - p_cycle_anchor_date;
    v_period_index := floor(v_diff_days::numeric / p_cycle_length_days);
    cycle_start := p_cycle_anchor_date + (v_period_index * p_cycle_length_days);
    cycle_end := cycle_start + p_cycle_length_days - 1;
    cycle_days := p_cycle_length_days;
  end if;
  return next;
end;
$$;
```

Las RPCs afectadas llaman a este helper en vez de inlinear la lógica. Reduce drift entre TS y SQL.

### 5.3. Cliente NO pasa la ventana

El RPC sigue computando autoritativamente desde `family_finance`. El cliente envía solo `family_id`. Evita inconsistencias cliente/server cuando un user tiene la app abierta en dos devices simultáneamente.

## 6. Componentes mobile

### 6.1. Refactor incidental: `BaseMonthCalendar`

Hoy `GastosMonthCalendar` (`mobile/components/gastos/gastos-month-calendar.tsx`) mezcla:
- Grilla de mes + selección de día (núcleo reutilizable)
- Moods por día (gastos-specific)
- No-spend marks (gastos-specific)
- Day-detail panel (gastos-specific)

Extraemos `BaseMonthCalendar` (`mobile/components/ui/base-month-calendar.tsx`) con la grilla pura:

```ts
interface BaseMonthCalendarProps {
  year: number
  month: number  // 0-11
  selectedDate: Date | null
  onSelect: (date: Date) => void
  allowedRange?: { start: Date; end: Date }  // disable días fuera
  firstWeekdayOffset?: number  // 0 = lunes primero
  renderDayDecorator?: (date: Date) => ReactNode  // hook para moods/no-spend
}
```

`GastosMonthCalendar` queda como wrapper que retiene toda su API previa (moods, no-spend marks, day-detail panel, chevrons prev/next, callbacks `onMarkNoSpend`/`onRegisterForgottenExpense`, etc.) y delega solo el render de la grilla al `BaseMonthCalendar`. Los 2 consumidores actuales (`gastos-v2-screen`, `gastos-empty-state`) no tocan su llamada al componente.

### 6.2. Nuevo: `CycleConfigSection`

`mobile/components/finance/cycle-config-section.tsx`:

```ts
interface CycleConfigSectionProps {
  value: FinanceCycleConfig
  onChange: (next: FinanceCycleConfig) => void
}
```

Renderiza:
1. **4 chips de tipo** (Mensual / Quincenal / Semanal / Custom). Estilo igual a las chips de período que ya tiene la app.
2. **Campo condicional según el tipo**:
   - `monthly` → `MonthDayPicker` (existente) — día 1-31
   - `biweekly | weekly` → `BaseMonthCalendar` para elegir "próximo cobro" (anchor_date)
   - `custom` → `BaseMonthCalendar` + input numérico `cycle_length_days` (1-365)
3. **Helper text dinámico** según el tipo:
   - monthly: "El ciclo dura 28-31 días según el mes."
   - biweekly: "A partir de esta fecha, cada 14 días."
   - weekly: "A partir de esta fecha, cada 7 días."
   - custom: "Cada N días desde esta fecha."

El componente NO persiste — emite `onChange` con el config completo. El consumer decide cuándo mutar.

### 6.3. Anchor date timezone

Cuando el user elige una fecha en el `BaseMonthCalendar`, la persistimos como `YYYY-MM-DD` (date, no timestamptz). Al parsear cliente-side anclamos a mediodía local (`new Date(y, m-1, d, 12, 0, 0, 0)`) — mismo patrón documentado en `feedback_timestamptz_off_by_one`.

## 7. Onboarding

### 7.1. Step extendido

`mobile/components/home/onboarding/step-income.tsx` se extiende con `<CycleConfigSection>` debajo del input de sueldo. No agregamos un step nuevo — la mayoría de users va a quedar en Mensual y un step extra es friction sin valor.

### 7.2. Default inicial

Cuando el step carga sin valor previo:
- `cycle_type = 'monthly'`
- `salary_payment_day = 15` (lo que es hoy)

Idéntica UX a la actual para users que no tocan el picker.

### 7.3. Persistencia

La mutación `useUpsertFamilyFinance` se extiende para enviar los 3 campos nuevos. El RPC `upsert_family_finance` se extiende análogamente.

### 7.4. Backwards compat

Users que YA hicieron onboarding: sus rows quedaron con `cycle_type='monthly'` por default + su `salary_payment_day` preservado. UX idéntica a la previa al deploy.

## 8. Settings

### 8.1. Nueva fila

En la screen `family-admin-screen.tsx`, sección "Finanzas familiares", agregamos fila:

| Label | Value (dinámico) | Tap |
|---|---|---|
| Ciclo de cobro | `"Mensual · día 20"` / `"Quincenal · desde 6 jun"` / `"Semanal · desde vie"` / `"Custom · cada 10 días"` | Navega a `settings/cycle-config-screen.tsx` |

Helper `formatCycleSummary(config: FinanceCycleConfig): string` para el value.

### 8.2. Screen detalle

`mobile/screens/settings/cycle-config-screen.tsx`:
- Renderiza `<CycleConfigSection>` standalone con el config actual cargado
- Botón "Guardar" que dispara la mutación
- Mensaje informativo cuando el user cambia el tipo: "El cambio aplicará al próximo cobro que indicaste."

### 8.3. Mid-cycle change

Decidido en brainstorming (Opción A — anchor explícito):
- User cambia tipo en Settings
- El componente le pide elegir `cycle_anchor_date` (próximo cobro)
- La mutación guarda los 3 campos
- El ciclo activo NO se trunca — sigue computándose con el modelo previo hasta que `today >= cycle_anchor_date`
- En cuanto el today cruza el anchor, `getCurrentPayCycle` retorna el ciclo del modelo nuevo automáticamente

Sin estado "pending" en DB. La transición es función pura de `(today, config)`.

## 9. Copy / labels en la app

### 9.1. Helper único

`mobile/utils/format-cycle-label.ts`:

```ts
export function formatCycleLabel(
  cycle: PayCycle,
  cycleType: FinanceCycleConfig['cycle_type'],
): string
```

Reusa el array `MONTH_SHORT` existente en `mobile/features/fijos/use-fijos-controller.ts` (lo extraemos a `mobile/utils/date-format.ts` como parte del refactor incidental — ya está duplicado en varios lugares).

Implementa la tabla:

| Tipo | Label |
|---|---|
| `monthly` | `"20 may → 19 jun"` (igual a hoy) |
| `biweekly` | `"20 may → 2 jun · quincena"` |
| `weekly` | `"20 may → 26 may · semana"` |
| `custom` | `"20 may → 29 may · cada 10 días"` |

### 9.2. Consumidores

Reemplazo de los call-sites que hoy construyen el label inline:
- Home hero
- Fijos hero (`useFijosController.cycleLabel`)
- Gastos hero
- Control v2 "saldo del ciclo" copy

Cada consumer recibe `cycleType` desde `useFamilyFinance().cycle_type` (queda colocado en el hook que ya consume).

## 10. Edge cases

- **`salary_payment_day` null + `cycle_type='monthly'`** → coalesce a día 1 (mismo comportamiento que hoy).
- **Anchor date elegido en el pasado** → `computeRollingN` calcula el período actual correctamente sin asunción de "anchor futuro".
- **Custom N=1** (cobra diario) → permitido por el check (rango 1-365). Edge raro pero válido.
- **Familia abre app en dos devices simultáneamente, cambian cycle_type** → la mutación es last-write-wins en `family_finance`. No vamos a hacer reconciliación — es un caso degenerado que solo afecta al usuario que se contradice a sí mismo.

## 11. Testing

### 11.1. Unit (Vitest)

- `pay-cycle.ts`: 16 casos = 4 tipos × 4 contextos:
  - Ciclo activo (today en mitad del ciclo)
  - Today = anchor (borde inferior)
  - Today = ciclo-end (borde superior)
  - Anchor pasado lejano (period_index alto)
- `format-cycle-label.ts`: un test por tipo.

### 11.2. Integration (Vitest contra Supabase real, ya configurado)

- RPC `home_snapshot` con `cycle_type` para cada uno de los 4 tipos: verificar que `dashboard.payCycle.start/end` matchea TypeScript.
- RPC `compute_pay_cycle` (helper SQL): tests directos por tipo.

### 11.3. Manual smoke pre-merge

- Onboarding: completar con los 4 tipos.
- Settings: cambiar tipo mid-cycle, verificar que el ciclo activo no se rompe y que cruza el anchor correctamente.
- Spot check de Home / Gastos / Fijos con `cycle_type='weekly'`.

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cache stale tras cambio de config | `syncAllAfterMutation` ya invalida `homeSnapshotQueryKey` + `controlSnapshotKey`. Verificar que cubre también `family-finance` query. |
| Anchor date con tz errada | Pin a mediodía local al parsear (feedback memory ya documentado). |
| RPC plpgsql divergente de TS | Test de paridad: para 100 fechas random + 4 configs, comparar resultado TS vs SQL. |
| Familias existentes ven el picker como cambio "raro" | Migración silenciosa — `cycle_type` queda en `monthly` con default. UX previa preservada exacta. |
| `BaseMonthCalendar` refactor rompe Gastos | Refactor en commit separado + spec compliance review antes de continuar. |

## 13. Out of scope (decisiones explícitas)

- **Prorrateo de fijos** en ciclo más corto que la frecuencia del fijo. Lo windowed-as-is es la decisión.
- **Múltiples ciclos simultáneos** (dos sueldos en la familia con cadencias distintas). Una sola config por familia.
- **Cycle history** (cambios pasados de config). El user solo puede tener un config activo + uno "futuro vía anchor" implícito.
- **"Pending state" en DB** para cambios de ciclo. Función pura de `(today, config)`.
- **Quincena estilo mexicano** (15 + último día de mes). Aproximamos como rolling 14d, no es 1:1 con la realidad mexicana. Si demanda lo pide, fase 2.

## 14. Próximos pasos

1. Self-review del spec (inmediato).
2. User review del spec (gate).
3. Invocar `superpowers:writing-plans` para generar el plan de implementación.
4. Ejecutar con subagent-driven-development.
5. Merge a `main`.
6. Sigue Spec B (Decisión de saldo a favor).
