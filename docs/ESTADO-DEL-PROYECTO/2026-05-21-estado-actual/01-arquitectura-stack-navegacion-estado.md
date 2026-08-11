# Arquitectura, Stack, Navegación, Estado Global y Theme — Manifiesto Mobile

> Verificado contra commit `7962ea2` · 2026-05-21 · parte del snapshot docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/

---

## 1. Visión general

### Capas de la arquitectura

```
┌─────────────────────────────────────────────────────┐
│  Expo Router (file-based routing) — app/            │
├─────────────────────────────────────────────────────┤
│  Shell Components — mobile/components/root/         │
│  (RootLayoutShell, AppStackShell, AppEntryGate,     │
│   bridges globales, error boundary)                 │
├─────────────────────────────────────────────────────┤
│  Tab Navigator custom — mobile/components/navigation│
│  (AppTabs, TabBarPressable, AddExpenseTabButton,    │
│   TabBarIcon + focusDot, TabBarBackground LiquidGlass│
├─────────────────────────────────────────────────────┤
│  Screens — app/(app)/(tabs)/ y pantallas modales    │
│  (implementación en mobile/screens/, features/)     │
├─────────────────────────────────────────────────────┤
│  Estado Servidor   │  Estado UI / Animación         │
│  React Query v5    │  Zustand / Context /           │
│  + Supabase        │  Reanimated SharedValues       │
├─────────────────────────────────────────────────────┤
│  Infra lib — mobile/lib/ (~25 archivos)             │
│  (query-client, runtime, supabase, biometrics,      │
│   emitters, persistent-kv, motion tokens, etc.)     │
├─────────────────────────────────────────────────────┤
│  Theme System — mobile/theme/                       │
│  (palette, typography, elevation, category-hues,    │
│   interaction, state-tokens, auth-theme, screen-header│
└─────────────────────────────────────────────────────┘
```

### Flujo cliente ↔ servidor

1. **Cold start** — `runtime.ts` inicializa `enableFreeze()` + URL polyfill + LogBox filters. `AppProviders` monta `PersistQueryClientProvider` con `queryPersister` (AsyncStorage); las queries no-sensibles del cache anterior se rehidratan antes del primer render.
2. **Auth check** — `AppEntryGate` (en `app/index.tsx`) verifica sesión Supabase + biometría + familia + perfil. Redirige a `/(auth)/welcome`, `/(auth)/login?autoBiometric=1`, `/(app)/onboarding` o `/(app)/(tabs)/home`.
3. **Snapshot RPC** — `AppStackShell` dispara `useHomeSnapshot(userId)` una sola vez al montar. El RPC bundle múltiples fetches en 1 round-trip y semilla toda la cache downstream (family, expenses, fixed_expenses, savings_goals, etc.). Las pantallas leen de cache y no emiten requests propios.
4. **Warm prefetch de tabs** — `(tabs)/_layout.tsx` dispara `useWarmTabsSnapshots()` vía `InteractionManager.runAfterInteractions` para cachear los snapshots de Gastos y Control antes del primer tap del usuario.
5. **Server state** — React Query gestiona todo el estado de datos: `staleTime: 30s`, `gcTime: 24h`, `refetchOnWindowFocus: false`, retry 1 en queries y 0 en mutations. Queries financieras/PII se excluyen de la persistencia a disco.
6. **Realtime** — Supabase Realtime (no verificado en detalle en este snapshot) + invalidaciones dirigidas post-mutation.

### Patrón de estado

| Tipo de estado | Herramienta |
|---|---|
| Datos de servidor (expenses, family, profile) | React Query + Supabase |
| Preferencias persistidas (theme, motion) | AsyncStorage vía `persistent-kv.ts` |
| Auth session | Supabase + `expo-secure-store` (tokens en Keychain) |
| UI modal/overlay state | Module-level pub/sub (`modal-visibility.ts`, `numpad-visibility.ts`) |
| Animaciones / shared values | Reanimated `useSharedValue` |
| Tab navigation state | `tab-focus-pulse.ts` (pub/sub) |
| Emitters de eventos globales | `achievement-preview-emitter.ts`, `cycle-wrapped-emitter.ts`, `auth-transition-splash.ts` |
| Tour guides | `TourProvider` (in-house) |
| Preferencia de movimiento | `MotionPreferenceProvider` + `persistent-kv` |

---

## 2. Stack y dependencias

### Dependencias de producción

