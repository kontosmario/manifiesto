# Fijos: deuda por cuotas + editar sin rebobinar + días reales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las cuotas vencidas acumuladas de un fijo sean visibles y pagables (una por una hasta ponerse al día), que editar un fijo no rebobine su `next_due_on`, y que "vence en X días" sea la diferencia real de fechas.

**Architecture:** Todo client-side — cero migraciones y cero cambios en RPCs (el backend ya ancla la identidad de cuota al vencimiento vía `period_month` y soporta catch-up de a una). Se corrige el espejo cliente de `advance_fixed_expense_due_date`, se invierte la prioridad overdue/paid en `computeItemStatus`, se agrega `computeMissedCuotas` al modelo puro, y se cablea UI (fila, ticker, hero) + optimistic update + editor.

**Tech Stack:** React Native (Expo), TypeScript, React Query v5, vitest (env `node`, sin renderer de React — NO se pueden testear hooks, solo funciones puras), i18next (ES + EN).

**Spec:** `docs/superpowers/specs/2026-08-14-fijos-deuda-cuotas-y-fixes-design.md`

## Global Constraints

- **Jamás** incluir atribución de Claude/Anthropic/IA en commits, código o comentarios. Identidad git: Mario Kontos.
- Mensajes de commit: conventional commits en español (`fix(fijos): …`, `feat(fijos): …`), como el historial del repo.
- Antes de cualquier `npx vitest` / `npx tsc` / `npm run`: `source ~/.nvm/nvm.sh` (el Bash tool no carga nvm).
- Suite de tests: `npx vitest run` tiene **3 fallas baseline conocidas** ajenas a este trabajo. Criterio de éxito: no aparecen fallas NUEVAS. `npm run validate` en este branch ya fallaba antes (motion-tokens ajenos) — comparar contra baseline, no exigir verde.
- Copy en **español neutro Latam (tuteo)**: "Debes", nunca "Debés". Toda key nueva va en ES **y** EN (`mobile/lib/i18n/locales/{es,en}/fijos.json`). Cambios de copy ⇒ correr la suite completa.
- Comparaciones de fechas: `next_due_on` es `YYYY-MM-DD` sin TZ; comparar en **UTC midnight** (mismo criterio que `computeItemStatus`, `fijos-aggregates.model.ts:184-202`).
- No tocar `record_fixed_expense_payment` / `revert_fixed_expense_payment` ni ninguna migración.

---

### Task 1: Espejo cliente de `advance_fixed_expense_due_date` (clamp + `day_of_month`)

El espejo actual (`commitment-date-utils.ts:58-90`) está muerto (sin call-sites reales) y **divergente** del SQL: usa `setMonth` sin clamp ni re-anclaje. Se reescribe para replicar `supabase/migrations/20260423141534_add_day_of_month_to_fixed_expenses.sql:43-86` exactamente. Lo consumen la Task 3 (`computeMissedCuotas`) y la Task 5 (optimistic update).

**Files:**
- Modify: `mobile/features/fixed-expenses/commitment-date-utils.ts:58-90`
- Create: `tests/unit/commitment-date-utils.test.ts`

**Interfaces:**
- Consumes: `FixedExpenseFrequency` de `@/features/fixed-expenses/fixed-expense-types`.
- Produces: `advanceFixedExpenseDueDate(currentDueOn: string, frequency: FixedExpenseFrequency, dayOfMonth?: number | null): string` — ISO `YYYY-MM-DD`. Firma nueva (se agrega el 3er parámetro); no hay callers existentes que romper (verificar con grep en el Step 3).

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// tests/unit/commitment-date-utils.test.ts
import { describe, it, expect } from 'vitest'
import { advanceFixedExpenseDueDate } from '@/features/fixed-expenses/commitment-date-utils'

