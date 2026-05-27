# Tour-Seen Backend Sync — Design Spec

**Fecha:** 2026-05-27
**Estado:** Aprobado para implementación
**Branch destino:** `feat/tour-seen-backend-sync`

## Problema

El estado "tour visto" vive en SecureStore device-local (`tour-seen.<key>`). Esto causa dos inconsistencias:

1. **Logout borra los flags**: `logoutSession` llama `resetAllTours()` y, en la siguiente sesión del **mismo usuario**, todos los tours vuelven a auto-firar. El usuario lo percibe como un bug ("ya lo vi, ¿por qué me lo muestra de nuevo?").
2. **Cross-device sin estado**: el mismo usuario en otro device (o tras reinstalar) ve los tours otra vez.

Queremos persistir el estado en backend para que **un tour visto se mantenga visto para ese usuario across sessions, devices y reinstalaciones**.

## Objetivo

Mover las 4 flags `tour-seen.{home,gastos,fijos,control}` de SecureStore a 4 columnas timestamptz en `profiles`. Toda la lectura/escritura/reset pasa por backend. Logout deja de tocar este estado. Mantener el toggle global `tours-disabled` device-local (fuera de scope).

## No-objetivos

- No mover `tours-disabled` (toggle global, sin UI todavía) — sigue device-local
- No refactorizar a una tabla genérica `user_preferences` — YAGNI para 4 keys estables
- No tocar la biométrica (`biometric-setup-shown`) — esa SÍ es device-specific (hardware)
- No agregar UI nueva en Settings (las acciones existentes siguen funcionando)

## Arquitectura

```
useScreenTour (auto-fire decision)
        ↓
useToursSeen() → reads profile.{home,gastos,fijos,control}_tour_seen_at via useMyProfile
        ↓
isSeen(tour) === null ? auto-fire : skip

Tour completed/dismissed
        ↓
useMarkTourSeen() → RPC mark_tour_seen(tour_key) + optimistic profile update
        ↓
profile column updated server-side

Settings → "Ver tutorial X"
        ↓
useResetTourSeen() → RPC reset_tour_seen(tour_key) + optimistic profile update
```

Logout pasa a ser un no-op para tour state (backend retiene; React Query limpia el cache profile en SIGNED_OUT).

## Storage shape

### Migración DB

```sql
ALTER TABLE profiles
  ADD COLUMN home_tour_seen_at    timestamptz,
  ADD COLUMN gastos_tour_seen_at  timestamptz,
  ADD COLUMN fijos_tour_seen_at   timestamptz,
  ADD COLUMN control_tour_seen_at timestamptz;

-- Backfill: usuarios con onboarding completado antes del deploy de
-- tours (2026-05-26). Ya conocen la app; marcamos todos vistos para
-- no molestar con tutoriales retroactivos.
UPDATE profiles
SET home_tour_seen_at    = now(),
    gastos_tour_seen_at  = now(),
    fijos_tour_seen_at   = now(),
    control_tour_seen_at = now()
WHERE onboarding_completed_at IS NOT NULL
  AND onboarding_completed_at < '2026-05-26T00:00:00Z';
```

**Por qué columnas explícitas (no jsonb)**:
- Mismo patrón que `onboarding_completed_at` (consistencia)
- Type-safe a nivel schema; agregar un tour requiere migración (lo cual ya es necesario en código, así que la coupling es honesta)
- Sin parseo en cada read; React Query cachea el profile completo
- 4 columnas vs jsonb: ~32 bytes/row vs jsonb overhead similar; no hay ganancia material

### RPCs

Todas SECURITY DEFINER, operan sobre `profiles.id = auth.uid()`. SQL exact:

```sql
-- Marcar un tour específico como visto (idempotente: si ya tiene
-- timestamp, no lo sobrescribe — preservamos el primer-visto).
CREATE OR REPLACE FUNCTION mark_tour_seen(tour_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE tour_key
    WHEN 'home'    THEN UPDATE profiles SET home_tour_seen_at    = COALESCE(home_tour_seen_at, now())    WHERE id = auth.uid();
    WHEN 'gastos'  THEN UPDATE profiles SET gastos_tour_seen_at  = COALESCE(gastos_tour_seen_at, now())  WHERE id = auth.uid();
    WHEN 'fijos'   THEN UPDATE profiles SET fijos_tour_seen_at   = COALESCE(fijos_tour_seen_at, now())   WHERE id = auth.uid();
    WHEN 'control' THEN UPDATE profiles SET control_tour_seen_at = COALESCE(control_tour_seen_at, now()) WHERE id = auth.uid();
    ELSE RAISE EXCEPTION 'Unknown tour_key: %', tour_key;
  END CASE;
END $$;

-- Reset un tour (Settings → "Ver tutorial X")
CREATE OR REPLACE FUNCTION reset_tour_seen(tour_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE tour_key
    WHEN 'home'    THEN UPDATE profiles SET home_tour_seen_at    = NULL WHERE id = auth.uid();
    WHEN 'gastos'  THEN UPDATE profiles SET gastos_tour_seen_at  = NULL WHERE id = auth.uid();
    WHEN 'fijos'   THEN UPDATE profiles SET fijos_tour_seen_at   = NULL WHERE id = auth.uid();
    WHEN 'control' THEN UPDATE profiles SET control_tour_seen_at = NULL WHERE id = auth.uid();
    ELSE RAISE EXCEPTION 'Unknown tour_key: %', tour_key;
  END CASE;
END $$;

-- Reset all (Settings → "Volver a ver todos los tutoriales")
CREATE OR REPLACE FUNCTION reset_all_tours_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET home_tour_seen_at    = NULL,
      gastos_tour_seen_at  = NULL,
      fijos_tour_seen_at   = NULL,
      control_tour_seen_at = NULL
  WHERE id = auth.uid();
END $$;

GRANT EXECUTE ON FUNCTION mark_tour_seen(text)      TO authenticated;
GRANT EXECUTE ON FUNCTION reset_tour_seen(text)     TO authenticated;
GRANT EXECUTE ON FUNCTION reset_all_tours_seen()    TO authenticated;
```

**Nota sobre idempotencia de `mark_tour_seen`**: usa `COALESCE(col, now())` para preservar el primer-visto. Esto importa para analytics futuro ("¿cuándo vio el tour por primera vez?").

## Componentes nuevos

### Archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/<ts>_tour_seen_columns.sql` | Migración: 4 columnas + backfill + 3 RPCs |
| `mobile/features/tours/use-tours-seen.ts` | Hook `useToursSeen()` → `{ isSeen(key): boolean, isLoading: boolean }`. Lee del profile cached por React Query. |
| `mobile/features/tours/use-mark-tour-seen.ts` | Mutation `markTourSeen(key)` → RPC + optimistic update + pending-fallback en SecureStore si la mutation falla |
| `mobile/features/tours/use-reset-tour-seen.ts` | Mutations `resetTourSeen(key)` y `resetAllToursSeen()` + optimistic update |
| `mobile/features/tours/tour-pending-store.ts` | Helper SecureStore para `tour-seen-pending.<key>` (fallback offline) |
| `mobile/features/tours/migrate-local-seen-to-backend.ts` | Lee SecureStore local flags, los hoistea via RPC, limpia. One-shot. |
| `tests/unit/use-tours-seen.test.ts` | Tests del hook (mock profile data) |
| `tests/unit/migrate-local-seen-to-backend.test.ts` | Tests de la migración one-shot |

### Componentes/módulos modificados