| Paquete | Versión | Para qué |
|---|---|---|
| `expo` | ~54.0.34 | Runtime y SDK base |
| `react` | 19.1.0 | UI |
| `react-native` | 0.81.5 | Mobile framework (New Architecture activa) |
| `expo-router` | ~6.0.23 | File-based routing + navegación |
| `@react-navigation/native` | ^7.1.8 | Primitivos de navegación |
| `react-native-screens` | ~4.16.0 | Native screen containers + `enableFreeze` |
| `react-native-gesture-handler` | ~2.28.0 | Gestos nativos (swipe, pan, press) |
| `react-native-reanimated` | 4.1.1 | Animaciones UI-thread / worklets |
| `react-native-worklets` | 0.5.1 | Worklets compartidos (Reanimated 4) |
| `@tanstack/react-query` | ^5.90.21 | Estado de servidor / cache |
| `@tanstack/react-query-persist-client` | ^5.100.6 | Persistencia de cache |
| `@tanstack/query-async-storage-persister` | ^5.100.6 | Persister con AsyncStorage |
| `@react-native-async-storage/async-storage` | 2.2.0 | Storage no-sensible (cache RQ, prefs) |
| `@supabase/supabase-js` | ^2.97.0 | Backend as a service (auth + DB + Realtime + Functions) |
| `expo-secure-store` | ~15.0.8 | Tokens JWT en Keychain / Android Keystore |
| `expo-local-authentication` | ~17.0.8 | Face ID / Touch ID (biometría) |
| `@gorhom/bottom-sheet` | ^5.2.10 | Bottom sheets (modales tipo tray) |
| `react-native-safe-area-context` | ~5.6.2 | Safe area insets |
| `expo-blur` | ~15.0.8 | BlurView nativa iOS (Liquid Glass tab bar) |
| `expo-linear-gradient` | ~15.0.8 | Gradientes (fallback Android en tab bar y UI) |
| `@shopify/react-native-skia` | 2.2.12 | Renderizado canvas 2D (splash, tour mask) — lazy-loaded vía `optional-skia.ts` |
| `react-native-svg` | 15.12.1 | SVG components |
| `expo-symbols` | ~1.0.8 | SF Symbols en iOS (tab bar icons) |
| `expo-haptics` | ~15.0.8 | Feedback háptico |
| `expo-notifications` | ~0.32.17 | Push notifications |
| `expo-font` | ~14.0.11 | Carga de fuentes custom |
| `expo-constants` | ~18.0.13 | Runtime environment detection (isExpoGo) |
| `expo-application` | ~7.0.8 | Metadata de la app |
| `expo-device` | ~8.0.10 | Info de dispositivo |
| `expo-asset` | ~12.0.12 | Gestión de assets |
| `expo-linking` | ~8.0.12 | Deep linking / scheme `manifiesto://` |
| `expo-clipboard` | ~8.0.8 | Clipboard |
| `expo-sqlite` | ~16.0.10 | SQLite local (uso específico no auditado en este snapshot) |
| `expo-apple-authentication` | ~8.0.8 | Sign in with Apple |
| `@react-native-google-signin/google-signin` | ^16.1.2 | Sign in with Google |
| `@react-native-community/netinfo` | 11.4.1 | Estado de conectividad |
| `react-native-url-polyfill` | ^2.0.0 | URL API polyfill para Supabase |
| `react-native-web` | ^0.21.0 | Web build target (test/demo) |
| `react-dom` | 19.1.0 | Web DOM |
| `expo-status-bar` | ~3.0.9 | Status bar theming |
| `@expo/metro-runtime` | ~6.1.2 | Metro bundler runtime |

### Dependencias de desarrollo

| Paquete | Versión | Para qué |
|---|---|---|
| `typescript` | ~5.9.2 | Type checking |
| `@types/react` | ~19.1.10 | Tipos React |
| `eslint` | ^9.39.1 | Linting |
| `typescript-eslint` | ^8.48.0 | ESLint para TS |
| `eslint-plugin-react-hooks` | ^7.0.1 | Rules of Hooks |
| `@eslint/js` | ^9.39.1 | ESLint base |
| `globals` | ^16.5.0 | Globals env para ESLint |
| `vitest` | ^3.2.4 | Unit testing |
| `@playwright/test` | ^1.59.1 | E2E testing |
| `supabase` | ^2.92.1 | Supabase CLI (migrations, types) |
| `sharp` | ^0.34.5 | Procesamiento de imágenes (assets) |

---

## 3. Configuración del proyecto

### `app.config.ts`

- **name**: `Manifiesto`, **slug**: `manifiesto`, **version**: `1.0.0`
- **scheme**: `manifiesto` (deep links)
- **orientation**: `portrait`
- **userInterfaceStyle**: `automatic` (dark mode system-driven)
- **newArchEnabled**: `true` → Fabric + JSI habilitados
- **Plugins**: `expo-router`, `expo-notifications`, `expo-local-authentication`, `expo-apple-authentication`, `expo-build-properties`, y condicionalmente `@react-native-google-signin/google-signin` (requiere `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`)
- **EXPO_PUBLIC_SUPABASE_URL** y **EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY** son las dos vars de entorno requeridas en runtime

### `eas.json`

```json
{
  "cli": { "version": ">= 16.18.0" },
  "build": {
    "preview": { "distribution": "internal" },
    "production": { "autoIncrement": true }
  }
}
```

Perfiles: `preview` (internal distribution) y `production` (auto-increment build number).

### `tsconfig.json`

- Extiende `expo/tsconfig.base`
- `"strict": true`
- **Path alias**: `@/*` → `./mobile/*` (resuelve `@/components`, `@/lib`, `@/theme`, etc.)
- **moduleSuffixes**: `[".native", ".web", ""]` → resolución platform-specific
- Incluye `app/**/*`, `mobile/**/*`, `app.config.ts`

### `babel.config.cjs`

Mínimo: solo `babel-preset-expo`. Sin plugins adicionales (Reanimated 4 ya no requiere el babel plugin).

### `metro.config.js`

Extiende `expo/metro-config`. Agrega `glb` y `gltf` a `assetExts` para soporte de modelos 3D. Usa ES modules (import/export).

### `eslint.config.js`

