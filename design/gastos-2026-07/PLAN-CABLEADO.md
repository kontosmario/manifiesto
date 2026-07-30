I have verified all load-bearing anchors. Synthesizing the plan now.

---

# PLAN DE CABLEADO POR FASES — GASTOS → rediseño (datos reales)

Arquitecto: síntesis de los 4 informes (real-screen / new-logic-feasibility / kit-contract / gaps). Patrón canónico verificado en `neo-home-screen.tsx`. Anclas del kit reverificadas contra `gastos-screen.tsx`.

---

## 0. Bloqueante e invariantes (leer primero)

- **GATE DE APROBACIÓN.** `REDESIGN_APPROVAL['gastos'] = 'pendiente'` (`redesign-approval-status.ts:60`). Todo F0–F5 se construye en **preview** sin tocar la ruta live; el swap de ruta (F6) **NO se ejecuta** hasta que el owner flipee `'gastos' → 'aprobada'` (memoria `feedback_redesign_approval_gate`, real-screen §0).
- **No tocar el visual del kit.** Se evoluciona el **contrato de props** de los sub-componentes exportados; no se edita su render (patrón F3 de home, gaps §1).
- **Swap final = 1 línea** en `expenses-screen.tsx:14` (`<GastosV2Screen>` → `<NeoGastosScreen>`); la vieja queda sin ruta como referencia (real-screen §1, gaps §0).
- **3 decisiones de owner que gatean fases** (detalle en §Decisiones): (1) movimientos de ciclos cerrados no persisten → degradar a agregados; (2) exceso `amber` vs 2-estados del kit; (3) confirm-cobro en Gastos (sheet vs 1-tap, gate owner-only).

**Anclas verificadas del kit** (`mobile/components/redesign/gastos/gastos-screen.tsx`):

| Export | línea | Auto-driver a bypassear | línea |
|---|---|---|---|
| `GastosHeader` | 594 | `GastosFinalScreen` (reducer+deriveGastos, demo) | 1553 |
| `CycleDropdown` | 683 | `gastosReducer` | 235 |
| `GastosClosedBar` | 739 | `deriveGastos` (= `renderVals`) | 389 |
| `GastosOverdueBanner` | 764 | `buildCells` | 346 |
| `GastosHero` | 860 | `GastosState` / `INITIAL_STATE` | 201 / 214 |
| `GastosCalendar` | 1076 | Tipos VM: `DayKind` | 269 |
| `GastosDayDetail` | 1173 | `DayCell` | 271 |
| `GastosFilter` | 1374 | `HeroCategory` | 283 |
| `GastosMovements` | 1421 | `MovRowVM` / `MovGroupVM` | 291 / 302 |
| `LeafGlyph` | 502 | `DropdownItemVM` | (usado en `CycleDropdown`) |

El neo screen **no monta `GastosFinalScreen`**: compone los 9 sub-componentes exportados con VMs derivadas de `useGastosController`, igual que `NeoHomeDashboard` compone el kit de home (gaps §1).

---

## 1. Patrón canónico (verificado en `neo-home-screen.tsx`)

Estructura espejo a replicar en `mobile/screens/home/neo/neo-gastos-screen.tsx`:

- **Outer `NeoGastosScreen`** = shell (`neo-home-screen.tsx:343-602`). Sostiene: `<Screen>` + `RefreshControl` + gate de datos, `useGastosSnapshot` (handle de refetch + gate), telemetría de sesión gateada, banners de error. **Gate de MONTAJE** `error → !snapshot.data → null → <Inner/>` (`:533-549`) — evita 5+ RPCs en cold-start (real-screen §1, gaps c4). `mode` = `useThemeMode().resolvedMode as GastosMode` (`:347`).
- **Inner `NeoGastosContent`** = todos los hooks de datos (montan recién con `snapshot.data`): `useGastosController` + resto de §6. Deriva las VMs y baja a los sub-componentes.
- **Prop `preview`** (ruta dev, `:340`) desactiva lo side-effectful que colisiona con la vieja live (freezeOnBlur:false monta ambas):
  - Realtime `undefined` (`:447`, gaps c6): `useGastosRealtime(preview ? undefined : familyId)`.
  - Telemetría `undefined` (`:372`): `useGastosTelemetry(preview ? undefined : familyId)`; `trackTap` early-return en preview (`:809`).
  - Tour `enabled: !preview` (`:732`), sin registrar `GASTOS_TOUR` ni el ScrollView.
