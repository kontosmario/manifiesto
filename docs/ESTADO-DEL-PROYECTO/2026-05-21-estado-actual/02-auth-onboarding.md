# Auth y Onboarding — Estado actual

> Verificado contra commit `7962ea2` · 2026-05-21 · parte del snapshot docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/

---

## 1. Visión general

### Flujo frío (cold start sin sesión)

```
Cold start (sin sesión)
       │
       ▼
AppEntryGate (root layout)
       │
       ├─ biometricCheck → hasSavedCredentials?
       │       YES → /(auth)/login?autoBiometric=1
       │       NO  → /(auth)/welcome
       │
   AuthLaunchSplash (overlay durante el boot)
```

```
/(auth)/welcome
       │
   "Empezar"  ──────────────────────────────► /(auth)/signup
   "Ya tengo cuenta" ────────────────────────► /(auth)/login
```

```
/(auth)/login
       │
  [Returning user: Face ID hero]
       ├─ Tap "Entrar con Face ID"
       │      └─ biometric OK → showAuthTransitionSplash → router.replace('/') → AppEntryGate → /(app)/(tabs)/home
       │
  [formMode=use-password / change-account]
       ├─ email + password → supabase.auth.signInWithPassword
       │      └─ OK → showAuthTransitionSplash → router.replace('/')
       ├─ "Olvidé mi contraseña" → /(auth)/forgot-password
       └─ "Continuar con Apple" → signInWithApple → Supabase → session detectada → AppEntryGate
```

```
/(auth)/signup
       │
  email+nombre+password ──► supabase.auth.signUp
       │
  ┌────┴───────────────────────────────────────────────────┐
  │ hasSession=true → showAuthTransitionSplash             │
  │      └─ router.replace('/(app)/onboarding')            │
  │                                                        │
  │ hasSession=false (email sin confirmar)                 │
  │      └─ panel "Revisá tu mail" + resend con cooldown   │
  └────────────────────────────────────────────────────────┘
  Social (Apple/Google) → signInWithIdToken → router.replace('/(app)/onboarding')
```

### Cold start con sesión válida

```
AppEntryGate
       │
       ├─ biometricLock=true → /(auth)/login?lock=1
       │        └─ Face ID OK → markAppUnlocked → router.replace('/')
       │
       └─ profileQuery.onboarding_completed_at?
               NO  → /(app)/onboarding
               YES → /(app)/(tabs)/home
```

### Manejo de sesión

- `useAuthSession` (React Query, `staleTime: Infinity`) suscribe a `supabase.auth.onAuthStateChange`.
- En `SIGNED_OUT`: limpia todas las queries (excepto `auth`), elimina el caché persistido de AsyncStorage, borra `lastUserProfile` de SecureStore.
- La sesión se persiste automáticamente por el cliente Supabase (SecureStore en native vía `supabase-secure-storage.ts`).
- El refresh token rotativo se almacena también en SecureStore como `auth.biometric.credentials` para el flujo biométrico; se actualiza tras cada `auth.refreshSession` exitoso.

---

## 2. Screens

### Tabla de rutas → screen → propósito

| Ruta (expo-router) | Archivo de ruta | Screen | Propósito |
|---|---|---|---|
| `/(auth)/welcome` | [welcome.tsx](../../../app/(auth)/welcome.tsx) | [welcome-screen.tsx](../../../mobile/screens/auth/welcome-screen.tsx) | Primera pantalla de usuario no autenticado. CTAs "Empezar" / "Ya tengo cuenta". |
| `/(auth)/login` | [login.tsx](../../../app/(auth)/login.tsx) | [login-screen.tsx](../../../mobile/screens/auth/login-screen.tsx) | Login Face ID-first, password fallback, Apple Sign-In. También app-lock (`?lock=1`). |
| `/(auth)/signup` | [signup.tsx](../../../app/(auth)/signup.tsx) | [signup-screen.tsx](../../../mobile/screens/auth/signup-screen.tsx) | Registro: nombre + email + password + Apple + Google. |
| `/(auth)/join` | [join.tsx](../../../app/(auth)/join.tsx) | [join-screen.tsx](../../../mobile/screens/auth/join-screen.tsx) | Crear o unirse a grupo familiar (path alternativo a onboarding). |
| `/(auth)/forgot-password` | [forgot-password.tsx](../../../app/(auth)/forgot-password.tsx) | [forgot-password-screen.tsx](../../../mobile/screens/auth/forgot-password-screen.tsx) | Solicita email y envía link de reset. |
| `app/auth/callback` | [callback.tsx](../../../app/auth/callback.tsx) | [auth-callback-screen.tsx](../../../mobile/screens/auth/auth-callback-screen.tsx) | Intercepta deep link de confirmación de email (PKCE). |
| `app/auth/reset-password` | [reset-password.tsx](../../../app/auth/reset-password.tsx) | [reset-password-screen.tsx](../../../mobile/screens/auth/reset-password-screen.tsx) | Recibe `?code=` del link de reset, intercambia PKCE, formulario nueva contraseña. |
| `/(app)/onboarding` | [onboarding.tsx](../../../app/(app)/onboarding.tsx) | [onboarding-screen.tsx](../../../mobile/screens/home/onboarding-screen.tsx) | Wizard de 5 pasos post-signup. |
| `/(app)/household-setup` | [household-setup.tsx](../../../app/(app)/household-setup.tsx) | [household-setup-screen.tsx](../../../mobile/screens/settings/household-setup-screen.tsx) | Re-configuración del hogar (desde Settings). |