| Archivo | Cambio |
|---|---|
| `mobile/features/tours/use-screen-tour.ts` | Reemplazar `getTourSeen(tour)` por `useToursSeen().isSeen(tour)`. Reemplazar `setTourSeen(tour)` por `markTourSeen(tour)` en el callback de tour-completed. |
| `mobile/features/tours/persistence.ts` | Eliminar API local de `tour-seen.*` (`getTourSeen`, `setTourSeen`, `resetTourSeen`, la rama de `tour-seen.*` en `resetAllTours`). Mantener `getToursEnabled`/`setToursEnabled` (toggle global sigue device-local). |
| `mobile/features/auth/logout.ts` | Eliminar `await resetAllTours()` (backend persiste; cache se limpia en SIGNED_OUT). Mantener `deletePersistentValue('tours-backfill-done')` renombrado a la nueva flag de migración + `deletePersistentValue('tours-disabled')` defensivo. |
| `mobile/features/tours/use-backfill-existing-user.ts` | Refactor: la lógica de "marcar tours seen para usuarios pre-deploy" se mueve a la SQL migration (corre 1x al deploy). El hook se transforma en `useMigrateLocalSeenToBackend` (one-shot por device para usuarios mid-window). |
| `mobile/features/tours/backfill-config.ts` | Eliminar (`TOURS_FEATURE_DEPLOYED_AT` ya solo se usa en la SQL migration; ahí queda hardcoded). |
| `mobile/screens/settings/settings-screen.tsx` | `handleRewatchTour(key)` ahora llama `resetTourSeen(key)` mutation. `handleResetAllTours()` llama `resetAllToursSeen()` mutation. Sigue funcionando igual desde la UI. |
| `mobile/components/root/app-entry-gate.tsx` | Si llamaba `useBackfillExistingUser`, ahora llama `useMigrateLocalSeenToBackend`. Mismo lugar, mismo timing. |
| `mobile/features/profile/use-profile.ts` (o similar) | Asegurar que el `select`/return type incluya las 4 nuevas columnas |
| TypeScript types del profile | Regenerar / actualizar para incluir las 4 columnas |

## Migración device → backend (one-shot por install)

### Flag de control

Nuevo: `tour-seen.migration-v2-done` en SecureStore. Distinto del viejo `tours-backfill-done` para forzar re-run en devices que ya completaron el backfill anterior.

### Hook `useMigrateLocalSeenToBackend(userId)`

Pseudocódigo:

```ts
export function useMigrateLocalSeenToBackend(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    void (async () => {
      const alreadyDone = await getPersistentValue('tour-seen.migration-v2-done')
      if (alreadyDone === '1') return

      // 1. Read all 4 local SecureStore seen flags
      const localSeen: TourKey[] = []
      for (const key of ALL_TOUR_KEYS) {
        const raw = await getPersistentValue(`tour-seen.${key}`)
        if (raw === '1') localSeen.push(key)
      }

      // 2. Push each to backend (idempotent server-side)
      for (const key of localSeen) {
        try {
          await supabase.rpc('mark_tour_seen', { tour_key: key })
        } catch {
          // Network failure: leave migration flag unset, will retry next launch
          if (!cancelled) return
        }
      }

      // 3. Clean up local SecureStore (the backend is source of truth now)
      for (const key of ALL_TOUR_KEYS) {
        await deletePersistentValue(`tour-seen.${key}`)
      }

      // 4. Mark migration done so we don't re-run
      await setPersistentValue('tour-seen.migration-v2-done', '1')

      // 5. Invalidate profile cache to pick up the new server state
      queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    })()

    return () => {
      cancelled = true
    }
  }, [userId])
}
```

Idempotente (mark_tour_seen usa COALESCE), seguro de re-run si network falla mid-flight.

## Logout — qué cambia

`mobile/features/auth/logout.ts`:

**Antes**:
```ts
await resetAllTours()  // wipe tour-seen.* + tours-disabled
await deletePersistentValue('tours-backfill-done')
```

**Después**:
```ts
// tour-seen state lives in backend now; cache cleared via SIGNED_OUT
// in use-auth-session. We don't touch backend on logout (preserves
// user state across sessions and devices).
await deletePersistentValue('tour-seen.migration-v2-done')
await deletePersistentValue('tours-disabled')  // toggle global sigue device-local
```

