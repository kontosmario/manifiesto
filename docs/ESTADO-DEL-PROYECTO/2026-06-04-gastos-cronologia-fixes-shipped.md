# Gastos cronología + income visualization — Shipped 2026-06-04

Status: ✅ Code-complete y merged a `main`. **6 commits** sobre la rama `feature/gastos-cronologia-fixes`. 0 migraciones — todo cliente.

> 📖 **Doc canónico del sistema:** la pantalla Gastos vive en [03-home-control-fijos.md](2026-05-21-estado-actual/03-home-control-fijos.md) y [04-gastos-add-flows.md](2026-05-21-estado-actual/04-gastos-add-flows.md). Esta nota cubre el sprint específico.

---

## TL;DR

Sprint de pulido del listado de Gastos disparado por feedback del owner: "hoy/ayer aparecen al final de la lista" + "ingresos quedan muy desalineados con el resto del UI". Code review pre-trabajo encontró 3 bugs críticos que se shipearon antes del trabajo de diseño. Después: rediseño completo de cómo aparecen los ingresos en el feed (3 iteraciones hasta el final), polish de section headers, fixes de animaciones, y un crash en delete de gasto fijo.

---

## 1. Critical fixes pre-trabajo

3 bugs encontrados en el code review:

### 1.1. Today/yesterday al final de la lista
[gastos-v2-screen.tsx:596](mobile/screens/home/gastos-v2-screen.tsx) sortaba sections por `b.day - a.day` (día-del-mes 1–31). En ciclos que cruzan mes (May 25 → Jun 24), día 31 (May) numéricamente batía día 4 (Jun) → late-May al top, today/yesterday al bottom. Misma key colisionaba "May 15" y "Jun 15" en el Map.

**Fix**: `dateMs` (local-day epoch ms) como key del Map y como sort comparator. Día-del-mes solo se preserva en el type para el copy del header, ya no participa en ordering.

### 1.2. Income cross-month leak en selected-day
Filter era `d.getDate() === selectedDay` sin guard de mes/año. Income del otro mes con mismo día-del-mes bleeding al bucket.

**Fix**: filtrar por `incomeHappenedAtMs(i) === selectedDateMs` (full date match, no solo day-of-month).

### 1.3. Optimistic create/delete invisible en Gastos screen
`useExpenses` mutations solo tocaban `expenseQueryKeys.list/recent`, pero la pantalla Gastos lee de `gastosEndpointKeys.paginatedFamily`. Add/delete sin feedback visual hasta el RPC roundtrip (~200-500ms).

**Fix**: nuevos helpers `patchPaginatedPrepend` / `patchPaginatedRemove` walk every matching InfiniteData cache + for-day caches, con snapshot/restore para rollback en error. `expenseToGastosRow` projection convierte el Expense optimista al shape `GastosExpenseRow`.

---

## 2. Income visualization — 3 iteraciones

### Iteración 1 — IncomeDayBanner (rechazada por owner)

Primer approach: pull income out del inline mix en el día. Render como **banner horizontal** dentro del section header, abajo del date row. Gradient bg tintado primary, icon trending-up, copy compact "Recibí $X · descripción/N ingresos", chevron rotativo para expand/collapse de la lista de incomes.

Feedback: "se desfaza TOTALMENTE con el resto, son dos polos opuestos". El banner se leía como notificación/callout, no como un row del feed.

### Iteración 2 — X button para borrar (rechazada por owner)

El banner exponía una X inline para borrar. Tap mistap → income borrado → el banner era la única superficie donde aparecía → no se podía recuperar.

Feedback: "toqué la X y desapareció del listado y ya no es visible". El user explícitamente perdió un ingreso de 600K así (saldo cayó de 2.4M a 1.8M).

Fix temporal: dropear la X. Income persistente sin manejo desde Gastos.

### Iteración 3 — IncomeRow con misma chrome que GastoRow (final)

[`income-row.tsx`](mobile/components/gastos/income-row.tsx) — mirror 1:1 de la chrome de `GastoRow`:

| Propiedad | GastoRow | IncomeRow |
|---|---|---|
| Card radius | 14 top/bottom-left | **idem** |
| Padding | 12 / 10 | **idem** |
| Card bg | `surfaceMuted` / `creamCard` | **idem** |
| Icon tile | 38×38, radius 12, border 1, category-tinted | 38×38, radius 12, border 1, **primary-tinted** |
| Icon | Emoji por categoría | Emoji por kind (💸 ⭐ 🎁 💵) |
| Título | description (14 / weight 700) | **idem** |
| Pill | Category name, category-color text | **"Transferencia"/"Bono"/"Regalo"/"Ingreso"**, primary text |
| Meta | `· Mario · 12:00` | **idem** |
| Amount | `-$X` en `text` color, tabular-nums | **`+$X` en primary**, tabular-nums |

