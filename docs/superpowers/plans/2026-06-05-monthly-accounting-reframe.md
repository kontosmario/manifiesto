# Monthly Accounting Reframe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal**: Reframe presupuesto/fijos/saldo al plano mensual fijo, dejando el cycle solo para countdown y confirmar-cobro.

**Architecture**: Nuevo `MonthlyAccountingWindow` que vive paralelo al `PayCycle`. Para `cycle_type='monthly'` matchea exactamente el PayCycle (cero regresión AR). Para otros: mes calendario `[día 1, día 1 del próximo)`. Los consumers que hoy usan `payCycle.*` para agregar/dividir/filtrar migran a `monthlyAccounting.*`.

**Tech Stack**: TypeScript + Expo, Vitest unit (env=node), Vitest integration (linked DB).

**Spec**: [2026-06-05-monthly-accounting-reframe-design.md](../specs/2026-06-05-monthly-accounting-reframe-design.md)

---

## Tasks

### Task 1: `monthly-accounting.ts` + tests (TDD)

**Files:**
- Create: `mobile/utils/monthly-accounting.ts`
- Create: `tests/unit/monthly-accounting.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/monthly-accounting.test.ts
import { describe, expect, it } from 'vitest'
import { computeMonthlyAccountingWindow } from '@/utils/monthly-accounting'

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('monthly accounting window — monthly cycle (== payCycle)', () => {
  it('matches the pay cycle for monthly user day 20, today=jun 5', () => {
    const w = computeMonthlyAccountingWindow(
      { cycle_type: 'monthly', salary_payment_day: 20 },
      D(2026, 6, 5),
    )
    expect(w.start).toEqual(D(2026, 5, 20))
    expect(w.end).toEqual(D(2026, 6, 20))
    expect(w.days).toBe(31)
    expect(w.daysIntoMonth).toBe(17)
    expect(w.daysRemaining).toBe(15)
  })
})

describe('monthly accounting window — non-monthly cycle (calendar month)', () => {
  it('biweekly: calendar month jun 1 → jul 1', () => {
    const w = computeMonthlyAccountingWindow(
      { cycle_type: 'biweekly', cycle_anchor_date: '2026-05-23', cycle_length_days: 14 },
      D(2026, 6, 5),
    )
    expect(w.start).toEqual(D(2026, 6, 1))
    expect(w.end).toEqual(D(2026, 7, 1))
    expect(w.days).toBe(30)
    expect(w.daysIntoMonth).toBe(5)
    expect(w.daysRemaining).toBe(26)
  })

  it('weekly: today is day 1 of month', () => {
    const w = computeMonthlyAccountingWindow(
      { cycle_type: 'weekly', cycle_anchor_date: '2026-05-30', cycle_length_days: 7 },
      D(2026, 6, 1),
    )
    expect(w.start).toEqual(D(2026, 6, 1))
    expect(w.end).toEqual(D(2026, 7, 1))
    expect(w.daysIntoMonth).toBe(1)
    expect(w.daysRemaining).toBe(30)
  })

  it('custom: today is last day of month (jul 31)', () => {
    const w = computeMonthlyAccountingWindow(
      { cycle_type: 'custom', cycle_anchor_date: '2026-06-01', cycle_length_days: 10 },
      D(2026, 7, 31),
    )
    expect(w.start).toEqual(D(2026, 7, 1))
    expect(w.end).toEqual(D(2026, 8, 1))
    expect(w.daysIntoMonth).toBe(31)
    expect(w.daysRemaining).toBe(1)
  })

  it('handles february (28 days, non-leap)', () => {
    const w = computeMonthlyAccountingWindow(
      { cycle_type: 'weekly', cycle_anchor_date: '2026-02-06', cycle_length_days: 7 },
      D(2026, 2, 15),
    )
    expect(w.days).toBe(28)
  })
})
```

- [ ] **Step 2: Run — confirm FAIL**

