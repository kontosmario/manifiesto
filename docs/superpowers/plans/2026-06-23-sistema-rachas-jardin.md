# Sistema de rachas "Mi jardín" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la racha "llama" por una metáfora de **jardín que crece** (4 vistas: pantalla "Mi jardín" desde Gastos, widget semanal en Home, celebración "Floración" que rediseña los Logros, y card animada "Cierre de semana"), reusando el motor de rachas server-side ya existente.

**Architecture:** El motor de datos NO se reconstruye — registrar un gasto variable o fijo ya "planta el brote" (trigger `trg_expenses_advance_streak` AFTER INSERT en `expenses`). El jardín es **derivación pura en cliente** sobre el historial de días-con-actividad (`expenses.created_at ∪ streak_marked_days`, en tz local vía `isoDay`) + UI nueva. La "Floración" hace swap del componente de celebración en `AchievementUnlockBridge` (backend de logros intacto). La política "sin culpa" suaviza las notificaciones punitivas de racha (no toca `advance_streak`).

**Tech Stack:** React Native / Expo SDK 54, Reanimated v4, react-native-svg, expo-router, Supabase (Postgres). Validación: `vitest` (lógica pura) + `tsc --noEmit` + `eslint` + `npx expo export --platform ios`.

## Global Constraints

- **Decisiones de producto (confirmadas por el owner 2026-06-23):**
  - **Jardín intacto + sin culpa:** la grilla muestra TODOS los días registrados (nunca se borra). El número de "racha activa" = `current_streak` existente (se pausa en huecos, NO se cambia el motor). Se **suavizan/quitan** las notificaciones punitivas (at-risk + streak-broken) y cualquier copy de "se cortó tu racha".
  - **Reemplazar la llama:** el jardín reemplaza `StreakFlameIcon` (header de Gastos) y la pantalla "Mi jardín" reemplaza a `StreakSheet`; la lógica de escudos/no-spend se migra a la pantalla nueva.
  - **Floración = celebración + galería:** la pantalla verde reemplaza `AchievementUnlockModal` para los 18 logros (map tier→intensidad) + re-skin de la galería. El catálogo/sistema de logros NO se toca.
  - **Fuente del sistema:** jerarquía con la tipografía actual del theme (pesos 800/900). NO se introduce Hanken Grotesk.
- **Timezone:** todo cálculo de "día" usa `isoDay(date, tz)` = `date.toLocaleDateString('en-CA', { timeZone })` con `tz = Intl.DateTimeFormat().resolvedOptions().timeZone` (fallback `America/Argentina/Buenos_Aires`). DEBE coincidir con el trigger server (lee `profiles.timezone`). NO usar UTC. (Memoria: `feedback_timestamptz_off_by_one`.)
- **Worklets Reanimated:** PROHIBIDO `Intl`/locale/`Easing` cross-runtime dentro de worklets (memorias `feedback_reanimated_worklet_globals`, `feedback_reanimated_easing_runtime`). Formatear en JS thread.
- **react-native-svg:** `Defs`/`LinearGradient`/`Stop` necesitan cast `React.FC` para aceptar children (memoria `feedback_react_native_svg_typing`).
- **Validación por task:** `cd /Users/mario/apps/manifiesto && source ~/.nvm/nvm.sh && nvm use && npm run typecheck && npx eslint <archivos> && npx vitest run <test>`. Antes de declarar una FASE verificada: `npx expo export --platform ios` (validate ≠ bundle, memoria `feedback_validate_is_not_bundle`).
- **Commits:** SIN backticks en `-m` (corrompe zsh). Terminar con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Docs en sync:** crear `docs/sistemas/jardin-rachas.md` y actualizarlo en la misma fase que el código (memoria `feedback_keep_docs_in_sync`).
- **Convención de altitud de este plan:** la lógica PURA (derivación del jardín, score de semana, map tier→intensidad) va con código completo + tests vitest. Los componentes de UI van con interfaz (props) + tokens/medidas exactas del handoff + qué primitivas reusar + pasos de validación; el JSX final se escribe leyendo los valores exactos de `~/Downloads/design_handoff_sistema_rachas_jardin/Jardin Manifiesto.dc.html` (referencia hifi) durante la task. NO copiar `support.js` (runtime del prototipo).

---

## File Structure

**Feature (lógica + datos)**
- `mobile/features/garden/garden-model.ts` — tipos `BroteStage`/`GardenCell`/`WeekClose` + derivación pura: `deriveGardenCells`, `broteStageForDay`, `deriveWeekClose`, `weekCloseCopy`. **Sin React, sin Supabase.**
- `mobile/features/garden/garden-model.test.ts` — vitest (env node, módulo puro — permitido por memoria `feedback_vitest_no_react_renderer`).
- `mobile/features/garden/use-garden.ts` — hook que compone `useStreak` + `useExpenses` + marcas no-spend → `GardenData` (35 celdas + score semanal + contadores). Reusa `isoDay`.
- `mobile/features/garden/garden-tier.ts` — map `tier (bronze/silver/gold/legendary)` → intensidad de floración (color/partículas/blooms) para la celebración.

