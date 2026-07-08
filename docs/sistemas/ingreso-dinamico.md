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

## Ciclos del modo dinámico (fase 3, 2026-07-08)

El usuario dinámico elige su ciclo — SEMANAL / QUINCENAL / MENSUAL (o
custom) — y "¿cómo me fue este ciclo?" se mide sobre ESA ventana:

- **Mapeo**: reusa `cycle_type`/`cycle_anchor_date`/`cycle_length_days`
  existentes (infra de sueldos rolling). Mensual dinámico = día de
  inicio elegible (default 1 = mes calendario).
- **Ventana de accounting**: `computeMonthlyAccountingWindow(...,
  followCycleWindow)` — en dinámico la ventana ES el ciclo rolling
  (getCurrentPayCycle); los sueldos fijos weekly/biweekly NO cambian
  (siguen en mes calendario, spec 2026-06-05). Todo lo derivado
  (saldo, cupo, día N de M, income_events del ciclo, proyección,
  cierre) sigue automáticamente.
- **UI**: `CycleConfigSection copyVariant="cycle"` (labels sin
  "cobro", monthly default día 1) en onboarding (rama dinámica del
  StepIncome) y en Settings (fila "Ciclo" + EditCycleConfigSheet).
- **Server (migración `20260708150000`)**: `cycle_disponible` y
  `velocity_snapshots` computan la ventana vía `compute_pay_cycle`
  (dinámico sigue su ciclo; fixed conserva la mensual). FIX crítico:
  el freeze de `home_snapshot` eximió a dinámico — sin eso, al rolar
  el mes el snapshot quedaba congelado en el ciclo anterior para
  siempre. El history del snapshot ahora incluye `extra_income` y
  `savings_goal_amount`.
- **Wrapped**: períodos cortos (<21 días) titulan con el rango
  ("7 jul – 13 jul") en vez del nombre de mes repetido.
- **Cierres**: `try_close_previous_cycle` + cron ya cierran rolling
  (infra existente); `monthly_summaries` no colisiona (unique por
  period_start).

## Superficies ajustadas (fase 4 — auditoría post-release)

- **Control sin ingresos del ciclo**: `dynamicNoIncome` (use-control-v2-
  data) → la pantalla pinta la guía "Carga tus ingresos para empezar"
  (variante del `ControlV2EmptyState`, CTA a add-income) en vez del
  stack con "LIBRE HOY $0" y `NaN%` (guard 0/0 agregado igual).
- **Copy "cobro/sueldo" en dinámico**: variantes `_dynamic` en hero
  ("fin de ciclo"), alcanza ("FIN DE CICLO"), cobertura ("TUS INGRESOS
  EN DÍAS"), ingresos, vsmes, daily-goal, tours (familyStrip/cobertura)
  y señal payday-proximity (mismo id — dismiss estable — con
  `bubbleFrame: 'cycle'` para el asesor bubble).
- **Bug ALTO corregido**: family-dashboard-model computaba el pending
  de cobro inline SIN exención dinámica (hero "+N días sin cobrar" +
  ventana congelada en mensual) — ahora exime y además fuerza
  `monthlyIncome = 0` en dinámico (sueldo stale post-switch).
- **Fijos wizard**: sin "0% de tu sueldo" cuando no hay base.
- **Gastos**: el empty `pending-confirm` ("Confirma tu cobro") no
  aplica en dinámico → cae al neutro.
- **Regresión de prod cazada por esta auditoría** (hotfix
  `20260708160000` APLICADO): las redefiniciones de home_snapshot del
  release partieron de una base pre-cutover del catálogo global y
  devolvían categorías VACÍAS para toda familia ("no hay categorías" en
  add-expense) + subscription_checkins ausente. Gotcha reforzado:
  redefinir una función SIEMPRE desde su última migración aplicada.

## Asistente heurístico en dinámico (fase 3)

- Referencia de ingreso ÚNICA en `use-control-v2-data`:
  `ingresoRecurrente = Σ income_events del ciclo` en dinámico.
- Adapter de Control: dinámico reparte el cupo como el override (días
  restantes − variable gastado) — paridad con Home.
- `income-volatility`: histórico desde `summaries[].extra_income`.
- `income-missing`: rama dinámica sin payday — "todavía sin ingresos
  este ciclo" pasado ~30% del ciclo, CTA a add-income.
- `fijos-ratio`: copy neutral (sin "sueldo").

## Cierre de ciclo en dinámico (cómo funciona — es AUTOMÁTICO)

1. **Cron nocturno** `close-previous-cycles` (03:00 UTC = 00:00 AR,
   diario) barre TODAS las familias → `try_close_previous_cycle` →
   `close_monthly_cycle` con la ventana del ciclo anterior (via
   `compute_pay_cycle`, soporta semanal/quincenal/mensual/custom).
2. **Guards**: idempotencia (un cierre por period_start), Guard 0
   family_too_new (primer ciclo de cuenta nueva), Guard 1 not_yet_ended.
   El Guard 2 (sueldo confirmado) NO aplica en dinámico — sin esa
   exención los ciclos no cerrarían nunca. ⚠️ La exención vive en la
   ÚLTIMA redefinición (20260708130000→170000): una migración futura
   que copie un body viejo la rompería en silencio.
3. **Escritura**: `monthly_summaries` con extra_income = Σ income_events
   de la ventana; en dinámico (migración `20260708170000`)
   monthly_income/savings 0 defensivos, savings_delta = ingresos − gasto
   (antes 0 → la notificación nunca decía "Guardaste"), mood desde los
   ingresos reales, y period_label de ciclos <21 días = rango
   ("7–13 jul 2026"). Los gastos del ciclo quedan archivados.
4. **Notificación** "Cerró <periodo>" (trigger, solo si hubo gasto) +
   **Wrapped**: en dinámico se AUTO-DISPARA desde Home al detectar el
   summary nuevo sin ver (efecto en home-dashboard con mark-seen; el
   path fixed lo dispara al confirmar cobro). Replay en Control.
5. **Sobrante**: la decisión (meta/acumular/reserva) viaja DENTRO del
   wrapped (Spec B); fallback = sheet standalone. "Acumular" crea un
   income_event con fecha de HOY → ingreso del ciclo nuevo.

## Switch de Settings (fijo ↔ variable) — semántica

- Confirmación vía `IncomeModeConfirmSheet` (ModalCard con efectos
  explícitos; reemplazó al Alert nativo). El switch NO es optimista.
- **fixed→dynamic**: apaga ahorro (goal+percent 0) y LIMPIA el override
  del ciclo (starting_balance/anchor null — un saldo confirmado bajo el
  régimen de sueldo compondría como base del cupo dinámico). Las
  contribuciones de miembros NO se tocan: la lectura fuerza base 0
  (modelo cliente + adapter + SQL `when dyn then 0`), y así
  **dynamic→fixed recupera el sueldo anterior** tal cual estaba.
- El scope 'income' de sync-after-mutation invalida también
  `gastos-snapshot` (su queryKey embebe el cupo y quedaba stale si el
  cupo no cambiaba ≥$1).

## Estado en prod

- Migraciones `20260708130000`, `20260708140000` y `20260708150000`
  APLICADAS a prod (2026-07-08). Smoke-tests: `cycle_disponible` sano
  para las 14 familias (incl. 1 dinámica), velocity cron corrido OK,
  ACLs preservados.
- Deploy del edge fn `control-advisor`: DESCARTADO por el owner (el
  LLM no se usa para income; la capa vigente es la heurística).
