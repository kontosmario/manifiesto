# 06 · Settings y Sistemas de Engagement

> Verificado contra commit `7962ea2` · 2026-05-21 · parte del snapshot docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual

---

## 1. Visión general — mapa de Settings y Engagement

Settings es la única pantalla sin tab dedicado: se accede desde el ícono de ajustes en la home. Actúa como hub de configuración del hogar, perfil, preferencias y punto de entrada a todos los sistemas de engagement.

```
app/(app)/settings.tsx              → SettingsScreen (raíz)
  ├── /settings/family-admin        → FamilyAdminScreen
  ├── /settings/plan                → BillingScreen (MOCK)
  ├── /settings/notifications       → NotificationsPreferencesScreen
  ├── /settings/asistente           → AsistentePreferencesScreen
  ├── /settings/achievements        → AchievementsGalleryScreen
  ├── /settings/editions            → EditionsScreen
  ├── /settings/dev-health          → DevHealthScreen (__DEV__)
  └── /settings/dev/                → 2 dev preview routes (__DEV__) — ver nota abajo ²

app/(app)/savings-goal.tsx          → SavingsGoalScreen (desde "Meta activa" row)
```

**Sistemas de engagement activos (✅ LIVE en producción):**

| Sistema | Trigger | Superficie |
|---|---|---|
| Achievements / Logros | Server-side (triggers SQL) | Realtime → AchievementUnlockBridge → modal + galería |
| Manifiesto Wrapped | Post-cobro / Ediciones tap | CycleWrappedBridge → CycleWrappedModal (5 escenas) |
| Ediciones | `monthly_summaries` via Supabase | EditionsScreen → archivo navegable |
| Tours / Walkthroughs | Primera visita por tab | TourProvider / TourHost overlay; estado "visto" en backend (`profiles._tour_seen_at`, 2026-05-27) |
| Subscriptions-zombie | Detección en gastos fijos | ZombieFeedSection en Asistente + Control |
| Telemetría | Mount/unmount de pantallas | `home_telemetry` tabla vía RPC |

**Sistemas declarados pero SIN implementación real:**

| Sistema | Estado |
|---|---|
| Billing / Suscripción | ⏸️ MOCK — `useBilling` simula 600ms + estado local; sin RevenueCat/IAP |
| Racha / Streaks | ✅ LIVE (ver achievements streak_*); la pantalla de preview existe como dev tool |

---

## 2. Settings raíz — secciones y rows

**Archivo:** [`mobile/screens/settings/settings-screen.tsx`](../../../mobile/screens/settings/settings-screen.tsx)  
**Ruta:** `app/(app)/settings.tsx`

La pantalla usa `Screen` + scroll nativo. `RiseViewGate` suprime las 19 animaciones de entrada durante el push del navigation stack (~340ms) para evitar sobrecarga.

### Hero card

Muestra: nombre visible del usuario, conteo de miembros del hogar (singular / plural), pill "Sos el dueño" (si `role === 'owner'`), o aviso de miembro con hint de permisos.

### Secciones (en orden de renderizado)

| # | Grupo | Rows | Nota |
|---|---|---|---|
| 1 | **Perfil** | Nombre visible, Avatar, Email (read-only) | Sheets inline: `EditDisplayNameSheet`, `EditAvatarSheet` |
| 2 | **Hogar** | Mi aporte mensual, Día de cobro, Cotización USD, Meta de ahorro %, Buffer diario | Sheets: `EditMyContributionSheet`, `EditPaydaySheet`, `EditUsdRateSheet`, `EditSavingsPercentSheet`, `EditBufferSheet`. Rows deshabilitados para `role !== 'owner'` con hint "Solo el dueño puede editar" |
| 3 | **Metas de ahorro** | Meta activa (subtitle con emoji + progreso) | Navega a `/savings-goal`; disabled para miembro |
| 4 | **Familia** | Invitar a alguien, Gestionar miembros (solo owner), Salir / Eliminar hogar | "Invitar" genera código efímero vía `ShareInviteSheet`. "Gestionar" navega a `/settings/family-admin`. La fila destructiva adapta label y helper según `isOwnerDestroyFlow` |
| 4b | **Asistente** | Preferencias del asistente, Reactivar visitas guiadas | "Reactivar" llama `useResetTourSeen().resetAll()` (RPC backend) + `resetAllTours()` (toggle local) + `Alert` confirmación |
| 5 | **Notificaciones** | Gestionar notificaciones, Habilitar push | Push muestra "Dev build" si `!supportsRemotePushNotifications` (Expo Go SDK 53+). Valor: "Activo" / "Activar" |
| 5b | **Ayuda · Tutoriales** | "Ver tutorial de Inicio/Gastos/Fijos/Control" (x4) + "Volver a ver todos" | Ver detalle abajo |
| 6 | **Apariencia** | `SegmentedControl` Sistema / Claro / Oscuro | Persiste en `ThemeProvider` |
| 6b | **Animaciones** | `SegmentedControl` Reducir / Auto / Todas | `MotionPreference`: `always` / `auto` / `never` |
| 6c | **Acceso rápido** | Toggle biometría (Face ID / Fingerprint) | Lee/escribe refresh token en SecureStore via `biometric-auth.ts`. Disabled si el dispositivo no tiene biometría enrollada |
| 7 | **Desarrollo** (__DEV__) | 8 rows de dev tools | Ver sección 10 |
| 7b | **Filtro demo** (__DEV__ + assistantDemoMode) | `SegmentedControl` Todas / Read-only / Routing / Acción | Solo visible cuando el modo demo está encendido |
| 8a | **Tu progreso** | Logros ("Ver galería"), Ediciones ("Ver archivo") | Navega a `/settings/achievements` y `/settings/editions` |
| 8b | **Tu plan** | Plan del hogar ("Ver planes") | Navega a `/settings/plan` (billing MOCK) |
| 9 | **Ayuda y legal** | Contactar soporte (mailto), Política de privacidad, Términos de uso | `buildSupportMailto` incluye version + build + userId en el subject |
| 10 | **Cuenta** | Cerrar sesión, Eliminar cuenta | "Eliminar cuenta" → `DeleteAccountConfirmSheet` → RPC marca cuenta para borrar en 30 días → logout automático |

**Ayuda · Tutoriales** — nuevo grupo en Settings (entre Notificaciones y Apariencia) con 5 rows:
- "Ver tutorial de Inicio/Gastos/Fijos/Control" — cada uno llama `useResetTourSeen().resetOne(key)` (RPC `reset_tour_seen` + optimistic update del profile cache) y navega al tab correspondiente. El auto-fire del hook re-dispara el tour. **Cross-device:** el reset persiste en backend, así que también re-dispara en otros devices del mismo user.
- "Volver a ver todos los tutoriales" — llama `useResetTourSeen().resetAll()` (RPC `reset_all_tours_seen`) + `resetAllTours()` (limpia `tours-disabled` device-local). No navega (silent reset; el próximo focus a cada screen dispara).
No requiere migración ni cambio de schema. Convive con la entry "Reactivar visitas guiadas" del grupo Asistente (UX distinta: esa muestra `Alert.alert` de confirmación, la nueva es silent).

**Footer:** `Manifiesto X.Y.Z (build N)` — versión real via `expo-constants` + `expo-application`.

### Sheets montados en settings-screen

