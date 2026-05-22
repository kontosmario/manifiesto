# 05 — Insights, Asistente Financiero y Coach Mode

> Verificado contra commit `7962ea2` · 2026-05-21 · parte del snapshot [docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual](../../../docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual)

---

## 1. Visión general — arquitectura del motor de señales

El "Asistente Financiero" de Manifiesto es un **motor de señales 100% heurístico**, sin LLM, sin llamada remota en el camino crítico. Todo el razonamiento ocurre en JS puro sobre datos que ya están en el cache de React Query.

### Flujo de datos: input → engine → señal → copy → UI

```
FamilyFinance (tabla family_finance)
  salary_payment_day ──► usePayCycle ──► PayCycle {start, end, days}
  monthly_income, savings_goal_percent
  
Expenses (ciclo actual)  ──┐
FixedExpenses (activos)  ──┤
Categories               ──┤
SavingsGoal              ──┤
Notifications             ──┤──► buildControlDataFromSnapshot()
MonthlySummaries (6 meses)──┤       [control-v2-adapter.ts]
CategoryLimits (caps)    ──┤          │
VelocitySnapshot         ──┤          ▼
                           │   ControlMockData
                           │          │
                           │          ▼
                           │   computeControlView()
                           │   [control-v2-mock.ts]
                           │          │ ControlView
                           │          │ {cupoDiario, diasRestantes, restanteMes,
                           │          │  promedioDiario, sobrantePresupuestadoMes,
                           │          │  porDowEnriched, peorDow, vault, racha...}
                           │          │
                           │   buildForecast7Day()      detectCausalLinks()
                           │   [forecast-engine.ts]     [causal-engine.ts]
                           │       Forecast7Day              CausalLink[]
                           │          │                          │
                           └──────────┴──────────────────────────┤
                                                                  ▼
                                              buildControlSignals(args)
                                              [control-signals.ts]
                                                       │
                                              [fuse] → [superSignals] → [rank] → [diversity]
                                                       │
                                              ControlAdvisorTask[] (máx 5)
                                                       │
                               ┌───────────────────────┼──────────────────────┐
                               ▼                       ▼                      ▼
                    AsistenteScreen            ControlV2Screen          tab badge
                  (chat bubbles full)     (card compacta + dismiss)  (punto rojo urgency)
                               │
                               ▼
                    CoachModeScreen (señal individual, detail + plan)
```

### Capas cognitivas (implementadas)

| Capa | Módulo | Estado |
|------|--------|--------|
| P0 – Señales base (reglas + datos) | `control-signals.ts` | ✅ LIVE |
| P1 – Forecast 7 días | `forecast-engine.ts` | ✅ LIVE |
| P1 – Baselines per-usuario | `user-baselines.ts` | ✅ LIVE |
| P2 – Inferencia de persona | `persona.ts` | ✅ LIVE |
| P3 – Causal links | `causal-engine.ts` | ✅ LIVE |
| P3 – Blocklist de familias | `use-signal-blocklist.ts` | ✅ LIVE |
| LLM Coach | — | ⏸️ EN PAUSA (≥500 MAU + monetización) |

---

## 2. Pantallas Asistente / Insights

### Tab principal — `insights.tsx` → `ControlV2Screen`

**Ruta:** [`app/(app)/(tabs)/insights.tsx`](../../../app/(app)/(tabs)/insights.tsx)

El tab **Insights** en la barra de navegación renderiza `ControlV2Screen`, que es la pantalla "Control" (presupuesto del ciclo + tarjeta compacta del asistente). No renderiza directamente `AsistenteScreen`. El tab lleva un badge punto rojo (via `useAdvisorBadge`) cuando hay señales `urgency === 'alta'` y el usuario no visitó en las últimas 18 horas.

### Pantalla Asistente full — modal

**Ruta:** [`app/(app)/asistente.tsx`](../../../app/(app)/asistente.tsx)
**Screen:** [`mobile/screens/home/asistente-screen.tsx`](../../../mobile/screens/home/asistente-screen.tsx)

Se abre como modal (envuelto en `ModalContentEntrance`) al tocar "Ver todo" en la tarjeta del asistente en home/control. Renderiza:
- Tira de constelación (header visual que mapea el ciclo)
- Lista scrolleable de señales como **chat bubbles**
- Cada bubble tiene: emoji, categoría, título, body, chip de impacto, CTA, botón "Visto"
- Tapping "Visto" → `dismissCard(id)` con TTL escalado
- Tapping CTA → `useControlActionDispatcher` (navegar, contribuir ahorros, abrir fijo, etc.)
- `ZombieFeedSection` para suscripciones zombie no leídas
- `GlobalAdvisorActionHost` maneja efectos secundarios globales de acciones

Datos: `useControlV2Data(familyId, userId)` — hook central que agrega todo.

### Settings del asistente

**Ruta:** [`app/(app)/settings/asistente.tsx`](../../../app/(app)/settings/asistente.tsx)

