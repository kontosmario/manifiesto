# P2 Performance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Cerrar los 6 items P2 del code review consolidado: optimizar list rendering (gastos-v2, expense-history, notifications), split del theme context para reducir tree-wide re-renders, y quitar `refetchOnWindowFocus` que dispara doble RPC al volver de background.

**Architecture:**
- `memberById` Map memoizado para `O(1)` lookups en renderItem hot paths.
- `removeClippedSubviews={true}` + cap del FadeIn delay en `index >= 8` para no montar worklets fuera de viewport.
- Gate de `exiting={FadeOut}` por `rowAnimationEnabled`.
- `useCallback` para `renderItem` + `Separator` hoisted como component referencial estable.
- Theme context split en `useThemeMode()` + `useThemeTokens()` aditivo (legacy `useAppTheme()` queda intacto, migración opportunista).
- `refetchOnWindowFocus: false` en snapshot queries (basta con `staleTime`).

**Tech Stack:** React Native, Reanimated 4, React Query (TanStack), Expo Router.

---

## Task 1: `memberById` Map en gastos-v2 renderItem

**Files:**
- Modify: `mobile/screens/home/gastos-v2-screen.tsx:524-648`

**Problema:** `familyMembers.find((m) => m.id === created_by)` en líneas 533 y 578 corre `O(n)` × cada row recycle. Con 6 miembros × 100 rows visibles en scroll = 600 ops/frame.

- [ ] **Step 1.1:** justo antes del `renderItem` (después del `useMemo` de `merged` en línea 522), añadir:

```typescript
  const memberById = useMemo(() => {
    const map = new Map<string, (typeof familyMembers)[number]>()
    for (const m of familyMembers) map.set(m.id, m)
    return map
  }, [familyMembers])
```

- [ ] **Step 1.2:** reemplazar las 2 occurrences:

```typescript
// Línea 533:
const who = memberById.get(income.created_by)
// Línea 578:
const who = memberById.get(item.created_by)
```

- [ ] **Step 1.3:** actualizar el deps array del `useCallback` (línea 638-647): cambiar `familyMembers` por `memberById` para que el callback no se invalide salvo cuando el mapa cambia.

- [ ] **Step 1.4:** commit:

```bash
git add mobile/screens/home/gastos-v2-screen.tsx
git commit -m "perf(gastos): O(1) memberById lookup in renderItem

familyMembers.find() ran on every recycled row during scroll —
6 members × ~100 rows in viewport = 600 ops/frame, costing
2-4ms of jank on iPhone XR-class. Pre-computed Map keeps the
hot path at a single hash lookup.

Closes P2 #14 of 2026-05-31 code review."
```

---

## Task 2: `expense-history-list` virtualization fix

**Files:**
- Modify: `mobile/components/home/expense-history-list.tsx`

**Problema:** `removeClippedSubviews={false}` + `FadeIn.delay()` por row mantiene cada row offscreen montado Y dispara worklets en recycle. ~40-80MB extra + 16ms/render hit.

- [ ] **Step 2.1:** cambiar `removeClippedSubviews={false}` por `removeClippedSubviews={true}` (línea 32).

- [ ] **Step 2.2:** cortar el `entering` cuando el index supera la cap (8 — el delay ya estaba capped pero el worklet seguía montando). Reemplazar el `renderItem` (líneas 35-55) por:

```typescript
      renderItem={({ item, index }) => {
        // The stagger only applies to the first 8 rows so a long
        // history doesn't paint slowly. Past index 8 we skip the
        // Animated.View wrapper entirely — Reanimated still
        // instantiates entering worklets on `undefined`, so omitting
        // the wrapper is what actually frees the cost.
        const ROW_STAGGER_CAP = 8
        const staggerDelay = Math.min(index, ROW_STAGGER_CAP) * motionStagger.listItem
        const row = (
          <ExpenseHistoryRow
            category={categoryById.get(item.category_id) ?? null}
            expense={item}
            hideCategory={Boolean(selectedCategoryId)}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        )
        if (index >= ROW_STAGGER_CAP) {
          return row
        }
        return (
          <Animated.View
            entering={FadeIn.delay(staggerDelay)
              .duration(motionDurations.enterTab)
              .reduceMotion(ReduceMotion.System)}
          >
            {row}
          </Animated.View>
        )
      }}
```

- [ ] **Step 2.3:** commit:

```bash
git add mobile/components/home/expense-history-list.tsx
git commit -m "perf(home): virtualize expense history + drop entering past cap

removeClippedSubviews was false (~40-80MB retained views on a 200-
row history) and FadeIn worklets fired on every recycle even after
the staggerDelay was capped. Now:
- removeClippedSubviews=true frees offscreen native views
- past index 8, render the row without Animated.View so Reanimated
  doesn't mount an entering worklet at all

Closes P2 #15 of 2026-05-31 code review."
```

---

## Task 3: Gate `exiting={FadeOut}` en gastos-v2