**Componentes del jardín**
- `mobile/components/garden/sprout.tsx` — un brote por estado (semilla/germinación/arraigado/salteado/pendiente). `arraigado` usa `FernMark`.
- `mobile/components/garden/garden-grid.tsx` — grilla 7×5 con "tierra" (radial + sombra interna) + `Sprout`.
- `mobile/components/garden/garden-hero.tsx` — hero "Racha activa" (gradiente + glow helecho + `CardParticles` luciérnagas + `CountUpText`).
- `mobile/components/garden/plant-button.tsx` — CTA "Plantar el brote de hoy" / estado "plantado · volvé mañana".
- `mobile/components/garden/garden-stats.tsx` — 3 stat cards (Jardín / Récord / Semillas).
- `mobile/components/garden/week-close-banner.tsx` — banner en la pantalla que refleja el score semanal.
- `mobile/components/garden/garden-leaf-icon.tsx` — glifo de header (reemplaza `StreakFlameIcon`) con badge de racha.
- `mobile/components/garden/coral-bloom.tsx` — flor coral que late (`bloomFlit`) pegada al helecho (floración + semana perfecta).
- `mobile/components/garden/floracion-view.tsx` — celebración full-screen verde (reemplaza `AchievementUnlockModal`); props `{ item, onDismiss }`.
- `mobile/components/garden/week-close-celebration.tsx` — escena "Cierre de semana" (7 brotes que maduran + score + confeti).

**Pantallas / rutas**
- `mobile/screens/garden/garden-screen.tsx` — "Mi jardín" (compone todo + migra lógica no-spend de `StreakSheet`).
- `app/(app)/garden.tsx` — ruta thin (re-export del screen) + registro en el Stack.

**Integraciones (modificar)**
- `mobile/components/home/home-dashboard.tsx` — montar el widget semanal.
- `mobile/components/home/streak-week-widget.tsx` — **crear** widget compacto (tira L-M-M-J-V-S-D + número).
- `mobile/screens/home/gastos-v2-screen.tsx` — swap `StreakFlameIcon`→`GardenLeafIcon`, `handlePressStreak`→`router.push('/garden')`.
- `mobile/components/bridges/achievement-unlock-bridge.tsx` — render `FloracionView` en vez de `AchievementUnlockModal`.
- `mobile/components/root/app-stack-shell.tsx` — registrar `Stack.Screen name="garden"`.
- `mobile/screens/settings/achievements-gallery-screen.tsx` — re-skin botánico.
- `mobile/theme/palette.ts` — tokens `gardenSoil`/`gardenSoilFern`/`gardenSkipped` (light+dark).
- `mobile/screens/dev/achievements-streak-preview-screen.tsx` — previews del jardín.

**Backend**
- `supabase/migrations/<ts>_garden_sin_culpa_soften_streak_notifications.sql` — suavizar/desactivar las notificaciones punitivas (at-risk + broken).

**Docs**
- `docs/sistemas/jardin-rachas.md` — doc canónico del sistema.

---

## FASE A — Fundaciones: derivación pura + hook + tokens

### Task A1: Modelo + derivación pura del jardín

**Files:**
- Create: `mobile/features/garden/garden-model.ts`
- Test: `mobile/features/garden/garden-model.test.ts`

**Interfaces:**
- Produces:
  - `type BroteStage = 'pre' | 'pending' | 'missed' | 'seed' | 'germ' | 'fern'`
  - `interface GardenCell { iso: string; ageDays: number; stage: BroteStage; fernSize: number; isToday: boolean }`
  - `interface WeekClose { score: number; stage: 'none'|'seed'|'germ'|'fern'; bloom: boolean; label: string; title: string; sub: string; days: Array<{ letter: string; registered: boolean }> }`
  - `function deriveGardenCells(activityIso: ReadonlySet<string>, todayIso: string, dayIsoAtOffset: (offset: number) => string, firstActivityIso: string | null): GardenCell[]` — 35 celdas, índice 0 = más viejo (34 días atrás), índice 34 = hoy.
  - `function broteStageForDay(ageDays: number, logged: boolean, isPreTracking: boolean): BroteStage`
  - `function deriveWeekClose(activityIso: ReadonlySet<string>, weekDayIso: (dayIndexMonday0: number) => string): WeekClose` — score = días registrados de la semana L→D.
  - `function fernSizeForAge(ageDays: number): number` — `Math.round(24 + Math.min((ageDays - 14) * 0.5, 8))` (24→32).

- [ ] **Step 1: Escribir el test (lógica de estados del brote)**