Flat config. Reglas activas: `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`. Ignora: `node_modules`, `.expo`, `dist`, `ios`, `android`, `legacy-web-src`. Las reglas `react-hooks/immutability` y `react-hooks/refs` están desactivadas por incompatibilidad con patrones Reanimated v4.

---

## 4. Routing y navegación

### Jerarquía de rutas (expo-router file-system)

```
app/
├── _layout.tsx          → RootLayoutShell (entry point)
├── index.tsx            → AppEntryGate (redirect hub)
├── auth/
│   ├── callback.tsx     → OAuth callback (animation: none)
│   └── reset-password.tsx
├── (auth)/
│   ├── _layout.tsx
│   ├── welcome.tsx      → Pantalla hero bienvenida
│   ├── login.tsx        → Login + biometría auto
│   ├── signup.tsx       → Registro
│   ├── forgot-password.tsx
│   └── join.tsx         → Unirse a familia existente
└── (app)/
    ├── _layout.tsx      → AppStackShell (Stack principal autenticado)
    ├── onboarding.tsx   → Wizard 5 pasos (modal)
    ├── add-expense.tsx  → Modal agregar gasto
    ├── add-fixed-expense.tsx → Modal gasto fijo
    ├── add-income.tsx   → Modal ingreso
    ├── household-setup.tsx → Modal config hogar
    ├── expense-categories.tsx → Modal categorías
    ├── asistente.tsx    → Modal asistente IA
    ├── savings-goal.tsx → Formulario meta de ahorro
    ├── notifications.tsx → Notificaciones (stack push)
    ├── settings.tsx     → Ajustes raíz (stack push)
    ├── settings/
    │   ├── notifications.tsx
    │   ├── family-admin.tsx
    │   ├── asistente.tsx
    │   ├── plan.tsx
    │   ├── achievements.tsx
    │   ├── editions.tsx
    │   ├── dev-health.tsx
    │   └── dev/
    │       ├── preview.tsx
    │       └── cycle-wrapped.tsx
    ├── coach/
    │   └── [signalId].tsx → Coach screen (modal, param dinámico)
    └── (tabs)/
        ├── _layout.tsx  → TabsLayout (AppTabs + prefetch)
        ├── home.tsx     → Tab Inicio
        ├── expenses.tsx → Tab Gastos
        ├── add.tsx      → Tab FAB central (Agregar)
        ├── fixed-expenses.tsx → Tab Fijos
        └── insights.tsx → Tab Control
```

### Tabla ruta → propósito

| Ruta expo-router | Rol / Pantalla |
|---|---|
| `/` (`app/index.tsx`) | Hub de redirección (`AppEntryGate`) — no user-visible |
| `/(auth)/welcome` | Hero de bienvenida, opciones login/signup |
| `/(auth)/login` | Login con email/password + biometría auto (`?autoBiometric=1`) |
| `/(auth)/signup` | Registro nuevo usuario |
| `/(auth)/forgot-password` | Reset password flow |
| `/(auth)/join` | Unirse a familia con código |
| `/auth/callback` | Redirect OAuth (animation: none) |
| `/auth/reset-password` | Reset password confirm |
| `/(app)/(tabs)/home` | Dashboard principal (Inicio) |
| `/(app)/(tabs)/expenses` | Lista de gastos del ciclo |
| `/(app)/(tabs)/add` | FAB central → `AddQuickActionsOverlay` |
| `/(app)/(tabs)/fixed-expenses` | Gastos fijos / recurrentes |
| `/(app)/(tabs)/insights` | Control — asesor + análisis |
| `/(app)/onboarding` | Wizard inicial (modal, `gestureEnabled: false`) |
| `/(app)/add-expense` | Modal agregar gasto rápido |
| `/(app)/add-fixed-expense` | Modal agregar gasto fijo |
| `/(app)/add-income` | Modal agregar ingreso |
| `/(app)/household-setup` | Modal configurar hogar / ciclo de pago |
| `/(app)/expense-categories` | Modal gestión de categorías |
| `/(app)/asistente` | Modal asistente IA chat |
| `/(app)/savings-goal` | Formulario meta de ahorro |
| `/(app)/notifications` | Bandeja de notificaciones |
| `/(app)/settings` | Ajustes raíz |
| `/(app)/settings/notifications` | Ajustes de notificaciones |
| `/(app)/settings/family-admin` | Administración de familia |
| `/(app)/settings/asistente` | Ajustes del asistente |
| `/(app)/settings/plan` | Plan / suscripción |
| `/(app)/settings/achievements` | Logros |
| `/(app)/settings/editions` | Ediciones especiales |
| `/(app)/settings/dev-health` | Health check dev |
| `/(app)/coach/[signalId]` | Coach screen por señal de asesor |

### Stack options por segmento

**`ThemedRootStack` (root `_layout`)**:
- `headerShown: false`, `freezeOnBlur: true`
- `animation: 'default'` (iOS) / `'fade_from_bottom'` (Android)
- `animationMatchesGesture: true`, `fullScreenGestureEnabled: false`
- `contentStyle: { backgroundColor: theme.colors.canvas }` → elimina white flash en dark mode
- Excepciones: `index` y `auth/callback` → `animation: 'none'`