Razón de borrar `migration-v2-done` en logout: si user A se loguea, migración corre (puede no hacer nada porque no había local flags), después logout, después user B se loguea en el mismo device — queremos que la migración re-evalúe el SecureStore de user B (que puede tener flags propios si vino de un device viejo y restauró backup iCloud, edge case raro pero gratis cubrirlo).

## Settings UI — sin cambios visuales

`mobile/screens/settings/settings-screen.tsx`:

```ts
// Antes
const handleRewatchTour = useCallback(async (key: TourKey) => {
  await resetTourSeen(key)
  router.push(routeFor(key))
}, [router])

// Después
const resetMutation = useResetTourSeen()
const handleRewatchTour = useCallback(async (key: TourKey) => {
  await resetMutation.resetOne(key)
  router.push(routeFor(key))
}, [resetMutation, router])
```

Misma UX, distinto backend. Reset es instantáneo cross-device.

## Hooks — implementación clave

### `useToursSeen`

```ts
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
    isSeen: (key: TourKey) => {
      if (!profile) return true // conservative: don't fire while loading
      switch (key) {
        case 'home':    return profile.home_tour_seen_at    !== null
        case 'gastos':  return profile.gastos_tour_seen_at  !== null
        case 'fijos':   return profile.fijos_tour_seen_at   !== null
        case 'control': return profile.control_tour_seen_at !== null
      }
    },
  }
}
```

**Comportamiento conservador en loading**: cuando profile aún no carga, `isSeen()` retorna `true` → no auto-fire. Profile carga sub-segundo en práctica (ya bloquea AppEntryGate antes de mostrar Home), así que la "ventana de loading" en una screen real es ~0.

### `useMarkTourSeen`

```ts
export function useMarkTourSeen() {
  const queryClient = useQueryClient()
  const userId = useAuthSession().data?.user.id

  return useMutation({
    mutationFn: async (key: TourKey) => {
      const { error } = await supabase.rpc('mark_tour_seen', { tour_key: key })
      if (error) {
        // Network failure: pending fallback
        await setPersistentValue(`tour-seen-pending.${key}`, '1')
        throw error
      }
      // Clear any prior pending flag
      await deletePersistentValue(`tour-seen-pending.${key}`)
    },
    onMutate: async (key) => {
      if (!userId) return
      await queryClient.cancelQueries({ queryKey: ['profile', userId] })
      const previous = queryClient.getQueryData(['profile', userId])
      queryClient.setQueryData(['profile', userId], (old: any) =>
        old ? { ...old, [`${key}_tour_seen_at`]: new Date().toISOString() } : old,
      )
      return { previous }
    },
    onError: (_, __, context) => {
      if (!userId || !context) return
      queryClient.setQueryData(['profile', userId], context.previous)
    },
  })
}
```

### Pending fallback retry (in `useMigrateLocalSeenToBackend`)

Después de la migración inicial, también revisamos `tour-seen-pending.*` y los re-sincronizamos:

```ts
// Inside the migration hook, additional pass:
for (const key of ALL_TOUR_KEYS) {
  const pending = await getPersistentValue(`tour-seen-pending.${key}`)
  if (pending === '1') {
    try {
      await supabase.rpc('mark_tour_seen', { tour_key: key })
      await deletePersistentValue(`tour-seen-pending.${key}`)
    } catch { /* try next launch */ }
  }
}
```

## Edge cases

