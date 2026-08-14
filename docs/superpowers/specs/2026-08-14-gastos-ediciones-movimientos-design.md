# Movimientos de ediciones cerradas en la vista Gastos — diseño

**Fecha:** 2026-08-14 · **Estado:** aprobado por el owner · **Alcance:** hacia adelante ("de ahora en más")

## Contexto

El selector de ciclos de la vista Gastos permite entrar a una edición cerrada, pero solo
muestra agregados de `monthly_summaries` (total, promedio, top categorías, calendario de
intensidad). Los movimientos individuales no se pueden mostrar porque hoy **no existen**:
`close_monthly_cycle` los marca `archived_at` al cierre y `cron_purge_archived_expenses`
los borra definitivamente a los 14 días (`20260512050000_purge_archived_expenses.sql`).
Por eso la edición cerrada muestra el well "Los movimientos no se conservan".

El objetivo: al entrar a una edición cerrada, ver la lista de gastos de ese ciclo junto
con el total ya existente.

## Decisión

**Retener los gastos archivados y reusar el pipeline existente** (enfoque A, elegido
sobre la alternativa de snapshotear un blob JSON al cierre, que duplicaba datos, no
paginaba y obligaba a re-tocar la RPC de cierre dual-mode recién salida a prod).

Lo ya purgado no se recupera: las ediciones cerradas hace más de 14 días quedan con el
fallback (ver §4).

## Diseño

### 1. Retención (backend, 1 migración)

- `cron_purge_archived_expenses()`: el umbral de purga para gastos variables pasa de
  `now() - interval '14 days'` a `now() - interval '13 months'` (12 ediciones del
  dropdown + 1 mes de margen). El chunking de 10k y el schedule quedan igual.
- La regla de retención de fijos (últimos 3 `expenses` por fijo, ledger
  `fixed_expense_payments` intacto — `20260620210000`) no cambia.
- Índice nuevo: `expenses_family_created_idx (family_id, created_at desc)` **completo**
  (sin predicado). El parcial `WHERE archived_at IS NULL` no sirve para ventanas
  históricas y las RPCs de gastos no filtran por `archived_at`, así que ningún índice
  parcial les aplica.

### 2. Datos (cero SQL nuevo)

`gastos_expenses_paginated` y `gastos_expenses_for_day` no filtran por `archived_at`:
sirven tal cual para ventanas pasadas. La vista cerrada llama los mismos hooks
(`useGastosExpensesPaginated` / `useGastosExpensesForDay`) con la ventana
`[period_start, period_end)` de la edición seleccionada. Las query keys ya incluyen la
ventana → sin colisión con el cache del ciclo vivo. Los hooks se habilitan solo cuando
`viewedCycleId != null`, igual que el gate de perf de `useMonthlyEditions`.

### 3. UI (rama cerrada de `neo-gastos-screen.tsx`)

- El well "Los movimientos no se conservan" se reemplaza por el **feed de movimientos
  agrupado por día**, mismo lenguaje visual de filas que el ciclo vivo pero solo
  lectura: sin swipe, sin editar, sin CTAs.
- La rama cerrada sigue siendo ScrollView plano; la paginación por día se maneja con un
  botón "Ver más días" que llama `fetchNextPage`.
- El day-detail cerrado (tap en el calendario) pasa de "MOVIMIENTOS —" a listar los
  gastos reales de ese día, también solo lectura.
- Sin filtro por categoría en v1: la edición cerrada mantiene su carácter plano de solo
  lectura.

### 4. Fallback para ediciones pre-feature

Si la query vuelve vacía pero `expenses_count > 0`, la edición fue purgada antes del
cambio: se muestra el well actual con copy ajustado ("Los movimientos de esta edición no
se conservaron"). Una edición cerrada hace menos de 14 días al momento del deploy
funciona retroactivamente.

### 5. Consistencia

- El feed histórico excluye pagos de fijos (`commitment_id is null`), igual que el vivo;
  el total del hero cerrado ya es `total_variable_spent` → coherente.
- Ciclo extendido: el cierre archiva exactamente `[v_start, v_end)` y esa misma ventana
  queda en `monthly_summaries.period_start/period_end`. El plan de implementación
  verifica explícitamente esa igualdad en `close_monthly_cycle_dual_mode`.

### 6. Errores y testing

- Query fallida en vista cerrada → mismo patrón error/retry de la pantalla.
- Tests unitarios para la lógica pura nueva (agrupado de días del feed cerrado,
  detección del fallback purgado).
- La migración se aplica por el flujo normal (local → staging → prod con ledger
  alineado). Nunca `apply_migration` por MCP a prod.
- QA en device con la cuenta `ciclo.extendido@manifiestoapp.com`.

## Fuera de alcance

- Cambiar el tag del dropdown (muestra el sobrante con signo; el total ya está en el
  hero al entrar).
- Filtros/búsqueda dentro de ediciones cerradas.
- Recuperar movimientos ya purgados.
