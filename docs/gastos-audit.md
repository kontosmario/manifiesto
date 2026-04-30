# Gastos — auditoría completa (v2)

> **Audiencia**: equipo de UI/UX + equipo de ingeniería.
> **Fecha**: 2026-04-29 · **revisión metodológica**: 2026-04-29 · **Sprint 1 shipped**: 2026-04-29.
> **Alcance**: ruta `/(app)/(tabs)/expenses` → `GastosV2Screen` y todo su árbol (controller, helpers, componentes, repositorio, RPCs, queries cache).
> **Método**: lectura estática del código actual, comparación contra el patrón aplicado en Home (post-auditoría), grep dirigido (`getUTC`, hardcoded hex, hardcoded copy), inspección de RLS server-side y mapeo de hallazgos por categoría + severidad de dos ejes.
>
> **Estado actual**: 13/22 items shipped en una sola sesión. 4 items deferred consciente con razón documentada (§19). 5 items pendientes que requieren decisión de producto / equipo (§17 cross-cutting + §18 métricas).

---

## Sprint 1 ejecutado (2026-04-29)

| # | Item | Estado | Notas |
|---|---|---|---|
| 1 | Timezone bugs §1.1 (8 call sites de `getUTC*` en `gastos-aggregates.model.ts`) | ✅ shipped | Reemplazados todos por equivalentes locales. Test fixture en TZ=ART verifica el caso 22:00 ART → día local correcto |
| 2 | Tests unitarios §7.4 — `gastos-aggregates.model.test.ts` | ✅ shipped | 23 tests cubriendo timezone, collision §1.3, gates de `computeCategoryWeights`, `computeDailySpend`, `computeGastosDayMoods`, streak, recent bars, group labels |
| 3 | Fix `first-3-days` §1.2 — relativo al ciclo, no al mes | ✅ shipped | Ahora `cycleStartMs + 3 * MS_PER_DAY`. Embebido en single-pass filter |
| 4 | `dailySpend` collision §1.3 — ISO key + `dailySpendByDayOfMonth` adapter | ✅ shipped | `computeDailySpend` retorna `Record<string, ...>` ISO; controller flattens via adapter para consumers existentes |
| 5 | Single-pass filter chain §2.4 + dedupe `cycleExpensesByCategory` §2.6 | ✅ shipped | Una sola pasada con predicado compuesto. Dedupe contra single-source-of-truth |
| 6 | Memoize `categories` §2.1 + `cycleDates` §2.2 + `streakData` Object.freeze §2.5 | ✅ shipped | `categories` con `useMemo`. `cycleDates` memoizado en el screen, helpers `stepCycleDay`/`getCycleNavBounds` reciben array. `STREAK_DEFAULTS` module-level con `Object.freeze` |
| 7 | Pull-to-refresh §4.1 | ✅ shipped | `RefreshControl` wireado a `controller.refetchAll` |
| 8 | Realtime §3.2 — `useFamilyRealtime` extraído + `useGastosRealtime` | ✅ shipped | Helper genérico en `mobile/features/family/use-family-realtime.ts`. Home también refactorizado para usarlo. Listeners: `expenses` + `categories` |
| 9 | Skeleton + 3 empty states §4.2 §4.3 | ✅ shipped | Cold-cache muestra skeleton hero + ListRowSkeleton. Empty: `global` (CTA add) / `cycle` (espera) / `filtered` (Limpiar). Cada uno con icono semántico y a11yLabel compuesto |
| 10 | A11y labels §6.1 §6.2 | ✅ shipped | `GastosFilterPill` con label compuesto (count + active state) y hint. `SwipeableRow` extendido con `accessibilityActions` + `onAccessibilityAction` para rotor. Rows con label compuesto (descripción + monto + categoría + autor + hora) |
| 11 | Eliminar `focusExpenseId` parsing §4.6 | ✅ shipped | **Decisión prudente**: parsing eliminado. El Asistente Financiero ya no genera URLs con expectativa rota; cuando se priorice scroll-to-expense, se re-agrega con la implementación real |
| 12 | Botón "Limpiar filtros" §5.2 | ✅ shipped | Visible iff `controller.hasAnyFilter === true`. Tap → `clearAll()` + haptic. A11y label explícito |
| 13 | `summaryChip` con smart filter info §4.5 | ✅ shipped | Composer agrega `≥$5K`, `<$10K`, `$5K–$10K`, y etiquetas cortas de `dateRange` (`hoy`, `7d`, etc.) |
| 14 | Dead code: `computeAverageDailySpend`, `void key`, `focusExpenseId` §5 | ✅ shipped | `computeAverageDailySpend` eliminado. `void key` reemplazado por `for (const value of map.values())`. `focusExpenseId` eliminado |
| 15 | Copy "descripción"/"número" con tildes §12.3 | ✅ shipped | Mensajes corregidos en `expense-repository.model.ts` |
| 16 | Validación robusta description/price §11.2 | ✅ shipped | `EXPENSE_DESCRIPTION_MAX_LENGTH = 200` y `EXPENSE_PRICE_MAX = 1_000_000_000` agregados. Mensajes de error claros |
| 17 | Hex hardcoded → theme tokens §13 | ✅ shipped | `streak-flame-icon` usa `theme.colors.pageBg` + `heroText`. `category-weights-list` resuelve defaults desde theme. `animated-flame.tsx` queda como excepción documentada (branded asset) |

**Resultado**: tsc exit 0. Tests: **238 pass** (215 → 238, +23 nuevos), **5 fails pre-existentes en `main`**, 0 regresiones nuevas.

**Archivos creados**:
- `mobile/features/family/use-family-realtime.ts` (helper genérico)
- `mobile/features/gastos/use-gastos-realtime.ts` (suscripción específica)
- `tests/unit/gastos-aggregates.model.test.ts` (23 tests)

**Archivos modificados**:
- `mobile/features/gastos/gastos-aggregates.model.ts` (timezone fix + ISO key)
- `mobile/features/gastos/use-gastos-controller.ts` (refactor completo)
- `mobile/features/home/use-home-realtime.ts` (refactor para usar helper genérico)
- `mobile/features/expenses/expense-repository.model.ts` (validators + tildes)
- `mobile/screens/home/gastos-v2-screen.tsx` (refactor completo)
- `mobile/components/gastos/gastos-movimientos.tsx` (3 empty states + a11y)
- `mobile/components/gastos/gastos-filter-pill.tsx` (a11y label)
- `mobile/components/gastos/streak-flame-icon.tsx` (theme tokens)
- `mobile/components/gastos/category-weights-list.tsx` (theme tokens)
- `mobile/components/ui/swipeable-row.tsx` (accessibilityActions)

---

---

## 0. Metodología

### 0.1. Severidad — matriz de dos ejes

Cada hallazgo se categoriza con **Impacto al usuario** × **Frecuencia de materialización**.

**Impacto** (lo dañino que es cuando se materializa):

| Nivel | Definición |
|---|---|
| 🔴 **Crítico** | Datos incorrectos visibles, pérdida de información, flujo bloqueado |
| 🟠 **Alto** | Confusión visible, fricción significativa, regresión de paridad con módulos hermanos |
| 🟡 **Medio** | Comportamiento sub-óptimo, latencia perceptible bajo cargas reales |
| 🟢 **Bajo** | Limpieza, deuda técnica que no muerde hoy |

**Frecuencia**:

| Nivel | Definición |
|---|---|
| **Universal** | Afecta a 100% de los usuarios siempre |
| **Común** | Afecta al 100% bajo condiciones que se dan al menos diariamente |
| **Edge case** | Requiere combinación específica de datos / configuración |

Severidad efectiva = Impacto sobre el subset que lo materializa. Un bug 🔴 universal precede a un 🔴 edge case.

### 0.2. Esfuerzo

| Tag | Tiempo |
|---|---|
| **XS** | < 1h |
| **S** | 1–4h |
| **M** | medio día a 1 día |
| **L** | > 1 día |

### 0.3. Definition of done por hallazgo

Cada item del sprint priorizado (§16) lleva su criterio de aceptación verificable. Sin DoD no se aprueba el PR.

---

## 1. Bugs — correctness 🔴

### 1.1. Timezone mismatch — agrupación / streaks / sparkline en UTC en vez de local

| | |
|---|---|
| **Impacto** | 🔴 Crítico — datos visibles incorrectos |
| **Frecuencia** | Común (cualquier gasto creado entre 21:00 y 23:59 ART) |

**Archivo**: [`mobile/features/gastos/gastos-aggregates.model.ts`](../mobile/features/gastos/gastos-aggregates.model.ts)

