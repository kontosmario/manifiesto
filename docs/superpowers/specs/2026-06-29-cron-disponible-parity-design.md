# Alinear el cron "Buen día" con el disponible real del Home

> Fecha: 2026-06-29
> Estado: diseño aprobado (pendiente review del spec escrito)
> Origen: el push `checkin_morning` ("Buen día") muestra un cupo/disponible
> distinto al que el usuario ve al abrir la app. Reportado por el owner.

## Contexto y problema

El push matutino "Buen día, {nombre}" dice:

> "Hoy tenés ~$**X** para gustos. Quedan $**Y** del mes."

- **X** = `cupo_hoy` (presupuesto diario)
- **Y** = `restante` (saldo discrecional del mes)

Esos dos números los calcula el cron SQL `list_pending_notifications('morning_checkins')`
([20260626200000_i18n_notifications.sql:63](../../../supabase/migrations/20260626200000_i18n_notifications.sql)).
El Home calcula sus equivalentes en TypeScript:

| Push | Home (lo que ve el usuario) | Fuente TS |
|---|---|---|
| `cupo_hoy` ("para gustos") | `dailyBudget` ("podés gastar por día") | `use-home-metrics.ts:288` |
| `restante` ("del mes") | `availableToday` (saldo del mes del hero) | `use-home-metrics.ts:267` |

Las dos implementaciones derivaron. Para una cuenta con override de saldo de
ciclo activo (caso real del owner: `current_cycle_starting_balance` = 6.539.108
sobre `monthly_income` = 6.400.000), el push decía cupo **172.902** mientras el
Home mostraba **~253.627** — una brecha de ~80k que el usuario lee como un error.

## Causa raíz — los drivers de la divergencia

De mayor a menor impacto:

1. **Denominador.** Con override activo, el Home divide el dinero libre por los
   **días restantes** del ciclo (`effectiveCycleDays = accounting.daysRemaining`,
   ~21); el cron divide por los **días totales** (30). Como los días restantes
   bajan a medida que avanza el ciclo, el cupo del Home crece y el del cron queda
   plano → es el driver dominante.
2. **Base de ingreso.** El Home usa el override `current_cycle_starting_balance`
   (`effectiveCycleIncome`); el cron usa `monthly_income` crudo e **ignora el
   override por completo**.
3. **Nubes finas.** Con override, el Home:
   - prorratea los fijos a los días restantes **solo cuando el override es *down***
     (`effectiveCommitmentPressure`),
   - recalcula la meta de ahorro al cobro real cuando es *down* (`effectiveSavingsGoal`),
   - cuenta solo el gasto **desde hoy** (`variableSpentSinceToday`), no todo el ciclo,
   - usa `commitmentPressureInCurrentCycle` (de `computeFixedExpenseCycleSummary`)
     para los fijos, **no** un `sum(fixed_expense_monthly_equivalent)` como el cron.

Sin override, ambas fórmulas coinciden (mismo denominador, misma base). El bug
solo muerde a usuarios con override de ciclo activo.

## Objetivo / criterios de éxito

1. El push "Buen día" muestra **exactamente** los mismos `dailyBudget` y
   `availableToday` que el Home, para cualquier estado de cuenta (sin override,
   override up, override down, sueldo sin confirmar).
2. La paridad queda **garantizada por un test en CI**, de modo que un cambio
   futuro en cualquiera de las dos implementaciones que las desincronice **falla
   el build**.
3. Sin cambios de comportamiento en la app (Home/Control intactos en esta fase).

## Decisión de arquitectura

**Fuente canónica en SQL + parity test que la ata al modelo TS, secuenciada.**

Descartadas:
- *Parche aproximado* (corregir solo denominador + base): vuelve a derivar y no
  cumple "reflejar la realidad" al peso.
- *Big-bang server-side* (migrar toda la superficie Home/Control a consumir SQL
  hoy): correcto a futuro pero riesgoso y desproporcionado para este fix.

Lo que hace esto "prod-grade" no es *dónde* vive el cálculo, sino que **una sola
definición esté verificada contra la otra en CI**. El parity test convierte el
drift en un test que falla.

## Componentes (Fase 1)

### 1. `computeCycleDisponible(inputs)` — función pura TS

Extraer el bloque override-aware de
[family-dashboard-model.ts:206-265](../../../mobile/features/family/family-dashboard-model.ts)
\+ el cálculo de `dailyBudget`/`availableToday` de
[use-home-metrics.ts:267-288](../../../mobile/features/home/use-home-metrics.ts)
a una función pura, nombrada y testeable. El modelo del Home pasa a llamarla
(refactor **sin cambio de comportamiento**). Es el blanco limpio del parity test
y la definición canónica del lado TS.

**Entrada** (todo derivable de `family_finance` + agregados de ciclo):
`monthlyIncome, currentCycleStartingBalance, currentCycleAnchor, savingsGoal,
savingsGoalPercent, commitmentPressure, variableSpentInCurrentCycle,
variableSpentSinceToday, cycleExtraIncome, cycleStart, accountingDays,
accountingDaysRemaining`.

**Salida:** `{ dailyBudget, availableToday, rawCycleBalance, hasOverride }`
(`rawCycleBalance` = sin clamp a 0, para que el caller detecte "arriba del plan").