- **Chrome retirado:** el kit dibuja `HomeStatusBar` (`:1561`), `HomeNavBar` (`:1639`), `homeIndicator` (`:1640`) — se reemplazan por `<Screen>` + insets reales + tab bar del navigator (gaps c9, real-screen §7-11). El `brotBadge`/streak hardcodeado a `1` se cablea a `streakData.currentStreak`.
- **Reuso directo:** `useCycleConfirmation` (`:441`), `deriveHomeBrotPose`/`deriveHomeMoment` (features/home) para `brotPose`, `SwipeRow` (`:134`).

---

## 2. Fuente real de cada dato (mapeo demo → real)

Tabla única de referencia para todas las fases (controller = `use-gastos-controller.ts`, API verificada `:36-86`):

| VM del kit (demo) | Fuente real | archivo:línea |
|---|---|---|
| `CY[cyc]` (ciclo) | actual: controller; cerrados: `useMonthlyEditions` | kit `:57` → `use-monthly-editions.ts:44` |
| `GMAP[día]` `[gastadoStr,movsStr]` | `controller.dailySpend: Record<n,{day,total,count}>` | controller `:63` |
| `heroTotal` | `formatMoney(controller.filteredTotal)` | controller `:57` |
| `heroProm` | `formatMoney(controller.averageDaily)` | controller `:64` |
| `HeroCategory[]` (3 fijas) | `controller.topCategories: CategoryWeightRow[]{id,label,color,amount,percent}` | controller `:60` |
| `heroChip` | `controller.summaryChip` | controller `:58` |
| `BAR_SPECS` (7 fijas) | `controller.recentDailyBars: number[7]` normalizado [0,1] | controller `:65` |
| `CATS`/`FilterChip` | `[{Todas}, ...categoriesById]` + `expenseCountByCategoryId` | controller `:39,:44` |
| `DayCell.kind` | `controller.dayMoods[n]` (mood server) + today/futuro client | controller `:61` |
| `DayCell.sprout` (hardcode `n===28`) | `noSpendMarkedDates.has(iso)` ← `homeSnapshot.no_spend_days_this_cycle` | gastos-v2-screen.tsx:324-327 |
| `ORDER` (grilla 20→19 fija) | `cycleStart`+`cycleDays`+`firstWeekdayOffset` | controller `:70-71`, gastos-month-calendar.tsx:253-276 |
| `MovGroupVM[]` (2 fijos) | `buildGastosSections(controller.groups + income)` | build-sections.ts, gastos-v2-screen.tsx:597-605 |
| `cycleLabel` | actual: `controller.cycleLabel`; cerrado: `summary.period_label` | controller `:73` |
| `badgeCount` | `streakData.currentStreak` | use-streak.ts:34 |
| `ddItems` | `[cicloActual, ...editions]` con tag de sobrante | use-monthly-editions.ts + sobrante.ts |

---

## FASE F0 — Scaffold neo + ruta dev preview (riesgo: trivial)

**Alcance:** crear la cáscara y su preview, sin datos aún (o auto-driven temporal), para validar montaje/tema/insets fuera de la ruta live.

**Crear:**
- `mobile/screens/home/neo/neo-gastos-screen.tsx` — `NeoGastosScreen`(outer) + `NeoGastosContent`(inner), gate en `useGastosSnapshot().data`, prop `preview`, `mode` del tema. Chrome del kit retirado.
- `app/(app)/settings/dev/neo-gastos.tsx` — ruta dev análoga a `neo-home.tsx`, monta `<NeoGastosScreen preview />`.

**No tocar:** ruta live (`expenses.tsx`, `expenses-screen.tsx`).

**Validación:** abrir la ruta dev; render sin crash en light/dark; skeleton→contenido; la vieja sigue live en la tab sin colisión (realtime/telemetría/tour off por `preview`).

---

## FASE F1 — Cableado read-only del ciclo actual + días de exceso (riesgo: bajo)

**Alcance:** alimentar hero, calendario (con exceso), filtro y barras 7-días con el controller. Todo lectura, mapeo directo. Cubre la **lógica nueva (b) días de exceso** del ciclo actual (ya calculada server-side).