> **Layout del stack auth:** [`app/(auth)/_layout.tsx`](../../../app/(auth)/_layout.tsx) — `Stack` con `animation: 'fade'`, `animationDuration: 240`, `headerShown: false`, `freezeOnBlur: true`. `contentStyle.backgroundColor` = canvas del tema para eliminar flash blanco entre transiciones en dark mode.

---

### Narrativa por screen

#### `welcome-screen.tsx` — Welcome
- **Fondo:** verde oscuro (`authTokens.welcomeBg`) con 2 blobs aurora (sin JS, animación independiente) + 8 partículas flotantes (loops sin/coseno, 10–14s).
- **Hero:** `FernLogo` 220px → wordmark "Manifiesto." (punto en peach) → tagline "Finanzas para tu familia". Stagger `RiseView` en 1100/1300/1500ms.
- **CTAs:** "Empezar" (cream sobre verde, flecha) → `onCreate()` → `push('/(auth)/signup')`. "Ya tengo cuenta" (outline) → `onLogin()` → `push('/(auth)/login')`.
- **Footer:** disclosure de privacidad + links a Términos y Privacidad (via `Linking.openURL`).
- **Efecto en mount:** llama `markAuthTransitionLoaded()` para destrabar el splash overlay si venía de un logout.
- **Animaciones deshabilitadas** bajo `useReducedMotion`.

#### `login-screen.tsx` — Login (Face ID-first)
- **Modos de presentación:**
  - **Returning user** (biometric guardado O caché de perfil previo): muestra hero personalizado con avatar animal + nombre/email. Botón principal: "Entrar con Face ID" con animación de scan pulsante. Secundarios: "Usar contraseña" y "Cambiar cuenta".
  - **First-time** (sin sesión previa en dispositivo): hero genérico "Hola de vuelta" con Fern logo. Directamente abre `formMode='change-account'`.
  - **App-lock** (`?lock=1`): mismo hero returning, pero Face ID solo llama `authenticateBiometricAccess` + `markAppUnlocked` + `router.replace('/')` sin Supabase refresh.
  - **Auto-biometric** (`?autoBiometric=1`): dispara `triggerFaceID()` automáticamente al montar (una sola vez, guarda con `autoBiometricFiredRef`).
- **Qué bloque de acción se muestra:** decidido por el helper puro `resolveLoginActionView({ formMode, isLockMode, hasSavedBiometric, isReturningUser })` ([login-action-view.ts](../../../mobile/features/auth/login-action-view.ts), testeado). **Invariante de lock mode:** en `?lock=1` el CTA "Entrar con Face ID" se muestra SIEMPRE (no condicionado al re-sondeo `hasSavedBiometric`), porque AppEntryGate solo entra a lock mode si la biometría está habilitada. Esto corrige un bug donde, al cancelar el Face ID con sesión válida, el re-sondeo async podía dar `false` y esconder el CTA dejando solo "Usar contraseña"/"Cambiar cuenta" (sin sentido para un usuario ya logueado). El auto-fire en lock mode tampoco espera al re-sondeo.
- **Formulario password:** dos sub-modos:
  - `use-password`: solo campo contraseña (email pre-rellenado desde cache). Incluye "¿Olvidaste tu contraseña?" → `push('/(auth)/forgot-password')`.
  - `change-account`: email + contraseña.
- **Apple Sign-In:** disponible en iOS. Botón "Continuar con Apple" (separador "O" si `withDivider`). Sesión detectada por `AppEntryGate` vía listener, no requiere navegación manual.
- **Guards:** `RequireGuest allowFamilylessSession` (salvo en lock mode).
- **Caché last user:** lee `getLastUserProfile()` de SecureStore al montar para mostrar nombre y avatar sin red.
- **Saludos:** `pickReturningGreeting()` — pool de 47 frases neutras + 3-5 time-aware (mañana/tarde/noche), seleccionado aleatoriamente una vez por mount.
- **Teclado:** `scrollRef.scrollToEnd` cuando `keyboardDidShow` en formMode activo.

#### `signup-screen.tsx` — Signup
- **Campos:** Nombre (>1 char), Email (valida `@`), Contraseña (mín 6 chars + strength meter 3 barras: Débil/Buena/Excelente).
- **Validaciones client-side:** nombre ≥2, email con `@`, password ≥6. Errores vía `setErrorMessage`.
- **Email normalizado:** `normalizeEmail()` = trim + lowercase.
- **Supabase call:** `supabase.auth.signUp({ email, password, options: { emailRedirectTo, data: { display_name } } })`.
- **Resolución:**
  - `hasSession=true` → `showAuthTransitionSplash()` → `router.replace('/(app)/onboarding')`.
  - `hasSession=false` → panel "Revisá tu mail" con email enmascarado (`jo***@gmail.com`), botón "Reenviar email" con cooldown 60s (timer visible), botón "Cambiar email".
- **Reenvío:** `supabase.auth.resend({ type: 'signup', email })` via `useResendSignupEmail`.
- **Apple:** `isAppleSignInAvailable()` → botón negro "Continuar con Apple". Si no disponible, `Alert`.
- **Google:** `isGoogleSignInConfigured()` (requiere `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` + módulo nativo). Botón con "G" oficial.
- **Social result:** `signed-in` → `router.replace('/(app)/onboarding')`. `cancelled` → silencioso. `unavailable` → `setErrorMessage`.
- **Guard:** `RequireGuest allowFamilylessSession`.
- **Fineprint:** links a Términos y Privacidad.

