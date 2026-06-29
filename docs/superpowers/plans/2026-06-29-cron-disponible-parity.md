# Cron "Buen día" ↔ Home disponible — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) to implement this plan task-by-task.

**Goal:** El push `checkin_morning` muestra el mismo `dailyBudget` y `availableToday` que el Home, para cualquier estado de cuenta.

**Architecture:** Una función pura TS `computeCycleDisponible` (canónica, que el hook del Home consume) + una función SQL `cycle_disponible` que la espeja + un parity test que las ata. El cron llama a la SQL.

**Tech Stack:** TypeScript (modelo/hook del Home), PL/pgSQL (cron + función), Vitest (unit + integration).

## Global Constraints

- Sin cambios de comportamiento en Home/Control: el refactor TS preserva outputs.
- El cálculo canónico **NO aplica `buffer`** (el hero del Home no lo aplica; `use-home-metrics.ts:288`).
- Copy del push: byte-for-byte el actual salvo los valores interpolados.
- `cycle_disponible` es `STABLE SECURITY DEFINER SET search_path = public`, solo lectura.
- Migración nueva con timestamp > `20260627030000`. No `db push` directo a prod.

## Fórmulas canónicas (fuente de verdad)

Derivación de intermedios (`family-dashboard-model.ts:206-265`):
```
anchorMatches = currentCycleAnchor == cycleStart (key local YYYY-MM-DD)
override = (anchorMatches && startingBalance >= 0) ? startingBalance : null
hasOverride = override != null
effectiveCycleIncome = hasOverride ? override : monthlyIncome
effectiveCycleDays   = hasOverride ? max(1, daysRemaining) : max(1, days)
overrideIsDown = hasOverride && override < monthlyIncome
overrideProration = overrideIsDown ? max(1,daysRemaining)/max(1,days) : 1
effectiveCommitmentPressure = commitmentPressure * overrideProration
effectiveSavingsGoal = overrideIsDown ? round(effectiveCycleIncome * savingsGoalPercent/100) : savingsGoal
variableSpentForCycleMetrics = hasOverride ? variableSpentSinceToday : variableSpentInCurrentCycle
```
`commitmentPressure` = `computeFixedExpenseCycleSummary().pressureTotal` (`commitment-cycle-summary.ts:154`):
```
scheduledAmount(item)   = (kind=='debt' && remaining_balance!=null) ? max(0,min(amount,remaining_balance)) : max(0,amount)
paidInCycle(item)       = Σ expenses.price where commitment_id==item.id and created_at∈[cycleStart,cycleEnd)
isDueThisCycle(item)    = status=='active' && next_due_on < cycleEnd
reservedInCycle(item)   = isDueThisCycle ? max(0, scheduledAmount - paidInCycle) : 0
pressureTotal = Σ paidInCycle(item)  +  Σ reservedInCycle(item)
```
Salidas (`use-home-metrics.ts:267-288` + `family-dashboard-model.ts:256-265`):
```
libreMes        = max(0, round(effectiveCycleIncome - commitmentPressure - effectiveSavingsGoal))
dailyBudget     = max(0, round(libreMes / max(1, effectiveCycleDays)))
cycleBalanceBeforeSavings = effectiveCycleIncome - effectiveSavingsGoal - effectiveCommitmentPressure - variableSpentForCycleMetrics
savingsSpent    = min(effectiveSavingsGoal, max(0, -cycleBalanceBeforeSavings))
totalAvailable  = cycleBalanceBeforeSavings + savingsSpent
rawCycleBalance = round(totalAvailable + cycleExtraIncome)
availableToday  = max(0, rawCycleBalance)
```
Accounting (monthly, `monthly-accounting.ts:41-49`): `cycleStart=anchor`, `cycleEnd=anchor+1mes`, `days=cycleEnd-cycleStart`, `daysRemaining=max(1, ceil(cycleEnd-today))`.

---

### Task 1: Función pura TS `computeCycleDisponible`

**Files:**
- Create: `mobile/features/family/cycle-disponible.ts`
- Test: `mobile/features/family/__tests__/cycle-disponible.test.ts`

**Produces:** `computeCycleDisponible(inputs: CycleDisponibleInputs): CycleDisponible` con las salidas de arriba.