```ts
// mobile/features/garden/garden-model.test.ts
import { describe, expect, it } from 'vitest'
import {
  broteStageForDay,
  fernSizeForAge,
  deriveGardenCells,
  deriveWeekClose,
} from './garden-model'

describe('broteStageForDay', () => {
  it('pre-tracking days are "pre" regardless of logged', () => {
    expect(broteStageForDay(40, false, true)).toBe('pre')
    expect(broteStageForDay(40, true, true)).toBe('pre')
  })
  it('today not logged is "pending"', () => {
    expect(broteStageForDay(0, false, false)).toBe('pending')
  })
  it('unlogged in-window day is "missed" (no marchita)', () => {
    expect(broteStageForDay(5, false, false)).toBe('missed')
  })
  it('logged day matures with age: seed <=6, germ 7..13, fern >=14', () => {
    expect(broteStageForDay(0, true, false)).toBe('seed')
    expect(broteStageForDay(6, true, false)).toBe('seed')
    expect(broteStageForDay(7, true, false)).toBe('germ')
    expect(broteStageForDay(13, true, false)).toBe('germ')
    expect(broteStageForDay(14, true, false)).toBe('fern')
  })
})

describe('fernSizeForAge', () => {
  it('grows from 24 to 32 and caps', () => {
    expect(fernSizeForAge(14)).toBe(24)
    expect(fernSizeForAge(30)).toBe(32)
    expect(fernSizeForAge(60)).toBe(32)
  })
})

describe('deriveGardenCells', () => {
  const todayIso = '2026-06-22'
  // offset 0 = today, offset 34 = oldest
  const dayIsoAtOffset = (offset: number) => {
    const d = new Date(Date.UTC(2026, 5, 22) - offset * 86_400_000)
    return d.toISOString().slice(0, 10)
  }
  it('returns 35 cells, index34 = today', () => {
    const cells = deriveGardenCells(new Set(['2026-06-22']), todayIso, dayIsoAtOffset, '2026-06-01')
    expect(cells).toHaveLength(35)
    expect(cells[34].isToday).toBe(true)
    expect(cells[34].iso).toBe('2026-06-22')
  })
  it('today logged = seed, today unlogged = pending', () => {
    const logged = deriveGardenCells(new Set(['2026-06-22']), todayIso, dayIsoAtOffset, '2026-06-22')
    expect(logged[34].stage).toBe('seed')
    const empty = deriveGardenCells(new Set(), todayIso, dayIsoAtOffset, null)
    expect(empty[34].stage).toBe('pending')
  })
  it('days before firstActivity are pre-tracking, gaps inside are missed', () => {
    const cells = deriveGardenCells(
      new Set(['2026-06-20', '2026-06-22']),
      todayIso,
      dayIsoAtOffset,
      '2026-06-20',
    )
    // 2026-06-21 (age1) is inside tracking, unlogged → missed
    const d21 = cells.find((c) => c.iso === '2026-06-21')!
    expect(d21.stage).toBe('missed')
    // 2026-06-19 is before first activity → pre
    const d19 = cells.find((c) => c.iso === '2026-06-19')!
    expect(d19.stage).toBe('pre')
  })
})

describe('deriveWeekClose', () => {
  // Monday..Sunday of a reference week
  const weekDayIso = (i: number) =>
    new Date(Date.UTC(2026, 5, 16) + i * 86_400_000).toISOString().slice(0, 10)
  it('score 7 = perfect week, fern + bloom', () => {
    const all = new Set(Array.from({ length: 7 }, (_, i) => weekDayIso(i)))
    const wc = deriveWeekClose(all, weekDayIso)
    expect(wc.score).toBe(7)
    expect(wc.stage).toBe('fern')
    expect(wc.bloom).toBe(true)
    expect(wc.label).toBe('Semana perfecta')
  })
  it('score thresholds map to stages', () => {
    const mk = (n: number) => new Set(Array.from({ length: n }, (_, i) => weekDayIso(i)))
    expect(deriveWeekClose(mk(6), weekDayIso).stage).toBe('fern')
    expect(deriveWeekClose(mk(4), weekDayIso).stage).toBe('germ')
    expect(deriveWeekClose(mk(2), weekDayIso).stage).toBe('seed')
    expect(deriveWeekClose(mk(0), weekDayIso).stage).toBe('none')
  })
})
```

- [ ] **Step 2: Correr el test, verificar que falla** — `npx vitest run mobile/features/garden/garden-model.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar el modelo**

```ts
// mobile/features/garden/garden-model.ts
// Derivación PURA del jardín (sin React, sin Supabase). La madurez del
// brote depende de la ANTIGÜEDAD del día (no de la posición). Días
// salteados NO rompen el jardín (decisión "sin culpa"): se muestran como
// brote tenue. Refleja la lógica del prototipo de diseño (renderVals()).

export type BroteStage = 'pre' | 'pending' | 'missed' | 'seed' | 'germ' | 'fern'

export interface GardenCell {
  iso: string
  ageDays: number
  stage: BroteStage
  fernSize: number
  isToday: boolean
}

export interface WeekClose {
  score: number
  stage: 'none' | 'seed' | 'germ' | 'fern'
  bloom: boolean
  label: string
  title: string
  sub: string
  days: Array<{ letter: string; registered: boolean }>
}

export const GARDEN_COLS = 7
export const GARDEN_ROWS = 5
export const GARDEN_CELLS = GARDEN_COLS * GARDEN_ROWS // 35

export function fernSizeForAge(ageDays: number): number {
  return Math.round(24 + Math.min((ageDays - 14) * 0.5, 8))
}

export function broteStageForDay(
  ageDays: number,
  logged: boolean,
  isPreTracking: boolean,
): BroteStage {
  if (isPreTracking) return 'pre'
  if (ageDays === 0 && !logged) return 'pending'
  if (!logged) return 'missed'
  if (ageDays <= 6) return 'seed'
  if (ageDays <= 13) return 'germ'
  return 'fern'
}

/**
 * 35 celdas, índice 0 = 34 días atrás (más viejo), índice 34 = hoy.
 * `dayIsoAtOffset(offset)` devuelve el ISO del día `offset` días atrás
 * (offset 0 = hoy) en el timezone local del usuario.
 */