#### `join-screen.tsx` — Join Family (path alternativo)
- **Audiencia:** usuarios con sesión pero sin familia (redirect desde `RequireAuth` cuando `!familyId`).
- **UI:** `SegmentedControl` Crear/Unirme + 2 `ChoiceCard` visuales.
- **Modo Crear:** botón "Crear grupo familiar" → `controller.actions.createFamily()` (via `useJoinController` de `features/family/`).
- **Modo Unirse:** campo código (máx 8 chars, `autoCapitalize: "characters"`) → `controller.actions.joinWithCode()`. Placeholder "Ej: A9KD3L".
- **Guard:** `RequireGuest allowFamilylessSession`.
- **Nota:** este screen es un path legacy/de recuperación. El flujo normal de nuevos usuarios pasa por el wizard en `/(app)/onboarding` (step 3 cubre la decisión de familia).

#### `forgot-password-screen.tsx` — Forgot Password
- **Campos:** email único.
- **Submit:** `normalizeEmail` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: getPasswordResetRedirectTo() })` via `usePasswordReset`.
- **RedirectTo:** `Linking.createURL('auth/reset-password')` → deep link `manifiesto://auth/reset-password`.
- **Estado post-envío:** pantalla "Revisá tu mail" con email destino + CTA "Volver a login".
- **Validación:** solo verifica que el string tenga `@`. Supabase no revela si el email existe.
- **Guard:** `RequireGuest allowFamilylessSession`.

#### `reset-password-screen.tsx` — Reset Password
- **Recibe:** `?code=` de URL (deep link desde email de Supabase).
- **Stages:** `'exchanging'` → `'form'` → `'success'` / `'error'` / `'timeout'`.
- **Exchange:** `supabase.auth.exchangeCodeForSession(code)` via `useCompleteAuthCallback`. Timeout de 30s (`RESET_TIMEOUT_MS`).
- **Formulario nueva contraseña:** dos campos (nueva + confirmar), mín 6 chars, deben coincidir. CTA deshabilitado hasta `passwordValid`.
- **Submit:** `supabase.auth.updateUser({ password })` via `useUpdatePassword`.
- **Éxito:** stage `'success'` → "Contraseña actualizada" → "Ir al inicio" → `router.replace('/')`.
- **Error (link vencido/consumido):** CTA "Pedir nuevo link" → `router.replace('/(auth)/forgot-password')`.
- **Timeout:** pantalla especial con retry + fallback a forgot-password.

#### `auth-callback-screen.tsx` — Auth Callback
- **Recibe:** `?code=` del deep link `manifiesto://auth/callback` (confirmación de email post-signup).
- **PKCE-only:** solo acepta `code`. NO acepta `access_token`/`refresh_token` en query params (vector de session fixation cerrado).
- **Exchange:** `supabase.auth.exchangeCodeForSession(code)` → sesión activa → `router.replace('/')`.
- **Timeout:** 30s (`AUTH_CALLBACK_TIMEOUT_MS`). Muestra "Reintentar" + "Volver a login".
- **Retry:** botón incrementa `retryToken` → re-corre el `useEffect` de exchange.
- **Montada en:** `app/auth/callback.tsx` (fuera del stack `(auth)`, ruta propia).

---

## 3. Métodos de autenticación

### Email/Password ✅ LIVE

| Operación | Función Supabase | Archivo |
|---|---|---|
| Sign in | `supabase.auth.signInWithPassword({ email, password })` | [use-auth-actions.ts](../../../mobile/features/auth/use-auth-actions.ts) |
| Sign up | `supabase.auth.signUp({ email, password, options: { emailRedirectTo, data: { display_name } } })` | [use-auth-actions.ts](../../../mobile/features/auth/use-auth-actions.ts) |
| Reenvío signup | `supabase.auth.resend({ type: 'signup', email })` | [use-auth-actions.ts](../../../mobile/features/auth/use-auth-actions.ts) |
| Reset password | `supabase.auth.resetPasswordForEmail(email, { redirectTo })` | [use-auth-actions.ts](../../../mobile/features/auth/use-auth-actions.ts) |
| Update password | `supabase.auth.updateUser({ password })` | [use-auth-actions.ts](../../../mobile/features/auth/use-auth-actions.ts) |
| Exchange code | `supabase.auth.exchangeCodeForSession(code)` | [use-auth-actions.ts](../../../mobile/features/auth/use-auth-actions.ts) |

**Normalización:** `normalizeEmail()` = `rawEmail.trim().toLowerCase()`.

**Validaciones client-side:**
- Email: debe incluir `@`.
- Password (signup): mínimo 6 chars.
- Nombre (signup): mínimo 2 chars.
- Password (reset): mínimo 6 chars + confirmación debe coincidir.

### Apple Sign-In 🟡 PARCIAL

- **Librería:** `expo-apple-authentication` (`AppleAuthentication.signInAsync`).
- **Scopes solicitados:** `FULL_NAME` + `EMAIL`.
- **Flujo:** `credential.identityToken` → `supabase.auth.signInWithIdToken({ provider: 'apple', token })`.
- **Nombre:** Apple solo entrega `fullName` en el primer sign-in. Se parchea vía `supabase.auth.updateUser({ data: { display_name: fullName } })`.
- **Disponibilidad:** `Platform.OS === 'ios'` + `AppleAuthentication.isAvailableAsync()`. En Android siempre muestra el botón pero da `Alert` al pulsar.
- **Resultado:** `{ status: 'signed-in' | 'cancelled' | 'unavailable', error? }`.
- **Configuración requerida:** Supabase Dashboard → Apple provider (Service ID, Team ID, Key ID, .p8 key) + Apple Developer Portal → "Sign In with Apple" habilitado para `com.manifiesto.mobile`. Requiere build de desarrollo/producción (NO funciona en Expo Go por entitlement nativo).
- **Estado:** El código está completo y correcto. ⛔ BLOQUEADO si no hay Apple Developer Program activo o Supabase no tiene el provider configurado.

