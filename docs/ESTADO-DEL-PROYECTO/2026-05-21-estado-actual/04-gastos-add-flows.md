# 04 — Gastos y flujos de alta (gasto / ingreso)

> Verificado contra commit `7962ea2` · 2026-05-21 · parte del snapshot [docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual](.)

---

## 1. Visión general

### Tres tipos de movimiento

| Tipo | Tabla DB | Pantalla | Descripción |
|---|---|---|---|
| **Gasto variable** | `public.expenses` | Gastos tab + Historial | Gastos sueltos del ciclo: comida, transporte, etc. |
| **Ingreso extra** | `public.income_events` | Modal add-income | Transferencias, bonos, regalos — no el sueldo base |
| **Gasto fijo** | `public.fixed_expenses` + `public.commitments` | Fijos tab | Compromisos recurrentes (alquiler, cuotas) — fuera de scope de este doc |

Los gastos variables son el corazón del dominio documentado aquí. Los ingresos extras suman al "disponible" del ciclo vía `useCycleIncomeEventsTotal` en `useHomeMetrics`. Los fijos se documentan en `03-home-control-fijos.md`.

### Flujo de carga y datos vía `gastos_snapshot`

El Gastos tab usa el patrón **snapshot RPC**: antes de montar el contenido, `<GastosV2Screen>` dispara `gastos_snapshot()` (RPC), que bundlea en una sola llamada de red seis endpoints que antes corrían en paralelo (6× ~540 ms → ~540 ms con seed). El screen **gatea** en `snapshot.data`: mientras el snapshot no resolvió retorna `null` (pantalla vacía breve ~400 ms). Cuando resuelve, seedea síncronamente las 6 caches que los hooks internos van a consumir, y monta `<GastosV2ScreenContent>` con cache hot.

---

## 2. Lista de gastos

### Screen activo: `GastosV2Screen` (alias `ExpensesScreen`)

| Archivo | Estado | Notas |
|---|---|---|
| [`expenses-screen.tsx`](../../../mobile/screens/home/expenses-screen.tsx) | ✅ LIVE | Thin wrapper — re-exporta `GastosV2Screen` |
| [`gastos-v2-screen.tsx`](../../../mobile/screens/home/gastos-v2-screen.tsx) | ✅ LIVE | Implementación real. 1150 líneas |
| Ruta `(tabs)/expenses.tsx` | ✅ LIVE | `<RequireAuth>` → `<ExpensesScreen>` |

`expenses-screen.tsx` es deliberadamente delgado: simplemente instancia `<GastosV2Screen>`. El comentario en el archivo dice textualmente: "The Expenses tab now renders the V1 Cuaderno redesign (GastosV2Screen)."

### Estructura interna de `GastosV2Screen`

La pantalla tiene dos componentes:

- **`GastosV2Screen`** (gate): llama `useGastosSnapshot()`, retorna `null` si no resolvió.
- **`GastosV2ScreenContent`** (contenido): montado solo después del snapshot. Consume el controller, la telemetría y el realtime.

El contenido usa un `<SectionList>` virtualizado con:

- `windowSize={9}`, `removeClippedSubviews`, `initialNumToRender={12}`, `maxToRenderPerBatch={10}`
- `onEndReachedThreshold={0.5}` → dispara `controller.fetchNextPage()` para paginación infinita
- `ListHeaderComponent` memoizado con hero card, calendario, smart filter, advisor chip y "Movimientos" title
- `stickySectionHeadersEnabled={false}`
- `RefreshControl` con `tintColor` y `colors` theme-aware

### GastoRow — componente de fila

[`gasto-row.tsx`](../../../mobile/components/gastos/gasto-row.tsx)

Componente `memo` con todos props primitivos (title, categoryName, categoryColor, whoName, whoColor, amount, time, notes) → comparación shallow exacta, 0 re-renders durante scroll cuando los datos no cambian.

Detalles internos clave:

| Feature | Implementación |
|---|---|
| **hexAlpha memoizado** | `tile.bg` y `tile.border` se computan una sola vez por `categoryColor` con `useMemo` — evita 4 string-parses + rgba-allocs por render en la hot path del scroll |
| **catChipTextColor accesible** | `lightenForDarkBg` / `darkenForLightBg` (hue-preserved) → ≥6:1 en light, ≥5:1 en dark. El hue de la categoría se preserva (identidad visual) |
| **iconTileStyle / catChipStyle** | Arrays de estilos memoizados para identity reference estable |
| **notes** | Tercer línea condicional: si `notes` es truthy (post-trim), renderea `"{trimmedNotes}"` en italic muted, `numberOfLines={1}` |
| **fontVariant: tabular-nums** | amount right-aligned sin wobble por glifos proporcionales |
| **Emoji icon** | `pickIconForCategory(categoryName)` — emoji estático por categoría |

Estructura visual del row: `iconTile (38×38 rounded 12 con emoji) + WhoPaidAvatar superpuesto (16px)` → `body (title + subRow[catChip + meta] + notes?)` → `amountBlock`.

### Swipe-to-delete