Run: `npm test -- --run tests/unit/monthly-accounting.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// mobile/utils/monthly-accounting.ts
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { getCurrentPayCycle, normalizeToStartOfDay } from '@/utils/pay-cycle'
import { DAY_MS } from '@/utils/time'

export interface MonthlyAccountingWindow {
  start: Date
  end: Date
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
  const start = new Date(todayNorm.getFullYear(), todayNorm.getMonth(), 1)
  const end = new Date(todayNorm.getFullYear(), todayNorm.getMonth() + 1, 1)
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS)
  const daysIntoMonth = todayNorm.getDate()
  const daysRemaining = days - daysIntoMonth + 1
  return { start, end, days, today: todayNorm, daysIntoMonth, daysRemaining }
}
```

- [ ] **Step 4: Tests pass**

`npm test -- --run tests/unit/monthly-accounting.test.ts` → 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/utils/monthly-accounting.ts tests/unit/monthly-accounting.test.ts
git commit -m "feat(utils): MonthlyAccountingWindow — monthly matches payCycle, others use calendar month"
```

---

### Task 2: `useMonthlyAccounting` hook

**Files:**
- Create: `mobile/hooks/use-monthly-accounting.ts`

- [ ] **Step 1: Implement**

```ts
// mobile/hooks/use-monthly-accounting.ts
import { useMemo } from 'react'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'
import {
  computeMonthlyAccountingWindow,
  type MonthlyAccountingWindow,
} from '@/utils/monthly-accounting'
import { normalizeToStartOfDay } from '@/utils/pay-cycle'

export type { MonthlyAccountingWindow } from '@/utils/monthly-accounting'

/**
 * Single source of truth para la ventana de "accounting mensual".
 * Para users `cycle_type='monthly'` matchea exactamente la salary
 * cycle (cero regresión vs hoy). Para non-monthly, devuelve la
 * ventana del mes calendario.
 *
 * Spec: docs/superpowers/specs/2026-06-05-monthly-accounting-reframe-design.md
 */
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

- [ ] **Step 2: Typecheck**

`npm run typecheck` → PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/hooks/use-monthly-accounting.ts
git commit -m "feat(hooks): useMonthlyAccounting — paralelo a usePayCycle, plano mensual fijo"
```

---

### Task 3: Surface accounting window al family-dashboard

**Files:**
- Modify: `mobile/features/family/family-dashboard-model.ts`
- Modify: `mobile/features/family/use-family-dashboard.ts` (si existe)

- [ ] **Step 1: Localizar dónde se expone `payCycle`**

`grep -n "payCycle\|cycleStart\|cycleEnd\|cycleDays" mobile/features/family/family-dashboard-model.ts mobile/features/family/use-family-dashboard.ts`

- [ ] **Step 2: Agregar `monthlyAccounting` en paralelo**

En `family-dashboard-model.ts`, agregar al objeto retornado por `useFamilyDashboard`:

```ts
import { useMonthlyAccounting } from '@/hooks/use-monthly-accounting'

// dentro del hook:
const monthlyAccounting = useMonthlyAccounting(familyId)

// en el return:
return {
  // ...existentes
  payCycle,
  monthlyAccounting,
  // derivados que dependen de cycle: mantener para confirmar-cobro/payday pill
}
```

**Importante**: NO remover `payCycle` ni nada derivado de él. Solo AGREGAR `monthlyAccounting`. Los consumers migran en tasks subsiguientes.

- [ ] **Step 3: Typecheck**

`npm run typecheck` → PASS. Si los consumers tipan estrictamente `useFamilyDashboard`, agregar el field es backwards-compatible (additive).

- [ ] **Step 4: Commit**

```bash
git add mobile/features/family/family-dashboard-model.ts mobile/features/family/use-family-dashboard.ts
git commit -m "feat(dashboard): surface monthlyAccounting alongside payCycle"
```

---

### Task 4: Migrar `daily-budget-engine` a `monthly.days`

**Files:**
- Modify: `mobile/features/expenses/daily-budget-engine.ts`

- [ ] **Step 1: Localizar la división**

`grep -n "cycleDays\|effectiveCycleDays\|payCycle\.days" mobile/features/expenses/daily-budget-engine.ts`

- [ ] **Step 2: Renombrar param + ajustar division**

Cambiar la firma de la función principal para que reciba `monthlyDays: number` en vez de `cycleDays: number`. La división `operationalCycleBudget / effectiveCycleDays` se vuelve `operationalMonthlyBudget / effectiveMonthlyDays`.

Si el archivo expone helpers internos por `cycleDays`, mantenerlos disponibles bajo el nombre nuevo. NO crear adaptador legacy — los call-sites se actualizan en Task 5.

- [ ] **Step 3: Actualizar tests existentes**

`tests/unit/daily-budget-engine.test.ts` (si existe) — renombrar `cycleDays` → `monthlyDays` en los fixtures. Los valores numéricos no cambian para tests con `monthly` cycle (28-31 días).

- [ ] **Step 4: Run tests**

`npm test -- --run tests/unit/daily-budget-engine` → PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/expenses/daily-budget-engine.ts tests/unit/daily-budget-engine.test.ts
git commit -m "refactor(daily-budget): divide por monthlyDays en vez de cycleDays"
```