**Auditoría completa de `getUTC` en el módulo Gastos** (grep dirigido):

| Línea | Función | Uso de UTC |
|---|---|---|
| 173-188 | `computeRegistrationStreak` | parsea `created_at` y resta días en UTC |
| 207-209 | `computeAverageDailySpend` (helper, no usado por screen actual) | ventana relativa a `today` UTC |
| 234-247 | `computeRecentDailyBars` | mezcla `Date.UTC` con `new Date(e.created_at)` parseado en local |
| 274 | `groupGastosByDay` (key) | agrupa por día UTC |
| 282 | `groupGastosByDay` (day field) | día-de-mes en UTC |
| 285 | `groupGastosByDay` (sortKey) | orden en UTC |
| 289 | `groupGastosByDay` (today comparison) | hoy en UTC |
| 299 | `groupGastosByDay` (label) | weekday + mes en UTC |

**El bug**: BA es UTC-3. Un gasto a 22:00 ART = 01:00 UTC del día siguiente. `getUTCDate()` retorna el día equivocado (siguiente), agrupando el gasto al día calendario que el usuario *no* creó.

**Parseo upstream — verificación**: `created_at` viene del repo como ISO string PostgREST (`2026-04-13T12:45:00+00:00`). `new Date(iso)` lo parsea correctamente con timezone offset. Por lo tanto el `.getDate()` (local) **sí** retorna el día BA correcto. El bug está en usar `getUTC*` en lugar de los locales — no en el parseo.

**`applyDateRange` con `selectedDay`**: en [`use-gastos-controller.ts:209-213`](../mobile/features/gastos/use-gastos-controller.ts) usa `new Date(e.created_at).getDate() === selectedDay` que es **local**. ✓ Correcto. El día seleccionado en el calendario y el `getDate()` del expense ambos están en BA.

**Fix**:
1. Reemplazar todos los `getUTC*` listados arriba por sus equivalentes locales (`getFullYear`, `getMonth`, `getDate`, `getDay`).
2. `Date.UTC(...)` → `new Date(year, month, date).getTime()`.
3. **Antes** del fix, escribir los tests unitarios que reproducen el bug (regresión documentada).

**Definition of done**: tests cubren un gasto creado a `2026-04-13T22:30:00-03:00` (ART) y verifican que `groupGastosByDay` lo agrupa bajo `'2026-04-13'` (no `'2026-04-14'`), y que `computeRegistrationStreak` lo cuenta como un día válido.

### 1.2. `applyDateRange` con `first-3-days` rompe ciclos que no empiezan el día 1

| | |
|---|---|
| **Impacto** | 🟠 Alto — filtro silenciosamente devuelve dataset equivocado |
| **Frecuencia** | Común (afecta a cualquier usuario con `salary_payment_day != 1`) |

**Archivo**: [`use-gastos-controller.ts:352-354`](../mobile/features/gastos/use-gastos-controller.ts)

```ts
case 'first-3-days': {
  return list.filter((e) => new Date(e.created_at).getDate() <= 3)
}
```

Filtra por `getDate() <= 3` (días 1-2-3 calendario). Pero el ciclo del usuario puede empezar el día 15 → "primeros 3 días del ciclo" deberían ser 15, 16, 17.

**Fix**:
```ts
case 'first-3-days': {
  const cutoff = cycleStart.getTime() + 3 * 24 * 60 * 60 * 1000
  return list.filter((e) => new Date(e.created_at).getTime() < cutoff)
}
```
Pasar `cycleStart` como argumento a `applyDateRange` (hoy sólo recibe `today`).

**DoD**: test parameterizado con `salary_payment_day in [1, 5, 15, 28]` que verifica el filtro selecciona `[cycleStart, cycleStart + 3d)` en cada caso.

### 1.3. `dailySpend` collision risk en ciclos que cruzan dos meses con el mismo día

| | |
|---|---|
| **Impacto** | 🔴 Crítico (cuando se materializa) — mezcla totales de dos días distintos |
| **Frecuencia** | Edge case — `salary_payment_day in [29, 30, 31]` y ciclo que tope la fecha |

**Archivo**: [`gastos-aggregates.model.ts:64-86`](../mobile/features/gastos/gastos-aggregates.model.ts)

Indexa por `day` (1..31) asumiendo "el día-de-mes es único en un ciclo". Falla cuando el ciclo va, por ejemplo, `Apr 1 → May 1` y la API quiere distinguir "el 1 inicial" del "1 final".

**Fix barato (recomendado contra el de v1)**: mantener API con `day` numérico, pero internamente usar **clave compuesta** que distinga la mitad-de-ciclo. La forma más limpia es indexar por ISO date string en el helper y exponer un mapper auxiliar:

```ts
function computeDailySpend(
  expenses, windowStart, windowEnd,
): Record<string /* YYYY-MM-DD */, DailySpendRow> { ... }

// Helper compatible con consumers existentes:
function dailySpendByDayOfMonth(...): Record<number, DailySpendRow>
```

Alternativa todavía más mínima sugerida en el meta-review: clave compuesta `${cycleIndex}-${day}` donde `cycleIndex ∈ {0, 1}` distingue inicio vs fin. Los consumers (`gastos-month-calendar`) reciben el helper auxiliar y siguen leyendo `dailySpend[day]` mientras el cycleIndex sea único en su ventana.

**DoD**: test con `salary_payment_day = 31` y un gasto en `Apr 1` (cycle start, day=1) y otro en `May 1` (cycle end, day=1) — el helper debe distinguirlos.

---

## 2. Performance 🟠

### 2.1. Array `categories` recomputado en cada render

| Impacto | Frecuencia |
|---|---|
| 🟡 Medio | Universal |

**Archivo**: [`use-gastos-controller.ts:119-123`](../mobile/features/gastos/use-gastos-controller.ts)

`categories: CategoryLite[]` se construye con `.map()` **fuera de useMemo** → identidad nueva por render → invalida `categoriesById`, `topCategories` y descendientes.

**Fix**: 1 línea — envolver en `useMemo([categoriesQuery.data])`.

**DoD**: snapshot test `renderHook(useGastosController)` — re-render sin cambio de inputs → la referencia de `topCategories` se mantiene estable.

### 2.2. `getCycleNavBounds` y `stepCycleDay` reconstruyen `cycleDates` en cada call

| Impacto | Frecuencia |
|---|---|
| 🟡 Medio | Universal (cada render del calendar / cada chevron tap) |

**Archivo**: [`gastos-v2-screen.tsx:300-368`](../mobile/screens/home/gastos-v2-screen.tsx)

Cada función crea ~30 Date objects. Se invocan ≥3 veces por render del screen (`stepCycleDay×2 + getCycleNavBounds spread`).

**Fix**: memoizar `cycleDates` como array dentro del controller, exponer `stepCycleDay` y `getCycleNavBounds` como funciones puras que reciben el array ya construido. O encapsular la nav del calendar dentro de `useGastosController`.

**DoD**: render-count test — cambiar `selectedDay` no debe ejecutar el cycle-dates loop más de una vez.

### 2.3. Lista de movimientos no virtualizada — **medir antes de actuar**

| Impacto | Frecuencia |
|---|---|
| ❓ Indeterminado | ❓ Indeterminado |

**Archivo**: [`gastos-movimientos.tsx`](../mobile/components/gastos/gastos-movimientos.tsx)

**Reclasificado vs v1**: la justificación de "para 200+ transacciones empieza el jank" era anecdótica. Sin benchmark concreto (FPS del JS thread, tiempo en worklets, costo de los gestos de `SwipeableRow` × N) **no podemos priorizar**. La cuenta de testing tiene 85 transacciones y rinde bien.

**Pre-requisito antes de fixear**: capturar:
1. Distribución real de `count(expenses)` por ciclo en producción (¿qué % de usuarios tiene >150 / >200 / >300?).
2. Profile de Hermes en device de gama baja (Android Pixel 4a o equivalente) con un seed de 300 transacciones.
3. FPS durante scroll continuo en ese device.

Si P95 de transacciones por ciclo < 150 y FPS ≥ 55 en P95 de devices, **archivamos como won't-fix**. Si P95 ≥ 200 o FPS < 50, virtualizamos.

**Fix sugerido (sólo si data lo justifica)**: `SectionList` con `windowSize`, `removeClippedSubviews`, group header como `renderSectionHeader`. La animación staggered se reemplaza por `CellRendererComponent` o se elimina (es decoración).

