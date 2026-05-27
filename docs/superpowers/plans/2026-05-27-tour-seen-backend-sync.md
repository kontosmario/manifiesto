# Tour-Seen Backend Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover las 4 flags "tour visto" de SecureStore device-local a 4 columnas timestamptz en `profiles`, con RPCs para sync, migración one-shot por device, y logout que ya no toca el estado.

**Architecture:** Profile lee/escribe el estado vía React Query (mismo cache que el resto del perfil). `useToursSeen` deriva booleanos de las nuevas columnas; `useMarkTourSeen`/`useResetTourSeen` mutan vía RPCs SECURITY DEFINER. Migración one-shot lee SecureStore al primer launch post-deploy y hoistea al backend. Logout deja de borrar el estado de tours (backend persiste; React Query limpia cache en SIGNED_OUT).

**Tech Stack:** Supabase Postgres (migrations + RPCs), React Native / Expo, React Query v5, TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-05-27-tour-seen-backend-sync-design.md`

**Branch:** `feat/tour-seen-backend-sync` (ya creada).

---

## File Structure

### Archivos nuevos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260527000000_tour_seen_columns.sql` | 4 columnas timestamptz + backfill + 3 RPCs (`mark_tour_seen`, `reset_tour_seen`, `reset_all_tours_seen`) |
| `mobile/features/tours/use-tours-seen.ts` | `useToursSeen()` → `{ isSeen(key), isLoading }`. Deriva del profile cached. |
| `mobile/features/tours/use-mark-tour-seen.ts` | `useMarkTourSeen()` → mutation que llama RPC + optimistic update + fallback pending en SecureStore |
| `mobile/features/tours/use-reset-tour-seen.ts` | `useResetTourSeen()` → `{ resetOne, resetAll }` mutations + optimistic updates |
| `mobile/features/tours/tour-pending-store.ts` | `getPendingTours()`, `setTourPending(key)`, `clearTourPending(key)` para fallback offline |
| `mobile/features/tours/use-migrate-tours-to-backend.ts` | Hook one-shot que lee SecureStore + envía vía RPC + limpia. Idempotente con flag `tour-seen.migration-v2-done`. |
| `tests/unit/use-tours-seen.test.ts` | Tests del hook reader |
| `tests/unit/use-mark-tour-seen.test.ts` | Tests de la mutation marker (incluye fallback pending) |
| `tests/unit/use-reset-tour-seen.test.ts` | Tests de las mutations reset |
| `tests/unit/tour-pending-store.test.ts` | Tests del store de pending |
| `tests/unit/use-migrate-tours-to-backend.test.ts` | Tests de la migración one-shot |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `mobile/features/profile/use-profile.ts` | Agregar 4 cols opcionales al `interface Profile` + `select` |
| `mobile/features/tours/use-screen-tour.ts` | Reemplazar `getTourSeen` → `useToursSeen().isSeen` + `setTourSeen` → `markTourSeen` |
| `mobile/features/tours/persistence.ts` | Eliminar `getTourSeen`, `setTourSeen`, `resetTourSeen` + rama `tour-seen.*` en `resetAllTours`. Mantener `getToursEnabled`/`setToursEnabled`. |
| `mobile/features/tours/index.ts` | Eliminar re-exports de la API local (si los hay) |
| `mobile/screens/settings/settings-screen.tsx` | `handleRewatchTour` y `handleResetAllTours` ahora llaman mutations |
| `mobile/components/root/app-entry-gate.tsx` | Reemplazar `useBackfillExistingUser` por `useMigrateToursToBackend` |
| `mobile/features/auth/logout.ts` | Eliminar `resetAllTours()`. Borrar `tour-seen.migration-v2-done` y `tours-disabled`. |

### Archivos eliminados

| Archivo | Razón |
|---|---|
| `mobile/features/tours/use-backfill-existing-user.ts` | Reemplazado por `use-migrate-tours-to-backend.ts` |
| `mobile/features/tours/should-backfill-tours.ts` | Lógica ahora vive en la SQL migration |
| `mobile/features/tours/backfill-config.ts` | Solo se usaba en el hook eliminado |
| `tests/unit/should-backfill-tours.test.ts` | Cubre código eliminado |

---

## Task 1: SQL migration — columns + backfill + RPCs

**Files:**
- Create: `supabase/migrations/20260527000000_tour_seen_columns.sql`

- [ ] **Step 1.1: Write the migration**

Create `supabase/migrations/20260527000000_tour_seen_columns.sql`:

```sql
-- Tour-seen state movido de SecureStore device-local a profiles.
-- Spec: docs/superpowers/specs/2026-05-27-tour-seen-backend-sync-design.md
--
-- Mover el estado al backend resuelve dos inconsistencias:
--   1. logout borraba tour-seen.* y la siguiente sesión del mismo
--      usuario veía todos los tours de nuevo
--   2. el mismo usuario en otro device veía los tours de nuevo

alter table public.profiles
  add column if not exists home_tour_seen_at    timestamptz,
  add column if not exists gastos_tour_seen_at  timestamptz,
  add column if not exists fijos_tour_seen_at   timestamptz,
  add column if not exists control_tour_seen_at timestamptz;

-- Backfill: usuarios con onboarding completado antes del deploy de
-- tours (2026-05-26). Ya conocen la app; marcamos todos vistos para
-- no molestar con tutoriales retroactivos. Reemplaza la lógica que
-- antes vivía en `useBackfillExistingUser` (device-local).
update public.profiles
set home_tour_seen_at    = now(),
    gastos_tour_seen_at  = now(),
    fijos_tour_seen_at   = now(),
    control_tour_seen_at = now()
where onboarding_completed_at is not null
  and onboarding_completed_at < '2026-05-26T00:00:00Z';

-- mark_tour_seen: idempotente vía COALESCE para preservar el primer
-- visto (importante para analytics futuro).
create or replace function public.mark_tour_seen(tour_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  case tour_key
    when 'home' then
      update public.profiles
      set home_tour_seen_at = coalesce(home_tour_seen_at, now())
      where id = v_user_id;
    when 'gastos' then
      update public.profiles
      set gastos_tour_seen_at = coalesce(gastos_tour_seen_at, now())
      where id = v_user_id;
    when 'fijos' then
      update public.profiles
      set fijos_tour_seen_at = coalesce(fijos_tour_seen_at, now())
      where id = v_user_id;
    when 'control' then
      update public.profiles
      set control_tour_seen_at = coalesce(control_tour_seen_at, now())
      where id = v_user_id;
    else
      raise exception 'Unknown tour_key: %', tour_key;
  end case;
end $$;

-- reset_tour_seen: settea la columna a NULL para que el tour vuelva
-- a auto-firar la próxima vez que el user visite la pantalla.
create or replace function public.reset_tour_seen(tour_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  case tour_key
    when 'home' then
      update public.profiles set home_tour_seen_at = null where id = v_user_id;
    when 'gastos' then
      update public.profiles set gastos_tour_seen_at = null where id = v_user_id;
    when 'fijos' then
      update public.profiles set fijos_tour_seen_at = null where id = v_user_id;
    when 'control' then
      update public.profiles set control_tour_seen_at = null where id = v_user_id;
    else
      raise exception 'Unknown tour_key: %', tour_key;
  end case;
end $$;

-- reset_all_tours_seen: para Settings → "Volver a ver todos los tutoriales".
create or replace function public.reset_all_tours_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set home_tour_seen_at    = null,
      gastos_tour_seen_at  = null,
      fijos_tour_seen_at   = null,
      control_tour_seen_at = null
  where id = v_user_id;
end $$;

revoke all on function public.mark_tour_seen(text)      from public;
revoke all on function public.reset_tour_seen(text)     from public;
revoke all on function public.reset_all_tours_seen()    from public;

grant execute on function public.mark_tour_seen(text)      to authenticated;
grant execute on function public.reset_tour_seen(text)     to authenticated;
grant execute on function public.reset_all_tours_seen()    to authenticated;
```