La fila se envuelve en `<SwipeableRow>` ([`swipeable-row.tsx`](../../../mobile/components/ui/swipeable-row.tsx)) de RNGH usando `react-native-gesture-handler/ReanimatedSwipeable`. La acción derecha es `{ label: 'Eliminar', tone: 'danger', icon: 'delete', onPress: handleDelete }`.

El handler dispara `useDeleteExpense.mutate(expenseId)` con feedback háptico `'warning'` al iniciar y `'success'`/`'error'` al resolver. La mutación tiene **optimistic update** completo: cancela queries activos, snapshottea caches previas, elimina la fila localmente, y revierte en `onError`. El `isProcessing` prop indica visualmente el estado pendiente en el row.

Nota de arquitectura: se debe mantener `freezeOnBlur: false` en `<Tabs>` (ver `feedback_freeze_on_blur_breaks_gestures.md` en MEMORY.md) — de lo contrario el swipe-to-delete se rompe tras la primera navegación.

### Animaciones de fila

Las animaciones (`FadeIn.duration(180)`, `FadeOut.duration(140)`, `LinearTransition.duration(220)`) están **gateadas** por un flag `rowAnimationEnabled` que solo se activa ~500 ms cuando el usuario cambia un filtro. Cold mount y scroll normal → 0 worklets de entering/layout → no hay contención con la transición de tab (240 ms nativa).

### Paginación

El controller expone `fetchNextPage()`, `hasNextPage`, `isFetchingNextPage`. La pantalla muestra un spinner de "Cargando más días..." en el `ListFooterComponent`, y un marcador "FIN DEL CICLO" con rules horizontales cuando no hay más páginas y hay gastos. Cada página carga 7 días (configurable vía `daysPerPage` en el snapshot, default `7`).

### Estados vacíos

Cuatro variantes según contexto:

| Caso | Variante | Componente / Copy |
|---|---|---|
| `expenses.length === 0` (primera vez) | **onboarding** — ver §2a | `<GastosEmptyState>` con CTA "Cargar mi primer gasto" |
| `filteredExpenses.length === 0 && hasAnyFilter` | **filtered** | "No hay movimientos para este filtro" + botón "Limpiar filtros" |
| Sin filtro pero ciclo sin gastos (hay expenses históricas, ciclo actual en cero) | **cycle** | "Aún sin gastos en este ciclo" |
| Error de red + 0 gastos | **error** | `<ErrorState>` con botón "Reintentar" |

Las variantes **filtered** y **cycle** se renderizan como `ListEmptyComponent` del `SectionList`. La variante **onboarding** reemplaza completamente la rama del SectionList (ver §2a). La variante **error** también reemplaza la rama completa.

---

## 2a. Empty state de primera vez (onboarding)

### Cuándo se activa

`GastosV2ScreenContent` evalúa `isEmptyAccount = !controller.error && controller.expenses.length === 0` **después** de que el snapshot resolvió (el gate de `GastosV2Screen` retorna `null` hasta que `snapshot.data` existe). Esto garantiza que `expenses.length === 0` significa "cuenta nueva", no un flash de carga.

### Componente: `GastosEmptyState`

[`gastos-empty-state.tsx`](../../../mobile/components/gastos/gastos-empty-state.tsx)

Estructura:

1. **Intro card** — ícono `receipt-long`, título "Todavía no registras gastos", cuerpo explicativo ("Aquí ves cada movimiento del hogar: cuánto llevas gastado en el ciclo, tu cupo diario y el detalle por día. Agrega el primero para empezar."), y el CTA primario `<AppButton label="Cargar mi primer gasto" variant="primary" />`.
2. **Eyebrow "ASÍ SE VA A VER"** — etiqueta muted (11pt, 800 weight, 1.4 letter-spacing) que introduce la sección de previews.
3. **Tres bloques `<PreviewBlock>`** — cada uno con ícono + mini-título + descripción de una línea, seguido del componente real en modo vacío:
   - **Resumen del ciclo** → `<GastosHeroCard empty />` (ícono `donut-large`)
   - **Mapa del mes** → `<GastosMonthCalendar empty ... />` con `dayMoods={}` y el mes real del calendario (no inventado — ciclo que arranca el 1ro del mes actual, duración real)
   - **Tus movimientos** → tres `<GastoRow placeholder />` apilados (ícono `receipt-long`)

**Principio de diseño:** ningún preview muestra datos inventados. `GastosHeroCard empty` sustituye todos los valores por "—". `GastosMonthCalendar empty` es un calendario genuino (mes real, hoy real) sin marcas de gasto. `GastoRow placeholder` muestra el layout con dashes mudos.

### Modos vacíos de los componentes internos