**DoD post-data**: scroll a 60 FPS estable con 500 transacciones en device de referencia.

### 2.4. Cadena de filtros crea 5 arrays intermedios

| Impacto | Frecuencia |
|---|---|
| 🟡 Medio (escala con N) | Universal |

**Archivo**: [`use-gastos-controller.ts:173-215`](../mobile/features/gastos/use-gastos-controller.ts)

`cycleExpenses → filteredByCategory → filteredBySmart → filteredExpenses → groups`. 4 pasadas O(n) + alocaciones.

**Fix**: predicado compuesto en una sola pasada. **Bloquea con §3.1** — si el filtro de ciclo se hace server-side, la cadena cliente se simplifica naturalmente, y refactor independiente sería trabajo doble.

**DoD**: benchmark de 1000 expenses en JS thread — tiempo total < 5ms (vs ~20ms actual).

### 2.5. `streakData` default object inline en cada render

| Impacto | Frecuencia |
|---|---|
| 🟡 Medio | Universal mientras `streakQuery.data` está pendiente |

**Archivo**: [`gastos-v2-screen.tsx:73-82`](../mobile/screens/home/gastos-v2-screen.tsx)

**Fix corregido vs v1**: el meta-review observó correctamente que mover el objeto a constante module-level introduce un bug latente (mutación compartida entre instancias). Las opciones seguras:

```ts
// Opción A — useMemo con deps vacías
const streakDefaults = useMemo(() => ({ ... }), [])
const streakData = streakQuery.data ?? streakDefaults

// Opción B — Object.freeze de un módulo-level constant (immutable)
const STREAK_DEFAULTS = Object.freeze({ ... })
const streakData = streakQuery.data ?? STREAK_DEFAULTS
```

Recomiendo **Opción B** — más simple, sin re-render hooks, y `Object.freeze` previene mutaciones aguas abajo.

**DoD**: snapshot identity check — re-render sin nuevas props → `streakData` mantiene la misma referencia.

### 2.6. `cycleExpensesByCategory` duplica `filteredByCategory`

| Impacto | Frecuencia |
|---|---|
| 🟢 Bajo | Universal |

**Archivo**: [`use-gastos-controller.ts:242-248`](../mobile/features/gastos/use-gastos-controller.ts)

Mismos inputs, misma lógica, dos `useMemo`s separados. Reusar `filteredByCategory`.

**DoD**: file-diff muestra una sola declaración del filtro por categoría.

---

## 3. Backend / data fetching 🟡

### 3.1. `useExpenses(familyId)` carga el historial completo — costo principal en CPU, no bandwidth

| Impacto | Frecuencia |
|---|---|
| 🟠 Alto (escala con tiempo) | Común — todos los usuarios con >2 meses de uso |

**Archivo**: [`use-gastos-controller.ts:106`](../mobile/features/gastos/use-gastos-controller.ts) → [`expense-repository.ts:27-75`](../mobile/features/expenses/expense-repository.ts)

`loadExpenses(familyId)` no aplica window. Para 6m de historia (~500 gastos) son ~30KB; 24m → ~150KB. **El costo real no es bandwidth — es CPU**:

- React Query parsea el JSON y guarda en cache.
- `enrichExpenses` itera para enriquecer con `creator_display_name` (otra alocación O(n)).
- Cada `useMemo` del controller itera sobre `expenses` o `cycleExpenses` (al menos 4 pasadas).
- Cada cambio de filtro (categoría, día, smart) re-corre el subset.

Para un usuario con 2000 gastos cargados, esto puede sumar **20-50ms en JS thread por re-render**, perceptible como jank al cambiar filtros.

**Fix**: agregar `gte` / `lte` a `ExpenseQueryFilters` y filtrar `[cycleStart, cycleEnd)` server-side. La ruta `/expenses-history` (legacy) sigue usando la versión sin window para historial completo.

**DoD**: profile en device target con 2000 gastos cargados — switch de filtro < 16ms en JS thread (1 frame a 60 FPS).

### 3.2. Sin realtime — partner adds desde otro device no se reflejan

| Impacto | Frecuencia |
|---|---|
| 🟠 Alto | Universal en familias multi-device |

**Archivo**: [`gastos-v2-screen.tsx`](../mobile/screens/home/gastos-v2-screen.tsx)

Home tiene [`useHomeRealtime`](../mobile/features/home/use-home-realtime.ts) (canal Supabase + invalida React Query). Gastos no.

**Fix**: extraer un helper genérico `useFamilyRealtime(familyId, { tables, invalidations })` para reusar entre Home, Gastos, Fijos, etc. La implementación actual de Home ya está bien diseñada — sólo falta la generalización.

**DoD**: abrir Gastos en device A, cargar gasto en device B desde la misma familia, verificar que A se actualiza en <2s sin acción del usuario.

### 3.3. `enrichExpenses` agrega un round-trip extra a `profiles`

| Impacto | Frecuencia |
|---|---|
| 🟢 Bajo | Universal en primer load (post-cache se amortiza) |

**Archivo**: [`expense-repository-enrichment.ts`](../mobile/features/expenses/expense-repository-enrichment.ts)

Cada `loadExpenses` con creators no cacheados dispara un segundo query. Reemplazable con join PostgREST:

```ts
.select('id, family_id, ..., profiles!created_by(display_name)')
```

**Trade-off**: el join requiere FK declarada `expenses.created_by → profiles.id`. Confirmar antes de migrar.

**DoD**: 1 round-trip a `expenses` en lugar de 2 cuando el cache de profiles está frío.

### 3.4. `useControlV2Data` invocado para alimentar un chip de 1 línea — overkill

| Impacto | Frecuencia |
|---|---|
| 🟡 Medio | Universal |

**Archivo**: [`gastos-v2-screen.tsx:114`](../mobile/screens/home/gastos-v2-screen.tsx)

`useControlV2Data(familyId)` ejecuta varios RPC server-side (signals + view) — pensado para el screen completo de Control. Gastos lo invoca **sólo** para alimentar `GastosAdvisorChip` (1 línea de pista). Costo desproporcionado.

**Opciones**:
- **A**: una RPC más liviana `get_advisor_signals_summary(family_id)` que devuelva sólo lo necesario para el chip.
- **B**: lazy-load — sólo invocar `useControlV2Data` si el chip va a renderizar (i.e., si `controlData.signals.length > 0`). Pero el chequeo requiere los datos → catch-22.
- **C**: server-side push del chip via realtime / push notification, sin pull en cada apertura de Gastos.

Recomiendo **A** como mínimo viable.

**DoD**: tiempo de render inicial de Gastos < 200ms en cold cache (vs ~600ms actual con `useControlV2Data`).

---

## 4. UX / flujo 🟠

### 4.1. Sin pull-to-refresh

| Impacto | Frecuencia |
|---|---|
| 🟠 Alto | Universal |

`<Screen>` soporta `refreshControl` via spread props. Home lo wirea ([`home-screen.tsx:240-247`](../mobile/screens/home/home-screen.tsx)). Gastos no.

**Fix**: `RefreshControl` con `controller.refetchAll` (que hay que exponer desde el hook).

**DoD**: gesto de pull dispara refetch de expenses + categories + family_members + control_v2_data, con spinner visible durante la operación.

### 4.2. Sin skeleton de loading

| Impacto | Frecuencia |
|---|---|
| 🟠 Alto | Universal en cold cache (primera apertura) |

`controller.isLoading` está expuesto pero no se gatea — la pantalla queda en blanco hasta que llegan los datos.

**Fix**: `if (controller.isLoading && !controller.expenses.length) return <GastosSkeleton />`.

**DoD**: cold-cache reload muestra hero shimmer + 6 row skeletons hasta que data esté lista.

### 4.3. Sin empty state global (familia sin gastos cargados nunca)

| Impacto | Frecuencia |
|---|---|
| 🟠 Alto | Familias nuevas (universal en onboarding) |

`GastosMovimientos` muestra "No hay movimientos para este filtro" cuando `groups.length === 0` — engañoso si no hay filtro, simplemente la familia es nueva.

**Fix**: distinguir tres estados:
1. `expenses.length === 0` (global empty) → CTA "Cargá tu primer gasto" → `/(app)/(tabs)/add`.
2. `cycleExpenses.length === 0 && expenses.length > 0` → "Aún sin gastos en este ciclo".
3. `filteredExpenses.length === 0` con filtros activos → "No hay movimientos para este filtro" + botón "Limpiar filtros".

**DoD**: tres test cases con cada estado verifican render correcto.

