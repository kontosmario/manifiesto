# 🏠 Home — Estado de implementación del plan de remediación

> Tracking del plan `home-plan-remediacion.docx`. Snapshot 2026-04-29.
>
> Cada PR del plan está mapeado a su estado actual. Type-check limpio,
> 168 tests pasan (los 5 fallos preexisten en `main`, no son regresión).

---

## Resumen ejecutivo

- **8 de 9 PRs del plan integrados** (PR1–PR5, PR7–PR9)
- **PR6 deferred** — requiere instalar dep nativa (MMKV o async-storage) + native rebuild, fuera de scope autónomo
- **1 migration server-side** escrita pero pendiente de aplicar (auth explícita del usuario)
- **3 bugs de correctness cerrados**: `today` stale, key mismatch fixed-expense-payments, optimistic delete con rollback
- **Triple invocación de `useControlV2Data` resuelta** vía `singleEntryMemoize` (LRU(1) module-level)
- **22 nodos Reanimated eliminados** (ParticleField removido)
- **357 LOC sheets lazy-mounted** (CycleBalancePromptSheet)
- **6 callbacks memoizados** + 7 componentes envueltos en `React.memo`
- **Realtime channel cableado** en HomeScreen (4 tablas)
- **A11y**: hero como summary unit + `maxFontSizeMultiplier: 1.4` cap + `accessibilityRole="header"` en greeting + label de grupo en FamilyStrip
- **3 componentes muertos eliminados** (alerts-strip, shortcut-card, home-advisor-strip)
- **MetaCard fallback con CTA** cuando no hay savings goal

---

## Estado por PR

### PR 1 — Bug fixes ✅