| Componente | Prop | Efecto |
|---|---|---|
| `GastosHeroCard` | `empty?: boolean` | Early-return a `<GastosHeroCardEmpty>`: misma shell de gradiente + etiquetas ("PROMEDIO DÍA", "MÁS PESO"), pero todos los valores y barras reemplazados por "—". Sin shine ni particles (se lee como preview inerte, no como card live). |
| `GastosMonthCalendar` | `empty?: boolean` | Grilla inerte (sin tap-to-filter). El flag indica al caller que la renderice con opacidad reducida; el componente en sí no tiene estilo propio de opacidad. |
| `GastoRow` | `placeholder?: boolean` | Early-return a `<GastoRowPlaceholder>`: mismo layout (icon tile + body + amount), muted dashes sin título, categoría, autor ni monto. |

### CTA y navegación

El botón "Cargar mi primer gasto" llama `onAddFirst` → en el screen, `handlePressAdd` → `router.push('/(app)/add-expense')`, idéntico al botón `+` del tab bar.

### Integración con el guided tour

El screen registra el `ScrollView` del `<Screen>` scrollable (vía `scrollRef={tourScrollRef}`, `onScroll={onTourScroll}`, `onContentSizeChange={onTourContentSizeChange}`) como superficie de scroll del tour `GASTOS_TOUR`. Como el `SectionList` no se monta en este branch, sin este wiring el tour-host no puede medir el viewport y aborta el posicionado del cutout.

`GastosEmptyState` recibe `renderSection?: (slot: GhostSlot, children) => ReactNode`. El screen pasa un wrapper que envuelve cada preview (`'hero'`, `'calendar'`, `'list'`) en `<TourTarget>` con el step correspondiente de `GASTOS_TOUR_STEPS`. El step `filters` (order 3) no tiene target en el empty screen y el tour-engine lo omite silenciosamente (solo camina targets registrados). El `GastosHeader` con `StreakFlameIcon` y su `TourTarget` (`streak` step) se conserva encima del `<GastosEmptyState>`.

---

## 3. Alta de gasto

### Ruta y screen

| Archivo | Estado |
|---|---|
| `app/(app)/add-expense.tsx` | ✅ LIVE |
| [`add-expense-screen.tsx`](../../../mobile/screens/home/add-expense-screen.tsx) | ✅ LIVE |
| `(tabs)/add.tsx` | ✅ LIVE — `<Redirect href="/(app)/add-expense" />` |

El tab "Add" del bottom bar es un redirect a `/(app)/add-expense`, que se presenta como modal (`<ModalContentEntrance>`).

### AddExpenseScreen

Parsea el param `date` (formato `YYYY-MM-DD`) para el flujo de **back-date** (registrar gasto olvidado desde el calendario). La función `parseBackdateParam` valida formato, no NaN, y rechaza fechas futuras. Instancia `useAddExpenseController` y `useControlV2Data` (señales del advisor, reutiliza cache sin red extra).

Renderea `<AddExpenseDashboard>` salvo errores: si no hay categorías cargadas muestra `<EmptyState stateKey="categories">` con CTA "Crear categoría".

### AddExpenseDashboard

[`add-expense-dashboard.tsx`](../../../mobile/components/home/add-expense-dashboard.tsx)

Stack vertical con `RiseView` staggered:

1. **Pill de back-date** (solo si `forDate`) — "REGISTRANDO PARA · {día}"
2. **AmountCard** — toca para abrir el numpad
3. **SuggestedAmountStrip** — chips de `[5000, 15000, 30000, 50000, 100000]` (deltas acumulativos)
4. **AddExpenseAdvisorBanner** — banner contextual si hay señal activa para la categoría
5. **CategoryHorizontalRail** — carrusel de categorías rankeadas por uso
6. **DescriptionRow** — input + sugerencias rápidas (historial + templates)
7. **NotesRow** — campo colapsable (detallado en §7)
8. **AppButton "Guardar gasto"** — deshabilitado si `!canSubmit`

`canSubmit = hasValidAmount && Boolean(selectedCategoryId)`.

Cualquier tap en un control no-texto llama `Keyboard.dismiss()` antes de su acción — patrón coherente con AddFijo.

### useAddExpenseController

[`use-add-expense-controller.ts`](../../../mobile/features/expenses/use-add-expense-controller.ts)

| State | Tipo | Default |
|---|---|---|
| `categorySelection` | string | `''` (se normaliza al primer item disponible) |
| `description` | string | `''` |
| `notes` | string | `''` |
| `rawPrice` | string | `''` |
| `isNumpadVisible` | boolean | `true` |

**Lógica de categorías:**
- `useCategories(familyId)` filtra con `filterVariableExpenseCategories` — oculta Alquiler, Servicios, Suscripciones, Impuestos, Educacion, Salud del picker de gastos variables (match case-insensitive + diacritic-stripped en el nombre, no en el id)
- `rankedCategories`: `rankCategoriesByUsage(expenses, categories)` — ordena por frecuencia de uso histórico
- `selectedCategoryId`: fallback al primer item si la selección no existe en la lista

**Sugerencias de descripción:**
- De historial: `pickTopCategoryDescriptions(expenses, selectedCategory.id, 6)` — top N descripciones manuales de la categoría
- De templates: tabla `category_templates` (RPC `useCategoryTemplates`) — descripciones predefinidas por categoría
- Merge: historial primero, luego templates, dedup por `normalizeSuggestionLabel` (lowercase + strip diacritics + trim), máx 6