Identifica como income sin romper la UI — color + pill hacen el trabajo semántico, la forma queda idéntica.

**Composición en sections**: helper `buildSectionData(expenseRows, incomes)` prepend incomes (sort desc por created_at) ABOVE expenses. Income = "primera cosa que pasó en el día", expenses abajo.

**Acciones**: SwipeRow wrap con delete (mismo pattern que expense). Restauré `useDeleteIncomeEvent` + `handleDeleteIncome`. El swipe gesture requiere intención — sin riesgo de mistap como la X. SwipeRow también provee el outer container que da la apariencia de full radius (las 4 esquinas) mientras el row interno tiene solo left-rounded para slottear con el action panel.

---

## 3. Section header polish

[gastos-v2-screen.tsx](mobile/screens/home/gastos-v2-screen.tsx) header de día tenía `backgroundColor` opaco (`DARK_TAB_CANVAS` en dark, `theme.colors.background` en light) heredado de cuando sticky-headers estaba on (ya no: `stickySectionHeadersEnabled={false}`). Se leía como un "bloque" pesado detrás del título.

**Fix**:

| Antes | Después |
|---|---|
| Block opaco envolviendo el header | Shell `transparent`, label sobre canvas |
| Day label 14px / weight 700 / `text` (parece "section title") | Eyebrow 11px / weight 900 / letter-spacing 1.2 / `textMuted` UPPERCASE |
| Sin separador entre días | Hairline divider `theme.colors.line` arriba de cada sección, opacity 0.7 |
| Meta 11px sin polish | 10px / weight 600 / letter-spacing 0.2 / `textSoft` |
| Total 14px sin letter-spacing | 14px tabular-nums + `letterSpacing -0.2` |

---

## 4. Animation polish

### 4.1. Home activity slide-in glitch (bug del code review)

[`slide-in-view.tsx`](mobile/components/home/animated/slide-in-view.tsx): el useEffect re-corría cada vez que cambiaba el `delay` prop. Al prependear en la lista, los indexes shifteaban → `delay = base + index * step` cambiaba → todas las filas visibles re-animaban.

**Fix**: `hasAnimatedRef` flag → entrance una sola vez por instance.

### 4.2. Add/remove animations en Gastos

[gastos-v2-screen.tsx](mobile/screens/home/gastos-v2-screen.tsx): `rowAnimationEnabled` flag flippeaba solo en filter changes. Ahora también en deltas de `controller.expenses.length` (catch add optimistic + delete). FadeIn(180) + LinearTransition(220) play. Cold mount + virtualized scroll quedan a 0 overhead.

---

## 5. Delete crash en fijo

`patchPaginatedRemove` (y prepend) hacían `p.expenses.filter` sin guard. Páginas con shape parcial (RPC bundle bandera fields primero antes que expenses) crasheaban con "Cannot read property 'filter' of undefined" al borrar un fijo.

**Fix**: guards defensivos `Array.isArray(...) ? ... : []` en cada acceso a `pages` / `expenses`.

---

## 6. Lección guardada

**`home_snapshot` cap de 120 expenses puede sub-estimar el cycle spend** ([migración 20260512020000](supabase/migrations/20260512020000_home_snapshot_payload_trim.sql)). Si una familia tiene más de 120 gastos en el ciclo, el dashboard subestima `variableSpentInCurrentCycle` → saldo inflado. Cuando `useExpenses` se invalida y refetchea con loadExpenses sin límite, el saldo cae al valor correcto. No es bug introducido pero es un footgun latente — recomendado future fix: separar la query del saldo del seed del snapshot, o levantar el cap a 300+ para ciclos densos.

---

## Cifras

- **Commits**: 6
- **Componentes nuevos**: 1 ([income-row.tsx](mobile/components/gastos/income-row.tsx))
- **Componentes borrados**: 1 (income-day-banner.tsx, iteración rechazada)
- **Bugs cerrados**: 5 (3 críticos pre-trabajo + delete crash + animation re-fire)
- **Migrations**: 0

---

## Commits

1. [c56df7d](c56df7d) — fix(gastos): 3 critical bugs found in pre-work code review
2. [e03266f](e03266f) — feat(gastos): income day banner + chronological consistency + animation polish
3. [e2c6d39](e2c6d39) — polish(gastos): section header reads as a label, not a block
4. [60645bf](60645bf) — fix(gastos): delete crash on fixed-payment + income persistente in banner
5. [9bc2888](9bc2888) — polish(gastos): income row matches expense row chrome, banner retired
6. [2da9f59](2da9f59) — polish(gastos): income row gets swipe-to-delete + full radius via SwipeRow
