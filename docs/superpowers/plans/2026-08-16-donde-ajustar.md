# Plan de integración — "Dónde ajustar" deja de ser el CRUD de categorías

> **Fecha:** 2026-08-16 · **Rama:** `feat/ui-redesign`
> **Pedido del dueño:** el CTA "Dónde ajustar" del hero de Control navega a una
> pantalla de administración de categorías. Dos problemas: (1) el CTA promete un
> diagnóstico y entrega un CRUD; (2) hoy los usuarios NO deben poder crear
> categorías. Revisar a fondo, planificar un flujo mejor e integrarlo.

---

## 1 · Diagnóstico (auditoría verificada contra el árbol)

### Las tres promesas rotas

Tres CTAs de Control prometen un diagnóstico del gasto y las tres aterrizan en
`/(app)/expense-categories`, el administrador del catálogo (crear/renombrar/borrar):

| CTA | Copy | Dónde vive | Destino hoy |
|---|---|---|---|
| Hero `corto` | **"Dónde ajustar"** (`control:neo.hero.ctaCorto`) | `neo-control-screen.tsx:403-410` | CRUD |
| Hero `ajustado` | **"En qué recortar"** (`ctaAjustado`) | mismo handler (es el *fallback* de todo no-holgado) | CRUD |
| Alcancía `sinAporte` | **"Ver en qué se fue"** (`meta.ctaVerEnQueSeFue`) | `neo-control-screen.tsx:504-507` | CRUD |

El footer del hero dice *"Te faltan $X para cerrar"* — el tap responde con una
lista para renombrar categorías. Cero valor de diagnóstico: la pantalla no
muestra ni un monto.

### El grafo de la pantalla de categorías

- **Entry points:** SOLO esos 2 `router.push`. Sin deep links (no está en
  `SAFE_PUSH_ROUTES`), sin tours, sin e2e, sin previews de Dev.
- **CRUD:** `useCreateCategory` / `useRenameCategory` / `useDeleteCategory`
  (`use-categories.ts:173,219,257`) se importan ÚNICAMENTE desde esta pantalla.
  `CategoryEditorModal` también. El onboarding no siembra categorías custom.
- **Conclusión:** re-cablear los 2 CTAs deja la pantalla 100% huérfana, y
  borrarla elimina por completo la capacidad del usuario de crear categorías —
  exactamente lo que el dueño decidió.

### Residuo que queda mintiendo

`add-gasto-v2-screen.tsx:558-561`: con catálogo vacío (`hasNoCategories`, casi
inalcanzable desde el catálogo global) el CTA dice **"Crear categoría"** y
navega… a la tab Gastos. Con la creación eliminada, ese label promete algo que
no existe en ningún lado. Con catálogo global, un catálogo vacío es una anomalía
de carga → el CTA honesto es **"Reintentar"** (refetch), igual que la rama de error.

### Trampa encontrada de yapa (bug real)

El deep-link "Gastos filtrada por categoría" (`open-expenses-filtered` del
Asistente) está **roto de facto**: `initialCategoryId` sólo se lee en el mount
(`use-gastos-controller.ts:177-179`) y las tabs se pre-montan al boot
(`lazy:false`, `app-tabs.tsx:309`) → un `router.push` posterior con
`params.categoryId` no re-filtra nada. El flujo nuevo necesita ese canal, así
que se arregla acá (y de paso se arregla para el Asistente).

### Datos disponibles para un diagnóstico real (sin tocar backend)

- **El cuánto:** `view.sobrantePresupuestadoMes` (negativo = faltante),
  `view.restanteMes`, `view.diasRestantes`, `view.promedioDiario`,
  `data.cupoDiario`, `data.fijosMes`, `data.ingresoMes` — todo ya llega a la
  pantalla vía `useControlV2Data`.
- **El dónde:** el desglose por categoría del ciclo ACTUAL no existe en ningún
  snapshot → se deriva client-side de `useExpenses` (cache caliente) + `useCategories`,
  filtrando a la ventana de `usePayCycle`. Mismo criterio que
  `groupExpensesByCategory` de control-signals: excluir `commitment_id` (fijos)
  y precios no finitos/negativos.
- **La salida:** la tab Gastos ya sabe aterrizar filtrada por `categoryId`
  (una vez arreglado el sync post-mount).

---

## 2 · Diseño del flujo nuevo

**Un sheet de diagnóstico** (`DondeAjustarSheet`), montado in-tree en Control —
el mismo molde que `DailyGoalSheet` y los sheets de la alcancía: `ModalCard
skin="neo"` + footer. Sin ruta nueva, sin navegación: el usuario no pierde el
contexto del hero que acaba de tocar.