Muestra la persona inferida del usuario y permite gestionar las familias de señales bloqueadas (feature de opt-out permanente).

---

## 3. Motor de señales — documentación exhaustiva

### 3.1 Entrada del motor

El motor `buildControlSignals(args: BuildSignalsArgs)` en [`mobile/features/insights/control-signals.ts`](../../../mobile/features/insights/control-signals.ts) recibe:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `view` | `ControlView` | Vista computada del ciclo (cupo, días, promedios, DoW, vault, racha) |
| `expenses` | `Expense[]` | Gastos del ciclo actual |
| `fixedExpenses` | `FixedExpense[]` | Gastos fijos activos |
| `categoriesExpense` | `Category[]` | Catálogo de categorías |
| `summaries` | `MonthlySummaryHistory[]` | Últimos 6 cierres |
| `limits` | `CategoryLimit[]` | Topes de categoría definidos por el usuario |
| `velocity` | `VelocitySnapshot \| null` | Snapshot diario precomputado (DB) |
| `notifications` | `NotificationLite[]` | Notifs zombie_alert y price_hike |
| `savingsGoal` | `SavingsGoal \| null` | Meta de ahorro activa |
| `cupoDiario` | `number` | Presupuesto diario (ARS) |
| `gastoHoy` | `number` | Gasto del día actual |
| `diasRestantes` | `number` | Días hasta fin de ciclo |
| `ingresoMes` | `number` | Ingreso del ciclo |
| `fijosMes` | `number` | Total de fijos del ciclo |
| `forecast` | `Forecast7Day \| null` | Forecast 7 días (P1, opcional) |
| `persona` | `UserPersona \| undefined` | Persona inferida (P2, opcional) |
| `paydayPending` | `boolean \| undefined` | Cobro esperado sin confirmar |
| `blockedFamilies` | `ReadonlySet<string> \| undefined` | Familias de señales bloqueadas |
| `causalLinks` | `CausalLink[] \| undefined` | Links causales detectados (P3) |
| `dismissedHikes` | `Record<string, number> \| undefined` | Hikes ya descartados |
| `baselines` | `UserBaselines \| undefined` | Umbrales per-usuario (P3) |

### 3.2 Tiers de confianza

| Tier | Descripción | Cálculo confidence |
|------|-------------|-------------------|
| T0 Real-time | No necesita historia | `confidence = 1.0` |
| T1 1 ciclo | Necesita ~14 días cerrados | `rampOneCycle(closedDays) = clamp01(closedDays/14)` |
| T2 3 ciclos | Necesita ≥3 summaries históricas | `rampOneCycle × max(0.5, rampSummaries(count))` donde `rampSummaries = clamp01(count/3)` |
| T3 60 días | Patrones semanales | `rampThreeWeeks(closedDays) = clamp01(closedDays/21)` |

Umbral mínimo: `MIN_CONFIDENCE = 0.4`. Señales por debajo se descartan silenciosamente.

### 3.3 Catálogo completo de señales (43 builders)

#### Grupo 1 — Mecánica del ciclo

| ID | Emoji | Urgencia | Tier | Descripción | CTA default |
|----|-------|----------|------|-------------|-------------|
| `stress-week` | 📅 | alta | T0 | ≥3 fijos vencen en 7 días | Ver fijos |
| `payday-proximity` | 📆 | alta/media | T0 | Quedan N días y el saldo libre/día cae <70% del cupo | Entendido |
| `start-splurge` | 🚀 | media | T1 | Primeros 3 días consumieron >15% del libreMes | Entendido |
| `end-acceleration` | ⚠️ | alta | T1 | Últimos 3 días promediaron >130% del promedio del ciclo y quedan ≤5 días | Entendido |
| `recovery-hard` | 🧭 | alta | T0 | Sobregiro del día requiere cupo residual <40% del original | Ajustar |
| `recovery-soft` | 🧭 | media | T0 | Sobregiro moderado, cupo nuevo viable | Entendido |
| `velocity` | ⏱️ | alta/media/baja | T1 | Velocidad de gasto supera presupuesto del ciclo según `velocity_today` | Entendido |
| `positive-forecast` | 🌱 | baja | T1 | Proyección alcanza el mes con ≥2 días de cupo de excedente | Mover $X / Ver meta |

Lógica `positive-forecast`: si hay meta activa propone mover 50% del excedente redondeado al 1k más cercano mediante `quick-savings-contribution` (1 tap, sin navegación).

#### Grupo 2 — Señales de categorías

| ID | Emoji | Urgencia | Tier | Descripción |
|----|-------|----------|------|-------------|
| `cat-accel` | 📈/🎯 | media | T2 | Categoría top aceleró >1.4× (o P75 per-user si ≥3 ciclos) vs promedio histórico. Detecta spike puntual vs cambio de hábito. |
| `cap-{limit_id}` | 🚫/⚠️ | alta/media | T0 | Categoría con tope definido superó el warning_threshold_pct |
| `cat-dominance-{cat_id}` | 🎯 | media | T1 | Una categoría toma >40% (o P75 per-user) del gasto variable del ciclo |
| `cat-win` | ✅ | baja | T2 | Categoría bajó >30% vs promedio histórico y la diferencia supera 0.5% del ingreso |