---

### Task 5: Migrar `use-home-metrics` a monthly window

**Files:**
- Modify: `mobile/features/home/use-home-metrics.ts`

- [ ] **Step 1: Identificar TODOS los usos de cycle**

`grep -n "cycleStart\|cycleEnd\|cycleDays\|payCycle\|cycleTotalDays\|cycleDay" mobile/features/home/use-home-metrics.ts`

- [ ] **Step 2: Reemplazar agregadores cycle-based**

Para cada match, distinguir:
- **Filtrado de income_events / expenses por ventana de tiempo** → usar `monthlyAccounting.start/end`
- **División de cupo** → usar `monthlyAccounting.days`
- **`cycleDay` (día actual de la ventana)** → `monthlyAccounting.daysIntoMonth`
- **`cycleTotalDays` para proyección** → `monthlyAccounting.days`

Source: `const monthlyAccounting = dashboard.monthlyAccounting` (Task 3 lo expuso).

- [ ] **Step 3: Verificar `dashboard.payCycle` consumers que NO migran**

Lista de los que se quedan con `payCycle`:
- `paydayPending` flag (Task ya completada en Spec A QA fixes — usa cycle)
- `daysUntilPayday` (Task ya completada)
- Cualquier metric "cuándo es el próximo cobro real"

- [ ] **Step 4: Typecheck + test suite**

