# Fijos pendientes ordenados por vencimiento (cronológico) — Plan

**Goal:** En el listado de Fijos, los ítems salen ordenados por fecha de vencimiento real (`next_due_on`), próximos a vencer primero — en vez de por categoría/total + `dayOfMonth`.

**Diagnóstico:** `groupFijosByCategory` (`mobile/features/fijos/fijos-aggregates.model.ts:643-668`):
- Ordena los GRUPOS por `total` desc (línea 666) → no cronológico.
- Dentro de cada grupo ordena por `dayOfMonth` (línea 663) → mal cuando los fijos cruzan meses (día 5 de julio quedaría antes que día 21 de junio).

**Architecture:** Cambio sort-only en `groupFijosByCategory`. Se mantiene el agrupado por categoría (no se quita), pero ahora: (a) dentro de cada grupo se ordena por `next_due_on` ascendente, y (b) los grupos se ordenan por su fijo más próximo a vencer → el próximo a vencer queda arriba de todo. Aplica a las 3 pestañas (pendientes/vencidos/pagados) — consistente y arregla el bug de `dayOfMonth` en todas.

**Constraints:** cliente (requiere build); validar typecheck + lint + tests + bundle.

---

### Task 1: Ordenar `groupFijosByCategory` por vencimiento

**Files:** Modify `mobile/features/fijos/fijos-aggregates.model.ts:643-668`

- [ ] **Step 1** — Agregar helper `dueOrder(item)` que devuelve el timestamp de `next_due_on` (o `Number.MAX_SAFE_INTEGER` si null/inválido → al final).
- [ ] **Step 2** — Within-group: cambiar `arr.sort((a,b) => a.dayOfMonth - b.dayOfMonth)` → `arr.sort((a,b) => dueOrder(a) - dueOrder(b))`.
- [ ] **Step 3** — Group ordering: cambiar `groups.sort((a,b) => b.total - a.total)` → ordenar por el vencimiento más próximo de cada grupo: `groups.sort((a,b) => dueOrder(a.items[0]) - dueOrder(b.items[0]))` (items[0] = el más próximo tras el sort interno). Tiebreaker `b.total - a.total`.
- [ ] **Step 4** — Validar: typecheck + lint + `npx vitest run` (tests de fijos) + `npx expo export --platform ios`.
- [ ] **Step 5** — Commit.