### Google Sign-In 🟡 PARCIAL

- **Librería:** `@react-native-google-signin/google-signin` (lazy-loaded para evitar crash en Expo Go).
- **Flujo:** `GoogleSignin.signIn()` → `idToken` → `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })`.
- **Configuración:** `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (requerido) + `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (opcional para iOS nativo).
- **`isGoogleSignInConfigured()`:** retorna `false` si no hay `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` o si el módulo nativo no está disponible (Expo Go).
- **Android API 29:** downgrade a `biometricsSecurityLevel: 'weak'` para compatibilidad con `BIOMETRIC_WEAK | DEVICE_CREDENTIAL`.
- **Estado:** código listo. ⛔ BLOQUEADO por falta de env vars en builds actuales (muestra Alert en desarrollo).

### Biometría (Face ID / Touch ID / Huella) ✅ LIVE

Implementado en [`biometric-auth.ts`](../../../mobile/lib/biometric-auth.ts) con `expo-local-authentication` + `expo-secure-store`.

**Diseño de seguridad:** NO guarda la contraseña. Guarda el **refresh token** de Supabase en SecureStore con `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (no viaja en iCloud/iTunes). El refresh se rota tras cada sesión biométrica exitosa (`updateStoredRefreshToken`).

**Almacenamiento:**
- `auth.biometric.credentials` → `{ email, refreshToken }` (SecureStore).
- `auth.biometric.metadata` → `{ email }` (SecureStore, legible sin el token completo para mostrar el hero personalizado).

**`getBiometricLoginState()`:** consulta en paralelo `SecureStore.isAvailableAsync()`, `LocalAuthentication.hasHardwareAsync()`, `LocalAuthentication.isEnrolledAsync()`, `supportedAuthenticationTypesAsync()` + metadata. Usa **`Promise.allSettled`** (no `Promise.all` + catch único): un read que falla de forma transitoria degrada solo esa señal en vez de colapsar todo a `false` — clave para que un hipo de SecureStore no flipee `hasSavedCredentials`/`isAvailable` y esconda el CTA en la pantalla de bloqueo. Cubierto por `tests/unit/biometric-login-state.test.ts`.

**Labels auto-detectados:**
- `FACIAL_RECOGNITION` → "Face ID" (iOS) / "reconocimiento facial" (Android).
- `FINGERPRINT` → "Touch ID" (iOS) / "huella digital" (Android).
- `IRIS` → "iris".

**Flujo de sign-in biométrico:**
1. `authenticateBiometricAccess()` (prompt nativo).
2. Si OK → `showAuthTransitionSplash()` optimista + haptic success.
3. `getBiometricCredentials()` → `supabase.auth.refreshSession({ refresh_token })`.
4. Token rotado → `updateStoredRefreshToken(newRefreshToken)`.
5. `onSignedIn()` → `markAppUnlocked()` + `router.replace('/')`.

**Degradación:** si el refresh token expiró (default Supabase: 30d), NO borra las credenciales. Muestra error "Tu sesión expiró. Ingresá con tu contraseña una vez para reactivar Face ID." La próxima sign-in manual con password sobreescribe el token automáticamente.

**Setup automático:** tras un sign-in manual exitoso, `persistBiometricCredentials` pregunta si habilitar biometría (`authenticateBiometricAccess({ promptMessage: "Activa Face ID para entrar más rápido" })`).

**App-lock:** módulo [`app-lock-state.ts`](../../../mobile/features/auth/app-lock-state.ts) — store module-level en memoria (resets en cold start). `markAppUnlocked()` / `resetAppLock()` / `useAppLockState()`. **Re-lock por background:** [`background-relock-watcher.tsx`](../../../mobile/components/root/background-relock-watcher.tsx) (montado en RootLayoutShell) re-arma el lock vía `resetAppLock()` + `router.replace('/')` si la app estuvo > 60s en background (helper puro `shouldRelock` en [`background-relock.ts`](../../../mobile/features/auth/background-relock.ts)). El gate de app-lock usa `disableDeviceFallback: true` (solo biometría; el escape es "Usar contraseña", que re-autentica con la contraseña de la cuenta). Copy de lockout diferenciada vía `biometricFeedbackForError`. El status local del login es `'idle' | 'scanning'` (el estado `'authed'` se eliminó: el transition splash ya cubre el éxito).

**Auto-sign-in:** `useAuthBiometricAutoSignIn` está **deshabilitado** (no-op). Face ID solo se dispara al tocar el botón explícito o via `?autoBiometric=1`.

---

## 4. Onboarding y Household Setup

### Onboarding — Wizard 5 pasos

**Ruta:** `/(app)/onboarding` → `OnboardingRoute` → `OnboardingScreen`.

**Guard en la ruta:** si `profileQuery.data?.onboarding_completed_at` existe → redirect a `/(app)/(tabs)/home`.

**Estado:** `useOnboardingState` — `useReducer` con `OnboardingDraft`. La navegación entre pasos es completamente local, sin escribir a la DB hasta el paso 5 (excepto display_name en paso 1 y avatar en paso 2, que se envían en background optimistamente).

#### Paso 1 — Nombre (`StepWelcome`)
- Campo: nombre de perfil. Validación: `trimmedName.length >= 2`.
- Hidrata desde `profileQuery.data.display_name` si existe (una sola vez).
- Detecta re-entrada: `profile.previously_onboarded === true` → copy "Bienvenida de vuelta". `family_closed_by_owner_at` → copy suave "tu hogar fue cerrado".
- Al avanzar: `updateDisplayName.mutate(trimmedName)` en background (fire-and-forget).

#### Paso 2 — Avatar (`StepAvatar`)
- Selector de animal avatar (grid). `canContinue = true` siempre.
- Al avanzar: `updateAvatar.mutate(state.avatarSlug)` en background.

#### Paso 3 — Familia (`StepFamily`)
- Dos sub-modos:
  - **Crear:** llama a RPC de bootstrap → devuelve `familyId`. `canContinue = familyMode === 'created' && !!familyId`.
  - **Unirse:** campo código → `peek_family_by_code` RPC (sin insertar membresía todavía). Resultado en `state.pendingFamily`. `canContinue = !!state.pendingFamily`.
- No auto-avanza si ya existe `family_members` row (por diseño — evita silenciar la elección).

#### Paso 4 — Ingresos

**Branch por `state.familyMode`:**

- **Creador (`StepIncome`):** `InAppNumpad` para ingreso mensual + picker día de cobro (1–31). `canContinue = monthlyIncome > 0 && salaryPaymentDay >= 1 && salaryPaymentDay <= 31`.
- **Joiner (`StepIncomeContribution`):** toggle "¿Aportas ingreso al hogar?" Si sí: `InAppNumpad` para monto. `canContinue`: si `contributesIncome === null` → false; si true → `monthlyIncome > 0`; si false → true.

#### Paso 5 — Ahorro / Resumen

- **Creador (`StepSavings`):** slider porcentaje de ahorro (default 20%) + toggle "¿Crear primera meta?" Si sí: nombre de meta + monto (numpad) + meses (default 6).
- **Joiner (`StepFamilySummary`):** muestra snapshot del hogar (`pendingFamily`), nombre y avatar del usuario que se une, contribución elegida.

#### Finish (`handleFinish`)

- **Path creador:**
  1. `upsertFamilyFinance` (income, salaryPaymentDay, savingsGoalPercent, `lastSalaryConfirmedAt = now()`, etc.).
  2. Si `createFirstGoal` → `upsertSavingsGoal`.
  3. `completeOnboarding.mutateAsync()` → `profiles.update({ onboarding_completed_at: now() })`.
  4. `showAuthTransitionSplash()` → `router.replace('/(app)/(tabs)/home')`.

- **Path joiner:**
  1. `consumeInvite.mutateAsync({ code, monthlyIncomeContribution })` → RPC `consume_family_invite` (inserta membresía + marca invite usada).
  2. `completeOnboarding.mutateAsync()`.
  3. `showAuthTransitionSplash()` → `router.replace('/(app)/(tabs)/home')`.

- **Back en step 1:** Alert con opciones "Seguir aquí" (cancel) / "Cerrar sesión" (destructivo → `logoutSession` → welcome).

---

### Household Setup (`/(app)/household-setup`) ✅ LIVE

[`household-setup-screen.tsx`](../../../mobile/screens/settings/household-setup-screen.tsx) — Wizard de 3 pasos accesible desde Settings para **re-configurar** la distribución de ahorro del hogar.

- **Guard:** `RequireAuth` (necesita sesión + familyId).
- **Datos iniciales:** carga `useFamilyFinance(familyId)` → `FamilyFinanceInputSnapshot`.
- **Pasos:** distribución de gastos esenciales/variables/ahorro (presets + research panel con estadísticas).
- **Submit:** `useUpsertFamilyFinance` → `family_finance` upsert.
- **`TOTAL_STEPS = 3`** (constante en la screen).

---

## 5. features/auth + components/auth

### Inventario features/auth

| Archivo | Propósito |
|---|---|
| [`app-lock-state.ts`](../../../mobile/features/auth/app-lock-state.ts) | Store module-level (useSyncExternalStore) para el gate de re-confirmación biométrica por cold start. `markAppUnlocked` / `resetAppLock` / `useAppLockState`. |
| [`auth-biometric-state.ts`](../../../mobile/features/auth/auth-biometric-state.ts) | `buildInitialBiometricState()` — estado sincrono inicial antes de la consulta async. |
| [`auth-flow.ts`](../../../mobile/features/auth/auth-flow.ts) | Helpers de normalización, validación, copy de la UI y construcción de redirect URLs. Contiene `normalizeEmail`, `validateAuthSubmission`, `buildAuthHelperCopy`, `getEmailRedirectTo`, `getPasswordResetRedirectTo`. |
| [`auth-layout.ts`](../../../mobile/features/auth/auth-layout.ts) | `buildAuthViewportMetrics` (métricas de layout responsive según alto/ancho de pantalla) + `computeAuthKeyboardShiftTarget` (target de shift del teclado por campo focalizado). |
| [`auth-submit-flow.ts`](../../../mobile/features/auth/auth-submit-flow.ts) | `resolveAuthSubmitResolution` — decide entre `signed-in`, `onboarding`, `email-confirmation` según modo (sign-in/sign-up) y si hay sesión. |
| [`logout.ts`](../../../mobile/features/auth/logout.ts) | `logoutSession` — llama `supabase.auth.signOut()` → `clearBiometricCredentials()` → `resetAppLock()`. Imports dinámicos para code-splitting. |
| [`social-sign-in.ts`](../../../mobile/features/auth/social-sign-in.ts) | `signInWithApple` (expo-apple-authentication) + `signInWithGoogle` (lazy require para evitar crash en Expo Go). Ambas conectan via `supabase.auth.signInWithIdToken`. |
| [`use-auth-actions.ts`](../../../mobile/features/auth/use-auth-actions.ts) | Mutations TanStack Query: `usePasswordSignIn`, `usePasswordSignUp`, `useResendSignupEmail`, `usePasswordReset`, `useUpdatePassword`, `useCompleteAuthCallback`. |
| [`use-auth-biometric-auto-sign-in.ts`](../../../mobile/features/auth/use-auth-biometric-auto-sign-in.ts) | Hook **deshabilitado** (no-op). El auto-fire en mount causaba prompts duplicados. Preservado para back-compat de firma. |
| [`use-auth-biometric-controller.ts`](../../../mobile/features/auth/use-auth-biometric-controller.ts) | Orquesta el flujo biométrico completo: `handleBiometricSignIn` (prompt → refresh → rotate token → onSignedIn), `persistBiometricCredentials` (post sign-in manual), `refreshBiometricState`. |
| [`use-auth-keyboard-controller.ts`](../../../mobile/features/auth/use-auth-keyboard-controller.ts) | Escucha `keyboardWillShow/Hide` y gestiona refs a inputs. Calcula `keyboardShiftTarget` via `computeAuthKeyboardShiftTarget`. Devuelve `emailInputRef`, `passwordInputRef`, `nameInputRef`. |
| [`use-auth-session.ts`](../../../mobile/features/auth/use-auth-session.ts) | React Query (`staleTime: Infinity`) + listener `onAuthStateChange`. En `SIGNED_OUT` limpia queries + AsyncStorage + lastUserProfile. |
| [`use-cold-start-biometric-check.ts`](../../../mobile/features/auth/use-cold-start-biometric-check.ts) | Determina `shouldUseBiometric` (biometría disponible + credenciales guardadas) para el routing en `AppEntryGate`. |
| [`use-delete-account.ts`](../../../mobile/features/auth/use-delete-account.ts) | `useRequestAccountDeletion` → RPC `request_account_deletion` (programa baja en 30d). `useCancelAccountDeletion` → RPC `cancel_account_deletion`. |
| [`use-last-user-profile-sync.ts`](../../../mobile/features/auth/use-last-user-profile-sync.ts) | Persiste email + display_name + avatarSlug en SecureStore (`auth.last-user.profile`) tras cada sesión activa. Solo escribe cuando el fingerprint JSON cambia. |
| [`use-login-controller.ts`](../../../mobile/features/auth/use-login-controller.ts) | Fachada que combina `useLoginFormState` + `useAuthBiometricController` + `useAuthKeyboardController` + `useLoginSubmit`. Expone el objeto controller completo al LoginScreen. |
| [`use-login-form-state.ts`](../../../mobile/features/auth/use-login-form-state.ts) | Estado local de formulario de login: `mode` (sign-in/sign-up), `displayName`, `email`, `password`, `errorMessage`, `infoMessage`, con callbacks clearFeedback-on-change. |
| [`use-login-submit.ts`](../../../mobile/features/auth/use-login-submit.ts) | Lógica de submit unificada (sign-in y sign-up): valida, llama Supabase, resuelve destino, persiste biometría si aplica, maneja errores. |
| [`use-timezone-sync.ts`](../../../mobile/features/auth/use-timezone-sync.ts) | Sincroniza `Intl.DateTimeFormat().resolvedOptions().timeZone` → `profiles.timezone` cuando difiere. Fallback `America/Argentina/Buenos_Aires`. |

---

### Inventario components/auth

| Archivo | Propósito |
|---|---|
| [`auth-feedback-pill.tsx`](../../../mobile/components/auth/auth-feedback-pill.tsx) | Pill de feedback inline: `intent='error'` (rojo) o `'info'` (azul). Icono MaterialIcons + texto. Usado en login, signup, forgot-password, reset-password. |
| [`auth-gradient-action-button.tsx`](../../../mobile/components/auth/auth-gradient-action-button.tsx) | Botón CTA con fondo degradado (via `authPalette.cta`). Props: `label`, `disabled`, `dense`, `onPress`. |
| [`auth-input.tsx`](../../../mobile/components/auth/auth-input.tsx) | Input estilizado de auth con label flotante animado (Reanimated), border focus ring. Exportado como `AuthInput`. |
| [`auth-launch-splash.tsx`](../../../mobile/components/auth/auth-launch-splash.tsx) | Splash de lanzamiento (cold start): misma composición visual que welcome (aurora + partículas + hero stack) — mismo pixel-layout para lograr transición shared-element cuando welcome monta debajo. 24 partículas. Props: `onComplete`, `persistent`, `reducedMotion`. |
| [`auth-segmented-control.tsx`](../../../mobile/components/auth/auth-segmented-control.tsx) | Segmented control animado (spring slide) con indicador de fondo degradado. Usado en join-screen y en el segmented de auth. Props: `options`, `value`, `onChange`, `compact`, `dense`. |
| [`auth-transition-splash.tsx`](../../../mobile/components/auth/auth-transition-splash.tsx) | Splash post-login (login → home bridge). Verde oscuro + 16 fireflies (CSS animations Reanimated 4, sin worklets). Dos modos: `showing/success-pending` (WarmFernLogo) / `error` (ErrorFallback con NetInfo probe en retry). |
| [`fern-logo.tsx`](../../../mobile/components/auth/fern-logo.tsx) | SVG del helecho animado (draw-on animado, `animate` prop). Paletas: `dark`, `light`, `peach`, `mono-light`, `warm`. |
| ~~`login-primitives.tsx`~~ | 🗑️ **Eliminado 2026-05-22** — barrel huérfano sin consumidores (Bucket 2 de [09](09-candidatos-a-eliminar.md)). Los componentes re-exportados siguen vivos por import directo. |
| [`warm-fern-logo.tsx`](../../../mobile/components/auth/warm-fern-logo.tsx) | FernLogo estático (sin animación) + wordmark "Manifiesto." sobre fondo verde. Usado exclusivamente en la transition splash post-login. |

---

## 6. Auth Transitions / Splash / Caches

### Auth Transition Splash

**Módulo:** [`auth-transition-splash.ts`](../../../mobile/lib/auth-transition-splash.ts) — store module-level con `useSyncExternalStore`.

**Máquina de estados:**

```
hidden → showing → success-pending → hidden
                 → error