- [ ] Step 1: Escribir tests golden (sin override → coincide con `libre/totalDays`; override up caso owner; override down con proration; income extra). Valores calculados a mano en el test.
- [ ] Step 2: Correr → falla (módulo no existe).
- [ ] Step 3: Implementar la función exactamente con las fórmulas canónicas.
- [ ] Step 4: `npx vitest run mobile/features/family/__tests__/cycle-disponible.test.ts` → PASS.
- [ ] Step 5: Commit.

### Task 2: Hook del Home consume la función (sin cambio de comportamiento)

**Files:**
- Modify: `mobile/features/home/use-home-metrics.ts:267-288`

**Consumes:** `computeCycleDisponible` (Task 1). El hook arma los inputs desde `dashboard` (intermedios crudos) + `cycleExtraIncome` y usa `.dailyBudget`/`.availableToday`.

- [ ] Step 1: Reemplazar el cómputo inline de `availableToday`/`dailyBudget` por la llamada a la función, pasando los raw inputs que el dashboard ya expone.
- [ ] Step 2: `npx vitest run` (suite Home) + `npx tsc --noEmit` → verde, sin cambios de valores (snapshot/golden de Home intacto).
- [ ] Step 3: Commit.

### Task 3: Función SQL `cycle_disponible` (verificada contra datos reales)

**Files:**
- Create: `supabase/migrations/<ts>_cycle_disponible.sql`

**Produces:** `public.cycle_disponible(p_family_id uuid, p_user_id uuid, p_as_of date) returns table(daily_budget numeric, available_today numeric, raw_cycle_balance numeric, has_override boolean)`.

- [ ] Step 1: Prototipar el cómputo como `SELECT` read-only vía MCP `execute_sql` contra prod, para la familia owner (`61bdc187…`) y kenility (`3d7f2031…`).
- [ ] Step 2: Verificar: kenility (sin override) → `daily_budget = 204617` (== cron/app actuales); owner (override) → `daily_budget ≈ 256k` (== app, ≠ cron viejo 172902). Iterar el SQL hasta que matcheen.
- [ ] Step 3: Envolver el SELECT verificado en la función dentro del archivo de migración.
- [ ] Step 4: Commit.

### Task 4: Rewire del cron `morning_checkins`

**Files:**
- Modify (en la misma migración): `list_pending_notifications` rama `morning_checkins`.

**Consumes:** `cycle_disponible` (Task 3).

- [ ] Step 1: Reemplazar el cómputo inline de `cupo_hoy`/`restante` por `cycle_disponible(family_id, user_id, today_local)`. Body: `daily_budget`→"para gustos", `available_today`→"del mes", rama "arriba del plan" cuando `raw_cycle_balance < 0`. Rama "confirmá sueldo" intacta.
- [ ] Step 2: Verificar vía MCP: simular el SELECT del cron para owner+kenility, confirmar bodies esperados.
- [ ] Step 3: Commit.

### Task 5: Parity test (integration, DB-gated)

**Files:**
- Create: `tests/integration/cycle-disponible-parity.test.ts`

**Consumes:** `computeCycleDisponible` (Task 1) + rpc `cycle_disponible` (Task 3), harness `describeIfLive`/`adminClient`.

- [ ] Step 1: Por escenario: seed (familia efímera + finance + fixed_expenses + expenses) → `expect(rpc.cycle_disponible).toEqual(computeCycleDisponible(sameInputs))`; cleanup.
- [ ] Step 2: `npm run test:integration` (si hay DB) → PASS. Documentar que corre en `test:integration`, no en `validate`.
- [ ] Step 3: Commit.

### Task 6: Validate + docs

- [ ] Step 1: `npm run validate` (typecheck+lint+test+guards) → verde.
- [ ] Step 2: Actualizar `docs/sistemas/notifications.md` (la fila `checkin_morning` ahora usa `cycle_disponible`; nota de paridad).
- [ ] Step 3: Commit.

## Verificación / criterios de éxito

- Unit golden (Task 1) verde en CI (`validate`).
- Prototipo SQL (Task 3) reproduce 204617 (kenility) y ~256k (owner) sobre datos reales.
- Parity test (Task 5) verde cuando hay DB.
- Sin regресión en la suite del Home (Task 2).

## Notas de riesgo

- El mirror de `pressureTotal` es lo más delicado → cubierto por prototipo real (Task 3) + parity (Task 5).
- No deployar a prod desde acá; la migración va por el flujo normal con la rama ya verificada.
