# 📘 Asistente Financiero — Documentación Completa (v1, archivado)

> ⚠️ **Documento archivado.** El canónico activo es [`asistente-financierov2.md`](./asistente-financierov2.md), que incorpora la capa cognitiva, fixes de unidades/TTL y los nuevos action kinds.
> Este archivo se conserva como baseline histórico de la primera versión auditada.

> Capa de inteligencia local que detecta patrones, oportunidades y riesgos en las finanzas del usuario y los traduce en sugerencias accionables, no acumulables y con seguimiento periódico.
>
> Documento audit-grade: cada fórmula, threshold, y flujo está verificado contra el código.

---

## Índice

1. [Visión general](#1-visión-general)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Pipeline de datos end-to-end](#3-pipeline-de-datos-end-to-end)
4. [Esquemas de base de datos](#4-esquemas-de-base-de-datos)
5. [Hooks reactivos y queries](#5-hooks-reactivos-y-queries)
6. [Catálogo completo de señales (30 reglas)](#6-catálogo-completo-de-señales-30-reglas)
7. [Sistema de confianza](#7-sistema-de-confianza)
8. [Ranking, fusión y cap](#8-ranking-fusión-y-cap)
9. [Sistema de acciones (10 kinds)](#9-sistema-de-acciones-10-kinds)
10. [Sistema de dismiss](#10-sistema-de-dismiss)
11. [Sistema de notificaciones](#11-sistema-de-notificaciones)
12. [Server-side: crons y RPCs](#12-server-side-crons-y-rpcs)
13. [Surface UI (visual)](#13-surface-ui-visual)
14. [Animaciones](#14-animaciones)
15. [Accesibilidad](#15-accesibilidad)
16. [Edge cases y resiliencia](#16-edge-cases-y-resiliencia)
17. [Performance](#17-performance)
18. [Mapa de archivos](#18-mapa-de-archivos)
19. [Garantías de calidad](#19-garantías-de-calidad)
20. [Roadmap potencial](#20-roadmap-potencial)

---

## 1. Visión general

El **Asistente Financiero** es la capa de inteligencia del producto. Vive en dos superficies:

- **Card compacto** en el Home (botón mint en el header) → preview teaser
- **Pantalla completa** `/asistente` (modal sheet desde abajo) → conversación + mini-mapa constellation

Es **completamente local-first**: las señales se calculan en el cliente desde datos reales de Supabase. **No hay LLM en runtime** — la "inteligencia" es un set determinístico de **30 reglas** que correlacionan datos para generar insights.

**Propósito**:
- Sugerencias **periódicas, no acumulables y de calidad declarada**
- No spammear; cuando aparece algo, vale la pena leerlo
- "El asistente te dice qué hacer" — no es chat conversacional

**Filosofía**:
- Mismo input → mismo output (determinismo)
- Cap de 5 sugerencias máximas en pantalla
- Cooldown de 18h en push notifications
- TTL de 7 días en dismiss (snooze inteligente, no eliminación)

---

## 2. Arquitectura del sistema

```
┌───────────────────────────────────────────────────────────────┐
│  Datos reales (Supabase Postgres)                             │
│  · expenses, fixed_expenses, family_finance                   │
│  · monthly_summaries (rollup por ciclo cerrado)               │
│  · notifications (zombies, price-hikes, expense-logged…)      │
│  · velocity_snapshots (cron diario)                           │
│  · category_limits (caps por categoría)                       │
│  · savings_goals + user_streaks                               │
└──────────────────────────┬────────────────────────────────────┘
                           ▼
┌───────────────────────────────────────────────────────────────┐
│  RPC: home_snapshot(family_id)                                │
│  Devuelve un JSONB con TODO lo necesario en 1 query           │
└──────────────────────────┬────────────────────────────────────┘
                           ▼
┌───────────────────────────────────────────────────────────────┐
│  use-control-v2-data.ts (adapter hook)                        │
│  · Compone el contexto: BuildSignalsArgs                      │
│  · ControlView (per-day breakdown, racha, vault, etc.)        │
│  · Memo-izado por familyId + última actualización             │
└──────────────────────────┬────────────────────────────────────┘
                           ▼
┌───────────────────────────────────────────────────────────────┐
│  buildControlSignals(args) ── control-signals.ts              │
│  · 30 builders categorizados: cycle / category / behavior /   │
│    commitments / savings / family / reinforcement             │
│  · Cada builder devuelve 0–N ControlAdvisorTask               │
│  · MIN_CONFIDENCE = 0.4 → debajo, drop silencioso             │
│  · Confidence ramping: 4 tiers (T0/T1/T2/T3)                  │
└──────────────────────────┬────────────────────────────────────┘
                           ▼
┌───────────────────────────────────────────────────────────────┐
│  fuseSignals + ranking + cap 5                                │
│  · score = urgencyWeight × max(1, impactRaw) × confidence     │
│  · sort DESC, slice(0, 5)                                     │
│  · Convención: impactRaw siempre es magnitud mensual          │
└──────────────────────────┬────────────────────────────────────┘
                           ▼
                  ┌────────┴────────┐
                  ▼                 ▼
┌───────────────────────┐  ┌────────────────────────────────────┐
│  UI Surface           │  │  use-advisor-notification-sync    │
│  ControlV2AsesorCard  │  │  · alta urgencia + conf ≥ 0.7 →   │
│  AsistenteScreen      │  │    row en notifications table      │
│  · Filter dismissed   │  │  · conf ≥ 0.85 → push notification │
│    (7d TTL local)     │  │  · dedup por signal_id, 18h cooldn │
│  · Render top 5       │  │  · SecureStore cache local         │
│  · Swipe-to-dismiss   │  └────────────────────────────────────┘
│  · CTA dispatcher     │
└───────────┬───────────┘
            ▼
┌───────────────────────────────────────────────────────────────┐
│  use-control-action-dispatcher.ts (10 kinds únicos)           │
│  · navigate / open-fixed-expense / open-expenses-filtered /   │
│    open-add-fixed-prefilled / open-savings-goal /             │
│    open-streak-sheet / scroll-to-section /                    │
│    send-member-warning / quick-savings-contribution /         │
│    dismiss                                                     │
│  · RPC calls (savings contribution, member warning)           │
│  · Confirmaciones con Alert + haptic feedback                 │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. Pipeline de datos end-to-end

### Flujo completo: data → signal → UI → action

```
USER OPENS /asistente
        ↓
[1] useControlV2Data(familyId) → React Query cache hit/miss
        ↓ miss
[2] supabase.rpc('home_snapshot', { familyId })
        → JSONB con: profile, family, family_finance,
          fixed_expenses, expenses (current cycle),
          categories, notifications (80 rows recientes),
          family_members, savings_goals,
          fixed_expense_payments (mes actual),
          monthly_summaries_history (last 6 DESC),
          category_limits, velocity_today
        ↓
[3] buildControlDataFromSnapshot(snapshot)
        → Compone ControlData + ControlView:
          · detalleDias[]: per-day breakdown
            { dia, gasto, dow, inProgress }
          · diasRestantes: días hasta próximo cobro
          · diasSinGastar[]: índices con $0
          · racha: consecutivos bajo cupo
          · porDowEnriched[]: aggregates DoW
          · gastoProyectadoMes: linear projection
          · vault: ahorro acumulado del ciclo
          · alcanzaElMes: boolean
        ↓
[4] buildControlSignals({
      view, expenses, fixedExpenses, summaries,
      categoriesExpense, limits, velocity,
      notifications, savingsGoal,
      cupoDiario, gastoHoy, diasRestantes,
      ingresoMes, fijosMes,
      dismissedHikes, baselines, now
    })
        → Itera 30 builders, cada uno devuelve 0–N tasks
        → fuseSignals: deduplica + reescala duplicates
        → Filter: confidence >= MIN_CONFIDENCE (0.4)
        → Sort: score DESC, then impactRaw DESC
        → Slice top 5
        ↓
[5] UI render → ControlAdvisorTask[]
        → useDismissedIds() filtra los con TTL activo
        → AsistenteScreen renderiza chat bubbles
        ↓
USER TAPS CTA
        ↓
[6] useControlActionDispatcher.dispatch(task.action)
        → switch (action.kind) {
            navigate → router.push
            open-fixed-expense → router.push + params
            quick-savings-contribution →
              Alert confirm → RPC add_savings_contribution
              → success: dismissCard + haptic
              → failure: alert + retry
            send-member-warning →
              Alert confirm → RPC send_member_warning
            dismiss → dismissCard(dismissId)
            ...
          }
        ↓
[7] (paralelo) useAdvisorNotificationSync
        → Filter signals: urgency='alta' AND conf>=0.7
        → For each: check cooldown (SecureStore 'advisor-piped:v1')
        → If 18h+ since last pipe (or never piped):
            INSERT INTO notifications (kind=`advisor_${id}`, ...)
            IF conf >= 0.85: send Expo push notification
            UPDATE cooldown cache: { [signalId]: Date.now() }
```

### Adapter: `BuildSignalsArgs`

El adapter (`use-control-v2-data.ts`) es el único punto de composición. Produce esto:

```typescript
interface BuildSignalsArgs {
  view: ControlView                      // computed per-day breakdown
  expenses: Expense[]                    // current cycle, sin commitment_id
  fixedExpenses: FixedExpense[]          // active commitments
  categoriesExpense: Category[]          // todas las categorías
  summaries: MonthlySummaryHistory[]     // last 6 cycles
  limits: CategoryLimit[]                // caps por categoría
  velocity: VelocitySnapshot | null      // snapshot del cron
  notifications: NotificationLite[]      // last 80
  savingsGoal: SavingsGoal | null        // active goal
  cupoDiario: number                     // (income − fijos − ahorro) / cycleDays
  gastoHoy: number                       // suma de hoy
  diasRestantes: number                  // until next salary
  ingresoMes: number                     // monthly_income
  fijosMes: number                       // fixed_expenses sum
  dismissedHikes?: Record<string, number> // fixed_expense_id → price@dismiss
  baselines?: UserBaselines              // P75 thresholds (≥3 cycles)
  now?: Date                             // override para testing
}
```

`ControlView` (subset relevante):

```typescript
interface ControlView {
  detalleDias: DayDetail[]               // [{ dia, gasto, dow, inProgress }]
  diasRestantes: number
  diasSinGastar: number[]                // [3, 7, 12]
  restanteMes: number                    // libre budget remaining
  gastoProyectadoMes: number             // linear projection
  sobrantePresupuestadoMes: number       // projected surplus
  alcanzaElMes: boolean                  // will close in budget?
  racha: number                          // consecutive days under cupo
  porDowEnriched: DowBucket[]            // aggregates by DoW
  promedioDiario: number                 // avg per closed day
  delta: number                          // overspend hoy vs cupo
  vault: number                          // savings accumulated this cycle
  peorDow: DowBucket | null
  globalAvg: number
}
```

---

## 4. Esquemas de base de datos

### `notifications`
**Migración**: `20260423215800_notifications_ecosystem.sql`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `family_id` | uuid | NOT NULL, FK |
| `user_id` | uuid | nullable; NULL = broadcast a familia |
| `title` | text | headline |
| `body` | text | full message |
| `kind` | text | `expense_logged`, `fixed_paid`, `streak_broken`, `zombie_alert`, `price_hike`, `advisor_<signalId>` |
| `severity` | text | `info\|success\|warning\|alert`, default `info` |
| `created_by` | uuid | FK auth.users (nullable) |
| `read_at` | timestamptz | nullable, marca lectura |
| `metadata` | jsonb | NOT NULL default `'{}'`, payload contextual |
| `created_at` | timestamptz | default `now()` |

**RLS**: members SELECT donde `user_id IS NULL OR user_id = auth.uid()`. Usuario puede UPDATE solo el `read_at` de sus propias rows.

**Índices**:
- `notifications_family_user_unread_idx (family_id, user_id, read_at, created_at desc)`
- `notifications_family_kind_idx (family_id, kind, created_at desc)`

### `velocity_snapshots`
**Migración**: `20260424150000_control_intelligence.sql`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid | PK |
| `family_id` | uuid | NOT NULL, FK cascaded |
| `snapshot_date` | date | rollup diario |
| `avg_daily_last_7` | numeric(14,2) | promedio últimos 7 días |
| `avg_daily_last_30` | numeric(14,2) | promedio últimos 30 días |
| `momentum` | numeric(10,4) | `avg_7 / avg_30` |
| `forecast_close_amount` | numeric(14,2) | proyección cierre del mes |
| `stress_level` | text | `calm\|watch\|warn\|critical` |
| `created_at` | timestamptz | default `now()` |

**Unique**: `(family_id, snapshot_date)` — 1 row por familia por día.
**RLS**: SELECT members. Solo cron escribe (SECURITY DEFINER).

### `monthly_summaries`
**Migración**: `20260424040000_monthly_rollup.sql`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid | PK |
| `family_id` | uuid | NOT NULL, FK cascaded |
| `period_start` | date | inclusive |
| `period_end` | date | exclusive |
| `period_label` | text | "Abril" / "15 mar – 14 abr" |
| `total_variable_spent` | numeric(14,2) | sin commitment_id |
| `total_fixed_spent` | numeric(14,2) | suma de pagos de fijos |
| `total_spent` | numeric(14,2) | suma total |
| `expenses_count` | int | count variables |
| `fixed_paid_count` | int | count fijos pagados |
| `monthly_income` | numeric(14,2) | snapshot al cierre |
| `savings_goal_amount` | numeric(14,2) | snapshot |
| `savings_delta` | numeric(14,2) | actual contribuido |
| `category_breakdown` | jsonb | `[{ category_id, name, color, total, count, pct }]` |
| `daily_totals` | jsonb | `[{ day, total }]` |
| `by_member` | jsonb | `[{ user_id, display_name, amount, count }]` |
| `top_expense` | jsonb | `{ id, description, price, ... }` o null |
| `delta_vs_previous_percent` | numeric(6,2) | % vs ciclo anterior |
| `mood` | text | `green\|yellow\|red` o null |

**Unique**: `(family_id, period_start)`.
**RLS**: SELECT members. Solo RPC SECURITY DEFINER escribe.

### `savings_goals`
**Migración**: `20260422235900_home_redesign_savings_goals_and_fixed_payments.sql`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid | PK |
| `family_id` | uuid | NOT NULL, FK |
| `title` | text | NOT NULL ej. "Viaje a Bariloche" |
| `emoji` | text | default `'🎯'` |
| `goal_amount` | numeric(12,2) | NOT NULL, check >0 |
| `current_amount` | numeric(12,2) | NOT NULL default 0 |
| `target_months` | int | nullable, check null o >0 |
| `is_active` | boolean | default true (soft-delete) |
| `created_at`, `updated_at` | timestamptz | trigger auto-touch |

**Índices**: `idx_savings_goals_family_active (family_id) where is_active`

### `user_streaks`
**Migración**: `20260423203804_add_user_streaks.sql`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid | PK |
| `family_id` | uuid | NOT NULL, FK |
| `user_id` | uuid | NOT NULL, FK auth.users |
| `current_streak` | int | días consecutivos bajo cupo |
| `longest_streak` | int | record histórico |
| `total_days_logged` | int | acumulado |
| `last_logged_date` | date | nullable |
| `streak_broken_at` | timestamptz | cuándo se rompió |
| `freeze_tokens` | smallint | check 0–2 (escudos) |
| `days_since_last_token_grant` | int | counter |

**Unique**: `(family_id, user_id)`.
**RLS**: SELECT propio en familia. No INSERT/UPDATE/DELETE clientes — solo trigger SECURITY DEFINER.

### `category_limits`
| Columna | Tipo | Notas |
|---------|------|-------|
| `monthly_cap` | numeric(14,2) | NOT NULL, check ≥0 |
| `warning_threshold_pct` | int | NOT NULL default 80, check 1–100 |

**Unique**: `(family_id, category_id)`.
**RLS**: SELECT members; INSERT/UPDATE/DELETE solo owners.

### `expenses` (columnas relevantes)
- `id, family_id, user_id, category_id, price, description, created_at, commitment_id (FK fixed_expenses)`
- `archived_at` nullable, set cuando ciclo cierra

### `fixed_expenses` (columnas relevantes)
- `id, family_id, name, amount, kind (periodic|installment|debt|subscription), frequency, status (active|completed)`
- `category_id, next_due_on, day_of_month, ends_on`
- `installments_paid, installments_total, remaining_balance, lender_name`
- `last_used_at` nullable — usuario marca "todavía la uso", base para zombie detection

### `family_finance`
- `family_id, monthly_income, salary_payment_day, savings_goal`
- `current_cycle_starting_balance` — confirmed por usuario en payday
- `current_cycle_anchor` — start date del ciclo actual

---

## 5. Hooks reactivos y queries

### `useControlV2Data(familyId)`
**Archivo**: `mobile/features/insights/use-control-v2-data.ts`

**Queries que ejecuta** (vía React Query):
1. `home_snapshot(familyId)` RPC → JSONB con todo el contexto
2. Implícitamente: `monthly_summaries` last 6 (incluido en el snapshot)

**Devuelve**:
```typescript
{
  data: ControlData,           // numbers + flags
  view: ControlView,           // computed breakdowns
  signals: ControlAdvisorTask[], // top 5 ranked
  usingMock: boolean,
}
```

**Invalidación**: invalidada por `invalidateFamilyBudgetData()` después de:
- `add-expense` mutation
- `delete-expense` mutation
- `add-fixed-expense` / `pay-fixed-expense` mutations
- `add-savings-contribution` mutation
- `confirm-cycle-starting-balance` mutation

### `useDismissedIds()`
**Archivo**: `mobile/features/insights/control-dismiss-store.ts`

Hook reactivo sobre el store local. Re-renderea cuando `dismissCard()` o `clearExpired()` modifica el set.

### `useControlActionDispatcher({ familyId, userId })`
**Archivo**: `mobile/features/insights/use-control-action-dispatcher.ts`

Devuelve `dispatch(action: ControlAction): void`. Necesita estar montado dentro de `ControlAnchorsContext.Provider` para que `scroll-to-section` funcione.

### `useAdvisorNotificationSync({ signals, familyId, userId })`
**Archivo**: `mobile/features/insights/use-advisor-notification-sync.ts`

Side-effect hook. Pipe-ea signals de alta urgencia a `notifications` table (con cooldown 18h). Mounted en:
- `AsistenteScreen` (cuando user abre el chat)
- *(antes también en Control v2 — ahora removido para evitar double-write)*

---

## 6. Catálogo completo de señales (30 reglas)

**Convención de unidades**: todos los `impactRaw` están en **magnitud mensual equivalente** (excepto `recovery-*` y `start-splurge` que son one-time del ciclo). Esto garantiza que el ranking compare apples-to-apples.

### Tabla resumen

| ID | Trigger | Urgencia | Tier conf | Action | Tipo |
|----|---------|----------|-----------|--------|------|
| `stress-week` | 3+ fijos vencen en próximos 7 días | alta | T0 | `navigate` | warning |
| `payday-proximity` | 1–14d cobro + capacidad <70% cupo | media/alta | T0 | `dismiss` | warning |
| `start-splurge` | Primeros 3 días >15% libreMes | media | T1 | `dismiss` | warning |
| `end-acceleration` | Últimos 3 días >130% promedio ciclo | alta | T1 | `dismiss` | warning |
| `recovery-hard` | Sobre-gasto fuerza cupo <40% restante | alta | T0 | `navigate` | critical |
| `recovery-soft` | Sobre-gasto modera cupo | media | T0 | `dismiss` | warning |
| `velocity` | `forecast > 115%` libre mes | media/alta | T1 | `dismiss` | critical |
| `positive-forecast` | sobrante ≥ 2× cupo + meta activa | baja | T1 | `quick-savings-contribution` / `open-savings-goal` | positive |
| `cat-accel` | Top cat +40% vs P75 4 sem | media | T2 | `open-expenses-filtered` | warning |
| `cap-{cat}-{level}` | Categoría supera warning (80%) o cap | media/alta | T0 | `open-expenses-filtered` | warning |
| `cat-dominance-{cat}` | Una cat >40% del total | media | T1 | `dismiss` | insight |
| `cat-win` | Cat bajó al 30% del histórico | baja | T2 | `dismiss` | positive |
| `small-leaks` | 10+ gastos <$5k que suman >12% ciclo | media | T1 | `open-expenses-filtered` | insight |
| `night-impulse` | >70% discrecional 22:00–02:00 | media | T3 | `dismiss` | insight |
| `undetected-sub-{amt}` | Mismo monto 2+ veces fechas distintas | baja | T3 | `open-add-fixed-prefilled` | insight |
| `weekly-pattern` | Peor DoW 1.4× promedio o weekend 1.5× weekday | baja | T3 | `dismiss` | insight |
| `fijos-ratio` | Fijos >50% ingreso (≥60% = alta) | media/alta | T0 | `navigate` | critical |
| `income-volatility` | Ingreso ±10% vs 3 meses | baja/media | T2 | `open-savings-goal` / `navigate` | insight |
| `zombie-{id}` | Suscripción inactiva 2+ meses | alta | T0 | `open-fixed-expense` | critical |
| `hike-{id}` | Fijo subió ≥10% | baja | T0 | `open-fixed-expense` | warning |
| `savings-feasibility` | Plan corto este mes | media | T1 | `open-savings-goal` | warning |
| `savings-over` | Adelantado al plan ≥15% (≥1 mes) | baja | T1 | `open-savings-goal` | positive |
| `member-imbalance-{userId}` | Un miembro >70% del discrecional | baja | T1 | `send-member-warning` | insight |
| `streak-ok` | 3+ días consecutivos bajo cupo | baja | T0 | `dismiss` | positive |

### Detalle por señal (top 10 por impacto)

#### `recovery-hard` (control-signals.ts:383)
- **Trigger**: `view.delta < 0 AND diasRestantes > 1 AND newCupo < cupoDiario × 0.4`
- **Inputs**: `view.delta` (overspend), `cupoDiario`, `diasRestantes`
- **`impactRaw`**: `Math.round(overspend)` donde `overspend = |view.delta|`
- **`body`**: `"Para recuperar el ritmo habría que gastar menos de $X/día los próximos N días — es muy difícil. Mejor reajustar la meta o reordenar algún gasto fijo."`
- **Confidence**: `1.0` (T0 real-time, sin baseline histórica)
- **Urgency**: `'alta'`

#### `velocity` (control-signals.ts:428)
- **Trigger**: `velocity !== null AND velocity.stress_level !== 'calm'`
- **Inputs**: `velocity.stress_level/momentum/forecast_close_amount`, `view.gastoProyectadoMes`
- **`impactRaw`**: `Math.max(0, Math.round(over))` donde `over = forecast - gastoProyectadoMes`
- **`body`**: `"Al ritmo de los últimos 7 días, el cierre estimado es $X. Es Y% más rápido que el promedio del ciclo."`
- **Confidence**: `rampOneCycle(closedDays)` → 0→1 sobre ~14 días
- **Urgency**: `critical → 'alta'` | `warn → 'media'` | else `'baja'`

#### `cat-accel` (control-signals.ts:509)
- **Trigger**: `topCategory.amount / historicalAvg >= (baselines?.catAccelP75 ?? 1.4)`
- **Inputs**: top cat current, historical 4-week avg, last-7-day spike detection
- **`impactRaw`**: `Math.round(delta)` donde `delta = topCategory.amount - historicalAvg`
- **Spike detection**: `if (last7 / total >= 0.7) → 'spike'` else `'gradual'`
- **`body`** (spike): `"Llevas $X este mes vs $Y habitual. Casi todo es de los últimos 7 días — probablemente un gasto único."`
- **`body`** (gradual): `"La suba es gradual, parece un cambio de hábito."`
- **Confidence**: `rampOneCycle(closedDays) × rampSummaries(summariesCount/3)`
- **Urgency**: `'media'`

#### `zombie-{fixedExpenseId}` (control-signals.ts:975)
- **Trigger**: notification con `kind='zombie_alert'` creada en últimos 14 días (cron-detected, dedup 14d)
- **Inputs**: `notification.metadata.{fixed_expense_id, name, amount}`
- **`impactRaw`**: `Math.round(amount)` — **costo mensual** del unused (convención mensual)
- **`body`**: `"Cuesta $X al mes y hace 2+ meses que no se usa. Si la cancelas ahora, son $Y hasta fin de año."` (anual en body, mensual en ranking)
- **Confidence**: `1.0`
- **Urgency**: `'alta'`

#### `hike-{fixedExpenseId}` (control-signals.ts:1011)
- **Trigger**: notification `kind='price_hike'` últimos 7 días + no dismissed at this price
- **Inputs**: `metadata.{previous_amount, new_amount, delta_pct, fixed_expense_id}`
- **`impactRaw`**: `Math.round(delta)` mensual
- **`body`**: `"Pasó de $X a $Y. En 12 meses son $Z más. Comparar otros proveedores o renegociar."`
- **Confidence**: `1.0`
- **Urgency**: `'baja'`
- **Dismiss persistente**: si `dismissedHikes[id] === Math.round(newAmount)`, signal es dropped (no re-raisar al mismo precio)

#### `positive-forecast` (control-signals.ts:468)
- **Trigger**: `view.alcanzaElMes AND view.sobrantePresupuestadoMes >= cupoDiario × 2`
- **Inputs**: sobrante proyectado, savings_goal active, days remaining
- **`impactRaw`**: `Math.round(proposed)` donde `proposed = Math.floor((sobra × 0.5) / 1000) × 1000` — 50% del sobrante, redondeado a 1k
- **`body`** (con goal): `"Si el ritmo se mantiene, el ciclo cierra con saldo a favor. Sugerencia: mover $X a 'Goal Title' ahora."`
- **`body`** (sin goal): `"Ese excedente puede ir a una meta de ahorro o quedar como reserva."`
- **Confidence**: `rampOneCycle(closedDays)`
- **Urgency**: `'baja'`
- **Action**: con goal → `quick-savings-contribution` (1-tap) | sin goal → `open-savings-goal`

#### `streak-ok` (control-signals.ts:1173)
- **Trigger**: `view.racha >= 3` (3+ días consecutivos bajo cupo)
- **Inputs**: `view.racha`, `view.sobrantePresupuestadoMes`
- **`impactRaw`**: `0` (refuerzo, no impacto financiero directo)
- **`body`**: `"Ritmo sostenido en el ciclo. A este paso, el cierre del mes deja un excedente de $X."`
- **Confidence**: `1.0`
- **Urgency**: `'baja'` (celebratorio)

#### `fijos-ratio` (control-signals.ts:908)
- **Trigger**: `ingresoMes > 0 AND (fijosMes / ingresoMes) >= 0.6`
- **`impactRaw`**: `Math.round(excess)` donde `excess = fijosMes - (ingresoMes × 0.5)` — exceso vs threshold saludable 50%
- **`body`**: `"Lo saludable es ≤50%. Hoy, de cada $100 que entran, $X ya están comprometidos."`
- **Urgency**: `ratio > 0.75 → 'alta'` else `'media'`

#### `weekly-pattern` (control-signals.ts:812)
- **Trigger best-of-two**:
  - DoW: `peorDow.ratio >= 1.4 AND dowExtra >= 5000`
  - Weekend: `wkRatio >= 1.5 AND wkExtra >= 8000`
- **Cycle-aware multipliers** (corregido en último audit):
  - `monthlyOccurrences = cycleDays / 7` (≈ 4.286 para ciclo 30d)
  - `wkExtra = (weekendAvg - weekdayAvg) × (2 × cycleDays / 7)`
- **Confidence**: `rampThreeWeeks(closedDays)` ~21 días para estabilidad
- **Urgency**: `'baja'`

#### `savings-feasibility` (control-signals.ts:1061)
- **Trigger**: `goal.isActive AND missing > 0 AND months > 0 AND monthlyActual < monthlyNeeded`
- **`impactRaw`**: `Math.round(shortfall)` donde `shortfall = monthlyNeeded - monthlyActual`
- **`body`**: `"El plan necesita $X/mes para llegar al objetivo. Este mes vas por $Y. Si no se recupera, la fecha se aleja."`
- **Confidence**: `rampOneCycle(closedDays)`
- **Urgency**: `'media'`

### Tipos semánticos (UI tone)

- **POSITIVE** (verde) — refuerzo: streak, cat-win, savings-over, positive-forecast
- **WARNING** (amarillo) — atención: stress, payday, splurge, soft, etc.
- **CRITICAL** (peach) — acción urgente: recovery-hard, velocity, fijos-ratio, zombie
- **INSIGHT** (neutro) — patrón observado: dominance, leaks, night, weekly, sub, member

---

## 7. Sistema de confianza

`confidence ∈ [0, 1]` por señal. **Mínimo para surface: 0.4**. Bajo eso, drop silencioso.

| Tier | Cómo se calcula | Días requeridos | Ejemplos |
|------|-----------------|-----------------|----------|
| **T0 — real-time** | `1.0` | 0 (no requiere baseline) | stress-week, payday, recovery-*, caps, fijos-ratio, zombies, hikes, streak-ok |
| **T1 — 1 ciclo** | `closedDays / 14` (clamp 0–1) | ~7 para ramp inicial, ~14 para full | start-splurge, velocity, cat-dominance, savings-feasibility, savings-over, positive-forecast |
| **T2 — 3 ciclos** | `T1 × (summariesCount / 3)` | ~14 días + 3 ciclos cerrados | cat-accel, cat-win con históricos, income-volatility |
| **T3 — 60 días** | `closedDays / 21` | ~21 para confidence completa | night-impulse, weekly-pattern, undetected-sub |

### Helpers de ramping

```typescript
// control-signals.ts top of file
function rampOneCycle(closedDays: number): number {
  return Math.max(0, Math.min(1, closedDays / 14))
}
function rampSummaries(count: number): number {
  return Math.max(0, Math.min(1, count / 3))
}
function rampThreeWeeks(closedDays: number): number {
  return Math.max(0, Math.min(1, closedDays / 21))
}
```

### Surfacing en UI (`ConfidenceChip`)

| Tier | Threshold | UI |
|------|-----------|-----|
| `solid` | conf ≥ 0.85 | sin chip — la señal habla por sí misma |
| `building` | 0.6 ≤ conf < 0.85 | chip "evidencia parcial" + icon `pending` |
| `early` | conf < 0.6 | chip "señal temprana · Nd" + icon `history` |

El usuario sabe cuándo el sistema tiene certeza vs cuándo está aprendiendo. **No simula certidumbre falsa.**

---

## 8. Ranking, fusión y cap

### Fórmula de score

```typescript
score(signal) =
  urgencyWeight(urgency) ×
  Math.max(1, impactRaw) ×
  confidence

// urgencyWeight: alta=3, media=2, baja=1
```

### Orden

```typescript
signals.sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score
  return b.impactRaw - a.impactRaw  // tiebreak por impactRaw
})
```

### Fusión (`fuseSignals`)

Antes de rankear, dedupes signals que apuntan al mismo dominio (ej. `cat-accel` + `cat-dominance` para la misma categoría) escalando el score del ganador:

```typescript
// Si cat-accel y cat-dominance apuntan a la misma cat:
const winner = catAccel  // gana el de mayor urgencia/score
winner.impactRaw = catAccel.impactRaw + Math.round(dominance.impactRaw * 0.5)
// el otro se descarta
```

### Cap

```typescript
return ranked.slice(0, MAX_SIGNALS)  // MAX_SIGNALS = 5
```

### Ejemplo de cálculo

```
Tarea A: recovery-hard (alta=3) × 50000 × 1.0 = 150,000
Tarea B: velocity (media=2)     × 30000 × 0.7 =  42,000
Tarea C: cat-accel (media=2)    × 20000 × 0.5 =  20,000
Tarea D: streak-ok (baja=1)     ×    1  × 1.0 =       1
Tarea E: weekly-pattern (baja=1)× 12000 × 0.8 =   9,600

Sort: A(150k) > B(42k) > C(20k) > E(9.6k) > D(1)
Top 5: [A, B, C, E, D]
```

**Por qué funciona**:
- Refuerzos (urgency=baja, impactRaw=0–1) llenan huecos al final si hay ≤5 signals
- Empates por score → impactRaw mayor gana
- Convención de unidades garantiza comparación justa

---

## 9. Sistema de acciones (10 kinds)

Cada `action.kind` es una experiencia distinta. La UI los traduce a icono + haptic + label fallback únicos via [asesor-action-meta.ts](../mobile/components/control-v2/asesor-action-meta.ts).

| Kind | Icon | Haptic | Fallback label |
|------|------|--------|----------------|
| `navigate` | `north-east` | selection | "Abrir" |
| `open-fixed-expense` | `tune` | selection | "Ajustar" |
| `open-expenses-filtered` | `filter-list` | selection | "Explorar" |
| `open-add-fixed-prefilled` | `add-circle-outline` | selection | "Registrar" |
| `open-savings-goal` | `flag` | selection | "Ver meta" |
| `open-streak-sheet` | `local-fire-department` | success | "Ver racha" |
| `scroll-to-section` | `south` | selection | "Ir a sección" |
| `send-member-warning` | `campaign` | warning | "Avisar" |
| `quick-savings-contribution` | `savings` | success | "Mover ahora" |
| `dismiss` | `check-circle` | success | "Entendido" |

### Detalle por kind (dispatcher: `use-control-action-dispatcher.ts`)

#### `navigate`
```typescript
case 'navigate':
  router.push({ pathname: action.route, params: action.params })
```
Generic navigation (fixed-expenses, settings, home).

#### `open-fixed-expense`
```typescript
case 'open-fixed-expense':
  router.push({
    pathname: '/(app)/add-fixed-expense',
    params: { id: action.fixedExpenseId }
  })
```
Editar/ver fijo específico (zombie, hike, stress-week).

#### `open-expenses-filtered`
```typescript
case 'open-expenses-filtered': {
  const params = {}
  if (filter.categoryId) params.categoryId = filter.categoryId
  if (filter.priceMax) params.priceMax = filter.priceMax
  if (filter.priceMin) params.priceMin = filter.priceMin
  if (filter.dateRange) params.dateFrom = ..., params.dateTo = ...
  if (filter.focusExpenseId) params.focusExpenseId = ...
  router.push({ pathname: '/(app)/(tabs)/expenses', params })
}
```
Ejemplos:
- `cat-accel` → `{ categoryId }`
- `small-leaks` → `{ priceMax: 5000 }`
- `weekly-pattern` → date range del DoW peor

#### `open-add-fixed-prefilled`
```typescript
case 'open-add-fixed-prefilled':
  router.push({
    pathname: '/(app)/add-fixed-expense',
    params: { amount: action.amount, description: action.description }
  })
```
`undetected-sub` → pre-fill con amount + merchant detectado.

#### `open-savings-goal`
```typescript
case 'open-savings-goal':
  router.push('/(app)/savings-goal')
```
positive-forecast (sin goal), savings-feasibility, savings-over.

#### `open-streak-sheet`
```typescript
case 'open-streak-sheet':
  if (ctx?.openStreakSheet) ctx.openStreakSheet()
  else router.push('/(app)/(tabs)/home')
```
Bottom sheet de racha en Home; fallback navigate si callback no disponible.

#### `scroll-to-section`
```typescript
case 'scroll-to-section':
  if (anchors) anchors.scrollToSection(action.section)
```
sections: `'hoy' | 'alcanza' | 'alcancia' | 'semana' | 'vsmes' | 'patron' | 'cobertura'`. Dentro de Control: scroll directo. Desde Asistente sheet: `router.push('/insights?section=X')` que el screen consume on focus.

#### `send-member-warning`
```typescript
case 'send-member-warning': {
  if (action.targetUserId === ctx.userId) return  // no self-warnings
  Alert.alert('¿Enviar aviso?', action.message, [
    { text: 'Cancelar' },
    { text: 'Enviar', onPress: async () => {
      await warningMutation.mutate({
        familyId, targetUserId, message, createdBy: ctx.userId
      })
    }}
  ])
}
```
RPC: `send_member_warning(familyId, targetUserId, message, createdBy)`. Success → `"Listo — Aviso enviado."` toast.

#### `quick-savings-contribution`
```typescript
case 'quick-savings-contribution': {
  if (!savingsGoal) {
    Alert.alert('Sin meta activa', 'Creá una meta primero.')
    return
  }
  Alert.alert(
    'Mover a tu meta',
    `Vamos a mover ${formatMoney(action.amount)} a '${savingsGoal.title}'. ¿Confirmás?`,
    [
      { text: 'Cancelar' },
      { text: 'Confirmar', onPress: async () => {
        await addContributionMutation.mutate({
          goalId: savingsGoal.id,
          amount: Math.round(action.amount)
        })
        triggerHaptic('success')
        dismissCard(action.dismissId)  // auto-dismiss
      }}
    ]
  )
}
```
RPC: `add_savings_contribution(goalId, amount)`. **Auto-dismiss tras éxito** — no tiene sentido seguir sugiriendo mover dinero ya movido.

#### `dismiss`
```typescript
case 'dismiss':
  triggerHaptic('success')
  dismissCard(action.dismissId)
  return
```
Solo persistencia local — sin RPC.

---

## 10. Sistema de dismiss

**Archivo**: `mobile/features/insights/control-dismiss-store.ts`

### API

```typescript
function dismissCard(id: string): void
function isDismissed(id: string): boolean
function dismissedIgnoreCount(id: string): number  // veces dismisseada
function useDismissedIds(): ReadonlySet<string>     // hook reactivo
function clearExpired(): void                       // pruning manual
```

### Persistencia

- **Native**: `expo-secure-store`
- **Web**: `localStorage`
- **Local-first**: no syncea entre devices (los signals se regeneran en cliente desde data común)

### TTL

```typescript
const COOLDOWN_DAYS = 7
```

Después de 7 días, si la señal sigue siendo relevante (mismo `signalId` se vuelve a generar), reaparece. **Snooze inteligente, no eliminación.**

### `ignoreCount`

Cada dismiss incrementa el contador. Future-proof para que el builder degrade urgencia de signals crónicamente ignorados (ej. dismiss × 3 → urgency baja).

### Disparadores

1. **Swipe-to-dismiss**: `SwipeableRow` con acción derecha "Visto" (`visibility-off` icon, haptic selection)
2. **CTA "Entendido"**: signals con `action.kind === 'dismiss'` (awareness/celebración)
3. **Auto-dismiss**: tras `quick-savings-contribution` exitosa (no tiene sentido seguir sugiriendo)

### Helper único: `dismissKeyFor(task)`

```typescript
function dismissKeyFor(task: ControlAdvisorTask): string {
  return task.action?.kind === 'dismiss' ? task.action.dismissId : task.id
}
```

Resuelve el id correcto:
- Si `action.kind === 'dismiss'` → usa `action.dismissId` (lo que el builder definió)
- Sino → usa `task.id` (default)

---

## 11. Sistema de notificaciones

**Archivo**: `mobile/features/insights/use-advisor-notification-sync.ts`

### Pipeline

```
Signals (hasta 5) → Filter (urgency='alta' AND conf>=0.7)
                  → For each: shouldPipe(id)?
                      ↓ (true)
                  → INSERT INTO notifications (kind=`advisor_${id}`, ...)
                  → IF conf >= 0.85: send Expo push
                  → UPDATE cooldown cache: { [id]: Date.now() }
```

### Filtros

```typescript
const candidates = signals.filter(s =>
  s.urgency === 'alta' &&
  s.confidence >= 0.7 &&
  shouldPipe(s.id)
)
```

Solo `urgency = 'alta'` + `confidence ≥ 0.7` pasan el primer gate.

### Cooldown storage

```typescript
const STORAGE_KEY = 'advisor-piped:v1'
const MIN_INTERVAL_HOURS = 18
const HOUR_MS = 60 * 60 * 1000

// Cache shape:
{
  [signalId: string]: number  // epoch ms del último pipe
}

// Pruning: entries > 30 días removidas en hidratación
```

**Cooldown logic**:

```typescript
function shouldPipe(signalId: string): boolean {
  const last = cache[signalId]
  if (last == null) return true
  return Date.now() - last >= MIN_INTERVAL_HOURS * HOUR_MS
}
```

Si pasaron 18h+ desde el último pipe del mismo `signalId`, vuelve a pipear. **No hay deduplicación por contenido**, solo por `(signalId, time-window)`.

### Insertion en Supabase

```typescript
{
  family_id, user_id: currentUser,
  title: task.title,
  body: task.body,
  kind: `advisor_${task.id}`,
  severity: 'warning',
  metadata: {
    source: 'control-advisor',
    signal_id: task.id,
    category: task.cat,
    impact_raw: task.impactRaw,
    cta: task.cta,
    confidence: task.confidence,
    data_days: task.dataDays,
    route: '/(app)/(tabs)/control'
  }
}
```

### Push delivery

```typescript
if (task.confidence >= 0.85) {
  await sendFamilyPush({
    familyId,
    title: task.title,
    body: task.body,
    data: { route, signal_id }
  })
}
```

Push es **fire-and-forget**: el insert en notifications se hace siempre; el push solo si confianza alta.

**Resultado**: usuario nunca recibe spam. Una "alta urgencia + alta confianza" puede emitir 1 notification cada 18h, no más.

---

## 12. Server-side: crons y RPCs

**Archivo**: `supabase/migrations/20260424150000_control_intelligence.sql`

Todas las funciones cron son `SECURITY DEFINER` con `set search_path = public`.

### `cron_compute_velocity_snapshots()`
**Schedule**: `0 4 * * *` (diario 04:00 UTC = 01:00 ART)

**Lógica**:
1. Para cada familia con expenses en últimos 30 días, computa `avg_7` y `avg_30`
2. Calcula `momentum = avg_7 / avg_30`
3. Proyecta: `forecast = avg_7 × days_in_current_month`
4. Mapea a tier: `calm` (≤ libre×0.85) → `watch` (≤ libre×1.00) → `warn` (≤ libre×1.15) → `critical` (> 1.15 o libre ≤ 0)
5. Upsert en `velocity_snapshots` (idempotent por unique `(family_id, snapshot_date)`)

### `cron_detect_zombies()`
**Schedule**: `15 4 * * 1` (lunes 04:15 UTC, semanal)

**Lógica**:
1. Scan `fixed_expenses` activos con `status='active'`, `kind='periodic'`, ≥2 pagos históricos, y `last_used_at IS NULL OR last_used_at < NOW() - 60 days`
2. Para cada zombie candidate, dedup: no `zombie_alert` notification para este `fixed_expense_id` en últimos 14 días
3. Insert notification con `kind='zombie_alert'`, `severity='warning'`
4. `metadata = { fixed_expense_id, name, amount }`
5. Exception-safe per zombie

### `cron_detect_price_hikes()`
**Schedule**: `30 4 * * *` (diario 04:30 UTC)

**Lógica**:
1. Scan `fixed_expense_price_history` con cambios en últimas 24h con `delta_pct >= 10`
2. Lookup family via `fixed_expense_id → family_id`
3. Dedup: skip si `price_hike` existe en últimos 7 días para mismo `fixed_expense_id`
4. Insert notification con `kind='price_hike'`, `severity='info'`, metadata con `previous_amount, new_amount, delta_pct`
5. Limit 2 hikes por cron run, exception-safe

### RPCs invocados por el cliente

| RPC | Cuándo | Args | Devuelve |
|-----|--------|------|----------|
| `home_snapshot(family_id)` | useControlV2Data on mount/invalidate | `family_id` | JSONB con todo el contexto |
| `add_savings_contribution(goal_id, amount)` | quick-savings-contribution | `goal_id, amount` | `{ success, new_current_amount }` |
| `send_member_warning(family_id, target_user_id, message, created_by)` | send-member-warning | `…` | `{ success, notification_id }` |

---

## 13. Surface UI (visual)

### Compact card en Control v2
**Archivo**: `mobile/components/control-v2/control-v2-asesor-card.tsx`

Theme-aware con identidad emerald saturada.

**Light mode** 🌿:
- Shell: gradiente mint→sage `#E6F7D5 → #CCEAB0`
- Border: emerald @ 32% (1.5px)
- Hero accent: deep emerald `#1C7E3A`
- CTA: gradiente emerald sólido + texto blanco

**Dark mode** 🌲:
- Shell: gradiente forest emerald `#15402F → #082218`
- Border: mint @ 22% (1.5px)
- Hero accent: mint `#C7EE9C`
- CTA: gradiente mint + texto dark

**Layout**:
- Eyebrow: Brand badge (sparkle, breathing 1.4s) + "ASISTENTE" + count pill
- Hero: `+$X /mes` (CountUp 1400ms)
- Hairline divider
- Task rows: avatar 44pt + title + body + meta chips + CTA
- Critical glow: rows con urgencia critical pulsan opacity 0.05→0.13
- Periodicity hint: `swipe-left` icon + microtexto

### Pantalla completa `/asistente`
**Archivo**: `mobile/screens/home/asistente-screen.tsx`

Modal sheet (presentation: `'modal'` iOS / `'card' + fade_from_bottom` Android):
- Top bar: avatar identity + impact pill (sin X close — gesture swipe-down dismiss)
- Constellation header: 5 nodos en posiciones fijas + connection lines + pulse rings críticos + delta labels (cuando expanded)
- Chat bubbles: intro tag + bubble cream + impact bar + confidence dots + "Visto" reply
- Twinkling stars background (18 partículas)
- Empty state celebration cuando todas dismissed

### Avatares por signal id

[asesor-signal-meta.ts](../mobile/components/control-v2/asesor-signal-meta.ts) mapea cada signal id → MaterialIcon:

```typescript
const ENTRIES = [
  { id: 'streak-ok', icon: 'local-fire-department' },
  { id: 'cat-win', icon: 'check-circle-outline' },
  { id: 'velocity', icon: 'speed' },
  { id: 'recovery-hard', icon: 'gps-fixed' },
  { id: 'recovery-soft', icon: 'compass-calibration' },
  { id: 'fijos-ratio', icon: 'balance' },
  // … exact-id matches
  { prefix: 'zombie-', icon: 'block' },
  { prefix: 'hike-', icon: 'bolt' },
  { prefix: 'cap-', icon: 'shield' },
  { prefix: 'cat-dominance-', icon: 'pie-chart' },
  { prefix: 'undetected-sub-', icon: 'repeat' },
  { prefix: 'member-imbalance-', icon: 'group' },
  // … prefix matches (longest first)
]
// fallback: 'lightbulb-outline'
```

### Estados especiales

- **Empty (todas dismissed)**: card persiste con check pulsing + "Revisaste todas las sugerencias". Pill cambia "N IDEAS" → "AL DÍA"
- **Empty (sin signals)**: card retorna `null` (nada que mostrar)
- **Empty en chat screen**: EmptyState con celebration check + "Volverán a aparecer si los patrones persisten"

---

## 14. Animaciones

| Animación | Función | Duración | Ease | Reduced-motion |
|-----------|---------|----------|------|----------------|
| RiseView entrada | Fade + translateY | 700ms | cubic | ✅ |
| BrandBadge breath | Scale 1↔1.06 | 1400ms | inOut quad | ✅ |
| PanelAura drift A | TranslateXY | 12000ms | inOut sin | ✅ |
| PanelAura drift B | TranslateXY (delay 2400) | 14000ms | inOut sin | ✅ |
| CountUpText hero | 0 → totalImpact | 1400ms | out cubic | ✅ |
| Stagger entry | FadeIn delay 60ms × i | 220ms | linear | ✅ |
| Exit task | FadeOut | 140ms | linear | ✅ |
| CriticalCardGlow | Opacity 0.05↔0.13 | 2200ms | inOut quad | ✅ |
| BreatheDot avatar | Scale 1↔1.08 | 1800ms | inOut quad | ✅ |
| CTA press scale | 1 → 0.94 | 120ms | out quad | n/a |
| CTA release spring | 0.94 → 1 | spring (d:14, s:220) | n/a | n/a |
| EmptyHero check spring | 0.6 → 1 | spring (d:10, s:120) | n/a | ✅ |
| EmptyHero pulse | Opacity 0.10↔0.22 | 1800ms | inOut quad | ✅ |
| Constellation pulse ring | Scale + opacity | 2000ms | out quad | ✅ |
| Twinkling star | Opacity wave | 4800ms | inOut sin | ✅ |
| Swipe gesture | Real-time follow | n/a | n/a | n/a |

**Todas usan `useLoopAnimation`** que auto-cancela en blur de pantalla y respeta `prefers-reduced-motion`.

---

## 15. Accesibilidad

- **Color no es único indicador**: todos los signals tienen icon + texto + posición además del state accent
- **Contrast ratios**: text primary ≥ 7:1 (AAA) en ambos temas; secondary ≥ 4.5:1; tertiary ≥ 3:1
- **Touch targets**: ≥44pt en CTAs, swipe rows, explainer toggles, badge pills
- **`accessibilityRole="button"`** en todos los Pressables
- **`accessibilityLabel`** con contexto: ej. `"${ctaLabel} para ${task.title}"`
- **`accessibilityHint`** en SwipeableRow: "Desliza a la izquierda para marcarla como vista"
- **`accessibilityState={{ expanded }}`** en explainer toggles + map expand
- **`accessibilityLiveRegion="polite"`** en EmptyHero (anuncia tras último dismiss)
- **CountUpText `accessibilityLabel`**: full money string (no caracter-by-caracter)
- **VoiceOver order** = visual order
- **Compose bar y suggested prompts** marcados `accessible={false}` (no funcionales aún)

---

## 16. Edge cases y resiliencia

### Cold start (usuario nuevo)
- `useControlV2Data` devuelve `{ usingMock: true, signals: [] }`
- Card retorna `null` → no se muestra
- Botón mint en home muestra count 0 → tap abre sheet con EmptyState

### Sin income configurado (`monthlyIncome = 0`)
- `cupoDiario = 0` → la mayoría de signals no fire (zero guards)
- `streak-ok` puede fire-ear si no hay gastos
- Hero del Home muestra setup CTA en lugar del número

### Cycle pending payday
- `cycleEnd = expected_payday`, `diasRestantes = 0` cuando today == payday
- `payday-proximity` signal se genera con threshold y urgencia ajustadas
- Otros signals siguen funcionando

### Día 1-3 del ciclo (poca data)
- `confidenceTier = early` para casi todas
- Signals T1/T2/T3 con `closedDays < 4` retornan `confidence < 0.4` → drop silencioso
- Solo T0 signals (real-time) sobreviven el primer ciclo

### Cycle starting balance override activo
- `family_finance.current_cycle_starting_balance` ≠ NULL
- `effectiveCycleIncome = override` en lugar de `monthly_income`
- Todos los signals usan los valores efectivos del dashboard
- Card "Alcanza" muestra callout "Ajustado para este ciclo"

### Todas las signals dismissed
- Card persiste con state "AL DÍA" (no `null`)
- Chat screen muestra EmptyState celebratorio
- Reactivación: cuando dismiss expira (7d) o nuevo signal id surge

### Reduced motion enabled
- `useReducedMotion()` retorna `true`
- Todas las loops auto-disable
- Entradas reducidas a fade simples (sin scale/translate)
- `useLoopAnimation` cancela on blur automáticamente

### Notification spam prevention
- Cooldown 18h por `signalId`
- Mismo signal id puede pipearse ≥1 vez por día (no más)
- Cleanup auto: entries >30d removidas en hydration

### Signal builder no reconocido
- `iconForSignal()` fallback: `lightbulb-outline`
- `bubbleHeadline()` fallback: `task.cat || 'Insight'`
- `impactChipLabel()` fallback: `'Impacto mensual'`
- Sistema sigue funcionando con copy genérico

### RPC failure (quick-savings-contribution)
- Alert error: `"No pudimos mover"`
- Haptic error
- Botón vuelve a estado idle, retry posible
- Card no se dismissea hasta success real

---

## 17. Performance

### Query patterns
- `home_snapshot()` RPC: 1 round-trip único en lugar de N queries paralelas
- React Query cache: `staleTime: 30s`, `cacheTime: 5m`
- Invalidación granular: solo expense/savings mutations invalidan el snapshot

### Memoización
- `BuildSignalsArgs` es `useMemo`-izado por `[snapshotData, dismissedIds]`
- `signals` array es `useMemo`-izado por args
- Cada signal builder es deterministic (mismo input → mismo output)

### Animation cost
- 18 stars × `useAnimatedStyle` en chat screen (~ 1ms/frame)
- 14 stars en compact card
- Reanimated worklets corren en UI thread, no bloquean JS
- `useLoopAnimation` auto-cancela en blur → 0% cost cuando no visible

### Render count
- Compact card: re-renders solo cuando `signals` o `dismissedIds` cambian
- Chat screen: similar; `LinearTransition` evita layout thrash en dismiss

### Bundle size
- Sin LLM, sin remote config, sin SDKs externos para signals
- `react-native-svg` ya estaba en bundle (otros features)
- Total impact: ~30KB para la feature completa

---

## 18. Mapa de archivos

### Backend / lógica (TypeScript)
- `mobile/features/insights/control-signals.ts` — 30 builders + ranking + fusion
- `mobile/features/insights/control-action.ts` — `ControlAction` type discriminado
- `mobile/features/insights/control-dismiss-store.ts` — dismiss store local + 7d TTL
- `mobile/features/insights/use-control-action-dispatcher.ts` — dispatcher de los 10 kinds
- `mobile/features/insights/use-advisor-notification-sync.ts` — pipe a notifications + push (18h cooldown)
- `mobile/features/insights/use-control-v2-data.ts` — adapter que arma BuildSignalsArgs
- `mobile/features/insights/control-section-anchors.ts` — context para scroll-to-section
- `mobile/features/insights/control-v2-mock.ts` — types `ControlAdvisorTask`, `ControlView`, etc.

### UI components
- `mobile/components/control-v2/control-v2-asesor-card.tsx` — compact card en Control
- `mobile/screens/home/asistente-screen.tsx` — pantalla completa modal
- `mobile/components/control-v2/asesor-action-meta.ts` — mapping action.kind → icono/haptic/label
- `mobile/components/control-v2/asesor-signal-meta.ts` — mapping signal id → MaterialIcon
- `mobile/components/control-v2/asesor-bubble-meta.ts` — adapter task → bubble shape
- `mobile/components/home/home-assistant-button.tsx` — botón mint en home header
- `mobile/components/ui/swipeable-row.tsx` — wrapper genérico de swipe
- `mobile/components/home/animated/breathe-dot.tsx` — pulsing dot
- `mobile/components/home/animated/count-up-text.tsx` — number ticker
- `mobile/components/home/animated/rise-view.tsx` — entrada fade+translate

### Routing
- `app/(app)/asistente.tsx` — route wrapper con RequireAuth
- `mobile/components/root/app-stack-shell.tsx` — Stack.Screen registration con `presentation: 'modal'`

### Theme
- `mobile/theme/state-tokens.ts` — `getStateTokens(state, theme)` + `urgencyToState` + `REINFORCEMENT_TASK_IDS`
- `mobile/components/control-v2/control-v2-tokens.ts` — paleta tonal del módulo Control

### Server / DB (SQL migrations)
- `supabase/migrations/20260423215800_notifications_ecosystem.sql` — tabla notifications + RLS
- `supabase/migrations/20260424150000_control_intelligence.sql` — velocity, zombie, hike crons
- `supabase/migrations/20260424040000_monthly_rollup.sql` — monthly_summaries + cron close-cycle
- `supabase/migrations/20260422235900_home_redesign_savings_goals_and_fixed_payments.sql` — savings_goals
- `supabase/migrations/20260423203804_add_user_streaks.sql` — user_streaks + advance_streak()

---

## 19. Garantías de calidad

✅ **Periódico, no acumulable** — cooldown 18h push + cap 5 signals + dismiss 7d TTL
✅ **No-spam** — solo `urgency=alta` y `confidence≥0.7` salen como notification; solo `≥0.85` como push
✅ **Calidad declarada** — chips visibles indican cuándo el sistema está aprendiendo
✅ **Acciones únicas** — 10 action kinds con icono/haptic/label distintos
✅ **Local-first** — funciona offline, instantáneo, sin coste por inferencia
✅ **Determinismo** — mismo input → mismo output, sin LLM en runtime
✅ **Theme-aware** — Light + Dark con identidad mint/emerald premium
✅ **A11y completo** — touch targets, labels, live regions, contraste AAA en text primary
✅ **Reduced-motion** — todas las loops se desactivan; entradas se reducen a fade simples
✅ **Resiliente** — empty state cuando todas dismissed; fallback iconos para signals desconocidos; null cuando no hay data
✅ **Math precision** — `impactRaw` siempre en magnitud mensual; ranking compara apples-to-apples
✅ **RLS por familia** — toda la data scoped, ningún signal cross-family
✅ **Idempotent crons** — re-ejecución segura, dedup window por table

---

## 20. Roadmap potencial (no implementado)

- **Signal de-escalation por `ignoreCount`**: cuando user descarta 3+ veces el mismo signal id, el builder degrada su urgencia automáticamente
- **Cross-device dismiss sync**: tabla `advisor_dismissals` en Supabase para que dismiss en mobile silencie web/otros devices
- **A/B copy testing**: con stable signal ids podríamos versionar copies y medir engagement
- **LLM fallback** (existe `use-control-advisor.ts` dormant): si en el futuro queremos signals generativos para casos edge, el hook ya está esqueletado
- **Confidence-driven push throttling**: actualmente push fija a `≥0.85`; podría ser ramping (`0.85 → 1.0 = más push aceptables/semana`)
- **Per-signal analytics**: trackear CTR de cada signal id para identificar copies de bajo engagement
- **Deep-links en notifications**: hoy el push solo abre `/control`; podría llevar directo al action específico (ej. `/asistente?focus=zombie-disney`)
- **Streak-based confidence boost**: si el usuario logueó 30+ días consistentes, los signals de mid-confidence podrían rankear más alto
- **Family-aware signals**: detectar patrones agregados de la familia (no solo por user) — ej. "el hogar gasta 45% en restaurantes"
- **Predictive zombie detection**: notif antes de que el cron lo detecte si el usuario marca un fixed con `last_used_at` viejo

---

## Apéndice A — Glosario

- **Cupo diario** — `(monthly_income − fixed_expenses − savings_goal) / cycle_days`. Cap discrecional canónico.
- **Libre del mes** — `monthly_income − fixed_expenses − savings_goal`. Total discrecional del ciclo.
- **Cycle** — período entre 2 paydays consecutivos. Cycle days = diff de fechas (28-31 típicamente).
- **`commitment_id`** — FK en `expenses` que apunta a un `fixed_expense`. Su presencia indica que el gasto es un pago automático de un fijo (excluido de aggregates discrecionales).
- **`archived_at`** — timestamp en `expenses` set cuando el ciclo cierra. Excluye la row de queries del ciclo actual.
- **Vault** — alias de `cycleVault` = ahorro acumulado del ciclo si user mantuvo `gasto < cupo` cada día.
- **Racha** — días consecutivos con `gasto ≤ cupo` desde el último gasto sobre cupo.
- **`signalId`** — string que identifica únivocamente una señal. Estables (`streak-ok`) o con payload (`zombie-${fixedExpenseId}`).
- **`dismissId`** — id usado por el dismiss store. Para signals con `action.kind='dismiss'` es `action.dismissId`; sino es `task.id`.

## Apéndice B — Convenciones de código

- **Comentarios**: en español, audiencia es desarrolladores del producto
- **`impactRaw`**: siempre en pesos argentinos (ARS), magnitud mensual (no signed delta)
- **`impact`**: string de display, puede incluir prefix/suffix ("+$X/mes", "Cancelar suscripción")
- **`urgency`**: `'alta' | 'media' | 'baja'` — tradúce a `urgencyWeight` (3/2/1) para ranking
- **`confidence`**: `[0, 1]`. Mínimo 0.4 para surface
- **Per-signal IDs**: kebab-case para fixed (`recovery-hard`), prefix con `-` para dynamic (`zombie-{uuid}`)