#### Grupo 3 — Higiene de gastos

| ID | Emoji | Urgencia | Tier | Descripción |
|----|-------|----------|------|-------------|
| `small-leaks` | 💧 | media | T1 | ≥10 gastos <$5.000 que suman >12% del gasto del ciclo |
| `night-impulse` | 🌙 | media | T3 | >70% del gasto discrecional ocurrió entre 22hs–02hs |
| `undetected-sub-{amount}` | 🔁 | baja | T3 | Mismo monto (±5%) aparece ≥2 veces en días distintos sin estar registrado como fijo |

#### Grupo 4 — Patrones semanales

| ID | Emoji | Urgencia | Tier | Descripción |
|----|-------|----------|------|-------------|
| `weekly-pattern` | 🗓️/🎉 | baja | T3 | El peor día-de-semana eleva el gasto; o los fines de semana cuestan ≥50% más. Elige la variante de mayor impacto mensual. |

#### Grupo 5 — Compromisos e ingreso

| ID | Emoji | Urgencia | Tier | Descripción |
|----|-------|----------|------|-------------|
| `fijos-ratio` | ⚖️ | alta/media | T0 | Fijos representan ≥60% del ingreso (alta si >75%) |
| `income-volatility` | 📈/📉 | baja/media | T2 | Ingreso del mes varía ≥10% vs promedio de 3 meses |
| `zombie-{notif_id}` | 🧟 | alta | T0 | Notificación zombie_alert de los últimos 14 días (suscripción sin uso) |
| `hike-{notif_id}` | ⚡ | baja | T0 | Notificación price_hike de los últimos 7 días (aumento en fijo) |

#### Grupo 6 — Ahorro y metas

| ID | Emoji | Urgencia | Tier | Descripción |
|----|-------|----------|------|-------------|
| `savings-feasibility` | 🎯 | media | T1 | El ahorro mensual actual no alcanza el plan mensual requerido por la meta |
| `savings-over` | 🚀 | baja | T1 | El ahorro supera en >15% al plan → fecha de meta se adelanta |

#### Grupo 7 — Familia

| ID | Emoji | Urgencia | Tier | Descripción |
|----|-------|----------|------|-------------|
| `member-imbalance-{userId}` | 👥 | baja | T1 | Un miembro concentra >70% del gasto discrecional (≥5 gastos registrados por ≥2 miembros) |

#### Grupo 8 — Refuerzo positivo

| ID | Emoji | Urgencia | Tier | Descripción |
|----|-------|----------|------|-------------|
| `streak-ok` | 🔥 | baja | T0 | Racha de ≥3 días bajo cupo activa |

#### Grupo 9 — Awareness atómico (P1)

| ID | Emoji | Urgencia | Tier | Descripción |
|----|-------|----------|------|-------------|
| `high-single-expense` | 💥 | media | T0 | Un gasto hoy ≥30% del cupo diario |
| `duplicate-{expense_id}` | 🪞 | baja | T0 | 2 cargos con misma descripción y monto (±5%) en las últimas 48h |
| `data-gap-warning` | 📭 | baja | T0 | Sin gastos registrados en 3–14 días |
| `savings-milestone` | 🎯 | baja | T0 | Meta de ahorro llegó al 100% |
| `cycle-start-projection` | 🪶 | media | T0 | Primeros 1–2 días del ciclo: libre/ingreso <25% (mes apretado estructural) |
| `income-missing` | 📭 | alta | T0 | Payday pasó pero ciclo no confirmado (`paydayPending: true`) |

#### Grupo 10 — Forecast predictivo (P1)

| ID | Emoji | Urgencia | Tier | Descripción |
|----|-------|----------|------|-------------|
| `forecast-tomorrow-risk` | 📅 | media | T3 | Mañana es el peor día-de-semana histórico y el saldo libre es insuficiente para cubrirlo |
| `forecast-storm-week` | 🌩️ | alta | T1 | ≥3 días distintos con eventos de inflexión en los próximos 7 días |
| `forecast-payday-gap` | ⏳ | alta | T1 | Track pesimista agota `restanteMes` antes del cobro |

#### Grupo 11 — Patrones causales (P3)

| ID | Emoji | Urgencia | Tier | Descripción |
|----|-------|----------|------|-------------|
| `causal-friday-cascade` | 🪢 | baja | T3 | Viernes alto → sábado spike (≥4 ocurrencias, solo se muestra en jueves) |
| `causal-paired-{cat_id}` | 🪞 | baja | T3 | Compras pareadas en la misma categoría en <3h (≥6 pares) |
| `causal-stress-spending` | 🌪️ | baja | T3 | Días con ≥4 transacciones promedian >130% del día normal |

#### Super-señales (composición de atómicas)