**Files:**
- Modify: `mobile/screens/home/gastos-v2-screen.tsx:549,609`

**Problema:** `exiting={FadeOut.duration(140)}` se dispara en CADA recycle de virtualization (no solo en delete), causando 8-14ms hitch al cruzar la ventana.

- [ ] **Step 3.1:** ambas occurrences (línea 549 para income row, línea 609 para expense row) gatear por `rowAnimationEnabled`:

```typescript
// Línea 549:
exiting={rowAnimationEnabled ? FadeOut.duration(140) : undefined}
// Línea 609:
exiting={rowAnimationEnabled ? FadeOut.duration(140) : undefined}
```

- [ ] **Step 3.2:** commit:

```bash
git add mobile/screens/home/gastos-v2-screen.tsx
git commit -m "perf(gastos): gate row exiting={FadeOut} by rowAnimationEnabled

exiting fired on every virtualization recycle (not just delete),
costing 8-14ms hitch when scrolling across the viewport window.
Gated by the existing rowAnimationEnabled flag so it still fires
on actual filter/delete transitions.

Closes P2 #16 of 2026-05-31 code review."
```

---

## Task 4: Memoize `notification-feed-list` renderItem + Separator

**Files:**
- Modify: `mobile/components/home/notification-feed-list.tsx`

**Problema:** `renderItem` inline en el JSX + `ItemSeparatorComponent={() => ...}` crean nueva identity por render del parent, rompiendo memo de FlatList rows.

- [ ] **Step 4.1:** leer el archivo completo y extraer:
  - `renderItem` a un `useCallback` (deps: `memberById`, theme, callbacks que usa).
  - `ItemSeparatorComponent` a una constante o `useMemo` que devuelva el component referencial estable.

- [ ] **Step 4.2:** commit:

```bash
git add mobile/components/home/notification-feed-list.tsx
git commit -m "perf(notifications): hoist renderItem + Separator to stable refs

Both were inline-arrow on every parent render — new function
identity per render breaks FlatList's row memo, so every state
change (refresh, theme toggle) re-rendered all visible rows.

Closes P2 #17 of 2026-05-31 code review."
```

---

## Task 5: Split theme context (aditivo, no migra hot paths automáticamente)

**Files:**
- Modify: `mobile/theme/theme-provider.tsx`

**Problema:** `useAppTheme()` se consume en ~80 sites incluso a nivel de row. Cualquier cambio de tema invalida tree completo.

**Decisión:** la migración FORZADA de 80 sites es muy invasiva para P2 (cabe en P3). Pero podemos SETUP la infraestructura aditiva sin tocar callers — exponer `useThemeMode()` y `useThemeTokens()` con contextos separados, dejar `useAppTheme()` consumiendo ambos (no cambia API). Cuando un row caliente quiera migrarse, sólo cambia el import. Ganancia inmediata: 0; ganancia futura: alta. Bajo riesgo.

- [ ] **Step 5.1:** reescribir `mobile/theme/theme-provider.tsx` para splitear el context:

```typescript
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { useColorScheme } from 'react-native'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'
import { buildTheme, type AppTheme, type ThemePreference } from '@/theme/palette'
import {
  resolveCategoryHue,
  resolveCategoryHueByName,
  type CategoryHueVariant,
} from '@/theme/category-hues'

const THEME_PREFERENCE_KEY = 'manifiesto:theme-preference'

interface ThemeModeContextValue {
  preference: ThemePreference
  setPreference: (value: ThemePreference) => void
  resolvedMode: 'light' | 'dark'
}

// Theme split: `ThemeMode` changes when the user toggles
// preference (rare). `ThemeTokens` is a frozen palette derived from
// the mode. Splitting lets hot-path subscribers (row components
// re-rendered hundreds of times) consume only the tokens — flipping
// preference invalidates the mode context, the tokens context
// recomputes once, but components subscribed to `useThemeTokens()`
// only re-render once (not on every parent state change that
// happens to bubble through `useAppTheme()`).
const ThemeModeContext = createContext<ThemeModeContextValue | null>(null)
const ThemeTokensContext = createContext<AppTheme | null>(null)

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useColorScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>('system')

  useEffect(() => {
    let isMounted = true
    void (async () => {
      const storedPreference = await getPersistentValue(THEME_PREFERENCE_KEY)
      if (!isMounted) return
      if (
        storedPreference === 'system' ||
        storedPreference === 'light' ||
        storedPreference === 'dark'
      ) {
        setPreferenceState(storedPreference)
      }
    })()
    return () => {
      isMounted = false
    }
  }, [])

  const resolvedMode: 'light' | 'dark' =
    preference === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : preference

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference)
    void setPersistentValue(THEME_PREFERENCE_KEY, nextPreference)
  }, [])

  const modeValue = useMemo<ThemeModeContextValue>(
    () => ({ preference, setPreference, resolvedMode }),
    [preference, setPreference, resolvedMode],
  )
  const tokens = useMemo<AppTheme>(() => buildTheme(resolvedMode), [resolvedMode])

  return (
    <ThemeModeContext.Provider value={modeValue}>
      <ThemeTokensContext.Provider value={tokens}>{children}</ThemeTokensContext.Provider>
    </ThemeModeContext.Provider>
  )
}

export function useThemeMode(): ThemeModeContextValue {
  const value = useContext(ThemeModeContext)
  if (!value) {
    throw new Error('useThemeMode must be used within AppThemeProvider.')
  }
  return value
}

export function useThemeTokens(): AppTheme {
  const value = useContext(ThemeTokensContext)
  if (!value) {
    throw new Error('useThemeTokens must be used within AppThemeProvider.')
  }
  return value
}

// Backwards-compat shim. New code (especially hot-path row
// components) should consume `useThemeTokens()` directly to avoid
// re-rendering when only the preference changes.
export function useAppTheme(): {
  preference: ThemePreference
  setPreference: (value: ThemePreference) => void
  theme: AppTheme
} {
  const mode = useThemeMode()
  const theme = useThemeTokens()
  return useMemo(
    () => ({ preference: mode.preference, setPreference: mode.setPreference, theme }),
    [mode.preference, mode.setPreference, theme],
  )
}

export function useCategoryHue(categoryKeyOrId: string): CategoryHueVariant {
  const theme = useThemeTokens()
  const hue = resolveCategoryHue(categoryKeyOrId)
  return theme.isDark ? hue.dark : hue.light
}

export function useCategoryHueByName(name: string): CategoryHueVariant {
  const theme = useThemeTokens()
  const hue = resolveCategoryHueByName(name)
  return theme.isDark ? hue.dark : hue.light
}
```