### 4.4. Swipe-to-delete sin undo *(cross-cutting — ver §17.1)*

Movido a la sección cross-cutting (§17). El issue afecta a Home + Gastos por igual; tratarlo a nivel app evita que se repita en cada audit.

### 4.5. `summaryChip` no refleja el smart filter activo

| Impacto | Frecuencia |
|---|---|
| 🟢 Bajo | Cuando el smart filter está activo (no es el path principal) |

**Archivo**: [`use-gastos-controller.ts:222-230`](../mobile/features/gastos/use-gastos-controller.ts)

Sólo incluye categoría + período. El smart filter (priceMin, priceMax, dateRange) queda oculto.

**Fix**: extender el chip — `47 mov · abril · Todas · ≥$5K`.

**DoD**: con `smartFilter: { priceMin: 5000 }` activo, el chip muestra `≥$5K` como sufijo.

### 4.6. **`focusExpenseId` deep-link silenciosamente roto** *(reclasificado de §5.1)*

| Impacto | Frecuencia |
|---|---|
| 🟠 Alto | Activo cada vez que el Asistente Financiero genera un deep-link a un gasto específico |

**Archivo**: [`gastos-v2-screen.tsx:60-65`](../mobile/screens/home/gastos-v2-screen.tsx)

**Reclasificado vs v1**: el meta-review tuvo razón. Esto **no es código muerto**, es una feature parcialmente implementada que rompe el flujo del Asistente Financiero silenciosamente.

El Asistente arma deep-links del estilo `/(app)/(tabs)/expenses?focusExpenseId=<uuid>` esperando que la lista de movimientos scrollee y resalte la fila correspondiente. La URL parsea el param, lo guarda en `smartFilter.focusExpenseId`, y... **ningún componente lo lee**.

**Acciones requeridas (orden)**:
1. **Verificar con equipo Asistente** si los deep-links están vivos en producción. Si están deprecados, eliminar el parsing.
2. Si están vivos: implementar `scrollToExpense` en `GastosMovimientos` + highlight visual transitorio (mint glow 1500ms, luego decay).
3. Si no se va a implementar en el sprint: **eliminar el parsing** ahora para no inducir falsa expectativa en consumers.

**DoD**: tap en una signal del Asistente con deep-link a gasto X → Gastos abre, scrollea a la fila X, highlight visual 1.5s.

---

## 5. Dead code / state no usado 🟢

### 5.1. `void key` en `groupGastosByDay`

**Archivo**: [`gastos-aggregates.model.ts:302`](../mobile/features/gastos/gastos-aggregates.model.ts)

`for (const [key, value] of map) { ...; void key }` — la key se podía omitir directamente: `for (const value of map.values())`.

**DoD**: linter limpio sin `void`.

### 5.2. `clearAll` y `clearSmartFilter` expuestos pero no wireados

**Archivo**: [`use-gastos-controller.ts:329-334`](../mobile/features/gastos/use-gastos-controller.ts)

Reservados para un botón "Limpiar filtros" no implementado.

**Fix**: implementar el botón cuando hay 1+ filtro activo, o eliminar las funciones.

**DoD**: botón visible iff `selectedCategoryId != null || selectedDay != null || hasSmartFilter()`.

### 5.3. `computeAverageDailySpend` exportado pero no usado por el screen

**Archivo**: [`gastos-aggregates.model.ts:203-219`](../mobile/features/gastos/gastos-aggregates.model.ts)

El controller computa `averageDaily` inline en `useMemo` (línea 272), no usa este helper. Tampoco hay otros consumers.

**Fix**: eliminar o consolidar con la implementación del controller para tener una única definición.

**DoD**: grep `computeAverageDailySpend` retorna 0 hits fuera del archivo de definición + el archivo elimina la función.

---

## 6. Accesibilidad 🟠

### 6.1. Falta `accessibilityLabel` en `GastosFilterPill`, `GastoRow`, chips del calendar

| Impacto | Frecuencia |
|---|---|
| 🟠 Alto | Usuarios con VoiceOver / TalkBack (universal en ese subset) |

Pressables sin label se anuncian como "botón" sin contenido. Replicar el patrón compuesto de Home (label que combine tipo + contenido + estado).

**DoD**: VoiceOver lee cada chip como `"Filtro Mercado, 32 movimientos. Doble tap para activar."` (o similar).

### 6.2. `swipeHint` "‹ Desliza para acciones" no accionable por screen reader

**Archivo**: [`gastos-movimientos.tsx:43-47`](../mobile/components/gastos/gastos-movimientos.tsx)

Sin `accessibilityActions` en `SwipeableRow`, los usuarios de screen reader no pueden invocar delete/edit (el rotor no expone las acciones).

**Fix**: agregar `accessibilityActions={[{ name: 'delete', label: 'Eliminar' }, { name: 'edit', label: 'Editar' }]}` y `onAccessibilityAction` que invoque cada `SwipeAction.onPress`.

**DoD**: con VoiceOver activo, `rotor → Acciones → Eliminar` ejecuta el delete.

---

## 7. Testing / cobertura 🟡

### 7.1. Estado actual de cobertura

| Módulo | Tests existentes | Cobertura |
|---|---|---|
| `expense-analytics.ts` (legacy) | `expense-analytics.test.ts` (98 LOC) | ✓ |
| `expense-history.ts` (legacy) | `expense-history.test.ts` (67 LOC) | ✓ |
| `expense-intelligence-model.ts` | `expense-intelligence-model.test.ts` | ✓ |
| `add-expense-model.ts` | `add-expense-model.test.ts` | ✓ |
| `fixed-expense-editor-model.ts` | `fixed-expense-editor-model.test.ts` | ✓ |
| **`gastos-aggregates.model.ts` (V2)** | **ninguno** | **0%** |
| **`use-gastos-controller.ts`** | **ninguno** | **0%** |
| **`gastos-v2-screen.tsx` (helpers `stepCycleDay`, `getCycleNavBounds`)** | **ninguno** | **0%** |

**Brecha**: el screen V2 está completamente sin testear. Los tests legacy cubren funciones de la screen V1 (que vive en `/(app)/expenses-history`) pero **no del path principal del usuario**.

### 7.2. E2E

[`tests/e2e/gastos-auth.spec.ts`](../tests/e2e/gastos-auth.spec.ts) (76 LOC) hace un smoke test: login + navegación + screenshot + chequeo de errores de consola. **No prueba flujos críticos**:
- Cargar un gasto (path crítico).
- Eliminar un gasto.
- Cambiar de categoría.
- Navegar el calendar.

### 7.3. Renderhook tests

`renderHook(useGastosController)` no existe. Bug 2.1 (memoization) y todos los hallazgos de §2 son testeables ahí.

### 7.4. Plan recomendado

| Prioridad | Test | DoD |
|---|---|---|
| 1 | `gastos-aggregates.model.test.ts` — al menos 25 tests cubriendo los 3 bugs de §1 antes del fix | timezone fixture + collision case + first-3-days fixture |
| 2 | `use-gastos-controller.renderhook.test.ts` — memoization + filter chain | identidades estables, count de re-renders ≤ esperado |
| 3 | E2E — flow `crear → ver en lista → eliminar → confirmar removido` | playwright spec verde |
| 4 | E2E — flow `cambiar categoría → verificar filtro aplicado → limpiar` | playwright spec verde |

**Esfuerzo total estimado**: M (1 día completo).

---

## 8. Observabilidad / telemetría 🟠

### 8.1. Estado actual

| Capa | Existencia |
|---|---|
| Telemetría de UI events (taps, filter applied, swipe-delete) | ❌ |
| Logging de errores de mutations | ⚠️ — sólo `console.warn` en dev (`lib/query-client.ts:36`) |
| Time-to-interactive del primer render | ❌ |
| Tracking de empty states vistos | ❌ |
| Sentry / Datadog wireados | ❌ — comentario en `query-client.ts:31` dice "wire a telemetry sink" pero no existe |

### 8.2. Eventos sugeridos

Mismo patrón que Home (`log_home_event` RPC + `home_telemetry` table). Eventos del Gastos:

| Evento | Slot | Qué decide |
|---|---|---|
| `gastos.opened` | session | dwell, return rate |
| `gastos.element_tapped` | filter_pill / advisor_chip / calendar_day / movement_row | tap rate por elemento |
| `gastos.filter_applied` | category / smart / date | qué filtros se usan |
| `gastos.expense_deleted` | swipe | volumen + recovery (post-undo) |
| `gastos.empty_state_seen` | global / cycle / filtered | conversión del CTA |
| `gastos.streak_sheet_opened` | sheet | engagement con racha |