| Sheet | Trigger | Función |
|---|---|---|
| `ShareInviteSheet` | "Invitar a alguien" | Genera código efímero de 8 chars vía server, 10/min rate limit, 7 días validez |
| `EditDisplayNameSheet` | Row "Nombre visible" | Input libre, 1 campo, mutar `profiles.display_name` |
| `EditAvatarSheet` | Row "Avatar" | Grid de avatares-animal, mutar `profiles.avatar_animal` |
| `EditMyContributionSheet` | Row "Mi aporte mensual" | Input numérico, mutar `family_members.monthly_income_contribution` |
| `EditPaydaySheet` | Row "Día de cobro" | Picker 1-31, mutar `family_finance.salary_payment_day` |
| `EditUsdRateSheet` | Row "Cotización USD" | Input numérico, mutar `family_finance.usd_exchange_rate` |
| `EditSavingsPercentSheet` | Row "Meta de ahorro %" | Slider 0-50, mutar `family_finance.savings_goal_percent` |
| `EditBufferSheet` | Row "Buffer diario" | Selector modo (none/fixed/percent) + valor numérico |
| `DestroyFamilyConfirmSheet` | "Eliminar el hogar" (owner con miembros) | Requiere frase de confirmación escrita; RPC `leave_family` |
| `DeleteAccountConfirmSheet` | "Eliminar cuenta" | Confirma borrado en 30 días; advierte si hay miembros |

---

## 3. Sub-pantallas

### 3.1 Family Admin

**Archivo:** [`mobile/screens/settings/family-admin-screen.tsx`](../../../mobile/screens/settings/family-admin-screen.tsx)  
**Ruta:** `app/(app)/settings/family-admin.tsx`  
**Estado:** ✅ LIVE

`FlatList` de miembros con `FamilyMemberStats` (userId, displayName, avatarAnimal, role, monthlyIncomeContribution, totalExpenses, lastActiveAt, joinedAt, blockedAt).

Cada fila muestra: avatar animal, nombre, "Miembro desde {mes año}", actividad relativa ("Hace X días"), aporte mensual, total gastos, badge de rol. Tap en fila (ActionSheet iOS / Alert Android) ofrece según el rol del target:
- **member** → Transferir propiedad, Bloquear, Eliminar
- **blocked** → Desbloquear, Eliminar

Mutations via RPCs: `family_transfer_ownership`, `family_block_member`, `family_unblock_member`, `family_remove_member`.

**Hooks:** `useFamilyMemberStats`, `useTransferOwnership`, `useBlockMember`, `useUnblockMember`, `useRemoveMember` (todos en [`mobile/features/family/use-family-admin.ts`](../../../mobile/features/family/use-family-admin.ts)).

### 3.2 Billing / Plan del hogar

**Archivo:** [`mobile/screens/settings/billing-screen.tsx`](../../../mobile/screens/settings/billing-screen.tsx)  
**Ruta:** `app/(app)/settings/plan.tsx`  
**Estado:** ⏸️ EN PAUSA — **100% MOCK**

Ver sección 9 para detalle completo.

### 3.3 Notifications Preferences

**Archivo:** [`mobile/screens/settings/notifications-preferences-screen.tsx`](../../../mobile/screens/settings/notifications-preferences-screen.tsx)  
**Ruta:** `app/(app)/settings/notifications.tsx`  
**Estado:** ✅ LIVE

Controles:
- **Canales**: push on/off, in-app on/off
- **Grupos de notificación**: switches por grupo (gastos, fijos, racha, meta, otros) via `kinds_muted[]`
- **Check-in horario**: 3 slots (Mañana / Mediodía / Noche), cada uno con hora configurable via picker inline. Defaults: 9, 14, 20.
- **Nudges habilitados**: toggle general

Data layer: tabla `notification_preferences`, upsert con `onConflict: 'user_id'`. Optimistic update via `onMutate`. Tolerante a tabla ausente (retorna defaults si `42P01` / `PGRST205`).

**Tipos:** `NotificationPreferences` — channelPush, channelInapp, kindsMuted, checkinMorningHour, checkinMiddayHour, checkinEveningHour, nudgesEnabled.

### 3.4 Asistente Preferences

**Archivo:** [`mobile/screens/settings/asistente-preferences-screen.tsx`](../../../mobile/screens/settings/asistente-preferences-screen.tsx)  
**Ruta:** `app/(app)/settings/asistente.tsx`  
**Estado:** 🟡 PARCIAL

Tres secciones:
1. **Persona inferred** (planner / firefighter / avoider / optimizer): inferida de `advisor_interactions`, mostrada como read-only. Override write-path pendiente (no hay `user_advisor_prefs` table aún).
2. **Familias bloqueadas**: lista de `user_signal_blocklist` rows, una por familia de señal, con botón "Desbloquear" cada una. 26 `family labels` mapeados en español (velocity, recovery-hard, zombie, savings-milestone, etc.).
3. **Borrar historial**: hard delete de `advisor_interactions` propias vía RLS (`delete_own` policy). Alert de confirmación.

### 3.5 Savings Goal

**Archivo:** [`mobile/screens/settings/savings-goal-screen.tsx`](../../../mobile/screens/settings/savings-goal-screen.tsx)  
**Ruta:** `app/(app)/savings-goal.tsx`  
**Estado:** ✅ LIVE

Editor de la meta activa de ahorro familiar. Campos: título (max 40 chars), emoji (default 🎯), monto objetivo, monto actual, meses objetivo (opcional), activa/inactiva toggle.

Valida con `validateSavingsGoalInput` antes de mutar. Muestra `SavingsAdvisorStrip` contextual usando señales del Asistente (desde `useControlV2Data`). Al guardar llama `useUpsertSavingsGoal` y hace `router.back()`.

La pantalla solo es accesible al **owner** (disabled en settings-screen para miembros). Integración con achievements: goal_25 / goal_50 / goal_75 / goal_completed se disparan server-side via trigger al actualizar `savings_goals`.

**Milestones:** 25% → `goal_25` (bronze), 50% → `goal_50` (silver), 75% → `goal_75` (gold), 100% → `goal_completed` (gold).

### 3.6 Achievements Gallery

**Archivo:** [`mobile/screens/settings/achievements-gallery-screen.tsx`](../../../mobile/screens/settings/achievements-gallery-screen.tsx)  
**Ruta:** `app/(app)/settings/achievements.tsx`  
**Estado:** ✅ LIVE — Ver sección 4 para detalle end-to-end.

### 3.7 Editions

**Archivo:** [`mobile/screens/settings/editions-screen.tsx`](../../../mobile/screens/settings/editions-screen.tsx)  
**Ruta:** `app/(app)/settings/editions.tsx`  
**Estado:** ✅ LIVE — Ver sección 6 para detalle end-to-end.

### 3.8 Dev Health

**Archivo:** [`mobile/screens/dev-health-screen.tsx`](../../../mobile/screens/dev-health-screen.tsx)  
**Ruta:** `app/(app)/settings/dev-health.tsx`  
**Estado:** ✅ LIVE (__DEV__) — Ver sección 10.

---

## 4. Sistema de Achievements / Logros (end-to-end)

**Docs canónicos:** [`docs/achievements-system.md`](../../../docs/sistemas/achievements.md)  
**Estado:** ✅ LIVE desde 2026-05-12

### Catálogo — 14 codes activos

| Code | Tier | Trigger |
|---|---|---|
| `first_expense` | bronze | Al cargar el primer gasto |
| `first_fixed` | bronze | Al agregar el primer gasto fijo |
| `first_paid_fixed` | bronze | Al marcar como pagado el primer fijo |
| `first_goal` | bronze | Al crear la primera meta de ahorro |
| `streak_7` | bronze | Racha de 7 días |
| `streak_14` | silver | Racha de 14 días |
| `streak_30` | silver | Racha de 30 días |
| `streak_60` | gold | Racha de 60 días |
| `streak_90` | legendary | Racha de 90 días |
| `goal_25` | bronze | Meta de ahorro cruza el 25% |
| `goal_50` | silver | Meta cruza el 50% |
| `goal_75` | gold | Meta cruza el 75% |
| `goal_completed` | gold | `current_amount >= goal_amount` |
| `first_cycle_under_budget` | silver | Primer ciclo cerrado con `total_spent < monthly_income` |