| ID | Emoji | Urgencia | Condición de disparo |
|----|-------|----------|---------------------|
| `super-perfect-storm` | 🌪️ | alta | ≥2 de {fijos-ratio, velocity, recovery-hard/soft} activos y ≥2 de urgencia alta |
| `super-savings-momentum` | 🚀 | baja | streak-ok + positive-forecast + (cat-win o savings-over) simultáneos |
| `super-hidden-drain` | 💧 | media | ≥2 de {small-leaks, cat-dominance-*, undetected-sub-*} simultáneos |

Cuando una super-señal se compone, sus constituyentes se eliminan del surface. Máximo 2 super-señales por render.

### 3.4 Fusión de señales (fuseSignals)

Antes del ranking se aplican 3 reglas de fusión:
1. **start-splurge + velocity** → se fusionan en `velocity` enriquecido con contexto del arranque
2. **cat-accel + cat-dominance** (misma categoría) → se fusionan en `cat-accel` enriquecido con el % de dominio
3. **recovery-hard + velocity** → se descarta `velocity` (redundante)

### 3.5 Ranking y diversity budget

**Score de ranking:**
```
score = urgencyWeight(urgency) × annualizedImpact(signal) × confidence
```

Donde `urgencyWeight`: alta=3, media=2, baja=1.

**Anualización del impacto** (compara en horizonte común):
- `impactScope: 'monthly'` → `impactRaw × 12`
- `impactScope: 'oneTime'` → `impactRaw`
- `impactScope: 'cycle'` → `impactRaw × 365 / cycleDays`

**Diversity budget** (evita monopolio de tono):
- Máx 3 señales `alta`, 3 `media`, 3 `baja`
- Máx 1 señal de refuerzo positivo (streak-ok, cat-win, savings-over, positive-forecast)
- Máx 2 super-señales

**Output final:** `slice(0, 5)` — la UI está diseñada para 3–5 ítems.

### 3.6 Personas y copy adaptativo

**Sistema de personas** [`mobile/features/insights/persona.ts`](../../../mobile/features/insights/persona.ts):

| Persona | Framing | Label | Lógica de inferencia |
|---------|---------|-------|---------------------|
| `planner` (default) | neutral | Planificador | Cold-start (<10 shown); CTR balanceado |
| `firefighter` | loss | Reactivo | CTR crítico >50% + CTR insight <15%, ≥3 críticos shown |
| `avoider` | gain | Conservador | CTR global <10% |
| `optimizer` | gain | Optimizador | CTR positivo >40%, ≥3 positivos shown |

Requiere `totalShown ≥ 10` para activar; con menos muestra siempre `planner`.

**Copy adaptativo** [`mobile/features/insights/control-signals-copy.ts`](../../../mobile/features/insights/control-signals-copy.ts):

Solo 4 señales críticas tienen variantes de persona hoy: `recovery-hard`, `velocity`, `fijos-ratio`, `positive-forecast`. Cada una tiene body para `loss`, `gain` y `neutral` (default).

Ejemplo `recovery-hard`:
- **loss**: "Sin recortar a $X/día, el cierre del mes vas a perderlo…"
- **gain**: "Recortando a $X/día durante N días recuperás el ritmo…"
- **neutral**: "Para recuperar el ritmo habría que gastar menos de $X/día… Mejor reajustar la meta."

**Familias de señales** [`mobile/features/insights/signal-family.ts`](../../../mobile/features/insights/signal-family.ts):

Colapsa IDs dinámicos a familia base:
`zombie-xxx` → `zombie`, `cap-xxx` → `cap`, `cat-dominance-xxx` → `cat-dominance`, etc.

### 3.7 Baselines per-usuario

[`mobile/features/insights/user-baselines.ts`](../../../mobile/features/insights/user-baselines.ts)

Con ≥3 ciclos cerrados, reemplaza umbrales globales por P75 de la historia del usuario:
- `catDominanceP75`: reemplaza el umbral fijo del 40% en `cat-dominance`
- `catAccelP75`: reemplaza el 1.4× en `cat-accel`

Bajo 3 ciclos devuelve `null` y los signals usan constantes globales.

### 3.8 Dismissals y TTL

[`mobile/features/insights/control-dismiss-store.ts`](../../../mobile/features/insights/control-dismiss-store.ts)

Persistencia en tabla `advisor_signal_dismissals` (Supabase). Seed inicial desde `home_snapshot` RPC para evitar round-trip extra.

TTL escala por familia (ejemplos):
- `velocity`, `recovery-*`, `payday-proximity`: 2 días
- `cat-win`, `weekly-pattern`: 7–14 días
- `fijos-ratio`, `income-volatility`: 14 días
- `savings-milestone`: 30 días
- `high-single-expense`, `income-missing`: 1 día

**Escalación por re-dismiss:** `ttl = baseTtl × (1 + (ignoreCount-1) × 0.5)`, hasta 4×. Protege contra doble-tap en 1500ms (no incrementa `ignoreCount`).

---

## 4. Coach Mode