**`AppStackShell` (Stack autenticado en `(app)/_layout`)**:
- `animation: 'default'` (iOS) / `'ios_from_right'` (Android) → `STACK_PUSH_ANIMATION`
- `animationDuration: motionDurations.enterStack` (280ms) — solo honrado en Android
- Modales: `presentation: 'modal'` (iOS) / `'card'` (Android), `MODAL_ANIMATION`, `enterModal: 320ms`, `gestureDirection: 'vertical'`
- `(tabs)` → `animation: 'none'` (splash cubre la transición)
- `settings/*` y `notifications` → `freezeOnBlur: true`, `fullScreenGestureEnabled: false`

**Decisión arquitectural registrada**: se mantiene `@react-navigation/native-stack` (no JS stack) por: (1) transiciones off-JS-thread, (2) swipe-back nativo + Predictive Back Android 14+, (3) compatibilidad con RNGH-heavy screens.

### Tab bar custom

**`AppTabs`** ([mobile/components/navigation/app-tabs.tsx](../../../mobile/components/navigation/app-tabs.tsx)):

Cinco tabs: **Inicio** · **Gastos** · **Agregar** (FAB) · **Fijos** · **Control**

Opciones globales:
- `freezeOnBlur: false` — crítico para RNGH (ver memory: rompe swipe-to-delete si `true`)
- `lazy: false` — pre-monta los 5 tab screens al boot (~80ms extra) → first-tap instantáneo
- `animation: 'none'` — eliminado el slide `shift` de 220ms; switch 1 frame como UITabBarController nativo
- `sceneStyle: { backgroundColor: theme.colors.background }`
- `tabBarStyle: buildFloatingTabBarStyle(theme)` (floating pill, radius 32, shadow elevado)
- `tabBarHideOnKeyboard: true`

**`TabBarBackground`** ([mobile/components/navigation/tab-bar-background.tsx](../../../mobile/components/navigation/tab-bar-background.tsx)):
- iOS: `expo-blur` `BlurView` con `tint: 'systemChromeMaterialLight|Dark'`, `intensity: 80` → **Liquid Glass** nativa (UIVisualEffectView, 0 cost JS thread)
- Android: `LinearGradient` fallback (tema-aware, 3 stops)
- Hairline brand accent (gradiente horizontal con `brand.bright`) + inset border

**`TabBarIcon`** ([mobile/components/navigation/tab-bar-icon.tsx](../../../mobile/components/navigation/tab-bar-icon.tsx)):
- `AppSymbol` (SF Symbols en iOS / MaterialIcons en Android) con color dinámico
- **focusDot**: punto 4×4px sobre el icono, spring-animated con `motionSprings.tabIcon` (Reanimated)
- alertDot naranja para Control cuando hay señales de alta prioridad sin leer

**`TabBarPressable`** ([mobile/components/navigation/tab-bar-pressable.tsx](../../../mobile/components/navigation/tab-bar-pressable.tsx)):
- Wrap para los 4 tabs regulares (no FAB)
- Scale 0.94 + spring en press como feedback táctil

**`AddExpenseTabButton`** ([mobile/components/navigation/add-expense-tab-button.tsx](../../../mobile/components/navigation/add-expense-tab-button.tsx)):
- Tab central (FAB). Tiene burst ring propio, comportamiento diferenciado
- Al tap abre `AddQuickActionsOverlay` ([mobile/components/navigation/add-quick-actions-overlay.tsx](../../../mobile/components/navigation/add-quick-actions-overlay.tsx)) — overlay con acciones rápidas (gasto / ingreso / fijo)

**`AddExpenseTabButtonFace`** ([mobile/components/navigation/add-expense-tab-button-face.tsx](../../../mobile/components/navigation/add-expense-tab-button-face.tsx)):
- Presentación visual del botón FAB (separada del modelo)

**`add-expense-tab-button.model.ts`**: lógica/estado del FAB central

**`tab-label.tsx`**: label del tab, se pone en bold cuando focused

**Bridges montados en `AppStackShell`**:
- `DailyBudgetNudgeBridge` — siempre montado (post-auth)
- `GlobalSettingsModalsHost` — modales de ajustes globales
- `GlobalAdvisorActionHost` — host de acciones del asesor IA
- `AchievementUnlockBridge` — bridge de logros desbloqueados
- `CycleWrappedBridge` — bridge de resumen de ciclo

**Contexto de refactor NAV (⚠ LIVE)**:
Commit `7962ea2` es el último de una serie de experimentos de navegación:
- `97387ac`: Liquid Glass sliding pill (luego revertido)
- `e035900`: swap a NativeTabs (Liquid Glass iOS 26 nativo) — path A test
- `01f3e53`: rollback a AppTabs custom + speed boost replicado
- `08cd449`: restaurar focusDot + 4 fixes 60fps
- `7962ea2` (actual): refactor por etapas — prefetch + press feedback + Liquid Glass bg + speed boost

El estado actual es AppTabs custom (no NativeTabs). Las dos optimizaciones clave replicadas de NativeTabs son `lazy: false` + `animation: 'none'`.

---

## 5. Theme system

### Archivos