**Validaciones en submit:**
- `selectedCategoryId` truthy
- `hasValidAmount` (parsePrice retorna un número finito > 0)
- En `expense-repository.model.ts`: `validateExpenseDescription` (obligatoria, max 200 chars), `validateExpensePrice` (finito, ≥ 0, ≤ 1_000_000_000), `normalizeExpenseNotes` (empty → null, max 500 chars)

**Back-date:** Si `forDate` está seteado, el `createdAt` del insert es `new Date(año, mes, día, 12, 0, 0)` en hora local (mediodía, evita DST edge cases).

**onSuccess:** limpia `description`, `notes`, `rawPrice` y llama `onCreated()` (→ `router.back()`). Dispara `sendFamilyPush` con título "Nuevo gasto cargado".

**Optimistic update:** `useCreateExpense` **no** tiene optimistic update (solo delete lo tiene). La invalidación tras create cubre `invalidateFamilyBudgetData` con `includeFixedExpenses: true`, `includeNotifications: true`.

### Numpad

[`lib/numpad-visibility.ts`](../../../mobile/lib/numpad-visibility.ts) — módulo observable de nivel de módulo (no React context) que coordina la visibilidad y altura del numpad con cualquier superficie bottom-anchored. Expone:

- `publishNumpadOpen(height)` / `publishNumpadHeight(height)` / `publishNumpadClose()`
- `useNumpadOffset()` → retorna el offset vertical que una surface bottom-anchored debe reservar

El `<InAppNumpad>` (en `components/ui/in-app-numpad.tsx`) usa este sistema. El controller del add-expense inicia `isNumpadVisible: true` pero lo delega al `AddExpenseDashboard` que lo maneja con estado local.

---

## 4. Alta de ingreso

### Ruta y screen

| Archivo | Estado |
|---|---|
| `app/(app)/add-income.tsx` | ✅ LIVE |
| [`add-income-screen.tsx`](../../../mobile/screens/home/add-income-screen.tsx) | ✅ LIVE |

Modal con `<ModalContentEntrance>` + `<RequireAuth>`.

### Implementación

Stack vertical con `RiseView` staggered:

1. **Pill de back-date** (solo si `dayOffset !== 0`) — "ayer" / "anteayer"
2. **AmountCard** — toca para abrir `<InAppNumpad>`
3. **SuggestedAmountStrip** — chips `[5000, 15000, 30000, 50000, 100000]` (deltas)
4. **Kind picker (2×2 grid)** — 4 tipos: Transferencia, Bono, Regalo, Otro
5. **DescriptionRow** — sugerencias hardcodeadas: `['Transferencia', 'Aguinaldo', 'Bono trabajo', 'Regalo cumple', 'Freelance', 'Reintegro']`
6. **Day chips** — Hoy / Ayer / Anteayer (offsets 0/1/2)
7. **AppButton "Guardar ingreso"** — `canSubmit = hasValidAmount && Boolean(kind)`

**Diferencias vs add-expense:**
- No hay categorías (solo `kind` enum: `'transfer' | 'bonus' | 'gift' | 'other'`)
- No tiene campo `notes`
- Back-date es por chips de día (hoy/ayer/anteayer), no por param de ruta
- Persiste en `public.income_events` vía `useCreateIncomeEvent()` → invalida `invalidateFamilyBudgetData`

**Validaciones:** `hasValidAmount` y `kind` truthy. Sin otras validaciones locales más allá del `parsePrice`.

**Error handling:** `submitErrorMessage` inline en el form (no solo Alert) + `Alert.alert`.

---

## 5. Historial, filtros y búsqueda contextual

### ExpensesHistoryScreen

| Archivo | Estado |
|---|---|
| `app/(app)/expenses-history.tsx` | ✅ LIVE |
| [`expenses-history-screen.tsx`](../../../mobile/screens/home/expenses-history-screen.tsx) | ✅ LIVE |

La pantalla de historial no es el tab activo (ese es GastosV2). Es accesible vía ruta `/expenses-history` y también desde el Insights/Control screen. Muestra `ExpenseHistoryHeroCard`, `ExpenseHistoryContentCard`, toolbar con botones a filtros y categorías.

Consume `useExpenseHistoryController(familyId, theme)` que internamente usa `useExpenseHistoryFilters` (store), `useCategories`, `useExpenses`, `useFamilyDashboard`.

Filtra automáticamente los gastos con `commitment_id` (fijos autopagados) — solo muestra gastos manuales.

### Store de filtros — `expense-history-filters.store.ts`

[`expense-history-filters.store.ts`](../../../mobile/features/expenses/expense-history-filters.store.ts)

Store de módulo (`useSyncExternalStore`) con estado por `familyId`. **No persiste a disco** (solo en memoria de sesión). Al salir de la app se resetea.

| Campo | Tipo | Default |
|---|---|---|
| `categorySelection` | string | `'all'` (= `ALL_CATEGORIES_KEY`) |
| `periodFilter` | `'cycle' \| 'week' \| 'today' \| 'all'` | `'cycle'` |
| `searchQuery` | string | `''` |