**Ruta:** [`app/(app)/coach/[signalId].tsx`](../../../app/(app)/coach/[signalId].tsx)
**Screen:** [`mobile/screens/home/coach-mode-screen.tsx`](../../../mobile/screens/home/coach-mode-screen.tsx)

### Navegación a Coach

Se llega desde la acción `{ kind: 'open-coach-mode', signalId, topic }` en el dispatcher. Hoy solo dos señales disparan este destino:
- `super-perfect-storm` → `topic: 'crisis'` → título "Plan integral"
- `super-hidden-drain` → `topic: 'leaks'` → título "Auditoría de drenaje"

### Qué muestra

1. **Header** con emoji y título derivado del `topic` (TOPIC_TITLES) o del ID de la señal
2. **Chip de confianza** (`confidenceLabel`) y chip de impacto (`impactChipLabel`)
3. **Body completo** de la señal (explicación larga)
4. **Sección "Componentes"** (si la señal es super-signal): lista de señales atómicas constituyentes con su propio emoji, título, body y chip
5. **`dummyExplanation`**: explicación educativa de por qué importa el patrón
6. **CTA primario** (mismo dispatcher que en el asistente)
7. Botón "Cerrar" (router.back)

### Datos

`useControlV2Data(familyId, userId)` — mismo hook que el asistente. La lookup `signals.find(s => s.id === signalId)` puede devolver `null` si la señal ya venció o fue descartada. El screen maneja el estado `null` sin crash (no muestra el body pero sí permite cerrar).

Los constituyentes de super-señales se buscan en la lista completa `signals` (incluso si fueron eliminados del surface por diversity budget — están en el array completo pre-slice).

### Estado actual

✅ LIVE. Scaffold funcional. El contenido de plan de acción paso-a-paso (checklists, links externos, embedded charts) está **deferred** para iteraciones post-validación.

---

## 5. Motor financiero (features/finance)

Los tres archivos de `features/finance` son la capa de configuración financiera del usuario.

### 5.1 Modelo de datos — `family-finance.model.ts`

[`mobile/features/finance/family-finance.model.ts`](../../../mobile/features/finance/family-finance.model.ts)

**Tabla `family_finance`** — columnas clave:

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `monthly_income` | number | 0 | Ingreso mensual declarado (ARS) |
| `savings_goal` | number | derivado | Importe mensual de ahorro (calculado desde %) |
| `savings_goal_percent` | number | 20% | % del ingreso a ahorrar (max 50%) |
| `salary_payment_day` | number | 1 | Día del mes de cobro (1–31) |
| `last_salary_confirmed_at` | string \| null | null | ISO timestamp de última confirmación de cobro |
| `current_cycle_starting_balance` | number \| null | null | Override del balance de inicio del ciclo actual |
| `current_cycle_anchor` | string \| null | null | Fecha de inicio del ciclo al que aplica el override (YYYY-MM-DD) |
| `usd_exchange_rate` | number | 1000 | TC USD/ARS declarado |
| `daily_budget_buffer_mode` | 'none'\|'fixed'\|'percent' | 'none' | Colchón del cupo diario |
| `daily_budget_buffer_value` | number | 0 | Valor del colchón |
| `daily_budget_nudges_enabled` | boolean | true | Habilita nudges diarios |
| `daily_budget_checkin_hour` | number | 9 | Hora del check-in diario |

**Fórmulas clave:**

```
savingsGoalAmount = round((monthlyIncome × savingsGoalPercent / 100) × 100) / 100
  [clamped: savingsGoalPercent ∈ [0, 50]]

flexibleTargetPercent = max(0, 100 - 50 - savingsGoalPercent)
  [TARGET_ESSENTIALS_PERCENT = 50]

libreMes = monthlyIncome - fijosMes - savingsGoalAmount
cupoDiario = libreMes / diasMes
```

Constantes relevantes:
- `TARGET_ESSENTIALS_PERCENT = 50` (referencia del 50% de la regla de fijos)
- `MAX_SAVINGS_GOAL_PERCENT = 50`
- `DEFAULT_SAVINGS_GOAL_PERCENT = 20`
- `DEFAULT_SALARY_PAYMENT_DAY = 1`

**Override de ciclo (current_cycle_starting_balance):**
Si el usuario confirma un balance diferente al ingreso declarado (por ejemplo, tenía ahorro acumulado), se guarda el override + el anchor de ese ciclo. El motor usa ese valor en vez del `monthly_income` para el ciclo correspondiente. Si el ciclo calculado difiere del anchor guardado, el override se trata como stale y se re-pregunta.

### 5.2 Repositorio — `family-finance.repository.ts`

[`mobile/features/finance/family-finance.repository.ts`](../../../mobile/features/finance/family-finance.repository.ts)

Fetches desde `family_finance` en Supabase, con fallback a SecureStore/localStorage (`family_finance_fallback:{familyId}`). Maneja errores de columnas faltantes (`isMissingColumnError`) para compatibilidad con migraciones parciales.

### 5.3 Pay-Cycle — `use-pay-cycle.ts` / `pay-cycle.ts`