**Contratos a evolucionar (sin cambiar visual):**
- `GastosHero` (`:860`): `total/prom/categories/chip` ← tabla §2. **Gap:** el hero **no expone prop de barras** → extender contrato para aceptar `recentDailyBars` (real-screen §7-2, kit-contract §3). Mapear valor normalizado→altura + marcar pico `Math.max`.
- `GastosFilter` (`:1374`): `chips[]` dinámico. **Capa de mapeo obligatoria índice↔category_id** — el kit usa índice numérico, el controller usa id (kit-contract §4, gaps a5). `catIcon` = `rawName` crudo ES, no `name` localizado (kit-contract §4). `onSelect(i)` → `setSelectedCategoryId(id)` (re-consulta hero+calendar+lista, gaps a5).
- `GastosCalendar` (`:1076`): reemplazar `buildCells` (`:346`) por derivación desde `cycleStart`/`cycleDays`/`firstWeekdayOffset` + `dayMoods` + `today` + `noSpendMarkedDates`. Lógica ya existente a portar de `gastos-month-calendar.tsx:250-344`.

**Mapeo mood → `DayKind`** (`:269`, verificado `'ok'|'bad'|'now'|'fut'|'fuera'`):
- `now` = `n === today.getDate()`; `fut` = `cellDate > today` (client; el RPC solo devuelve elapsed, feasibility §2).
- **exceso:** `amber|red → 'bad'` (DECISIÓN OWNER, ver §Decisiones-2).
- `green → 'ok'`; `mood 'empty'` (pasado sin gasto) → `'ok'` neutro (real-screen §7-1 gap a resolver).
- `sprout` (hojita) = `noSpendMarkedDates.has(iso)`, **NO** `n===28` (hardcode en `:371`) ni `kind==='ok'` (feasibility §3, gaps b9). Usa `LeafGlyph` (`:502`).
- `badge` day-detail "Día de exceso" = `dayMoods[sel] ∈ {amber,red}` (feasibility §2).

**Fuente backend (sin migración):** RPC `gastos_calendar_summary` computa `mood` vs `cupoDiario`: `20260505000000_gastos_split_endpoints.sql:191-196`. `cupoDiario` canónico = `computeCupoDiario`/`resolveCupoIncomeBase` (controller `:134-156`) — **load-bearing:** debe matchear queryKey snapshot/warm (memoria `feedback_daily_budget_canonical_source`, gaps c4).

**Validación:** comparar hero/calendario/filtro neo vs vieja con la misma cuenta (seed de preview). Días amber/red pintan `bad`; hojita solo en días marcados; top-3 con colores reales de categoría; barras reflejan `recentDailyBars`.

---

## FASE F2 — Movimientos: lista real (riesgo: medio — estructural/perf)

**Alcance:** el mayor trabajo del cableado. Reemplazar el `ScrollView` estático de 2 grupos del kit (`GastosMovements`, `:1421`, render en `:1482-1517`) por lista virtualizada con paginación, ingresos intercalados y swipe-delete.

**Decisión estructural (gaps c8, kit-contract §4-movements):** convertir a **SectionList/FlashList** — necesario para paginación (`onEndReached`→`fetchNextPage`), `RefreshControl`, virtualización anti-jank gama baja y registro de scroll del tour. Envolver el kit-visual como `renderItem`/`renderSectionHeader`. Riesgo: perder fidelidad del kit si se re-estructura la jerarquía visual → mantener los presentacionales de fila del kit como `renderItem`.

**Contratos a evolucionar:**
- `MovRowVM` (`:291`): **extender con `kind:'expense'|'income'`** — el kit modela solo gastos; la vieja intercala ingresos (verde, "+") vía `useIncomeEvents`+`buildGastosSections` (gaps a1, kit-contract §4). Gap de datos más grande.
- Swipe-to-delete: envolver la fila en `SwipeRow` (`:134`) + `useDeleteExpense`/`useDeleteIncomeEvent` (gastos-v2-screen.tsx:308-313,426-461). Sin undo (delete inmediato + haptics + Alert en error), literal de la vieja (gaps a2). **GOTCHA freezeOnBlur:false** (gaps c1) — no tocar `_layout.tsx`.
- `showSeeMore` ← `controller.hasNextPage`; `onSeeMore` → `fetchNextPage()`; footer `isFetchingNextPage`/"fin del ciclo" (gaps a3).
- `RefreshControl` → `controller.refetchAll()` (gaps a8).
- `chipLabel` "✕ Día N · ver todo" → `controller.clearDay()`.
- Empty states: el kit tiene 1 eje (`empty` = cuenta nueva, `:210`); la vieja tiene 4 variantes (`build-gastos-empty-state.ts`: global/filtered/cycle/pending-confirm). En F2 cablear `filtered` (mini-empty "limpiar filtros") y `global`; `pending-confirm` se difiere a F5 (gaps a7, kit-contract §5).
- Row detalle: `sub` = `creator_display_name · categoría`; `CategoryIcon` ya en el kit (`:1503`) vía `catName=rawName`. `paid_in_arrears` sin equivalente en el kit → evaluar indicador o drop (gaps a15).