export function deriveGardenCells(
  activityIso: ReadonlySet<string>,
  todayIso: string,
  dayIsoAtOffset: (offset: number) => string,
  firstActivityIso: string | null,
): GardenCell[] {
  const cells: GardenCell[] = []
  for (let i = 0; i < GARDEN_CELLS; i++) {
    const ageDays = GARDEN_CELLS - 1 - i // i=34 → age 0 (hoy)
    const iso = dayIsoAtOffset(ageDays)
    const logged = activityIso.has(iso)
    const isPreTracking = firstActivityIso !== null && iso < firstActivityIso
    const stage = broteStageForDay(ageDays, logged, isPreTracking)
    cells.push({
      iso,
      ageDays,
      stage,
      fernSize: stage === 'fern' ? fernSizeForAge(ageDays) : 26,
      isToday: iso === todayIso,
    })
  }
  return cells
}

// Score 0–7 de la semana L→D → madurez + copy. Tabla del handoff.
export function weekCloseCopy(score: number): {
  stage: WeekClose['stage']
  bloom: boolean
  label: string
  title: string
  sub: string
} {
  if (score >= 7)
    return { stage: 'fern', bloom: true, label: 'Semana perfecta', title: 'Tu jardín floreció.', sub: 'Registraste los 7 días. Cada brote llegó a su máximo.' }
  if (score >= 5)
    return { stage: 'fern', bloom: false, label: 'Gran semana', title: 'Casi pleno.', sub: 'La mayoría de tus brotes maduraron. Te faltó poco para el jardín completo.' }
  if (score >= 3)
    return { stage: 'germ', bloom: false, label: 'Semana en marcha', title: 'Vas tomando ritmo.', sub: 'Tus brotes están creciendo. Una semana más así y maduran del todo.' }
  if (score >= 1)
    return { stage: 'seed', bloom: false, label: 'Semana tranquila', title: 'Unos pocos brotes.', sub: 'Asomaron algunas semillas. Sin culpa — la próxima arrancás con todo.' }
  return { stage: 'none', bloom: false, label: 'Una pausa', title: 'Esta semana, descanso.', sub: 'No registraste días, y está bien. Tu jardín te espera intacto.' }
}

/** `weekDayIso(i)` devuelve el ISO del día i de la semana (0=Lunes..6=Domingo). */
export function deriveWeekClose(
  activityIso: ReadonlySet<string>,
  weekDayIso: (dayIndexMonday0: number) => string,
): WeekClose {
  const letters = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  const days = letters.map((letter, i) => ({
    letter,
    registered: activityIso.has(weekDayIso(i)),
  }))
  const score = days.filter((d) => d.registered).length
  const copy = weekCloseCopy(score)
  return { score, ...copy, days }
}
```

- [ ] **Step 4: Correr el test, verificar PASS** — `npx vitest run mobile/features/garden/garden-model.test.ts` → PASS.

- [ ] **Step 5: Typecheck + lint + commit**

```bash
npm run typecheck && npx eslint mobile/features/garden/garden-model.ts mobile/features/garden/garden-model.test.ts
git add mobile/features/garden/garden-model.ts mobile/features/garden/garden-model.test.ts
git commit -m "feat(garden): modelo + derivacion pura del jardin (brotes por antiguedad, cierre de semana)"
```

### Task A2: Hook `useGarden`

**Files:**
- Create: `mobile/features/garden/use-garden.ts`

**Interfaces:**
- Consumes: `useStreak(familyId, userId)` → `StreakData` (de `mobile/features/streaks/use-streak.ts`); `useExpenses(familyId)`; `deriveGardenCells`/`deriveWeekClose` (A1).
- Produces: `function useGarden(familyId?: string, userId?: string): { data: GardenData | null; isLoading: boolean }` con
  `interface GardenData { currentStreak: number; longestStreak: number; totalDaysLogged: number; freezeTokens: number; hasLoggedToday: boolean; cells: GardenCell[]; weekClose: WeekClose; firstActivityIso: string | null }`

- [ ] **Step 1: Implementar el hook** — derivar el set de actividad de 35 días reusando el patrón EXACTO de `use-streak.ts:208-231` (no UTC; `isoDay` + tz local), uniendo `expenses` filtrados por `created_by===userId` con `markedDaysIso`. Construir `dayIsoAtOffset(offset)` con `isoDay(new Date(today - offset*86_400_000), tz)`. `firstActivityIso` = mínimo del set (o null). `weekDayIso(i)` = lunes de la semana actual + i días, en tz local. Componer `GardenData` desde `StreakData` (currentStreak/longestStreak/totalDaysLogged/freezeTokens/hasLoggedToday) + `deriveGardenCells` + `deriveWeekClose`.

```ts
// mobile/features/garden/use-garden.ts (esqueleto — completar)
import { useMemo } from 'react'
import { useStreak } from '@/features/streaks/use-streak'
import { useExpenses } from '@/features/expenses/use-expenses'
import {
  deriveGardenCells,
  deriveWeekClose,
  type GardenCell,
  type WeekClose,
} from './garden-model'

export interface GardenData {
  currentStreak: number
  longestStreak: number
  totalDaysLogged: number
  freezeTokens: number
  hasLoggedToday: boolean
  cells: GardenCell[]
  weekClose: WeekClose
  firstActivityIso: string | null
}

function isoDay(d: Date, tz: string): string {
  return d.toLocaleDateString('en-CA', { timeZone: tz })
}
function resolveTz(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz && tz.length > 0 ? tz : 'America/Argentina/Buenos_Aires'
  } catch {
    return 'America/Argentina/Buenos_Aires'
  }
}