[`mobile/hooks/use-pay-cycle.ts`](../../../mobile/hooks/use-pay-cycle.ts) — Hook React  
[`mobile/utils/pay-cycle.ts`](../../../mobile/utils/pay-cycle.ts) — Lógica pura

**`getCurrentPayCycle(referenceDate, paymentDay, freezeUntilConfirmation)`:**
- El ciclo va de `paymentDay` del mes anterior a `paymentDay - 1` del mes actual
- `buildPayDate`: el día de cobro es literal (sin ajuste a día hábil)
- Si `today >= currentMonthPayDate` y no hay confirmación → `isSalaryPendingConfirmation = true` → el ciclo se "freezea" en el mes anterior hasta confirmación

**`usePayCycle(familyId)`** devuelve `{ cycle, salaryPaymentDay, today, isSalaryPendingConfirmation }`. Es la fuente de verdad del ciclo en toda la app.

---

## 6. Rachas (features/streaks)

[`mobile/features/streaks/use-streak.ts`](../../../mobile/features/streaks/use-streak.ts)

### Persistencia

Las rachas viven en **tablas de Supabase** (no derivadas en runtime):
- **`user_streaks`**: `current_streak`, `longest_streak`, `total_days_logged`, `last_logged_date`, `freeze_tokens`, `streak_broken_at`
- **`streak_marked_days`**: días marcados como "sin gasto" por el usuario

El avance de racha ocurre server-side via trigger `expenses_trigger_advance_streak` al insertar un gasto. El cliente solo lee.

### Estados

| Estado | Condición |
|--------|-----------|
| `active` | `last_logged_date === today` (incluye marcados sin gasto) |
| `at_risk` | `last_logged_date` no es hoy pero la racha no se rompió aún |
| `broken` | `streak_broken_at !== null && current_streak === 0` (server) o heurística cliente (gap >1 día sin escudos) |

**Cron server** rompe la racha si el gap es mayor al permitido (setea `streak_broken_at`, zeroes `current_streak`). El cliente deriva el estado a partir de `last_logged_date` vs today; el servidor es source of truth.

### Niveles

| Nivel | Key | Días desde |
|-------|-----|-----------|
| Arranque | `arranque` | 0–6 |
| Constante | `constante` | 7–13 |
| Disciplinado | `disciplinado` | 14–29 |
| Imparable | `imparable` | 30–59 |
| Maestro | `maestro` | 60–89 |
| Leyenda | `leyenda` | 90+ |

### At-risk intensity (4 bandas horarias)

| Banda | Horario | Tono |
|-------|---------|------|
| `calm` | 05–11h | Verde, sin urgencia |
| `gentle` | 12–15h | Suave nudge |
| `urgent` | 16–19h | Naranja; "Hoy no tuve gastos" se habilita |
| `critical` | 20–04h | Rojo; última chance |

### Freeze tokens (escudos)

`freeze_tokens` protege la racha un día sin registro. Se consume automáticamente a medianoche por el cron si el usuario no registró. Se otorgan server-side (no editable desde el cliente).

### Acciones del cliente

- `useMarkNoExpenseDay()`: RPC `mark_no_expense_day` → escribe en `streak_marked_days` + avanza racha
- `useUnmarkNoExpenseDay()`: RPC `unmark_no_expense_day` → deshace el mark y recomputa

### Integración con señales

La señal `streak-ok` se dispara cuando `view.racha ≥ 3` (racha de días bajo cupo en el ciclo, derivada del historial de gastos en `ControlView`, no de `user_streaks`). Son dos métricas distintas: la racha del asistente mide días bajo cupo discrecional; la racha de la DB mide días con actividad registrada.

---

## 7. Logros (features/achievements)

[`mobile/features/achievements/use-achievements.ts`](../../../mobile/features/achievements/use-achievements.ts)

### Arquitectura

- **Detección 100% server-side** vía triggers de Postgres sobre: `expenses`, `fixed_expenses`, `fixed_expense_payments`, `user_streaks`, `savings_goals`, `monthly_summaries`
- El cliente **nunca llama** a `award_achievement` — ese grant está bloqueado a `service_role` únicamente (lockdown migration `20260520010000`)
- El cliente solo **lee** `achievements_earned` y se suscribe a realtime inserts para celebrar unlocks frescos

### Tipos

```typescript
AchievementTier: 'bronze' | 'silver' | 'gold' | 'legendary'
AchievementCatalogEntry: { code, title, body, icon, tier, sort_order }
AchievementEarnedRow: { user_id, code, family_id, earned_at, context }
AchievementViewItem: catalog + { earned, earned_at, context }
```

### Intersección con Insights

Los logros no alimentan directamente el motor de señales. Son una capa paralela de gamificación. La UI de logros (galería, celebración) se documenta en el doc 06 (no existe aún). La señal `savings-milestone` en el asistente es independiente y se basa en el estado de la meta de ahorro, no en el catálogo de logros.

---

## 8. Inventario completo de archivos