**Validación:** scroll largo con muchos movimientos (perf, no jank); paginación dispara al 50% del viewport; ingresos aparecen en verde en su día; swipe borra gasto e ingreso con optimistic + rollback en error; pull-to-refresh.

---

## FASE F3 — Day-detail + mutaciones (riesgo: medio — write ops)

**Alcance:** interacción del detalle-de-día y sus mutaciones (marcar/revertir sin-gastos, registrar olvidado). Cubre **lógica nueva (c)** no_spend ↔ estado. Todo ya existe en backend.

**Contratos a evolucionar `GastosDayDetail` (`:1173`):**
- `dayNum/sub/gastado/movs` ← `controller.dailySpend[selectedDay]` (`.total`/`.count`), `cycleLabel` (kit-contract §4, exactamente lo que pasa la vieja).
- `badge` ← `dayMoods[sel]==='red'|'amber' → 'Día de exceso'`.
- `onPrev/onNext` → `handlePrevDay/handleNextDay` (`stepCycleDay`). **Gap:** el kit clampea por índice en `ORDER` (`:249-253`) sin gatear futuro → **respetar `getCycleNavBounds` canGoPrev/canGoNext** (gastos-helpers.ts, kit-contract §4). Reconciliar.
- `onRegister` → `handleRegisterForgotten(date)` (gastos-v2-screen.tsx:537). **Gate:** solo días pasados (`selectedDay !== todayDay`, gastos-month-calendar.tsx:168); el kit lo muestra en todo `cur && !out` → reconciliar (gaps b6).
- `onMarkEmpty` → `handleMarkNoSpend(date)` (`:329`, RPC `mark_no_expense_day`). **Gate:** solo `count===0 && !marcado` (gastos-month-calendar.tsx:175-182). **GAP del kit:** falta el par inverso "Revertir marca" cuando ya está marcado (la vieja lo tiene, `:722`) → **extender contrato** con `onUnmarkNoSpend`+estado `hasNoSpendMark` (kit-contract §4-daydetail, gaps b5).
- `showCtas = cur && !out` (`:458`) — ya gatea read-only en ciclos cerrados (feasibility §1).

**GOTCHA timestamptz** (gaps c3, memoria `feedback_timestamptz_off_by_one`): fechas Y-M-D **local**, nunca `toISOString`. Los handlers vivos ya lo hacen (`:333,:361,:543`) — portar literal.

**Validación:** marcar día 0-gastos → hojita + racha avanza + confetti; revertir; registrar olvidado backdatea a `/add-expense?date=`; nav ‹›  no pasa a futuro; guards `EXPENSES_EXIST_ON_DATE`/`FUTURE_DATE_NOT_ALLOWED` manejados.

---

## FASE F4 — Dropdown de ciclos + ediciones cerradas read-only (riesgo: medio-alto — lógica nueva (a))

**Alcance:** la **lógica nueva (a)**. Selector de ciclo que abre ediciones CERRADAS en modo solo-lectura. Nuevo eje de estado por encima del controller.

**Hook a usar (ya existe, cero migración):** `useMonthlyEditions(familyId)` (`use-monthly-editions.ts:44`) — lee `monthly_summaries`, hasta 12 ciclos, `expenses_count>0`, **seedeado del cache de `home_snapshot`** → sin red extra (feasibility §1). Tipo `MonthlySummaryHistory` (`control-v2-adapter.ts:64`).

**Estado nuevo:** agregar `cycleOverride?: {start,end,label,closed}` por encima del controller. **Punto de inyección:** el controller hardcodea `usePayCycle(familyId)` en `use-gastos-controller.ts:94` → parametrizar para aceptar override (las 5 RPCs son **ventana-de-fecha pura** `p_cycle_start/p_cycle_end`, verificado, sirven cualquier ciclo). Con override activo, forzar todos los días a "past" (sin now/fut/fuera).

