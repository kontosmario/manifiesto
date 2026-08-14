# Movimientos de ediciones cerradas en Gastos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al entrar a una edición cerrada desde el selector de ciclos de Gastos, ver la lista de movimientos de ese ciclo (feed por día + day-detail), junto al total ya existente.

**Architecture:** Enfoque A del spec: se extiende la retención de gastos archivados de 14 días a 13 meses (1 migración: purge + índice) y la vista cerrada REUSA las RPCs/hooks existentes (`gastos_expenses_paginated` / `gastos_expenses_for_day`, que no filtran `archived_at`) pasándoles la ventana `[period_start, period_end)` de la edición. Render solo lectura con los componentes del kit (`GastosMovDayHeader` + `GastosMovRow` flat, sin SwipeRow). Fallback para ediciones ya purgadas.

**Tech Stack:** Supabase (Postgres + pg_cron), React Native (Expo), React Query v5 (infinite query), i18next (ES + EN), vitest (env `node`, sin renderer — solo funciones puras).

**Spec:** `docs/superpowers/specs/2026-08-14-gastos-ediciones-movimientos-design.md`

## Global Constraints

- **Jamás** incluir atribución de Claude/Anthropic/IA en commits, código o comentarios. Identidad git: Mario Kontos.
- Mensajes de commit: conventional commits en español, como el historial del repo.
- Antes de `npx`/`npm`: `source ~/.nvm/nvm.sh`.
- `npx vitest run` tiene 3 fallas baseline; `npm run validate` ya fallaba en el branch (motion-tokens ajenos). Criterio: cero fallas NUEVAS.
- **La migración NUNCA se aplica a prod por MCP ni `db push` directo** — re-estampa timestamps y desalinea el ledger. Solo local en este plan; staging/prod van por el flujo normal de deploy del owner.
- Copy en español neutro (tuteo) + key equivalente en EN (`mobile/lib/i18n/locales/{es,en}/gastos.json`). Cambios de copy ⇒ suite completa.
- La rama cerrada de la pantalla es SOLO LECTURA: sin SwipeRow, sin mutaciones, sin CTAs de edición.
- Los hooks de la edición cerrada se gatean con `viewingClosed` (mismo patrón de perf que `useMonthlyEditions`, `neo-gastos-screen.tsx:1351-1353`).

---

### Task 1: Migración — retención 13 meses + índice histórico

**Files:**
- Create: `supabase/migrations/20260814120000_extend_archived_expenses_retention.sql`

**Interfaces:**
- Consumes: función viva `cron_purge_archived_expenses()` — versión vigente en `supabase/migrations/20260620210000_fixed_payment_expenses_retention.sql:29-59` (cutoff 14 días, excluye `commitment_id`).
- Produces: misma función con cutoff `interval '13 months'`; índice `expenses_family_created_idx (family_id, created_at desc)`.

- [ ] **Step 1: Verificar la consistencia de ventana del cierre (gate del spec §5)**

Leer `supabase/migrations/20260813120100_close_monthly_cycle_dual_mode.sql` líneas 370-440 y confirmar que el `insert into public.monthly_summaries` usa las MISMAS bounds (`v_start`/`v_end` o `p_period_start`/`p_period_end` equivalentes) que el `update public.expenses set archived_at` (`:429-438`). Expected: la ventana archivada == `period_start/period_end` persistidos. Si NO coinciden, DETENERSE y reportar antes de seguir (el feed cerrado mostraría movimientos que no suman el total del hero).

- [ ] **Step 2: Escribir la migración**