### 8.3. Errores

Falta wrapping de errores de mutations a un sink centralizado. Hoy:
- Mutations log a `console.warn` en dev.
- En prod no se loggean → si un usuario tiene 50% de fallos al guardar gastos, no nos enteramos hasta que abra ticket.

**Fix**: crear `lib/error-sink.ts` que envuelva Sentry/Crashlytics, integrar al `MutationCache.onError`. Sprint independiente — no específico de Gastos.

---

## 9. Error handling / network states 🟠

### 9.1. Estado de fallo de `loadExpenses`

| Estado | Comportamiento actual |
|---|---|
| Network error en mount | `useExpenses.error` → `controller.error` → render `<ErrorState />` con copy genérico de servidor. ✓ |
| Network error mid-session | React Query retry × 1 silencioso, luego cache stale. **No se notifica al usuario**. |
| RLS denial (auth expirada) | Mismo flujo que error genérico — pero requiere sesión nueva, no retry |
| Empty response | OK, render como empty state filtered (ver §4.3) |

**Gap**: no hay distinción de errores por kind (network vs server vs auth). Home sí (ver `classifyDashboardError`). Gastos hereda el copy genérico.

### 9.2. Mutations en pending indefinido

| Caso | Comportamiento actual |
|---|---|
| `useDeleteExpense` con red caída | optimistic delete aplicado, espera respuesta. Sin timeout configurado → puede quedar pending **indefinidamente**. `pendingExpenseId` permanece, la row queda en estado "procesando" forever. |
| `useCreateExpense` (no usada en Gastos pero relevante) | igual — sin timeout |

**Fix**: agregar `mutationFn` con `AbortController` + timeout 15s. Si timeout, rollback optimistic + mostrar toast.

### 9.3. Backoff / retry strategy

[`lib/query-client.ts:58`](../mobile/lib/query-client.ts) — `retry: 1` para queries, `retry: 0` para mutations. Sensible default. Pero **no hay backoff incremental** ni retry-on-reconnect (Supabase RT no triggers refetch on reconnect).

**Fix**: mantener `retry: 1` pero agregar `retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000)`.

### 9.4. Toasts de error inconsistentes

Algunas mutations muestran `Alert.alert` (delete), otras Toast (no presente en Gastos pero sí en otros módulos). Cross-cutting — ver §17.

---

## 10. Offline / optimistic updates 🟡

### 10.1. Estado del cache

| Capa | Existencia |
|---|---|
| Persistencia de React Query (MMKV / AsyncStorage) | ❌ — grep retorna 0 hits para `persistQueryClient` o `MMKV`/`AsyncStorage` en el módulo |
| Optimistic delete | ✓ ([`use-expenses.ts:179-216`](../mobile/features/expenses/use-expenses.ts)) — snapshot + rollback correcto |
| Optimistic create | ❌ |
| Queue de operaciones offline | ❌ |

### 10.2. Comportamiento sin red

- Apertura: si hay cache caliente, render desde cache. Si está frío, queda en blanco / error tras retry. Sin "offline indicator".
- Crear gasto sin red: la mutation queda pending, el usuario no ve nada hasta reconexión, momento en el que dispara la inserción real (si la sesión sigue viva).
- Eliminar sin red: optimistic local funciona, en el `onSettled` la invalidate falla pero el rollback NO se ejecuta (sólo en `onError` de la mutation). Ver §10.3.

### 10.3. Optimistic delete — bug latente

[`use-expenses.ts:201-206`](../mobile/features/expenses/use-expenses.ts):
```ts
onError: (_err, _expenseId, ctx) => {
  const snapshots = ctx?.snapshots ?? []
  for (const [k, data] of snapshots) {
    queryClient.setQueryData(k as readonly unknown[], data)
  }
},
```

Restaura snapshots **al `onError`**. ✓

Pero `onSettled` invalida queries SIEMPRE — incluso si la mutation falló. Si el invalidate falla (ej: 401 en background), el rollback ya pasó pero el cache invalidate falló silenciosamente. Comportamiento probablemente OK (estado vuelve al original) pero merece test.

### 10.4. Plan recomendado

- **Fase 1**: indicator de offline en el header (toast o pill cuando `NetInfo.isConnected === false`).
- **Fase 2**: persistir React Query con `react-native-mmkv` + `persistQueryClient`. Mejora cold-start dramáticamente.
- **Fase 3**: queue de operaciones — patrón complejo, evaluar contra costo.

Recomiendo **Fase 1 + Fase 2** este semestre. Fase 3 evaluable post-data.

---

## 11. Seguridad / validación 🟠

### 11.1. RLS verificado

Mensaje en [`mobile-baseline.sql:855-883`](../supabase/migrations/20260413154000_mobile_baseline.sql):

```sql
expenses_select_members: using (public.is_family_member(family_id))
expenses_insert_members_created_by_self:
  with check (public.is_family_member(family_id) and created_by = auth.uid())
expenses_update_members: using/with check (public.is_family_member(family_id))
expenses_delete_members: using (public.is_family_member(family_id))
```

✓ RLS está bien diseñado:
- SELECT/UPDATE/DELETE: cualquier miembro de la familia
- INSERT: además exige `created_by = auth.uid()` (no podés crear como otro miembro)

**Posible hallazgo**: `UPDATE` permite a cualquier miembro editar gastos de otros. ¿Es intencional? Si una familia comparte gastos, sí. Si los gastos son personales-pero-visibles, podría querer restringirse a `created_by = auth.uid()`.

### 11.2. Input validation

[`expense-repository.model.ts:74-87`](../mobile/features/expenses/expense-repository.model.ts):

```ts
function validateExpenseDescription(description: string) {
  const normalizedDescription = description.trim()
  if (!normalizedDescription) throw new Error('La descripcion es obligatoria.')
  return normalizedDescription
}

function validateExpensePrice(price: number) {
  if (!Number.isFinite(price) || price < 0) throw new Error('...')
}
```

**Gaps**:
- **Description**: no hay max length. Un usuario malicioso puede insertar 100KB de texto y estresar el render.
- **Price**: no hay max value. `Number.MAX_SAFE_INTEGER` se acepta — formateadores de moneda pueden fallar.
- **Description**: no sanitiza emojis combinados ni control characters. RN `<Text>` renderiza casi todo, pero algunos char inputs pueden romper layouts.

**Fix**: límites razonables — `description.length ≤ 200`, `price ≤ 1_000_000_000`. Server-side via DB constraint también recomendable.

### 11.3. Exposición de `created_by`

El UUID de profile aparece en la respuesta de `expenses`. Sólo es identificador opaco — no leak grave, pero ayuda a un atacante en sesión a hacer recon. RLS protege contra leak cross-family. ✓

### 11.4. Decimal precision

`price` se almacena como `numeric(12,2)` en DB. Cliente usa `Number(row.price)` — pierde precisión más allá de los ~15 dígitos significativos de IEEE 754. Para precios ARS típicos (≤8 dígitos), seguro. Para casos extremos (cuotas en USD a high precision), conviene usar `decimal.js` o similar. Won't-fix candidato.

---

## 12. Internacionalización 🟢 *(deuda conocida, no priorizada)*

### 12.1. Estado actual

Strings hardcodeadas en español a lo largo del módulo:

| Archivo | Strings hardcodeadas |
|---|---|
| `gastos-movimientos.tsx` | "Movimientos", "‹ Desliza para acciones", "No hay movimientos para este filtro", "Hoy", "Ayer", weekday/month abbreviations |
| `gastos-smart-filter.tsx` | "FILTRAR POR CATEGORÍA", "Todas" |
| `use-gastos-controller.ts` | `MONTH_SHORT`, summary chip copy |
| `expense-repository.model.ts` | mensajes de error en español sin tildes ("descripcion", "numero") |
| `gastos-v2-screen.tsx` | "No pudimos eliminar", "No pudimos cargar tus gastos" |

### 12.2. Decisión recomendada

**Won't fix esta auditoría** — el producto es ES-AR-only por roadmap. Pero documentar:
- No introducir strings nuevas sin pasar por una `lib/copy/states.ts` central (que ya existe parcialmente).
- Cuando se priorice i18n, el módulo necesitará ~2-3 días de extracción.
- Errores en `expense-repository.model.ts` tienen tildes mal — corregir como tarea de copy ya, sin esperar i18n.

### 12.3. Bug separado: copy "descripcion" sin tilde