| Archivo | Contenido |
|---|---|
| [`mobile/theme/palette.ts`](../../../mobile/theme/palette.ts) | Tokens de color (`lightColors`, `darkColors`), escalas (`primaryScale`, `accentScale`, `surfaceScale`), `brand`, `cream`, interfaz `AppTheme`, `buildTheme()` |
| [`mobile/theme/theme-provider.tsx`](../../../mobile/theme/theme-provider.tsx) | `AppThemeProvider`, `useAppTheme()`, `useCategoryHue()`, `useCategoryHueByName()` |
| [`mobile/theme/typography.ts`](../../../mobile/theme/typography.ts) | Presets tipográficos (`TypographyPresetKey`, `typography: Record<TypographyPresetKey, TextStyle>`) |
| [`mobile/theme/elevation.ts`](../../../mobile/theme/elevation.ts) | `buildElevationStyle()`, `buildFloatingTabBarStyle()` |
| [`mobile/theme/interaction.ts`](../../../mobile/theme/interaction.ts) | `MIN_TOUCH_TARGET = 44`, `DEFAULT_HIT_SLOP`, `DEFAULT_PRESS_RETENTION_OFFSET`, `buildMinimumTouchTargetHitSlop()` |
| [`mobile/theme/category-hues.ts`](../../../mobile/theme/category-hues.ts) | Hues por categoría (comida, transporte, casa, salud, ocio, servicios, ropa, otros), `resolveCategoryHue()`, `resolveCategoryHueByName()` |
| [`mobile/theme/color-utils.ts`](../../../mobile/theme/color-utils.ts) | Utilidades de color (`withAlpha()`) |
| [`mobile/theme/state-tokens.ts`](../../../mobile/theme/state-tokens.ts) | `SemanticState`, `StateTokens`, `getStateTokens()`, `urgencyToState()`, `REINFORCEMENT_TASK_IDS` |
| [`mobile/theme/auth-theme.ts`](../../../mobile/theme/auth-theme.ts) | `authPalette` — tokens específicos de pantallas auth |
| [`mobile/theme/screen-header.ts`](../../../mobile/theme/screen-header.ts) | `ScreenHeaderPalette`, `buildScreenHeaderPalette()` |

### Paleta V1 ("Mint Saturado")

Generada 2026-05-03. Seeds:
- **primary**: `hsl(106, 75%, …)` — mint saturado / verde herbal
- **accent**: `hsl(16, 80%, …)` — coral signal-orange
- **surface**: `hsl(153, 30%, …)` — forest neutral

Tokens clave (light / dark):
- `canvas`: `#F4F2ED` / `#12211A` (fondo raíz, eliminador de white flash)
- `primary`: `#297811` / (primary-300) — AA-safe en cream
- `text`: `#12211A` / cream
- `surface`: `#FFFFFF` / surface elevado

`AppTheme` incluye: `colors: ThemeColors`, `brand`, `isDark`, `mode`, `spacing`, `radii`, `typography`.

### Preferencia y resolución de tema

- `ThemePreference`: `'system' | 'light' | 'dark'`
- Persistido en `AsyncStorage` vía `persistent-kv.ts` con key `manifiesto:theme-preference`
- `AppThemeProvider` lee el scheme del sistema (`useColorScheme`) y lo combina con la preferencia guardada
- El cambio de tema es instantáneo (useMemo sobre `buildTheme(resolvedMode)`)

### Consumo del theme

Todos los componentes consumen vía `useAppTheme()`. En `AppProviders` y `ThemedRoot`, los colores de canvas se hardcodean (`CANVAS_LIGHT = '#F4F2ED'`, `CANVAS_DARK = '#12211A'`) porque `GestureHandlerRootView` vive fuera del `AppThemeProvider`.

---

## 6. Providers y bootstrap

### Orden de montaje en `AppProviders`

```
GestureHandlerRootView (backgroundColor: rootBg)
  SafeAreaProvider
    PersistQueryClientProvider (queryClient + queryPersister)
      AppThemeProvider
        MotionPreferenceProvider
          BottomSheetModalProvider
            StatusBarBridge (light/dark status bar)
              TourProvider
                {children}
```

**`GestureHandlerRootView`**: color de fondo hardcodeado (fuera del theme provider). Necesario para RNGH.

**`SafeAreaProvider`**: insets de safe area para toda la app.

**`PersistQueryClientProvider`**: rehidrata el cache de React Query desde AsyncStorage en cold start. Queries financieras excluidas de persistencia (ver sección 9).

**`AppThemeProvider`**: provee `theme` y `setPreference`. Lee preferencia de AsyncStorage async en mount.

**`MotionPreferenceProvider`**: expone preferencia de animaciones (`'auto' | 'always' | 'never'`). `useReducedMotion()` la consume para decidir si loops decorativos corren.

**`BottomSheetModalProvider`**: contexto para `@gorhom/bottom-sheet`.

**`StatusBarBridge`**: lee `theme.isDark` y setea `StatusBar style='light'|'dark'`.

**`TourProvider`**: overlay del tour guiado. Implementación in-house (reemplazó `react-native-copilot` por incompatibilidades con Fabric + RNGH). Usa Reanimated worklets + SVG mask animada.

### Bootstrap de `RootLayoutShell`

Importa `@/lib/runtime` (side-effect: `enableFreeze()`, URL polyfill, LogBox filters). Monta:
1. `RootErrorBoundary` — error boundary global
2. `AppProviders` — todos los providers
3. `ThemedRoot` — wrapper con `backgroundColor: theme.colors.canvas`
4. `NotificationRouterBridge` — rutea notificaciones push entrantes
5. `ThemedRootStack` — Stack raíz con `contentStyle` theme-aware
6. `GlobalConnectivityWatcher` — monitorea NetInfo; si offline eleva `auth-transition-splash` a `error('network')`
7. `AuthLaunchSplash` — cold-start splash (solo native, solo 1 vez por proceso)
8. `TransitionOverlay` — siempre montado en native, condicional en web; contiene `AuthTransitionSplash`