### Arquitectura de detección (server-side)

7 triggers SQL (todos `AFTER INSERT/UPDATE`, `SECURITY DEFINER`, con `EXCEPTION WHEN OTHERS THEN RAISE NOTICE`):

| Tabla señal | Trigger | Achievement |
|---|---|---|
| `expenses` | `tr_award_first_expense` | first_expense |
| `fixed_expenses` | `tr_award_first_fixed` | first_fixed |
| `fixed_expense_payments` | `tr_award_first_paid_fixed` | first_paid_fixed |
| `user_streaks` (UPDATE) | `tr_award_streak_milestones` | streak_7/14/30/60/90 (solo al cruzar threshold) |
| `user_streaks` (INSERT) | `tr_award_streak_milestones_initial` | backfill defensivo |
| `savings_goals` | `tr_award_first_goal` | first_goal |
| `savings_goals` (INSERT/UPDATE) | `tr_award_goal_milestones` | goal_25/50/75/completed |
| `monthly_summaries` | `tr_award_first_cycle_under_budget` | first_cycle_under_budget |

Función central: `award_achievement(code, user_id, family_id, context)` — valida que el code exista y esté activo, inserta en `achievements_earned` con `ON CONFLICT (user_id, code) DO NOTHING` (idempotente). **Revoked de `authenticated` — solo `service_role` y triggers pueden invocarla.**

### Flow del cliente

```
DB trigger → INSERT achievements_earned
    │
    └── Supabase Realtime (canal achievements:user:{userId})
            │
            └── useAchievementUnlocks(userId, onUnlock)
                    │
                    ├── lookupCatalog (cache o fetch lazy)
                    ├── onUnlock(AchievementViewItem)   ← fires AchievementUnlockBridge
                    └── invalidateQueries(['achievements', 'earned', userId])
```

### AchievementUnlockBridge

**Archivo:** [`mobile/components/bridges/achievement-unlock-bridge.tsx`](../../../mobile/components/bridges/achievement-unlock-bridge.tsx)

Montado **una sola vez** en `AppStackShell`, **fuera del `<Stack>` de expo-router** — el modal sobrevive a screen pushes. Gestiona:
- Canal realtime `achievements:user:{userId}` (path de producción)
- `useAchievementPreviewListener` (path de dev preview via emitter singleton)

Si un unlock llega mientras otro modal está en pantalla, el más reciente gana (v1: no hay queue).

### AchievementUnlockModal

**Archivo:** [`mobile/components/achievements/achievement-unlock-modal.tsx`](../../../mobile/components/achievements/achievement-unlock-modal.tsx)

Modal full-screen con: `ConfettiBurst` (solo en earned), icono del logro, tier badge con colores, título, body, fecha de unlock. Tap fuera o botón X → dismiss → `setActive(null)`.

### AchievementsGalleryScreen (Settings → Tu progreso → Logros)

**Archivo:** [`mobile/screens/settings/achievements-gallery-screen.tsx`](../../../mobile/screens/settings/achievements-gallery-screen.tsx)

Usa `useAchievements(userId)` que mergea dos queries:
- `achievements_catalog` (staleTime 10min) — catálogo completo
- `achievements_earned` (staleTime 1min + realtime invalidation)

Layout:
- **Hero card**: gradient LinearGradient, `CountUpText` animado "X / Y logros", dots strip (un punto por code: relleno = earned con color de tier, vacío con `borderStyle: 'dashed'`), porcentaje en pill
- **Sección "Desbloqueados"**: cards con `usePressScale(0.97)`, tier ring de color (bronze/silver/gold/legendary), icon, title, body, `earned_at` formateado
- **Sección "Por desbloquear"**: mismas cards con `opacity: 0.62`, icon en `opacity: 0.4`, lock badge en bottom-right, `borderStyle: 'dashed'`
- **StarterNudge**: cuando `earnedCount === 0`, muestra el primer item del catálogo (por `sort_order`) como onboarding

Tier colors:
- bronze: `#B84014` (fg), `rgba(242,181,138,0.22)` (bg)
- silver: `#5C6376` (fg), `rgba(170,178,196,0.22)` (bg)
- gold: `#9E7C12` (fg), `rgba(244,210,107,0.26)` (bg)
- legendary: `#1F590D` (fg), `rgba(166,239,143,0.26)` (bg)

### Dev preview path

`Settings (dev) → Preview · Logros & Racha` → `app/(app)/settings/dev/preview.tsx` → `AchievementsStreakPreviewScreen`. Usa `achievement-preview-emitter.ts` (singleton Set de listeners). `triggerAchievementPreview(item)` dispara el mismo `AchievementUnlockModal` sin INSERT en DB.

---

## 5. Manifiesto Wrapped (end-to-end)

**Docs canónicos:** [`docs/cycle-wrapped-system.md`](../../../docs/sistemas/cycle-wrapped.md)  
**Estado:** ✅ LIVE desde 2026-05-12

### Trigger automático (post-cobro)

```
SalaryConfirmationSheet.onConfirm(amount)
  → upsert family_finance
  → DB trigger: trg_family_finance_salary_confirm → try_close_previous_cycle → UPSERT monthly_summaries
  → Mobile espera 700ms → refetchQueries(controlIntelligenceQueryKey)
  → Si summaries[0].expenses_count > 0 → triggerCycleWrapped(payload)
```

### Trigger manual (Ediciones)

`EditionsScreen` → tap en `EditionRow` → `triggerCycleWrapped(buildWrappedPayloadFromSummary({summary, categoryNameById, achievementsEarnedAt: []}))`.

### CycleWrappedBridge

**Archivo:** [`mobile/components/bridges/cycle-wrapped-bridge.tsx`](../../../mobile/components/bridges/cycle-wrapped-bridge.tsx)

Montado en `AppStackShell`, fuera del Stack. Escucha `useCycleWrappedListener` (mismo emitter singleton que el dev preview). Si llega un payload mientras otro modal está activo, el más reciente gana.

### CycleWrappedModal (5 escenas)

**Archivo:** [`mobile/components/wrapped/cycle-wrapped-modal.tsx`](../../../mobile/components/wrapped/cycle-wrapped-modal.tsx)