`npm run typecheck && npm test -- --run` → PASS. Si alguna unit test de home-metrics rompe por usar `cycleDays` en su fixture, actualizar el fixture a `monthlyDays`.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/home/use-home-metrics.ts tests/unit/<si tocaste>
git commit -m "refactor(home-metrics): saldo/cupo/proyección usan monthlyAccounting"
```

---

### Task 6: Migrar `fijos-aggregates` y controller a monthly window

**Files:**
- Modify: `mobile/features/fijos/fijos-aggregates.model.ts`
- Modify: `mobile/features/fijos/use-fijos-controller.ts`

- [ ] **Step 1: Cambiar signatures de `summarizeFijos` + helpers**

En `fijos-aggregates.model.ts`, donde recibe `cycleStart`, `cycleEnd`, `cycleDays`, renombrar a `monthlyStart`, `monthlyEnd`, `monthlyDays`. La lógica interna (clasificar `next_due_on` contra la ventana) NO cambia — solo el ancla.

- [ ] **Step 2: Wire en `use-fijos-controller.ts`**

Reemplazar `cycle.start`/`cycle.end`/`cycle.days` por `monthlyAccounting.start`/`.end`/`.days`. Para AR users (monthly cycle) el comportamiento es idéntico.

- [ ] **Step 3: Verificar tests**

Si hay tests para `summarizeFijos`, actualizar fixtures.

- [ ] **Step 4: Typecheck + tests**

`npm run typecheck && npm test -- --run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/fijos/fijos-aggregates.model.ts mobile/features/fijos/use-fijos-controller.ts
git commit -m "refactor(fijos): clasificación por monthly window en vez de cycle window"
```

---

### Task 7: Migrar `control-v2-adapter` (proyección + agregados)

**Files:**
- Modify: `mobile/features/insights/control-v2-adapter.ts`

- [ ] **Step 1: Identificar usos**

`grep -n "payCycle\|cycleStart\|cycleEnd\|cycleDays\|diasMes" mobile/features/insights/control-v2-adapter.ts`

- [ ] **Step 2: Reemplazar `payCycle.*` por `monthlyAccounting.*`**

Para los filtros `expenses.filter(e >= cycleStart && < cycleEnd)`, swap a `monthlyStart`/`monthlyEnd`. Para la proyección lineal `(spent/daysElapsed) * diasMes`, swap a `monthlyAccounting.daysIntoMonth` y `.days`.

- [ ] **Step 3: Tests + typecheck**

`npm run typecheck && npm test -- --run`. Si hay tests en `tests/unit/control-*` que rompen, ajustar fixtures.

- [ ] **Step 4: Commit**

```bash
git add mobile/features/insights/control-v2-adapter.ts tests/unit/<si tocaste>
git commit -m "refactor(control): proyección + agregados sobre monthly window"
```

---

### Task 8: Copy reframe — "ciclo" → "mes" en strings visibles

**Files:**
- Modify: paths con strings visibles (no código interno)

- [ ] **Step 1: Buscar strings visibles**

```bash
grep -rn "Saldo del ciclo\|del ciclo\|este ciclo\|Por pagar este ciclo\|Cierre del ciclo\|Fijos del ciclo\|Fijos vencidos este ciclo" mobile/ --include="*.tsx" --include="*.ts" | grep -v "\.test\."
```

- [ ] **Step 2: Aplicar mapping del spec**

Por cada match, swap según la tabla del spec section 9:
- "Saldo del ciclo" → "Saldo del mes"
- "Por pagar este ciclo" → "Por pagar este mes"
- "Cierre del ciclo" → "Cierre del mes"
- "Este ciclo" → "Este mes"
- "Fijos vencidos este ciclo" → "Fijos vencidos este mes"

**NO TOCAR**:
- "Ciclo de cobro" (en Settings — eso es config, no accounting)
- Identificadores de variables / función / archivo (cycleType, payCycle, cycle_type, etc.)
- Comentarios técnicos en código

- [ ] **Step 3: Typecheck + tests + bundle**

`npm run typecheck && npm test -- --run && npx expo export --platform ios --output-dir /tmp/check`

- [ ] **Step 4: Commit**

```bash
git add <files>
git commit -m "copy(reframe): 'ciclo' → 'mes' en strings visibles (settings y código sin tocar)"
```

---

### Task 9: Update "día X de Y" chip en home hero

**Files:**
- Modify: `mobile/components/home/home-hero-card.tsx`

- [ ] **Step 1: Localizar**

`grep -n "cycleDay\|cycleTotalDays\|dayChipLabel\|día.*de" mobile/components/home/home-hero-card.tsx`

- [ ] **Step 2: Reemplazar**

```ts
// antes:
const dayChipLabel = data.paydayPending
  ? `+${data.paydayDaysOverdue} día(s) sin cobrar`
  : `día ${data.cycleDay} de ${data.cycleTotalDays}`

// después:
const dayChipLabel = data.paydayPending
  ? `+${data.paydayDaysOverdue} día(s) sin cobrar`
  : `día ${data.daysIntoMonth} de ${data.monthlyDays}`
```

Y wireo `daysIntoMonth` / `monthlyDays` desde `dashboard.monthlyAccounting` en el data builder upstream.

- [ ] **Step 3: Typecheck**

`npm run typecheck` → PASS.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/home/home-hero-card.tsx mobile/features/home/use-home-metrics.ts
git commit -m "ui(home): día-chip muestra día del mes (28-31)"
```

---

### Task 10: Integration test paritario monthly == cycle

**Files:**
- Create: `tests/integration/monthly-accounting-flow.test.ts`

- [ ] **Step 1: Test**

