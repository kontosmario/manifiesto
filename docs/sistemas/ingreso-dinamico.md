# Modo de ingreso dinámico (`income_mode`)

Soporte para hogares **sin sueldo fijo**: su presupuesto se construye
agregando ingresos manuales (`income_events`) en vez de un
`monthly_income` recurrente. Diseño: spec `2026-07-08-release-next-design.md`.

## Modelo

- `family_finance.income_mode`: `'fixed' | 'dynamic'` (default `'fixed'`,
  migración `20260708130000`). Cliente: patrón *optional-preserve* (igual
  que `local_currency`) — un upsert que no lo incluye lo preserva.
- En dinámico `monthly_income` queda **0** (la contribución del dueño se
  setea explícita en 0 al terminar onboarding) y los ingresos del ciclo
  entran como `cycleExtraIncome` (suma de `income_events` de la ventana).
- **Cupo diario**: el modelo trata dinámico como el path del override —
  `computeCycleDisponible` recibe `hasCycleOverride: true` y reparte el
  discrecional (ingresos − gasto − fijos − ahorro) sobre los **días
  restantes**. El espejo SQL `cycle_disponible` tiene el flag `dyn`
  equivalente → el push "Buen día" cuenta lo mismo que la app.
- El override real de saldo de ciclo **compone**: si el usuario confirma
  un saldo, ese pasa a ser la base y los ingresos siguen sumando encima.

## Qué se suprime en dinámico

- `isSalaryPendingConfirmation` = false siempre — el gate vive DENTRO de
  `computeIsSalaryPendingConfirmation` (param `incomeMode`), la fuente
  única que comparten `use-pay-cycle` y `use-monthly-accounting`.
- El prompt de saldo inicial del ciclo no se auto-abre
  (`isCycleStartingBalancePromptPending` = false).
- `close_monthly_cycle` Guard 2 (sueldo confirmado) **no aplica** — sin
  esto los ciclos de familias dinámicas no cerrarían nunca.

## Superficies

- **Onboarding step 4 (creator)**: selector "Sueldo fijo / Ingreso
  variable" (`StepIncome`). En variable: sin monto ni ciclo (queda
  mensual día 1 = mes calendario), `canContinue` libre, info card
  explicativa. Copy `onboarding:income.mode*` / `dynamicInfo*`.
- **Hero del Home**: `incomeConfigured` incluye el modo dinámico; sin
  ingresos en el ciclo muestra "Carga tu primer ingreso" con CTA a
  `/(app)/add-income` (`home:hero.dynamicSetup*`), no el setup de sueldo.
- **Settings → Hogar**: switch "Ingreso variable" (owner-only) con Alert
  de confirmación (`settings:household.incomeMode*`).
- **Nudge "Cierra tu día"** (`use-daily-budget-nudges`): en dinámico el
  engine recibe `cycleStartingBalance = (override ?? 0) + Σ income_events`
  del ciclo — sin este mapeo el umbral del 70% nunca disparaba
  (openingBudget quedaba 0 con sueldo 0). En fixed no cambia nada.

## Snapshot / gotchas

- `home_snapshot` devuelve `income_mode` (gotcha conocido: columna nueva
  de family_finance → RPC) y `families.created_at` (ancla del jardín).
- `incomeConfigured` (use-home-metrics) = `monthlyIncome > 0 || dynamic`.
- Tests: `tests/unit/cycle-disponible.test.ts` (casos dinámico) y
  `tests/unit/family-dashboard-model.test.ts` (describe "modo ingreso
  dinámico").

## Pendiente owner

- Aplicar migración `20260708130000` a prod (coordinada con build).