| Caso | Comportamiento |
|---|---|
| **Cuenta nueva post-deploy** | 4 columnas inician NULL → todos auto-fire en orden de visita |
| **Cuenta pre-deploy con onboarding completo** | SQL backfill marca todas con `now()` → no ven tours |
| **Usuario mid-window (vio algunos tours entre 2026-05-26 y deploy)** | `useMigrateLocalSeenToBackend` hoistea esos al backend en primer launch post-deploy |
| **Mismo user, otro device** | Profile load trae el state → tours vistos no se repiten |
| **Logout + login mismo user** | Backend persiste → tours vistos no se repiten |
| **Logout + login otro user mismo device** | Profile del nuevo user es independiente → cada uno con su estado |
| **Reinstalación de app** | SecureStore vacío; backend retiene → tours vistos no se repiten |
| **Backend caído al cargar profile** | `useMyProfile` devuelve stale-cache o error → `isSeen=true` por default (sin spam) |
| **Backend caído al marcar tour seen** | Mutation falla → optimistic update se reverte → `tour-seen-pending.<key>='1'` → retry en próximo launch |
| **Settings → reset all + sin red** | Mutation falla → toast de error → user reintenta cuando vuelve la red |
| **Tour visto en device offline, conexión luego** | Pending flag → próximo launch online → sync |
| **Race: tour visto + logout antes de sync** | Pending flag se borra junto con migration flag en logout; este caso edge (sub-segundo) lo aceptamos |

## Testing

### SQL

- **Migración smoke**: aplicar localmente, verificar columnas, verificar backfill marca correctamente (`SELECT count(*) FROM profiles WHERE onboarding_completed_at < '2026-05-26' AND home_tour_seen_at IS NULL` debe ser 0).
- **RPC smoke**: llamar `mark_tour_seen('home')` desde SQL editor con `set local role authenticated; set local request.jwt.claims = ...;`. Verificar idempotencia (segundo call no cambia el timestamp).
- **Unknown tour_key**: `mark_tour_seen('foo')` debe rejectar con excepción.

### Unit tests (vitest)

- **`use-tours-seen.test.ts`** — mock profile data, verificar `isSeen` por cada key + comportamiento conservador en loading
- **`use-mark-tour-seen.test.ts`** — mock supabase + queryClient; verificar optimistic update, rollback en error, pending flag set en error
- **`migrate-local-seen-to-backend.test.ts`** — mock SecureStore + supabase RPC; verificar:
  - idempotencia (no re-run si flag set)
  - hoist correcto de seen flags
  - cleanup de SecureStore tras éxito
  - no-cleanup si RPC falla (retry next launch)

### Smoke manual en device

1. Cuenta nueva → tour Home dispara → completar → logout → re-login → tour Home NO dispara ✅ (caso central)
2. Cuenta nueva → tour Home dispara → completar → Settings → "Ver tutorial Inicio" → entrar a Home → dispara ✅
3. Settings → "Volver a ver todos" → entrar a cada pantalla → dispara ✅
4. Cuenta nueva en device A, completar todos los tours, logout, login mismo user en device B → ningún tour dispara ✅
5. Cuenta pre-deploy (existente) → primer login post-deploy → ningún tour dispara (SQL backfill funcionó) ✅
6. Cuenta mid-window con flag local de "home seen" → primer login post-deploy → hoist → tour Home no dispara ✅

## Riesgos

- **Migración mid-window error**: si la SQL `UPDATE` falla para algunos rows (RLS edge, etc.), esos users verán tours retroactivos. Mitigación: la SQL es simple `UPDATE WHERE`, sin RLS porque corre como service role; verificar manualmente en staging que count post-migration matches expected.
- **`profiles` row crecimiento**: 4 columnas timestamptz = 32 bytes. Insignificante.
- **TypeScript types del profile drift**: si el codegen de tipos de supabase no se regenera, las nuevas columnas no aparecen y los hooks no compilan. Mitigación: regenerar tipos como step del plan + verificar con typecheck.
- **`useMyProfile` no devuelve las 4 columnas**: si el `select` actual filtra columnas explícitamente, hay que actualizar. Verificar en el plan.

## Métricas de éxito

- **% de usuarios que reportan "tour se mostró otra vez después de logout"** baja a ~0 post-deploy
- **% de devices con `tour-seen.*` SecureStore flags residuales** decae a 0 tras 7 días (todos migran al primer launch post-deploy)
