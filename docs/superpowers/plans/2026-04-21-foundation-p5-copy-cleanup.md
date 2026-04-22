# Foundation Design v2 — Phase 5: Copy + Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Ship PR #5 (final Foundation PR) — canonical copy glossary, state templates, CI gate for forbidden strings, `shared/` folder absorbed into `ui/`, and 5-10 copy strings rewritten to match the new terminology.

**Reference spec:** [docs/superpowers/specs/2026-04-21-foundation-design.md](../specs/2026-04-21-foundation-design.md) section 8 + section 11 Phase 5.

---

## Task 1: Copy glossary module

**Files:**
- Create: `mobile/lib/copy/glossary.ts`
- Create: `mobile/lib/copy/states.ts`
- Create: `tests/unit/copy-glossary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/copy-glossary.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { terms } from '@/lib/copy/glossary'
import { emptyStates, loadingLabels, errorMessages } from '@/lib/copy/states'

describe('copy glossary', () => {
  it('exposes canonical Spanish terminology', () => {
    expect(terms.expense).toBe('Gasto')
    expect(terms.currentCycle).toBe('Este ciclo')
    expect(terms.available).toBe('Disponible')
    expect(terms.margin).toBe('Margen')
    expect(terms.payday).toBe('Día de cobro')
    expect(terms.fixedExpense).toBe('Gasto fijo')
    expect(terms.history).toBe('Historial')
  })
})

describe('state templates', () => {
  it('expenses empty state is orientative with action', () => {
    const state = emptyStates.expensesThisCycle
    expect(state.title).toContain('gastos')
    expect(state.description.length).toBeGreaterThan(20)
    expect(state.action).toBeTruthy()
  })

  it('debt empty state is active, not passive', () => {
    const state = emptyStates.debt
    // Old pasiva: "Cuando aparezca una deuda nueva..."
    // Nuevo activo: starts with a verb like "Registrá"
    expect(state.title.toLowerCase()).not.toContain('cuando aparezca')
    expect(state.description.toLowerCase()).not.toContain('cuando aparezca')
    expect(state.action?.toLowerCase()).toMatch(/^(sumar|registrar|agregar|crear)/)
  })

  it('loading labels are specific, not bare', () => {
    for (const [key, label] of Object.entries(loadingLabels)) {
      expect(label, `loadingLabels.${key}`).not.toBe('Cargando...')
      expect(label, `loadingLabels.${key}`).toMatch(/\S/)
    }
  })

  it('error messages distinguish network vs server', () => {
    expect(errorMessages.network).toMatch(/conexi[óo]n/i)
    expect(errorMessages.server).toMatch(/servidor|fall/i)
  })
})
```

- [ ] **Step 2: Implement the glossary**

Create `mobile/lib/copy/glossary.ts`:

```ts
/**
 * Canonical Spanish terminology for user-facing copy. Import from here
 * when you need the word for a domain concept — never hardcode.
 */
export const terms = {
  expense:       'Gasto',
  currentCycle:  'Este ciclo',
  available:     'Disponible',
  margin:        'Margen',
  payday:        'Día de cobro',
  fixedExpense:  'Gasto fijo',
  history:       'Historial',
} as const

export type GlossaryTerm = keyof typeof terms
```

- [ ] **Step 3: Implement the state templates**

Create `mobile/lib/copy/states.ts`:

```ts
interface EmptyStateCopy {
  title: string
  description: string
  action?: string
}

export const emptyStates = {
  expensesThisCycle: {
    title: 'Todavía no hay gastos este mes',
    description: 'Cuando registres tu primer gasto, vas a ver acá cómo va tu presupuesto.',
    action: 'Registrar primer gasto',
  },
  debt: {
    title: 'Registrá deudas',
    description: 'Para ver qué debés y cuándo pagás, sumá una deuda acá.',
    action: 'Sumar deuda',
  },
  fixedRecurring: {
    title: 'Sin recurrentes',
    description: 'Sumá alquiler, servicios o pagos periódicos para ver la base estable del hogar.',
    action: 'Sumar gasto fijo',
  },
  fixedInstallments: {
    title: 'Sin cuotas',
    description: 'Registrá compras financiadas para seguir cuánto falta pagar.',
    action: 'Sumar cuota',
  },
  cycleInOrder: {
    title: 'Ciclo en orden',
    description: 'No hay gastos fijos urgentes o pendientes para este ciclo.',
  },
  categories: {
    title: 'Todavía no hay categorías',
    description: 'Creá tu primera categoría para ordenar mejor el historial y el alta de movimientos.',
    action: 'Crear categoría',
  },
  notifications: {
    title: 'Todo tranquilo',
    description: 'Cuando haya novedades de tu familia, las vas a ver acá.',
  },
} as const satisfies Record<string, EmptyStateCopy>

export type EmptyStateKey = keyof typeof emptyStates

export const loadingLabels = {
  expenses:      'Cargando tus gastos',
  fixedExpenses: 'Cargando gastos fijos',
  control:       'Leyendo tu ciclo',
  home:          'Leyendo tu hogar',
  categories:    'Cargando categorías',
  notifications: 'Cargando novedades',
  settings:      'Cargando tus preferencias',
} as const

export type LoadingLabelKey = keyof typeof loadingLabels

export const errorMessages = {
  network: 'No pudimos conectarnos. Revisá tu conexión.',
  server:  'Algo falló del lado del servidor. Probá de nuevo.',
  data:    'Los datos llegaron incompletos. Actualizá para reintentar.',
  auth:    'Tu sesión venció. Volvé a iniciar sesión.',
} as const

export type ErrorMessageKey = keyof typeof errorMessages
```