```sql
-- supabase/migrations/20260814120000_extend_archived_expenses_retention.sql
--
-- WHAT: (1) La retención de gastos variables archivados pasa de 14 días a
--   13 meses. (2) Índice completo (family_id, created_at desc) para queries
--   de rango sobre ventanas históricas.
--
-- WHY: la vista Gastos ahora permite entrar a una edición cerrada y ver sus
--   movimientos (spec 2026-08-14-gastos-ediciones-movimientos-design.md).
--   Los movimientos salen de las RPCs existentes (gastos_expenses_paginated /
--   gastos_expenses_for_day) sobre la ventana [period_start, period_end) de
--   la edición — pero el purge diario los borraba a los 14 días del cierre.
--   13 meses = las 12 ediciones que muestra el dropdown + 1 de margen.
--   Solo hacia adelante: lo ya purgado no se recupera (la UI tiene fallback).
--
-- Notas:
--   · La retención de pagos de fijos (last-3 por fijo, 20260620210000) NO
--     cambia — el feed histórico excluye commitment_id igual que el vivo.
--   · El índice es COMPLETO (sin predicado): las RPCs de gastos no filtran
--     por archived_at, así que los parciales existentes no les aplican a
--     ventanas históricas. El hot-path del ciclo vivo conserva su parcial
--     (expenses_family_active_idx).

-- ─── 1. Retención: 14 días → 13 meses ───────────────────────────────
create or replace function public.cron_purge_archived_expenses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chunk_size int := 10000;
  v_deleted int;
  v_total int := 0;
  v_iterations int := 0;
  v_cutoff timestamptz := now() - interval '13 months';
begin
  loop
    delete from public.expenses
    where ctid in (
      select ctid from public.expenses
      where archived_at is not null
        and archived_at < v_cutoff
        and commitment_id is null   -- pagos de fijos: gestionados aparte (last-3)
      limit v_chunk_size
    );
    get diagnostics v_deleted = row_count;
    v_total := v_total + v_deleted;
    v_iterations := v_iterations + 1;
    exit when v_deleted = 0 or v_iterations > 100; -- safety cap
  end loop;

  raise notice 'cron_purge_archived_expenses: deleted=% iterations=%', v_total, v_iterations;
end;
$$;

revoke all on function public.cron_purge_archived_expenses() from public;
grant execute on function public.cron_purge_archived_expenses() to service_role;

-- ─── 2. Índice para ventanas históricas ─────────────────────────────
create index if not exists expenses_family_created_idx
  on public.expenses (family_id, created_at desc);

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- begin;
--   drop index if exists expenses_family_created_idx;
--   -- restaurar cutoff 14 días: ver 20260620210000_fixed_payment_expenses_retention.sql
-- commit;
```

(El schedule de pg_cron no se toca: la función reemplazada mantiene nombre y firma; el job `purge-archived-expenses` de las 04:30 sigue apuntando a ella.)

- [ ] **Step 3: Aplicar en LOCAL y verificar**

Run: `npx supabase migration up`
Expected: aplica sin error sobre el stack local (si el stack no está corriendo: `npx supabase start` primero).

(Conexión al Postgres local del stack: host `127.0.0.1`, puerto `54322`, user/db `postgres`, password = la default local que imprime `npx supabase status`.)

Run: `PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "select prosrc from pg_proc where proname='cron_purge_archived_expenses';" | grep -c '13 months'`
Expected: `1`.