```

- `showAuthTransitionSplash()`: abre el splash. Inicia `MIN_VISIBLE_MS=3000ms` y safety timer `MAX_VISIBLE_MS=15000ms`.
- `markAuthTransitionLoaded()`: señala que la data del destino ya cargó. Si ya pasó el mínimo → oculta inmediatamente; si no → espera el resto del mínimo.
- `reportAuthTransitionError(kind)`: promueve a `error`. Kinds: `'network'`, `'timeout'`, `'unknown'`.
- `showAuthTransitionError(kind)`: mueve a `error` desde cualquier estado (incluyendo `hidden`). Usado por el watcher de conectividad.
- `hideAuthTransitionSplash()`: force-hide incondicionalmente.
- `useAuthTransitionSplash()`: hook React para componentes.

**Rendimiento:** las 16 fireflies del `AuthTransitionSplash` usan CSS animations de Reanimated 4 — cero worklets, cero shared values.

**Dismiss gate:** [`auth-transition-dismiss-gate.ts`](../../../mobile/lib/auth-transition-dismiss-gate.ts) — predicado puro `shouldDismissAuthTransition({ isLoading, splashVisible })`. Centralizado para que `AppEntryGate`, `RequireAuth`, `RequireGuest`, `OnboardingRoute`, `AppStackShell` usen la misma condición.

---

### Last User Cache

**Módulo:** [`last-user-cache.ts`](../../../mobile/lib/last-user-cache.ts) — SecureStore key `auth.last-user.profile`.

**Interfaz `LastUserProfile`:** `{ email: string, displayName: string | null, avatarSlug: string | null }`.

**Escritura:** `useLastUserProfileSync` (montado en AppStackShell) — escribe en SecureStore solo cuando el fingerprint JSON cambia. Se borra en `SIGNED_OUT` via `clearLastUserProfile()`.

**Lectura:** `getLastUserProfile()` — en login-screen al montar para mostrar hero personalizado sin red.

**Uso:** permite mostrar nombre de usuario, avatar animal, y email pre-rellenado antes de cualquier network call, incluso en cold start sin sesión.

---

### Profile Display Name Cache

**Módulo:** [`profile-display-name-cache.ts`](../../../mobile/lib/profile-display-name-cache.ts) — Map en memoria (no persistido), TTL 5 minutos.

**API:** `getCachedProfileDisplayName(userId)`, `setCachedProfileDisplayName(userId, displayName)`, `setCachedProfileDisplayNames(profiles[])`.

**Uso:** cache de corto plazo para display names en listas/avatares sin re-fetchear el perfil completo.

---

### Auth Greetings

**Módulo:** [`lib/copy/auth-greetings.ts`](../../../mobile/lib/copy/auth-greetings.ts).

**`pickReturningGreeting(now?: Date)`:** selecciona aleatoriamente de un pool de 47 frases neutras + 3-5 específicas por franja horaria (mañana 5-12h, tarde 12-19h, noche 19-5h). Todas en español rioplatense sin marcadores de género.

---

## 7. Reset Password y Deep Links

### URL Scheme

- Deep link base: `manifiesto://` (configurado por expo-linking).
- Redirect de confirmación de email: `manifiesto://auth/callback?code=...` → ruta `app/auth/callback.tsx`.
- Redirect de reset de password: `manifiesto://auth/reset-password?code=...` → ruta `app/auth/reset-password.tsx`.

