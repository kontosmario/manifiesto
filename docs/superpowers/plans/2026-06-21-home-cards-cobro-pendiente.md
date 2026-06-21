# Home cards coherentes con cobro pendiente — Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.

**Goal:** Cuando el cobro no está confirmado, las 2 cards del Home (Variables + Fijos del `MonthSummaryCard`) muestran un warning, y la mitad de Fijos refleja los **próximos a vencer** (tiempo real) en vez de "Todos pagados" (que sale de la ventana congelada).

**Architecture:** Modelo de dos planos ya existente. PLATA (saldo/cupo) = congelado; OBLIGACIONES (fijos/vencimientos) = tiempo real. El Home computa la parte de fijos sobre la ventana congelada → se la apunta a la ventana real (`freeze:false`) solo para esa parte, sin tocar el saldo. El warning reusa el flag `paydayPending` que ya existe.

**Global Constraints:** AR timezone; español; cliente (requiere build); validar typecheck + lint + bundle.

---

### Task 1: Fijos del Home en tiempo real (decouple)

**Files:**
- Modify: `mobile/features/home/use-home-metrics.ts` (payments + summarizeFijos → ventana real)
- Modify: `mobile/components/home/home-dashboard.tsx` (nextFixed → realCycle.end)

- [ ] **Step 1** — En `use-home-metrics.ts`, agregar las ventanas reales (paralelas al dashboard frozen):
```ts
const { cycle: realCycle } = usePayCycle(familyId, { freeze: false })
const realMonthly = useMonthlyAccounting(familyId, { freeze: false })
```
(imports: `usePayCycle` de `@/hooks/use-pay-cycle`, `useMonthlyAccounting` de `@/hooks/use-monthly-accounting` — chequear si ya están importados).

- [ ] **Step 2** — `paymentsQuery` (líneas ~200-205): cambiar `cycleStart: dashboard.payCycle.start` → `realCycle.start`, `cycleEnd: dashboard.payCycle.end` → `realCycle.end`.

- [ ] **Step 3** — `summarizeFijos` (líneas ~216-237): `monthlyStart: dashboard.monthlyAccounting.start` → `realMonthly.start`, `monthlyEnd` → `realMonthly.end`, `monthlyDays` → `realMonthly.days`. Actualizar la deps array del useMemo a `realMonthly.start/end/days`.
  - NO tocar `fixedTotal = dashboard.fixedExpensesMonthlyTotal` (presión del plano PLATA → frozen, no mueve el saldo). Solo `fixedPaid`/`fixedCount` salen del summary real.

- [ ] **Step 4** — `nextFixed` en `home-dashboard.tsx` (~766-776): agregar `const { cycle: realCycle } = usePayCycle(familyId, { freeze: false })` y pasar `cycleEnd: realCycle.end` a `computeNextFixed` (en vez de `dashboard.payCycle.end`).

- [ ] **Step 5** — Validar: `npm run typecheck`, `npx eslint <files>`, `npx vitest run` (si hay tests de home-metrics), `npx expo export --platform ios`.

- [ ] **Step 6** — Commit.

---

### Task 2: Warning de cobro pendiente en ambas mitades

**Files:**
- Modify: `mobile/components/home/month-summary-card.tsx` (prop + render en `SummaryPanel`)
- Modify: `mobile/components/home/home-dashboard.tsx` (pasar el flag)

- [ ] **Step 1** — `MonthSummaryCardProps`: agregar `cobroPending?: boolean` y `cobroDaysOverdue?: number`.

- [ ] **Step 2** — `home-dashboard.tsx` (~923-937): pasar `cobroPending={homeMetrics.hero.paydayPending}` y `cobroDaysOverdue={homeMetrics.hero.paydayDaysOverdue}` al `<MonthSummaryCard>`.

- [ ] **Step 3** — En `MonthSummaryCard`, pasar `warning` (boolean + days) a las DOS invocaciones de `SummaryPanel` (Variables + Fijos). `SummaryPanel`: agregar prop `cobroPending?: boolean` + `cobroDaysOverdue?: number` y renderizar un chip peach compacto cuando `cobroPending` — "● Sin confirmar" / "+N días sin cobrar" — en el head (entre `sub` y el `pill`). Reusar el tono durazno del `CobroPendingChip` (rgba(242,167,140,...)).

- [ ] **Step 4** — Validar: typecheck + lint + bundle.

- [ ] **Step 5** — Commit.

---

## Orden
Task 1 (fijos real-time) → Task 2 (warning). Ambas son cliente → requieren build.
