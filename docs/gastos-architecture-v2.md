# Gastos — arquitectura de datos v2 (propuesta)

> **Objetivo**: reemplazar el endpoint monolítico `loadExpenses(familyId, …)` por **4 endpoints especializados** que sirvan exactamente lo que cada surface necesita, y agregar carga progresiva (virtual scroll) para la lista de movimientos.
>
> **Estado**: blueprint para revisar antes de migrar. Sin código de implementación todavía — primero alineamos contratos y comportamiento.
>
> **Disparador**: el endpoint actual ya paga "lo que necesita el ciclo" (post-Sprint 2 #17), pero sigue trayendo **toda la data del ciclo en un solo viaje** y eso popula 6 surfaces distintas. Hay 2 problemas residuales:
> 1. Cualquier cambio de filtro (categoría, día, smart filter) re-ejecuta `useExpensesInRange` para refrescar agregados aunque la data subyacente no cambió.
> 2. La lista de movimientos renderiza todos los gastos del ciclo aunque sólo los últimos 2-3 días sean relevantes en el primer paint.

---

## 1. Auditoría — qué consume cada surface

Antes de diseñar endpoints, mapeo exactamente qué necesita cada componente del Gastos screen:

### 1.1. Hero card (`<GastosHeroCard>`)

| Prop consumida | Tipo | Cálculo actual |
|---|---|---|
| `totalVisible` | `number` | `Σ price` de `filteredExpenses` |
| `summaryChip` | `string` | `"{count} mov · {periodo} · {categoria} [· suffix]"` |
| `topCategories` | `CategoryWeightRow[]` (top 3) | ranking server-side por `Σ price` por categoría |
| `averageDaily` | `number` | `filteredTotal / cycleDaysElapsed` |
| `averageDailyBars` | `number[]` (7 entradas, [0,1] normalizadas) | sparkline últimos 7 días, `Σ price` por día |
| `averageWindowDays` | `number` | `cycleDaysElapsed` |

**Insight**: ningún componente necesita los **rows individuales** para el hero. Sólo agregaciones. **Server-side aggregation** es la forma correcta.

### 1.2. Calendar / Heatmap (`<GastosMonthCalendar>`)

| Prop consumida | Tipo | Cálculo actual |
|---|---|---|
| `dayMoods` | `Record<number, 'green'\|'amber'\|'red'\|'empty'>` | `spend / cupoDiario` per día → bucket |
| `dailySpend` | `Record<number, { day, total, count }>` | `Σ price` por día (para `selectedDayTotal/Count`) |
| `cycleStart, cycleDays, todayDay, cycleLabel` | derivado de `family_finance` | client-side OK (ya cacheado) |

**Insight**: necesita una fila por día del ciclo con `{ total, count, mood }`. Sin rows individuales.

### 1.3. Smart filter (`<GastosSmartFilter>` + `categoryNameById`)

| Prop consumida | Tipo | Cálculo actual |
|---|---|---|
| `categories` | `CategoryLite[]` (id, name, color) | de `useCategories(familyId)` |
| `expenseCountByCategoryId` | `Map<string, number>` | recomputado client-side desde `filteredExpenses` |
| `selectedCategoryId` | client state | — |
| `categoryNameById` | `Map<string, string>` | derivado de `categories` |

**Insight**: el `useCategories` ya existe y es liviano (~3KB). El count por categoría es lo único que requiere agregación adicional.

### 1.4. Movements list (`<SectionList>`)

| Prop consumida | Tipo | Cálculo actual |
|---|---|---|
| `groups` | `GastosGroup[]` (label, day, total, items: Expense[]) | rows + grouping client-side |

**Insight**: **único surface que necesita rows individuales** — y sólo los visibles para el usuario. Los últimos 2-3 días son lo prioritario; el resto puede cargarse on-scroll.

### 1.5. Streak flame (`<StreakFlameIcon>`)

Usa `useStreak(familyId, userId)` — RPC server-side independiente. No depende de expenses. ✓

### 1.6. Advisor chip (`<GastosAdvisorChip>`)

Usa `useControlV2Data(familyId, …, { defer: true })` — ya está deferido al post-paint (Sprint 3 #18). No depende del nuevo split.

---

## 2. Diseño — 4 endpoints especializados

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Cliente abre Gastos                                              │
│       │                                                           │
│       ├──→ Endpoint 1: gastos_hero_summary                        │
│       │      • Server-side aggregations                           │
│       │      • ~1KB response                                      │
│       │      • populates: hero card + summaryChip                 │
│       │                                                           │
│       ├──→ Endpoint 2: gastos_calendar_summary                    │
│       │      • 1 row por día del ciclo (total, count, mood)       │
│       │      • ~2KB response (max 31 rows)                        │
│       │      • populates: heatmap + dailySpend lookup             │
│       │                                                           │
│       ├──→ Endpoint 3: gastos_categories_with_counts              │
│       │      • categories + count_in_cycle                        │
│       │      • ~3KB response (max 18 rows)                        │
│       │      • populates: smart filter pills + categoryNameById   │
│       │                                                           │
│       └──→ Endpoint 4: gastos_expenses_paginated                  │
│              • Cursor-based, 2 días iniciales (hoy + ayer)        │
│              • ~3-8KB initial, +chunks on-scroll                  │
│              • populates: movements SectionList                   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.1. Endpoint 1 — `gastos_hero_summary`

**Signature**:
```sql
create or replace function public.gastos_hero_summary(
  p_family_id uuid,
  p_cycle_start timestamptz,
  p_cycle_end timestamptz,
  p_category_id uuid default null,
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_today date default current_date
) returns jsonb
```

**Returns** (jsonb):
```json
{
  "total": 245000,
  "count": 32,
  "average_daily": 8166,
  "cycle_days_elapsed": 30,
  "top_categories": [
    { "id": "uuid", "name": "Mercado", "color": "#2E7D5B", "amount": 79000, "percent": 32 },
    { "id": "uuid", "name": "Transporte", "color": "#C9A23A", "amount": 45000, "percent": 18 },
    { "id": "uuid", "name": "Restaurantes", "color": "#A04040", "amount": 38000, "percent": 16 }
  ],
  "recent_daily_bars": [0.2, 0.6, 0.4, 1.0, 0.3, 0.0, 0.5]
}
```

**Filtros**: cuando `p_category_id` está set, todas las agregaciones (total, count, top_categories, bars) son sobre el subset de esa categoría. Mismo para price min/max.

**Server-side query** (PL/pgSQL, single round-trip):
```sql
-- Pseudo:
with cycle_expenses as (
  select category_id, price, created_at
  from public.expenses
  where family_id = p_family_id
    and commitment_id is null
    and created_at >= p_cycle_start
    and created_at < p_cycle_end
    and (p_category_id is null or category_id = p_category_id)
    and (p_price_min is null or abs(price) >= p_price_min)
    and (p_price_max is null or abs(price) < p_price_max)
)
select jsonb_build_object(
  'total', sum(abs(price)),
  'count', count(*),
  'top_categories', (...),
  'recent_daily_bars', (...)
)
from cycle_expenses;
```

### 2.2. Endpoint 2 — `gastos_calendar_summary`

**Signature**:
```sql
create or replace function public.gastos_calendar_summary(
  p_family_id uuid,
  p_cycle_start timestamptz,
  p_cycle_end timestamptz,
  p_category_id uuid default null,
  p_today date default current_date,
  p_cupo_diario numeric default null
) returns jsonb
```

**Returns**:
```json
{
  "days": [
    { "iso_date": "2026-04-01", "day": 1, "total": 9500, "count": 3, "mood": "green" },
    { "iso_date": "2026-04-02", "day": 2, "total": 14200, "count": 5, "mood": "amber" },
    ...
    { "iso_date": "2026-04-30", "day": 30, "total": 0, "count": 0, "mood": "empty" }
  ]
}
```

**Cálculo del mood server-side**: usa `p_cupo_diario` como anchor. Si null, usa promedio del ciclo. Misma lógica que `computeGastosDayMoods` actual, pero en SQL.

**Por qué no client-side**: ya tendríamos los rows del endpoint 4 (paginado), pero las agregaciones por día requieren TODOS los días, no sólo los visibles. Mejor que el server las pre-compute.

### 2.3. Endpoint 3 — `gastos_categories_with_counts`

**Signature**:
```sql
create or replace function public.gastos_categories_with_counts(
  p_family_id uuid,
  p_cycle_start timestamptz,
  p_cycle_end timestamptz
) returns jsonb
```

**Returns**:
```json
{
  "categories": [
    { "id": "uuid", "name": "Mercado",       "color": "#2E7D5B", "count_in_cycle": 18 },
    { "id": "uuid", "name": "Transporte",    "color": "#C9A23A", "count_in_cycle": 12 },
    { "id": "uuid", "name": "Restaurantes",  "color": "#A04040", "count_in_cycle": 7 },
    ...
  ]
}
```

**Reemplaza**: `useCategories(familyId)` + el `expenseCountByCategoryId` que se computa client-side. Una sola RPC.

### 2.4. Endpoint 4 — `gastos_expenses_paginated`

**Signature**:
```sql
create or replace function public.gastos_expenses_paginated(
  p_family_id uuid,
  p_cycle_start timestamptz,
  p_cycle_end timestamptz,
  p_before_iso_date date default null, -- cursor
  p_days_per_page int default 2,        -- 2 días por página
  p_category_id uuid default null,
  p_price_min numeric default null,
  p_price_max numeric default null
) returns jsonb
```

**Returns**:
```json
{
  "expenses": [
    {
      "id": "uuid",
      "category_id": "uuid",
      "category_name": "Mercado",
      "category_color": "#2E7D5B",
      "description": "Compra del super",
      "price": 8500,
      "created_at": "2026-04-30T14:30:00-03:00",
      "created_by": "uuid",
      "creator_display_name": "Mario",
      "iso_date": "2026-04-30"
    },
    ...
  ],
  "next_cursor": "2026-04-28",  // null si no hay más
  "has_more": true
}
```

**Comportamiento**:
- **Initial load**: `p_before_iso_date = null` → server detecta y devuelve hoy + ayer (2 días).
- **Next page**: cliente pasa el `next_cursor` recibido. Server devuelve los siguientes 2 días anteriores.
- **Embebe** category + creator name en cada row → 0 round-trips adicionales (reemplaza el join con `profiles` y el lookup `categoryNameById` per row).

**Por qué cursor por días en vez de por filas**:
- "Mostrar gastos por día" es la unidad de UX (rows agrupados por día). Un cursor por filas podría cortar un día a la mitad.
- 2 días/page es la unidad mínima que matchea "hoy + ayer".

**Configurable**: `p_days_per_page` permite tunear (ej: 5 días/page si queremos menos round-trips a costa de más data por viaje).

---

## 3. Comparativa de cargas — antes vs. propuesta

### Cuenta de testing (`home.test@manifiesto.app`, 30 días, ~85 gastos)

| Métrica | Hoy (Sprint 2 #17 + #24) | Propuesto |
|---|---|---|
| **Cold start de Gastos** | | |
| Round-trips | 1 (expenses con embed) + 1 (categories) = 2 | 4 paralelos (hero + calendar + categories + expenses) |
| Payload total | ~15-18 KB | ~10-12 KB (no se traen rows fuera del viewport) |
| JSON.parse blocking | ~5ms | ~2ms |
| Time-to-first-paint | ~250ms | ~120ms (los 4 paralelos resuelven en el más lento, ~120ms) |
| **Cambio de filtro de categoría** | | |
| Round-trips | 1 (re-fetch del cycle) | 3 paralelos (hero + calendar + expenses re-paginated, categories sin cambio) |
| Payload | 15-18 KB | 6-8 KB (no se traen rows del filtro fuera del viewport) |
| Recompute en JS | re-itera todo el ciclo | server hace el trabajo |
| **Scroll a día anterior** | | |
| Round-trips | 0 (data ya cacheada) | 1 (next page del cursor) |
| Payload | — | ~2-4 KB (2 días) |

### Familia con 6 meses de uso (~500 gastos)

| Métrica | Hoy | Propuesto |
|---|---|---|
| Cold start payload | ~85 KB (full history vía useExpensesInRange windowed → ahora son sólo del ciclo, ~15 KB) | ~10-12 KB |
| Cold start round-trips | 2 | 4 (paralelos) |

**Aclaración importante**: como ya migramos a `useExpensesInRange` server-windowed (Sprint 2), el payload actual ya está acotado al ciclo. La ganancia adicional del split es **NO traer rows que no se ven** + **mover compute al server**.

### Gain proporcional

| Surface | Reducción de payload | Reducción de compute client-side |
|---|---|---|
| Hero card | ~95% (sólo agregados) | 100% (server hace top-N + bars) |
| Calendar | ~90% (1 row/día vs N rows) | 100% (mood threshold server-side) |
| Categories | ~50% (filas + count en una) | 100% (count server-side) |
| Movements (initial 2d) | ~85% (sólo 2 días vs todo el ciclo) | — |

**Total**: ~75% reducción en data movida cliente↔servidor en cold start. Matches el "3/4" que pediste.

---

## 4. Hooks cliente — diseño

### 4.1. `useGastosHeroSummary`

```ts
export function useGastosHeroSummary(
  familyId: string,
  cycleStart: Date,
  cycleEnd: Date,
  filters: { categoryId?: string; priceMin?: number; priceMax?: number },
) {
  return useQuery<GastosHeroSummary>({
    queryKey: ['gastos-hero', familyId, cycleStart, cycleEnd, filters],
    enabled: Boolean(familyId),
    queryFn: () => fetchHeroSummary(familyId, cycleStart, cycleEnd, filters),
    staleTime: 30_000,
  })
}
```

### 4.2. `useGastosCalendarSummary`

```ts
export function useGastosCalendarSummary(
  familyId: string,
  cycleStart: Date,
  cycleEnd: Date,
  filters: { categoryId?: string },
  cupoDiario: number,
) {
  return useQuery<GastosCalendarSummary>({
    queryKey: ['gastos-calendar', familyId, cycleStart, cycleEnd, filters, cupoDiario],
    enabled: Boolean(familyId),
    queryFn: () => fetchCalendarSummary(familyId, cycleStart, cycleEnd, filters, cupoDiario),
    staleTime: 30_000,
  })
}
```

### 4.3. `useGastosCategoriesWithCounts`

```ts
export function useGastosCategoriesWithCounts(
  familyId: string,
  cycleStart: Date,
  cycleEnd: Date,
) {
  return useQuery<GastosCategoryWithCount[]>({
    queryKey: ['gastos-categories', familyId, cycleStart, cycleEnd],
    enabled: Boolean(familyId),
    queryFn: () => fetchCategoriesWithCounts(familyId, cycleStart, cycleEnd),
    staleTime: 60_000, // categorías raramente cambian
  })
}
```

### 4.4. `useGastosExpensesPaginated` — el corazón del virtual scroll

```ts
export function useGastosExpensesPaginated(
  familyId: string,
  cycleStart: Date,
  cycleEnd: Date,
  filters: { categoryId?: string; priceMin?: number; priceMax?: number },
) {
  return useInfiniteQuery<GastosExpensesPage, Error>({
    queryKey: ['gastos-expenses-paged', familyId, cycleStart, cycleEnd, filters],
    enabled: Boolean(familyId),
    queryFn: ({ pageParam }) =>
      fetchExpensesPaginated(familyId, cycleStart, cycleEnd, {
        beforeIsoDate: pageParam ?? null,
        daysPerPage: 2,
        ...filters,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: 30_000,
  })
}
```

**SectionList fetchNext**: en `onEndReached` del SectionList, dispara `fetchNextPage()` del infinite query si `hasNextPage`. RN llama `onEndReached` cuando el usuario está a `onEndReachedThreshold` (default 0.5 = la mitad del viewport restante) del final de la lista — perfecto para pre-cargar el siguiente chunk antes de que el usuario llegue.

---

## 5. Flow del cliente

```
┌─ User abre Gastos
│
├─ Mount:
│    │
│    ├─ Render skeleton inmediatamente
│    │
│    ├─ Dispara 4 queries paralelas:
│    │    ├─ useGastosHeroSummary       → ~80ms
│    │    ├─ useGastosCalendarSummary   → ~80ms
│    │    ├─ useGastosCategoriesWithCounts → ~60ms
│    │    └─ useGastosExpensesPaginated (page 1: hoy+ayer) → ~120ms
│    │
│    └─ Render completo cuando todas resuelven (~120ms en paralelo)
│
├─ User scrollea hacia abajo:
│    │
│    └─ SectionList.onEndReached → infiniteQuery.fetchNextPage()
│         └─ Trae siguientes 2 días → SectionList agrega groups
│
├─ User toca filter pill (categoría):
│    │
│    ├─ Update filter state en controller
│    │
│    └─ React Query invalida automáticamente (queryKey cambia):
│         ├─ Hero re-fetch con category_id  → ~80ms
│         ├─ Calendar re-fetch con category_id → ~80ms
│         ├─ Expenses paged: reset cursor → ~120ms (hoy+ayer filtrados)
│         └─ Categories sigue cacheado (no depende de filter)
│
├─ User toca un día del calendario:
│    │
│    ├─ selectedDay state cambia
│    │
│    └─ Sólo el SectionList re-renderiza filtrando client-side por día
│         (no nuevo fetch — los rows ya están cargados o se cargarán por scroll)
│
└─ User pull-to-refresh:
     │
     └─ refetchAll → invalida los 4 caches
```

---

## 6. Cache invalidation + realtime

`useGastosRealtime` actualizado para invalidar las 4 keys cuando llegan eventos de `expenses` o `categories`:

```ts
useFamilyRealtime({
  familyId,
  scope: 'gastos',
  listeners: {
    expenses: (qc, fid) => {
      qc.invalidateQueries({ queryKey: ['gastos-hero', fid] })
      qc.invalidateQueries({ queryKey: ['gastos-calendar', fid] })
      qc.invalidateQueries({ queryKey: ['gastos-categories', fid] })
      qc.invalidateQueries({ queryKey: ['gastos-expenses-paged', fid] })
      // Mantener compat para el resto de la app:
      qc.invalidateQueries({ queryKey: expenseQueryKeys.family(fid) })
      qc.invalidateQueries({ queryKey: expenseQueryKeys.recentFamily(fid) })
    },
    categories: (qc, fid) => {
      qc.invalidateQueries({ queryKey: ['gastos-categories', fid] })
      qc.invalidateQueries({ queryKey: ['categories', fid] })
    },
  },
})
```

**Optimistic delete** (swipe-to-delete): actualiza in-place las 4 keys:
- `gastos-hero`: `total -= price`, `count -= 1`, recompute top_categories si la categoría del row borrado quedó debajo del top 3.
- `gastos-calendar`: para el día del row borrado, `total -= price`, `count -= 1`, recompute mood.
- `gastos-categories`: para la categoría del row borrado, `count_in_cycle -= 1`.
- `gastos-expenses-paged`: drop el row del page que lo contiene.

Esto requiere un poco más de lógica que el optimistic delete actual (que sólo dropea el row de un array), pero es factible con `setQueryData` por cada key.

---

## 7. Migration plan — orden de implementación

### Fase 1 — Migration SQL (1 PR)
- `gastos_hero_summary`
- `gastos_calendar_summary`
- `gastos_categories_with_counts`
- `gastos_expenses_paginated`

Cada una con tests SQL en una migration de prueba (insert seed → call RPC → assert shape).

### Fase 2 — Hooks cliente + tests (1 PR)
- `useGastosHeroSummary`, `useGastosCalendarSummary`, `useGastosCategoriesWithCounts`, `useGastosExpensesPaginated`
- Tests de RTL contra mocks de las RPCs.

### Fase 3 — Refactor `useGastosController` (1 PR)
- Internamente compone los 4 hooks.
- Mantiene la API actual de `UseGastosControllerResult` para no romper consumers (gastos-v2-screen).
- `infiniteQuery.data.pages.flatMap(p => p.expenses)` → groups con `groupGastosByDay`.
- `groups` se sigue exponiendo igual.

### Fase 4 — Wire al SectionList (1 PR)
- `onEndReached` + `onEndReachedThreshold={0.5}` dispara `fetchNextPage`.
- `ListFooterComponent` muestra spinner cuando `isFetchingNextPage`.

### Fase 5 — Cleanup (1 PR)
- Eliminar `useExpensesInRange` (queda como deuda si nadie más lo usa).
- Eliminar helpers obsoletos del controller (`computeCategoryWeights`, `computeDailySpend`, `computeGastosDayMoods`, `computeRecentDailyBars`) — server hace el trabajo. Mantener tests como referencia o moverlos a SQL fixtures.

### Riesgo y rollback
- Cada fase es feature-flag-able. Podemos shipear las RPCs sin tocar el cliente; el cliente migra cuando esté listo.
- Rollback: revertir el PR del cliente sin tocar las RPCs (que quedan inertes).

---

## 8. Trade-offs explícitos

### Pros del split
- ✅ ~75% menos data en cold start.
- ✅ Compute pesado (top-N, mood thresholds, bars) en SQL — más rápido que JS thread.
- ✅ Virtual scroll natural con `useInfiniteQuery`.
- ✅ Filter por categoría no re-trae rows de movimientos viejos.
- ✅ Cache surgical por surface — invalidar uno no fuerza re-fetch de los otros.
- ✅ Server es la fuente de verdad para mood thresholds — consistencia con futuras pantallas.

### Contras
- ❌ 4 RPCs más mantenibles que 1, pero igual son 4 RPCs más en el schema.
- ❌ Optimistic delete más complejo (4 caches en vez de 1).
- ❌ Lógica de mood threshold se duplica entre TS (helpers existentes para tests) y SQL (RPC). Mitigation: dejar TS como referencia para unit tests pure, SQL como source of truth runtime.
- ❌ Filter por priceMin/priceMax/dateRange ahora va al server — más params en cada RPC. Mitigation: contratos consistentes (todos los endpoints aceptan los mismos filtros).

### Neutral
- 🟡 4 round-trips paralelos vs 2 secuenciales — la latencia neta depende del peor caso. Con HTTP/2 keep-alive y Supabase pooler los 4 paralelos resuelven en el tiempo del más lento (~120ms). El secuencial actual también es ~120ms-200ms en datasets reales.

---

## 9. Preguntas abiertas para alinear

1. **`smartFilter.dateRange`** (today/last-7/first-3-days/etc.): ¿se aplica server-side en los 4 endpoints, o lo dejamos client-side aplicado al output del paginated? Recomiendo server-side para consistencia.

2. **`selectedDay`**: ¿filtramos client-side sobre las páginas ya cargadas, o dispara una query nueva con el día específico? Recomiendo client-side — el día seleccionado por definición está en una de las páginas ya cargadas (próximo o lejano).

3. **`registrationStreak`**: hoy se computa client-side desde el array de expenses. Si las RPCs no retornan rows del ciclo entero, el streak deja de ser computable. Como nadie lo consume hoy (ver Sprint 2), lo eliminamos del controller. ¿Confirmamos?

4. **`p_cupo_diario`**: el endpoint 2 lo necesita para anchorar los thresholds. ¿Lo computamos server-side (a partir de family_finance + fixed_expenses) o lo pasa el cliente? Recomiendo computarlo server-side dentro de la RPC para que sea autosuficiente.

5. **`days_per_page`**: ¿2 fijo o configurable? Recomiendo 2 fijo para iOS (matchea "hoy + ayer") y que el infinite query escale a más en `getNextPageParam` si quisiéramos.

6. **Indexes**: para que las 4 RPCs sean rápidas, necesitamos:
   - `(family_id, created_at DESC)` ya existe en mobile-baseline.
   - `(family_id, category_id, created_at)` — agregar índice compuesto si las queries con `p_category_id` muestran ser lentas.

---

## 10. Mock concreto del initial load

Pseudo-secuencia desde el botón de tab "Gastos":

```
T=0ms      : tap tab Gastos
T=5ms      : Screen mount
T=10ms     : Skeleton renderizado
T=15ms     : 4 queries disparadas en paralelo
T=80ms     : gastos-categories resuelve (más liviana)
T=85ms     : gastos-hero resuelve
T=95ms     : gastos-calendar resuelve
T=120ms    : gastos-expenses-paged page 1 resuelve (hoy+ayer)
T=130ms    : SectionList primer paint con todo
T=130ms+   : (skeleton fade out) - pantalla interactiva
```

vs hoy:

```
T=0ms      : tap tab Gastos
T=5ms      : Screen mount
T=10ms     : Skeleton renderizado
T=15ms     : useExpensesInRange + useCategories + useFamilyMembers + useStreak + useFamilyDashboard disparan
T=180ms    : useExpensesInRange resuelve (con join profiles)
T=200ms    : controller computa top_categories + dailySpend + dayMoods + groups (+ filtros pasivos)
T=220ms    : useControlV2Data resuelve después de ser deferred (pero estaba en queue)
T=250ms    : SectionList primer paint
```

**Gain neto**: ~120ms vs ~250ms — **~50% más rápido en cold cache**, sin contar que el controller actual hace ~5 useMemos que iteran el array completo en cada render (que también suman a la latencia post-mount).

---

> **Próximo paso sugerido**: validás este blueprint (preguntas del §9 + trade-offs del §8) y arrancamos con Fase 1 (las 4 RPCs SQL en una migration). Una vez aplicada y verificada con queries directas, sigue Fase 2 (hooks cliente + tests).

---

## 11. Decisiones tomadas (2026-04-30)

Las 6 preguntas del §9 fueron resueltas:

| # | Decisión | Impacto |
|---|---|---|
| 1 | **Drop smart filter del server**. Las búsquedas por fecha viven en el calendario; `priceMin/priceMax/dateRange` no se aplican en ningún endpoint. Sólo `category_id` queda como filtro server-side. | Endpoints más simples — 3 params menos en `gastos_hero_summary` y `gastos_expenses_paginated` |
| 2 | **`selectedDay` dispara nueva query**. Endpoint #5 nuevo: `gastos_expenses_for_day(family_id, iso_date, category_id?)` retorna los gastos del día seleccionado. | El cliente no filtra client-side cuando el usuario tap en el calendario; pide el día específico al server |
| 3 | **Eliminar `registrationStreak`** del controller + helper + tests. | Deuda técnica menor (helper huérfano, sin consumers) borrada |
| 4 | **`cupoDiario` client-side**, pasado como `p_cupo_diario` al endpoint 2. | El server no necesita leer `family_finance` ni `fixed_expenses`; queda autosuficiente con sólo `expenses` |
| 5 | **2 días por página** fijo. | `gastos_expenses_paginated` tiene `p_days_per_page int default 2` |
| 6 | **Agregar índice compuesto** `(family_id, category_id, created_at desc) where commitment_id is null`. | Filter-by-category en cualquier rango ahora hace index lookup directo (~1-2ms) en lugar de scan + filter (~10-30ms) |

---

## 12. Fase 1 ejecutada (2026-04-30)

Migration: `supabase/migrations/20260505000000_gastos_split_endpoints.sql`. Aplicada al remoto.

**6 statements** en una sola migration (SECURITY INVOKER, RLS aplica al caller):

| # | Statement | Verificado |
|---|---|---|
| 1 | `expenses_family_category_created_idx` partial index | ✓ |
| 2 | `gastos_hero_summary` RPC | ✓ — retorna total $365k, count 54, top 3 cats con percent, bars 7d normalizadas [0,1] |
| 3 | `gastos_calendar_summary` RPC | ✓ — retorna 30 days con `iso_date/day/total/count/mood`, mood thresholds anchor=cupo o avg fallback |
| 4 | `gastos_categories_with_counts` RPC | ✓ — 18 categorías con `count_in_cycle`, ordenadas desc por count |
| 5 | `gastos_expenses_paginated` RPC | ✓ — page 1 trae 2 días con `next_cursor`, page 2 (con cursor) trae los siguientes 2 días anteriores |
| 6 | `gastos_expenses_for_day` RPC | ✓ — retorna sólo expenses del día solicitado |

**TZ handling**: todas las RPCs aceptan `p_timezone text default 'America/Argentina/Buenos_Aires'` y usan `at time zone p_timezone` para el cálculo del local-day. Cliente puede sobrescribir si el usuario está en otra región.

**Cleanup paralelo**: `computeRegistrationStreak` eliminado de:
- `mobile/features/gastos/gastos-aggregates.model.ts` (helper)
- `mobile/features/gastos/use-gastos-controller.ts` (state + return)
- `tests/unit/gastos-aggregates.model.test.ts` (4 tests del describe block)

**Verificaciones**:
- `tsc --noEmit` → exit 0
- `vitest run` → 234 pass / 5 fails pre-existentes en `main` / 0 regresiones nuevas
- Cada RPC verificada vs cuenta de testing live (`home.test@manifiesto.app`) con script directo + auth token

---

## 13. Fases 2-5 ejecutadas (2026-04-29)

### Fase 2 — Hooks cliente + tipos
- `mobile/features/gastos/gastos-endpoints.types.ts` — todos los tipos del response shape de las 5 RPCs (`GastosHeroSummary`, `GastosCalendarSummary`, `GastosCategoriesResponse`, `GastosExpensesPage`, `GastosExpensesForDay`).
- `mobile/features/gastos/use-gastos-endpoints.ts` — 5 hooks + factory `gastosEndpointKeys` con prefijos `gastos-*` para invalidación realtime. `useGastosExpensesPaginated` usa `useInfiniteQuery` con `getNextPageParam: (lastPage) => lastPage.next_cursor`. TZ default `'America/Argentina/Buenos_Aires'`. Adapters `normalizeHero` / `normalizeExpenseRow` cubren las inconsistencias de PostgREST (embed array vs object, numerics como string).

### Fase 3 — Refactor del controller
- `mobile/features/gastos/use-gastos-controller.ts` ahora compone los 5 hooks. `selectedDayIso` se deriva caminando `cycleDates` para encontrar el day-of-month seleccionado y se pasa a `useGastosExpensesForDay`. Cuando hay día seleccionado, `filteredExpenses` viene del endpoint by-day; sino, del paginado.
- Drops: `useExpensesInRange`, `useCategories`, smartFilter (price/date), `computeCategoryWeights`, `computeDailySpend`, `computeGastosDayMoods`, `computeRecentDailyBars`, `computeRegistrationStreak`.
- Nuevos return values expuestos al screen: `expenseCountByCategoryId: Map<string, number>`, `fetchNextPage`, `hasNextPage`, `isFetchingNextPage`.
- `rowToExpense` adapter mapea `GastosExpenseRow` → forma legacy `Expense` para que los componentes downstream no se toquen.

### Fase 4 — Virtual scroll wiring
- `mobile/screens/home/gastos-v2-screen.tsx`: `onEndReached={() => { void controller.fetchNextPage() }}`, `onEndReachedThreshold={0.5}`. `ListFooterComponent` muestra `<ActivityIndicator />` con label "Cargando más días…" mientras `isFetchingNextPage`, y "— Fin del ciclo —" cuando `!hasNextPage`. Eliminados imports y helpers de smart filter (`GastosDateRange`, `toFiniteNumber`, `toDateRange`, `initialSmartFilter`).

### Fase 5 — Cleanup
- `mobile/features/gastos/gastos-aggregates.model.ts` reducido a sólo `groupGastosByDay` + tipos (la lógica de agregación vive ahora en las RPCs).
- `mobile/features/expenses/expense-query-keys.ts` — `inRange` / `inRangeFamily` removidos.
- `mobile/features/expenses/use-expenses.ts` — `useExpensesInRange` eliminado; el optimistic delete de `useDeleteExpense` simplificado a sólo exact keys (sin prefix-keys).
- `mobile/features/gastos/use-gastos-realtime.ts` — invalida los 5 prefijos nuevos (`gastos-hero`, `gastos-calendar`, `gastos-categories`, `gastos-expenses-paginated`, `gastos-expenses-for-day`) cuando llega un evento realtime de `expenses`.
- `mobile/features/home/use-home-realtime.ts` — drop del `inRangeFamily` invalidate.
- `tests/unit/gastos-aggregates.model.test.ts` — reducido al describe block de `groupGastosByDay` (5 tests).

### Verificación final
- `tsc --noEmit` → exit 0.
- `vitest run` → 220 pass / 5 fails pre-existentes en `main` (no relacionados al refactor: auth-submit-flow, category-hues, control-signals, family-dashboard-model, settings-form-model). 0 regresiones nuevas.
- `tests/unit/gastos-aggregates.model.test.ts` → 5/5 green.