**Contratos a evolucionar:**
- `CycleDropdown` (`:683`): `items: DropdownItemVM[]` = `[{name: cycleLabelActual, tag:'EN CURSO', tone:'current'}, ...editions.map(e => ({name: e.period_label, tag: computeCycleSurplusSigned(e), tone:'closed'}))]` (kit-contract §4). **Fix:** `prevCycle/nextCycle` clampean `<2`/`>0` hardcodeado (`:243-248`) → `editions.length` dinámico (gaps §7-12).
- `GastosHeader.cycleVariant` = `cyc===0 ? 'current':'closed'`.
- `GastosClosedBar` (`:739`): `onBackToCurrent` → reset `cycleOverride`.
- `GastosHero.tag` = `'TOTAL DE LA EDICIÓN'` (ya `:437`).

**Fuente de datos de una edición cerrada** (mapeo `MonthlySummaryHistory`):
- Hero total ← `total_variable_spent`; chip ← `expenses_count`; top-3 ← `category_breakdown` (calce exacto con `HeroCategory`, feasibility §1); calendario intensidad ← `daily_totals[]{day,total}`.

**GAP DURO (bloqueante de diseño):** los expenses de ciclos cerrados se **hard-deletean a los 14 días** (`20260620210000_fixed_payment_expenses_retention.sql`, `close_monthly_cycle` archiva en `20260424040000_monthly_rollup.sql:350`). Consecuencias (los 3 informes coinciden):
- Hero + top-categorías + calendario-por-total: **SÍ** (agregados persisten).
- Movimientos por día + day-detail interactivo + filtro de categoría: **NO reconstruibles** → **ocultar/desactivar en modo cerrado** (real-screen §6a, feasibility §1-GAP-crítico, kit-contract §1C).
- Mood/exceso por día en cerrados: `daily_totals` no guarda mood ni el cupo histórico → el calendario cerrado pinta **intensidad por total**, sin umbral over/under fiel (kit-contract §1C, gaps b1-iv).
- **Verificar** formato de `daily_totals[].day` (`YYYY-MM-DD` vs day-of-month) antes de pintar la grilla — `dailyTotalsToList` descarta `day` hoy (real-screen §6a).

→ **Decisión owner (§Decisiones-1):** modo cerrado degradado a "resumen de la edición" (recomendado, cero backend) vs. retención/archivo de expenses (alto esfuerzo, revierte decisión anti-pérdida-de-datos vigente).

**Nota:** ciclos pasados **bypassean** `gastos_snapshot` (query directa, no cold-start) (gaps b1-v).

**Validación:** dropdown lista ediciones reales con sobrante firmado; seleccionar cerrada → hero "TOTAL DE LA EDICIÓN" + top-cats + calendario intensidad; CTAs de edición ocultos (`showCtas` false); filtro/day-detail/movimientos-feed desactivados; "Volver al actual" resetea.

---

## FASE F5 — Banner vencido + días fuera + confirm cobro (riesgo: alto — cross-screen + RLS)

**Alcance:** estado `venc` (ciclo terminó, cobro sin confirmar): banner + celdas "fuera de ciclo" + CTA confirmar. Concepto **nuevo en Gastos** (hoy vive solo en Home).

**Contratos a evolucionar:**
- `GastosOverdueBanner` (`:764`): copy hardcodeado "terminó el 19 · 2 días" → derivar de `cycleEnd` + `(today − cycleEnd)`. `showAlert` ← `isSalaryPendingConfirmation` (usePayCycle) / `isCycleStartingBalancePromptPending` (family-dashboard-model.ts:223).
- `onConfirm` → **reusar `useCycleConfirmation`** (features/home, ya importado en neo-home `:441`), **NO inventar confirm en Gastos** (todos los informes coinciden: real-screen §7, kit-contract §1E, gaps b4). **GOTCHA RLS owner-only:** `family_finance` upsert es owner-only → **gatear por rol** (`useMyFamilyRole`); no-owner rutea a Home. **Decisión owner (§Decisiones-3):** abrir `CycleBalanceSheet` (como home) vs. silent-confirm (`balance=null`).
- Días "fuera de ciclo" (`kind:'fuera'`, hardcode 2 celdas `:377`): el RPC de calendario solo genera filas dentro de `[cycle_start, cycle_end)` hasta `today` → **no incluye post-cycle-end**. El dato existe pero solo como sonda (`hasRecentExpensesOutsideCycle`, gastos-v2-screen.tsx:261, limit 3). Para pintar 0..N celdas fuera hace falta **query real** de gastos en `(cycleEnd, today]` (fecha+total+count) → esfuerzo medio, solo en `venc` (feasibility §2-gap, gaps b3).
- Empty variant `pending-confirm` (gaps a7): en `venc` → banner + celdas fuera (reemplaza el navigate-to-home de la vieja).