`filtersAreDirty` = true si alguno difiere del default. La ExpenseHistoryToolbar muestra indicador visual cuando `filtersAreDirty`.

### ExpenseFiltersScreen

[`expense-filters-screen.tsx`](../../../mobile/screens/home/expense-filters-screen.tsx)

Modal. Muestra:
- `TextField` con `returnKeyType="search"` para `searchQuery`
- Chips de período: Ciclo / 7 días / Hoy / Todo
- Chips de categoría (todas las categorías de la familia)

Los cambios son drafts locales — se aplican al store solo al presionar "Aplicar filtros".

### Búsqueda contextual — decisión de owner: SKIP

La búsqueda en filtros está implementada en `ExpenseFiltersScreen` (campo de texto, persistida en el store como `searchQuery`) y consumida en `useExpenseHistoryController` (normaliza a lowercase, filtra por description/category name). Esta búsqueda pertenece al flujo de **Historial**, no al Gastos tab principal.

**Búsqueda global (search bar en Gastos tab): descartada por decisión de owner.** El `GastosV2Screen` no tiene search bar. Los filtros del tab Gastos (categoría + día del calendario) son el mecanismo de exploración. El historial tiene su búsqueda por texto pero está en pantalla separada.

---

## 6. Categorías

### ExpenseCategoriesScreen

| Archivo | Estado |
|---|---|
| `app/(app)/expense-categories.tsx` | ✅ LIVE |
| [`expense-categories-screen.tsx`](../../../mobile/screens/home/expense-categories-screen.tsx) | ✅ LIVE |

Modal. Lista todas las categorías de la familia (`useCategories(familyId)`), muestra count de gastos por categoría, permite:
- Crear nueva categoría (`useCreateCategory`)
- Renombrar (`useRenameCategory`)
- Eliminar (`useDeleteCategory` — guarda: valida que no tenga gastos antes de eliminar, Alert si tiene)

La selección activa en el modal (managed por `categoryManagementSelection`) se sincroniza con el store de filtros del historial vía `resolveSelectedCategoryId` / `resolveManagedCategoryId`.

La pantalla se accede desde la toolbar del `ExpensesHistoryScreen` (botón de categorías).

### use-categories.ts

[`use-categories.ts`](../../../mobile/features/categories/use-categories.ts)

`useCategories(familyId, scope = 'expense')` — query React Query con `staleTime: 5 * 60_000`.

- **Scope `'expense'`**: gastos variables
- **Scope `'fixed_expense'`**: categorías de fijos (`useFixedExpenseCategories`)
- Fallback para schemas pre-scope: si falla con código `42703`/`PGRST204` y el mensaje menciona columnas opcionales, hace fallback a select sin columnas opcionales
- Color fallback: hash determinístico del `categoryId` → uno de 12 colores pastel hardcodeados

La interfaz `Category` tiene: `id`, `family_id`, `name`, `color`, `template_id`, `scope`, `created_at`.

### Catálogo por defecto

Migration `20260419182000_expand_default_expense_categories.sql` + `20260424160000_consolidate_gastos_categories.sql` establece el catálogo base.

### Category hues

[`theme/category-hues.ts`](../../../mobile/theme/category-hues.ts)

19 claves (`CategoryHueKey`): comida, restaurante, supermercado, transporte, viajes, casa, servicios, suscripciones, salud, belleza, ocio, deporte, educacion, tecnologia, mascotas, ropa, regalos, inversiones, otros.

Cada clave tiene `light: { surface, ink }` y `dark: { surface, ink }` — tuneados para AA contrast en ambos modos. Se usan en las vistas de categorías y badges.

### Category templates

[`use-category-templates.ts`](../../../mobile/features/categories/use-category-templates.ts)

Tabla `category_templates` — sugerencias de descripción rápida por categoría template. Sin `staleTime` personalizado (usa global). Se consume en `useAddExpenseController` para rellenar `quickDescriptionSuggestions`.

---

## 7. Notas en gastos

### Contexto

Feature agregada en migration `20260519000000_expenses_notes.sql`. Motivación: "engagement gaps §2.5 — notes/comments en gastos". La `description` es corta y obligatoria (max 200); `notes` es complementaria, opcional, hasta 500 chars.

### Columna DB

```sql
alter table public.expenses add column if not exists notes text null;
add constraint expenses_notes_length_check check (notes is null or length(notes) <= 500);
```

### RPCs actualizadas

La migración `20260519000000` actualiza **3 RPCs** para proyectar `notes`:

| RPC | Incluye notes ahora |
|---|---|
| `home_snapshot()` | Sí — en el bloque `expenses` |
| `gastos_expenses_paginated()` | Sí |
| `gastos_expenses_for_day()` | Sí |

El `gastos_snapshot()` (migration `20260514030000`) llama internamente a `gastos_expenses_paginated`, por lo tanto también hereda `notes`.

### Modelo de datos cliente