- [ ] **Step 5.2:** run `npm run validate` — debe pasar (typecheck especialmente).

- [ ] **Step 5.3:** commit:

```bash
git add mobile/theme/theme-provider.tsx
git commit -m "perf(theme): split mode + tokens contexts (additive)

ThemeProvider now exposes two contexts: mode (preference +
setter + resolved) and tokens (the AppTheme object). Hot-path row
components can migrate to useThemeTokens() to skip re-renders
caused by preference state changes that don't touch tokens.

useAppTheme() unchanged in shape — backwards-compat shim consumes
both. No callers were migrated in this commit; the migration is
opportunistic per-component as P3 / P4 polish.

Closes P2 #18 of 2026-05-31 code review (infrastructure)."
```

---

## Task 6: Quitar `refetchOnWindowFocus` en snapshot queries

**Files:**
- Modify: `mobile/features/home/use-home-snapshot.ts:434`
- Modify: `mobile/features/gastos/use-gastos-snapshot.ts:254`

**Problema:** `refetchOnWindowFocus: true` dispara fetch en cada app foreground aunque el `staleTime: 60s` esté vigente, causando doble RPC al resume (300-600ms blocking re-hydration).

- [ ] **Step 6.1:** en ambos archivos cambiar:

```typescript
refetchOnWindowFocus: true,
```

por:

```typescript
// On iOS foreground-resume both home_snapshot + gastos_snapshot
// were re-fetching back-to-back even with staleTime=60s, costing
// 300-600ms of blocking re-hydration. `staleTime` alone is enough:
// if the cache is fresh, skip; if stale, the next navigation
// triggers a refetch naturally.
refetchOnWindowFocus: false,
```

- [ ] **Step 6.2:** commit:

```bash
git add mobile/features/home/use-home-snapshot.ts mobile/features/gastos/use-gastos-snapshot.ts
git commit -m "perf(snapshots): drop refetchOnWindowFocus on home + gastos

iOS foreground-resume fired two back-to-back snapshot RPCs even
with staleTime=60s, costing 300-600ms of blocking re-hydration on
return-to-app. staleTime alone is sufficient: stale caches refetch
on the next navigation, fresh caches stay.

Closes P2 #19 of 2026-05-31 code review."
```

---

## P2 verification gate

- [ ] **Gate.1:** `npm run validate` exit 0
- [ ] **Gate.2:** `git log --oneline origin/main..HEAD` — total ~31 commits (25 P0+P1 + 6 P2)
- [ ] **Gate.3:** (opcional) si el dev tiene un device de iOS conectado, smoke test del scroll en gastos-v2 confirma 60fps sostenido.

---

## Self-review

**Spec coverage:** 6 items P2 → 6 tasks. Item P2 #18 (theme split) downgraded a infraestructura aditiva, callers no migran en este plan (decisión documentada).

**Placeholder scan:** ninguno crítico. Task 4 dice "leer el archivo completo y extraer" — eso ES la instrucción, código exacto requiere ver el render inline.

**Type consistency:** `ThemeModeContextValue` / `useThemeTokens()` signatures consistentes.

---

## Próximos planes

- `2026-05-31-p3-architecture.md`
- `2026-05-31-p4-polish.md`