---

## 7. Infra lib y runtime

### Inventario completo `mobile/lib/`

| Archivo | Propósito |
|---|---|
| [`runtime.ts`](../../../mobile/lib/runtime.ts) | Side-effects de inicialización: `enableFreeze()`, URL polyfill, LogBox filters (Supabase auth noise, expo-gl) |
| [`runtime-environment.ts`](../../../mobile/lib/runtime-environment.ts) | `isExpoGo`, `canUseNativePushNotifications` |
| [`query-client.ts`](../../../mobile/lib/query-client.ts) | `queryClient` (staleTime 30s, gcTime 24h, retry 1/0), `queryPersister` (AsyncStorage, throttle 1s), `queryPersistOptions` (excluye queries sensibles/financieras) |
| [`supabase.ts`](../../../mobile/lib/supabase.ts) | `supabase` — cliente Supabase con `supabase-secure-storage` como auth storage |
| [`supabase-secure-storage.ts`](../../../mobile/lib/supabase-secure-storage.ts) | Adapter SecureStore → AsyncStorage-like API para Supabase auth; chunking de valores (1800B < 2KB limit) |
| [`persistent-kv.ts`](../../../mobile/lib/persistent-kv.ts) | `getPersistentValue`, `setPersistentValue`, `deletePersistentValue` — wraps AsyncStorage (web: localStorage) |
| [`biometric-auth.ts`](../../../mobile/lib/biometric-auth.ts) | `getBiometricLoginState`, `saveBiometricCredentials`, `updateStoredRefreshToken`, `clearBiometricCredentials`, `getBiometricCredentials`, `authenticateBiometricAccess` |
| [`last-user-cache.ts`](../../../mobile/lib/last-user-cache.ts) | Cache del último perfil de usuario (email, display name, avatar) para personalizar hero de login en frío |
| [`profile-display-name-cache.ts`](../../../mobile/lib/profile-display-name-cache.ts) | Cache in-memory de display names por userId |
| [`single-entry-memo.ts`](../../../mobile/lib/single-entry-memo.ts) | `singleEntryMemoize()` — memoización de 1 entrada (evita re-crear objetos costosos con mismos args) |
| [`modal-visibility.ts`](../../../mobile/lib/modal-visibility.ts) | Pub/sub module-level: `publishModalOpen`, `publishModalClose`, `useIsAnyModalOpen` — evita doble KeyboardAvoidingView |
| [`numpad-visibility.ts`](../../../mobile/lib/numpad-visibility.ts) | Pub/sub: `publishNumpadOpen(height)`, `publishNumpadClose`, `useNumpadOffset` |
| [`tab-focus-pulse.ts`](../../../mobile/lib/tab-focus-pulse.ts) | Pub/sub de eventos de tab: `publishTabPress`, `getLastTabPulse`, `subscribeTabPress`, `TAB_ORDER`, `tabDirection()` |
| [`auth-transition-splash.ts`](../../../mobile/lib/auth-transition-splash.ts) | Estado global del splash de transición auth: `showAuthTransitionSplash`, `markAuthTransitionLoaded`, `reportAuthTransitionError`, `hideAuthTransitionSplash`, `useAuthTransitionSplash`. Fases: `'hidden' | 'loading' | 'loaded' | 'error'` |
| [`auth-transition-dismiss-gate.ts`](../../../mobile/lib/auth-transition-dismiss-gate.ts) | `shouldDismissAuthTransition()` — lógica pura de decisión de dismiss |
| [`achievement-preview-emitter.ts`](../../../mobile/lib/achievement-preview-emitter.ts) | `triggerAchievementPreview(item)`, `useAchievementPreviewListener(callback)` — emitter de logros |
| [`cycle-wrapped-emitter.ts`](../../../mobile/lib/cycle-wrapped-emitter.ts) | `triggerCycleWrapped(payload)`, `useCycleWrappedListener(callback)` — emitter de resumen de ciclo |
| ~~`permission-priming-state.ts`~~ | 🗑️ **Eliminado 2026-05-22** — 0 imports (Bucket 3 de [09](09-candidatos-a-eliminar.md)) |
| [`haptics.ts`](../../../mobile/lib/haptics.ts) | `triggerHaptic(tone: AppHapticTone)` — wrapper de `expo-haptics` |
| [`legal-urls.ts`](../../../mobile/lib/legal-urls.ts) | `PRIVACY_POLICY_URL`, `TERMS_OF_SERVICE_URL`, `SUPPORT_EMAIL`, `buildSupportMailto()` |
| [`optional-skia.ts`](../../../mobile/lib/optional-skia.ts) | `getOptionalSkiaModule()` — lazy-load de `@shopify/react-native-skia` (puede fallar en Expo Go si no está disponible) |
| [`send-family-push.ts`](../../../mobile/lib/send-family-push.ts) | `sendFamilyPush(input)` — invoca Edge Function `send-family-push` vía Supabase |
| [`motion/tokens.ts`](../../../mobile/lib/motion/tokens.ts) | `motionDurations`, `decorativeDurations`, `motionSprings`, `motionEasings`, `motionStagger` — tokens de movimiento unificados |
| [`motion/index.ts`](../../../mobile/lib/motion/index.ts) | Re-export de tokens de motion |
| [`copy/`](../../../mobile/lib/copy/) | `auth-greetings.ts`, `states.ts` — textos/copys de la app en es-AR. ~~`glossary.ts`~~ y ~~`index.ts`~~ 🗑️ **Eliminados 2026-05-22** (0 imports, Bucket 3 de [09](09-candidatos-a-eliminar.md)) |