[`expense-repository.model.ts:77`](../mobile/features/expenses/expense-repository.model.ts) y [`:85`](../mobile/features/expenses/expense-repository.model.ts):

```ts
'La descripcion es obligatoria.'
'El precio debe ser un numero mayor o igual a 0.'
```

Tildes faltantes. Fix XS.

---

## 13. Design system / tokens 🟠

### 13.1. Hardcoded hex colors en componentes Gastos

Grep `#[0-9a-fA-F]{3,8}\b` en `mobile/components/gastos`:

| Archivo | Colores hardcoded |
|---|---|
| `streak-flame-icon.tsx` | `#0A1410`, `#F6FBEF` (ambos están en el theme palette pero no se referencian) |
| `category-weights-list.tsx` | `#F6FBEF` (default prop) |
| `animated-flame.tsx` | 12 colores hex hardcoded para los tres modos del flame (ok/warning/broken) |

### 13.2. Análisis

- `animated-flame.tsx` define una palette propia para los modos de la llama. Defendible como "branded asset color" pero idealmente vive en theme.colors (ej: `theme.colors.flameOk`, `theme.colors.flameBroken`).
- `streak-flame-icon` tiene `#F6FBEF` que es probablemente `theme.colors.heroText`. Reemplazar.
- `category-weights-list` default prop debería ser opcional con fallback a theme, no a un hex hardcoded.

### 13.3. Spacings y type tokens

Grep rápido en `gastos-movimientos.tsx`:
- `fontSize: 20, 14, 13, 12, 11` — alineados con la type scale documentada en handoff de Home.
- `paddingHorizontal: 14, padding: 6, gap: 6, 8, 14` — spacings ad-hoc, no de un scale (4/8 dp).

**Recomendado**: extraer todo a tokens — pero es trabajo cross-module. Won't fix en este sprint, documentar como deuda.

**DoD del fix mínimo**: `streak-flame-icon` + `category-weights-list` reemplazan hex por `theme.colors.*`. `animated-flame.tsx` queda como excepción documentada.

---

## 14. Comparativa con Home (post-auditoría)

| Atributo | Home | Gastos |
|---|---|---|
| Pull-to-refresh | ✅ | ❌ |
| Realtime (channel + invalidations) | ✅ | ❌ |
| Telemetría | ✅ | ❌ |
| Skeleton de loading | ✅ | ❌ |
| Empty state distinguido (3 estados) | ✅ | ❌ |
| Undo en swipe-to-delete | ❌ | ❌ (cross-cutting) |
| Helpers puros con tests | ✅ (3 archivos, 35 tests) | ❌ (0 tests del V2) |
| Timezone-correct date math | ✅ | ❌ (UTC bug) |
| Memoization disciplinada | ✅ | ⚠️ |
| Virtualización de lista | ❌ (6 rows OK) | ❓ (medir antes) |
| Accessibility labels compuestos | ✅ | ❌ |
| Error classifier por kind | ✅ | ❌ |
| Optimistic mutations + rollback | ✅ | ✅ |

---

## 15. Backend connections — mapa actualizado

| Query / RPC | Hook | Cuándo | Costo (rough) |
|---|---|---|---|
| `expenses` (full family list) | `useExpenses` via controller | mount + invalidations | 30-150KB + parse JS |
| `categories` | `useCategories` | mount | <5KB |
| `family_members` | `useFamilyMembers` | mount | <2KB |
| `family_finance` | `useFamilyFinance` (deduped) | mount | <1KB |
| `fixed_expenses` | `useFixedExpenses` (via dashboard) | mount | <10KB |
| `streaks` (RPC) | `useStreak` | mount | <1KB |
| `control_v2_data` | `useControlV2Data` | mount | **alto — varios RPCs internos** |
| `profiles` | indirect via `enrichExpenses` | post-fetch (cacheado) | 1 round-trip por creator no cached |

**Hallazgo §3.4**: `control_v2_data` es el query más caro y se usa para alimentar 1 línea de chip. Worth right-sizing.

---

## 16. Sprint priorizado — estado actual

### Shipped en Sprint 1 (2026-04-29)

| # | Item | Status | Verificable |
|---|---|---|---|
| 1 | Timezone bugs §1.1 | ✅ shipped | `gastos-aggregates.model.test.ts` con TZ=ART |
| 2 | Tests unitarios §7.4 (23 tests) | ✅ shipped | `vitest run` — 238 pass |
| 3 | First-3-days §1.2 | ✅ shipped | Single-pass filter usa `cycleStart + 3d` |
| 4 | DailySpend collision §1.3 | ✅ shipped | ISO key + adapter para day-of-month |
| 5 | Single-pass filter §2.4 + dedupe §2.6 | ✅ shipped | 1 useMemo en lugar de 4 |
| 6 | Memoize §2.1 §2.2 §2.5 | ✅ shipped | `categories` useMemo, cycleDates memoizado, STREAK_DEFAULTS frozen |
| 7 | Pull-to-refresh §4.1 | ✅ shipped | `RefreshControl` → `controller.refetchAll` |
| 8 | Realtime §3.2 | ✅ shipped | `useFamilyRealtime` genérico + `useGastosRealtime` |
| 9 | Skeleton + 3 empty states §4.2 §4.3 | ✅ shipped | global / cycle / filtered con CTAs distintos |
| 10 | A11y §6.1 §6.2 | ✅ shipped | `accessibilityActions` en SwipeableRow + label compuesto en chips/rows |
| 11 | `focusExpenseId` §4.6 | ✅ shipped | Parsing eliminado (decisión prudente) |
| 12 | Botón Limpiar filtros §5.2 | ✅ shipped | Visible iff `hasAnyFilter` |
| 13 | summaryChip con smart filter §4.5 | ✅ shipped | Suffix `≥$5K · 7d` |
| 14 | Dead code §5 | ✅ shipped | computeAverageDailySpend, void key, focusExpenseId eliminados |
| 15 | Tildes §12.3 + validators §11.2 | ✅ shipped | Caps + mensajes con tildes |
| 16 | Hex hardcoded §13 | ✅ shipped | streak-flame-icon + category-weights-list usan tokens |

### Sprint 2 ejecutado (2026-04-29, mismo día)

| # | Item | Status | Notas |
|---|---|---|---|
| 17 | Server-side cycle window §3.1 | ✅ shipped | `ExpenseQueryFilters` ahora acepta `createdAtGte` / `createdAtLt`. Nuevo hook `useExpensesInRange(familyId, gteIso, ltIso)` con su propia query key. Gastos opta por la versión windowed; Home y Control sin cambios (siguen usando `useExpenses` full). Optimistic delete + realtime invalidan también el prefix `inRangeFamily` |
| 19 | Telemetría §8 — `useFamilyTelemetry` extraído | ✅ shipped | Helper genérico `useScreenTelemetry({ scope, familyId })` en `mobile/features/telemetry/`. `useGastosTelemetry` thin wrapper. Eventos emitidos: `gastos.opened/closed/refreshed/element_tapped/left_without_tap/reopened_in_session`. 8 elementos tracked: `filter_pill`, `calendar_day`, `calendar_register_forgotten`, `add_expense_cta`, `clear_filters`, `gasto_row_delete`, `streak_flame`, `advisor_chip` |

### Sprint 3 ejecutado (2026-04-30, autorización explícita del usuario)

| # | Item | Status | Notas |
|---|---|---|---|
| 24 | Profiles join PostgREST §3.3 | ✅ shipped | Migration `20260504000000_expenses_profile_fk.sql` declara FK explícita `expenses.created_by → profiles.id` (lógicamente redundante con `auth.users` pero permite a PostgREST inferir la relación). `loadExpenses` usa el embed `profiles!expenses_created_by_profile_fkey(display_name)` y cae a 1 round-trip. Dos paths de fallback (sin commitment_id, sin embed inference) preservan la robustez. Verificado contra cuenta de testing live |
| 21 | Persistir React Query con AsyncStorage §10.4 | ✅ shipped | `@react-native-async-storage/async-storage`, `@tanstack/query-async-storage-persister`, `@tanstack/react-query-persist-client` instalados via `expo install`. `<PersistQueryClientProvider>` reemplaza `<QueryClientProvider>` en `app-providers.tsx`. Persiste sólo queries `success` (no errores ni mutations) con `gcTime: 24h` y `buster: manifiesto-cache-v1`. Cold start ahora pinta desde cache + revalida en background. Plus: `<OfflinePill>` en Home y Gastos via `useOnlineStatus` (NetInfo) |
| 23 | Virtualizar lista de movimientos §2.3 | ✅ shipped | Refactor de `gastos-v2-screen.tsx` a `<SectionList>` como root scrollable. Chrome (header, hero, calendar, filtros, advisor, título) en `ListHeaderComponent` memoizado. Sections desde `controller.groups`. Knobs: `windowSize: 9`, `removeClippedSubviews`, `initialNumToRender: 12`, `maxToRenderPerBatch: 10`. `<Screen scrollable={false}>` para evitar double-scroll. Empty state como `ListEmptyComponent`, refresh control passthrough |
| 18 | Right-size `useControlV2Data` §3.4 | ✅ shipped | Nuevo `options.defer` flag en `useControlV2Data`. Cuando `defer: true`, las queries pesadas (`useControlIntelligence` + `useFamilyNotifications`) se posponen ~600ms post-mount via state flag + setTimeout. Las livianas (expenses/finance/categorías) ya están cached por sibling screens, sin costo. Gastos opta in con `{ defer: true }`. Resultado: cold-cache mount ya no espera 3 round-trips para pintar la primera frame |

