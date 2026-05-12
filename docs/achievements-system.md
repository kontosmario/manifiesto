# Sistema de Achievements — comportamiento real

> Estado: vivo en prod desde 2026-05-12. Owner: confirmar antes de tocar triggers o catálogo (cualquier cambio impacta retención).

## Arquitectura en 3 capas

```
DB (Postgres) ──► Realtime (Supabase) ──► Mobile (React Query + Bridge)
   triggers           channel filtered          modal + galería
```

Toda la **detección** es server-side. El cliente nunca otorga un logro — solo lee y reacciona. Defense in depth: la función `award_achievement` está revoked de `authenticated`, solo `service_role` y los triggers (security definer) pueden invocarla. Esto protege contra unlocks fraudulentos vía cliente manipulado.

## El catálogo (11 logros hoy)

Vive en `achievements_catalog`. Cada fila: `code`, `title`, `body`, `icon` (emoji), `tier` (`bronze`/`silver`/`gold`/`legendary`), `sort_order`. Editable solo por `service_role` → para agregar uno nuevo NO hace falta re-deploy mobile; basta con un INSERT desde Studio.

**Los 14 codes activos:**

| Code | Tier | Cuándo se gana |
|---|---|---|
| `first_expense` 🌱 | bronze | Al cargar tu primer gasto |
| `first_fixed` 📅 | bronze | Al agregar tu primer gasto fijo |
| `first_paid_fixed` ✅ | bronze | Al marcar como pagado el primer fijo |
| `first_goal` 🎯 | bronze | Al crear tu primera meta de ahorro |
| `streak_7` 🔥 | bronze | Al llegar a 7 días de racha |
| `streak_14` 🔥 | silver | 14 días |
| `streak_30` 🔥 | silver | 30 días |
| `streak_60` 🔥 | gold | 60 días |
| `streak_90` 👑 | legendary | 90 días |
| `goal_25` 🌱 | bronze | Una meta de ahorro cruza el 25% |
| `goal_50` 🌿 | silver | Cruza el 50% |
| `goal_75` 🌳 | gold | Cruza el 75% |
| `goal_completed` 🏆 | gold | Al cumplir una meta (`current_amount ≥ goal_amount`) |
| `first_cycle_under_budget` 💰 | silver | Al cerrar tu primer ciclo mensual gastando menos que el `monthly_income` |

## Los triggers — cómo se disparan

7 triggers SQL en tablas señal. Todos son **`after insert/update`** (no `before`) → el evento original se commitea sí o sí. Todos están envueltos en `exception when others then raise notice ...` → si la detección revienta, el INSERT del gasto/fijo/meta sigue.

| Tabla origen | Trigger | Lógica |
|---|---|---|
| `expenses` | `tr_award_first_expense` | `count(*) limit 2 = 0` → es el primer gasto del user (excluye el nuevo) |
| `fixed_expenses` | `tr_award_first_fixed` | mismo patrón por `family_id` |
| `fixed_expense_payments` | `tr_award_first_paid_fixed` | mismo patrón joined a `fixed_expenses` |
| `user_streaks` (UPDATE) | `tr_award_streak_milestones` | si `new.current_streak ≥ threshold && old.current_streak < threshold` → award. Solo dispara al **cruzar** el threshold, no en cada update por encima |
| `user_streaks` (INSERT) | `tr_award_streak_milestones_initial` | defensive: si la primera fila viene con un streak alto (backfill, edge case), otorga retroactivo |
| `savings_goals` | `tr_award_first_goal` | mismo patrón |
| `savings_goals` (INSERT/UPDATE) | `tr_award_goal_milestones` | evalúa los 4 thresholds (25/50/75/100) en una sola pasada. Solo dispara al CRUZAR el threshold (igual que streak milestones). Reemplazó a `tr_award_goal_completed` en migration `20260521000000`. |
| `monthly_summaries` | `tr_award_first_cycle_under_budget` | al cerrar el ciclo si `total_spent < monthly_income`. Lee `family_finance.monthly_income` para comparar |

Cada trigger llama a [`award_achievement(code, user_id, family_id, context)`](../supabase/migrations/20260520000000_achievements.sql). Esa función:

1. **Valida** que el code exista y esté activo (`is_active = true`) → protege contra typos en triggers.
2. **Inserta en `achievements_earned`** con `on conflict (user_id, code) do nothing` → idempotente. Disparar 10 veces el mismo trigger genera 1 fila.
3. **Retorna boolean** indicando si efectivamente insertó (útil para futuros triggers que quieran encadenar lógica).

La PK natural es `(user_id, code)` → garantía a nivel schema de que no podés ganar el mismo logro dos veces.

## Realtime — el push al cliente

`achievements_earned` está agregada a la publication `supabase_realtime` (al final de la migration). El cliente abre un canal:

```ts
// mobile/features/achievements/use-achievements.ts:151
supabase.channel(`achievements:user:${userId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'achievements_earned',
    filter: `user_id=eq.${userId}`,
  }, ...)
```

**Filtro por `user_id=eq.X` es crítico**: cada cliente solo recibe sus propios unlocks. La RLS policy `earned_select_own` lo respalda — aunque el filtro fallara, el usuario no podría leer rows ajenas.

Cuando llega el INSERT:

1. Lee la entrada del catálogo de la React Query cache (sincrono, ya está poblada).
2. Si no está cacheada (race con app fría) → fetch catalog lazily.
3. Compone un `AchievementViewItem` con `earned: true, earned_at, context`.
4. Llama `onUnlock(item)` → el Bridge muestra la modal.
5. Invalida `['achievements', 'earned', userId]` → la galería refresha cuando se abre.

## El Bridge — un único punto de montaje

[`AchievementUnlockBridge`](../mobile/components/bridges/achievement-unlock-bridge.tsx) se monta UNA SOLA VEZ en [`AppStackShell`](../mobile/components/root/app-stack-shell.tsx), **fuera del `<Stack>` de expo-router**. Razón:

- Si se monta dentro del Stack, navegar a otra pantalla lo desmonta → si el unlock llega durante la navegación, la modal nunca aparece.
- Afuera del Stack: vive durante toda la sesión autenticada. Un unlock disparado por un INSERT de gasto se ve aunque el usuario haya navegado a Gastos, Settings, lo que sea — la modal flota por encima de cualquier screen.

El Bridge mantiene un solo `useState<AchievementViewItem | null>(active)`. Si llega un segundo unlock mientras el primero está en pantalla, **override** (back-to-back es muy raro — un INSERT que simultáneamente dispara `first_expense` + `streak_7` mostraría solo el segundo). Queue ordenada quedó como TODO para v2.

Suscribe a DOS paths en paralelo:

- `useAchievementUnlocks(userId, handleUnlock)` → el path real (realtime DB)
- `useAchievementPreviewListener(handleUnlock)` → el dev preview emitter

El modal no puede distinguir cuál lo disparó — UI idéntica.

## Dónde se visualizan

### 1. Inmediato — al desbloquear

[`AchievementUnlockModal`](../mobile/components/achievements/achievement-unlock-modal.tsx) full-screen, con:

- Tier ring + icon grande
- Title + body del catálogo
- Confetti burst
- Haptic
- Auto-dismiss + tap-anywhere

Aparece en cualquier pantalla donde el user esté cuando el INSERT realtime llega.

### 2. Persistente — galería en Settings

Ruta: `Settings → Tu progreso → Logros` (`/settings/achievements`).

[`AchievementsGalleryScreen`](../mobile/screens/settings/achievements-gallery-screen.tsx) usa `useAchievements(userId)` que mergea catálogo + earned:

- **Hero card**: progreso global "X de Y" con `CountUpText`, gradient, dots strip con un punto por code (lleno = earned, vacío = locked).
- **Sección "Desbloqueados"**: cards con tier ring de color (bronce/plata/oro/legendary), icon, title, body, `earned_at` formateado.
- **Sección "Por desbloquear"**: cards en estado lock con dashed ring + lock badge + el `body` del catálogo como hint de qué hacer para ganarlo.

`staleTime`: catálogo 10 min (casi no cambia), earned 1 min + invalidation en cada realtime insert.

### 3. Inferido — chips/badges en otras pantallas

**No existe hoy.** La modal celebra el momento, la galería persiste el historial, y nada más. No hay:

- Chip en Home mostrando "último logro ganado"
- Badge en el avatar del user
- Counter "X/11 logros" en algún lugar destacado

Estaba en la propuesta original pero owner mantuvo scope cerrado en v1. Si más adelante se quiere mayor visibilidad, los lugares naturales serían:

- Chip "🔥 streak_7 ganado" debajo del flame en Gastos
- Mini-counter "5/11" en el row de "Logros" en Settings (mostraría qué tan completo está sin abrir la galería)

## Dev preview (post-launch tool)

`Settings → Desarrollo → Preview · Logros & Racha` (solo `__DEV__`):

- **Sección logros**: lista los 11 codes. Tap → dispara el modal real, sin INSERT en DB. La modal es la misma que vería un user real ganándolo — visualmente indistinguible.
- **Sección racha**: 9 celdas con el `StreakFlameIcon` en cada estado (Activa · Arranque/Constante/Disciplinado/Imparable/Maestro/Leyenda, En riesgo c/s escudos, Rota).

El mecanismo es un singleton emitter ([`achievement-preview-emitter.ts`](../mobile/lib/achievement-preview-emitter.ts)) — el Bridge subscribe ese set + el realtime channel. `triggerAchievementPreview(item)` itera el set y dispara `onUnlock`. Cero cambios a la modal o al Bridge para soportar preview — el path es idéntico al real, solo cambia el origen del item.

## Edge cases manejados

- **Doble INSERT** (race entre triggers que detectan el mismo evento): `on conflict do nothing` lo absorbe. La modal solo se ve la primera vez.
- **Trigger explota**: `exception when others then raise notice` → el gasto/fijo/meta se guarda igual. Logro perdido pero feature primario intacto.
- **Cliente offline cuando llega el unlock**: el INSERT se hace igual; el realtime se pierde pero `useAchievements` lo levanta cuando el user vuelve a la app y abre la galería. **No hay celebración retroactiva** — owner explícitamente NO quiso un "you missed these" toast al volver.
- **Backfill / migration**: el trigger `_initial` sobre INSERT de `user_streaks` cubre el caso de que la primera fila ya venga con un streak alto. Sin él, un user migrado con racha de 15 nunca ganaría `streak_7` ni `streak_14`.
- **Lockdown**: ningún user puede llamar `award_achievement` desde el cliente. Si se quiere disparar uno desde otro contexto futuro (ej. edge function), hace falta service_role.

## Cómo agregar un logro nuevo

1. **INSERT en `achievements_catalog`** desde Studio o migration:
   ```sql
   insert into public.achievements_catalog (code, title, body, icon, tier, sort_order)
   values ('your_code', 'Title', 'Body explicativo', '🎉', 'silver', 120);
   ```
2. **Definir el trigger** en una migration nueva. Patrón: `after insert/update` + `security definer` + `exception when others then raise notice` + llamar `perform public.award_achievement(...)`.
3. **No tocar mobile**: la galería y la modal lo levantan automáticamente apenas el catálogo lo tenga.

Si querés desactivar un logro sin perder el historial: `update achievements_catalog set is_active = false where code = '...'`. La validación en `award_achievement` deja de otorgarlo, pero las rows existentes en `earned` se siguen mostrando.

## Archivos relevantes

- Migration: [`supabase/migrations/20260520000000_achievements.sql`](../supabase/migrations/20260520000000_achievements.sql)
- Lockdown: [`supabase/migrations/20260520010000_achievements_lockdown.sql`](../supabase/migrations/20260520010000_achievements_lockdown.sql)
- Hook + realtime: [`mobile/features/achievements/use-achievements.ts`](../mobile/features/achievements/use-achievements.ts)
- Bridge: [`mobile/components/bridges/achievement-unlock-bridge.tsx`](../mobile/components/bridges/achievement-unlock-bridge.tsx)
- Modal: [`mobile/components/achievements/achievement-unlock-modal.tsx`](../mobile/components/achievements/achievement-unlock-modal.tsx)
- Galería: [`mobile/screens/settings/achievements-gallery-screen.tsx`](../mobile/screens/settings/achievements-gallery-screen.tsx)
- Dev preview emitter: [`mobile/lib/achievement-preview-emitter.ts`](../mobile/lib/achievement-preview-emitter.ts)
- Dev preview screen: [`mobile/screens/dev/achievements-streak-preview-screen.tsx`](../mobile/screens/dev/achievements-streak-preview-screen.tsx)