Los paths están **hardcodeados** en `auth-flow.ts` (`AUTH_REDIRECT_PATH = 'auth/callback'`, `AUTH_RESET_PASSWORD_PATH = 'auth/reset-password'`). Comentario explícito: NO se leen de `EXPO_PUBLIC_*` para evitar que un deploy no auditado desvíe la confirmación a un path arbitrario.

### Flujo Reset Password completo

```
Usuario en login-screen → "¿Olvidaste tu contraseña?"
        ↓
/(auth)/forgot-password
   • Campo email
   • Submit → supabase.auth.resetPasswordForEmail(email, { redirectTo: 'manifiesto://auth/reset-password' })
   • UI cambia a "Revisá tu mail" + email destino
        ↓
Email recibido → link abre la app
        ↓
app/auth/reset-password?code=<PKCE_CODE>
   → ResetPasswordScreen
   • Stage 'exchanging': supabase.auth.exchangeCodeForSession(code) [timeout 30s]
   • Stage 'form': nueva contraseña + confirmar
   • Submit: supabase.auth.updateUser({ password })
   • Stage 'success': "Ir al inicio" → router.replace('/')
   • Stage 'error': link vencido → "Pedir nuevo link"
   • Stage 'timeout': "Está tardando más de lo normal" → retry + fallback
```