### Notas de seguridad en infra

- **Tokens JWT**: en Keychain/Android Keystore vía `supabase-secure-storage.ts` (chunking transparente para superar el límite de 2KB de SecureStore)
- **Cache RQ**: queries financieras (`home_snapshot`, `expenses`, `fixed-expenses`, `savings-goals`, `insights`, etc.) excluidas de AsyncStorage (plaintext en disco). Versión de buster: `manifiesto-cache-v3`
- **enableFreeze**: activo en `runtime.ts`. Tabs tienen `freezeOnBlur: false` (no los afecta). Stack screens con `freezeOnBlur: true` sí se freezan → ahorro JS thread fuera de pantalla

---

## 8. Hooks globales

### Inventario `mobile/hooks/`

| Hook | Firma | Propósito |
|---|---|---|
| [`use-current-date.ts`](../../../mobile/hooks/use-current-date.ts) | `useCurrentDate(): Date` | Fecha actual con actualización automática a medianoche |
| [`use-daily-budget-nudges.ts`](../../../mobile/hooks/use-daily-budget-nudges.ts) | `useDailyBudgetNudges()` | Nudges de presupuesto diario (lógica + triggers) |
| [`use-family-dashboard.ts`](../../../mobile/hooks/use-family-dashboard.ts) | `useFamilyDashboard(familyId?): FamilyDashboard` | Datos del dashboard familiar (compuesto de múltiples queries) |
| [`use-is-navigation-settled.ts`](../../../mobile/hooks/use-is-navigation-settled.ts) | `useIsNavigationSettled(): boolean` | True cuando el navigator terminó de montar (evita animaciones prematuras) |
| [`use-keyboard-height.ts`](../../../mobile/hooks/use-keyboard-height.ts) | `useKeyboardHeight(): number` | Altura actual del teclado (0 cuando oculto) |
| [`use-loop-animation.ts`](../../../mobile/hooks/use-loop-animation.ts) | `useLoopAnimation(options)` | Loop animado con `withRepeat`, respeta `useReducedMotion` |
| [`use-online-status.ts`](../../../mobile/hooks/use-online-status.ts) | `useOnlineStatus(): boolean` | Estado de conectividad vía NetInfo (con lógica `resolveOnline` que descarta `unknown`) |
| [`use-pay-cycle.ts`](../../../mobile/hooks/use-pay-cycle.ts) | `usePayCycle(familyId?): UsePayCycleResult` | Ciclo de pago actual (fecha de inicio/fin, días restantes) |
| [`use-press-scale.ts`](../../../mobile/hooks/use-press-scale.ts) | `usePressScale(options?): ...` | Scale 0.94 + spring en press (Reanimated) |
| [`use-reduced-motion.ts`](../../../mobile/hooks/use-reduced-motion.ts) | `useReducedMotion(): boolean` | Combina `MotionPreferenceProvider` + accesibilidad del sistema |
| [`use-tab-haptics.ts`](../../../mobile/hooks/use-tab-haptics.ts) | `useTabHaptics(): screenListeners` | Listeners de haptics para `Tabs.screenListeners` |
| [`use-unbounded-loop-animation.ts`](../../../mobile/hooks/use-unbounded-loop-animation.ts) | `useUnboundedLoopAnimation(options)` | Loop sin límite de ciclos, para animaciones decorativas |
| [`use-warm-tabs-snapshots.ts`](../../../mobile/hooks/use-warm-tabs-snapshots.ts) | `useWarmTabsSnapshots(): void` | Prefetch de snapshots Gastos + Control vía `InteractionManager.runAfterInteractions` |

---

## 9. Patrón de manejo de estado

### Estado de servidor (React Query + Supabase)

**Configuración global** (`mobile/lib/query-client.ts`):
- `staleTime: 30_000` (30s default, individual queries pueden sobreescribir)
- `gcTime: 24 * 60 * 60 * 1000` (24h — queries viven en cache hasta que el persister las guarda)
- `refetchOnWindowFocus: false` (evita thundering herd en foreground)
- `retry: 1` en queries, `retry: 0` en mutations

**Persistencia selectiva**:
- Persiste: preferencias de UI, datos no financieros, queries success
- Excluye: todo lo financiero/PII, auth, family, profile (routing-critical)
- Buster: `manifiesto-cache-v3` — bump para invalidar on schema changes

**Patrón Snapshot RPC** (aplicado en `home_snapshot`, `gastos_snapshot`):
- Un solo RPC colapsa N round-trips en 1
- Monta en `AppStackShell` antes que cualquier screen
- Semilla toda la cache downstream → downstream hooks leen de cache sin network

**Freshness**: invalidaciones post-mutation dirigidas + Supabase Realtime (no auditado en detalle en este snapshot).