### features/insights (43 archivos)

| Archivo | Tipo | Descripción | Estado |
|---------|------|-------------|--------|
| `control-signals.ts` | Motor | **Núcleo del asistente.** 43 builders, 2171 líneas. Toda la lógica de detección, fusión, composición, ranking y diversity budget | ✅ LIVE |
| `control-signals-copy.ts` | Copy | Copy adaptativo per-persona para 4 señales críticas | ✅ LIVE |
| `persona.ts` | Cognitivo | Tipos, perfiles y lógica de inferencia de persona desde InteractionStats | ✅ LIVE |
| `signal-family.ts` | Helper | `signalFamilyOf()` + `aggregateInteractionStats()` — colapsa IDs dinámicos a familia | ✅ LIVE |
| `user-baselines.ts` | Cognitivo | Baselines per-usuario (P75) desde historial de summaries | ✅ LIVE |
| `forecast-engine.ts` | Cognitivo P1 | Forecast 7 días en 3 tracks (baseline/optimista/pesimista) + inflection days | ✅ LIVE |
| `causal-engine.ts` | Cognitivo P3 | 3 detectores de links causales: friday-cascade, paired-impulse, stress-spending | ✅ LIVE |
| `control-v2-adapter.ts` | Adaptador | Convierte home_snapshot + queries extra en `ControlMockData` | ✅ LIVE |
| `control-v2-mock.ts` | Modelo | Tipos `ControlMockData`, `ControlView`, `ControlAdvisorTask`; `computeControlView()` (puro) | ✅ LIVE |
| `control-types.ts` | Tipos | `ControlSection`, `ControlHeroState`, `MetricDescriptor`, `buildTonePalette()` | ✅ LIVE |
| `control-model.ts` | Modelo | Tipos de modelo de control (no verificado en detalle) | ✅ LIVE |
| `control-metrics.ts` | Métricas | Compute de métricas de la pantalla Control | ✅ LIVE |
| `control-metric-groups.ts` | Métricas | Agrupación de métricas por sección | ✅ LIVE |
| `control-hero-state.ts` | UI state | Hero card state derivation | ✅ LIVE |
| `control-actions.ts` | Acciones | Definición de acciones del asistente (types) | ✅ LIVE |
| `control-action.ts` | Acciones | Tipo `ControlAction` y `ControlSectionAnchor` | ✅ LIVE |
| `control-cycle-plan-actions.ts` | Acciones | Acciones del plan del ciclo | ✅ LIVE |
| `control-today-actions.ts` | Acciones | Acciones de "hoy" | ✅ LIVE |
| `control-section-anchors.ts` | UI | Context para scroll a secciones | ✅ LIVE |
| `control-v2-mode.ts` | Mode | `classifyControlMode()` — modo vacío/mock/real | ✅ LIVE |
| `control-v2-empty-fallback.ts` | Fallback | `resolveControlSignals()` — gate para nuevas cuentas sin datos | ✅ LIVE |
| `use-control-v2-data.ts` | Hook central | Agrega todos los datos del asistente; memoización LRU(1) para 3 llamadores simultáneos | ✅ LIVE |
| `use-control-snapshot.ts` | Hook | `useControlSnapshot()` — RPC `control_snapshot` (forecast, zombie candidates, over-budget) | ✅ LIVE |
| `use-interaction-stats.ts` | Hook | Stats de interacción desde `advisor_interactions` (re-exporta `aggregateInteractionStats`) | ✅ LIVE |
| `use-signal-blocklist.ts` | Hook | Blocklist de familias desde DB + `useBlockSignalFamily()` | ✅ LIVE |
| `use-advisor-badge.ts` | Hook | Badge del tab bar (señales alta sin visitar en 18h) | ✅ LIVE |
| `use-advisor-notification-sync.ts` | Hook | Sync de notificaciones para el asistente | ✅ LIVE |
| `use-control-action-dispatcher.ts` | Hook | Dispatcher de acciones del asistente (navegar, contribuir, enviar warning, etc.) | ✅ LIVE |
| `use-send-member-warning.ts` | Hook | Envía warning a otro miembro de la familia | ✅ LIVE |
| `control-dismiss-store.ts` | Store | Dismissals persistidos en Supabase + cache optimista en módulo | ✅ LIVE |
| `control-visit-store.ts` | Store | Timestamp de última visita a Control (SecureStore/localStorage, 18h freshness) | ✅ LIVE |
| `assistant-demo-store.ts` | Store | Flag de modo demo (solo `__DEV__`); swapea signals por fixture | ✅ DEV ONLY |
| `assistant-demo-filter-store.ts` | Store | Filtro de señales en modo demo | ✅ DEV ONLY |
| `assistant-demo-signals.ts` | Fixture | Signals curadas para testing interno (todas las variantes de CTA) | ✅ DEV ONLY |
| `asistente-theme.ts` | UI | `useAsistenteTheme()` — tokens de color del asistente (light/dark) | ✅ LIVE |
| `asistente-empty-copy.ts` | Copy | `selectAsistenteEmptyCopy()` — estados vacíos del asistente | ✅ LIVE |
| `advisor-dismiss-repository.ts` | Repo | CRUD de `advisor_signal_dismissals` en Supabase | ✅ LIVE |
| `advisor-action-coordinator.ts` | Coord. | Coordinación de acciones del advisor | ✅ LIVE |
| `log-advisor-interaction.ts` | Telemetría | Loguea interacciones en `advisor_interactions` | ✅ LIVE |
| `log-advisor-value.ts` | Telemetría | Loguea valor percibido de señales | ✅ LIVE |
| `momentum-impact.ts` | Helper | `composeMomentumImpact()` — calcula impacto del super-savings-momentum | ✅ LIVE |
| `settings-modal-coordinator.ts` | UI | Coordinator para modales de settings desde el asistente | ✅ LIVE |
| `fixed-expense-value-capture.ts` | Helper | Value capture para fijos desde el asistente | ✅ LIVE |