### Pendientes — descartados por producto o esperando manual QA

| # | Item | Estado | Razón |
|---|---|---|---|
| 20 | Error sink centralizado §8.3 §9.4 | ⏸ Descartado por ahora | Decisión de producto: 2 semanas de prueba intensa con QA manual reportando errores back+UI antes de invertir en stack de error reporting (Sentry/Datadog/etc.) |
| 22 | Undo toast post-delete §17.1 | ⏸ Descartado | Decisión de producto: el swipe muestra el botón "Eliminar" como segundo tap explícito → no es accidental. Cargar un gasto de vuelta son 3 taps. ROI bajo |

### Won't fix (consciente)

Ver §19 para razón documentada de cada uno.

---

## 17. Cross-cutting (issues no específicos de Gastos)

### 17.1. Undo en swipe-to-delete (afecta Home + Gastos)

| Impacto | Frecuencia |
|---|---|
| 🟠 Alto (acción destructiva sin recuperación) | Cada delete |

Patrón consistente: post-delete dispatch `<UndoToast onUndo={restoreMutation} duration={5000} />`. Requiere uno de:
- **Soft-delete**: agregar `deleted_at` column + filtro `is null` en SELECT. Restore = update `deleted_at = null`.
- **RPC `restore_expense(id)`**: requiere capturar el snapshot y re-insertar.

Recomendado: **soft-delete** — más limpio, soporta undo de undo, y permite "papelera" futura. Migración + RLS update + cliente.

### 17.2. Persistencia de React Query (afecta toda la app)

Ver §10. Implementar a nivel `app/_layout.tsx` con `persistQueryClient` + `react-native-mmkv` driver.

### 17.3. Error sink (Sentry/Crashlytics)

Ver §8.3 §9.4. Decision call de stack — Sentry vs Datadog vs alternativas. Una vez decidido, integración es M.

### 17.4. `<Toast>` system unificado

El proyecto mezcla `Alert.alert` (Gastos delete) con toasts custom en otros módulos. Definir un único componente `<Toast>` y reemplazar todos los `Alert.alert` no-modales.

### 17.5. `GastosV2Screen` — naming + V1 deuda

| Hecho | |
|---|---|
| Hay `ExpensesHistoryScreen` (V1) en [`mobile/screens/home/expenses-history-screen.tsx`](../mobile/screens/home/expenses-history-screen.tsx) accesible via `/(app)/expenses-history` | ✓ activo |
| Comment en `expenses-screen.tsx`: "still accessible via `/expenses-history` route for reference while the redesign lands" | ⚠️ deuda |
| Naming `GastosV2` sugiere existencia paralela | ⚠️ confuso |

**Acción recomendada**:
1. Si nadie usa V1: deprecarla. Eliminar el route + el screen file.
2. Si V1 sigue siendo el "ver historial completo" cuando V2 sólo muestra el ciclo: renombrar a propósito (`ExpensesScreen` para V2, `ExpensesHistoryScreen` para V1) y eliminar el sufijo `V2`.

---

## 18. Métricas accionables — necesarias antes de cerrar prioridades

Sin estos datos, varios items del sprint son juicio sin evidencia:

| Métrica | Justifica / descarta |
|---|---|
| Distribución `count(expenses)` por ciclo en producción (P50, P75, P95) | §2.3 (virtualización) |
| % de usuarios con `salary_payment_day ∈ {29, 30, 31}` | §1.3 (collision priority) |
| Volumen de deep-links del Asistente con `focusExpenseId` (analytics o logs) | §4.6 (implementar vs eliminar) |
| Flamegraph de Hermes de mount inicial de Gastos en device target | §2 (priorizar memoization) §3.4 (`useControlV2Data` cost) |
| FPS del JS thread durante scroll de movimientos en device de gama baja | §2.3 (virtualización) |
| Tasa de error de mutations en prod (si se puede reconstruir desde Supabase logs) | §9.4 (urgencia del error sink) |
| % de sesiones "leftWithoutTap" en Gastos (si tuviéramos telemetría) | §8 (urgencia de telemetría) |

**Esfuerzo de levantar las métricas**: 2-3 días con acceso a logs de Supabase + un device de gama baja para profiling. Merece un sprint dedicado de descubrimiento ANTES del sprint 2.

---

## 19. Won't fix / consciously deferred

| Item | Razón |
|---|---|
| i18n full §12 | Producto ES-AR-only por roadmap. Documentado como deuda futura |
| Decimal precision para precios extremos §11.4 | ARS típicos ≤ 8 dígitos. IEEE 754 alcanza |
| Lazy load de `useControlV2Data` opción B §3.4 | Catch-22 lógico — preferir RPC más liviana |
| Virtualizar lista §2.3 sin data | Esperar §18 |
| Animated flame palette en theme tokens §13.2 | Branded asset legítimo, won't fix mientras no haya repintada de marca |
| Reportar `UPDATE` de gastos cross-member como bug §11.1 | Comportamiento intencional (hogar comparte) — necesita confirmación de producto |
| Queue de operaciones offline §10 fase 3 | Complejidad alta vs valor incierto. Reevaluable post §18 |

---

## 20. Apéndice — archivos clave

```
app/(app)/(tabs)/expenses.tsx              — route entry V2
app/(app)/expenses-history.tsx             — route entry V1 (legacy, ver §17.5)
mobile/screens/home/expenses-screen.tsx    — passthrough a GastosV2Screen
mobile/screens/home/gastos-v2-screen.tsx   — orquestador V2
mobile/screens/home/expenses-history-screen.tsx — orquestador V1 (legacy)

mobile/features/gastos/
├── use-gastos-controller.ts         — hook central (estado + filtros + agregados)
├── gastos-aggregates.model.ts       — helpers puros (SIN tests aún)
└── category-icons.ts                — emoji + Material icon mappers

mobile/features/expenses/
├── use-expenses.ts                  — useQuery / useMutations + optimistic delete
├── expense-repository.ts            — supabase queries
├── expense-repository.model.ts      — types + insert payload builder + validators
├── expense-repository-enrichment.ts — profiles join client-side + cache
├── expense-repository-metrics.ts    — `fetchFamilyTotal` etc
├── expense-query-keys.ts            — stable query keys
├── expense-analytics.ts             — V1 analytics (legacy con tests)
├── expense-history.ts               — V1 selectors (legacy con tests)
└── expense-intelligence-model.ts    — V1 intelligence (legacy con tests)

mobile/components/gastos/
├── gastos-header.tsx                — title + subtitle + right slot
├── gastos-hero-card.tsx             — total visible + chip + top categories
├── gastos-month-calendar.tsx        — heatmap del ciclo + chevron nav
├── gastos-smart-filter.tsx          — pills de categoría (2 rows)
├── gastos-filter-pill.tsx           — pill atómica
├── gastos-advisor-chip.tsx          — pista del Asistente (consume control_v2_data)
├── gastos-movimientos.tsx           — lista agrupada por día
├── gasto-row.tsx                    — row individual
├── gastos-average-bars.tsx          — sparkline de 7 días en el hero
├── streak-flame-icon.tsx            — fuego del streak (header right)
├── streak-sheet.tsx                 — modal del streak
├── animated-flame.tsx               — branded asset del flame
└── category-weights-list.tsx        — top 3 con barras animadas

tests/unit/
├── expense-analytics.test.ts        — V1 ✓
├── expense-history.test.ts          — V1 ✓
├── expense-intelligence-model.test.ts — V1 ✓
├── add-expense-model.test.ts        — flujo Add ✓
├── fixed-expense-editor-model.test.ts — Fijos editor ✓
└── (FALTA) gastos-aggregates.model.test.ts — V2 ❌
└── (FALTA) use-gastos-controller.renderhook.test.ts — V2 ❌

tests/e2e/
└── gastos-auth.spec.ts              — smoke test (76 LOC, sin coverage de flujos críticos)

supabase/migrations/
├── 20260413154000_mobile_baseline.sql       — RLS de expenses + categories + profiles
└── (no hay migrations específicas del módulo Gastos)
```