### 2. `public.cycle_disponible(p_family_id, p_user_id, p_as_of date)` — función SQL

`STABLE SECURITY DEFINER`. Replica `computeCycleDisponible` 1:1 en SQL. Resuelve
internamente los insumos:
- ventana de accounting (cycle_start/end, days, days_remaining) espejando
  `computeMonthlyAccountingWindow` para `cycle_type='monthly'`,
- `commitmentPressure` espejando `computeFixedExpenseCycleSummary().pressureTotal`
  (no el `sum(monthly_equivalent)` actual),
- gasto variable del ciclo y desde-hoy (`commitment_id is null`, `archived_at is null`),
- `cycleExtraIncome` = `income_events` del ciclo.

Devuelve `(daily_budget numeric, available_today numeric, raw_cycle_balance numeric, has_override boolean)`.

### 3. Wiring del cron

La rama `morning_checkins` de `list_pending_notifications` deja de calcular
inline y llama a `cycle_disponible(family_id, user_id, today_local)`. El body usa:
- `daily_budget` → "Hoy tenés ~$X para gustos"
- `available_today` → "Quedan $Y del mes"
- la rama "Este mes ya vas $Z arriba del plan" se dispara con
  `raw_cycle_balance < 0` (preserva el comportamiento actual del caso `restante<=0`).

La rama "Llegó tu cobro, confirmá" (sueldo sin confirmar) **no cambia**.

### 4. Parity test — `tests/integration/cycle-disponible-parity.test.ts`

Usa el harness `describeIfLive` existente (service-role `rpc`, `.env.supabase`).
Batería de escenarios; cada uno se siembra en la DB (o se pasa por args si la
función acepta overrides) y se compara:

```
expect(rpc.cycle_disponible(scenario)).toEqual(computeCycleDisponible(scenario))
```

Escenarios mínimos: sin override · override up (caso owner) · override down ·
sueldo sin confirmar · con income_events extra · con fijos de frecuencia mixta
(mensual/anual/semanal) · gasto antes y después de hoy. Igualdad **al peso**.

## Flujo de datos

```
pg_cron 9h  →  list_pending_notifications('morning_checkins')
                  └─ por cada (familia, miembro) confirmado:
                       cycle_disponible(fam, user, today)
                         → {daily_budget, available_today, raw_cycle_balance}
                       → arma title/body en el idioma del miembro
App Home   →  family-dashboard-model → computeCycleDisponible(...)  (mismo cálculo)
CI         →  parity test: rpc.cycle_disponible == computeCycleDisponible
```

## Casos borde

- **Sin override:** `effectiveCycleDays = días totales`, `effectiveCycleIncome =
  monthly_income` → push y Home ya coincidían; el cambio debe ser no-op para ellos.
- **Override up (caso owner):** sin prorrateo de fijos, meta de ahorro = la
  configurada, días restantes como denominador.
- **Override down:** prorratea fijos, recalcula meta al cobro real.
- **Sueldo sin confirmar:** no se calcula disponible; el cron manda "confirmá tu sueldo".
- **`buffer_mode` (percent/fixed):** hoy el cron aplica buffer al `cupo_hoy`, pero
  el hero del Home (`use-home-metrics.ts:288`) **no** aplica buffer al `dailyBudget`
  — el buffer vive solo en el `daily-budget-engine` de la pantalla Gastos, otra
  superficie. Para espejar el Home, el cálculo canónico **NO aplica buffer**. Esto
  cambia el comportamiento del push para usuarios con buffer (deja de descontarlo),
  que es justamente lo pedido: el push = lo que ves en el Home.
- **División por cero / valores negativos:** `max(1, días)`, clamps idénticos al TS.

## Testing / verificación

- Parity test (componente 4) — guardián anti-drift.
- Tests unitarios de `computeCycleDisponible` con los valores reales conocidos:
  cuenta del owner → `daily_budget ≈ 253.627`, kenility → `204.617`.
- `npm run validate` (typecheck + lint + tests + guards) verde.
- Verificación manual post-deploy: comparar el próximo push "Buen día" con el
  Home de la cuenta del owner.

## Scope y secuencia

- **Fase 1 (este spec):** componentes 1-4. Arregla el push, deja la fuente
  canónica SQL parity-locked. **No toca la UI** → cero riesgo en Home/Control.
- **Fase 2 (spec separado, futuro):** exponer `cycle_disponible` en `home_snapshot`
  y migrar la app a consumir los valores del server, borrando el cálculo TS
  duplicado. Camino claro a cero-drift permanente, fuera de este cambio.

## Riesgos

- **Mirror impreciso de `pressureTotal`:** el riesgo principal. Mitigado por el
  parity test (cualquier desvío falla).
- **Performance del cron:** `cycle_disponible` corre por miembro a las 9h. Es
  `STABLE` con un par de subqueries; volumen actual bajo. Aceptable; medir si crece.
- **Refactor del modelo TS (componente 1):** toca un archivo load-bearing. Mitigado
  por ser extracción pura (mismos outputs) + la suite de tests existente del Home.

## Out of scope

- Cambiar la definición del disponible/cupo (espejamos el Home tal cual, no lo
  rediseñamos).
- El token de push huérfano (problema de delivery aparte, ya diagnosticado).
- Otras notificaciones (midday/evening/goal_behind/fixed_upcoming).
