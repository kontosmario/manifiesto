# P3 Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Cerrar 3 de 4 items P3 del code review: romper los 2 ciclos de import latentes y documentar la convención `gastos`/`expenses` + `fijos`/`fixed-expenses` (UI español / dominio inglés). El 4° item (extraer controllers de mega-screens add-fijo-v2/gastos-v2/settings/asistente, 5000+ LoC combinados) queda en el backlog post-P4 — requiere planning dedicado por screen, no es work paralelizable.

**Architecture:**
- Helpers de telemetría puros (`newSessionId`, `isReopenInSession`) viven en `mobile/lib/telemetry-session.ts` — son agnósticos a feature.
- `formatDeltaPercent` vive en `mobile/utils/percent.ts` — pure utility, no domain knowledge.
- Re-exports backwards-compat en los archivos originales para no romper callers que no migran ahora.
- Doc de convención en `docs/arquitectura/feature-layering-ui-vs-domain.md`.

**Out of scope:** mega-screen extraction (P5 backlog), Control v2 snapshot RPC migration (depende de backend planning).

---

## Task 1: Romper ciclo `home ↔ telemetry`

**Files:**
- Create: `mobile/lib/telemetry-session.ts`
- Modify: `mobile/features/home/home-telemetry-helpers.ts` (re-export wrapper)
- Modify: `mobile/features/telemetry/use-screen-telemetry.ts` (import from `@/lib`)

**Problema:** `mobile/features/home/log-home-event.ts` importa de `@/features/telemetry/event-queue` Y `mobile/features/telemetry/use-screen-telemetry.ts` importa de `@/features/home/home-telemetry-helpers`. Bundler lo tolera pero crea fragilidad bajo splitting.

Los helpers (`newSessionId`, `isReopenInSession`, `REOPEN_THRESHOLD_MS`) son puros — el comment del archivo dice que se separaron para testabilidad, no por home-coupling. Movemos a `mobile/lib/telemetry-session.ts`.

- [ ] **Step 1.1:** crear `mobile/lib/telemetry-session.ts` con el contenido completo de `mobile/features/home/home-telemetry-helpers.ts`. Actualizar el comentario del header para indicar que es agnóstico:

```typescript
// Pure helpers for screen-telemetry session lifecycle.
//
// Lives in mobile/lib (not in features/home or features/telemetry)
// because both layers need the same session-id semantics and
// either-direction import creates a feature cycle. Pure functions,
// unit-testable in isolation.

/** Generate a session id without depending on `crypto.randomUUID`,
 *  which isn't available everywhere in RN/Hermes. Math.random + time
 *  is enough for client-side correlation — we don't need cryptographic
 *  uniqueness for analytics IDs. */
export function newSessionId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  return `${ts}-${rand}`
}

/** A re-open is "in the same session" if the gap since the last
 *  unmount is below this threshold (ms). Larger gaps reset the
 *  session (the user effectively went away). */
export const REOPEN_THRESHOLD_MS = 60_000

/**
 * Returns true when a fresh mount, given the previous unmount
 * timestamp and "now", should be classified as an in-session re-open.
 */
export function isReopenInSession(
  lastUnmountedAt: number | null,
  now: number,
): boolean {
  if (lastUnmountedAt == null) return false
  return now - lastUnmountedAt < REOPEN_THRESHOLD_MS
}
```

- [ ] **Step 1.2:** reemplazar `mobile/features/home/home-telemetry-helpers.ts` por un re-export thin (backwards-compat):

```typescript
// Backwards-compat re-export. Helpers moved to mobile/lib/telemetry-session.ts
// to break the home ↔ telemetry import cycle. New code should import
// from '@/lib/telemetry-session' directly.
export {
  newSessionId,
  isReopenInSession,
  REOPEN_THRESHOLD_MS,
} from '@/lib/telemetry-session'
```

- [ ] **Step 1.3:** actualizar `mobile/features/telemetry/use-screen-telemetry.ts:20-23` para importar del nuevo path:

```typescript
import {
  isReopenInSession,
  newSessionId,
} from '@/lib/telemetry-session'
```

- [ ] **Step 1.4:** verificar el ciclo se cortó. Run:

```bash
grep -r "from '@/features/home" mobile/features/telemetry/
```

Expected: empty.

- [ ] **Step 1.5:** opcional pero recomendado — actualizar el test de telemetry-session si existe. Run: `grep -r "home-telemetry-helpers" tests/` para ver. Si el test asume el path viejo, dejar (sigue funcionando via re-export).

- [ ] **Step 1.6:** correr `npm run validate` y commit:

```bash
git add mobile/lib/telemetry-session.ts mobile/features/home/home-telemetry-helpers.ts mobile/features/telemetry/use-screen-telemetry.ts
git commit -m "refactor(arch): break home ↔ telemetry import cycle

Moved pure session helpers (newSessionId, isReopenInSession,
REOPEN_THRESHOLD_MS) from features/home to mobile/lib/telemetry-session.ts —
they're agnostic to both home and telemetry features. The original
file is now a backwards-compat re-export.

Closes P3 architecture #1 of 2026-05-31 code review."
```

---

## Task 2: Romper ciclo `expenses ↔ insights`

**Files:**
- Create: `mobile/utils/percent.ts`
- Modify: `mobile/features/insights/control-types.ts` (re-export from utils)
- Modify: `mobile/features/expenses/expense-intelligence-model.ts` (import from utils)

**Problema:** `expense-intelligence-model.ts` importa `formatDeltaPercent` de `@/features/insights/control-model` (línea 5), pero `insights` importa MUCHO de `expenses` (≥10 sites). El único símbolo importado desde insights es la función pura `formatDeltaPercent` — no tiene nada de domain knowledge de insights.

- [ ] **Step 2.1:** crear `mobile/utils/percent.ts`:

```typescript
/**
 * Format a fractional delta (e.g. 0.17 → "+17%") as a signed
 * percentage string. NaN / null / non-finite values render as
 * "Sin base" (Spanish UI copy — moved here so feature modules
 * don't need to depend on each other for a 5-line function).
 */
export function formatDeltaPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return 'Sin base'
  }
  const rounded = Math.round(value * 100)
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}
```

- [ ] **Step 2.2:** en `mobile/features/insights/control-types.ts:56-63` reemplazar la definición por un re-export:

```typescript
// Re-export to keep existing callers happy. Definition moved to
// mobile/utils/percent.ts to break the expenses ↔ insights cycle.
export { formatDeltaPercent } from '@/utils/percent'
```

- [ ] **Step 2.3:** actualizar `mobile/features/expenses/expense-intelligence-model.ts:5` para importar del nuevo path:

```typescript
import { formatDeltaPercent } from '@/utils/percent'
```

- [ ] **Step 2.4:** verificar:

```bash
grep -r "from '@/features/insights" mobile/features/expenses/
```

Expected: empty.

- [ ] **Step 2.5:** correr `npm run validate` y commit:

```bash
git add mobile/utils/percent.ts mobile/features/insights/control-types.ts mobile/features/expenses/expense-intelligence-model.ts
git commit -m "refactor(arch): break expenses ↔ insights import cycle

Moved formatDeltaPercent (5-line pure formatter) from
features/insights/control-types.ts to mobile/utils/percent.ts.
expenses no longer imports anything from insights; insights ↔
expenses dependency is now one-way (insights consumes expenses
types, not vice versa).

Closes P3 architecture #2 of 2026-05-31 code review."
```

---

## Task 3: Documentar convención `gastos`/`expenses` + `fijos`/`fixed-expenses`

**Files:**
- Create: `docs/arquitectura/feature-layering-ui-vs-domain.md`
- Modify: `docs/README.md` (link al nuevo doc si existe; si no, crearlo)

**Problema:** `mobile/features/gastos/` vs `mobile/features/expenses/`, `mobile/features/fijos/` vs `mobile/features/fixed-expenses/` parecen duplicación pero son capas (UI español sobre dominio inglés). La convención no está documentada en ningún lado y causa confusión recurrente.

- [ ] **Step 3.1:** crear `docs/arquitectura/feature-layering-ui-vs-domain.md`:

```markdown
# Convención de features: UI español sobre dominio inglés

Status: Vigente (documentado 2026-05-31, código vigente desde 2026-04).

## Por qué tenemos `gastos/` Y `expenses/` (no es duplicación)

El repo expone pares de carpetas en `mobile/features/` que parecen
duplicados pero NO lo son. Son **dos capas distintas**:

| UI layer (español) | Domain/data layer (inglés)  | Rol |
|--------------------|------------------------------|-----|
| `features/gastos/` | `features/expenses/`         | El UI consume el dominio |
| `features/fijos/`  | `features/fixed-expenses/`   | El UI consume el dominio |

### Domain layer (carpetas inglesas)

- Tipos del modelo (`Expense`, `FixedExpense`).
- Repository hooks (`useExpenses`, `useFixedExpenses`).
- Lógica de agregación pura (analytics, budget engine, payment cycles).
- Mapeos a la DB / RPC payloads.
- **No usa copy en español. No conoce los componentes de UI.**

### UI layer (carpetas españolas)

- Controllers que orquestan el dominio (`useGastosController`, `useFijosController`).
- View-models específicos de la pantalla (snapshot RPC bundles, aggregates con copy).
- Constantes de copy en español (`gastos-aggregates.model.ts` usa "Hoy", "Esta semana", etc.).
- Hooks que combinan dominio + presentación.

## Cuándo crear cada uno

| Caso | Capa | Ejemplo |
|------|------|---------|
| Nueva tabla en DB | Domain inglés | `features/income/` |
| Nuevo endpoint RPC | Domain inglés | `features/income/income-repository.ts` |
| Nuevo aggregate con copy específico de pantalla | UI español | `features/gastos/gastos-aggregates.model.ts` |
| Nuevo controller que orquesta varios dominios | UI español | `features/gastos/use-gastos-controller.ts` |
| Pure formatter sin domain knowledge | `mobile/utils/` o `mobile/lib/` | `mobile/utils/percent.ts` |
| Pure helper compartido entre features | `mobile/lib/` | `mobile/lib/telemetry-session.ts` |

## Reglas de dependencia

- UI español PUEDE importar de domain inglés. **Domain inglés NO debe importar UI español** — eso crea ciclos.
- Domain inglés NO debe importar de OTRO domain inglés sin pasar por `mobile/lib/` o `mobile/utils/` si hay riesgo de ciclo. Los 2 ciclos cerrados en el code review 2026-05-31 (`home ↔ telemetry`, `expenses ↔ insights`) eran exactamente este caso.
- Si necesitás un helper en 2+ features, **es señal de que vive en `mobile/lib/`** (o `mobile/utils/` si es puro formato).

## Por qué bilingüe

- El producto se vende en español → el copy DEBE estar en español.
- El código de dominio es más fácil de mantener / pedir review en inglés (alineado con tipos de TS, librerías externas, error messages de Supabase, etc.).
- Mantener el split visible en la jerarquía de carpetas hace explícita la separación. Renombrar todo a inglés borraría la señal de "esto es UI con copy localizado".

## Otras carpetas que NO son duplicación

| Carpeta | Status | Rol |
|---------|--------|-----|
| `features/subscriptions-zombie/` | Domain distinto | Auditoría de fixed-expenses para detectar zombies (no es duplicación de fixed-expenses). |
| `features/billing/` | Domain distinto | Plan/sub status, separado de gastos. |
| `features/home/` vs `features/insights/` | Capas distintas | home = dashboard estable; insights = Control Center / Hoy / coach. |

## Referencia

- Code review consolidado 2026-05-31, P3 architecture #4.
- Memorias del proyecto: `project_snapshot_rpc_pattern.md` (UI español consume RPC bundles), `project_manifiesto_overview.md`.
```

- [ ] **Step 3.2:** si `docs/README.md` no existe, crearlo con un link al nuevo doc. Si existe, agregar una sección "Arquitectura" con un link.

Run: `cat docs/README.md 2>/dev/null | head -20` — si existe leerlo y proponer el patch; si no existe, crearlo:

```markdown
# Docs index

## Estado del proyecto
- [docs/ESTADO-DEL-PROYECTO/](./ESTADO-DEL-PROYECTO/) — foto vigente, roadmap priorizado.

## Arquitectura
- [docs/arquitectura/feature-layering-ui-vs-domain.md](./arquitectura/feature-layering-ui-vs-domain.md) — convención `gastos`/`expenses`, `fijos`/`fixed-expenses` (UI español / dominio inglés).

## Operaciones
- [docs/operaciones/](./operaciones/) — runbooks, setup, credential rotation.

## Planes activos
- [docs/superpowers/plans/](./superpowers/plans/) — implementation plans en curso.
```

- [ ] **Step 3.3:** commit:

```bash
git add docs/arquitectura/feature-layering-ui-vs-domain.md docs/README.md
git commit -m "docs(arch): document UI-español / domain-inglés feature convention

Codifies why gastos/+expenses/ and fijos/+fixed-expenses/ are
layered pairs (not duplicates), the dependency rules between
layers, and where pure helpers belong (mobile/utils, mobile/lib).
Future contributors and reviewers can point at this doc when
'why are these two folders so similar?' comes up.

Closes P3 architecture #4 of 2026-05-31 code review."
```

---

## P3 verification gate

- [ ] **Gate.1:** `npm run validate` exit 0
- [ ] **Gate.2:** ambos ciclos cerrados:

```bash
grep -r "from '@/features/home" mobile/features/telemetry/  # empty
grep -r "from '@/features/insights" mobile/features/expenses/  # empty
```

---

## Self-review

**Spec coverage:** 3 de 4 items P3. Item P3 #3 (mega-screens) explícitamente diferido a backlog post-P4.

**Placeholder scan:** ninguno. Código de los re-exports y del doc es completo.

**Type consistency:** `formatDeltaPercent`, `newSessionId`, `isReopenInSession`, `REOPEN_THRESHOLD_MS` mantienen las mismas firmas.

---

## Próximos planes

- `2026-05-31-p4-polish.md`
- Post-P0–P4: separately planned per-screen controller extraction.