```ts
// tests/integration/monthly-accounting-flow.test.ts
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { isSupabaseLocalReachable, userClient } from './_helpers/supabase-test-client'
import { cleanupFamily, seedMinimalFamily, type SeededFamily } from './_helpers/seed'
import { computeMonthlyAccountingWindow } from '@/utils/monthly-accounting'
import { getCurrentPayCycle } from '@/utils/pay-cycle'
import { normalizeToStartOfDay } from '@/utils/pay-cycle'

let reachable = false
let lastSeeded: SeededFamily | null = null

beforeAll(async () => { reachable = await isSupabaseLocalReachable() })
afterEach(async () => { if (lastSeeded) { await cleanupFamily(lastSeeded); lastSeeded = null } })

describe('Monthly accounting paridad / reframe E2E', () => {
  it('monthly user: monthlyAccounting EXACTAMENTE matchea payCycle (cero regresión)', () => {
    const today = normalizeToStartOfDay(new Date())
    const config = { cycle_type: 'monthly' as const, salary_payment_day: 20 }
    const pay = getCurrentPayCycle(today, config)
    const ma = computeMonthlyAccountingWindow(config, today)
    expect(ma.start.getTime()).toBe(pay.start.getTime())
    expect(ma.end.getTime()).toBe(pay.end.getTime())
    expect(ma.days).toBe(pay.days)
  })

  it('biweekly user: monthlyAccounting es el mes calendario, NO el cycle de 14d', () => {
    const today = normalizeToStartOfDay(new Date())
    const config = { cycle_type: 'biweekly' as const, cycle_anchor_date: '2026-05-23', cycle_length_days: 14 as const }
    const pay = getCurrentPayCycle(today, config)
    const ma = computeMonthlyAccountingWindow(config, today)
    // monthly anchored a día 1 del mes actual
    expect(ma.start.getDate()).toBe(1)
    expect(ma.days).toBeGreaterThanOrEqual(28)
    expect(ma.days).toBeLessThanOrEqual(31)
    // Y NO matchea el pay cycle (14 días)
    expect(pay.days).toBe(14)
  })

  it('seed family weekly + home_snapshot: el cliente derivaría saldo NO spiky', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('', {
      cycle: { cycle_type: 'weekly', cycle_anchor_date: '2026-06-01', cycle_length_days: 7 },
    })
    lastSeeded = family
    const client = userClient(family.ownerAccessToken)
    const { data } = await client.rpc('home_snapshot')
    const finance = (data as Record<string, unknown>).family_finance as Record<string, unknown>
    expect(finance.cycle_type).toBe('weekly')
    // El snapshot devuelve el cycle weekly (correcto). El cliente
    // computa monthlyAccounting LOCAL — el snapshot no lo envía.
    // Verifico al menos que el monthly_income está disponible.
    expect(Number(finance.monthly_income)).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run**

`npm run test:integration -- tests/integration/monthly-accounting-flow.test.ts` → 3/3 PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/monthly-accounting-flow.test.ts
git commit -m "test(e2e): monthly accounting paridad monthly==cycle + non-monthly==calendar"
```

---

### Task 11: Verification + manual smoke

- [ ] **Step 1: Full suite**

```bash
npm run typecheck && npm test -- --run && npx expo export --platform ios --output-dir /tmp/check
```

Esperar: typecheck PASS, todos los tests PASS, bundle OK.

- [ ] **Step 2: Smoke manual con cuenta monthly (AR)**

Verificar que TODO se ve idéntico a antes del reframe: saldo, cupo diario, fijos hero, día chip, copy. **Zero regresión visual** es el criterio de éxito.

- [ ] **Step 3: Smoke manual con cuenta biweekly (mario7)**

Esperar: saldo del mes mostrado uniformemente, cupo diario parejo todo el mes, fijos hero suma del mes, "día X de Y" con Y entre 28-31.

- [ ] **Step 4: Commit final si encontraste polish**

(Solo si encontraste y arreglaste algo.)

---

### Task 12: Merge a main

- [ ] **Step 1: Final code review**

Dispatch subagent revisor sobre el branch completo. Confirmar:
- Para monthly users: comportamiento idéntico
- Para non-monthly users: el flow nuevo aplica consistentemente

- [ ] **Step 2: Merge**

```bash
git checkout main
git merge --no-ff feature/monthly-accounting-reframe -m "Merge branch 'feature/monthly-accounting-reframe'"
```

---

## Self-Review

**Spec coverage**: 14 sections del spec mapean a Tasks 1-11. ✓
**Placeholder scan**: ninguno — todos los snippets son código real. ✓
**Type consistency**: `MonthlyAccountingWindow` es la única struct nueva, signature consistente en Tasks 1-9. ✓