### features/finance (3 archivos)

| Archivo | Descripción | Estado |
|---------|-------------|--------|
| [`family-finance.model.ts`](../../../mobile/features/finance/family-finance.model.ts) | Tipos, constantes, funciones puras de derivación y validación del modelo financiero | ✅ LIVE |
| [`family-finance.repository.ts`](../../../mobile/features/finance/family-finance.repository.ts) | Fetcher Supabase + fallback SecureStore + upsert | ✅ LIVE |
| [`use-family-finance.ts`](../../../mobile/features/finance/use-family-finance.ts) | Hook React Query sobre el repositorio | ✅ LIVE |

### features/streaks (1 archivo)

| Archivo | Descripción | Estado |
|---------|-------------|--------|
| [`use-streak.ts`](../../../mobile/features/streaks/use-streak.ts) | Hook completo: fetch de `user_streaks` + `streak_marked_days`, derivación de estado/nivel/copy, mutaciones `mark_no_expense_day` / `unmark_no_expense_day` | ✅ LIVE |

### features/achievements (1 archivo)

| Archivo | Descripción | Estado |
|---------|-------------|--------|
| [`use-achievements.ts`](../../../mobile/features/achievements/use-achievements.ts) | Hook + tipos; lee `achievements_catalog` + `achievements_earned`; suscripción realtime para celebración de unlocks | ✅ LIVE |

---

## 9. Estado vs deuda técnica

### Qué funciona en producción hoy ✅

- Motor de señales completo (43 builders, 3 super-señales, fusión, ranking, diversity budget)
- Personas adaptativas (4 tipos, inferencia desde interaction stats)
- Copy adaptativo en 4 señales críticas
- Forecast 7 días (3 tracks + inflection days)
- Causal engine (3 detectores)
- Baselines per-usuario (P75 desde historial)
- Coach mode con super-señales (plan integral + auditoría de drenaje)
- Dismiss persistido en Supabase con TTL escalado y seed desde home_snapshot
- Blocklist de familias (opt-out permanente por tipo de señal)
- Tab badge con freshness de 18h
- Rachas con 6 niveles, at-risk intensity, freeze tokens, DB-authoritative
- Logros detectados server-side vía triggers (client solo lee + realtime)

### Deuda técnica y pendientes 🟡

| Ítem | Estado | Notas |
|------|--------|-------|
| Coach mode content (planes paso-a-paso, checklists) | 🟡 PARCIAL | Scaffold funcionando; contenido rico deferred |
| AI Coach (LLM augmentation) | ⏸️ EN PAUSA | Esperando ≥500 MAU + modelo de monetización. Ver `docs/asistente-llm-augmentation-notes.md` |
| `recommended_actions` en control_snapshot | 🔴 NO POBLADO | El campo existe en la RPC pero el compute helper lo deja como array vacío |
| Más señales con copy adaptativo por persona | 🟡 PARCIAL | Solo 4 de los 43 builders tienen variantes; el resto usa neutral fijo |
| Weekly wrapped / Cycle Wrapped | ⏸️ EN PAUSA | Referenciado en `docs/cycle-wrapped-system.md`; no integrado al asistente aún |
| Notificaciones push proactivas del asistente | 🟡 PARCIAL | `use-advisor-notification-sync.ts` existe; integración completa (no verificado) |

### Documentos de referencia (verificar vigencia)

| Documento | Estado estimado |
|-----------|----------------|
| [`docs/asistente-financiero.md`](../../../docs/sistemas/asistente-financiero.md) | Probablemente desactualizado — v1 |
| [`docs/asistente-financierov2.md`](../../../docs/sistemas/asistente-financiero.md) | Referencia de diseño de v2; mayormente implementado |
| [`docs/asistente-llm-augmentation-notes.md`](../../../docs/sistemas/asistente-llm-augmentation-notes.md) | Vigente como roadmap futuro; el LLM no está implementado |

> Nota: los documentos de diseño en `docs/` pueden estar parcialmente desactualizados. El código en `mobile/features/insights/` es la fuente de verdad.