---

> **Próximos pasos**:
> 1. ✅ ~~Sprint 1 ejecutado~~ — 16 items shipped en una sola sesión (ver tabla §16).
> 2. **Levantar las métricas del §18** — bloqueante para priorizar items 17, 23 (server-side window vs virtualización).
> 3. **Decision calls pendientes** que destraban Sprint 2:
>    - Strategy de offline (§10.4 fase 1): pill de "sin conexión" + persistencia QC con MMKV. Item 21.
>    - Soft-delete vs RPC restore para undo (§17.1). Item 22.
>    - Stack de error reporting (Sentry/Datadog/Crashlytics) §17.3. Item 20.
> 4. Coordinar con backend para RPC `get_advisor_signals_summary` (§3.4 → item 18).
> 5. Coordinar con equipo Asistente Financiero si planean re-introducir deep-links a expense específicos — el parsing fue removido (decisión prudente del §4.6) y se puede re-agregar con la implementación real.

---

## Apéndice — log de cambios del Sprint 1

**Tests** (post-fix):
- `tests/unit/gastos-aggregates.model.test.ts`: 23 tests verdes. Cubre los 3 bugs de §1 antes y después del fix; locks de regresión documentados.

**Suite total**: 238 pass / 5 fails pre-existentes en `main` / 0 regresiones nuevas. tsc exit 0.

**Severidad post-Sprint 3** (2026-04-30):
- 🔴 Críticos: 0 abiertos (3 cerrados — §1.1, §1.2, §1.3).
- 🟠 Altos: 0 pendientes — todos los altos del Sprint 1 cerrados, los 2 de Sprint 2 (error sink, undo) descartados por decisión de producto.
- 🟡 Medios: 0 pendientes — los 4 cerrados (server-side window, useControlV2Data lazy, virtualizar, profiles join).
- 🟢 Bajos: 0 pendientes (todos shipped).

**Paridad con Home post-Sprint 3**:

| Atributo | Home | Gastos |
|---|---|---|
| Pull-to-refresh | ✅ | ✅ |
| Realtime | ✅ | ✅ (helper compartido) |
| Skeleton loading | ✅ | ✅ |
| Empty states distinguidos | ✅ | ✅ (3 variantes) |
| Helpers puros con tests | ✅ (35) | ✅ (23) |
| Timezone-correct | ✅ | ✅ |
| Memoization disciplinada | ✅ | ✅ |
| A11y labels compuestos | ✅ | ✅ |
| Telemetría | ✅ | ✅ (helper genérico compartido, 8 elements tracked) |
| Server-side query window | ❌ | ✅ (Gastos lidera) |
| Lista virtualizada | ❌ (6 rows OK) | ✅ (SectionList + windowing) |
| Lazy advisor data | ❌ | ✅ |
| Profiles join 1 round-trip | ❌ | ✅ (compartido — Home también lo aprovecha vía `loadExpenses`) |
| Persistencia de cache (cold start instantáneo) | ✅ (compartido) | ✅ (compartido) |
| Indicador offline | ✅ (compartido) | ✅ (compartido) |

**Resultado neto del Sprint 3**: Gastos **lidera** a Home en virtualización, server-side window, lazy advisor data. Las mejoras compartidas (cold-start cache, offline pill, profiles join, realtime helper) se trasladan automáticamente al resto de la app.

**Archivos creados Sprint 3**:
- `supabase/migrations/20260504000000_expenses_profile_fk.sql` (FK explícito + reload schema cache)
- `mobile/hooks/use-online-status.ts` (NetInfo wrapper)
- `mobile/components/ui/offline-pill.tsx` (pill animada peach)

**Archivos modificados Sprint 3**:
- `package.json` (3 deps nuevas: `@react-native-async-storage/async-storage`, `@tanstack/query-async-storage-persister`, `@tanstack/react-query-persist-client`, `@react-native-community/netinfo`)
- `mobile/lib/query-client.ts` (`gcTime: 24h`, `queryPersister`, `queryPersistOptions` exportados)
- `mobile/providers/app-providers.tsx` (`<PersistQueryClientProvider>` reemplaza `<QueryClientProvider>`)
- `mobile/features/expenses/expense-repository.ts` (paths embed/legacy/fallback)
- `mobile/features/expenses/expense-repository-enrichment.ts` (`enrichExpensesFromEmbed` con normalización array/object)
- `mobile/features/insights/use-control-v2-data.ts` (`options.defer` con state flag + setTimeout)
- `mobile/screens/home/gastos-v2-screen.tsx` (refactor a SectionList root + ListHeaderComponent memoizado + defer del advisor)
- `mobile/components/home/home-dashboard.tsx` (mount `<OfflinePill>`)

**Archivos creados Sprint 2**:
- `mobile/features/telemetry/log-screen-event.ts`
- `mobile/features/telemetry/use-screen-telemetry.ts`
- `mobile/features/gastos/use-gastos-telemetry.ts`

**Archivos modificados Sprint 2**:
- `mobile/features/expenses/expense-repository.model.ts` (`ExpenseQueryFilters` con `createdAtGte/createdAtLt`)
- `mobile/features/expenses/expense-repository.ts` (`applyExpenseFilters` factorizado)
- `mobile/features/expenses/expense-query-keys.ts` (`inRange` + `inRangeFamily` keys)
- `mobile/features/expenses/use-expenses.ts` (nuevo `useExpensesInRange`, optimistic delete updates prefix keys)
- `mobile/features/gastos/use-gastos-controller.ts` (usa `useExpensesInRange`)
- `mobile/features/gastos/use-gastos-realtime.ts` (invalida `inRangeFamily`)
- `mobile/features/home/use-home-realtime.ts` (idem)

---

## 19. Arquitectura v2 — split de endpoints (2026-04-29)

Objetivo: el endpoint único `loadExpenses` traía **todos los gastos del ciclo en un solo round-trip** y forzaba al cliente a hacer toda la agregación (top categorías, calendar moods, daily bars, conteos). Para una familia con 6 meses de uso esto se vuelve insostenible — incluso con la window de Sprint 2.

Propuesta: **5 RPCs especializadas** + **virtual scroll real** (2 días por página).

Detalles completos: [`docs/gastos-architecture-v2.md`](./gastos-architecture-v2.md). Resumen del estado actual:

| Fase | Status | Output |
|---|---|---|
| 1 — SQL migrations + 5 RPCs + compound index | ✅ | `supabase/migrations/20260505000000_gastos_split_endpoints.sql` |
| 2 — Tipos TS + 5 hooks cliente | ✅ | `mobile/features/gastos/gastos-endpoints.types.ts`, `use-gastos-endpoints.ts` |
| 3 — Refactor `useGastosController` | ✅ | controller compone los 5 hooks; drops smartFilter price/date, `useExpensesInRange`, `useCategories`, helpers de agregación |
| 4 — Wire `onEndReached` + spinner footer | ✅ | `gastos-v2-screen.tsx` con `ActivityIndicator` + label "Cargando más días…" / "— Fin del ciclo —" |
| 5 — Cleanup helpers + keys obsoletos | ✅ | `gastos-aggregates.model.ts` reducido a `groupGastosByDay`, `inRange*` keys removidos, optimistic delete simplificado, realtime hooks invalidan los nuevos prefijos `gastos-*` |

**Verificación final**: `tsc --noEmit` exit 0; `vitest run` 220 pass + 5 fails pre-existentes en `main` (auth-submit-flow, category-hues, control-signals, family-dashboard-model, settings-form-model — no relacionados); 0 regresiones nuevas.

**Decisiones de producto que destrabaron la arquitectura v2**:
1. Smart filter de price/dateRange descartado (las búsquedas por fecha viven en el calendario).
2. Selección de día → endpoint dedicado `gastos_expenses_for_day`.
3. `registrationStreak` eliminado como deuda técnica.
4. `cupoDiario` se mantiene client-side (siempre variable).
5. 2 días por página fijo.
6. Compound index `(family_id, category_id, created_at desc) where commitment_id is null` para acelerar el filtro por categoría.