### Flujo Confirmación Email (signup)

```
Signup screen → supabase.auth.signUp (hasSession=false)
   → panel "Revisá tu mail" con email enmascarado
   → (usuario hace click en el email)
        ↓
app/auth/callback?code=<PKCE_CODE>
   → AuthCallbackScreen
   • supabase.auth.exchangeCodeForSession(code) [timeout 30s]
   • OK → router.replace('/')
   • Error → botones retry / ir a login
```

**Seguridad PKCE:** los screens de callback y reset-password solo consumen el `code`. El handler anterior que aceptaba `access_token` + `refresh_token` en query params (explotable para session fixation via deep link de phishing) fue removido.

---

## 8. Account Deletion — Flujo de usuario

### Trigger

Settings screen → sección "Zona de riesgo" → botón "Eliminar cuenta" → abre `DeleteAccountConfirmSheet`.

### Guard especial: owner con miembros

Si el usuario es owner de una familia con otros miembros activos (`isOwnerWithMembers = true`), el sheet muestra un panel informativo en lugar del flujo destructivo:
> "Antes de borrar, transferí tu hogar — No podés borrar tu cuenta todavía. Si te vas como dueño, el resto del hogar pierde acceso. Pasale el rol a otro miembro desde 'Administrar familia' y volvé."