export function useGarden(familyId?: string, userId?: string) {
  const streak = useStreak(familyId, userId)
  const expensesQuery = useExpenses(familyId)
  const data = useMemo<GardenData | null>(() => {
    if (!familyId || !userId || !streak.data) return null
    const tz = resolveTz()
    const today = new Date()
    const todayIso = isoDay(today, tz)
    const activity = new Set<string>(streak.data.markedDaysIso)
    for (const e of expensesQuery.data ?? []) {
      if (e.created_by !== userId) continue
      activity.add(isoDay(new Date(e.created_at), tz))
    }
    const dayIsoAtOffset = (offset: number) =>
      isoDay(new Date(today.getTime() - offset * 86_400_000), tz)
    // lunes de la semana actual (getDay: 0=Dom..6=Sáb → Monday0)
    const dow = (today.getDay() + 6) % 7
    const weekDayIso = (i: number) =>
      isoDay(new Date(today.getTime() - (dow - i) * 86_400_000), tz)
    const firstActivityIso =
      activity.size > 0 ? [...activity].sort()[0] : null
    return {
      currentStreak: streak.data.currentStreak,
      longestStreak: streak.data.longestStreak,
      totalDaysLogged: streak.data.totalDaysLogged,
      freezeTokens: streak.data.freezeTokens,
      hasLoggedToday: streak.data.hasLoggedToday,
      cells: deriveGardenCells(activity, todayIso, dayIsoAtOffset, firstActivityIso),
      weekClose: deriveWeekClose(activity, weekDayIso),
      firstActivityIso,
    }
  }, [familyId, userId, streak.data, expensesQuery.data])
  return { data, isLoading: streak.isLoading || expensesQuery.isLoading }
}
```

> **NOTA sobre 35 días vs `markedDaysIso[14]`:** `markedDaysIso` está limitado a 14 días por el query. Los días marcados "sin gasto" más viejos que 14 NO aparecerán como brote. Para v1 es aceptable (los días con gasto real sí se derivan completos de `expenses`). Si en QA se ve un hueco incorrecto >14 días, ampliar el `LIMIT` de `fetchMarkedDays` en `use-streak.ts` a 35. Documentar en `docs/sistemas/jardin-rachas.md`.

- [ ] **Step 2: Typecheck + lint** — `npm run typecheck && npx eslint mobile/features/garden/use-garden.ts` → 0 errores.

- [ ] **Step 3: Commit** — `git commit -m "feat(garden): hook useGarden (35 dias derivados + cierre de semana, tz local)"`

### Task A3: Tokens de tierra/brote + `garden-tier`

**Files:**
- Modify: `mobile/theme/palette.ts` (agregar a `lightColors` y `darkColors` + a la interfaz `ThemeColors`)
- Create: `mobile/features/garden/garden-tier.ts`

**Interfaces:**
- Produces (palette): `gardenSoil: string`, `gardenSoilFern: string`, `gardenSkipped: string` (light: soil `#F1F6EC`/fern `#ECF4E2` montículo, skipped `#CBC6B6`; dark: equivalentes legibles sobre canvas).
- Produces (garden-tier): `function floracionToneForTier(tier: 'bronze'|'silver'|'gold'|'legendary'): { accent: string; particleCount: number; blooms: number }` — legendary = más luciérnagas + 2 blooms coral; bronze = sobrio.

- [ ] **Step 1:** Agregar los 3 tokens a la interfaz `ThemeColors` + `lightColors` + `darkColors` en `palette.ts` (cada bg con su par legible; verificar contraste del texto sobre `gardenSoil`).
- [ ] **Step 2:** Crear `garden-tier.ts` con `floracionToneForTier` (4 tiers → intensidad). bronze: `{accent: heroAccent, particleCount: 10, blooms: 1}`; legendary: `{accent: '#9FE08A', particleCount: 18, blooms: 2}`.
- [ ] **Step 3:** Typecheck + lint + commit — `git commit -m "feat(garden): tokens de tierra/brote + map tier->intensidad de floracion"`

---

## FASE B — Pantalla "Mi jardín" (desde Gastos)

> Referencia hifi: Frame 1 del HTML (`Jardin Manifiesto.dc.html` líneas 39–171). Reusar `CardParticles` (luciérnagas), `FernMark` (helecho), `CountUpText` (número de racha), `AuroraBloom` (glow), `RiseView` (stagger). Patrón de pantalla scrollable: ver memoria `feedback_form_modal_pattern` y `feedback_screen_bodystyle_and_sheet_exit_flags`.

### Task B1: Componente `Sprout` (brote por estado)
**Files:** Create `mobile/components/garden/sprout.tsx`
**Interfaces:** Produces `function Sprout({ stage, fernSize, animateIn }: { stage: BroteStage; fernSize?: number; animateIn?: boolean }): JSX.Element`
- [ ] Implementar los 5 estados como SVG (`react-native-svg`), calcando los paths del HTML: **semilla** (líneas 104–107: ellipse tierra `#C29A5E` + tallo), **germinación** (111–115: tallo `#3C7D34` + 2 hojas `#9FD580`/`#A9D57F`), **arraigado** (`<FernMark variant="cream" size={fernSize} />`), **salteado** (123–126: trazo gris `#B7B2A2` opacity .62), **pendiente** (130: círculo `2px dashed #7FC56A`). `animateIn` → entrada `sprout`/`growIn` con `cubic-bezier(.2,.8,.2,1)` (Reanimated, NO Easing cross-runtime).
- [ ] Typecheck + lint + commit.