- [ ] **Step 4: Run tests**

```bash
./scripts/npmw run test -- tests/unit/copy-glossary.test.ts
```

Expected: 4 PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
./scripts/npmw run typecheck
git add mobile/lib/copy/ tests/unit/copy-glossary.test.ts
git commit -m "feat(copy): add canonical glossary + state templates + tests"
```

---

## Task 2: Move `shared/` → `ui/`, update imports

**Files:**
- Move: `mobile/components/shared/blocking-screen-view.tsx` → `mobile/components/ui/blocking-screen-view.tsx`
- Update 3 import sites:
  - `mobile/screens/shared/blocking-screen.tsx`
  - `mobile/components/guards.tsx`
  - `mobile/components/root/app-entry-gate.tsx`
- Delete: `mobile/components/shared/` folder (git rm)

- [ ] **Step 1: Move the file**

```bash
git mv mobile/components/shared/blocking-screen-view.tsx mobile/components/ui/blocking-screen-view.tsx
```

- [ ] **Step 2: Update the three import sites** — change `@/components/shared/blocking-screen-view` → `@/components/ui/blocking-screen-view` in:
  - `mobile/screens/shared/blocking-screen.tsx:1`
  - `mobile/components/guards.tsx:4`
  - `mobile/components/root/app-entry-gate.tsx:4`

- [ ] **Step 3: Remove the empty `shared/` folder** — git already drops it when the last file is moved. Verify no stray references:

```bash
grep -rn "components/shared" mobile app --include="*.ts" --include="*.tsx"
```

Expected: no results.

- [ ] **Step 4: Typecheck + test + commit**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
git add -A mobile/components/ mobile/screens/shared/blocking-screen.tsx
git commit -m "chore(ui): fold shared/ into ui/"
```

---

## Task 3: Update `<EmptyState>` to accept state keys

**Files:**
- Modify: `mobile/components/ui/empty-state.tsx`

- [ ] **Step 1: Add an optional `stateKey` prop**

Extend props:

```ts
import { emptyStates, type EmptyStateKey } from '@/lib/copy/states'

interface EmptyStateProps {
  action?: { label: string; onPress: () => void }
  icon?: keyof typeof MaterialIcons.glyphMap
  subtitle?: string   // now optional
  title?: string      // now optional
  stateKey?: EmptyStateKey
}
```

- [ ] **Step 2: Resolve template when `stateKey` is provided**

At the top of the component body:

```ts
const template = stateKey ? emptyStates[stateKey] : undefined
const resolvedTitle = title ?? template?.title ?? ''
const resolvedSubtitle = subtitle ?? template?.description ?? ''
```

If `action` is provided by the consumer, use it. Otherwise, if `template?.action` exists and the consumer passed an `onAction` handler (we need to add that too), build one.

Actually simpler: make the consumer still responsible for the action handler (since only they know what to do). Template contributes title + description only. If the consumer provides `action`, it wins. If the consumer doesn't provide `action` but the template has an action label, we still don't render a button — the consumer explicitly chose to omit action handling.

```ts
const template = stateKey ? emptyStates[stateKey] : undefined
const resolvedTitle = title ?? template?.title ?? ''
const resolvedSubtitle = subtitle ?? template?.description ?? ''
```

Replace `{title}` → `{resolvedTitle}`, `{subtitle}` → `{resolvedSubtitle}`.

- [ ] **Step 3: Typecheck + test + commit**

```bash
./scripts/npmw run typecheck
./scripts/npmw run test
git add mobile/components/ui/empty-state.tsx
git commit -m "feat(ui): EmptyState accepts stateKey for canonical templates"
```

---

## Task 4: Add CI grep gate for forbidden strings

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add a new guard script**

In `package.json`, alongside the existing `guard:legacy-spacing`, add:

```json
"guard:forbidden-copy": "node scripts/guard-forbidden-copy.mjs"
```

And chain it into `validate`:

```json
"validate": "npm run typecheck && npm run lint && npm run test && npm run guard:legacy-spacing && npm run guard:forbidden-copy"
```

- [ ] **Step 2: Create `scripts/guard-forbidden-copy.mjs`**