En `expense-repository.model.ts`:
- `RawExpense.notes?: string | null`
- `Expense.notes: string | null`
- `CreateExpenseInput.notes?: string | null`
- `UpdateExpenseInput.notes?: string | null`
- `EXPENSE_NOTES_MAX_LENGTH = 500`
- `normalizeExpenseNotes(notes)`: undefined/null → null; string vacío post-trim → null; con contenido → trimmed + validado

`buildExpenseInsertPayload` solo incluye el campo `notes` si es un string con longitud > 0 (evita insertar `notes: undefined` que lo dejaría como NULL implícito).

### UI — NotesRow (alta)

[`notes-row.tsx`](../../../mobile/components/home/notes-row.tsx)

Campo colapsable en el form de add-expense:

- **Collapsed** (default): pill "+ Agregar nota" con ícono `edit-note` y texto "opcional"
- **Expanded**: `TextInput` multiline (minHeight 72, borderRadius 12), counter `{n}/500` (se pone rojo cuando quedan < 50 chars), botón "X" para colapsar + limpiar
- Se abre automáticamente si `notes.length > 0` en mount (ej: edición de gasto existente)
- Animación: `LinearTransition.duration(220)` en el parent + `FadeIn/FadeOut` en collapsed/expanded

### UI — GastoRow (display)

Tercer línea en el row: `"{trimmedNotes}"` en italic, `fontSize: 11`, `color: textSoft`, `numberOfLines={1}`. Solo se renderea si `trimmedNotes` es truthy. Las comillas tipográficas son parte del template string del JSX.

### Flujo completo de una nota

1. Usuario toca "+ Agregar nota" → `expanded=true`
2. Escribe texto libre (multiline, max 500)
3. Toca "Guardar gasto" → `useAddExpenseController.submitExpense()` → `createExpenseMutation.mutate({ notes })` → `expense-repository.createExpense()` → `buildExpenseInsertPayload` incluye `notes` → insert en Supabase
4. En la lista, el campo vuelve vía `gastos_expenses_paginated` (que ya incluye `notes`)
5. `GastoRow` lo renderiza como tercera línea

---

## 8. Inventario de componentes y features

### components/gastos/ (13 archivos)

| Archivo | Descripción |
|---|---|
| [`animated-flame.tsx`](../../../mobile/components/gastos/animated-flame.tsx) | Llama animada del streak con Reanimated (no verificado detalle) |
| [`category-weights-list.tsx`](../../../mobile/components/gastos/category-weights-list.tsx) | Lista de categorías con barras de peso (top categories del hero) |
| [`gasto-row.tsx`](../../../mobile/components/gastos/gasto-row.tsx) | Row de movimiento en SectionList — ver §2; soporta prop `placeholder` para preview vacío |
| [`gastos-advisor-chip.tsx`](../../../mobile/components/gastos/gastos-advisor-chip.tsx) | Chip contextual del asistente financiero (bajo el fold) |
| [`gastos-average-bars.tsx`](../../../mobile/components/gastos/gastos-average-bars.tsx) | Barras de promedio diario de los últimos 7 días |
| [`gastos-empty-state.tsx`](../../../mobile/components/gastos/gastos-empty-state.tsx) | Onboarding de primera vez: intro card + 3 previews con componentes reales en modo vacío — ver §2a |
| [`gastos-filter-pill.tsx`](../../../mobile/components/gastos/gastos-filter-pill.tsx) | Pill individual de filtro por categoría |
| [`gastos-header.tsx`](../../../mobile/components/gastos/gastos-header.tsx) | Header del tab con "Ciclo {label}" + slot derecho |
| [`gastos-hero-card.tsx`](../../../mobile/components/gastos/gastos-hero-card.tsx) | Card principal: total, top categorías, promedio diario, barras recientes; soporta prop `empty` para preview vacío |
| [`gastos-month-calendar.tsx`](../../../mobile/components/gastos/gastos-month-calendar.tsx) | Grilla mensual con moods por día, selector de día, nav prev/next; soporta prop `empty` para preview vacío |
| [`gastos-smart-filter.tsx`](../../../mobile/components/gastos/gastos-smart-filter.tsx) | Carrusel horizontal de pills de categoría con counts |
| [`streak-flame-icon.tsx`](../../../mobile/components/gastos/streak-flame-icon.tsx) | Ícono 44×44 con badge de racha actual |
| [`streak-sheet.tsx`](../../../mobile/components/gastos/streak-sheet.tsx) | Bottom sheet de detalle de racha |

### features/expenses/ (23 archivos)