Run: `PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "\d public.expenses" | grep expenses_family_created_idx`
Expected: la línea del índice `(family_id, created_at DESC)`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260814120000_extend_archived_expenses_retention.sql
git commit -m "feat(gastos): retencion de archivados a 13 meses + indice historico — habilita movimientos de ediciones cerradas"
```

---

### Task 2: Extraer el builder puro de la fila de movimiento (`buildMovRowVM`)

`MovementRow` (memoizado en `neo-gastos-screen.tsx:~940-1076`) construye internamente el `row: MovRowVM` que consume `GastosMovRow` (kit). El feed cerrado necesita exactamente ese VM pero SIN el chrome interactivo (SwipeRow/handlers). Se extrae la construcción del VM a un módulo puro compartido — DRY, y de paso queda testeable.

**Files:**
- Create: `mobile/features/gastos/build-mov-row-vm.ts`
- Modify: `mobile/screens/home/neo/neo-gastos-screen.tsx` (MovementRow pasa a consumir el builder)
- Test: `tests/unit/build-mov-row-vm.test.ts`

**Interfaces:**
- Consumes: `MovementItem` (`@/features/gastos/gastos-helpers:19-21`), `MovRowVM` (`@/components/redesign/gastos/gastos-screen:344-360`), los mapas `categoriesById` / `memberById` con la forma exacta que MovementRow recibe hoy (verificar en el Step 1).
- Produces: `buildMovRowVM(input: { item: MovementItem; categoriesById: <tipo verificado en Step 1>; memberById: <tipo verificado en Step 1> }): MovRowVM` — pura, sin i18n side effects fuera de los que ya hace el bloque original.

- [ ] **Step 1: Leer el bloque original**

Leer `neo-gastos-screen.tsx` desde la definición de `MovementRow` (buscar `const MovementRow = React.memo(` — está antes de `:1030`) hasta `:1076`, e identificar el sub-bloque que construye `row` (emoji/tile/title/sub/amount/catName/kind/note) y las EXACTAS dependencias que usa (`categoriesById`, `memberById`, `t`, helpers de formato). Anotar los tipos reales de los mapas.

- [ ] **Step 2: Extraer sin cambiar comportamiento**

Mover ese sub-bloque a `mobile/features/gastos/build-mov-row-vm.ts` como función pura exportada con la firma de arriba (ajustando los tipos a lo verificado en Step 1 — si el bloque usa `t` de i18n, recibirlo como parámetro). `MovementRow` la importa y le delega; su render y memo-comparator NO cambian (el comparator `areMovementRowPropsEqual` de `:1076-…` compara props, no el VM).

- [ ] **Step 3: Test de caracterización**

En `tests/unit/build-mov-row-vm.test.ts`, un caso por kind:

```ts
import { describe, it, expect } from 'vitest'
import { buildMovRowVM } from '@/features/gastos/build-mov-row-vm'
import type { MovementItem } from '@/features/gastos/gastos-helpers'

// Fixture de expense con las columnas reales de `public.expenses`
// (baseline 20260413154000 + alters). Cast final porque el tipo
// `Expense` del cliente puede declarar campos derivados extra.
const expense = {
  id: 'exp-1',
  family_id: 'fam-1',
  category_id: 'cat-super',
  description: 'Verdulería',
  price: 12500,
  created_by: 'user-1',
  created_at: '2026-06-05T14:30:00Z',
  commitment_id: null,
  archived_at: null,
  notes: null,
  paid_in_arrears: false,
}

describe('buildMovRowVM', () => {
  it('gasto → VM con title, monto formateado y catName resuelto', () => {
    const item = { kind: 'expense', iso: '2026-06-05', expense } as MovementItem
    // Las SHAPES exactas de los values de ambos mapas salen del Step 1;
    // este es el mínimo que el builder consume — ampliar si usa más campos.
    const vm = buildMovRowVM({
      item,
      categoriesById: new Map([['cat-super', { id: 'cat-super', name: 'Supermercado', color: '#7BB662' }]]) as never,
      memberById: new Map([['user-1', { name: 'Mario' }]]) as never,
    })
    expect(vm.title).toBe('Verdulería')
    expect(vm.kind ?? 'expense').toBe('expense')
    expect(vm.catName).toBe('Supermercado')
    expect(vm.amount).toContain('12.500')
    expect(vm.sub).toContain('Mario')
  })
})
```

Si el Step 1 revela que el builder necesita campos adicionales en los fixtures (p. ej. `rawName` en la categoría), agregarlos con valores reales — no inventar campos que el bloque original no lea. Ajustar el assert de `amount` al formato exacto de `formatMoney` si difiere.

- [ ] **Step 4: Correr tests + tsc**

Run: `source ~/.nvm/nvm.sh && npx vitest run tests/unit/build-mov-row-vm.test.ts && npx tsc --noEmit -p .`
Expected: PASS / sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/gastos/build-mov-row-vm.ts mobile/screens/home/neo/neo-gastos-screen.tsx tests/unit/build-mov-row-vm.test.ts
git commit -m "refactor(gastos): buildMovRowVM extraido puro — compartido entre el feed vivo y la edicion cerrada"
```

---

### Task 3: Hooks de datos de la edición cerrada

**Files:**
- Modify: `mobile/screens/home/neo/neo-gastos-screen.tsx` (zona de estado de la edición cerrada, `:1349-1445`)

**Interfaces:**
- Consumes: `useGastosExpensesPaginated` / `useGastosExpensesForDay` (`mobile/features/gastos/use-gastos-endpoints.ts:328,403`), `selectedEdition: MonthlySummaryHistory | null` (`:1355-1361`, con `period_start`/`period_end` `YYYY-MM-DD`), `groupGastosByDay` (`@/features/gastos/gastos-aggregates.model:93`), `buildGastosSections` (`@/features/gastos/build-sections:87`), `selectedClosedIso` (estado ya existente del day-detail cerrado).
- Produces: `closedSections: MovimientosSection[]`, `closedFeed` (infinite query: `fetchNextPage`, `hasNextPage`, `isFetched`, `isFetchingNextPage`, `isError`, `refetch`), `closedDayQuery` (query del día tocado, con `isFetched`), `closedDayRows: GastosExpenseRow[]`, `closedFeedEmpty: boolean` (fetched y sin filas — dispara el fallback "no se conservaron").

- [ ] **Step 1: Cablear los hooks**

Debajo del bloque `selectedEdition`/`viewingClosed` (`:1364`), agregar:

```ts
  // ── Movimientos de la edición cerrada ──────────────────────────────
  // Reusa las RPCs del ciclo vivo con la ventana [period_start,
  // period_end) de la edición: no filtran por archived_at, así que
  // sirven tal cual para ventanas pasadas. Query keys incluyen la
  // ventana → cero colisión con el cache del ciclo vivo. Gate: solo
  // fetchea viendo una edición (mismo patrón que useMonthlyEditions).
  const closedWindow = useMemo(() => {
    if (!selectedEdition) return null
    return {
      start: new Date(`${selectedEdition.period_start}T00:00:00`),
      end: new Date(`${selectedEdition.period_end}T00:00:00`),
    }
  }, [selectedEdition])
  const closedFeed = useGastosExpensesPaginated({
    familyId: viewingClosed ? familyId : undefined,
    cycleStart: closedWindow?.start ?? controller.cycleStart,
    cycleEnd: closedWindow?.end ?? controller.cycleEnd,
    today: controller.today,
    categoryId: null,
  })
  const closedRows = useMemo(
    () => closedFeed.data?.pages.flatMap((p) => p.expenses) ?? [],
    [closedFeed.data],
  )
  const closedSections = useMemo<MovimientosSection[]>(() => {
    if (!viewingClosed) return []
    return buildGastosSections({
      groups: groupGastosByDay({ expenses: closedRows, today: controller.today }),
      cycleIncomeEvents: [],
      selectedDay: null,
      hasNextPage: closedFeed.hasNextPage ?? false,
    })
  }, [viewingClosed, closedRows, controller.today, closedFeed.hasNextPage])
  // Fetched y vacío con expenses_count > 0 ⇒ edición purgada pre-feature.
  const closedFeedEmpty = closedFeed.isFetched && closedRows.length === 0
  // Day-detail cerrado: movimientos reales del día tocado.
  const closedDayQuery = useGastosExpensesForDay({
    familyId: viewingClosed ? familyId : undefined,
    isoDate: viewingClosed ? selectedClosedIso : null,
    categoryId: null,
  })
  const closedDayRows = closedDayQuery.data ?? []
```

Imports nuevos arriba del archivo: `groupGastosByDay` desde `@/features/gastos/gastos-aggregates.model`; `useGastosExpensesPaginated` / `useGastosExpensesForDay` desde `@/features/gastos/use-gastos-endpoints` (verificar si ya están importados por otros usos; `buildGastosSections` y `MovimientosSection` ya están, `:148,156`).

Nota de tipos: `groupGastosByDay` recibe `Expense[]` y `closedRows` son `GastosExpenseRow[]` — es EXACTAMENTE el mismo flujo del ciclo vivo (`use-gastos-controller.ts:426-435` alimenta el grouper con las filas paginadas normalizadas); si tsc protesta, replicar el cast/adaptación que haga el controller ahí, no inventar uno nuevo.

- [ ] **Step 2: tsc**

Run: `source ~/.nvm/nvm.sh && npx tsc --noEmit -p .`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add mobile/screens/home/neo/neo-gastos-screen.tsx
git commit -m "feat(gastos): la edicion cerrada trae sus movimientos con las RPCs del ciclo vivo sobre la ventana archivada"
```

---

### Task 4: Feed cerrado en la UI + fallback + day-detail real + i18n

**Files:**
- Modify: `mobile/screens/home/neo/neo-gastos-screen.tsx` (rama cerrada, `:3742-3869`)
- Modify: `mobile/lib/i18n/locales/es/gastos.json` y `mobile/lib/i18n/locales/en/gastos.json`

**Interfaces:**
- Consumes: `closedSections` / `closedFeed` / `closedDayRows` / `closedFeedEmpty` (Task 3), `buildMovRowVM` (Task 2), componentes del kit ya importados en el archivo: `GastosMovDayHeader` (header de día, uso de referencia en `:3038-3043`), `GastosMovRow` (`:100`, fila flat), `GastosMovementsEmptyWell`, `GastosMovSectionHead`, `GastosDayDetail`.
- Produces: keys i18n `gastos:closed.loadMoreDays`, `gastos:closed.notRetainedTitle`, `gastos:closed.notRetainedBody`.

- [ ] **Step 1: Keys i18n**

En `es/gastos.json`, bloque `"closed"`:

```json
    "loadMoreDays": "Ver más días",
    "notRetainedTitle": "Los movimientos de esta edición no se conservaron",
    "notRetainedBody": "Esta edición cerró antes de que empezáramos a archivar el detalle. Desde ahora, cada edición guarda sus movimientos.",
```

En `en/gastos.json`, mismo bloque (crear las keys equivalentes):

```json
    "loadMoreDays": "Show more days",
    "notRetainedTitle": "This edition's movements weren't kept",
    "notRetainedBody": "This edition closed before we started archiving the detail. From now on, every edition keeps its movements.",
```

Las keys viejas `movementsTitle`/`movementsSub` quedan sin uso tras el Step 2 — borrarlas de ES y EN.

- [ ] **Step 2: Reemplazar el well por el feed**

En la rama cerrada, reemplazar el bloque `:3860-3867` (el `GastosMovementsEmptyWell` con `movementsTitle`/`movementsSub`) por:

```tsx
        ) : closedFeed.isError ? (
          // Mismo patrón error/retry del resto de la pantalla (spec §6).
          <NeoStateBlock
            icon="error-outline"
            description={getErrorMessage(closedFeed.error, t('states:error.server'))}
            title={t('gastos:errors.loadTitle')}
            actionLabel={t('states:errorState.action')}
            tone="error"
            onAction={() => {
              void closedFeed.refetch()
            }}
          />
        ) : closedFeedEmpty ? (
          // Edición cerrada ANTES de la retención extendida: sus filas ya
          // fueron purgadas. El resumen (hero/calendario) sigue arriba.
          <GastosMovementsEmptyWell
            mode={mode}
            title={t('gastos:closed.notRetainedTitle')}
            sub={t('gastos:closed.notRetainedBody')}
            animated={false}
          />
        ) : (
          <View>
            {closedSections.map((sec) => (
              <View key={sec.dateMs}>
                <View style={styles.sectionHeaderWrap}>
                  <GastosMovDayHeader
                    mode={mode}
                    label={sec.title.toUpperCase()}
                    total={sec.total > 0 ? `${MINUS}${formatMoney(sec.total)}` : ''}
                  />
                </View>
                {sec.data.map((item) => (
                  <View
                    key={item.kind === 'expense' ? item.expense.id : item.income.id}
                    style={[
                      styles.rowShadowWrap,
                      { backgroundColor: s.movRowBackground, boxShadow: s.movRowShadow },
                    ]}
                  >
                    {/* Solo lectura: GastosMovRow directo, sin SwipeRow ni
                        long-press (nada que editar en una edición cerrada). */}
                    <GastosMovRow
                      mode={mode}
                      row={buildMovRowVM({
                        item,
                        categoriesById: controller.categoriesById,
                        memberById,
                      })}
                      flat
                    />
                  </View>
                ))}
              </View>
            ))}
            {closedFeed.hasNextPage ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('gastos:closed.loadMoreDays')}
                disabled={closedFeed.isFetchingNextPage}
                onPress={() => void closedFeed.fetchNextPage()}
                style={[
                  styles.rowShadowWrap,
                  { backgroundColor: s.movRowBackground, boxShadow: s.movRowShadow },
                ]}
              >
                <Text style={{ padding: 14, textAlign: 'center', color: s.sectionLabelInk }}>
                  {closedFeed.isFetchingNextPage ? '…' : t('gastos:closed.loadMoreDays')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
```

Notas de ajuste al aplicar (leer el bloque real antes de editar): la condición existente `(selectedEdition.expenses_count ?? 0) === 0` del `:3851` se mantiene como primera rama (edición sin gastos); si `buildMovRowVM` requiere `t`, pasarlo; si `styles.sectionHeaderWrap` / `s.sectionLabelInk` no existen en el scope de esta rama, usar los tokens equivalentes que la rama cerrada ya usa (grep en el archivo) — NO inventar colores fuera del sistema. Mientras `closedFeed` carga la primera página (`!closedFeed.isFetched`), render `null` en lugar del well (el contenido aparece al llegar; sin spinner nuevo en v1).

- [ ] **Step 3: Day-detail con movimientos reales**

En el `GastosDayDetail` cerrado (`:3795-3824`): reemplazar `movs={EM_DASH}` por

```tsx
            movs={closedDayQuery.isFetched ? String(closedDayRows.length) : EM_DASH}
```

y quitar (o condicionar) la `noteLine={t('gastos:calendar.noActionsClosed')}` SOLO si esa key habla de que no hay detalle; si habla de que no hay acciones, dejarla. Debajo del componente `GastosDayDetail` (mismo branch del ternario), agregar la lista del día:

```tsx
        {selectedClosedIso != null && closedDayRows.length > 0 ? (
          <View>
            {closedDayRows.map((row) => (
              <View
                key={row.id}
                style={[
                  styles.rowShadowWrap,
                  { backgroundColor: s.movRowBackground, boxShadow: s.movRowShadow },
                ]}
              >
                <GastosMovRow
                  mode={mode}
                  row={buildMovRowVM({
                    item: { kind: 'expense', iso: selectedClosedIso, expense: row },
                    categoriesById: controller.categoriesById,
                    memberById,
                  })}
                  flat
                />
              </View>
            ))}
          </View>
        ) : null}
```

(ajustando el shape del `item` a lo verificado en Task 2 Step 1 — el cast `expense: row` sigue el mismo puente `GastosExpenseRow`→`Expense` de la Task 3).

- [ ] **Step 4: Suite completa + tsc + bundle**

Run: `source ~/.nvm/nvm.sh && npx vitest run && npx tsc --noEmit -p . && npx expo export --platform ios`
Expected: sin fallas nuevas; export OK (copy cambió ⇒ suite completa).

- [ ] **Step 5: Commit**

```bash
git add mobile/screens/home/neo/neo-gastos-screen.tsx mobile/lib/i18n/locales/es/gastos.json mobile/lib/i18n/locales/en/gastos.json
git commit -m "feat(gastos): feed y day-detail de movimientos en la edicion cerrada — solo lectura, con fallback para lo purgado"
```

---

### Task 5: Docs en sync + notas de deploy

**Files:**
- Modify: los docs que afirmen que los movimientos no se conservan / purga a 14 días.

- [ ] **Step 1: Encontrar y actualizar los docs**

Run: `grep -rln "14 días\|no se conservan\|purge" docs/ | head`
En cada doc vigente que describa la retención de 14 días o el well "no se conservan" (p. ej. el doc de sistemas de gastos si existe), actualizar: retención 13 meses para variables, feed de solo lectura en ediciones cerradas, fallback para ediciones pre-feature. NO tocar specs/planes históricos (son registro).

- [ ] **Step 2: Nota de deploy (para el owner, en el mensaje de entrega — no en un doc)**

- La migración va por el flujo normal (local → staging → prod con ledger alineado). **Aplicarla en prod ANTES del próximo cierre de ciclo + 14 días**: cada día que pasa sin ella, el cron de las 04:30 UTC sigue purgando movimientos que ya podríamos conservar.
- Ediciones cerradas hace <14 días al momento del deploy conservan sus filas → el feed les funciona retroactivamente.
- Skew conocido y pre-existente (no introducido acá): el cierre castea `date → timestamptz` en UTC y el cliente manda medianoche local (AR = UTC−3); un gasto de 21:00–24:00 del día borde puede diferir entre el total del hero y el feed. Igual que en el ciclo vivo; se decide aparte si molesta.

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs(gastos): retencion 13 meses y movimientos de ediciones cerradas documentados"
```

**QA en device (fuera del plan, anotar al entregar):** con la cuenta `ciclo.extendido@manifiestoapp.com`: entrar a una edición cerrada reciente → feed con días y filas, "Ver más días" pagina, tap en un día del calendario → detalle con movimientos; edición vieja purgada → well "no se conservaron". Verificar que el ciclo VIVO no refetchea al entrar/salir de la edición (query keys distintas).
