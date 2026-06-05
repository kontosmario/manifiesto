# Monthly Accounting Reframe — Design Spec

**Fecha**: 2026-06-05
**Branch**: `feature/monthly-accounting-reframe`
**Estado**: Aprobado para implementación
**Predecesor**: Spec A (`docs/superpowers/specs/2026-06-04-cycle-configurable-design.md`) — mergeada en `392b650`.
**Sucesor**: Spec B (Saldo a favor) — diseñada después.

---

## 1. Objetivo

Reframe del modelo mental de la app: **el presupuesto, los fijos y el sobrante viven en un plano mensual fijo. El cycle solo gobierna el countdown del próximo cobro y la confirmación de salario.**

**Por qué**: usuarios con cycle no-monthly (weekly/biweekly/custom) ven hoy saldos "spiky" porque los fijos mensuales caen en una sola semana/quincena. Para users dummies eso confunde. Las apps líderes del sector (Monarch, YNAB, Pocketguard) treatean fijos como objeto mensual independiente de cuándo cobra el user. Adoptamos ese patrón.

**No es**: una redefinición del cycle ni un cambio en la tabla `fixed_expenses`. Solo cambia la VENTANA DE AGREGACIÓN para metrics que hoy son cycle-based.

## 2. Principio rector

> Pensás mensual, cobrás tu cadencia.

- **Cycle** (la abstracción de Spec A) sigue existiendo y rige: countdown "sueldo en X días", confirmar cobro sheet, payday-pending flag.
- **MonthlyAccountingWindow** (NUEVO) rige: saldo, cupo diario, fijos windowing, proyección de cierre, sobrante para Spec B.

## 3. Anchor de la ventana mensual

| `cycle_type` | Ventana de accounting |
|---|---|
| `monthly` | `[salary_day, next_salary_day)` — IDÉNTICA al payCycle de hoy. Cero cambio para AR users. |
| `biweekly` / `weekly` / `custom` | Mes calendario `[día 1, día 1 del mes siguiente)` |

**Por qué este split**:
- Para monthly: la "salary month" es el mes mental natural del user (AR cobra el 20, piensa "del 20 al 19 es mi mes"). Forzar calendar month rompería su UX.
- Para non-monthly: no hay "salary month" natural (Anna cobra cada viernes, no piensa "del viernes 6 al jueves 5"). El mes calendario es el ancla más cercana al modelo "fin de mes pago el alquiler".

## 4. Modelo de datos

**Cero cambios en DB**. Toda la lógica vive en el cliente.

## 5. Nuevo helper TS

`mobile/utils/monthly-accounting.ts`:

```ts
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { getCurrentPayCycle, normalizeToStartOfDay } from '@/utils/pay-cycle'
import { DAY_MS } from '@/utils/time'

export interface MonthlyAccountingWindow {
  /** First day of current accounting month (inclusive). */
  start: Date
  /** First day of NEXT accounting month (exclusive). */
  end: Date
  /** Days in this month (28-31). */
  days: number
  today: Date
  /** 1-indexed: day 1 = first day of month. */
  daysIntoMonth: number
  /** Includes today: 1 = "es el último día". */
  daysRemaining: number
}

export function computeMonthlyAccountingWindow(
  cycleConfig: FinanceCycleConfig,
  today: Date,
): MonthlyAccountingWindow {
  const todayNorm = normalizeToStartOfDay(today)
  if (cycleConfig.cycle_type === 'monthly') {
    // Use the pay cycle as-is — for monthly users la salary month
    // ES el accounting month.
    const cycle = getCurrentPayCycle(todayNorm, cycleConfig)
    const daysIntoMonth = Math.floor((todayNorm.getTime() - cycle.start.getTime()) / DAY_MS) + 1
    const daysRemaining = Math.max(1, Math.ceil((cycle.end.getTime() - todayNorm.getTime()) / DAY_MS))
    return {
      start: cycle.start,
      end: cycle.end,
      days: cycle.days,
      today: todayNorm,
      daysIntoMonth,
      daysRemaining,
    }
  }
  // Non-monthly: calendar month.
  const start = new Date(todayNorm.getFullYear(), todayNorm.getMonth(), 1)
  const end = new Date(todayNorm.getFullYear(), todayNorm.getMonth() + 1, 1)
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS)
  const daysIntoMonth = todayNorm.getDate()
  const daysRemaining = days - daysIntoMonth + 1
  return { start, end, days, today: todayNorm, daysIntoMonth, daysRemaining }
}
```