**Coherencia cross-screen tras mutaciones (2026-05-29)** — toda mutación core de la app hace dos cosas para que el cambio se vea instantáneo en TODAS las superficies relacionadas sin reloads:

1. **Optimistic en `onMutate`**: snapshot del cache previo + `setQueryData` con el cambio anticipado en las queries afectadas. Rollback en `onError` + `toast.error('No se pudo guardar', { actionLabel: 'Reintentar' })` (toast bus en `mobile/lib/toast-bus.ts` + `<ToastHost />` montado en `app-stack-shell`).
2. **Invalidación centralizada en `onSettled`**: helper `syncAllAfterMutation(qc, { familyId, userId, scopes })` en `mobile/lib/sync-after-mutation.ts`. Scopes: `'expenses' | 'fixed' | 'fixedPayment' | 'income' | 'savings' | 'notifications' | 'wrapped'`. Cada scope expande a un set de keys que incluye los snapshot roots (`homeSnapshotQueryKey`, `gastos-snapshot` prefix) — esto resuelve el clobbering estructural donde el re-seed del snapshot pisaba el optimistic con data vieja.

Mutaciones que aplican el patrón: `useCreate/Update/DeleteExpense`, los 5 hooks de `use-fixed-expenses` (create/update/updateStatus/recordPayment/delete), `useUpsertSavingsGoal`, `useCreateIncomeEvent`, `useDeleteNotification`, `useDeleteAllNotifications`, `useMarkCycleWrappedSeen`. El helper legacy `invalidateFamilyBudgetData` quedó como wrapper de compat que llama al nuevo helper. Spec: [docs/superpowers/specs/2026-05-29-state-sync-design.md](../../superpowers/specs/2026-05-29-state-sync-design.md).

### Estado UI

| Mecanismo | Cuándo se usa |
|---|---|
| `useSharedValue` (Reanimated) | Valores animados (posición, opacidad, scale, progreso) |
| `useAnimatedStyle` / `useAnimatedProps` | Estilos derivados en worklet thread |
| Module-level pub/sub | `modal-visibility`, `numpad-visibility`, `tab-focus-pulse`, `auth-transition-splash`, emitters — estado global no-React efímero |
| React Context | `AppThemeProvider`, `MotionPreferenceProvider`, `TourProvider` |
| `useState` local | Estado de UI en componente (formularios, toggles, loading local) |

**Regla de worklets**: no llamar funciones JS inline desde worklets. Usar `runOnJS(callback)()`. No usar `Intl`/locale adentro de worklets (crashean Expo Go). `Easing` debe venir de Reanimated, no de `react-native`.

### Estado de auth y sesión

- `useAuthSession` → query React Query sobre `supabase.auth.getSession()` — NO persiste a disco
- Tokens en `expo-secure-store` (Keychain) vía `supabase-secure-storage.ts`
- Biometría: `biometric-auth.ts` gestiona credenciales en SecureStore separado del auth session
- App-lock: pattern bancario — re-confirmación biométrica en cada cold start

---

## 10. Estado vs deuda

| Área | Estado | Notas |
|---|---|---|
| New Architecture (Fabric + JSI) | ✅ LIVE | `newArchEnabled: true` en app.config.ts |
| Tab bar Liquid Glass (iOS) | ✅ LIVE | `expo-blur` `systemChromeMaterial*`, commit 7962ea2 |
| focusDot Reanimated | ✅ LIVE | Restaurado en 08cd449 tras prueba de pill |
| `lazy: false` + `animation: 'none'` en tabs | ✅ LIVE | Speed boost replicado de NativeTabs, commit 7962ea2 |
| `enableFreeze()` + `freezeOnBlur: true` en stacks | ✅ LIVE | Activo desde runtime.ts |
| `freezeOnBlur: false` en tabs (RNGH safety) | ✅ LIVE | Explícito en AppTabs.screenOptions |
| Snapshot RPC pattern (home_snapshot) | ✅ LIVE | AppStackShell + TabsLayout + useWarmTabsSnapshots |
| React Query cache buster v3 (excl. datos financieros) | ✅ LIVE | query-client.ts |
| Auth tokens en Keychain (SecureStore) | ✅ LIVE | Reemplazó expo-sqlite/localStorage |
| Biometric app-lock (cold start) | ✅ LIVE | AppEntryGate + biometric-auth.ts |
| Theme system V1 "Mint Saturado" | ✅ LIVE | palette.ts, en migración componente por componente |
| TourProvider in-house | ✅ LIVE | Reemplazó react-native-copilot (Fabric incompatible) |
| NativeTabs (iOS 26 Liquid Glass nativo) | ⏸️ EN PAUSA | Path A revertido (e035900 → 01f3e53); AppTabs custom es el estado actual |
| Sliding pill Reanimated (era path B) | ⏸️ EN PAUSA | 97387ac → revertido en 08cd449 |
| Palette V1 migración completa | 🟡 PARCIAL | Home migrado; otros screens en proceso |
| Supabase Realtime subscriptions | (no verificado) | No auditado en detalle en este snapshot |
| Gastos snapshot RPC | ✅ LIVE | Patrón replicado (ver MEMORY) |
| Web build (`react-native-web`) | 🟡 PARCIAL | Funcional como target de test/demo; quirks de splash/wordmark documentados en RootLayoutShell |

---

*Documento generado automáticamente por agente de documentación técnica · 2026-05-21 · commit `7962ea2`*