Solo CTA: "Entendido" (cierra el sheet). El RPC del servidor también bloquea esta situación, pero el UI adelanta el feedback para evitar el round-trip.

### Flujo de dos pasos (usuario normal / miembro sin dependientes)

**Step 1 — Warning**

- Panel con ícono ⚠️ rojo: "Esto no se puede deshacer fácil".
- Copy: "Tu cuenta queda agendada para borrarse en 30 días. Si cambiás de idea, podés cancelar volviendo a entrar dentro de ese plazo."
- Lista de qué se borra: gastos/fijos/metas/notificaciones, perfil/avatar/config, suscripción activa.
- Nota: "Tenés 30 días para arrepentirte y reactivar."
- CTAs: "Cancelar" (ghost) | "Continuar" (danger) → pasa a step 2.

**Step 2 — Confirmación de frase**

- Instrucción: escribir `BORRAR MI CUENTA` (en mayúsculas, `CONFIRM_PHRASE`).
- Input con `autoCapitalize: "characters"`, `autoCorrect: false`, `spellCheck: false`.
- Validación: `phrase.trim().toUpperCase() === 'BORRAR MI CUENTA'`.
- Error inline si no coincide: "Tiene que coincidir exactamente con BORRAR MI CUENTA."
- CTA "Borrar cuenta" (danger) habilitado solo cuando coincide exactamente.

**Submit:**
- `useRequestAccountDeletion.mutate()` → `supabase.rpc('request_account_deletion')`.
- RPC backend: (1) verifica que no sea owner con miembros activos, (2) setea `profiles.deletion_scheduled_at = now() + 30d`, (3) borra `push_subscriptions`.
- RPC retorna ISO timestamp del `scheduled_at`.
- Post-éxito en la settings screen: `supabase.auth.signOut()` → usuario es deslogueado inmediatamente.

**Cancelación de baja (dentro de los 30 días):**
- `useCancelAccountDeletion` → `supabase.rpc('cancel_account_deletion')`.
- No se expone activamente en el UI de la versión actual (no verificado, el hook existe).

**Procesado final:**
- Cron/edge function del servidor (service-role) borra el `auth.users` row cuando vence `deletion_scheduled_at`. El borrado es en cascade.

---

## 9. Estado vs Deuda técnica

| Funcionalidad | Estado | Notas |
|---|---|---|
| Email/password sign-in | ✅ LIVE | Completo, PKCE, validaciones robustas. |
| Email/password sign-up | ✅ LIVE | Con confirmación de email, resend con cooldown 60s. |
| Reset password (forgot + deep link) | ✅ LIVE | PKCE, timeout 30s, todos los estados de error. |
| Auth callback (email confirmation) | ✅ LIVE | PKCE-only, timeout 30s, retry. |
| Biometría (Face ID / Touch ID / Huella) | ✅ LIVE | Refresh-token flow (no password), rotación automática, degradación sin borrar credenciales. |
| App-lock (gate biométrico por cold start) | ✅ LIVE | Per-launch, se resetea en logout. Sin re-lock por backgrounding. |
| Apple Sign-In | 🟡 PARCIAL | Código completo. ⛔ BLOQUEADO sin Apple Developer Program activo + Supabase configurado. |
| Google Sign-In | 🟡 PARCIAL | Código completo. ⛔ BLOQUEADO: requiere `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` en env + módulo nativo (no Expo Go). |
| Onboarding wizard (5 pasos) | ✅ LIVE | Creator y joiner paths, re-entrada detectada por `previously_onboarded`. |
| Household setup (re-config desde settings) | ✅ LIVE | 3 pasos, wizard post-onboarding. |
| Join screen (path legacy/recuperación) | ✅ LIVE | Para usuarios sin familia que perdieron acceso. |
| Auth transition splash | ✅ LIVE | Máquina de estados, min 3s, safety 15s, fallback de error con NetInfo. |
| Last user cache (SecureStore) | ✅ LIVE | Login personalizado sin red. |
| Account deletion (flujo UI completo) | ✅ LIVE | 2-step con frase de confirmación, guard owner-con-miembros, gracia 30 días. |
| Cancel account deletion | 🟡 PARCIAL | Hook `useCancelAccountDeletion` existe; exposición en UI no verificada. |
| Re-lock por backgrounding | 🔴 NO EXISTE | Comentario en `app-lock-state.ts` lo menciona como "si queremos en el futuro". |
| Auto-sign-in biométrico en mount | ⏸️ EN PAUSA | `useAuthBiometricAutoSignIn` es no-op. Deshabilitado por double-prompt. La ruta `?autoBiometric=1` cubre el caso de cold start. |
| Google Sign-In en Expo Go | 🔴 NO EXISTE | Por diseño: lazy-require para no crashear; muestra Alert en Expo Go. |