- [ ] **Step 1.2: Apply locally + smoke check**

Run:
```bash
npx supabase db reset
```
Expected: `Finished supabase db reset on branch main.` without errors.

Then verify columns exist:
```bash
npx supabase db execute --query "select column_name from information_schema.columns where table_schema='public' and table_name='profiles' and column_name like '%tour_seen_at';"
```
Expected: 4 rows (`home_tour_seen_at`, `gastos_tour_seen_at`, `fijos_tour_seen_at`, `control_tour_seen_at`).

Verify RPCs exist:
```bash
npx supabase db execute --query "select proname from pg_proc where proname in ('mark_tour_seen','reset_tour_seen','reset_all_tours_seen');"
```
Expected: 3 rows.

If `supabase db execute` isn't installed or fails locally, document the verification deferred to staging and skip — typecheck + RPC call-sites in subsequent tasks will surface real misalignments.

- [ ] **Step 1.3: Commit**

```bash
git add supabase/migrations/20260527000000_tour_seen_columns.sql
git commit -m "feat(db): tour-seen columns + RPCs + backfill pre-deploy users"
```

---

## Task 2: Profile TS interface + select expansion

**Files:**
- Modify: `mobile/features/profile/use-profile.ts`

- [ ] **Step 2.1: Add 4 optional fields to Profile interface**

Open `mobile/features/profile/use-profile.ts`. Find the `interface Profile` block (lines 6-44). Insert AFTER the existing `family_closed_by_owner_at` field (line 43) and BEFORE the closing brace:

```ts
  /**
   * Per-tour "seen" timestamps. Source of truth for whether
   * `useScreenTour` auto-fires (NULL = not seen → auto-fire;
   * timestamp = seen → skip). Settled by the `mark_tour_seen` /
   * `reset_tour_seen` / `reset_all_tours_seen` RPCs.
   *
   * Optional in the type because the `home_snapshot` RPC seeds the
   * cache with the original 5 profile columns. The first explicit
   * `useMyProfile` fetch after mount populates these fields. While
   * unset, `useToursSeen` defaults to `isSeen=true` (conservative;
   * avoids re-firing during the brief load window).
   */
  home_tour_seen_at?: string | null
  gastos_tour_seen_at?: string | null
  fijos_tour_seen_at?: string | null
  control_tour_seen_at?: string | null
```

- [ ] **Step 2.2: Expand the select in useMyProfile**

Find the `.select(...)` call at line 63-65:

```ts
.select(
  'id, display_name, created_at, avatar_animal, onboarding_completed_at, previously_onboarded, family_closed_by_owner_at, timezone',
)
```

Replace with:

```ts
.select(
  'id, display_name, created_at, avatar_animal, onboarding_completed_at, previously_onboarded, family_closed_by_owner_at, timezone, home_tour_seen_at, gastos_tour_seen_at, fijos_tour_seen_at, control_tour_seen_at',
)
```

- [ ] **Step 2.3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2.4: Commit**

```bash
git add mobile/features/profile/use-profile.ts
git commit -m "feat(profile): expose tour_seen_at columns en interface + select"
```

---

## Task 3: useToursSeen hook + tests

**Files:**
- Create: `mobile/features/tours/use-tours-seen.ts`
- Test: `tests/unit/use-tours-seen.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `tests/unit/use-tours-seen.test.ts`:

```ts
import { renderHook } from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'

const profileQueryMock = vi.fn()
const sessionQueryMock = vi.fn()

vi.mock('@/features/auth/use-auth-session', () => ({
  useAuthSession: () => sessionQueryMock(),
}))
vi.mock('@/features/profile/use-profile', async () => ({
  useMyProfile: () => profileQueryMock(),
  profileQueryKey: (userId?: string) => ['profile', userId] as const,
}))

import { useToursSeen } from '@/features/tours/use-tours-seen'

function setup({
  userId = 'u1',
  profile,
  isLoading = false,
}: {
  userId?: string | null
  profile?: Partial<{
    home_tour_seen_at: string | null
    gastos_tour_seen_at: string | null
    fijos_tour_seen_at: string | null
    control_tour_seen_at: string | null
  }> | null
  isLoading?: boolean
}) {
  sessionQueryMock.mockReturnValue({ data: userId ? { user: { id: userId } } : null })
  profileQueryMock.mockReturnValue({ data: profile ?? null, isLoading })
}

describe('useToursSeen', () => {
  it('returns isLoading=true when profile is loading', () => {
    setup({ profile: null, isLoading: true })
    const { result } = renderHook(() => useToursSeen())
    expect(result.current.isLoading).toBe(true)
  })

  it('defaults isSeen to true when profile is missing (conservative)', () => {
    setup({ profile: null })
    const { result } = renderHook(() => useToursSeen())
    expect(result.current.isSeen('home')).toBe(true)
    expect(result.current.isSeen('gastos')).toBe(true)
    expect(result.current.isSeen('fijos')).toBe(true)
    expect(result.current.isSeen('control')).toBe(true)
  })

  it('returns isSeen=true for tours with a timestamp', () => {
    setup({
      profile: {
        home_tour_seen_at: '2026-05-27T00:00:00Z',
        gastos_tour_seen_at: null,
        fijos_tour_seen_at: null,
        control_tour_seen_at: null,
      },
    })
    const { result } = renderHook(() => useToursSeen())
    expect(result.current.isSeen('home')).toBe(true)
    expect(result.current.isSeen('gastos')).toBe(false)
    expect(result.current.isSeen('fijos')).toBe(false)
    expect(result.current.isSeen('control')).toBe(false)
  })

  it('returns isSeen=false for all tours when all timestamps are null', () => {
    setup({
      profile: {
        home_tour_seen_at: null,
        gastos_tour_seen_at: null,
        fijos_tour_seen_at: null,
        control_tour_seen_at: null,
      },
    })
    const { result } = renderHook(() => useToursSeen())
    expect(result.current.isSeen('home')).toBe(false)
    expect(result.current.isSeen('gastos')).toBe(false)
    expect(result.current.isSeen('fijos')).toBe(false)
    expect(result.current.isSeen('control')).toBe(false)
  })
})
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `npx vitest run tests/unit/use-tours-seen.test.ts`
Expected: FAIL — `Cannot find module '@/features/tours/use-tours-seen'`