## 6. Hook `useMonthlyAccounting`

`mobile/hooks/use-monthly-accounting.ts`:

```ts
import { useMemo } from 'react'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'
import {
  computeMonthlyAccountingWindow,
  type MonthlyAccountingWindow,
} from '@/utils/monthly-accounting'
import { normalizeToStartOfDay } from '@/utils/pay-cycle'

export function useMonthlyAccounting(familyId?: string): MonthlyAccountingWindow {
  const finance = useFamilyFinance(familyId)
  return useMemo(() => {
    const today = normalizeToStartOfDay(new Date())
    const config = financeToCycleConfig(finance.data)
    return computeMonthlyAccountingWindow(config, today)
  }, [
    finance.data?.cycle_type,
    finance.data?.salary_payment_day,
    finance.data?.cycle_anchor_date,
    finance.data?.cycle_length_days,
  ])
}
```

## 7. Surfaces que migran a la ventana mensual

| Surface | Archivo | Cambio |
|---|---|---|
| Saldo del mes (Home hero) | `mobile/features/home/use-home-metrics.ts` | Filtrar `income_events` por `[monthly.start, monthly.end)` en vez de `[cycle.start, cycle.end)` |
| Cupo diario | `mobile/features/expenses/daily-budget-engine.ts:82-130` | Dividir por `monthly.days` en vez de `payCycle.days` |
| Cupo diario (consumer) | `mobile/features/home/use-home-metrics.ts:208-222` | Idem |
| Fijos por estado (overdue/pending/future) | `mobile/features/fijos/fijos-aggregates.model.ts` | Clasificar por `[monthly.start, monthly.end)`. Recibir `monthly.{start,end,days}` en vez de `cycle.{start,end,days}` |
| Fijos hero "Por pagar este mes" | `mobile/features/fijos/use-fijos-controller.ts` | Pasar `monthly.*` a `summarizeFijos` |
| Gastos del mes (agregado para Control + Home) | `mobile/features/insights/control-v2-adapter.ts:178-257` | Filtrar expenses por ventana mensual |
| Proyección de cierre | `mobile/features/insights/control-v2-adapter.ts:295-304` y `mobile/features/home/use-home-metrics.ts:224-231` | `daysElapsed`, `daysTotal` desde `monthly.*` |
| Día chip ("día X de Y") | `mobile/components/home/home-hero-card.tsx:62-72` | `monthly.daysIntoMonth` de `monthly.days` |

## 8. Surfaces que NO cambian

| Surface | Por qué se queda con `cycle` |
|---|---|
| "Sueldo en X días" pill | Es timing del próximo cobro real, no accounting |
| Confirmar cobro sheet (trigger) | `isPaydayPending(cycle, lastConfirmedAt)` — el "ya cobré" se activa cuando arranca un nuevo cycle, no cuando arranca el mes |
| Settings — Ciclo de cobro | Sigue diciendo "ciclo" porque es config de cómo cobra el user |
| Onboarding step-income | Idem |

## 9. Copy reframing (UI visible al user)

| Hoy | Después |
|---|---|
| "Saldo del ciclo" | "Saldo del mes" |
| "Por pagar este ciclo" (fijos hero) | "Por pagar este mes" |
| "Fijos vencidos este ciclo" | "Fijos vencidos este mes" |
| "Cierre del ciclo" | "Cierre del mes" |
| "Día X de Y" (donde Y era cycle.days) | "Día X de Y" (Y ahora es mes calendario, 28-31) |
| "Este ciclo" en signals/copy | "Este mes" |

**Settings — "Ciclo de cobro"**: queda IGUAL. Esa es config, no accounting view.

## 10. Edge cases reconocidos

- **Monthly user**: cero cambios visibles. Su `MonthlyAccountingWindow` coincide exactamente con su `PayCycle`. Es zero-risk para AR users existentes.