### Task B2: `GardenGrid` (7×5)
**Files:** Create `mobile/components/garden/garden-grid.tsx`
**Interfaces:** Consumes `GardenCell[]` (A1), `Sprout` (B1). Produces `function GardenGrid({ cells }: { cells: GardenCell[] }): JSX.Element`
- [ ] Grid `repeat(7,1fr)` gap 8, celdas `aspect 1` radius 14. Celda "plantada" = fondo radial "tierra" (`gardenSoil`/`gardenSoilFern` según fern) + sombra interna `inset 0 -7px 11px -6px rgba(60,125,52,.22)` (HTML 70, 409–414). Render `Sprout` por celda. Leyenda de 4 chips (semilla/creciendo/arraigado/salteado) — HTML 137–142.
- [ ] Typecheck + lint + commit.

### Task B3: `GardenHero` + `PlantButton` + `GardenStats` + `WeekCloseBanner`
**Files:** Create `garden-hero.tsx`, `plant-button.tsx`, `garden-stats.tsx`, `week-close-banner.tsx`
**Interfaces:**
- `GardenHero({ streak, justPlanted }: { streak: number; justPlanted: boolean })` — gradiente `heroGradient`, glow helecho 124px (`FernMark` + `AuroraBloom`), `<CardParticles count={7} color={heroAccent} accentColor={peach} />`, número con `<CountUpText value={streak} unit="integer" />`, "+1 brote" float al plantar. HTML 60–80.
- `PlantButton({ planted, onPress }: { planted: boolean; onPress: () => void })` — full-width 58px radius 18; sin plantar = gradiente verde `#3FA13F→#2E7D31` + sombra; plantado = `#E7F2DF`/texto `#2E7D31` "🌱 Brote plantado · volvé mañana". HTML 145–148, 565–568.
- `GardenStats({ total, record, seeds }: { total: number; record: number; seeds: number })` — 3 cards (Jardín/Récord/Semillas). HTML 150–167.
- `WeekCloseBanner({ weekClose, onPress }: { weekClose: WeekClose; onPress: () => void })` — refleja score; perfecta = fondo `#E7F1DE`/borde `#C9E3BB`/chip verde; si no, blanco/chip neutro. HTML 82–90, 541–543.
- [ ] Implementar los 4 (cada uno con su par de validación) + commit por componente o agrupado.

### Task B4: `GardenScreen` + ruta + migración no-spend
**Files:** Create `mobile/screens/garden/garden-screen.tsx`, `app/(app)/garden.tsx`; Modify `mobile/components/root/app-stack-shell.tsx`
**Interfaces:** Consumes `useGarden` (A2), `useMarkNoExpenseDay` (de `use-streak.ts`), B1–B3.
- [ ] Componer la pantalla: header ("Mi jardín" + subtítulo + avatar helecho), `GardenHero`, `WeekCloseBanner`, card "Tu jardín" (`GardenGrid`), `PlantButton`, `GardenStats`, footnote. Scroll nativo (patrón `Screen` + `RiseView` stagger — memoria `feedback_form_modal_pattern`).
- [ ] **Plantar el brote de hoy:** si `!hasLoggedToday` → `useMarkNoExpenseDay({})` (planta hoy sin gasto, reusa el RPC existente que ya invalida streak+marked+home_snapshot). Migrar el copy/confirm de `StreakSheet` (escudos/no-spend) a esta pantalla. Confeti opcional con `ConfettiBurst` al plantar.
- [ ] Crear `app/(app)/garden.tsx` (thin re-export) + registrar `<Stack.Screen name="garden" />` en `app-stack-shell.tsx` (presentación card, patrón de `settings/achievements`). Verificar `freezeOnBlur` coherente (memoria `feedback_freeze_on_blur_breaks_gestures` aplica a `<Tabs>`, no al Stack — OK card default).
- [ ] Typecheck + lint + **bundle** (`npx expo export --platform ios`) + commit.

### Task B5: Swap del entry-point en Gastos (llama → hoja)
**Files:** Create `mobile/components/garden/garden-leaf-icon.tsx`; Modify `mobile/screens/home/gastos-v2-screen.tsx`
- [ ] `GardenLeafIcon({ streak, onPress })` — glifo `FernMark`/hoja + badge con `streak` (calcar la estructura de `StreakFlameIcon`). 
- [ ] En `gastos-v2-screen.tsx`: reemplazar `StreakFlameIcon` por `GardenLeafIcon` en el `rightSlot` (empty-state ~:837 y lista poblada ~:1033). Cambiar `handlePressStreak` (~:509-512) de abrir `StreakSheet` a `router.push('/garden')`. Mantener `useStreak` para el badge. **Dejar `StreakSheet` montado pero sin entry-point** (se borra en limpieza F) o quitarlo si no hay otros consumidores.
- [ ] Typecheck + lint + bundle + commit. **Probar en device:** tocar la hoja en Gastos abre "Mi jardín".

---

## FASE C — Widget de Home (tira semanal)