describe('advanceFixedExpenseDueDate — paridad con el SQL', () => {
  it('weekly suma 7 días e ignora day_of_month', () => {
    expect(advanceFixedExpenseDueDate('2026-06-10', 'weekly', 31)).toBe('2026-06-17')
  })
  it('biweekly suma 14 días e ignora day_of_month', () => {
    expect(advanceFixedExpenseDueDate('2026-06-25', 'biweekly', 1)).toBe('2026-07-09')
  })
  it('monthly re-ancla al day_of_month clampado (31 → feb 28)', () => {
    expect(advanceFixedExpenseDueDate('2026-01-31', 'monthly', 31)).toBe('2026-02-28')
  })
  it('monthly recupera el ancla al salir del mes corto (feb 28 → mar 31)', () => {
    expect(advanceFixedExpenseDueDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31')
  })
  it('monthly con año bisiesto (ene 31 2028 → feb 29)', () => {
    expect(advanceFixedExpenseDueDate('2028-01-31', 'monthly', 31)).toBe('2028-02-29')
  })
  it('quarterly salta 3 meses y clampa (ene 31 → abr 30)', () => {
    expect(advanceFixedExpenseDueDate('2026-01-31', 'quarterly', 31)).toBe('2026-04-30')
  })
  it('semiannual salta 6 meses', () => {
    expect(advanceFixedExpenseDueDate('2026-01-15', 'semiannual', 15)).toBe('2026-07-15')
  })
  it('annual salta 12 meses y clampa (feb 29 2028 → feb 28 2029)', () => {
    expect(advanceFixedExpenseDueDate('2028-02-29', 'annual', 29)).toBe('2029-02-28')
  })
  it('sin day_of_month conserva el día base clampado', () => {
    expect(advanceFixedExpenseDueDate('2026-01-31', 'monthly', null)).toBe('2026-02-28')
    expect(advanceFixedExpenseDueDate('2026-01-15', 'monthly')).toBe('2026-02-15')
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `source ~/.nvm/nvm.sh && npx vitest run tests/unit/commitment-date-utils.test.ts`
Expected: FAIL (la implementación actual no clampa: `2026-01-31` monthly da `2026-03-03`).

- [ ] **Step 3: Confirmar que no hay callers de la firma vieja**

Run: `grep -rn "advanceFixedExpenseDueDate" mobile/ --include="*.ts" --include="*.tsx" | grep -v commitment-date-utils`
Expected: solo el re-export en `mobile/features/fixed-expenses/commitment-utils.ts:2`. Si aparece otro caller, detenerse y reportar.

- [ ] **Step 4: Reescribir la implementación**

Reemplazar `advanceFixedExpenseDueDate` (`commitment-date-utils.ts:58-90`) por aritmética pura de año/mes (sin `Date.setMonth`, que desborda meses cortos):

```ts
/**
 * Espejo EXACTO de `advance_fixed_expense_due_date` (SQL, migración
 * 20260423141534). weekly/biweekly suman días e ignoran el ancla;
 * el resto salta meses y re-ancla a `dayOfMonth` clampado a los días
 * reales del mes destino (31 → feb 28/29 → vuelve a 31 en marzo).
 * Sin `dayOfMonth` se conserva el día base, también clampado (igual
 * que el interval math de Postgres).
 */
export function advanceFixedExpenseDueDate(
  currentDueOn: string,
  frequency: FixedExpenseFrequency,
  dayOfMonth?: number | null,
): string {
  const m = currentDueOn.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return currentDueOn
  const [, y, mo, d] = m
  let year = Number(y)
  let month = Number(mo) // 1..12
  const baseDay = Number(d)

  if (frequency === 'weekly' || frequency === 'biweekly') {
    const days = frequency === 'weekly' ? 7 : 14
    const next = new Date(Date.UTC(year, month - 1, baseDay + days))
    return next.toISOString().slice(0, 10)
  }

  const monthsToAdd =
    frequency === 'quarterly' ? 3 : frequency === 'semiannual' ? 6 : frequency === 'annual' ? 12 : 1
  const zeroBased = month - 1 + monthsToAdd
  year += Math.floor(zeroBased / 12)
  month = (zeroBased % 12) + 1

  const daysInTarget = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const anchor = dayOfMonth ?? baseDay
  const safeDay = Math.min(Math.max(anchor, 1), daysInTarget)
  const yyyy = String(year)
  const mm = String(month).padStart(2, '0')
  const dd = String(safeDay).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `source ~/.nvm/nvm.sh && npx vitest run tests/unit/commitment-date-utils.test.ts`
Expected: PASS (9/9).

- [ ] **Step 6: Commit**

```bash
git add mobile/features/fixed-expenses/commitment-date-utils.ts tests/unit/commitment-date-utils.test.ts
git commit -m "fix(fijos): espejo cliente de advance con clamp y re-anclaje a day_of_month — paridad con el SQL"
```

---

### Task 2: Clasificación v5 — vencido gana sobre pagado

`computeItemStatus` (`mobile/features/fijos/fijos-aggregates.model.ts:175-216`) devuelve `'paid'` apenas hay un pago en la ventana, aunque `next_due_on` (ya avanzado por ese pago) siga en el pasado. Eso esconde la deuda restante. Nuevo orden: overdue → paid → cobertura/future → pending.

**Files:**
- Modify: `mobile/features/fijos/fijos-aggregates.model.ts:140-216` (docstring v5 + reorden)
- Test: `tests/unit/fijos-aggregates.test.ts` (agregar casos; los 5 existentes deben seguir pasando)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: mismo `FijoItemStatus`; cambia solo la prioridad. Task 3 y 6 dependen de que un fijo con `next_due_on < hoy` sea SIEMPRE `'overdue'`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `tests/unit/fijos-aggregates.test.ts` (usa los helpers `makeFixed`/`TODAY`/`MONTHLY_*` ya definidos en el archivo; para el payment row copiar la forma que usan los tests existentes de `paymentsThisCycle` — campos `id`, `fixedExpenseId`, `periodMonth`, `paidAt`, `paidBy`, `createdAt`, `expenseId`):

```ts
describe('computeItemStatus v5 — overdue gana sobre paid (vía summarizeFijos)', () => {
  it('con pago en el ciclo pero next_due_on aún en el pasado → overdue', () => {
    // Debía may-15 y jun-1; pagó may (RPC avanzó next_due_on a jun-1,
    // que sigue < TODAY jun-8). Antes: 'paid' (deuda invisible).
    const summary = summarizeFijos({
      items: [makeFixed({ next_due_on: '2026-06-01', last_paid_at: '2026-06-07T10:00:00Z' })],
      paymentsThisCycle: [
        {
          id: 'pay-1',
          fixedExpenseId: 'fx-1',
          periodMonth: '2026-05-01',
          paidAt: '2026-06-07T10:00:00Z',
          paidBy: 'user-1',
          createdAt: '2026-06-07T10:00:00Z',
          expenseId: 'exp-1',
        },
      ],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.overdueItems).toHaveLength(1)
    expect(summary.paidItems).toHaveLength(0)
  })

  it('pagado al día (next_due_on avanzado fuera del ciclo) sigue siendo paid', () => {
    const summary = summarizeFijos({
      items: [makeFixed({ next_due_on: '2026-07-15', last_paid_at: '2026-06-07T10:00:00Z' })],
      paymentsThisCycle: [
        {
          id: 'pay-1',
          fixedExpenseId: 'fx-1',
          periodMonth: '2026-06-01',
          paidAt: '2026-06-07T10:00:00Z',
          paidBy: 'user-1',
          createdAt: '2026-06-07T10:00:00Z',
          expenseId: 'exp-1',
        },
      ],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.paidItems).toHaveLength(1)
    expect(summary.overdueItems).toHaveLength(0)
  })

  it('semanal pagado semana 1 con siguiente vencimiento ya pasado → overdue', () => {
    // Pagó jun-1 (weekly, next_due_on avanzó a jun-8… ya venció de nuevo
    // el jun-5 — simulamos next_due_on jun-5 < TODAY jun-8).
    const summary = summarizeFijos({
      items: [
        makeFixed({
          frequency: 'weekly',
          next_due_on: '2026-06-05',
          last_paid_at: '2026-06-01T10:00:00Z',
        }),
      ],
      paymentsThisCycle: [
        {
          id: 'pay-1',
          fixedExpenseId: 'fx-1',
          periodMonth: '2026-06-01',
          paidAt: '2026-06-01T10:00:00Z',
          paidBy: 'user-1',
          createdAt: '2026-06-01T10:00:00Z',
          expenseId: 'exp-1',
        },
      ],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.overdueItems).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `source ~/.nvm/nvm.sh && npx vitest run tests/unit/fijos-aggregates.test.ts`
Expected: FAIL los 2 casos nuevos de overdue ('paid' gana hoy); el caso "pagado al día" PASS.

- [ ] **Step 3: Reordenar `computeItemStatus`**

En `fijos-aggregates.model.ts`, mover el check de overdue ANTES del de `paidThisPeriod`. El bloque `:181-204` queda:

```ts
  const { item, paidThisPeriod, today, cycleEnd } = input
  // v5: OVERDUE GANA SOBRE PAID. Si `next_due_on` está en el pasado hay
  // una cuota impaga AHORA, aunque exista un pago este ciclo (catch-up
  // parcial: pagó la cuota más vieja y quedan más). Antes `paidThisPeriod`
  // ganaba y la deuda restante quedaba invisible e impagable hasta el
  // próximo ciclo.
  if (item.next_due_on) {
    const due = new Date(item.next_due_on)
    const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    if (dueUtc < todayUtc) return 'overdue'
  }
  if (paidThisPeriod) return 'paid'
  if (!item.next_due_on) return 'pending'
```

y el resto de la función (cálculo de `endUtc`, regla de cobertura `:210-212` y el `return 'pending'`) queda igual — recomputar `dueUtc`/`todayUtc` ahí o hoistearlos; mantener una sola definición. Actualizar el docstring `:140-174` agregando la entrada v5 a la Historia.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `source ~/.nvm/nvm.sh && npx vitest run tests/unit/fijos-aggregates.test.ts`
Expected: PASS todos (los 5 casos históricos + 3 nuevos).

- [ ] **Step 5: Commit**

```bash
git add mobile/features/fijos/fijos-aggregates.model.ts tests/unit/fijos-aggregates.test.ts
git commit -m "fix(fijos): vencido gana sobre pagado — la deuda restante ya no se esconde tras un catch-up parcial"
```

---

### Task 3: `computeMissedCuotas` + `missedCuotas` en `FijoItem` + `overdueAmount` real

**Files:**
- Modify: `mobile/features/fijos/fijos-aggregates.model.ts` (nueva función exportada + campo en `FijoItem` + wiring en `summarizeFijos`)
- Test: `tests/unit/fijos-aggregates.test.ts`

**Interfaces:**
- Consumes: `advanceFixedExpenseDueDate(currentDueOn, frequency, dayOfMonth)` de Task 1 (import desde `@/features/fixed-expenses/commitment-date-utils`).
- Produces:
  - `computeMissedCuotas(input: { nextDueOn: string | null; frequency: FixedExpenseFrequency; dayOfMonth: number | null; today: Date }): { count: number; periods: string[] }` — `count` = cuotas con vencimiento `< hoy` (0 si nada vencido); `periods` = sus meses `YYYY-MM-01`, de la más vieja a la más nueva.
  - `FijoItem.missedCuotas: number` — 0 salvo en `overdue` (ahí ≥ 1).
  - `summary.overdueAmount` pasa a ser `Σ amount × missedCuotas`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { computeMissedCuotas } from '@/features/fijos/fijos-aggregates.model'

describe('computeMissedCuotas', () => {
  const today = new Date('2026-06-08T12:00:00')
  it('0 cuando next_due_on es hoy o futuro', () => {
    expect(
      computeMissedCuotas({ nextDueOn: '2026-06-08', frequency: 'monthly', dayOfMonth: 8, today }),
    ).toEqual({ count: 0, periods: [] })
  })
  it('1 cuota vencida simple', () => {
    expect(
      computeMissedCuotas({ nextDueOn: '2026-06-05', frequency: 'monthly', dayOfMonth: 5, today }),
    ).toEqual({ count: 1, periods: ['2026-06-01'] })
  })
  it('acumula multi-mes (abr + may + jun)', () => {
    expect(
      computeMissedCuotas({ nextDueOn: '2026-04-05', frequency: 'monthly', dayOfMonth: 5, today }),
    ).toEqual({ count: 3, periods: ['2026-04-01', '2026-05-01', '2026-06-01'] })
  })
  it('quincenal acumula por salto de 14 días', () => {
    // may-20, jun-3 vencidas; jun-17 futura.
    expect(
      computeMissedCuotas({ nextDueOn: '2026-05-20', frequency: 'biweekly', dayOfMonth: 20, today }),
    ).toEqual({ count: 2, periods: ['2026-05-01', '2026-06-01'] })
  })
  it('mes corto no rompe la cadena (ene-31 → feb-28 → mar-31)', () => {
    expect(
      computeMissedCuotas({
        nextDueOn: '2026-01-31',
        frequency: 'monthly',
        dayOfMonth: 31,
        today: new Date('2026-03-15T12:00:00'),
      }),
    ).toEqual({ count: 2, periods: ['2026-01-01', '2026-02-01'] })
  })
  it('null → 0', () => {
    expect(
      computeMissedCuotas({ nextDueOn: null, frequency: 'monthly', dayOfMonth: 5, today }),
    ).toEqual({ count: 0, periods: [] })
  })
})

describe('summarizeFijos — missedCuotas y overdueAmount', () => {
  it('overdueAmount multiplica por las cuotas vencidas', () => {
    const summary = summarizeFijos({
      items: [makeFixed({ next_due_on: '2026-04-05', day_of_month: 5, amount: 5000 })],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.overdueItems[0]?.missedCuotas).toBe(3)
    expect(summary.overdueAmount).toBe(15000)
  })
  it('items no vencidos llevan missedCuotas 0', () => {
    const summary = summarizeFijos({
      items: [makeFixed({ next_due_on: '2026-06-15' })],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.pendingItems[0]?.missedCuotas).toBe(0)
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `source ~/.nvm/nvm.sh && npx vitest run tests/unit/fijos-aggregates.test.ts`
Expected: FAIL (`computeMissedCuotas` no existe).

- [ ] **Step 3: Implementar**

En `fijos-aggregates.model.ts`:

1. Import arriba: `import { advanceFixedExpenseDueDate } from '@/features/fixed-expenses/commitment-date-utils'`.
2. Campo en `FijoItem` (junto a `daysUntilDue`, `:31`):

```ts
  /** Cuotas vencidas acumuladas (0 salvo overdue; ≥1 ahí). Cada pago
   *  salda la más vieja y decrementa. Ver computeMissedCuotas. */
  missedCuotas: number
```

3. Función exportada (debajo de `computeItemStatus`):

```ts
/**
 * Cuántas cuotas vencidas acumula un fijo: itera desde `nextDueOn`
 * con el espejo de advance mientras la fecha sea < hoy. `periods` =
 * meses YYYY-MM-01 de cada cuota vencida (vieja → nueva) — la misma
 * identidad que usa `record_fixed_expense_payment` (period_month =
 * mes del vencimiento). Cap defensivo de 24 iteraciones.
 */
export function computeMissedCuotas(input: {
  nextDueOn: string | null
  frequency: FixedExpenseFrequency
  dayOfMonth: number | null
  today: Date
}): { count: number; periods: string[] } {
  const { nextDueOn, frequency, dayOfMonth, today } = input
  if (!nextDueOn) return { count: 0, periods: [] }
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const periods: string[] = []
  let cursor = nextDueOn
  for (let i = 0; i < 24; i++) {
    const d = new Date(cursor)
    const dueUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    if (Number.isNaN(dueUtc) || dueUtc >= todayUtc) break
    periods.push(`${cursor.slice(0, 7)}-01`)
    cursor = advanceFixedExpenseDueDate(cursor, frequency, dayOfMonth)
  }
  return { count: periods.length, periods }
}
```

(Import de `FixedExpenseFrequency` si no está ya en el archivo.)

4. En `summarizeFijos`, dentro del `.map` de enriched (después del cálculo de `status`, `:343`):

```ts
      const missed =
        status === 'overdue'
          ? computeMissedCuotas({
              nextDueOn: i.next_due_on,
              frequency: i.frequency,
              dayOfMonth: i.day_of_month ?? null,
              today,
            })
          : { count: 0, periods: [] }
```

y en el objeto retornado (`:386-409`) agregar `missedCuotas: status === 'overdue' ? Math.max(1, missed.count) : 0,`.

5. `overdueAmount` (`:424`):

```ts
  const overdueAmount = overdueItems.reduce(
    (s, i) => s + Number(i.amount ?? 0) * Math.max(1, i.missedCuotas),
    0,
  )
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `source ~/.nvm/nvm.sh && npx vitest run tests/unit/fijos-aggregates.test.ts`
Expected: PASS. Además correr `npx vitest run` completo: sin fallas nuevas (otros tests pueden instanciar `FijoItem` a mano — si TypeScript exige el campo nuevo en fixtures, agregarlo con `missedCuotas: 0`).

- [ ] **Step 5: Commit**

```bash
git add mobile/features/fijos/fijos-aggregates.model.ts tests/unit/fijos-aggregates.test.ts
git commit -m "feat(fijos): computeMissedCuotas — la deuda acumulada se cuenta por cuotas y el hero la suma completa"
```

---

### Task 4: `daysUntilDue` = diferencia real de fechas

Hoy (`fijos-aggregates.model.ts:223-226`) se calcula con `day_of_month` y wrap mensual: nunca da > 31 y miente en frecuencias no mensuales. `FijoRow` ya usa la diferencia real internamente (`fijo-row.tsx:161-168`); el modelo pasa a hacer lo mismo. Consumidores del campo: `filterDueSoon` (`neo-fijos-view-model.ts:390-392`), tags HOY/EN Nd del ticker, sort de `upcoming` y `daysToNextPayment` — ninguno cambia de código, solo reciben números correctos.

**Files:**
- Modify: `mobile/features/fijos/fijos-aggregates.model.ts:218-226` y el call-site `:389`
- Test: `tests/unit/fijos-aggregates.test.ts`

**Interfaces:**
- Produces: `FijoItem.daysUntilDue` = días calendario reales hasta `next_due_on`, `0` si vence hoy **o ya venció** (clamp a 0 — un vencido "toca ahora"). El literal 'VENCIDO' del ticker sigue blindado aparte.
- Nota del spec ya resuelta en la planificación: el chip "Próximo fijo" del Home (`home-next-fixed-helpers.ts:73-116`) YA usa diferencia real de fechas — no necesita cambios.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
describe('daysUntilDue real (diferencia de fechas)', () => {
  it('pendiente a 7 días devuelve 7 aunque cruce de mes', () => {
    const summary = summarizeFijos({
      items: [makeFixed({ next_due_on: '2026-06-15', day_of_month: 15 })],
      paymentsThisCycle: [],
      today: TODAY, // 2026-06-08
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.pendingItems[0]?.daysUntilDue).toBe(7)
  })
  it('vencido devuelve 0, no el wrap del ciclo', () => {
    const summary = summarizeFijos({
      items: [makeFixed({ next_due_on: '2026-06-05', day_of_month: 5 })],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.overdueItems[0]?.daysUntilDue).toBe(0) // antes: 27 (wrap)
  })
  it('quincenal con vencimiento a 10 días devuelve 10 (antes usaba el ancla mensual)', () => {
    const summary = summarizeFijos({
      items: [makeFixed({ frequency: 'biweekly', next_due_on: '2026-06-18', day_of_month: 4 })],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.pendingItems[0]?.daysUntilDue).toBe(10) // ancla día 4 daba 26
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `source ~/.nvm/nvm.sh && npx vitest run tests/unit/fijos-aggregates.test.ts`
Expected: FAIL los casos "vencido devuelve 0" y "quincenal".

- [ ] **Step 3: Implementar**

Reemplazar `daysUntilDue` (`:218-226`) por:

```ts
/**
 * Días calendario reales entre HOY y `next_due_on` (UTC midnight,
 * mismo criterio que computeItemStatus). Clamp a 0: un vencido "toca
 * ahora" — el tag 'VENCIDO' del ticker se decide por status, no por
 * este número. Reemplaza la aritmética por day_of_month + wrap, que
 * mentía en frecuencias no mensuales y nunca superaba 31.
 */
function daysUntilDueFromDate(nextDueOn: string | null, today: Date): number {
  if (!nextDueOn) return 0
  const due = new Date(nextDueOn)
  const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  if (Number.isNaN(dueUtc)) return 0
  return Math.max(0, Math.round((dueUtc - todayUtc) / 86_400_000))
}
```

y el call-site `:389`: `daysUntilDue: daysUntilDueFromDate(i.next_due_on, today),`. Verificar con `grep -n "daysUntilDue(" mobile/features/fijos/fijos-aggregates.model.ts` que el `:389` era el único caller de la función vieja antes de borrarla. Actualizar el doc del campo `FijoItem.daysUntilDue` (`:30-31`) — ya no está "clamped to cycleDays". Actualizar también el comentario stale del ticker (`neo-fijos-view-model.ts` §3.8.1) que referencia el wrap `fijos-aggregates.model.ts:223-226`.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `source ~/.nvm/nvm.sh && npx vitest run`
Expected: los nuevos PASS; revisar si algún test existente asertaba el valor viejo del wrap (ajustarlo al valor real con su comentario).

- [ ] **Step 5: Commit**

```bash
git add mobile/features/fijos/fijos-aggregates.model.ts mobile/features/fijos/neo-fijos-view-model.ts tests/unit/fijos-aggregates.test.ts
git commit -m "fix(fijos): vence-en-X-dias por diferencia real de fechas — quincenales y anuales dejan de mentir"
```

---

### Task 5: Optimistic update avanza `next_due_on`

Con la clasificación v5, pagar un fijo vencido sin avanzar el cursor localmente lo dejaría 'overdue' en la UI hasta el refetch (el pago solo inserta el payment row optimista). Se agrega el avance local del cursor al `onMutate`.

**Files:**
- Modify: `mobile/features/fixed-expenses/use-fixed-expenses.ts:395-420` (bloque `setQueryData` del `onMutate` de `useRecordFixedExpensePayment`)

**Interfaces:**
- Consumes: `advanceFixedExpenseDueDate` (Task 1).
- Produces: cache de `fixed_expenses` con `next_due_on` ya avanzado durante la ventana optimista. El rollback existente (`ctx.previous` en `onError`) ya lo cubre.

- [ ] **Step 1: Editar el `onMutate`**

Import arriba del archivo: `import { advanceFixedExpenseDueDate } from './commitment-date-utils'`. En el `.map` del `setQueryData` (`:398-419`), agregar al objeto del fijo pagado, junto a `last_paid_at`:

```ts
                  // v5: avanzamos el cursor localmente (espejo clampado del
                  // SQL). Sin esto, con "overdue gana sobre paid", pagar un
                  // vencido lo dejaría en Vencidos hasta el refetch; y en un
                  // catch-up parcial el contador de cuotas no bajaría en el
                  // mismo frame. El refetch de onSettled reconcilia.
                  next_due_on: advanceFixedExpenseDueDate(
                    f.next_due_on,
                    f.frequency,
                    f.day_of_month ?? null,
                  ),
```

- [ ] **Step 2: Verificar tipos**

Run: `source ~/.nvm/nvm.sh && npx tsc --noEmit -p .`
Expected: sin errores nuevos (comparar contra el baseline del branch si ya había).

- [ ] **Step 3: Commit**

```bash
git add mobile/features/fixed-expenses/use-fixed-expenses.ts
git commit -m "fix(fijos): el pago optimista tambien avanza next_due_on — el row reclasifica coherente en el mismo frame"
```

---

### Task 6: UI de deuda — fila, ticker e i18n

**Files:**
- Modify: `mobile/components/fijos/fijo-row.tsx` (chip de cuotas adeudadas en la sub-line)
- Modify: `mobile/features/fijos/neo-fijos-view-model.ts` (`buildTickerItems`, tag overdue con contador)
- Modify: `mobile/lib/i18n/locales/es/fijos.json` y `mobile/lib/i18n/locales/en/fijos.json`
- Test: `tests/unit/neo-fijos-view-model.test.ts` (si existe; si no, crear con el caso del ticker)

**Interfaces:**
- Consumes: `FijoItem.missedCuotas` (Task 3).
- Produces: keys i18n `fijos:row.missedCuotas_one/_other`, `fijos:neo.overdueTagMulti`.

- [ ] **Step 1: Keys i18n**

En `es/fijos.json`: dentro del objeto `"row"` (el que tiene `"delete"` y `"swipeDeleteHint"`, cerca de `:270` según el consumo en `fijo-row.tsx`) agregar:

```json
    "missedCuotas_one": "Debes {{count}} cuota",
    "missedCuotas_other": "Debes {{count}} cuotas",
```

y en `"neo"` (donde vive `"overdueTag": "VENCIDO"`, `:408`):

```json
    "overdueTagMulti": "VENCIDO · {{count}}",
```

En `en/fijos.json`, mismas rutas:

```json
    "missedCuotas_one": "You owe {{count}} installment",
    "missedCuotas_other": "You owe {{count}} installments",
```
```json
    "overdueTagMulti": "OVERDUE · {{count}}",
```

- [ ] **Step 2: Ticker con contador**

En `buildTickerItems` (`neo-fijos-view-model.ts`, map de `overdueItems`), reemplazar el `tagLabel` fijo:

```ts
    tagLabel:
      item.missedCuotas > 1
        ? i18n.t('fijos:neo.overdueTagMulti', { count: item.missedCuotas })
        : i18n.t('fijos:neo.overdueTag'),
```

- [ ] **Step 3: Test del ticker**

En el test unit del view-model (crear `tests/unit/neo-fijos-view-model.test.ts` si no existe, con `buildTickerItems` importado y un `FijoItem` mínimo construido con cast parcial como hagan los tests vecinos):

```ts
it('overdue con missedCuotas > 1 muestra el contador en el tag', () => {
  const item = { id: 'f1', name: 'Netflix', amount: 5000, missedCuotas: 3, daysUntilDue: 0 } as FijoItem
  const result = buildTickerItems({ overdue: [item], dueSoon: [], cap: 5 })
  expect(result.items[0]?.tagLabel).toContain('3')
})
```

Run: `source ~/.nvm/nvm.sh && npx vitest run tests/unit/neo-fijos-view-model.test.ts` → PASS.

- [ ] **Step 4: Chip en la fila**

En `fijo-row.tsx`: localizar dónde se renderiza el chip `cuotaShort` (grep `cuotaShort` dentro del JSX del archivo). Debajo de la definición `:178`, agregar:

```ts
  const missedLabel =
    status === 'overdue' && (fijo.missedCuotas ?? 0) > 1
      ? t('fijos:row.missedCuotas', { count: fijo.missedCuotas })
      : null
```

y en el JSX, junto al chip de `cuotaShort` (mismo contenedor de la sub-line), render condicional:

```tsx
  {missedLabel ? <Text style={CHIP_STYLE_EXISTENTE}>{missedLabel}</Text> : null}
```

donde `CHIP_STYLE_EXISTENTE` es EXACTAMENTE el mismo array de estilos (tipografía + color) que el `<Text>` del chip `cuotaShort` contiguo — leer ese bloque JSX primero (grep `cuotaShort` en el archivo) y copiar su prop `style` literal; el color que usa ese chip para overdue ya es el rojo del sistema. No inventar colores ni campos de `accent` que no existan.

Sobre el CTA del spec ("Pagar cuota de {mes}"): el botón inline de pago del row es icon-only (`fijo-row.tsx:423-440`) y ya se muestra para `pending`/`overdue`; como con la clasificación v5 el fijo con deuda PERMANECE en overdue tras cada pago, ese mismo botón queda repetible sin cambios. El "{mes}" de la cuota lo comunica el chip `cuotaShort` (para overdue = mes de `next_due_on`, la cuota más vieja). No agregar un botón nuevo con texto.

El monto del row NO cambia (sigue mostrando el precio por cuota); la deuda total vive en el hero.

- [ ] **Step 5: Suite completa + tsc**

Run: `source ~/.nvm/nvm.sh && npx vitest run && npx tsc --noEmit -p .`
Expected: sin fallas nuevas (cambio de copy ⇒ suite completa obligatoria).

- [ ] **Step 6: Commit**

```bash
git add mobile/components/fijos/fijo-row.tsx mobile/features/fijos/neo-fijos-view-model.ts mobile/lib/i18n/locales/es/fijos.json mobile/lib/i18n/locales/en/fijos.json tests/unit/neo-fijos-view-model.test.ts
git commit -m "feat(fijos): deuda por cuotas visible — chip en la fila y contador en el ticker"
```

---

### Task 7: Editar no rebobina `next_due_on`

El editor usa `buildNextDueOn(form.day)` también al editar (`add-fijo-v2-screen.tsx:226`), rebobinando el cursor a la ocurrencia del mes actual. Regla nueva: editar re-ancla el día DENTRO del período vigente del cursor — nunca crea ni perdona deuda.

**Files:**
- Modify: `mobile/features/fixed-expenses/add-fijo-helpers.ts` (nuevo `rebaseNextDueOn`)
- Modify: `mobile/screens/home/add-fijo-v2-screen.tsx:226`
- Create: `tests/unit/add-fijo-helpers.test.ts`

**Interfaces:**
- Produces: `rebaseNextDueOn(existingNextDueOn: string, newDay: number): string` — conserva año/mes de `existingNextDueOn`, día = `newDay` clampado a ese mes. Fallback: si `existingNextDueOn` no parsea, delega en `buildNextDueOn(newDay)`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// tests/unit/add-fijo-helpers.test.ts
import { describe, it, expect } from 'vitest'
import { buildNextDueOn, rebaseNextDueOn } from '@/features/fixed-expenses/add-fijo-helpers'

describe('rebaseNextDueOn — editar no rebobina', () => {
  it('mismo día → misma fecha (pagado este mes queda pagado)', () => {
    expect(rebaseNextDueOn('2026-07-05', 5)).toBe('2026-07-05')
  })
  it('cambia el día dentro del período vigente (jul-05 → jul-20)', () => {
    expect(rebaseNextDueOn('2026-07-05', 20)).toBe('2026-07-20')
  })
  it('clampa al mes del período (feb + día 31 → feb-28)', () => {
    expect(rebaseNextDueOn('2026-02-10', 31)).toBe('2026-02-28')
  })
  it('cursor en el pasado se queda en el pasado (no perdona deuda)', () => {
    expect(rebaseNextDueOn('2026-04-05', 12)).toBe('2026-04-12')
  })
  it('fecha inválida cae a buildNextDueOn', () => {
    expect(rebaseNextDueOn('garbage', 10)).toBe(buildNextDueOn(10))
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `source ~/.nvm/nvm.sh && npx vitest run tests/unit/add-fijo-helpers.test.ts`
Expected: FAIL (`rebaseNextDueOn` no existe).

- [ ] **Step 3: Implementar el helper**

En `add-fijo-helpers.ts`, debajo de `buildNextDueOn`:

```ts
/**
 * `next_due_on` para el path de EDICIÓN. A diferencia del alta
 * (`buildNextDueOn`, que apunta al mes actual), editar re-ancla el día
 * DENTRO del período vigente del cursor: mismo año/mes de
 * `existingNextDueOn`, día nuevo clampado a ese mes. Regla de oro:
 * editar no crea ni perdona deuda — si el cursor estaba en el pasado
 * (cuotas vencidas), sigue en el pasado; si ya está en el mes que
 * viene (cuota pagada), no vuelve a este mes. Antes el editor usaba
 * buildNextDueOn también al editar y un fijo pagado reaparecía como
 * pendiente fantasma (CRITICAL del review de Fijos 2026-08-03).
 */
export function rebaseNextDueOn(existingNextDueOn: string, newDay: number): string {
  const m = existingNextDueOn.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return buildNextDueOn(newDay)
  const year = Number(m[1])
  const month = Number(m[2]) // 1..12
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const safeDay = Math.min(Math.max(newDay, 1), daysInMonth)
  return `${m[1]}-${m[2]}-${String(safeDay).padStart(2, '0')}`
}
```

- [ ] **Step 4: Cablear el editor**

En `add-fijo-v2-screen.tsx:226`, reemplazar:

```ts
    const nextDueOn = buildNextDueOn(form.day)
```

por:

```ts
    // Edición: re-anclar dentro del período vigente del cursor (no
    // rebobinar al mes actual — eso resucitaba como pendiente un fijo
    // ya pagado). Alta: ocurrencia de este mes, como siempre.
    const nextDueOn =
      isEditing && editingFijo?.next_due_on
        ? rebaseNextDueOn(editingFijo.next_due_on, form.day)
        : buildNextDueOn(form.day)
```

(agregar `rebaseNextDueOn` al import de `add-fijo-helpers`; `isEditing` y `editingFijo` ya existen en scope — se usan en `:237-250`).

- [ ] **Step 5: Correr tests + tsc**

Run: `source ~/.nvm/nvm.sh && npx vitest run tests/unit/add-fijo-helpers.test.ts && npx tsc --noEmit -p .`
Expected: PASS / sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add mobile/features/fixed-expenses/add-fijo-helpers.ts mobile/screens/home/add-fijo-v2-screen.tsx tests/unit/add-fijo-helpers.test.ts
git commit -m "fix(fijos): editar re-ancla el vencimiento dentro del periodo vigente — cierra el CRITICAL del pendiente fantasma"
```

---

### Task 8: Validación final del bundle

**Files:** ninguno nuevo (verificación + docs).

- [ ] **Step 1: Suite completa**

Run: `source ~/.nvm/nvm.sh && npx vitest run`
Expected: solo las 3 fallas baseline conocidas.

- [ ] **Step 2: Bundle real de Metro**

Run: `source ~/.nvm/nvm.sh && npx expo export --platform ios`
Expected: export exitoso (`npm run validate` NO cubre el bundle; este comando sí).

- [ ] **Step 3: Docs en sync**

Run: `grep -rln "paidThisPeriod\|vence en\|day_of_month" docs/sistemas/ | head`. Si existe un doc de fijos que describa la clasificación vieja (paid gana) o el wrap de `daysUntilDue`, actualizar esas secciones en el mismo PR-commit. Si no existe doc de fijos, saltar.

- [ ] **Step 4: Commit final (si hubo docs)**

```bash
git add docs/
git commit -m "docs(fijos): clasificacion v5 y dias reales al dia con el codigo"
```

**QA en device (fuera del plan, anotar al entregar):** cuenta con un fijo con 2+ cuotas vencidas → pagar una → debe quedar en Vencidos con contador 1 menos; pagar la última → salta a Pagados. "Deshacer" tras un pago de catch-up → vuelve a Vencidos con el contador restaurado (el revert del server rebobina el cursor; no se puede testear en unit por falta de renderer). Editar un fijo pagado → no reaparece pendiente.