**Backend nuevo (opcional, mínimo):** si se quiere pintar días fuera con precisión, extender `gastos_snapshot` o un query dedicado de gastos post-cierre. **GOTCHA** `home_snapshot`/`gastos_snapshot`: campos nuevos deben ir en la RPC o "se pierden" al refrescar (memoria `feedback_family_finance_column_needs_home_snapshot_rpc`, gaps c5).

**Validación:** con ciclo congelado, banner muestra fecha/días reales; confirmar abre el flujo de home y desbloquea; no-owner no puede confirmar; celdas fuera pintan los gastos post-cierre.

---

## FASE F6 — Tour, telemetría, realtime, error/skeleton + swap live (riesgo: gated por aprobación)

**Alcance:** paridad de infraestructura + swap de ruta (post-aprobación owner).

- **Tour:** re-anclar `TourTarget` de `GASTOS_TOUR` sobre los sub-componentes neo (header/hero/calendar/filter/list), patrón `NeoTourStep`/`useRegisterTourScrollView` gateado `!preview` (neo-home-screen.tsx:299-332, gaps a11). El kit no tiene tour targets → re-anclar.
- **Telemetría:** `useGastosTelemetry` + `trackTap` con los `elementId`/slots existentes, gateado preview (gaps a13).
- **Realtime:** `useGastosRealtime(preview ? undefined : familyId)` (gaps a12/c6).
- **Error duro** (`controller.error` sin data → `ErrorState` retry) + **skeleton** (`GastosScreenSkeleton` mientras snapshot resuelve) (gaps a9/a10).
- **RiseView del kit ungated** (dropdown `:686`, banner `:773`, calendar `:1088`, etc.) re-firean en cold tab-attach → portar `useGatedLayout` (gaps c2, gap de perf real).
- **Deep-link `categoryId`** (`useLocalSearchParams` → `initialCategoryId`, gaps a16).
- **SWAP:** post-`'gastos'→'aprobada'`, editar `expenses-screen.tsx:14`. Ruta dev de preview permanece.

**Validación:** correr suite de tests (memoria `feedback_run_tests_on_copy_changes`); `npx expo export --platform ios` con deps nuevas (memoria `feedback_validate_is_not_bundle`); QA en gama baja (jank); verificar tab-bar clearance (`insets.bottom + 96`, gaps c9).

---

## Lógica nueva — resumen ejecutivo

**(a) Ciclos pasados (F4):** viable sin migración para hero/calendario/dropdown vía `useMonthlyEditions` (`monthly_summaries`, ya cacheado). **Blocker real = lista de movimientos individuales de ciclos cerrados: NO persiste** (hard-delete 14 días) → decisión owner: degradar a agregados (recomendado). Inyección técnica = parametrizar `usePayCycle` en controller `:94` con `cycleOverride`; las 5 RPCs son ventana-pura (sirven cualquier ciclo <14 días, pero inconsistente → usar agregados).

**(b) Días de exceso (F1):** **YA calculado server-side**, cero backend. `gastos_calendar_summary` computa `mood` vs `cupoDiario` canónico (`20260505000000:191-196`). Mapear `amber|red → bad`. Único trabajo opcional: celdas "fuera de ciclo" (F5, derivar de gastos post-cierre, esfuerzo medio).

---

## GAPS — decisión de acople por cada uno