| Escena | Contenido |
|---|---|
| 1 · Cover | Paper cream, eyebrow "EDICIÓN {mes}", display 60pt "Tu mes, en cifras.", rule mark, kicker |
| 2 · El veredicto | Tinte state-driven (verde/peach/neutral), signo + número hero 56pt, `CountUpText` 1800ms, copy short, delta pill vs anterior. `ConfettiBurst` si `savingsDelta > 0` |
| 3 · Donde más se fue | Top categoría, name display 44pt, amount + share %, barra full-bleed |
| 4 · El gasto que más pesó | Peach band background, description como quote display, amount + fecha long-form |
| 5 · El próximo arranca hoy | Forest deep (#0F2D06), monthly income hero, achievements pill si `achievementsEarnedInCycle > 0`, summary row gastado + movimientos, CTA primary |

**Navegación:** Tap left-third = anterior, tap right two-thirds = siguiente / dismiss en última. Long-press ≥160ms = pausa auto-advance. X superior derecha = dismiss directo. Auto-advance 4500ms con progress bar lineal en top.

**Motion:** Scrim fade 420ms, scene crossfade 360ms + rise +8px. `useReducedMotion`: sin transitions, sin auto-advance, CountUp instantáneo, swipe manual.

### buildWrappedPayloadFromSummary

**Archivo:** [`mobile/features/wrapped/build-wrapped-payload.ts`](../../../mobile/features/wrapped/build-wrapped-payload.ts)

Convierte un `MonthlySummaryHistory` (shape de `monthly_summaries`) al `CycleWrappedPayload`. Maneja los dos formatos de `category_breakdown` (array nuevo vs record legacy). `achievementsEarnedAt` hoy se pasa como `[]` — el conteo por rango está pendiente de conectar con `achievements_earned`.

---

## 6. Ediciones (end-to-end)

**Docs canónicos:** [`docs/editions-system.md`](../../../docs/sistemas/editions.md)  
**Estado:** ✅ LIVE

### Concepto

Cada ciclo mensual cerrado (con al menos un gasto) queda guardado como "edición" en `monthly_summaries`. La pantalla es el **archivo persistente** de Wrappeds.

### useMonthlyEditions

**Archivo:** [`mobile/features/wrapped/use-monthly-editions.ts`](../../../mobile/features/wrapped/use-monthly-editions.ts)

Estrategia doble: primero intenta leer del cache `controlIntelligenceQueryKey` (poblado por home_snapshot en cold start). Si no hay cache, fetchea hasta 12 ciclos de `monthly_summaries` (vs 6 del Control intelligence). Filtra ciclos con `expenses_count === 0`.

### EditionsScreen layout

- **Masthead**: card con eyebrow "TU MANIFIESTO HASTA HOY", `CountUpText` animado del total ahorrado YTD (suma `max(0, savings_delta)` de todos los ciclos), caption "en N ediciones cerradas"
- **Lista de ediciones**: rows con `usePressScale(0.97)`, tier dot de color (verde=margen, peach=excedido, neutral=empatado), periodo label 15pt bold, rango de fechas (solo si no es ciclo calendario 1→1), count de movimientos, delta con signo (+ / −), label del resultado
- Tap en row → `triggerCycleWrapped(payload)` → reproduce el Wrapped completo
- Empty state: "Tu primera edición está en camino" (mientras no hay ciclos cerrados)

---

## 7. Tours / Walkthroughs

**Archivos:** `mobile/features/tours/` (17 archivos)  
**Estado:** ✅ LIVE

### Arquitectura

```
TourProvider (en app-providers.tsx, wrappea toda la app)
  ├── TourCtx (createContext) — registerStep, start, stop, next, prev, currentStep, measureToken
  ├── TourHost — overlay que mide y renderiza el cutout + TourTooltip
  └── TourTarget (HOC por step) — ref al View + config

useScreenTour(key) — auto-start en primera visita + mark seen on dismiss
useToursSeen() / useMarkTourSeen() / useResetTourSeen()
                — read/write contra columnas en `profiles` (backend)
persistence.ts — SecureStore: SOLO `tours-disabled` = '1' (toggle global)
```

### 🆕 2026-05-27 — Backend sync

El estado "tour visto" vive ahora en `profiles.{home,gastos,fijos,control}_tour_seen_at` (timestamptz). La app lee vía `useToursSeen` (deriva del profile cached por React Query) y muta vía `useMarkTourSeen` / `useResetTourSeen` (RPCs SECURITY DEFINER: `mark_tour_seen`, `reset_tour_seen`, `reset_all_tours_seen`).

**Por qué:** logout antes borraba `tour-seen.*` y el siguiente login del mismo usuario veía los tours otra vez. Ahora el estado vive en el server: un user que vio el tour, hace logout, y se vuelve a loguear → no ve el tour. Mismo user en otro device tampoco.

**Fallback offline:** si el RPC de `useMarkTourSeen` falla por red caída, se guarda `tour-seen-pending.<key>` en SecureStore y se reintenta en el próximo launch via `useMigrateToursToBackend` (que además hoistea flags legacy `tour-seen.*` de installs pre-2026-05-27, idempotente con el flag `tour-seen.migration-v2-done`).

**Logout** ya no borra el estado de tours (backend persiste). Solo limpia el toggle device-local `tours-disabled` y el flag de migración para que el próximo user re-evalúe.

El toggle global `tours-disabled` (sin UI todavía) sigue device-local en SecureStore.

### 4 tours activos

| Key | Pantalla | Definición |
|---|---|---|
| `home` | Home / Inicio | `mobile/features/tours/screens/home-tour.ts` |
| `gastos` | Gastos | `mobile/features/tours/screens/gastos-tour.ts` |
| `fijos` | Fijos | `mobile/features/tours/screens/fijos-tour.ts` |
| `control` | Control | `mobile/features/tours/screens/control-tour.ts` |

### useScreenTour — comportamiento

- Auto-start en `isFocused` + `splash.phase === 'hidden'` + `!startedRef.current`
- Espera `startDelayMs` (default 600ms) para que RiseView + skeleton-to-data settle antes de medir
- Llama `resetScrollToTop(tour)` antes de iniciar → garantiza que el primer step mida contra layout unscrolled
- Marca como seen en `stop()` via `useMarkTourSeen().mutate(tour)` (RPC + optimistic update del profile cache)
- Flag global `tours-disabled` → aun si un tour no fue visto, no auto-arranca

### Persistencia

- **Per-tour "seen" state:** backend (`profiles.{home,gastos,fijos,control}_tour_seen_at`). Persistente cross-device, cross-logout, cross-reinstall.
- **Toggle global `tours-disabled`:** device-local en SecureStore (iOS: Keychain; Android: equivalente). Sin UI todavía; reset en logout.
- **Pending fallback:** `tour-seen-pending.<key>` en SecureStore cuando el RPC `mark_tour_seen` falla. Reintentado por `useMigrateToursToBackend` en el próximo cold-start.
- **Migration flag:** `tour-seen.migration-v2-done` en SecureStore. One-shot por install: hoistea cualquier flag legacy `tour-seen.*` + pending al backend, después se marca como done. Reset en logout para que un cambio de user re-evalúe.

### Reactivar desde Settings

"Reactivar visitas guiadas" → `handleResetTours()` → `resetAllTours()` → Alert "La próxima vez que abras Inicio, Gastos, Fijos y Control...".

---

## 8. Subscriptions-zombie

**Archivos:** `mobile/features/subscriptions-zombie/` (12 archivos) + `mobile/components/subscriptions-zombie/` (5 componentes)  
**Estado:** ✅ LIVE (detector activo; UI expuesta en Control → Asistente)  
**Nota:** este sistema detecta **suscripciones de la familia** (Netflix, Spotify, etc.) — NO los planes de Manifiesto (que son el sistema de billing, sección 9).

### Concepto

Analiza los gastos fijos (`fixed_expenses`) categorizados como "Suscripciones", con antigüedad ≥60 días, frequency weekly/biweekly/monthly, y status active. Pregunta a cada miembro de la familia su nivel de uso actual y genera un feed de auditoría con clasificaciones y follow-ups.

### Motor de clasificación (client-side)

**Archivo:** [`mobile/features/subscriptions-zombie/subscription-audit-engine.ts`](../../../mobile/features/subscriptions-zombie/subscription-audit-engine.ts)

**Classifications:**

| Clasificación | Criterio |
|---|---|
| `zombie_consensuado` | Todos responden `casi_nunca` |
| `no_zombie` | Al menos alguien responde `mucho` |
| `indecisa` | Solo `a_veces` sin `mucho` ni `casi_nunca` |
| `uso_desigual` | Hay `casi_nunca` Y (`mucho` o `a_veces`) |
| `parcial` | responseRate < 0.5 (menos de la mitad respondió) |
| `pending_audit` | Sin auditorías en el período actual |

**Cooldowns (evitan preguntar demasiado seguido):**

| Clasificación previa | Cooldown |
|---|---|
| no_zombie | 180 días |
| indecisa | 90 días |
| uso_desigual | 180 días |
| parcial | 60 días |
| intent abandoned | 180 días |

### Candidacy filter

`isAuditCandidate(fijo, now)`:
- `kind === 'recurring'`
- `status === 'active'`
- `categoryName === 'Suscripciones'` AND `categoryScope === 'fixed_expense'`
- `frequency in ['weekly', 'biweekly', 'monthly']`
- Antigüedad ≥ `MIN_AGE_DAYS` (60 días)

### Known providers

**Archivo:** [`mobile/features/subscriptions-zombie/known-providers.ts`](../../../mobile/features/subscriptions-zombie/known-providers.ts)

33 providers hardcodeados para chip contextual de onboarding: netflix, spotify, disney, hbo, max, prime video, amazon prime, apple, icloud, youtube premium, youtube music, crunchyroll, storytel, audible, chatgpt, claude, notion, adobe, canva, github, gym, smartfit, megatlon, fit. Match case-insensitive por substring.

### Data layer

**useSubscriptionAuditFeed** — 5 queries paralelas a Supabase: `fixed_expenses` (con `categories` nested), `fixed_expense_usage_audit`, `fixed_expense_action_intent`, `fixed_expense_payments` (join inner), `family_members` + `profiles`. Luego `buildFeed(input)` en el cliente. `staleTime: 5min`.

**Hooks de mutación:**
- `useRecordSubscriptionAudit` — registra nivel de uso (mucho/a_veces/casi_nunca)
- `useDeclareSubscriptionIntent` — declara intención (cancel/pause/downgrade)
- `useResolveSubscriptionIntent` — resuelve la intención (completed/abandoned)

**useZombiePushSync** — sincroniza el feed de zombie con el backend de push para notificaciones contextuales.

### Componentes UI

| Componente | Función |
|---|---|
| `AuditPromptCard` | Pregunta "¿Cuánto usan esto?" con 3 botones de UsageLevel |
| `UsageLevelButtons` | Botones mucho / a_veces / casi_nunca |
| `ClassificationCard` | Muestra el resultado de la clasificación |
| `IntentFollowupCard` | Follow-up post-intención (¿cancelaron? ¿sigue cobrando?) |
| `IntentStatusCard` | Estado actual de una intención abierta |

### Dónde se renderiza

`ZombieFeedSection` en `mobile/components/control-v2/zombie-feed-section.tsx` → embebido en la pantalla del Asistente Financiero (`asistente-screen.tsx`). NO tiene pantalla propia — aparece en el feed de señales.

### IntentKinds y FollowUpKinds

- **IntentKind:** `cancel | pause | downgrade`
- **FollowUpKind:** `awaiting_post_due | payment_recurred | no_payment_after_due`
- `POST_DUE_GRACE_DAYS`: 5 días de gracia post-vencimiento antes de mostrar "no_payment_after_due"

---

## 9. Billing (MOCK completo)

**Archivos:**
- [`mobile/features/billing/billing-plans.ts`](../../../mobile/features/billing/billing-plans.ts)
- [`mobile/features/billing/use-billing.ts`](../../../mobile/features/billing/use-billing.ts)

**Estado:** ⏸️ EN PAUSA — **SIN implementación real. Sin RevenueCat. Sin Apple Developer Program IAP.**

### useBilling — implementación mock

```typescript
// Simula 600ms de latencia, luego setea estado local.
// Razón: "cuando el provider real entre, la firma pública no cambia".
const purchasePlan = async (plan) => {
  await new Promise(resolve => setTimeout(resolve, 600))
  setStatus({ activePlanId: plan.id, expiresAt: ..., isInTrial: false, autoRenew: true })
  return { ok: true }
}
const startFreeTrial = async (plan) => {
  await new Promise(resolve => setTimeout(resolve, 400))
  setStatus({ ..., isInTrial: true, expiresAt: +14days, autoRenew: false })
  return { ok: true }
}
```

Estado default: `{ activePlanId: null, expiresAt: null, isInTrial: false, autoRenew: true }`.

**INTEGRATION POINT marcado explícitamente en el código** — comentario indica dónde va `Purchases.purchaseProduct(plan.productId)`.

### Planes definidos

| Plan | ID | Cycle | USD | ARS | Member cap | Recommended |
|---|---|---|---|---|---|---|
| Hogar Mensual | `hogar-mensual` | monthly | $4.99 | $5,490 | 2 | No |
| Hogar Anual | `hogar-anual` | yearly | $39.99 | $43,990 | 4 | Sí |

- `BILLING_TRIAL_DAYS`: 14 días
- `productId` placeholders: `com.manifiesto.app.subscription.monthly` / `.yearly`
- Anual: ahorro 33% vs mensual, tag "USD 3.33 al mes efectivo", member cap 4 (habilita familia extendida)

### BillingScreen

Pantalla con dark forest gradient (`#0F2D06 → #297811`), toggle entre planes mensual/anual, highlights de features, botón "Empezar prueba gratis" / "Contratar" / "Plan actual" (según estado). Animations: `FadeIn/FadeOut` en plan selection. Usa `useReducedMotion`.

---

## 10. Dev Preview Tools

**Estado:** ✅ LIVE — gateado por `__DEV__` en runtime y `Redirect` en cada ruta

### Sección "Desarrollo" en Settings (raíz)

Visible solo cuando `__DEV__ === true`. 8 rows:

| Row | Acción |
|---|---|
| Probar splash · success | `showAuthTransitionSplash()` + `markAuthTransitionLoaded()` en 5s |
| Probar splash · error de red | `showAuthTransitionSplash()` + `reportAuthTransitionError('network')` en 1.5s |
| Forzar cierre del splash | `hideAuthTransitionSplash()` |
| Modo demo del asistente | `Switch` → `setAssistantDemoMode(bool)` — fixture curado con todos los escenarios |
| Filtro demo (condicional) | `SegmentedControl` Todas/Read-only/Routing/Acción — solo cuando demo está ON |
| DB Health | Navega a `/settings/dev-health` |
| Preview · Logros & Racha | Navega a `/settings/dev/preview` |
| Preview · Cierre de ciclo | Navega a `/settings/dev/cycle-wrapped` |

### Dev Preview — Logros & Racha

**Ruta:** `app/(app)/settings/dev/preview.tsx`  
**Pantalla:** [`mobile/screens/dev/achievements-streak-preview-screen.tsx`](../../../mobile/screens/dev/achievements-streak-preview-screen.tsx)

Gate: `if (!__DEV__) return <Redirect href="/(app)/settings" />`

Lista todos los logros del catálogo. Tap en cada uno → `triggerAchievementPreview(item)` → dispara `AchievementUnlockModal` real (mismo path visual que producción, sin INSERT en DB). También permite previsualizar racha en cada estado (activa, en riesgo, rota).

### Dev Preview — Cierre de ciclo

**Ruta:** `app/(app)/settings/dev/cycle-wrapped.tsx`  
**Pantalla:** [`mobile/screens/dev/cycle-wrapped-preview-screen.tsx`](../../../mobile/screens/dev/cycle-wrapped-preview-screen.tsx)

Permite disparar `CycleWrappedModal` con 3 payloads sintéticos: ciclo con margen / empatado / excedido.

### DevHealthScreen

**Ruta:** `app/(app)/settings/dev-health.tsx`  
**Pantalla:** [`mobile/screens/dev-health-screen.tsx`](../../../mobile/screens/dev-health-screen.tsx)

Llama `supabase.rpc('db_health_snapshot')` → muestra métricas de la DB: tamaño, growth, tablas y slow queries. `staleTime: 60s`, `refetchOnWindowFocus: false`. Pull-to-refresh.

### Rutas dev — estado post-limpieza

> ² **Limpieza ejecutada 2026-05-22:** las 12 rutas `app/(app)/settings/dev/fijos-*`, `control-hero-variants` y sus 12+1 screens correspondientes en `mobile/screens/dev/` fueron **eliminadas**. Solo quedan 2 rutas dev activas: `preview.tsx` (Logros & Racha) y `cycle-wrapped.tsx` (Cierre de ciclo). Plan de eliminación en [09-candidatos-a-eliminar.md](09-candidatos-a-eliminar.md) (Buckets 1 y 6).

### BlockingScreen (shared)

**Archivo:** [`mobile/screens/shared/blocking-screen.tsx`](../../../mobile/screens/shared/blocking-screen.tsx)

Wrapper thin de `BlockingScreenView`. Usado en: `auth-callback-screen` ("Confirmando acceso..."), `reset-password-screen` ("Validando tu link..."), `guards.tsx` ("Preparando tu espacio..."). No forma parte del flujo de Settings directamente.

---

## 11. Inventario completo

### Screens

| Archivo | Ruta Expo Router | Estado |
|---|---|---|
| [`mobile/screens/settings/settings-screen.tsx`](../../../mobile/screens/settings/settings-screen.tsx) | `app/(app)/settings.tsx` | ✅ LIVE |
| [`mobile/screens/settings/family-admin-screen.tsx`](../../../mobile/screens/settings/family-admin-screen.tsx) | `app/(app)/settings/family-admin.tsx` | ✅ LIVE |
| [`mobile/screens/settings/billing-screen.tsx`](../../../mobile/screens/settings/billing-screen.tsx) | `app/(app)/settings/plan.tsx` | ⏸️ MOCK |
| [`mobile/screens/settings/notifications-preferences-screen.tsx`](../../../mobile/screens/settings/notifications-preferences-screen.tsx) | `app/(app)/settings/notifications.tsx` | ✅ LIVE |
| [`mobile/screens/settings/asistente-preferences-screen.tsx`](../../../mobile/screens/settings/asistente-preferences-screen.tsx) | `app/(app)/settings/asistente.tsx` | 🟡 PARCIAL |
| [`mobile/screens/settings/savings-goal-screen.tsx`](../../../mobile/screens/settings/savings-goal-screen.tsx) | `app/(app)/savings-goal.tsx` | ✅ LIVE |
| [`mobile/screens/settings/achievements-gallery-screen.tsx`](../../../mobile/screens/settings/achievements-gallery-screen.tsx) | `app/(app)/settings/achievements.tsx` | ✅ LIVE |
| [`mobile/screens/settings/editions-screen.tsx`](../../../mobile/screens/settings/editions-screen.tsx) | `app/(app)/settings/editions.tsx` | ✅ LIVE |
| [`mobile/screens/settings/household-setup-screen.tsx`](../../../mobile/screens/settings/household-setup-screen.tsx) | (ver doc 02 — Household Setup) | (ref) |
| [`mobile/screens/dev-health-screen.tsx`](../../../mobile/screens/dev-health-screen.tsx) | `app/(app)/settings/dev-health.tsx` | ✅ LIVE (__DEV__) |
| [`mobile/screens/dev/achievements-streak-preview-screen.tsx`](../../../mobile/screens/dev/achievements-streak-preview-screen.tsx) | `app/(app)/settings/dev/preview.tsx` | ✅ LIVE (__DEV__) |
| [`mobile/screens/dev/cycle-wrapped-preview-screen.tsx`](../../../mobile/screens/dev/cycle-wrapped-preview-screen.tsx) | `app/(app)/settings/dev/cycle-wrapped.tsx` | ✅ LIVE (__DEV__) |
| ~~`mobile/screens/dev/control-hero-variants-screen.tsx`~~ | ~~`app/(app)/settings/dev/control-hero-variants.tsx`~~ | 🗑️ **Eliminado 2026-05-22** |
| ~~`mobile/screens/dev/fijos-*` (12 archivos)~~ | ~~`app/(app)/settings/dev/fijos-*`~~ | 🗑️ **Eliminado 2026-05-22** |
| [`mobile/screens/shared/blocking-screen.tsx`](../../../mobile/screens/shared/blocking-screen.tsx) | (usado en auth flows) | ✅ LIVE |

### Components / settings

| Archivo | Función |
|---|---|
| [`mobile/components/settings/settings-grouped-list.tsx`](../../../mobile/components/settings/settings-grouped-list.tsx) | `SettingsGroup` + `SettingsRow` primitivos |
| [`mobile/components/settings/settings-primitives.tsx`](../../../mobile/components/settings/settings-primitives.tsx) | `SettingsSwitchRow` + `SettingsRow` alt |
| [`mobile/components/settings/global-settings-modals-host.tsx`](../../../mobile/components/settings/global-settings-modals-host.tsx) | Host de modales globales |
| [`mobile/components/settings/household-setup-sections.tsx`](../../../mobile/components/settings/household-setup-sections.tsx) | Secciones del wizard de setup |
| [`mobile/components/settings/savings-advisor-strip.tsx`](../../../mobile/components/settings/savings-advisor-strip.tsx) | Strip contextual en SavingsGoalScreen |
| ~~`mobile/components/settings/settings-hero-summary.tsx`~~ | 🗑️ **Eliminado 2026-05-22** — barrel huérfano |
| ~~`mobile/components/settings/settings-finance-card.tsx`~~ | 🗑️ **Eliminado 2026-05-22** — barrel huérfano |
| ~~`mobile/components/settings/settings-sections.tsx`~~ | 🗑️ **Eliminado 2026-05-22** — barrel huérfano |
| [`mobile/components/settings/category-editor-modal.tsx`](../../../mobile/components/settings/category-editor-modal.tsx) | Editor de categorías |
| [`mobile/components/settings/fixed-expense-editor-chip-sections.tsx`](../../../mobile/components/settings/fixed-expense-editor-chip-sections.tsx) | Editor de gastos fijos — chips |
| [`mobile/components/settings/fixed-expense-editor-sections.tsx`](../../../mobile/components/settings/fixed-expense-editor-sections.tsx) | Editor de gastos fijos — secciones |
| [`mobile/components/settings/fixed-expense-editor-value-rows.tsx`](../../../mobile/components/settings/fixed-expense-editor-value-rows.tsx) | Editor de gastos fijos — valor |
| [`mobile/components/settings/sheets/delete-account-confirm-sheet.tsx`](../../../mobile/components/settings/sheets/delete-account-confirm-sheet.tsx) | Sheet confirmación borrar cuenta |
| [`mobile/components/settings/sheets/destroy-family-confirm-sheet.tsx`](../../../mobile/components/settings/sheets/destroy-family-confirm-sheet.tsx) | Sheet confirmación eliminar hogar |
| [`mobile/components/settings/sheets/edit-avatar-sheet.tsx`](../../../mobile/components/settings/sheets/edit-avatar-sheet.tsx) | Sheet editar avatar |
| [`mobile/components/settings/sheets/edit-buffer-sheet.tsx`](../../../mobile/components/settings/sheets/edit-buffer-sheet.tsx) | Sheet editar buffer diario |
| [`mobile/components/settings/sheets/edit-display-name-sheet.tsx`](../../../mobile/components/settings/sheets/edit-display-name-sheet.tsx) | Sheet editar nombre |
| [`mobile/components/settings/sheets/edit-my-contribution-sheet.tsx`](../../../mobile/components/settings/sheets/edit-my-contribution-sheet.tsx) | Sheet editar aporte mensual |
| [`mobile/components/settings/sheets/edit-payday-sheet.tsx`](../../../mobile/components/settings/sheets/edit-payday-sheet.tsx) | Sheet editar día de cobro |
| [`mobile/components/settings/sheets/edit-savings-emoji-sheet.tsx`](../../../mobile/components/settings/sheets/edit-savings-emoji-sheet.tsx) | Sheet editar emoji de meta |
| [`mobile/components/settings/sheets/edit-savings-percent-sheet.tsx`](../../../mobile/components/settings/sheets/edit-savings-percent-sheet.tsx) | Sheet editar % de ahorro |
| [`mobile/components/settings/sheets/edit-savings-title-sheet.tsx`](../../../mobile/components/settings/sheets/edit-savings-title-sheet.tsx) | Sheet editar título de meta |
| [`mobile/components/settings/sheets/edit-usd-rate-sheet.tsx`](../../../mobile/components/settings/sheets/edit-usd-rate-sheet.tsx) | Sheet editar cotización USD |
| [`mobile/components/settings/sheets/share-invite-sheet.tsx`](../../../mobile/components/settings/sheets/share-invite-sheet.tsx) | Sheet invitar miembro (código efímero) |

### Components / bridges + achievements + wrapped + subscriptions-zombie

| Archivo | Función |
|---|---|
| [`mobile/components/bridges/achievement-unlock-bridge.tsx`](../../../mobile/components/bridges/achievement-unlock-bridge.tsx) | Bridge realtime → AchievementUnlockModal |
| [`mobile/components/bridges/cycle-wrapped-bridge.tsx`](../../../mobile/components/bridges/cycle-wrapped-bridge.tsx) | Bridge emitter → CycleWrappedModal |
| [`mobile/components/bridges/daily-budget-nudge-bridge.tsx`](../../../mobile/components/bridges/daily-budget-nudge-bridge.tsx) | Bridge nudge de presupuesto diario |
| [`mobile/components/achievements/achievement-unlock-modal.tsx`](../../../mobile/components/achievements/achievement-unlock-modal.tsx) | Modal full-screen de unlock con confetti |
| [`mobile/components/wrapped/cycle-wrapped-modal.tsx`](../../../mobile/components/wrapped/cycle-wrapped-modal.tsx) | Modal 5-escenas del Wrapped |
| [`mobile/components/subscriptions-zombie/audit-prompt-card.tsx`](../../../mobile/components/subscriptions-zombie/audit-prompt-card.tsx) | Prompt de auditoría de uso |
| [`mobile/components/subscriptions-zombie/classification-card.tsx`](../../../mobile/components/subscriptions-zombie/classification-card.tsx) | Resultado de clasificación |
| [`mobile/components/subscriptions-zombie/intent-followup-card.tsx`](../../../mobile/components/subscriptions-zombie/intent-followup-card.tsx) | Follow-up post-intención |
| [`mobile/components/subscriptions-zombie/intent-status-card.tsx`](../../../mobile/components/subscriptions-zombie/intent-status-card.tsx) | Estado de intención abierta |
| [`mobile/components/subscriptions-zombie/usage-level-buttons.tsx`](../../../mobile/components/subscriptions-zombie/usage-level-buttons.tsx) | Botones mucho/a_veces/casi_nunca |

### Features

| Archivo | Función |
|---|---|
| [`mobile/features/achievements/use-achievements.ts`](../../../mobile/features/achievements/use-achievements.ts) | `useAchievements` + `useAchievementUnlocks` |
| [`mobile/features/billing/billing-plans.ts`](../../../mobile/features/billing/billing-plans.ts) | Definición de planes (hogar-mensual, hogar-anual) |
| [`mobile/features/billing/use-billing.ts`](../../../mobile/features/billing/use-billing.ts) | `useBilling` (MOCK) |
| [`mobile/features/family/use-family-admin.ts`](../../../mobile/features/family/use-family-admin.ts) | `useFamilyMemberStats`, `useTransferOwnership`, `useBlockMember`, `useUnblockMember`, `useRemoveMember` |
| [`mobile/features/family/use-family-actions.ts`](../../../mobile/features/family/use-family-actions.ts) | `useLeaveCurrentFamily`, `useUpdateMyIncomeContribution` |
| [`mobile/features/family/use-family-members.ts`](../../../mobile/features/family/use-family-members.ts) | `useFamilyMembers` |
| [`mobile/features/family/use-family-members-detail.ts`](../../../mobile/features/family/use-family-members-detail.ts) | `useFamilyMembersDetail` |
| [`mobile/features/family/use-family-realtime.ts`](../../../mobile/features/family/use-family-realtime.ts) | Subscripción realtime a cambios de familia |
| [`mobile/features/family/use-family.ts`](../../../mobile/features/family/use-family.ts) | `useFamily` base |
| [`mobile/features/family/use-join-controller.ts`](../../../mobile/features/family/use-join-controller.ts) | Controlador de unión a familia |
| [`mobile/features/family/use-my-family-role.ts`](../../../mobile/features/family/use-my-family-role.ts) | `useMyFamilyRole` |
| [`mobile/features/family/family-dashboard-model.ts`](../../../mobile/features/family/family-dashboard-model.ts) | Modelo de dashboard familiar |
| [`mobile/features/family/family-dashboard-monthly-history.ts`](../../../mobile/features/family/family-dashboard-monthly-history.ts) | Historial mensual del dashboard |
| [`mobile/features/family/family-query-invalidation.ts`](../../../mobile/features/family/family-query-invalidation.ts) | Helpers de invalidación de queries |
| [`mobile/features/savings-goals/savings-goal.model.ts`](../../../mobile/features/savings-goals/savings-goal.model.ts) | `SavingsGoal`, `SavingsGoalInput`, `validateSavingsGoalInput` |
| [`mobile/features/savings-goals/savings-goal.repository.ts`](../../../mobile/features/savings-goals/savings-goal.repository.ts) | `fetchActiveSavingsGoal` |
| [`mobile/features/savings-goals/use-savings-goal.ts`](../../../mobile/features/savings-goals/use-savings-goal.ts) | `useSavingsGoal` |
| [`mobile/features/savings-goals/use-upsert-savings-goal.ts`](../../../mobile/features/savings-goals/use-upsert-savings-goal.ts) | `useUpsertSavingsGoal` |
| [`mobile/features/savings-goals/use-add-savings-contribution.ts`](../../../mobile/features/savings-goals/use-add-savings-contribution.ts) | `useAddSavingsContribution` |
| [`mobile/features/profile/use-profile.ts`](../../../mobile/features/profile/use-profile.ts) | `useMyProfile`, `useUpdateDisplayName`, `useUpdateAvatarAnimal` |
| [`mobile/features/preferences/motion-preference-provider.tsx`](../../../mobile/features/preferences/motion-preference-provider.tsx) | `MotionPreferenceProvider`, `useMotionPreferenceControls` (auto/always/never) |
| [`mobile/features/notifications/use-notification-preferences.ts`](../../../mobile/features/notifications/use-notification-preferences.ts) | `useNotificationPreferences`, `useUpdateNotificationPreferences` |
| [`mobile/features/notifications/notification-query-keys.ts`](../../../mobile/features/notifications/notification-query-keys.ts) | Query keys de notificaciones |
| [`mobile/features/notifications/use-notifications.ts`](../../../mobile/features/notifications/use-notifications.ts) | Hook base de notificaciones |
| [`mobile/features/wrapped/build-wrapped-payload.ts`](../../../mobile/features/wrapped/build-wrapped-payload.ts) | `buildWrappedPayloadFromSummary` |
| [`mobile/features/wrapped/use-monthly-editions.ts`](../../../mobile/features/wrapped/use-monthly-editions.ts) | `useMonthlyEditions` |
| [`mobile/features/subscriptions-zombie/subscription-audit-engine.ts`](../../../mobile/features/subscriptions-zombie/subscription-audit-engine.ts) | `buildFeed`, `classifyAudit`, `isAuditCandidate`, `isInCooldown` |
| [`mobile/features/subscriptions-zombie/types.ts`](../../../mobile/features/subscriptions-zombie/types.ts) | Types + constantes (MIN_AGE_DAYS, cooldowns) |
| [`mobile/features/subscriptions-zombie/known-providers.ts`](../../../mobile/features/subscriptions-zombie/known-providers.ts) | 33 providers hardcodeados |
| [`mobile/features/subscriptions-zombie/use-subscription-audit-feed.ts`](../../../mobile/features/subscriptions-zombie/use-subscription-audit-feed.ts) | `useSubscriptionAuditFeed` (5 queries paralelas) |
| [`mobile/features/subscriptions-zombie/use-declare-subscription-intent.ts`](../../../mobile/features/subscriptions-zombie/use-declare-subscription-intent.ts) | `useDeclareSubscriptionIntent` |
| [`mobile/features/subscriptions-zombie/use-record-subscription-audit.ts`](../../../mobile/features/subscriptions-zombie/use-record-subscription-audit.ts) | `useRecordSubscriptionAudit` |
| [`mobile/features/subscriptions-zombie/use-resolve-subscription-intent.ts`](../../../mobile/features/subscriptions-zombie/use-resolve-subscription-intent.ts) | `useResolveSubscriptionIntent` |
| [`mobile/features/subscriptions-zombie/use-zombie-push-sync.ts`](../../../mobile/features/subscriptions-zombie/use-zombie-push-sync.ts) | `useZombiePushSync` |
| [`mobile/features/subscriptions-zombie/period.ts`](../../../mobile/features/subscriptions-zombie/period.ts) | `periodOf(date)` — clave de período mensual |
| [`mobile/features/subscriptions-zombie/query-keys.ts`](../../../mobile/features/subscriptions-zombie/query-keys.ts) | Query keys del sistema zombie |
| [`mobile/features/tours/tour-context.tsx`](../../../mobile/features/tours/tour-context.tsx) | `TourCtx`, `useTour` |
| [`mobile/features/tours/tour-provider.tsx`](../../../mobile/features/tours/tour-provider.tsx) | `TourProvider` con estado completo |
| [`mobile/features/tours/tour-host.tsx`](../../../mobile/features/tours/tour-host.tsx) | `TourHost` — overlay cutout + tooltip |
| [`mobile/features/tours/tour-target.tsx`](../../../mobile/features/tours/tour-target.tsx) | `TourTarget` HOC |
| [`mobile/features/tours/tour-tooltip.tsx`](../../../mobile/features/tours/tour-tooltip.tsx) | `TourTooltip` — bubble de navegación |
| [`mobile/features/tours/persistence.ts`](../../../mobile/features/tours/persistence.ts) | SecureStore: getTourSeen, setTourSeen, resetAllTours |
| [`mobile/features/tours/tour-keys.ts`](../../../mobile/features/tours/tour-keys.ts) | `TOUR_KEYS` (home, gastos, fijos, control) |
| [`mobile/features/tours/tour-scroll-registry.ts`](../../../mobile/features/tours/tour-scroll-registry.ts) | Registry de ScrollViews por tour |
| [`mobile/features/tours/use-screen-tour.ts`](../../../mobile/features/tours/use-screen-tour.ts) | `useScreenTour` — auto-start + seen flag |
| [`mobile/features/tours/use-register-tour-scroll-view.ts`](../../../mobile/features/tours/use-register-tour-scroll-view.ts) | `useRegisterTourScrollView` |
| [`mobile/features/tours/use-tour-target-ref.ts`](../../../mobile/features/tours/use-tour-target-ref.ts) | `useTourTargetRef` |
| [`mobile/features/tours/types.ts`](../../../mobile/features/tours/types.ts) | `RegisteredStep`, `TourDefaults` |
| [`mobile/features/tours/screens/home-tour.ts`](../../../mobile/features/tours/screens/home-tour.ts) | Definición de steps del tour de Home |
| [`mobile/features/tours/screens/gastos-tour.ts`](../../../mobile/features/tours/screens/gastos-tour.ts) | Tour de Gastos |
| [`mobile/features/tours/screens/fijos-tour.ts`](../../../mobile/features/tours/screens/fijos-tour.ts) | Tour de Fijos |
| [`mobile/features/tours/screens/control-tour.ts`](../../../mobile/features/tours/screens/control-tour.ts) | Tour de Control |
| [`mobile/features/dev-health/use-db-health.ts`](../../../mobile/features/dev-health/use-db-health.ts) | `useDbHealth` → RPC `db_health_snapshot` |
| [`mobile/features/dev-health/db-health-types.ts`](../../../mobile/features/dev-health/db-health-types.ts) | `DbHealthSnapshot` types |
| [`mobile/features/telemetry/use-screen-telemetry.ts`](../../../mobile/features/telemetry/use-screen-telemetry.ts) | `useScreenTelemetry` — opened/closed/left_without_tap/reopened |
| [`mobile/features/telemetry/log-screen-event.ts`](../../../mobile/features/telemetry/log-screen-event.ts) | `logScreenEvent` → RPC `log_home_event` |
| [`mobile/features/telemetry/event-queue.ts`](../../../mobile/features/telemetry/event-queue.ts) | Queue de eventos para batching |
| [`mobile/features/push/use-push-notifications.ts`](../../../mobile/features/push/use-push-notifications.ts) | `useEnablePushNotifications`, `useHasPushSubscription`, `supportsRemotePushNotifications` |
| [`mobile/features/settings/settings-form.model.ts`](../../../mobile/features/settings/settings-form.model.ts) | Modelo de formulario de settings |
| [`mobile/features/settings/household-setup-wizard.model.ts`](../../../mobile/features/settings/household-setup-wizard.model.ts) | Modelo del wizard de setup |

---

## 12. Estado vs Deuda técnica

### ✅ Funcional y completo

- Settings raíz con 10+ grupos de configuración, 10 sheets inline, biometría, motion preference
- Achievements end-to-end: 14 codes, triggers server-side, realtime channel, galería con hero + dots strip + tier rings, unlock modal con confetti, dev preview
- Manifiesto Wrapped: trigger automático post-cobro, 5 escenas editoriales, motion compliant, dev preview con payloads sintéticos
- Ediciones: archivo de Wrappeds, masthead YTD, rows con tier dots, tap-to-replay
- Tours custom (sin react-native-copilot): 4 tours, SecureStore persistence, overlay cutout, reset desde Settings
- Subscriptions-zombie: motor de clasificación client-side, 5 clasificaciones, cooldowns, 5 queries paralelas, intención + follow-up, sync push
- Family admin: gestionar miembros, transferir ownership, bloquear/desbloquear/eliminar via RPCs
- Savings goals: CRUD completo, validación, milestones achievements, SavingsAdvisorStrip contextual
- Notifications preferences: canales, grupos, horarios check-in, optimistic update
- Telemetría de pantallas: opened/closed/dwell/left_without_tap/reopened

### 🟡 Parcial / pendiente

- **Asistente Preferences — persona override**: inferencia funciona, pero el write-path del override no está implementado (no hay tabla `user_advisor_prefs`). El campo es hoy read-only.
- **Wrapped — achievements en rango**: `achievementsEarnedAt` se pasa como `[]` al builder — el conteo de logros del ciclo no se muestra en la escena 5. Pendiente conectar `achievements_earned.earned_at` con el rango del ciclo.
- **Ediciones — limit de 12 ciclos**: sin paginación. Familias con 12+ ciclos no verán los más antiguos.

### ⏸️ Bloqueado / sin implementación real

- **Billing / IAP**: `useBilling` es 100% mock. Sin Apple Developer Program, sin RevenueCat, sin StoreKit. La firma del hook está diseñada para no cambiar cuando se conecte el provider real. No bloquea el lanzamiento si la app opera en modo free.

### 🔴 Deuda conocida — cleanup pendiente

- ~~**15 rutas dev de Fijos**~~ → 🗑️ **Eliminadas 2026-05-22** (12 rutas `fijos-*` + `control-hero-variants`). Ya no aplica.
- ~~**Fijos dev screens**~~ → 🗑️ **Eliminadas 2026-05-22** (12 screens `fijos-*` + `control-hero-variants-screen`). Ya no aplica.