- **Non-monthly user cambia tipo a monthly y viceversa**: la transición es transparente porque ambos modelos viven juntos. Próxima invocación del hook re-deriva la ventana correcta.

- **Non-monthly user el día 1 del mes**: `daysIntoMonth = 1`, `daysRemaining = days`. El cupo se calcula del mes nuevo. Si todavía no confirmó el cobro de su última semana, la pill seguirá mostrando pending (correcto — es cycle-aware).

- **`current_cycle_starting_balance` override**: para `monthly` users este override sigue funcionando como hoy (override de su monthly accounting). Para non-monthly users, el override queda como info "lo que cobré este cycle" (sin reemplazar el monthly accounting). **V1 — el override solo afecta accounting para `cycle_type='monthly'`**. Documentado como limitación; Spec B puede reabrir el tema.

- **Fijo con `next_due_on` que cae en el cycle pero NO en el mes calendario** (caso para non-monthly users): aparece en el mes calendario que contiene su due date. No "salta" entre cycles porque el accounting es mensual.

- **Mes con 28 días vs 31**: cupo diario varía ligeramente (4-10% según mes). Aceptable — eso es realidad del calendario.

## 11. Testing

### 11.1 Unit (Vitest)

- `monthly-accounting.test.ts`:
  - 4 tipos × `today=2026-06-05`: monthly day 20 → window `[may 20, jun 20)`, biweekly/weekly/custom → window `[jun 1, jul 1)`.
  - Edge: today is day 1 of month.
  - Edge: today is last day of month.
  - Edge: monthly user día 20 vs día 25 (window cambia).

- Actualizar `daily-budget-engine.test.ts` para usar `monthlyDays` en lugar de `cycleDays` en su test data.

- Actualizar `fijos-aggregates.test.ts` (si existe) para pasar `monthlyStart/End` en vez de `cycleStart/End`.

### 11.2 Integration (linked DB)

`tests/integration/monthly-accounting-flow.test.ts`:
- Seed family con cycle weekly anchored jun 1, monthly_income 1.000.000, monthly_fijos 200.000.
- Verificar via home_snapshot que el cliente derivaría "saldo del mes" = 800k (no spiky por week).
- Seed family con cycle monthly day 20, mismo income/fijos. Verificar saldo = 800k (matchea hoy).

### 11.3 Manual smoke

- Mensual (AR): TODO debería verse igual a hoy. Zero regresión visual.
- Weekly (USA): hero dice "Saldo del mes: $X", cupo es parejo toda la semana, fijos hero suma TODOS los del mes.
- Mid-month transición: día 30 → día 1 del mes siguiente — verifico que las metrics se "resetean" al inicio del mes calendario para non-monthly.

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| Monthly users notan cambios sutiles (días de cupo, copy) | Probar exhaustivamente que MonthlyAccountingWindow === PayCycle para `cycle_type='monthly'`. Test paritario en unit + smoke manual con cuenta monthly. |
| `daily-budget-engine` falla porque recibe ventana distinta | Plan de Tasks lo cambia con TDD primero — tests gobiernan la nueva división. |
| Fijos display rompe (un fijo deja de aparecer) | Spec define que clasificación de fijos pasa de cycle a monthly window. Test de paridad para monthly users. |
| Forecast engine queda inconsistente entre Home y Control | Ambos consumen `monthly.*` desde el mismo hook — consistencia por construcción. |

## 13. Out of scope

- **No tocamos `fixed_expenses.frequency`**: weekly/biweekly/quarterly fijos existen y se respetan. Solo cambia la VISTA agregada.
- **No tocamos `current_cycle_starting_balance` para non-monthly users**: queda fuera para V1. Spec B puede integrarlo después.
- **No agregamos "weekly summary" para non-monthly users**: si en el futuro queremos mostrar "esta semana cobraste $X, gastaste $Y", es feature aparte.
- **No agregamos prorrateo de fijos**: el cómputo sigue siendo "este fijo cuenta una vez al mes" (sum). No fraccionamos.

## 14. Próximos pasos

1. Self-review (inmediato).
2. User review del spec.
3. `writing-plans` → plan de tareas.
4. Subagent-driven execution.
5. E2E suite update.
6. Merge a main.
7. Sigue Spec B.