| Archivo | Descripción |
|---|---|
| `daily-budget-engine.ts` | Motor de cupo diario (no verificado detalle) |
| `expense-analytics.dates.ts` | Helpers de fechas para analytics |
| `expense-analytics.focus.ts` | Focus/lens de analytics |
| `expense-analytics.forecast.ts` | Proyección de gastos |
| `expense-analytics.helpers.ts` | Utilidades generales de analytics |
| `expense-analytics.suggestions.ts` | Sugerencias analíticas |
| `expense-analytics.ts` | Entry point de analytics |
| `expense-analytics.types.ts` | Tipos de analytics |
| `expense-history-breakdown.ts` | Genera breakdown de gastos por categoría/período |
| [`expense-history-filters.store.ts`](../../../mobile/features/expenses/expense-history-filters.store.ts) | Store de filtros del historial — ver §5 |
| `expense-history-grouping.ts` | Agrupa gastos por día para el SectionList del historial |
| `expense-history.ts` | Helpers de snapshot del historial (buildExpenseHistorySnapshot, etc.) |
| `expense-history.types.ts` | Tipos del historial |
| `expense-intelligence-model.ts` | Modelo de inteligencia para sugerencias |
| [`expense-query-keys.ts`](../../../mobile/features/expenses/expense-query-keys.ts) | Query keys centralizadas (family, list, recent, periodTotal, monthlySpent) |
| `expense-repository-enrichment.ts` | Enriquece rows crudas (join con profiles) |
| `expense-repository-metrics.ts` | fetchFamilyMonthlySpent, fetchFamilyTotal, fetchFamilyPeriodTotal |
| [`expense-repository.model.ts`](../../../mobile/features/expenses/expense-repository.model.ts) | Interfaces, validaciones, builders |
| [`expense-repository.ts`](../../../mobile/features/expenses/expense-repository.ts) | CRUD Supabase: loadExpenses, createExpense, updateExpense, deleteExpense |
| [`use-add-expense-controller.ts`](../../../mobile/features/expenses/use-add-expense-controller.ts) | Controller del form de alta — ver §3 |
| [`use-expense-history-controller.ts`](../../../mobile/features/expenses/use-expense-history-controller.ts) | Controller del historial — ver §5 |
| [`use-expenses.ts`](../../../mobile/features/expenses/use-expenses.ts) | useExpenses, useRecentExpenses, useCreateExpense, useUpdateExpense, useDeleteExpense |
| [`variable-expense-categories.ts`](../../../mobile/features/expenses/variable-expense-categories.ts) | filterVariableExpenseCategories — ver §3 |

### features/gastos/ (8 archivos)

| Archivo | Descripción |
|---|---|
| `category-icons.ts` | `pickIconForCategory(name)` → emoji por categoría |
| [`gastos-aggregates.model.ts`](../../../mobile/features/gastos/gastos-aggregates.model.ts) | Tipos (CategoryLite, GastosGroup, etc.) + `groupGastosByDay` presentacional |
| [`gastos-endpoints.types.ts`](../../../mobile/features/gastos/gastos-endpoints.types.ts) | Tipos de respuesta de las 5 RPCs especializadas |
| [`use-gastos-controller.ts`](../../../mobile/features/gastos/use-gastos-controller.ts) | Controller principal del Gastos tab — compone los 5 endpoint hooks |
| [`use-gastos-endpoints.ts`](../../../mobile/features/gastos/use-gastos-endpoints.ts) | 5 hooks: useGastosHeroSummary, useGastosCalendarSummary, useGastosCategoriesWithCounts, useGastosExpensesPaginated, useGastosExpensesForDay |
| [`use-gastos-realtime.ts`](../../../mobile/features/gastos/use-gastos-realtime.ts) | Subscripción realtime a `expenses` y `categories` — invalidación por prefix |
| [`use-gastos-snapshot.ts`](../../../mobile/features/gastos/use-gastos-snapshot.ts) | Hook + seeder del snapshot RPC — ver §9 |
| [`use-gastos-telemetry.ts`](../../../mobile/features/gastos/use-gastos-telemetry.ts) | Telemetría de sesión del tab Gastos |

### features/categories/ (2 archivos)

| Archivo | Descripción |
|---|---|
| [`use-categories.ts`](../../../mobile/features/categories/use-categories.ts) | CRUD completo de categorías — ver §6 |
| [`use-category-templates.ts`](../../../mobile/features/categories/use-category-templates.ts) | Query de `category_templates` para quick descriptions |

### features/income/ (1 archivo)

| Archivo | Descripción |
|---|---|
| [`use-income-events.ts`](../../../mobile/features/income/use-income-events.ts) | useIncomeEvents, useCycleIncomeEventsTotal, useCreateIncomeEvent |

---

## 9. Datos y snapshot

### Tabla `expenses`

Columnas relevantes: `id`, `family_id`, `category_id`, `commitment_id` (null en gastos manuales), `description` (max 200, obligatoria), `notes` (max 500, nullable, desde migración 20260519000000), `price` (numeric), `created_by`, `created_at`.

FK: `expenses_created_by_profile_fkey` (migration `20260504000000_expenses_profile_fk.sql`) — permite el embed de `profiles!inner(display_name)` en un solo round-trip.

### Patrón Snapshot RPC — gastos_snapshot

Migration: `20260514030000_gastos_snapshot.sql`

```
gastos_snapshot(
  p_family_id, p_cycle_start, p_cycle_end,
  p_today, p_cupo_diario, p_days_per_page (default 7),
  p_timezone (default 'America/Argentina/Buenos_Aires')
) → jsonb
```

Internamente llama 4 RPCs hijas + 2 selects directos:

| Componente | RPC / Query |
|---|---|
| `hero` | `gastos_hero_summary()` |
| `calendar` | `gastos_calendar_summary()` |
| `categories` | `gastos_categories_with_counts()` |
| `first_page` | `gastos_expenses_paginated()` (p_days_per_page días) |
| `streak_row` | SELECT directo sobre `user_streaks` |
| `streak_marked_days` | SELECT directo sobre `streak_marked_days` |

**Security:** SECURITY DEFINER + membership check propio (`family_members` where `role <> 'blocked'`). Cap defensivo: `p_days_per_page` se clampea a [1, 31].

**Cliente — useGastosSnapshot:**
- `queryKey`: `['gastos-snapshot', familyId, userId, cycleStartIso, cycleEndIso, todayIso, cupoDiario, null]`
- `staleTime: 60_000` (el contenido cambia más seguido que home)
- `refetchOnWindowFocus: true`, `refetchOnReconnect: true`
- El `queryFn` seedea síncronamente las 6 caches antes de retornar el payload

**Caches seeded:**
| Cache | Key |
|---|---|
| Hero | `gastosEndpointKeys.hero(familyId, cycleStartIso, cycleEndIso, todayIso, null)` |
| Calendar | `gastosEndpointKeys.calendar(familyId, cycleStartIso, cycleEndIso, todayIso, cupoDiario, null)` |
| Categories | `gastosEndpointKeys.categories(familyId, cycleStartIso, cycleEndIso)` |
| Paginated (infinite) | `gastosEndpointKeys.paginated(...)` con `{ pages: [firstPage], pageParams: [null] }` |
| Streak row | `streakQueryKey(familyId, userId)` |
| Marked days | `markedDaysQueryKey(familyId, userId)` |

**prefetchGastosSnapshot:** ✅ LIVE. Lo invoca [use-warm-tabs-snapshots.ts:55](../../../mobile/hooks/use-warm-tabs-snapshots.ts#L55) — tras el first-paint de Home, vía `InteractionManager.runAfterInteractions()`, precalienta los snapshots de Gastos y Control para que el primer tap a esos tabs no gatee. Idempotente (React Query dedupe si la key está fresh). _(Corrección 2da pasada: la 1ª pasada lo marcó sin call site; el call site existe en el hook de warm-up.)_

### Realtime

`useGastosRealtime(familyId)` escucha los canales Supabase de `expenses` y `categories`. Al recibir un evento:
- Invalida `expenseQueryKeys.family`, `expenseQueryKeys.recentFamily`
- Invalida por prefix todos los `gastos-hero-*`, `gastos-calendar-*`, `gastos-categories-*`, `gastos-paginated-*`, `gastos-for-day-*`

### Query keys de expenses

```
['expenses', familyId]              → list (todas las expenses del ciclo)
['expenses', familyId, categoryId] → list con filtro de categoría
['expenses-recent', familyId, limit] → feed reciente (home)
['expenses-period-total', ...]      → totales por período
['expenses-monthly-spent', ...]     → histórico mensual
```

---

## 10. Estado vs deuda

### ✅ LIVE y funcionando

- Tab Gastos con `GastosV2Screen` y `gastos_snapshot` RPC
- Empty state de primera vez (`GastosEmptyState`): intro card + previews reales en modo vacío + CTA "Cargar mi primer gasto" + integración con guided tour vía `renderSection` — ver §2a
- Alta de gasto con numpad, categorías rankeadas, sugerencias de descripción, notas opcionales, back-date desde calendario
- Alta de ingreso con kind picker y back-date por chips
- Swipe-to-delete con optimistic update
- Paginación infinita (7 días por página)
- Filtros en historial (período, categoría, texto)
- Realtime en Gastos tab
- Notas en gastos (columna DB + UI form + display en row + RPCs)
- Catálogo de categorías con CRUD completo + templates
- category-hues para theming AA-compliant

### 🟡 PARCIAL

- **Búsqueda por texto**: implementada en `ExpenseFiltersScreen` (persiste en store) pero solo aplica al historial, no al Gastos tab principal. Por decisión del owner, no hay search global en el tab Gastos.
- **`useCreateExpense` sin optimistic update**: a diferencia de delete, create no tiene optimistic row insertion. El gasto aparece tras el round-trip + invalidación de cache.

### ⏸️ EN PAUSA / LEGACY

- `ExpensesHistoryScreen`: sigue accesible en `/expenses-history` pero no es el tab principal. Fue el diseño anterior al Cuaderno V2. Todavía útil para búsqueda textual.
- `gastos-aggregates.model.ts`: la lógica de agregación client-side fue movida a RPCs. Solo sobrevive `groupGastosByDay` (presentacional) y los tipos.
- Los archivos de `expense-analytics.*` (7 archivos) y `expense-intelligence-model.ts`: existentes pero no verificado en qué pantalla los consume actualmente.

### 🔴 NO EXISTE

- Search bar global en el tab Gastos (descartada por decisión de owner)
- Edición inline de gasto en el Gastos tab (solo en historial vía `ExpenseEditorModal`)