```js
#!/usr/bin/env node
/**
 * Fails CI when forbidden UI strings appear in app/mobile source.
 * Allowlist: prefix a line with `// @copy-allow` to skip.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.cwd())
const scanRoots = ['mobile', 'app'].map((d) => join(root, d))

const FORBIDDEN_PATTERNS = [
  { pattern: /['"]Cargando\.\.\.['"]|['"]Cargando…['"]/, hint: "Use loadingLabels.<key> from '@/lib/copy/states'" },
  { pattern: /['"]Sin datos['"]/, hint: "Use emptyStates.<key> from '@/lib/copy/states'" },
  { pattern: /['"]No hay registros['"]/, hint: "Use emptyStates.<key> from '@/lib/copy/states'" },
  { pattern: /['"]Error['"](?!\s*:)/, hint: "Use errorMessages.<key> from '@/lib/copy/states'" },
]

const violations = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue
    if (entry === 'node_modules' || entry === 'dist') continue
    const path = join(dir, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) {
      walk(path)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    if (entry.endsWith('.d.ts')) continue
    scanFile(path)
  }
}

function scanFile(path) {
  const content = readFileSync(path, 'utf8')
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.includes('@copy-allow')) continue
    for (const { pattern, hint } of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          file: relative(root, path),
          line: i + 1,
          content: line.trim(),
          hint,
        })
      }
    }
  }
}

for (const dir of scanRoots) {
  try {
    walk(dir)
  } catch {
    // directory missing — skip
  }
}

if (violations.length > 0) {
  console.error('\nForbidden UI copy detected:\n')
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`)
    console.error(`    ${v.content}`)
    console.error(`    → ${v.hint}\n`)
  }
  process.exit(1)
}

process.exit(0)
```

- [ ] **Step 3: Run the guard and fix any hits**

```bash
./scripts/npmw run guard:forbidden-copy
```

If it finds offenders, replace the literal with a glossary/states key or add `// @copy-allow` with a reason.

- [ ] **Step 4: Run validate**

```bash
./scripts/npmw run validate
```

Expected: green (except for the 1 pre-existing lint error + 4 warnings that predate Foundation).

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/guard-forbidden-copy.mjs
git commit -m "chore(ci): add forbidden-copy guard to validate"
```

---

## Task 5: Rewrite 5-10 prominent copy strings

**Files:** screens and components in home/fixed-expenses/settings/notifications where the audit flagged stale or passive copy.

Do NOT scope creep. Pick targets from the audit's §12 findings:

1. Debt empty state ("Cuando aparezca..." → "Registrá deudas, sumá...") — already exists via `emptyStates.debt` template; wire it in at the call site.
2. Any bare "Cargando..." → `loadingLabels.<key>`.
3. Any "Sin datos" / "No hay registros" → appropriate `emptyStates.<key>` or template.
4. Audit for `"Ciclo en orden"` / `"Sin recurrentes"` / `"Sin cuotas"` existing strings and wire to templates.
5. Any raw `error.message` rendered visibly → replace with `errorMessages.network` or `errorMessages.server` as appropriate.

- [ ] **Step 1: Grep for candidates**

```bash
grep -rnE "'Cargando\.\.\.'|\"Cargando\.\.\.\"|'Sin datos'|'No hay registros'" mobile/ app/ --include="*.tsx" --include="*.ts"
grep -rn "Cuando aparezca" mobile/ --include="*.tsx"
```

- [ ] **Step 2: For each hit, decide**

Options in priority order:
  1. Adopt an existing `emptyStates.<key>` / `loadingLabels.<key>` by importing from `@/lib/copy/states` and referencing it inline.
  2. Add a new key to the template file if none fits — update the glossary tests accordingly.
  3. Add `// @copy-allow` with a brief reason if the string is truly edge-case.

- [ ] **Step 3: Run validate + commit**

```bash
./scripts/npmw run validate
git add -A
git commit -m "chore(copy): adopt glossary templates in prominent screens"
```

---

## Task 6: Final validate + phase summary

- [ ] **Step 1: Run `./scripts/npmw run validate`**

Expected: typecheck green, tests green (target: ~72 if tests added), guard:legacy-spacing green, guard:forbidden-copy green, lint at same state as P4 end (1 pre-existing error + 4 warnings from user WIP, not from Foundation).

- [ ] **Step 2: Report Foundation complete**

All 5 PRs merged, 9+ primitives built, 9 primitives upgraded, tokens systematized, motion tokenized, copy canonical, CI gates active. Per-screen sub-specs next.

---

## Exit criteria

- `mobile/lib/copy/{glossary,states}.ts` exists, exported, tested.
- `mobile/components/shared/` deleted; `BlockingScreenView` lives in `ui/`; 3 import sites updated.
- `<EmptyState>` accepts `stateKey` with a canonical template resolver.
- `scripts/guard-forbidden-copy.mjs` exists and runs clean.
- 5-10 copy strings in existing screens adopted from templates.
- `./scripts/npmw run validate` green (modulo known pre-existing lint).