- [ ] **Step 3.3: Implement the hook**

Create `mobile/features/tours/use-tours-seen.ts`:

```ts
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useMyProfile } from '@/features/profile/use-profile'
import type { TourKey } from './tour-keys'

/**
 * Read-side hook for tour-seen state. Source of truth: the 4
 * `_tour_seen_at` columns on `profiles`, fetched via `useMyProfile`
 * and cached by React Query.
 *
 * Conservative loading default: while profile is loading or missing,
 * `isSeen()` returns `true` for every tour. Better to under-show a
 * tour than to spam the user with one they've already seen. In
 * practice the profile fetch resolves before any tour screen mounts
 * (AppEntryGate blocks on it), so the loading window is ~0 for the
 * user.
 */
export function useToursSeen(): {
  isSeen: (key: TourKey) => boolean
  isLoading: boolean
} {
  const sessionQuery = useAuthSession()
  const userId = sessionQuery.data?.user.id
  const profileQuery = useMyProfile(userId)
  const profile = profileQuery.data

  return {
    isLoading: profileQuery.isLoading,
    isSeen: (key: TourKey): boolean => {
      if (!profile) return true
      switch (key) {
        case 'home':
          return profile.home_tour_seen_at != null
        case 'gastos':
          return profile.gastos_tour_seen_at != null
        case 'fijos':
          return profile.fijos_tour_seen_at != null
        case 'control':
          return profile.control_tour_seen_at != null
      }
    },
  }
}
```

- [ ] **Step 3.4: Run tests**

Run: `npx vitest run tests/unit/use-tours-seen.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 3.5: Commit**

```bash
git add mobile/features/tours/use-tours-seen.ts tests/unit/use-tours-seen.test.ts
git commit -m "feat(tours): useToursSeen lee del profile cached (backend source of truth)"
```

---

## Task 4: useMarkTourSeen mutation + tests

**Files:**
- Create: `mobile/features/tours/use-mark-tour-seen.ts`
- Test: `tests/unit/use-mark-tour-seen.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `tests/unit/use-mark-tour-seen.test.ts`:

```ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()
const sessionData = { user: { id: 'u1' } }
const pendingStore = new Map<string, string>()

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}))
vi.mock('@/features/auth/use-auth-session', () => ({
  useAuthSession: () => ({ data: sessionData }),
}))
vi.mock('@/features/tours/tour-pending-store', () => ({
  setTourPending: vi.fn(async (key: string) => {
    pendingStore.set(key, '1')
  }),
  clearTourPending: vi.fn(async (key: string) => {
    pendingStore.delete(key)
  }),
}))

import { useMarkTourSeen } from '@/features/tours/use-mark-tour-seen'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['profile', 'u1'], {
    id: 'u1',
    home_tour_seen_at: null,
    gastos_tour_seen_at: null,
    fijos_tour_seen_at: null,
    control_tour_seen_at: null,
  })
  ;(wrapper as unknown as { qc?: QueryClient }).qc = qc
  return React.createElement(QueryClientProvider, { client: qc, children })
}

beforeEach(() => {
  rpcMock.mockReset()
  pendingStore.clear()
})

afterEach(() => {
  ;(wrapper as unknown as { qc?: QueryClient }).qc?.clear()
})

describe('useMarkTourSeen', () => {
  it('calls mark_tour_seen RPC with the right key on success', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useMarkTourSeen(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('home')
    })
    expect(rpcMock).toHaveBeenCalledWith('mark_tour_seen', { tour_key: 'home' })
  })

  it('optimistically sets the profile cache column to a timestamp', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useMarkTourSeen(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('gastos')
    })
    const qc = (wrapper as unknown as { qc: QueryClient }).qc
    const profile = qc.getQueryData<{ gastos_tour_seen_at: string | null }>([
      'profile',
      'u1',
    ])
    expect(profile?.gastos_tour_seen_at).toBeTruthy()
  })

  it('writes pending fallback when RPC fails', async () => {
    rpcMock.mockResolvedValue({ error: new Error('network down') })
    const { result } = renderHook(() => useMarkTourSeen(), { wrapper })
    await act(async () => {
      try {
        await result.current.mutateAsync('control')
      } catch {
        /* expected */
      }
    })
    expect(pendingStore.get('control')).toBe('1')
  })

  it('clears any prior pending fallback on success', async () => {
    pendingStore.set('fijos', '1')
    rpcMock.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useMarkTourSeen(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('fijos')
    })
    expect(pendingStore.has('fijos')).toBe(false)
  })
})
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `npx vitest run tests/unit/use-mark-tour-seen.test.ts`
Expected: FAIL — module not found (or pending-store module not found; both surface as missing import errors). Both Task 4 and Task 6 contribute to making this pass, so this step may show partial failures until Task 6 lands. Document the failure and proceed to Step 4.3 (the helper module is implemented in Task 6 — the test file's mock satisfies the import).

- [ ] **Step 4.3: Implement the mutation**

Create `mobile/features/tours/use-mark-tour-seen.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  profileQueryKey,
  type Profile,
} from '@/features/profile/use-profile'
import { supabase } from '@/lib/supabase'
import { clearTourPending, setTourPending } from './tour-pending-store'
import type { TourKey } from './tour-keys'

const COLUMN_FOR: Record<TourKey, keyof Profile> = {
  home: 'home_tour_seen_at',
  gastos: 'gastos_tour_seen_at',
  fijos: 'fijos_tour_seen_at',
  control: 'control_tour_seen_at',
}

/**
 * Mark a tour as seen on the backend. Optimistic: writes the
 * timestamp into the profile cache immediately, then awaits the RPC.
 * On failure, rolls back the cache and writes a `tour-seen-pending.<key>`
 * flag in SecureStore that `useMigrateToursToBackend` retries on the
 * next launch.
 */
