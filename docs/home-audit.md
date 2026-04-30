# 🏠 Home — Auditoría completa

> Snapshot técnico del Home tab del 2026-04-29. Cubre: árbol de componentes, capa de datos (queries, mutations, tablas, crons), capa visual (animaciones, theme, accesibilidad), y performance crítico.
>
> Cada sección referencia `file:line` exactos. Las recomendaciones al final están priorizadas P0/P1/P2 por impacto.

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Árbol de componentes](#2-árbol-de-componentes)
3. [Capa de datos](#3-capa-de-datos)
4. [Capa visual + animación](#4-capa-visual--animación)
5. [Accesibilidad](#5-accesibilidad)
6. [Performance — costos medidos](#6-performance--costos-medidos)
7. [Edge cases y resiliencia](#7-edge-cases-y-resiliencia)
8. [Cron y dependencias server-side](#8-cron-y-dependencias-server-side)
9. [Componentes muertos / huérfanos](#9-componentes-muertos--huérfanos)
10. [Recomendaciones priorizadas](#10-recomendaciones-priorizadas)

---

## 1. Resumen ejecutivo

**Lo que es Home hoy**: tab principal de la app, entry point al ciclo financiero del usuario. Renderiza ~45–55 componentes simultáneos cuando está completamente hidratado.

**Arquitectura de datos**: gira alrededor del RPC `home_snapshot()` que en una sola round-trip seedea ~12 query caches (profile, family, expenses, fixed_expenses, categories, notifications, savings goal, etc.). Esto es **fuerte** — todos los hooks downstream montan con data caliente.

**Capa visual**: identidad emerald saturada con hero card en gradiente forest-green (fija light/dark), surface sobre canvas warm cream. ~33 animation loops simultáneos en steady-state — el principal driver de costo es `ParticleField` (22 partículas independientes). Reduced-motion + freezeOnBlur correctamente respetados.

**3 problemas críticos** identificados:

1. **`useControlV2Data` se llama 3 veces por render** (HomeScreen, HomeDashboard, tab-bar advisor badge), con 5 `useMemo` heavy cada vez. ~10–15 ejecuciones redundantes por render.
2. **`today` está congelado al mount** — `const [today] = useState(() => new Date())` significa que si el usuario deja la app abierta cruzando medianoche, todas las proyecciones financieras quedan stale. Es un bug funcional disfrazado de optimización.
3. **Callbacks no memoizados** propagados como props (especialmente `confirmCycleStartingBalance`, `handleDeleteExpense`) causan cascadas de re-renders innecesarios.

**Estado de salud general**: bueno pero con headroom claro de ~30% en performance + algunas inconsistencias UI/UX que cierran el polish.

---

## 2. Árbol de componentes

Entry: [`app/(app)/(tabs)/home.tsx`](app/(app)/(tabs)/home.tsx)

```
HomeRoute
└── RequireAuth → HomeScreen [mobile/screens/home/home-screen.tsx]
    ├── Screen (ScrollView wrapper, pull-to-refresh)
    ├── AmbientBackdrop variant="home" [light-only, conditional]
    └── HomeDashboard [mobile/components/home/home-dashboard.tsx]
        ├── AmbientBlobs (3 floating blobs animados)
        ├── HomeHeader
        │   ├── GreetingHeader (FloatView en icon time-of-day)
        │   ├── HomeAssistantButton (badge count cuando hay signals)
        │   ├── HomeCircleButton "Bell" → /notifications
        │   └── HomeCircleButton "Sliders" → /settings
        ├── FamilyStrip (avatares + PaydayPillV2)
        ├── HomeHeroCard
        │   ├── LinearGradient shell + HeroAurora (Skia o fallback)
        │   ├── ShineOverlay (sweep diagonal)
        │   ├── Setup state OR Normal state (CountUpText 42px)
        │   └── 2 tiles (cupo diario + projected close)
        ├── MonthSummaryCard (Variables / Fijos panels)
        ├── MetaCard [conditional — solo si savings goal activa]
        ├── Activity header + HomeActivitySection
        │   └── 6× SwipeableRow → ActivityRowV2
        └── 2× CycleBalancePromptSheet [siempre montados, problema]
```

**Componentes mounted simultáneamente**: ~45–55. Conditional renders correctamente gateados: `MetaCard`, `WarningChip` del hero, `AdjustedChip`, badge dot del bell, asistente badge.

---

## 3. Capa de datos

### 3.1 Hooks que consume

| Hook | Query Key | File:Line | Returns | staleTime | Seeded por snapshot |
|---|---|---|---|---|---|
| `useHomeSnapshot` | `['home-snapshot', userId]` | `use-home-snapshot.ts:262` | `HomeSnapshotPayload` (12 caches) | 30s | — (raíz) |
| `useMyProfile` | `['profile', userId]` | `use-profile.ts:52` | `Profile` | 30s | ✅ |
| `useFamilyFinance` | `['family-finance', familyId]` | `use-family-finance.ts:23` | `FamilyFinance` | 30s | ✅ |
| `useFixedExpenses` | `['fixed-expenses', familyId]` | `use-fixed-expenses.ts:17` | `FixedExpense[]` | 30s | ✅ |
| `useExpenses` | `['expenses', familyId]` | `use-expenses.ts:30` | `Expense[]` | 30s | ✅ |
| `useRecentExpenses` | `['expenses-recent', familyId, 6]` | `use-expenses.ts:41` | `Expense[]` | 30s | ✅ |
| `useCategories(expense)` | `['categories', familyId, 'expense']` | `use-categories.ts:68` | `Category[]` | 30s | ✅ |
| `useCategories(fixed_expense)` | `['categories', familyId, 'fixed_expense']` | igual | `Category[]` | 30s | ✅ |
| `useUnreadNotificationsCount` | `['family-notifications', familyId, userId, 'unread-count']` | `use-notifications.ts:107` | `number` | 30s | ✅ |
| `useFamilyMembers` | `['family-members', familyId]` | `use-family-members.ts:22` | `FamilyMemberRow[]` | 60s | ✅ |
| `useSavingsGoal` | `['savings-goal', familyId]` | `use-savings-goal.ts:7` | `SavingsGoal \| null` | 60s | ✅ |
| `useFixedExpensePayments` | `['fixed-expense-payments', familyId, startIso, endIso]` | `use-fixed-expense-payments.ts:23` | `FixedExpensePayment[]` | 60s | ❌ — keys por cycle, no calendar |
| `useControlIntelligence` | `['control-intelligence', familyId]` | `use-control-v2-data.ts:253` | `{ summaries, limits, velocity }` | 2 min | ❌ |
| `useMonthlyExpenseComparison` | derivado puro | `use-monthly-expense-comparison.ts:37` | comparison | n/a | filtro client-side de 70d sobre cache |
| `useInteractionStats` | `['advisor-interaction-stats', userId]` | `use-interaction-stats.ts:26` | `InteractionStats` | 5 min | ❌ — solo en HomeDashboard si pasa userId |
| `useSignalBlocklist` | `['user-signal-blocklist', userId]` | `use-signal-blocklist.ts:29` | `Set<string>` | 5 min | ❌ |

**Hooks que NO seedea el snapshot** y por lo tanto fuerzan round-trip extra en cold start:
- `useFixedExpensePayments` (key mismatch — snapshot usa calendar month, hook usa pay-cycle ISO)
- `useControlIntelligence` (3 tablas: monthly_summaries + category_limits + velocity_snapshots)
- `useInteractionStats` + `useSignalBlocklist` (tablas advisor recientes)

**Round-trips efectivos en cold start: 4** (snapshot + 3 paralelos).

### 3.2 RPCs

| RPC | Argumentos | Llamada desde |
|---|---|---|
| `home_snapshot()` | (auth.uid implícito) | `use-home-snapshot.ts:270` — root del stack |
| `record_fixed_expense_payment(p_fixed_expense_id)` | uuid | `useMarkFixedExpensePaid` (no en Home directamente, pero invalida cache) |
| `add_savings_contribution(p_goal_id, p_amount)` | uuid + numeric | `MetaCard` quick-add pill |

### 3.3 Tablas Supabase leídas

| Tabla | Cuándo | Filtros típicos |
|---|---|---|
| `expenses` | siempre | `family_id=eq`, optional `category_id`, order `created_at DESC`, optional `LIMIT 6` |
| `fixed_expenses` | siempre | `family_id=eq`, order `status,next_due_on,created_at` |
| `fixed_expense_payments` | después de fixedExpenses warm | `fixed_expense_id IN (...)`, `paid_at` range |
| `family_finance` | siempre | `family_id=eq`, `.maybeSingle()` |
| `categories` | 2× (expense + fixed_expense) | `family_id=eq, scope=eq` |
| `notifications` | 2× (full list 40 + unread count) | `family_id=eq`, optional `user_id IS NULL OR =$2` |
| `family_members` + `profiles` | siempre (2-step) | `family_id=eq` luego `id IN ([userIds])` |
| `profiles` (mine) | siempre | `id=eq, .maybeSingle()` |
| `savings_goals` | siempre | `family_id=eq, is_active=true, LIMIT 1` |
| `monthly_summaries` | via control-intelligence | `family_id=eq, ORDER period_start DESC, LIMIT 6` |
| `category_limits` | via control-intelligence | `family_id=eq` |
| `velocity_snapshots` | via control-intelligence | `family_id=eq, ORDER snapshot_date DESC, LIMIT 1` |
| `advisor_interactions` | si userId | `user_id=eq, ORDER created_at DESC, LIMIT 2000` |
| `user_signal_blocklist` | si userId | `user_id=eq` |

### 3.4 Mutations originadas en Home

| Hook | Trigger UI | Tabla / RPC | Invalidation |
|---|---|---|---|
| `useUpsertFamilyFinance` | Confirm payday sheet | `family_finance` UPSERT | `['family-finance', familyId]` |
| `useDeleteExpense` | Swipe-delete activity row | `expenses` DELETE | `invalidateFamilyBudgetData` (expenses + recent + total + monthlySpent + streaks + opcional fixed-expenses + notifications) |
| `useAddSavingsContribution` | MetaCard "+" pill | RPC `add_savings_contribution` | `['savings-goal', familyId]` |

### 3.5 Realtime

**Solo `useFamilyNotificationsRealtime` está montado** — y **no en Home**, sino en `notifications-screen.tsx:38`. Esto significa que el badge de unread del Home no refresca por push real-time; solo por mutations o pull-to-refresh.

### 3.6 Cross-screen cache sharing

| Query Key | Home | Control | Gastos | Fijos |
|---|---|---|---|---|
| `['expenses', familyId]` | ✓ | ✓ | ✓ | ✓ |
| `['fixed-expenses', familyId]` | ✓ | ✓ | — | ✓ |
| `['family-finance', familyId]` | ✓ | ✓ | — | — |
| `['categories', familyId, 'expense']` | ✓ | ✓ | ✓ | — |
| `['savings-goal', familyId]` | ✓ | ✓ | — | — |
| `['family-notifications', familyId, ...]` | ✓ | ✓ | — | — |

**El snapshot pattern es la fortaleza arquitectónica más grande del Home** — un cold-start abre todas las pestañas con caches calientes.

---

## 4. Capa visual + animación

### 4.1 Surfaces principales

- **HomeHeroCard**: gradiente dark forest green (fijo light/dark), HeroAurora (Skia 3 círculos blureados + 22 partículas o fallback estático), ShineOverlay diagonal, CountUpText 42px/800w para el monto disponible. 2 estados: setup (sin ingreso) y normal.
- **MonthSummaryCard**: 2 paneles tinted (peach Variables / green Fijos) con trend pill y status pill. Pressables — navegan a Gastos/Fijos.
- **MetaCard** (conditional): gradient progress bar (mint→peach) animado, FloatView en emoji, BreatheDot, ShineOverlay sobre la barra, quick-add pill abre `QuickAddSavingsSheet`.
- **HomeActivitySection**: hasta 6 `ActivityRowV2` con SwipeableRow (right action: "Eliminar"). Estados: loading skeleton / empty CTA / populated.
- **2× CycleBalancePromptSheet**: variants `OnboardingAvailableSheet` (mint chip) y `SalaryConfirmationSheet` (peach chip). Auto-open con delay 650ms post-mount cuando aplica.

### 4.2 Inventario completo de animaciones

| Componente | File:Line | Animación | Mecanismo | Período | Reduced-motion |
|---|---|---|---|---|---|
| RiseView | `rise-view.tsx:14` | translateY 14→0 + opacity | `withTiming + withDelay` | 700ms | skip a final |
| SlideInView | `slide-in-view.tsx:14` | translateX -10→0 + opacity | `withTiming + withDelay` | 600ms | skip a final |
| CountUpText | `count-up-text.tsx:26` | tween numérico | `useAnimatedReaction` | 1600ms | jump al final |
| FloatView | `float-view.tsx:13` | translateY oscila | `withRepeat(withSequence)` | 5000ms total | no-op |
| ShineOverlay | `shine-overlay.tsx:15` | translateX sweep | `withRepeat + withDelay` | 3200–4200ms | cancel via `useLoopAnimation` |
| BreatheDot | `breathe-dot.tsx:13` | scale 1↔1.08 | `withRepeat(withSequence)` | 1800ms total | cancel |
| AmbientBlobs (×3) | `ambient-blobs.tsx:9` | translateY 0↔-10 | `withRepeat` | 9/11/13s | cancel on blur |
| HeroAurora circles (×3) | `hero-aurora.tsx:31` | shared values driving cx/cy/r | `withRepeat` Skia | 4.5/5.5/6.5s | cancel |
| ParticleField (×22) | `hero-aurora.tsx:212` | translateX/Y + opacity por partícula | `withRepeat + withDelay` cada una | 4.2–9s | cancel |
| Hero warning chip pulse | `home-hero-card.tsx:60` | scale 1↔1.04 | `withRepeat(withSequence(withTiming))` | 1800ms total | parks scale=1 |
| MetaCard progress bar | `meta-card.tsx:83` | scaleX 0→pct/100 | `withTiming + withDelay(500)` | 1300ms | jump |
| FloatView en goal emoji | `meta-card.tsx:188` | translateY oscila | `withRepeat` | 3000ms total | cancel |
| FloatView en greeting icon | `greeting-header.tsx:21` | translateY oscila | `withRepeat` | 5000ms total | cancel |
| ActivityRowV2 entrance | `activity-row-v2.tsx:21` | SlideInView staggered | `withTiming + withDelay` | 600ms+i×60 | skip |

**Total loops infinitos en steady-state: 33–34.** El principal contribuyente es `ParticleField` con 22 instancias independientes.

**Sin animaciones de layout** (todo `transform`/`opacity`). **Sin Intl/Date formatting en worklets** — `CountUpText` correctamente usa `runOnJS` (memory note respetada).

### 4.3 Theme + tokens

- Light canvas: `#F4F2ED` warm off-white. Dark: `#0A1A12`.
- **Hero gradient brand-fixed**: dark forest green ramp en ambos modos.
- `heroAccent` mint `#C7EE9C` fijo. `peach` para warnings/peach-band.
- AmbientBackdrop solo en light. AmbientBlobs en ambos.
- Spacing 8px gaps, radii 24/16/14/pill=999.
- **Inconsistencia tipográfica**: el preset `theme.typography` existe pero los componentes Home usan magic numbers (42px hero, 34px greeting, 22px tiles).

---

## 5. Accesibilidad

**Bien cubierto**: HomeAssistantButton (label dinámico con count), HomeCircleButton, PaydayPillV2 (button vs text según interactividad), Setup CTA hero, MetaCard (label compuesto con pct + remaining), MonthSummaryCard panels, SwipeableRow (hint para deslizar), "Ver todos" link.

**Gaps**:

- `GreetingHeader` greeting text — sin `accessibilityRole`
- `FamilyStrip` cluster de avatares — sin label de grupo
- `HomeHeroCard` container — sin role; los hijos tienen labels pero la card como unidad no se anuncia
- Dynamic type sin cap: `42px` hero + `34px` greeting pueden overflow en accessibility larger text. Falta `maxFontSizeMultiplier` en componentes principales

---

## 6. Performance — costos medidos

### 6.1 Top 10 componentes por costo

| # | Componente | LOC | Por qué pesa |
|---|---|---|---|
| 1 | `HeroAurora` | 264 | 3 Skia loops + 22 Particles cada una con su shared value + worklet |
| 2 | `HomeHeroCard` | 476 | 7 RiseViews, 2 BreatheDots, 1 ShineOverlay, 1 CountUpText, 1 scale-pulse |
| 3 | `QuickAddSavingsSheet` | 467 | gesture worklet siempre montado dentro de MetaCard |
| 4 | `MetaCard` | 380 | ShineOverlay + FloatView + BreatheDot + CountUpText + progress bar |
| 5 | `HomeDashboard` | 334 | 3 hook calls heavy + 2 useEffects + 3 useMemos |
| 6 | `AmbientBlobs` | 44 | 3 loops withRepeat permanentes |
| 7 | `useControlV2Data` (hook) | 317 | 9 sub-hooks + 5 useMemo passes (causal + forecast + signals + view + data) |
| 8 | `useHomeMetrics` (hook) | 418 | 5 sub-hooks + 2 useMemo passes |
| 9 | `CycleBalancePromptSheet` | 357 | siempre montado a pesar de `visible` prop |
| 10 | `HomeActivitySection` | 118 | 6× SwipeableRow + ActivityRowV2 + RiseView entrances, no virtualizado |

### 6.2 Memoización — coverage

**Bien memoizado**: `categoryNameById`, `recentExpenses`, snapshot derivation en `useFamilyDashboard`, todo el árbol interno de `useControlV2Data`, outer memo de `useHomeMetrics`.

**NO memoizado y debería estar**:

1. **`confirmCycleStartingBalance`** (`home-screen.tsx:102`) — pasa como prop, está en deps de `useEffect` en `home-dashboard.tsx:152` → re-subscribe cada render
2. **`handleDeleteExpense`** (`home-screen.tsx:144`) — pasa a HomeActivitySection
3. **6 callbacks de HomeDashboard** (`handleChipConfirm`, `handleCycleSheetClose/Save/KeepDefault`, `handleAddExpense`, `handleViewGastos/Fijos`) — todos arrow functions inline pasados como props
4. **`onRetry`** inline en `home-dashboard.tsx:288`
5. **`AmbientBackdrop` y `AmbientBlobs`** sin `React.memo` — re-renderean con cada cambio de HomeDashboard
6. **`variablesTone` y `fijosTone`** en MonthSummaryCard — 8 ternaries inline cada render

### 6.3 React Query settings

| Setting | Valor | Evaluación |
|---|---|---|
| Global staleTime | 30s | Apretado para data inmutable (categorías, fijos, savings goal) |
| `refetchOnWindowFocus` | false | ✓ correcto en RN |
| `refetchOnMount` | default true | **Problema**: cada sub-hook fires background refetch en cada mount si staleTime expiró |
| `gcTime` | default 5 min | OK |
| `select:` narrowing | **ninguno** | ❌ todos los components subscribe a la respuesta full |

**Crítico**: `useControlV2Data` se invoca **3 veces por render** del Home tree — 5 useMemo passes c/u = 15 ejecuciones redundantes/render.

### 6.4 Lista de partículas (HeroAurora)

`PARTICLE_COUNT = 22` — 22 nodos Reanimated con shared value + worklet + AnimatedView. **Mayor contribuyente al frame budget.** Reemplazables por una sola Skia canvas pintando todas en una draw call.

### 6.5 Cold-start path

1. AppStackShell monta → `home_snapshot()` RPC → blocking `BlockingScreenView` ("Preparando tu espacio…")
2. Snapshot resuelve → `seedCaches` populá ~15 entries sincrónicamente
3. HomeScreen + HomeDashboard montan → 3 round-trips paralelos extra (control-intelligence + monthly comparison + fixed-expense-payments por cycle)
4. RiseView staggered animations 60–300ms
5. CountUpText cuenta hasta el monto disponible (1600ms)
6. 22 ParticleField inician loops

**No hay skeleton del HomeHeroCard** — durante snapshot loading el usuario ve `BlockingScreenView`, pero si snapshot devuelve y los 3 round-trips siguientes están pendientes, el hero muestra `$0 disponible` brevemente.

### 6.6 Hazards de subscripción / leaks

- `useAdvisorBadge` en tab bar invoca `useControlV2Data` por **3ª vez** (HomeScreen + HomeDashboard + tab bar). React Query deduplica fetches pero NO cómputos.
- `today` congelado al mount (`home-dashboard.tsx:82`). Cruzar medianoche con app abierta → todas las proyecciones stale hasta full remount. **Bug funcional.**
- `freezeOnBlur: false` en `<Tabs>` correctamente seteado para que swipe-to-delete funcione.

---

## 7. Edge cases y resiliencia

| Escenario | Comportamiento |
|---|---|
| No autenticado | `RequireAuth` redirect a `/(auth)/welcome` |
| No onboarded | redirect a `/(app)/onboarding` |
| No family | redirect a `/(auth)/join`; snapshot null slices |
| `monthlyIncome === 0` | hero card muestra setup CTA en vez de figures; `useControlV2Data.usingMock = true` |
| Sin expenses | activity empty CTA; mock control data |
| `home_snapshot` loading | `BlockingScreenView` full-screen wall |
| `home_snapshot` error | shell desbloquea; ErrorState con retry |
| `useFixedExpensePayments` empty | `fijosSummary = null`, no alerts |
| Day 1-3 cycle (poca data) | hero esconde "vas a cerrar con" (countdown "en N días"); causal/forecast bajo confidence floor |
| Todas las signals dismissed (Asistente) | badge count = 0, button no muestra peach badge |
| Reduced motion | `useLoopAnimation` cancela todos los loops; `RiseView/SlideInView/FloatView/CountUpText` skip al final |

---

## 8. Cron y dependencias server-side

| Cron | Schedule UTC | Produce | Consumido por Home |
|---|---|---|---|
| `cron_compute_velocity_snapshots` | `0 4 * * *` (01:00 AR) | `velocity_snapshots` | useControlIntelligence |
| `cron_detect_zombies` | `15 4 * * *` (post-migration P3-B) | `notifications kind=zombie_alert` | useFamilyNotifications |
| `cron_detect_price_hikes` | `30 4 * * *` | `notifications kind=price_hike` | useFamilyNotifications + alerts del Hero |
| `cron_close_previous_cycles` | mensual | `monthly_summaries` | useControlIntelligence |
| Notification crons (morning/midday/streak/evening/fixed-upcoming/weekly-insights) | varios | `notifications` rows | unread badge + feed |
| `cycle_close_notification` trigger | on INSERT/UPDATE monthly_summaries | `notifications kind=cycle_closed` | feed |
| `cron_prune_advisor_interactions` | `0 5 1 * *` mensual | prune | sin impacto Home |

---

## 9. Componentes muertos / huérfanos

Detectados en `mobile/components/home/` sin imports activos en el árbol de Home actual:

- **`alerts-strip.tsx`** — `AlertsStrip` definido, 0 consumers
- **`shortcut-card.tsx`** — `ShortcutCard` definido, 0 consumers
- **`home-advisor-strip.tsx`** — `HomeAdvisorStrip` definido, 0 consumers (los signals salen via `HomeAssistantButton` ahora)
- **Cluster `control-*`** bajo `home/` (control-hero-card, control-forecast-strip, control-history-ribbon, control-months-section, control-plan-section, control-mood-orb, control-pressure-meter, control-signal-tile, control-visuals) — pertenecen al tab Control pero su ubicación física bajo `home/` confunde

**Acción sugerida**: mover los `control-*` a `mobile/components/control-v2/` y borrar los 3 huérfanos genuinos (alerts-strip, shortcut-card, home-advisor-strip).

---

## 10. Recomendaciones priorizadas

### P0 — Fix inmediato (correctness + perf alto impacto)

| # | Item | File:Line | Por qué |
|---|---|---|---|
| **P0-1** | Consolidar las 3 invocaciones de `useControlV2Data` en una sola | `home-screen.tsx:64`, `home-dashboard.tsx:104`, `app-tabs.tsx:30` | 5 useMemo heavy × 3 invocaciones = ~15 ejecuciones redundantes/render. Levantar el hook a HomeScreen, pasar `{ signals, view, data, forecast }` como props |
| **P0-2** | Wrap `confirmCycleStartingBalance` y `handleDeleteExpense` en `useCallback` | `home-screen.tsx:102, 144` | Inestabilidad de identidad causa cascada de re-renders y re-subscribe del useEffect en `home-dashboard.tsx:152` |
| **P0-3** | Fix el `today` congelado | `home-dashboard.tsx:82` | `useState(() => new Date())` no se actualiza nunca. Cruzar medianoche con app abierta = proyecciones stale. **Bug funcional.** Usar hook que re-evalúa al midnight o on app foreground |

### P1 — Alta prioridad (render budget)

| # | Item | File:Line | Por qué |
|---|---|---|---|
| **P1-1** | Reducir `ParticleField` de 22 a 8 partículas (o reemplazar por 1 Skia canvas) | `hero-aurora.tsx:172` | 22 nodos Reanimated independientes, partículas casi imperceptibles sobre el aurora blur |
| **P1-2** | Lazy-mount ambas variants de `CycleBalancePromptSheet` detrás de `isCycleBalanceSheetOpen` | `home-dashboard.tsx:296-318` | 357 LOC siempre montados aunque el sheet esté cerrado |
| **P1-3** | Wrap los 6 callbacks de HomeDashboard en `useCallback` | `home-dashboard.tsx:187-229` | `handleChipConfirm`, `handleCycleSheetClose/Save/KeepDefault`, `handleAddExpense`, `handleViewGastos/Fijos` |
| **P1-4** | Add `select:` narrowing a `useUnreadNotificationsCount` | `home-screen.tsx:58` | Solo necesita boolean `> 0` — hoy re-renderea por cada cambio numérico (3→5 unread no debe re-renderear el header) |
| **P1-5** | Bumpear staleTime para data inmutable | varios | Categorías, fixed-expenses, family-members, savings-goal: `5 * 60_000` en lugar del global 30s |

### P2 — Medium (UX + bundle)

| # | Item | File:Line | Por qué |
|---|---|---|---|
| **P2-1** | Skeleton para HomeHeroCard | `home-hero-card.tsx` | Hoy muestra `$0 disponible` durante el gap entre snapshot resolve y data hidratada. Shimmer placeholder evita flash zero |
| **P2-2** | Memoizar `variablesTone`/`fijosTone` en MonthSummaryCard | `month-summary-card.tsx:40-79` | 8 ternaries inline allocan objetos nuevos cada render |
| **P2-3** | `React.memo` en AmbientBackdrop y AmbientBlobs | `ambient-backdrop.tsx`, `ambient-blobs.tsx` | Re-renderean con cada cambio de HomeDashboard sin necesidad |
| **P2-4** | Mover `useControlIntelligence` al `home_snapshot` RPC | `use-control-v2-data.ts:238-255` | Elimina round-trip #2 en cold start (3 tablas: summaries + limits + velocity) |
| **P2-5** | Lazy-import `causal-engine` / `forecast-engine` / `persona` | `use-control-v2-data.ts:41-45` | New users (`usingMock=true`) cargan estos módulos sin necesitarlos |
| **P2-6** | Mover componentes muertos | `mobile/components/home/` | `alerts-strip`, `shortcut-card`, `home-advisor-strip` → borrar; cluster `control-*` → mover a `control-v2/` |
| **P2-7** | MetaCard CTA cuando no hay savings goal | `home-dashboard.tsx` (donde se condiciona MetaCard) | Hoy si no hay goal, slot desaparece. Una "Crear tu primera meta" closes el gap de onboarding |
| **P2-8** | Add `accessibilityRole` container en HomeHeroCard | `home-hero-card.tsx` | Screen readers leen elementos individuales pero no anuncian la card como summary unit |
| **P2-9** | `maxFontSizeMultiplier` cap en hero (42px) y greeting (34px) | `home-hero-card.tsx`, `greeting-header.tsx` | Dynamic type 2× puede overflow la card |
| **P2-10** | Realtime channel en Home tab | nuevo: dentro de HomeScreen | Hoy el badge de unread no actualiza por push real-time, solo por mutation o pull-to-refresh |

---

## Apéndice — métricas de impacto estimado

Si se aplican P0 + P1:

- **JS thread**: ~30% menos cómputo por render (consolidación de useControlV2Data + memoización de callbacks)
- **UI thread**: 14 nodos Reanimated menos (reducción de ParticleField a 8)
- **Memory**: ~720 LOC menos siempre montados (CycleBalancePromptSheet lazy)
- **Network**: 1 round-trip menos en cold start si se mueve control-intelligence al snapshot (P2-4)
- **Correctness**: el bug de `today` stale se cierra
- **Re-render rate**: estimado 3–5× reducción para mutaciones que invalidan unread count

Total esperado: Home más responsive durante interacción, cold-start ~150ms más rápido, y fix de un bug funcional silencioso.