> Referencia: Frame 2 del HTML (líneas 189–203). Base: `WeekActivity` (`week-activity.tsx`) + `useStreak.weekActivity[7]`.

### Task C1: `StreakWeekWidget` + montaje en Home
**Files:** Create `mobile/components/home/streak-week-widget.tsx`; Modify `mobile/components/home/home-dashboard.tsx`
**Interfaces:** Consumes `useStreak(familyId, userId)` → `weekActivity[7]` (idx6=hoy) + `currentStreak`.
- [ ] Card blanca radius 22, una fila: grilla 7 col (letra L-M-M-J-V-S-D + punto por estado: registrado verde, hoy-pendiente anillo dashed, salteado gris, futuro tenue) + divisor + número de racha (`CountUpText unit="integer"` o estático) + "días". HTML 190–202. Tocar la columna de HOY → `useMarkNoExpenseDay` (plantar) o `router.push('/garden')` (decisión: navegar es más seguro; plantar inline puede confundir). **Default: tap en el widget → navega a /garden; tap en hoy-pendiente → plantar.**
- [ ] Montar en `home-dashboard.tsx` dentro de `styles.stack` (gap 8), entre el hero y `MonthSummaryCard` (~:947-958). Envolver en `RiseView` con delay coherente. Opcional `TourTarget` para un step de tour.
- [ ] Typecheck + lint + bundle + commit. **Probar en device:** el widget aparece en Home con la racha real.

---

## FASE D — Floración (rediseño de Logros)

> Referencia: Frame 3 del HTML (líneas 211–242). Reemplaza `AchievementUnlockModal`. Reusar `CardParticles` (18 luciérnagas), `FernMark`/`FernLogo`, `ConfettiBurst`, `AuroraBloom`, `coral-bloom`. Map tier→intensidad: `floracionToneForTier` (A3).

### Task D1: `CoralBloom` (flor coral que late)
**Files:** Create `mobile/components/garden/coral-bloom.tsx`
**Interfaces:** Produces `function CoralBloom({ size, color, left, top, delay }: {...}): JSX.Element` — punto coral con glow + animación `bloomFlit` (HTML keyframe líneas 27–33; Reanimated loop 10.5–13.5s, ease-in-out, sin focus-gating). NO Intl/Easing en worklet.
- [ ] Implementar + typecheck + lint + commit.

### Task D2: `FloracionView` + swap en el bridge
**Files:** Create `mobile/components/garden/floracion-view.tsx`; Modify `mobile/components/bridges/achievement-unlock-bridge.tsx`
**Interfaces:** MISMA firma que `AchievementUnlockModal`: `function FloracionView({ item, onDismiss }: { item: AchievementViewItem | null; onDismiss: () => void }): JSX.Element`
- [ ] Implementar la celebración full-screen verde (`#163A1E`): `CardParticles` (18, mitad coral mitad menta vía `color`/`accentColor`), helecho central 150px (`FernLogo animate`) + `AuroraBloom` glow `#2E6B34` + `CoralBloom` ×2, label "HITO ALCANZADO", título `item.title`, número/copy `item.body`, chip "Nueva especie desbloqueada", botón "Seguir cultivando" (`#9FE08A`/texto `#163A1E`), auto-dismiss 4s + tap-to-close + haptic success (calcar el esqueleto de `AchievementUnlockModal` 66–200). Intensidad por `floracionToneForTier(item.tier)`.
- [ ] En `achievement-unlock-bridge.tsx`: `return <FloracionView item={active} onDismiss={handleDismiss} />` (line 50). Sin tocar realtime/preview.
- [ ] Typecheck + lint + bundle + commit. **Probar:** Settings → dev "Preview · Logros & Racha" dispara la floración nueva.

### Task D3: Re-skin de la galería de logros
**Files:** Modify `mobile/screens/settings/achievements-gallery-screen.tsx`
- [ ] Re-skinear `BadgeTile` + `ProgressRingHero` a la estética botánica (tierra/brote/menta; `CardParticles` ya está). Mantener el shape `AchievementViewItem` + el catálogo. Earned = brote arraigado/color; locked = silueta tenue. NO cambiar la data ni las rutas.
- [ ] Typecheck + lint + bundle + commit.

---

## FASE E — Cierre de semana (celebración animada)

> Referencia: Frame 4 del HTML (líneas 245–334). Derivar `weekClose` de `useGarden` (A2). Reusar el patrón scene-builder de `cycle-wrapped-modal` + `DrawRing` (score) + `ConfettiBurst` (solo 7/7) + `CardParticles` + `RiseView` (stagger growIn de los 7 brotes). **El scrubber 0–7 del prototipo NO es producto final** (solo demo).

### Task E1: `WeekCloseCelebration`
**Files:** Create `mobile/components/garden/week-close-celebration.tsx`
**Interfaces:** Consumes `WeekClose` (A1), `Sprout` (B1), `CoralBloom` (D1). Produces `function WeekCloseCelebration({ weekClose, perfectWeeks, onContinue }: {...}): JSX.Element`
- [ ] Fondo `#163A1E`, `CardParticles` + `ConfettiBurst` (solo si `score===7`). Label "CIERRE DE SEMANA", título `weekClose.title`, chip "<label> · X de 7 días". Fila de 7 brotes que crecen escalonados (`growIn` delay i·0.07s, vía `RiseView`/Reanimated), maduros según `weekClose.stage`; no registrados = salteado; semana perfecta = `CoralBloom` en cada helecho. Texto `weekClose.sub`. Card "Semanas perfectas" (número `CountUpText`). Botón "Seguir cultivando" re-dispara la entrada. Nota al pie.
- [ ] Typecheck + lint + bundle + commit.