export function useMarkTourSeen() {
  const queryClient = useQueryClient()
  const sessionQuery = useAuthSession()
  const userId = sessionQuery.data?.user.id

  return useMutation({
    mutationFn: async (key: TourKey) => {
      const { error } = await supabase.rpc('mark_tour_seen', { tour_key: key })
      if (error) {
        await setTourPending(key)
        throw error
      }
      await clearTourPending(key)
    },
    onMutate: async (key: TourKey) => {
      if (!userId) return { previous: null }
      const queryKey = profileQueryKey(userId)
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Profile | null>(queryKey)
      if (previous) {
        const next: Profile = { ...previous, [COLUMN_FOR[key]]: new Date().toISOString() }
        queryClient.setQueryData(queryKey, next)
      }
      return { previous }
    },
    onError: (_error, _key, context) => {
      if (!userId || !context?.previous) return
      queryClient.setQueryData(profileQueryKey(userId), context.previous)
    },
  })
}
```

- [ ] **Step 4.4: Run tests after Task 6 lands**

After Task 6's `tour-pending-store.ts` exists, run: `npx vitest run tests/unit/use-mark-tour-seen.test.ts`
Expected: PASS, 4 tests.

For now, proceed to the commit step. The test will fail in CI until Task 6 is committed. This is intentional bundling for atomic feature work.

- [ ] **Step 4.5: Commit**

```bash
git add mobile/features/tours/use-mark-tour-seen.ts tests/unit/use-mark-tour-seen.test.ts
git commit -m "feat(tours): useMarkTourSeen mutation con optimistic update + pending fallback"
```

---

## Task 5: useResetTourSeen mutations + tests

**Files:**
- Create: `mobile/features/tours/use-reset-tour-seen.ts`
- Test: `tests/unit/use-reset-tour-seen.test.ts`

- [ ] **Step 5.1: Write the failing test**

Create `tests/unit/use-reset-tour-seen.test.ts`:

```ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()
const sessionData = { user: { id: 'u1' } }

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}))
vi.mock('@/features/auth/use-auth-session', () => ({
  useAuthSession: () => ({ data: sessionData }),
}))

import { useResetTourSeen } from '@/features/tours/use-reset-tour-seen'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['profile', 'u1'], {
    id: 'u1',
    home_tour_seen_at: '2026-05-27T00:00:00Z',
    gastos_tour_seen_at: '2026-05-27T00:00:00Z',
    fijos_tour_seen_at: '2026-05-27T00:00:00Z',
    control_tour_seen_at: '2026-05-27T00:00:00Z',
  })
  ;(wrapper as unknown as { qc?: QueryClient }).qc = qc
  return React.createElement(QueryClientProvider, { client: qc, children })
}

beforeEach(() => {
  rpcMock.mockReset()
})

describe('useResetTourSeen', () => {
  it('resetOne calls reset_tour_seen with the key', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useResetTourSeen(), { wrapper })
    await act(async () => {
      await result.current.resetOne('home')
    })
    expect(rpcMock).toHaveBeenCalledWith('reset_tour_seen', { tour_key: 'home' })
  })

  it('resetOne optimistically nulls that column in cache', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useResetTourSeen(), { wrapper })
    await act(async () => {
      await result.current.resetOne('gastos')
    })
    const qc = (wrapper as unknown as { qc: QueryClient }).qc
    const profile = qc.getQueryData<{ gastos_tour_seen_at: string | null }>([
      'profile',
      'u1',
    ])
    expect(profile?.gastos_tour_seen_at).toBeNull()
  })

  it('resetAll calls reset_all_tours_seen and nulls every column', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useResetTourSeen(), { wrapper })
    await act(async () => {
      await result.current.resetAll()
    })
    expect(rpcMock).toHaveBeenCalledWith('reset_all_tours_seen')
    const qc = (wrapper as unknown as { qc: QueryClient }).qc
    const profile = qc.getQueryData<{
      home_tour_seen_at: string | null
      gastos_tour_seen_at: string | null
      fijos_tour_seen_at: string | null
      control_tour_seen_at: string | null
    }>(['profile', 'u1'])
    expect(profile?.home_tour_seen_at).toBeNull()
    expect(profile?.gastos_tour_seen_at).toBeNull()
    expect(profile?.fijos_tour_seen_at).toBeNull()
    expect(profile?.control_tour_seen_at).toBeNull()
  })
})
```

- [ ] **Step 5.2: Run test to verify it fails**

Run: `npx vitest run tests/unit/use-reset-tour-seen.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement the mutations**

Create `mobile/features/tours/use-reset-tour-seen.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  profileQueryKey,
  type Profile,
} from '@/features/profile/use-profile'
import { supabase } from '@/lib/supabase'
import { ALL_TOUR_KEYS, type TourKey } from './tour-keys'

const COLUMN_FOR: Record<TourKey, keyof Profile> = {
  home: 'home_tour_seen_at',
  gastos: 'gastos_tour_seen_at',
  fijos: 'fijos_tour_seen_at',
  control: 'control_tour_seen_at',
}

/**
 * Mutations for Settings → "Ver tutorial X" (resetOne) and
 * "Volver a ver todos" (resetAll). Optimistic: nulls the column(s)
 * in cache, then awaits the RPC. On failure, restores the prior
 * cache value(s).
 */
export function useResetTourSeen() {
  const queryClient = useQueryClient()
  const sessionQuery = useAuthSession()
  const userId = sessionQuery.data?.user.id

  const resetOneMutation = useMutation({
    mutationFn: async (key: TourKey) => {
      const { error } = await supabase.rpc('reset_tour_seen', { tour_key: key })
      if (error) throw error
    },
    onMutate: async (key: TourKey) => {
      if (!userId) return { previous: null }
      const queryKey = profileQueryKey(userId)
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Profile | null>(queryKey)
      if (previous) {
        queryClient.setQueryData(queryKey, {
          ...previous,
          [COLUMN_FOR[key]]: null,
        } satisfies Profile)
      }
      return { previous }
    },
    onError: (_error, _key, context) => {
      if (!userId || !context?.previous) return
      queryClient.setQueryData(profileQueryKey(userId), context.previous)
    },
  })

  const resetAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('reset_all_tours_seen')
      if (error) throw error
    },
    onMutate: async () => {
      if (!userId) return { previous: null }
      const queryKey = profileQueryKey(userId)
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Profile | null>(queryKey)
      if (previous) {
        const nulled = ALL_TOUR_KEYS.reduce(
          (acc, key) => ({ ...acc, [COLUMN_FOR[key]]: null }),
          previous,
        )
        queryClient.setQueryData(queryKey, nulled)
      }
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (!userId || !context?.previous) return
      queryClient.setQueryData(profileQueryKey(userId), context.previous)
    },
  })

  return {
    resetOne: (key: TourKey) => resetOneMutation.mutateAsync(key),
    resetAll: () => resetAllMutation.mutateAsync(),
    isResettingOne: resetOneMutation.isPending,
    isResettingAll: resetAllMutation.isPending,
  }
}
```

- [ ] **Step 5.4: Run tests**

Run: `npx vitest run tests/unit/use-reset-tour-seen.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5.5: Commit**

```bash
git add mobile/features/tours/use-reset-tour-seen.ts tests/unit/use-reset-tour-seen.test.ts
git commit -m "feat(tours): useResetTourSeen (resetOne + resetAll) con optimistic update"
```

---

## Task 6: tour-pending-store helper

**Files:**
- Create: `mobile/features/tours/tour-pending-store.ts`
- Test: `tests/unit/tour-pending-store.test.ts`

- [ ] **Step 6.1: Write the failing test**

Create `tests/unit/tour-pending-store.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()

vi.mock('@/lib/persistent-kv', () => ({
  getPersistentValue: vi.fn(async (key: string) => store.get(key) ?? null),
  setPersistentValue: vi.fn(async (key: string, value: string) => {
    store.set(key, value)
  }),
  deletePersistentValue: vi.fn(async (key: string) => {
    store.delete(key)
  }),
}))