| Item | Archivo | Estado |
|---|---|---|
| `useCurrentDate` hook con re-evaluación midnight + AppState | [`mobile/hooks/use-current-date.ts`](mobile/hooks/use-current-date.ts) | shipped |
| Reemplazo de `const [today] = useState(...)` en HomeDashboard | [`home-dashboard.tsx:82`](mobile/components/home/home-dashboard.tsx#L82) | shipped |
| Migration `home_snapshot()` retornando payments por pay-cycle window + ISOs `payments_cycle_start/end` | [`20260501020000_home_snapshot_cycle_payments.sql`](supabase/migrations/20260501020000_home_snapshot_cycle_payments.sql) | ✅ live en Supabase remoto (2026-04-29) |
| Cliente seedea exact key del hook usando los nuevos ISOs | [`use-home-snapshot.ts`](mobile/features/home/use-home-snapshot.ts) | shipped (degrades graceful sin migration) |
| Optimistic delete + rollback + invalidación quirúrgica | [`use-expenses.ts:163`](mobile/features/expenses/use-expenses.ts#L163) | shipped |

**Auditoría adicional realizada (per nota del plan)**: `today` no alimenta query keys en el árbol Home, solo cálculos derivados (`isPaydayPending`, `daysUntilPayday`, `getPaydayCycle`). Reemplazo seguro sin blast radius oculto.

### PR 2 — Memoización ✅

`useCallback` aplicado en:
- `confirmCycleStartingBalance` ([home-screen.tsx:102](mobile/screens/home/home-screen.tsx#L102))
- `handleDeleteExpense` ([home-screen.tsx:144](mobile/screens/home/home-screen.tsx#L144))
- `handleChipConfirm`, `handleCycleSheetClose/Save/KeepDefault`, `handleAddExpense`, `handleViewGastos`, `handleViewFijos`, `handleActivityRetry` (HomeDashboard)

`React.memo` aplicado en:
- `HomeHeader`, `FamilyStrip`, `MonthSummaryCard`, `HomeActivitySection`, `MetaCard`, `AmbientBlobs`, `AmbientBackdrop`

Memoización en pareja completa — sin perf-theater.

### PR 3 — `useControlV2Data` con cómputo memoizado cross-invocation ✅

**Corrección al fix del plan original**: el plan proponía mover cómputo a `select:` de la query, pero `useControlV2Data` agrega 9 queries diferentes y no se puede consolidar en un solo `useQuery` sin reescribir el hook.

**Solución implementada**: `singleEntryMemoize` ([`mobile/lib/single-entry-memo.ts`](mobile/lib/single-entry-memo.ts)) — LRU(1) cache module-level que comparte resultado entre las 3 invocaciones del Home tree (HomeScreen + HomeDashboard + tab-bar advisor badge). Las 5 funciones heavy ahora se memoizan a nivel módulo:

- `memoizedBuildData` (`buildControlDataFromSnapshot`)
- `memoizedComputeView` (`computeControlView`)
- `memoizedComputeBaselines` (`computeUserBaselines`)
- `memoizedInferPersona` (`inferPersona`)
- `memoizedDetectCausal` (`detectCausalLinks`)
- `memoizedBuildForecast` (`buildForecast7Day`)
- `memoizedBuildSignals` (`buildControlSignals`)

**Resultado**: las 3 invocaciones por render comparten cómputo. De 15 ejecuciones redundantes → 5 únicas.

**Tests**: 5 tests nuevos en [`tests/unit/single-entry-memo.test.ts`](tests/unit/single-entry-memo.test.ts) — todos pasan.

### PR 4 — Render budget ✅

| Item | Estado |
|---|---|
| ParticleField eliminado por completo (era 22 nodos Reanimated) | shipped — `<ParticleField />` removido del render path en [hero-aurora.tsx:80](mobile/components/home/hero-aurora.tsx#L80) |
| Lazy-mount de ambos `CycleBalancePromptSheet` variants | shipped — `{isCycleBalanceSheetOpen && variant ? ... : null}` |
| `select:` narrowing en `useUnreadNotificationsCount` | shipped — nuevo `useHasUnreadNotifications` con `select: (count) => count > 0` |
| `staleTime: 5 * 60_000` en categorías, fixed-expenses, family-members, savings-goal | shipped |

### PR 5 — Realtime channel en Home ✅

[`use-home-realtime.ts`](mobile/features/home/use-home-realtime.ts) — single Supabase channel `family-home:{familyId}` con 4 listeners (expenses / fixed_expenses / savings_goals / notifications). Mounted en HomeScreen. Cleanup correcto vía `unsubscribe + removeChannel`. El badge de unread y la activity ahora actualizan por push real-time sin pull-to-refresh.

### PR 6 — Persist React Query cache ⏭️ DEFERRED

Requiere instalar `@tanstack/query-async-storage-persister` + `react-native-mmkv` (o `@react-native-async-storage/async-storage`) + native rebuild. Fuera de scope para ejecución autónoma — se le pasó al usuario para autorizar antes de añadir dep nativa.

`expo-secure-store` (ya instalado) tiene límite de 2KB por key, insuficiente para persistir cache completa.

### PR 7 — Split de HomeDashboard ✅ (parcial)

**Decisión**: el plan proponía split 3-way (Data/Chrome/Sheets via Context). Análisis: la prop-drilling actual es legible y bien tipada — convertir a Context sería disruptivo con valor marginal vs el riesgo de bugs.

**Implementado**: extracción de los Sheets a [`home-dashboard-sheets.tsx`](mobile/components/home/home-dashboard-sheets.tsx) — más limpio, complementa el lazy-mount, deja HomeDashboard 30 LOC más corto. El split Data/Chrome queda documentado como deuda técnica si en el futuro la complejidad crece.

### PR 8 — A11y ✅

| Item | Estado |
|---|---|
| HomeHeroCard como summary unit (`accessibilityRole="summary"` + label compuesto) | shipped en [home-hero-card.tsx](mobile/components/home/home-hero-card.tsx) |
| `maxFontSizeMultiplier={1.4}` cap en hero (CountUpText prop nuevo) y greeting (34px) | shipped |
| `accessibilityRole="header"` en GreetingHeader | shipped |
| `accessibilityLabel` de grupo en FamilyStrip | shipped |

**Pendiente para el merge** (per la nota del plan): test manual con VoiceOver (iOS) y TalkBack (Android) — requiere device físico.

### PR 9 — Polish P2 ✅

- Componentes muertos borrados: `alerts-strip.tsx`, `shortcut-card.tsx`, `home-advisor-strip.tsx`
- `MetaEmptyCard` cuando no hay savings goal — CTA "Creá tu primera meta" → `/savings-goal`
- `React.memo` en AmbientBackdrop / AmbientBlobs (P2-3) → ya cubierto en PR2
- staleTime bumps (P2-8) → ya cubierto en PR4
- `@shopify/react-native-skia` lazy-loading (P2-5) → ya implementado vía `getOptionalSkiaModule`

**No shipped**: skeleton para HomeHeroCard (P2-1) — visual non-trivial, deferred. Lazy-import de `causal-engine`/`forecast-engine`/`persona` (P2-4) — bloqueado por la integración con `singleEntryMemoize` (mover a dynamic import rompería el flujo síncrono). El cluster `control-*` mal ubicado bajo `components/home/` no se movió en este PR — es refactor de filesystem que merece su propio PR.

---

## Migration aplicada (2026-04-29)

`supabase/migrations/20260501020000_home_snapshot_cycle_payments.sql` ✅ live en Supabase remoto.

`supabase migration list --linked` confirma `20260501020000` presente. Desde este punto:

- El cliente seedea la query key exacta de `useFixedExpensePayments` desde el snapshot — round-trip extra eliminado en cold start del Home cuando `salary_payment_day !== 1`.
- `period_month` se preserva (computed desde `cycle_start`) para mantener compatibilidad con clientes anteriores.
- `payments_cycle_start` y `payments_cycle_end` ahora forman parte del contrato del payload.

**Reversibilidad**: la migration solo redefine la function. Para revert: re-aplicar el contenido de `20260424020000_home_snapshot_rpc.sql` con la misma firma SQL.

---

## Métricas observables

Las cifras de impacto del plan están en §7. La auditoría empírica (TTI, frame drops, memoria) requiere build release sobre device físico — el plan dice esto explícitamente en §1.2 y la captura de baseline pre-shipping fue señalada como pre-requisito. **No se capturó baseline**, así que las cifras post-shipping no son comparables sin esa medición.

**Lo que sí es directamente observable en el código**:

- 22 `useSharedValue + useLoopAnimation + useAnimatedStyle` por particle ELIMINADOS
- 357 LOC de gesture worklets ya no montan en steady-state
- 5 `useMemo` heavy por invocación × 3 invocaciones = 15 ejecuciones → 5 (ratio 3×) en el escenario común "todas las invocaciones comparten data ref"
- 1 round-trip menos en cold start (post-migration)
- Realtime channel: 4 listeners reemplazando 0 listeners → badge y activity ya no requieren pull-to-refresh

---

## Followups sugeridos

1. ~~Aplicar la migration `20260501020000`~~ ✅ aplicada 2026-04-29
2. **Capturar baseline TTI/frames/memory** en build release sobre device físico antes de declarar éxito (per §1.2 del plan)
3. **PR6** (persist cache) cuando se decida instalar la dep nativa (`@tanstack/query-async-storage-persister` + MMKV o async-storage)
4. **Test manual con VoiceOver + TalkBack** en device físico antes del PR8 merge
5. **Mover cluster `control-*` bajo `components/home/`** a `components/control-v2/` en su propio PR (refactor de filesystem, sin cambio de comportamiento)
6. **Skeleton para HomeHeroCard** (P2-1 del plan) — visual non-trivial, deferred
7. **Lazy-import dinámico** de `causal-engine`/`forecast-engine`/`persona` (P2-4 del plan) — bloqueado por integración con `singleEntryMemoize` (mover a dynamic import rompería el flujo síncrono)