### Task E2: Wire del cierre (banner → celebración) + trigger
**Files:** Modify `mobile/screens/garden/garden-screen.tsx` (+ ruta o modal para la celebración)
- [ ] `WeekCloseBanner.onPress` → presentar `WeekCloseCelebration` (modal o ruta `/(app)/garden/week-close`). 
- [ ] **Disparo automático (decisión de alcance v1):** mostrar la celebración una vez al abrir el jardín si la semana recién cerró (domingo→lunes) y no se vio aún (flag local `garden_week_close_seen_<isoSemana>` en el store de dismiss, patrón `control-dismiss-store`). Si se decide diferir el auto-disparo, dejar solo el banner manual y documentarlo. 
- [ ] Typecheck + lint + bundle + commit.

---

## FASE F — "Sin culpa" (backend) + previews + cierre

### Task F1: Suavizar notificaciones punitivas de racha
**Files:** Create `supabase/migrations/<ts>_garden_sin_culpa_soften_streak_notifications.sql`
- [ ] **Leer primero** los crons `cron_emit_streak_broken`, `cron_emit_streak_at_risk`, `cron_emit_streak_recovery_nudge` en `supabase/migrations/20260505234115_streak_recovery_system.sql:280-634` + cómo emiten push (notifications). 
- [ ] Migración que **desactiva o re-copya sin culpa** las notificaciones de **at-risk** y **streak-broken** (las que dicen "se corta/cortó tu racha"). NO tocar `advance_streak` ni `current_streak` (la racha sigue pausándose, pero el jardín "no marchita" → sin alarmas). Mantener (o suavizar) los recovery-nudges si son no-punitivos. Correr `supabase:functions:check` no aplica (no edge functions); verificar que la migración no rompe los crons restantes. **Aplicar a prod requiere confirmación explícita del owner** (cambio en notificaciones vivas).
- [ ] Validar con `mcp__claude_ai_Supabase__execute_sql` (dry inspection de las funciones) antes de aplicar. Commit del archivo de migración.

### Task F2: Previews dev + doc + limpieza
**Files:** Modify `mobile/screens/dev/achievements-streak-preview-screen.tsx`; Create `docs/sistemas/jardin-rachas.md`; (limpieza) borrar `StreakSheet`/`StreakFlameIcon` si quedaron sin consumidores.
- [ ] Agregar previews del jardín (brotes en cada estado, floración por tier, cierre de semana por score) al preview screen dev.
- [ ] Escribir `docs/sistemas/jardin-rachas.md`: modelo de datos (derivación), decisión "sin culpa", las 4 vistas, cómo se planta el brote, el map tier→floración, y la nota de 14-vs-35 días.
- [ ] **Limpieza:** si `StreakSheet`/`StreakFlameIcon`/`StreakData.atRisk*` ya no tienen consumidores, borrarlos (o dejar `StreakSheet` si la lógica de escudos sigue viva en otro lado). Verificar con grep antes de borrar (memoria: borrar solo lo que confirmaste sin referencias).
- [ ] Typecheck + lint + **bundle** + commit. Actualizar la memoria del proyecto con un `project_*` del sistema jardín.

---

## Self-Review

**Spec coverage** (handoff → task):
- Pantalla "Mi jardín" (desde Gastos) → Fase B (B1–B5). ✓
- Widget de Home → Fase C. ✓
- Hito/Floración (rediseño Logros) → Fase D (D1–D3). ✓
- Cierre de semana → Fase E (E1–E2). ✓
- Driver "registrar gasto variable/fijo planta brote" → YA existe (trigger); consumido por `useGarden` (A2). ✓
- Estados de brote por antigüedad → A1 (`broteStageForDay`). ✓
- "Días salteados no rompen" → A1 (`missed` no afecta conteo) + F1 (notificaciones). ✓
- Luciérnagas/helecho/confeti/count/bloom → reuso `CardParticles`/`FernMark`/`ConfettiBurst`/`CountUpText`/`CoralBloom` (D1). ✓
- Tipografía sistema, sin Hanken → Global Constraints. ✓

**Placeholder scan:** la lógica pura va con código completo + tests (A1/A2). Los componentes UI referencian líneas exactas del HTML hifi + tokens — el JSX se completa leyendo esos valores en la task (convención declarada en Global Constraints). F1 requiere leer los crons antes de escribir la migración (paso explícito).

**Type consistency:** `BroteStage`/`GardenCell`/`WeekClose`/`GardenData` definidos en A1/A2 y consumidos consistentes en B/C/E. `FloracionView({item,onDismiss})` ≡ firma de `AchievementUnlockModal`. `floracionToneForTier` (A3) usado en D2.

**Riesgos / decisiones abiertas menores (resolver en ejecución):**
- Auto-disparo del cierre de semana (E2) — default conservador (banner manual) si el auto-trigger agrega complejidad.
- `markedDaysIso` 14→35 (A2) — solo si QA muestra huecos viejos incorrectos.
- F1 toca notificaciones vivas → aplicar a prod SOLO con confirmación del owner.