import {
  clearTourPending,
  getPendingTours,
  setTourPending,
} from '@/features/tours/tour-pending-store'

beforeEach(() => {
  store.clear()
})

describe('tour-pending-store', () => {
  it('getPendingTours returns empty when nothing is pending', async () => {
    expect(await getPendingTours()).toEqual([])
  })

  it('setTourPending then getPendingTours returns that key', async () => {
    await setTourPending('home')
    expect(await getPendingTours()).toEqual(['home'])
  })

  it('multiple pending tours are returned together in canonical order', async () => {
    await setTourPending('gastos')
    await setTourPending('home')
    await setTourPending('control')
    expect(await getPendingTours()).toEqual(['home', 'gastos', 'control'])
  })

  it('clearTourPending removes the flag', async () => {
    await setTourPending('fijos')
    await clearTourPending('fijos')
    expect(await getPendingTours()).toEqual([])
  })
})
```

- [ ] **Step 6.2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tour-pending-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6.3: Implement the helper**

Create `mobile/features/tours/tour-pending-store.ts`:

```ts
import {
  deletePersistentValue,
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'
import { ALL_TOUR_KEYS, type TourKey } from './tour-keys'

/**
 * Local fallback for tour-seen marks that couldn't reach the backend
 * (network failure during `useMarkTourSeen`). Re-tried by
 * `useMigrateToursToBackend` on every launch until the RPC succeeds.
 *
 * Keys: `tour-seen-pending.<tourKey>` in SecureStore. Value '1' when
 * pending. Mirrors the namespacing of the old `tour-seen.*` flags
 * that this module replaces as the only client-side tour storage.
 */
const PENDING_PREFIX = 'tour-seen-pending.'

function pendingKey(tour: TourKey): string {
  return `${PENDING_PREFIX}${tour}`
}

export async function setTourPending(tour: TourKey): Promise<void> {
  await setPersistentValue(pendingKey(tour), '1')
}

export async function clearTourPending(tour: TourKey): Promise<void> {
  await deletePersistentValue(pendingKey(tour))
}

export async function getPendingTours(): Promise<TourKey[]> {
  const result: TourKey[] = []
  for (const key of ALL_TOUR_KEYS) {
    const raw = await getPersistentValue(pendingKey(key))
    if (raw === '1') result.push(key)
  }
  return result
}
```

- [ ] **Step 6.4: Run tests**

Run: `npx vitest run tests/unit/tour-pending-store.test.ts tests/unit/use-mark-tour-seen.test.ts`
Expected: 4/4 pending-store tests PASS + 4/4 use-mark-tour-seen tests PASS.

- [ ] **Step 6.5: Commit**

```bash
git add mobile/features/tours/tour-pending-store.ts tests/unit/tour-pending-store.test.ts
git commit -m "feat(tours): tour-pending-store helper para fallback offline"
```

---

## Task 7: useMigrateToursToBackend hook + tests

**Files:**
- Create: `mobile/features/tours/use-migrate-tours-to-backend.ts`
- Test: `tests/unit/use-migrate-tours-to-backend.test.ts`

- [ ] **Step 7.1: Write the failing test**

Create `tests/unit/use-migrate-tours-to-backend.test.ts`:

```ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const kvStore = new Map<string, string>()
const rpcMock = vi.fn()

vi.mock('@/lib/persistent-kv', () => ({
  getPersistentValue: vi.fn(async (key: string) => kvStore.get(key) ?? null),
  setPersistentValue: vi.fn(async (key: string, value: string) => {
    kvStore.set(key, value)
  }),
  deletePersistentValue: vi.fn(async (key: string) => {
    kvStore.delete(key)
  }),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}))

import { useMigrateToursToBackend } from '@/features/tours/use-migrate-tours-to-backend'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc, children })
}

beforeEach(() => {
  kvStore.clear()
  rpcMock.mockReset()
  rpcMock.mockResolvedValue({ error: null })
})