```
┌─ Dónde ajustar ────────────────────┐
│ Te faltan $1,3M para cerrar.       │  ← el número que el hero ya mostró
│ Para llegar, tus próximos 20 días  │  ← nuevo cupo requerido =
│ tienen que costar ≤ $12k (vienes   │     max(0, restanteMes)/diasRestantes
│ gastando $44k por día).            │     + ritmo actual para contraste
│                                    │
│ DÓNDE SE VA · ESTE CICLO           │
│ ● Mercado        $420k   38% ▓▓▓▓  │  ← top 4 categorías variables,
│ ● Comida         $310k   28% ▓▓▓   │     tap → Gastos filtrada
│ ● Transporte     $120k   11% ▓     │
│ ● Otros          $90k     8% ▓     │
│                                    │
│ ⚠ Tus fijos se llevan el 41% del   │  ← sólo si fijos ≥ 35% del ingreso
│   ingreso · Revisar fijos ›        │     → tab Fijos
│                                    │
│ [ Ver los gastos del ciclo ]       │  ← CTA primario → tab Gastos
└────────────────────────────────────┘
```

Tres modos, uno por CTA de origen: `corto` (faltante), `ajustado` (margen
chico), `sinSobrante` (alcancía: "en qué se fue"). Cambia el encabezado; el
cuerpo (desglose + salidas) es el mismo.

**Decisiones:**
- Modelo PURO y testeable (`donde-ajustar-model.ts`), UI delgada — patrón
  VM del repo.
- Las categorías se muestran por MONTO del ciclo (no por conteo: `rankCategoriesByUsage`
  rankea por usos y no sirve acá).
- El tap en una categoría cierra el sheet y navega con `router.push(
  '/(app)/(tabs)/expenses', {categoryId})` — que ahora sí filtra (fix del sync).
- No se reusan las señales del Asistente dentro del sheet: duplicaría esa
  superficie. El sheet diagnostica; el Asistente sigue siendo el canal de
  señales.

---

## 3 · Tareas

1. **Modelo puro** `mobile/features/insights/donde-ajustar-model.ts`
   (`buildDondeAjustarModel`): entrada `{expenses, categories, cycleStart,
   cycleEnd, restanteMes, sobrante, diasRestantes, promedioDiario, fijosMes,
   ingresoMes}` → `{mode headline, nuevoCupo, topCategories[{id, displayName,
   amount, sharePct}], otherAmount, fijosPct, showFijosWarning}`.
   Tests unitarios (`tests/unit/donde-ajustar-model.test.ts`).
2. **Sheet** `mobile/components/control-v2/donde-ajustar-sheet.tsx` —
   `ModalCard skin="neo"`, footer con CTA "Ver los gastos del ciclo",
   reduce-motion, i18n es+en (`control:neo.ajustar.*`).
3. **Re-cablear Control** (`neo-control-screen.tsx`): estado
   `ajustarSheet: 'corto'|'ajustado'|'sinSobrante'|null`; `handleHeroCta`
   ajustado/corto → sheet; alcancía `sinAporte` → sheet. Copy de los CTAs no
   cambia (ya promete esto).
4. **Fix del filtro post-mount** (`neo-gastos-screen.tsx`): efecto sobre
   `params.categoryId` → `controller.setSelectedCategoryId(id)` + limpiar el
   param (`router.setParams`) para que un segundo push con la misma categoría
   vuelva a disparar. Arregla también `open-expenses-filtered` del Asistente.
5. **Retirar la creación de categorías:** borrar
   `expense-categories-screen.tsx`, `category-editor-modal.tsx`,
   `app/(app)/expense-categories.tsx`, el registro en `app-stack-shell.tsx`,
   las 3 mutaciones de `use-categories.ts` (+ `resolveManagedCategoryId` si
   queda sin consumidores) y las keys i18n `gastos:categoriesScreen.*` /
   `settings:categoryEditor.*` en es y en.
6. **Residuo de add-gasto:** `hasNoCategories` pasa a CTA "Reintentar"
   (refetch de la query, mismo camino que la rama de error). La key
   `gastos:addExpense.createCategory` se elimina.
7. **Docs en el mismo commit:** `docs/producto/flujos-y-funcionamiento.md`
   (referencia a la pantalla de categorías) + este plan.
8. **Validación:** tsc · eslint · suite completa (hay cambios de copy →
   regla del repo) · guards i18n · `expo export` (bundle).

**Fuera de alcance (limpieza aparte):** `expense-filters-screen.tsx` y
`expense-history-filters.store.ts` quedan sin lectores vivos tras este cambio —
son legacy no ruteado; se retiran en un pase de limpieza separado para no
mezclar riesgos.

## 4 · Riesgos y mitigación

- **Un `categoryId` inválido en el param** deja la lista vacía en silencio
  (la neo no valida) → el sheet sólo emite ids derivados de los gastos reales
  del ciclo; el efecto de sync ignora valores vacíos.
- **Pocos datos** (ciclo recién arrancado): `topCategories` vacío → el sheet
  muestra el encabezado numérico y el CTA general; sin sección "dónde se va".
- **Rollback:** revertir el commit. La pantalla borrada vive en git.
