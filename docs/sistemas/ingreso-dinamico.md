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

## Ahorro mensual: NO disponible en dinámico (2026-07-08, fase 2)

El % del sueldo que se aparta no tiene base sin sueldo. Gates:
- Onboarding paso 5: sin card de %, queda solo la primera meta
  (por monto, mode-agnóstica); `savingsGoalPercent` se persiste 0.
- Settings: filas de sueldo/contribución, día de cobro y % de ahorro
  OCULTAS en dinámico; el switch a dinámico pone goal+percent en 0.
- Defensivo en modelo (`savingsGoal = 0 si dynamic`) y SQL
  (`eff_savings = 0 when dyn`, velocity idem) por si queda config stale.
- Las METAS (`savings_goals`) siguen disponibles: son por monto y se
  fondean a mano / con el sobrante del cierre.

## Superficies ajustadas app-wide (fase 2)

- **Control/Asistente/Alcancía**: `classifyControlMode` y
  `missingIncome` aceptan dinámico (antes: empty-state "Configurá tu
  sueldo" PERMANENTE). Test: control-v2-mode.
- **Fijos**: hero sin fila "dinero libre / % de tu sueldo"
  (`showIncomeStats`, también en el preview del empty state).
- **Home**: pill de payday del FamilyStrip oculto; chip de ahorro con
  gate explícito por modo.
- **Wizard household-setup** (joiner o deep-link): aviso amigable del
  modo en vez del flujo sueldo→ahorro (que re-activaba ambos).
- **Wrapped**: "Tienes $X para administrar" = sueldo + `extra_income`.
- **Check-ins push** (migración `20260708140000`): morning/midday/
  evening ya no excluyen a dinámico ni lo dejan en "Confirmá tu sueldo".
- **Velocity/stress** (misma migración): `eff_income` suma
  `income_events` (antes stress `critical` perpetuo).
- **Asesor LLM** (`control-advisor`): recibe `incomeMode` +
  `cycleIncome` y el prompt prohíbe hablar de "sueldo" en dinámico.
- **UI onboarding**: card del modo variable con `AchievementIcon`
  `first_cycle_under_budget` (moneda que brota, SVG propio AA) + 3
  pasos + footer de audiencias (`onboarding:income.dynamicCard.*`).

## Pendiente owner

- Aplicar migraciones `20260708130000` y `20260708140000` a prod
  (coordinadas con build) + deploy del edge fn `control-advisor`.