| Gap | Decisión de acople |
|---|---|
| Ingresos intercalados (verde/+) | **Adaptar UI:** extender `MovRowVM` con `kind` (F2). Mantener lógica de `buildGastosSections`. |
| Swipe-to-delete | **Mantener lógica invisible:** envolver fila del kit en `SwipeRow` + mutaciones existentes (F2). |
| Paginación/SectionList | **Adaptar arquitectura:** kit-visual como `renderItem` de SectionList (F2). Mayor esfuerzo. |
| Advisor chip | **Owner decide:** acoplar chip neumórfico o **drop** (no está en el mock, gaps a4). Recomendado: drop en v1, flag. |
| Filtro por índice vs id | **Mantener lógica:** capa de mapeo índice↔category_id (F1). |
| Hero day-scoped | **Owner decide:** hero cycle-level (mock) es defendible porque el day-detail ya muestra GASTADO/MOVIMIENTOS (gaps a6). Recomendado: cycle-level. |
| 4 empty-states | **Adaptar UI:** cablear filtered/global (F2), pending-confirm (F5). |
| "Revertir marca" no-spend | **Adaptar contrato:** extender `GastosDayDetail` con `onUnmarkNoSpend`+`hasNoSpendMark` (F3). |
| Barras 7-días (hero sin prop) | **Adaptar contrato:** extender `GastosHero` con `recentDailyBars` (F1). |
| `amber` (2 vs 3 estados) | **Owner decide** (§Decisiones-2). |
| Grilla hardcodeada (día 20/30/offset 5) | **Mantener lógica:** derivar de `cycleStart`+`firstWeekdayOffset` (F1). |
| Chrome dibujado del kit | **Retirar:** `<Screen>`+insets+tab bar real (F0/F6). Cubierto por patrón. |
| `sprout` atado a `n===28`/`ok` | **Corregir:** atar a `noSpendMarkedDates` Set (F1). |
| `paid_in_arrears` | **Owner decide:** indicador o drop (gaps a15). Recomendado: drop v1. |
| Swatches de color demo | **Cubierto por kit:** `category.color` real, contrato ya acepta (F1). |
| Montos como strings | **Trivial:** `formatMoney`/`formatMoneyShort` (todas las fases). |

---

## Decisiones de owner (bloquean fases)

1. **(F4) Ciclos cerrados — movimientos.** Degradar a agregados (`top_expense`+breakdown+sparkline de `daily_totals`), sin day-detail/filtro/feed. **Recomendado** (cero backend). Alternativa = retención de expenses (alto esfuerzo, revierte anti-pérdida-de-datos).
2. **(F1) Exceso 2 vs 3 estados.** El kit tiene `ok/bad`; el backend `green/amber/red`. **Recomendado: `amber|red → bad`** — matchea la definición del feature ("días donde el gasto superó el cupo diario"; amber ya es `> cupo`). Alternativa (kit-contract/gaps): `amber→ok, red→bad` (preserva la calma, pierde exceso leve). Conflicto entre informes → owner define.
3. **(F5) Confirm-cobro en Gastos.** Reusar `useCycleConfirmation`; abrir `CycleBalanceSheet` (paridad home) vs. silent-confirm. Gate owner-only obligatorio.

---

## Riesgos / gotchas transversales

- **queryKey del cupo (load-bearing):** `cupoDiario` debe derivarse del mismo `usePayCycle`/`useFamilyDashboard` que snapshot+warm o hay cache-miss y drift de mood (controller `:134`, memoria `feedback_daily_budget_canonical_source`, gaps c4).
- **freezeOnBlur:false** — no tocar `(tabs)/_layout.tsx`; el swipe RNGH lo necesita (gaps c1).
- **timestamptz mediodía local** en mark/register/back-date (gaps c3).
- **Preview colisiona con la vieja live** — realtime/telemetría/tour `undefined`/gateados (patrón neo-home `:372/447/732`, gaps c6).
- **boxShadow Android <API29** — ya resuelto (minSdk 29); el neumorfismo depende de eso, no re-introducir fallback (gaps c7, memoria `feedback_rn_boxshadow_android_api_gate`).
- **RiseView ungated del kit** re-firea en cold attach (gaps c2) — portar `useGatedLayout`.
- **Reanimated:** verificar imports de `useReducedMotion` (el kit usa `@/hooks/use-reduced-motion`, correcto); partículas Skia del hero (`CardParticles`) gatear en gama baja (gaps c10).
- **`snapshot.data` gate de MONTAJE, no de render** — los hooks de datos van en el inner (evita ~5 fetches duplicados, gaps c4).
- **RLS owner-only** en confirm (F5) — gatear por rol.
- **Post-cambio:** correr suite de tests + `expo export` con deps nuevas (memorias `feedback_run_tests_on_copy_changes`, `feedback_validate_is_not_bundle`).

**Archivos a crear:** `mobile/screens/home/neo/neo-gastos-screen.tsx`, `app/(app)/settings/dev/neo-gastos.tsx`. **Swap final (F6, post-aprobación):** `mobile/screens/home/expenses-screen.tsx:14`.