describe('useMigrateToursToBackend', () => {
  it('no-ops when migration-v2-done flag is set', async () => {
    kvStore.set('tour-seen.migration-v2-done', '1')
    kvStore.set('tour-seen.home', '1')
    renderHook(() => useMigrateToursToBackend('u1'), { wrapper })
    await new Promise((r) => setTimeout(r, 10))
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('no-ops when userId is missing', async () => {
    kvStore.set('tour-seen.home', '1')
    renderHook(() => useMigrateToursToBackend(undefined), { wrapper })
    await new Promise((r) => setTimeout(r, 10))
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('hoists local tour-seen.* flags to backend then sets migration-done', async () => {
    kvStore.set('tour-seen.home', '1')
    kvStore.set('tour-seen.gastos', '1')
    renderHook(() => useMigrateToursToBackend('u1'), { wrapper })
    await waitFor(() => {
      expect(kvStore.get('tour-seen.migration-v2-done')).toBe('1')
    })
    expect(rpcMock).toHaveBeenCalledWith('mark_tour_seen', { tour_key: 'home' })
    expect(rpcMock).toHaveBeenCalledWith('mark_tour_seen', { tour_key: 'gastos' })
    expect(rpcMock).not.toHaveBeenCalledWith('mark_tour_seen', { tour_key: 'fijos' })
  })

  it('also retries pending fallback flags', async () => {
    kvStore.set('tour-seen-pending.control', '1')
    renderHook(() => useMigrateToursToBackend('u1'), { wrapper })
    await waitFor(() => {
      expect(kvStore.get('tour-seen.migration-v2-done')).toBe('1')
    })
    expect(rpcMock).toHaveBeenCalledWith('mark_tour_seen', { tour_key: 'control' })
    expect(kvStore.has('tour-seen-pending.control')).toBe(false)
  })

  it('does NOT set migration-done if any hoist RPC fails (retry next launch)', async () => {
    kvStore.set('tour-seen.home', '1')
    rpcMock.mockResolvedValue({ error: new Error('network') })
    renderHook(() => useMigrateToursToBackend('u1'), { wrapper })
    await new Promise((r) => setTimeout(r, 10))
    expect(kvStore.has('tour-seen.migration-v2-done')).toBe(false)
    expect(kvStore.has('tour-seen.home')).toBe(true) // not cleaned up either
  })

  it('cleans up the legacy local tour-seen.* keys after successful hoist', async () => {
    kvStore.set('tour-seen.home', '1')
    kvStore.set('tour-seen.fijos', '1')
    renderHook(() => useMigrateToursToBackend('u1'), { wrapper })
    await waitFor(() => {
      expect(kvStore.get('tour-seen.migration-v2-done')).toBe('1')
    })
    expect(kvStore.has('tour-seen.home')).toBe(false)
    expect(kvStore.has('tour-seen.fijos')).toBe(false)
  })
})
```

- [ ] **Step 7.2: Run test to verify it fails**

Run: `npx vitest run tests/unit/use-migrate-tours-to-backend.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement the hook**

Create `mobile/features/tours/use-migrate-tours-to-backend.ts`:

```ts
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { profileQueryKey } from '@/features/profile/use-profile'
import {
  deletePersistentValue,
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'
import { supabase } from '@/lib/supabase'
import { getPendingTours } from './tour-pending-store'
import { ALL_TOUR_KEYS, type TourKey } from './tour-keys'

const MIGRATION_DONE_KEY = 'tour-seen.migration-v2-done'
const LEGACY_PREFIX = 'tour-seen.'

function legacyKey(tour: TourKey): string {
  return `${LEGACY_PREFIX}${tour}`
}

/**
 * One-shot migration: lifts any local `tour-seen.<key>` flags
 * (from before backend sync existed) to the backend via
 * `mark_tour_seen`, plus retries any `tour-seen-pending.*` flags
 * left by failed mutations. Cleans up local flags on success and
 * sets `tour-seen.migration-v2-done` so it doesn't re-run.
 *
 * Idempotent: every step is safe to re-run if any RPC fails (the
 * migration-done flag is set ONLY after all hoists succeed).
 *
 * Mounted in `AppEntryGate` so it runs once per session as the
 * profile becomes available.
 */
export function useMigrateToursToBackend(userId: string | undefined): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    void (async () => {
      const done = await getPersistentValue(MIGRATION_DONE_KEY)
      if (done === '1') return

      // 1. Gather local seen flags
      const localSeen: TourKey[] = []
      for (const key of ALL_TOUR_KEYS) {
        const raw = await getPersistentValue(legacyKey(key))
        if (raw === '1') localSeen.push(key)
      }

      // 2. Gather pending fallback flags
      const pending = await getPendingTours()

      // Union (avoid duplicates)
      const toHoist = Array.from(new Set<TourKey>([...localSeen, ...pending]))

      // 3. Hoist each to backend
      for (const key of toHoist) {
        if (cancelled) return
        const { error } = await supabase.rpc('mark_tour_seen', { tour_key: key })
        if (error) {
          // Leave everything as-is for retry next launch
          return
        }
      }

      // 4. Cleanup local legacy + pending flags
      for (const key of localSeen) {
        await deletePersistentValue(legacyKey(key))
      }
      for (const key of pending) {
        await deletePersistentValue(`tour-seen-pending.${key}`)
      }

      // 5. Mark migration as done
      await setPersistentValue(MIGRATION_DONE_KEY, '1')

      // 6. Invalidate profile cache so the new state surfaces
      if (toHoist.length > 0) {
        await queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [queryClient, userId])
}
```

- [ ] **Step 7.4: Run tests**

Run: `npx vitest run tests/unit/use-migrate-tours-to-backend.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7.5: Commit**

```bash
git add mobile/features/tours/use-migrate-tours-to-backend.ts tests/unit/use-migrate-tours-to-backend.test.ts
git commit -m "feat(tours): useMigrateToursToBackend one-shot (legacy + pending → backend)"
```

---

## Task 8: Refactor use-screen-tour + strip old persistence API

**Files:**
- Modify: `mobile/features/tours/use-screen-tour.ts`
- Modify: `mobile/features/tours/persistence.ts`

- [ ] **Step 8.1: Update use-screen-tour imports**

Open `mobile/features/tours/use-screen-tour.ts`. Replace the import line (line 5):

```ts
import { getToursEnabled, getTourSeen, setTourSeen } from './persistence'
```

with:

```ts
import { getToursEnabled } from './persistence'
import { useMarkTourSeen } from './use-mark-tour-seen'
import { useToursSeen } from './use-tours-seen'
```

- [ ] **Step 8.2: Wire the hooks in useScreenTour**

Inside `useScreenTour(...)`, near the other hook calls at the top of the function body (after `useTour()`, `useIsFocused()`, `useAuthTransitionSplash()`), add:

```ts
const toursSeen = useToursSeen()
const markSeenMutation = useMarkTourSeen()
```

- [ ] **Step 8.3: Replace setTourSeen call**

In the stop-detect effect (around line 115-124), replace:

```ts
} else if (wasActiveRef.current && ctx.activeTour === null) {
  // Just stopped from being our tour.
  wasActiveRef.current = false
  void setTourSeen(tour)
}
```

with:

```ts
} else if (wasActiveRef.current && ctx.activeTour === null) {
  // Just stopped from being our tour. Mark on the backend (optimistic
  // update keeps `useToursSeen` consistent immediately).
  wasActiveRef.current = false
  markSeenMutation.mutate(tour)
}
```

- [ ] **Step 8.4: Replace getTourSeen call**

In the auto-start effect (around line 147-153), replace:

```ts
void (async () => {
  const enabled = await getToursEnabled()
  if (cancelled || !enabled) return
  if (!forceStart) {
    const seen = await getTourSeen(tour)
    if (cancelled || seen) return
  }
```

with:

```ts
void (async () => {
  const enabled = await getToursEnabled()
  if (cancelled || !enabled) return
  if (!forceStart) {
    // Wait for the profile load to resolve before deciding. While
    // loading, `isSeen` returns true (conservative), so the early-
    // return below already covers that case.
    if (toursSeen.isLoading) return
    if (toursSeen.isSeen(tour)) return
  }
```

- [ ] **Step 8.5: Add toursSeen to effect deps**

Find the `useEffect` deps array at the end of the auto-start effect (it's after the cleanup return; look for the array that already contains `enabled`, `forceStart`, `isFocused`, `splashHidden`, `startDelayMs`, `tour`). Add `toursSeen.isLoading` and the result of `toursSeen.isSeen(tour)` is NOT directly addable — instead capture the seen value at the top of the effect closure and add it. Final deps:

```ts
}, [enabled, forceStart, isFocused, splashHidden, startDelayMs, tour, toursSeen])
```

Add `toursSeen` (the whole object) to deps. Its identity changes when the profile cache updates, which is exactly what we want to re-trigger the effect.

(If your linter flags `toursSeen` as missing a stable reference, the implementation in Task 3 returns a fresh object each render — that's intentional here so the deps array reflects real changes.)

- [ ] **Step 8.6: Strip old API from persistence.ts**

Open `mobile/features/tours/persistence.ts`. Delete `getTourSeen`, `setTourSeen`, `resetTourSeen` (lines 35-46 approx).

Also update `resetAllTours` (line 48) — it currently iterates and deletes `tour-seen.{key}` AND `tours-disabled`. Since the `tour-seen.*` keys are now legacy (only present until `useMigrateToursToBackend` cleans them), we want this fn to ONLY clear `tours-disabled` going forward. Replace the function with:

```ts
/**
 * Reset device-local tour preferences. Currently only clears the
 * global `tours-disabled` toggle. The per-tour "seen" flags moved
 * to the backend in 2026-05-27 — those are reset via
 * `useResetTourSeen().resetAll()` (Settings → "Volver a ver todos").
 *
 * Kept as an export because `logoutSession` calls it to wipe the
 * device-local global toggle when switching users on the same device.
 */
export async function resetAllTours(): Promise<void> {
  await deletePersistentValue(DISABLED_KEY)
}
```

Keep `getToursEnabled`, `setToursEnabled`, the `DISABLED_KEY` constant, the file-top doc comment, and the imports.

- [ ] **Step 8.7: Typecheck**

Run: `npm run typecheck`
Expected: errors at the call sites in `settings-screen.tsx` and elsewhere that still import the deleted symbols. These are fixed in Task 9 and Task 10. Continue.

- [ ] **Step 8.8: Commit**

```bash
git add mobile/features/tours/use-screen-tour.ts mobile/features/tours/persistence.ts
git commit -m "refactor(tours): use-screen-tour vía hooks; strip API local tour-seen.*"
```

---

## Task 9: Wire Settings handlers to new mutations

**Files:**
- Modify: `mobile/screens/settings/settings-screen.tsx`

- [ ] **Step 9.1: Update imports**

Open `mobile/screens/settings/settings-screen.tsx`. Find the import at line 59:

```ts
import { ALL_TOUR_KEYS, resetAllTours, resetTourSeen, TOUR_KEYS } from '@/features/tours'
```

Replace with:

```ts
import { ALL_TOUR_KEYS, TOUR_KEYS } from '@/features/tours'
import { useResetTourSeen } from '@/features/tours/use-reset-tour-seen'
```

(Note: `ALL_TOUR_KEYS` may not be used after the refactor — check at the end; remove from import if unused.)

- [ ] **Step 9.2: Use the hook inside the component**

Near the top of the component body (alongside other hook calls), add:

```ts
const tourResets = useResetTourSeen()
```

- [ ] **Step 9.3: Update handleRewatchTour**

Find the function around line 464-467:

```ts
const handleRewatchTour = useCallback(
  (tourKey: TourKey) => async () => {
    await resetTourSeen(tourKey)
    // navigation logic...
  },
  [router],
)
```

(The exact shape may differ slightly. The key change: replace `await resetTourSeen(tourKey)` with `await tourResets.resetOne(tourKey)`. Preserve the navigation/router logic that follows.)

Update the callback to use the mutation. Example final form:

```ts
const handleRewatchTour = useCallback(
  async (tourKey: TourKey) => {
    await tourResets.resetOne(tourKey)
    // ...preserve existing navigation logic...
  },
  [router, tourResets],
)
```

- [ ] **Step 9.4: Update handleResetAllTours**

Find the function around line 480-483:

```ts
const handleResetAllTours = useCallback(async () => {
  await resetAllTours()
  // ...
}, [router])
```

Replace `await resetAllTours()` with `await tourResets.resetAll()`. The `resetAllTours` call (from persistence.ts, which now only clears `tours-disabled`) is still useful here — KEEP it as a SECOND line so the device-local toggle also resets:

```ts
const handleResetAllTours = useCallback(async () => {
  await tourResets.resetAll()
  await resetAllTours()
  // ...preserve existing logic...
}, [router, tourResets])
```

If `resetAllTours` from `@/features/tours/persistence` is not currently imported in this file but used via the deleted `resetAllTours` from the index, add the import:

```ts
import { resetAllTours } from '@/features/tours/persistence'
```

- [ ] **Step 9.5: Strip any dead imports**

If after the refactor `ALL_TOUR_KEYS` is no longer used in this file, remove it from the import block.

- [ ] **Step 9.6: Typecheck**

Run: `npm run typecheck`
Expected: no errors related to settings-screen. Errors remaining only in `app-entry-gate.tsx` (Task 10 fix).

- [ ] **Step 9.7: Commit**

```bash
git add mobile/screens/settings/settings-screen.tsx
git commit -m "feat(settings): Ayuda handlers usan useResetTourSeen (backend)"
```

---

## Task 10: Replace useBackfillExistingUser in AppEntryGate + delete obsolete files

**Files:**
- Modify: `mobile/components/root/app-entry-gate.tsx`
- Delete: `mobile/features/tours/use-backfill-existing-user.ts`
- Delete: `mobile/features/tours/should-backfill-tours.ts`
- Delete: `mobile/features/tours/backfill-config.ts`
- Delete: `tests/unit/should-backfill-tours.test.ts`

- [ ] **Step 10.1: Update AppEntryGate import**

Open `mobile/components/root/app-entry-gate.tsx`. Find the import (line 11):

```ts
import { useBackfillExistingUser } from '@/features/tours/use-backfill-existing-user'
```

Replace with:

```ts
import { useMigrateToursToBackend } from '@/features/tours/use-migrate-tours-to-backend'
```

- [ ] **Step 10.2: Update the hook call**

Find the call (line 24):

```ts
useBackfillExistingUser(profileQuery.data?.onboarding_completed_at)
```

Replace with:

```ts
// Migrate any legacy device-local `tour-seen.*` flags (pre-2026-05-27)
// and retry any pending fallbacks to the backend. One-shot per
// install; flag-gated so subsequent launches are no-ops.
useMigrateToursToBackend(userId)
```

(The hook only needs `userId`, not `onboarding_completed_at`; the backfill for pre-deploy users now lives in the SQL migration.)

- [ ] **Step 10.3: Delete obsolete files**

```bash
git rm mobile/features/tours/use-backfill-existing-user.ts
git rm mobile/features/tours/should-backfill-tours.ts
git rm mobile/features/tours/backfill-config.ts
git rm tests/unit/should-backfill-tours.test.ts
```

- [ ] **Step 10.4: Check index re-exports**

Check `mobile/features/tours/index.ts` (if it exists) for re-exports of the deleted symbols. Read the file:

```bash
cat mobile/features/tours/index.ts
```

Remove any line that re-exports `useBackfillExistingUser`, `shouldBackfillToursAsSeen`, `TOURS_FEATURE_DEPLOYED_AT`, `getTourSeen`, `setTourSeen`, `resetTourSeen` (the last 3 deleted in Task 8). Keep re-exports for `TOUR_KEYS`, `ALL_TOUR_KEYS`, `TourKey`, `TOUR_LABELS`, `getToursEnabled`, `setToursEnabled`, `resetAllTours`.

- [ ] **Step 10.5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10.6: Run full test suite**

Run: `npx vitest run`
Expected: all NEW tests pass; the 3 pre-existing infra failures persist (`copy-glossary`, `skeleton-layouts`, `use-unbounded-loop-animation`). No NEW failures.

- [ ] **Step 10.7: Commit**

```bash
git add mobile/components/root/app-entry-gate.tsx mobile/features/tours/index.ts
git commit -m "feat(auth-gate): AppEntryGate usa useMigrateToursToBackend; eliminar backfill local"
```

---

## Task 11: Simplify logout — stop wiping backend-backed tour state

**Files:**
- Modify: `mobile/features/auth/logout.ts`

- [ ] **Step 11.1: Update the function body**

Open `mobile/features/auth/logout.ts`. The current implementation imports `resetAllTours` from tours/persistence (which now only clears `tours-disabled`) and calls it + clears `tours-backfill-done`. We change to:
- Remove the `resetAllTours()` call (no longer needed: backend persists user state; cache cleared in SIGNED_OUT)
- Wait — `resetAllTours()` now clears the device-local `tours-disabled` toggle, which DOES want to clear on logout (so user B doesn't inherit user A's "tours off" preference)
- Keep `resetAllTours()` for that purpose
- Add `deletePersistentValue('tour-seen.migration-v2-done')` so the migration re-evaluates if user B's device has different SecureStore residuals
- Remove `deletePersistentValue('tours-backfill-done')` (the old flag is no longer used; can leave the delete for cleanup-safety but it's dead code)

Replace the tours-related cleanup block (currently 2 lines: `await resetAllTours()` and `await deletePersistentValue('tours-backfill-done')`) with:

```ts
  // Tours device-local cleanup:
  //   • `resetAllTours()` clears only `tours-disabled` (the per-user
  //     "seen" flags moved to backend on 2026-05-27; backend persists
  //     across sessions/devices, so we don't touch them on logout)
  //   • `tour-seen.migration-v2-done` is cleared so the one-shot
  //     migration re-evaluates against the next user's device state
  //     (e.g. iCloud restore of SecureStore left flags from another
  //     install)
  //   • `tours-backfill-done` was the pre-2026-05-27 device-local
  //     backfill flag; we delete it defensively in case of leftover
  //     residuals from a stale install
  await resetAllTours()
  await deletePersistentValue('tour-seen.migration-v2-done')
  await deletePersistentValue('tours-backfill-done')
```

(Most of this is the comment; the actual code changes are just adding the `migration-v2-done` delete line.)

- [ ] **Step 11.2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 11.3: Commit**

```bash
git add mobile/features/auth/logout.ts
git commit -m "feat(auth): logout no toca backend-backed tour state; limpia migration flag"
```

---

## Task 12: Docs update + final validation

**Files:**
- Modify: `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/06-settings-engagement.md` (sección de tours)
- Modify: `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/00-INDICE.md` (novedad post-foto)

- [ ] **Step 12.1: Update 00-INDICE.md**

Open `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/00-INDICE.md`. Find the existing "Novedad post-foto" block (added 2026-05-27 for biometric-setup). Add ANOTHER novedad after it:

```markdown
> 🆕 **Novedad post-foto (2026-05-27, parte 2):** **Tour-seen backend sync** — el estado "tour visto" se movió de SecureStore device-local a 4 columnas timestamptz en `profiles` (`home_tour_seen_at`, etc) + 3 RPCs (`mark_tour_seen`, `reset_tour_seen`, `reset_all_tours_seen`). Logout deja de borrar el estado (backend persiste); migración one-shot por device hoistea flags legacy al backend. Resuelve el bug "después de logout veo el tour de nuevo". Detalle en [06 § "Tours"](06-settings-engagement.md).
```

- [ ] **Step 12.2: Update 06-settings-engagement.md (tours section)**

Find the section about tours in `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/06-settings-engagement.md`:

```bash
grep -n "Tours\|tour-seen\|TourKey\|persistence" /Users/mario/apps/manifiesto/docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/06-settings-engagement.md | head -20
```

Locate the existing tours subsection and append (after the existing description, before the next subsection) a paragraph reflecting the new architecture:

```markdown
**🆕 2026-05-27 — Backend sync:** El estado "tour visto" vive ahora en `profiles.{home,gastos,fijos,control}_tour_seen_at` (timestamptz). La app lee vía `useToursSeen` (deriva del profile cached por React Query) y muta vía `useMarkTourSeen` / `useResetTourSeen` (RPCs SECURITY DEFINER: `mark_tour_seen`, `reset_tour_seen`, `reset_all_tours_seen`).

Logout ya no borra el estado de tours (backend persiste; cache se limpia en SIGNED_OUT). Un user que vio el tour, hace logout, y se vuelve a loguear → no ve el tour de nuevo. Mismo user en otro device tampoco.

Si el RPC falla por red caída, `useMarkTourSeen` guarda un fallback en SecureStore (`tour-seen-pending.<key>`) que reintenta en el próximo launch via `useMigrateToursToBackend` (también hoistea flags legacy de installs pre-2026-05-27).

El toggle global `tours-disabled` (sin UI todavía) sigue device-local en SecureStore.
```

- [ ] **Step 12.3: Final validation**

Run:
```bash
npm run typecheck && npm run lint && npx vitest run 2>&1 | tail -10
```
Expected:
- typecheck: clean
- lint: clean
- vitest: all NEW tests pass; baseline of 3 pre-existing infra failures unchanged.

- [ ] **Step 12.4: Commit docs**

```bash
git add docs/ESTADO-DEL-PROYECTO/
git commit -m "docs: estado actual reflejando tour-seen backend sync"
```

- [ ] **Step 12.5: Hand off**

Done. La branch `feat/tour-seen-backend-sync` está lista para mergear vía `superpowers:finishing-a-development-branch`.

---

## Self-Review Notes

**Spec coverage:**
- ✅ 4 columnas timestamptz en `profiles` (Task 1)
- ✅ Backfill SQL para usuarios pre-deploy (Task 1)
- ✅ 3 RPCs (mark/reset/reset_all) con COALESCE-idempotency (Task 1)
- ✅ Profile interface extendido (Task 2)
- ✅ `useToursSeen` con loading=true=conservative (Task 3)
- ✅ `useMarkTourSeen` con optimistic + pending fallback (Task 4)
- ✅ `useResetTourSeen` con optimistic (Task 5)
- ✅ `tour-pending-store` helper (Task 6)
- ✅ `useMigrateToursToBackend` one-shot (Task 7)
- ✅ `useScreenTour` refactor (Task 8)
- ✅ `persistence.ts` strip (Task 8)
- ✅ Settings handlers wired (Task 9)
- ✅ AppEntryGate wired + obsoletos eliminados (Task 10)
- ✅ Logout simplificado (Task 11)
- ✅ Docs (Task 12)

**Placeholder scan:** ningún TBD/TODO. Cada paso muestra código completo o comando exacto.

**Type consistency:**
- `TourKey` usado idénticamente en todos los tasks
- `Profile` interface usada con los mismos 4 nombres de columna (`{home,gastos,fijos,control}_tour_seen_at`) en Tasks 2, 3, 4, 5, 8
- `COLUMN_FOR` lookup table replicada idénticamente en Tasks 4 y 5 (intentional — files don't share this helper to avoid coupling; rewriting it is acceptable for two small uses)
- RPC names matched between SQL (Task 1) y JS call sites (Tasks 4, 5, 7)
- Migration flag `tour-seen.migration-v2-done` consistente entre Tasks 7 y 11
- Legacy prefix `tour-seen.` consistente entre Tasks 7 (read+delete) y 11 (delete)
- Pending prefix `tour-seen-pending.` consistente entre Tasks 6, 7
