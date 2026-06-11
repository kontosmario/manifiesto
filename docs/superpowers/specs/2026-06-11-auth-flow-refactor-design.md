# Refactor del flujo de auth — diseño (2026-06-11)

**Estado:** ✅ IMPLEMENTADO 2026-06-11 (Etapas 1-5 completas; doc canónico del sistema: `docs/sistemas/auth-flow.md`).
**Demo tangible:** `docs/auth-flow-demo.html` — simula los viajes con los timings 1:1 de este spec (prompt interactivo, toggles de red lenta / offline / cámara lenta).
**Baseline:** commit `27af905` (prefetch paralelo + splash post-success + min-visible) — esas piezas sobreviven absorbidas por este diseño.

## 1. Objetivo

Reescribir desde cero la **orquestación** del flujo de autenticación (cold start, Face ID, PIN, login, signup, re-lock, transiciones) para que se sienta al nivel de Mercado Pago: cero tiempo muerto, cero parpadeos, cada frame es motion intencional. Los **diseños visuales no cambian**.

### Intactos (no tocar)
- Welcome screen, Login screen, Signup, Forgot password, Join.
- `AuthLaunchSplash` (cold-start animation: fern creciendo, stem draw 900ms → silueta → hojas).
- `AuthTransitionSplash` (visuales del bridge: fern + wordmark + fireflies + error fallback) y `WarmFernLogo`, `FernLogo`, `PinPad`.
- `biometric-auth`, `pin-lock` (verificación, lockout), capa de seguridad/RLS.
- La animación de éxito es la de **"Probar splash · success"** (settings → desarrollo): fade-in → fern estático + fireflies → soar-away.

### Decisiones validadas con el owner
| Decisión | Valor |
|---|---|
| Alcance | Ciclo core + PIN unlock + re-lock watchers + signup→onboarding |
| Hold del bridge post-auth | **Adaptativo con piso 1200ms** (espera además `DESTINATION_READY`) |
| Face ID en cold start | **Inmediato** (~0.5s), cold-start animation sigue de fondo |
| Arquitectura | Máquina de estados pura + driver con IO + boot surface única (Opción A) |

## 2. Arquitectura — módulo `mobile/features/auth-flow/`

Tres capas con responsabilidad única:

### 2.1 `auth-flow-machine.ts` — pura, sin React, sin IO
Reducer `transition(state, event) → { state, effects[] }`.

**Estados**
```
probing            resolviendo probes locales (sesión cache, biometría, PIN — en paralelo)
guest              sin sesión → welcome (o login?autoBiometric=1 si hay creds guardadas)
locked:biometric   sesión válida, esperando Face ID
locked:pin         sesión válida, esperando PIN (sin biometría, o fallback)
bridging           auth OK, bridge visible, destino cargando detrás
bridge-error(kind) carga falló (network | timeout | unknown) → fallback con Reintentar
revealing          soar-away en curso
ready              usuario adentro
fallback:login     Face ID cancelado/fallido → login con todas las affordances
```

**Eventos**
`PROBES_RESOLVED`, `FACE_ID_OK`, `FACE_ID_FAIL(reason)`, `PIN_OK`, `LOGIN_SUCCESS`,
`SIGNUP_SUCCESS`, `BRIDGE_OPAQUE`, `DESTINATION_READY`, `MIN_HOLD_ELAPSED`,
`LOAD_FAILED(kind)`, `RETRY`, `RELOCK(source)`, `LOGOUT`, `EMAIL_CONFIRMATION_PENDING`.

**Efectos** (descripciones, nunca ejecuciones)
`prompt-biometric`, `prefetch-snapshot`, `navigate(ruta)`, `haptic(kind)`,
`schedule(min-hold, 1200)`, `schedule(safety, 15000)`, `cancel-timers`, `restore-session`.

Eventos fuera de estado son **no-ops por construcción** (un `FACE_ID_OK` en `bridging` no hace nada). Esto reemplaza los guards con refs/flags del sistema actual.

### 2.2 `auth-flow-controller.ts` — driver, el ÚNICO lugar con IO
Sostiene el estado, ejecuta efectos contra **adapters inyectados**:
`{ biometric, session (supabase + keychain slow-path), router, queryClient, haptics, scheduler }`.
Expone `dispatch(event)` y `getState()`. Módulo singleton (mismo patrón que los stores actuales), con `configure(adapters)` para tests.

### 2.3 `use-auth-flow.ts` + `auth-flow-motion.ts`
- `useAuthFlowState()` via `useSyncExternalStore` para superficies React.
- El **overlay se suscribe imperativamente** al store (listener directo → setea shared values), sin esperar el commit de React — elimina el lag de ~240ms medido en logs.
- Tokens de motion en un solo archivo:

```ts
BRIDGE_FADE_IN_MS = 180      // cubic-bezier(0.23, 1, 0.32, 1), scale 0.97→1
BRIDGE_MIN_HOLD_MS = 1200    // piso del momento de marca
SOAR_AWAY_MS = 550           // cubic-bezier(0.4, 0, 0.2, 1), translateY -60, scale 1.15
LOGIN_FALLBACK_FADE_MS = 240 // fade del auth stack (existente)
SAFETY_TIMEOUT_MS = 15000    // bridge → error(timeout)
PROMPT_FACE_ID_AT = inmediato al resolver probes (~0.4-0.5s reales)
```

### 2.4 `resolve-destination.ts` — función pura
La lógica de ruteo que hoy vive en effects de `AppEntryGate`:
`resolveDestination({ session, profile, family, onboardingCompletedAt, biometricSetupShown, … }) → '/(app)/(tabs)/home' | '/(app)/onboarding' | '/(app)/biometric-setup' | '/(auth)/join' | …`
Alimentada por el snapshot prefetcheado. Unit-testeable como matriz.

## 3. Superficies y navegación — un solo salto de ruta

- **`/` (index) = `BootScreen`** — única superficie del arranque. Renderiza por estado de máquina: fondo fern (idéntico al launch splash y al bridge), sub-estado biometric (fern + wordmark estático) o sub-estado PIN (PinPad embebido, con su screen-capture protection y lockout intactos). **Las rutas `/(auth)/unlock` y `/(auth)/pin-unlock` se eliminan.**
- **Una sola navegación real por viaje**: `router.replace(destino)` emitida por el driver **solo tras `BRIDGE_OPAQUE`** (ver invariantes). El usuario nunca ve una transición de ruta.
- **Launch splash**: intacto, auto-timed (2.0s + fade 220ms); su `onComplete` no gatea nada (Face ID es inmediato).
- **Overlay de transición**: mismos visuales, siempre montado en native (razón de perf vigente), renderiza `state.overlay: hidden | bridge | error(kind)`.
- **Login/Signup/OAuth callback**: controllers dejan de tocar splash/router directamente; emiten `LOGIN_SUCCESS` / `SIGNUP_SUCCESS` / `EMAIL_CONFIRMATION_PENDING`.
- **Watchers re-lock** (background >60s, inactividad 15min): emiten `RELOCK(source)`; la máquina aplica el grace window de 30s (`LOCK_THRESHOLDS.unlockGrace`) y decide.
- **`RequireAuth`** queda como bouncer de defensa en profundidad; no toca el splash.
- **`NotificationRouterBridge`** espera `ready` antes de rutear deep links.

## 4. Invariantes (las reglas que matan los parpadeos)

1. **Navegar solo cubierto**: el efecto `navigate` se emite al recibir `BRIDGE_OPAQUE` (callback del `withTiming` del fade-in), nunca junto a `FACE_ID_OK`. *(Validado en la demo: swapear antes produce el parpadeo reportado.)*
2. **El bridge nunca tapa el launch splash antes del success** (el overlay no se muestra pre-auth en cold start).
3. **Soar-away solo con destino listo**: `revealing` requiere `MIN_HOLD_ELAPSED ∧ DESTINATION_READY`.
4. **Superficies idénticas en cada seam**: boot fern ≡ bridge fern (mismo tamaño, centro real de pantalla, sin insets), launch → boot crossfade detrás del prompt.
5. **Cero timers huérfanos**: todo `schedule` se cancela al salir del estado que lo creó.
6. **Prefetch paralelo**: `prefetch-snapshot` se emite al entrar a `locked:*` (junto al prompt), no después del auth.

## 5. Viajes

### V1 · Cold start + Face ID success (camino principal)
```
t0      launch splash desde frame 1 (entrance del fern intacto)
~0.4s   PROBES_RESOLVED → locked:biometric → [prompt-biometric ∥ prefetch-snapshot]
0.5-2.2 usuario autentica; fern completa su growth detrás del prompt;
        launch→boot crossfade 220ms a los 2.2s (detrás del prompt)
OK      FACE_ID_OK → haptic + bridge fade-in 180ms sobre fern idéntico
+180ms  BRIDGE_OPAQUE → navigate(destino) cubierto; home monta con cache caliente
+1.2s   MIN_HOLD_ELAPSED ∧ DESTINATION_READY → revealing
+1.75s  soar-away 550ms → ready (home ya pintado)
```
Post-Face ID: **~1.75s, cero tiempo muerto**. Red lenta: el hold se estira (adaptativo); a los 15s → `bridge-error(timeout)`.

### V2 · Face ID cancel/fail
`FACE_ID_FAIL` → `fallback:login` → `navigate(/(auth)/login)` con fade 240ms. Sin splash, sin soar-away falso. Sin `autoBiometric=1` (el user canceló). Mensajes de error según `biometricFeedbackForError` (intactos).

### V3 · PIN
Igual a V1 con sub-estado PIN en el boot. `PIN_OK` → mismo bridge. **El PIN gana la transición premium** (hoy hace replace seco). "Olvidé mi PIN" → `fallback:login`. Lockout intacto.

### V4 · Login password / signup
Submit → bridge inmediato (cubre el network call; conserva el fix "aparece abrupta"). `LOGIN_SUCCESS` → mismo hold+reveal. `SIGNUP_SUCCESS` → bridge → onboarding (`DESTINATION_READY` lo emite el onboarding al montar). `EMAIL_CONFIRMATION_PENDING` → bridge se esconde, form muestra el info (como hoy). Face ID desde login (`use-auth-biometric-controller`) entra al mismo camino con su slow-path de refresh token.

### V5 · Re-lock
Watcher emite `RELOCK` → máquina respeta grace 30s → `navigate('/')` → boot en `locked:*` **sin** launch splash → V1/V3 desde el prompt.

## 6. Errores y edge cases

- **Snapshot falla / offline**: `LOAD_FAILED(kind)` → `bridge-error` con el fallback actual (Reintentar prueba NetInfo → `RETRY` → re-prefetch). El watcher de conectividad global emite eventos, no llama stores.
- **Timeout**: safety de 15s agendado al entrar a `bridging`, cancelado al salir.
- **Slow path sesión muerta**: adapter de sesión restaura con refresh token del Keychain; token expirado → `fallback:login` con mensaje actual; **las credenciales NO se borran** (decisión documentada preservada; solo logout explícito las borra).
- **Keychain inconsistente** (sin creds tras Face ID OK): limpia creds + `fallback:login` (paridad actual).
- **Biometría deshabilitada a nivel OS**: `locked:biometric` inalcanzable → cae a `locked:pin` si hay PIN, sino `bridging` directo (paridad con `lockRequired`).
- **Sin lock configurado**: `probing` → `bridging` directo (el bridge cubre el gate→home; reemplaza el `markAppUnlocked` por effect de J-Auth1).
- **Expo Go**: softening de `disableDeviceFallback` queda en el adapter biométrico.
- **OAuth callback**: emite `LOGIN_SUCCESS`, mismo bridge.
- **Re-entradas/double-fire**: no-ops por construcción de la máquina.

## 7. Testing

Vitest puro (sin React renderer, restricción del repo):
- `auth-flow-machine.test.ts` — cada viaje como secuencia de eventos → asserts de estados + efectos. Casos: V1–V5, cancel, error, retry, timeout, relock con/sin grace, eventos fuera de orden, double-fire.
- `resolve-destination.test.ts` — matriz (sesión × perfil × familia × onboarding × flags) → ruta.
- Driver testeable con adapters fake + scheduler fake (timers determinísticos).
- Validación manual por etapa en Expo Go (ver §9).

## 8. Plan de archivos

**Nuevos** (`mobile/features/auth-flow/`): `auth-flow-machine.ts`, `auth-flow-controller.ts`, `auth-flow-adapters.ts`, `resolve-destination.ts`, `use-auth-flow.ts`, `auth-flow-motion.ts`, tests. Nuevo `mobile/screens/boot/boot-screen.tsx`.

**Se eliminan/vacían**: `app-entry-gate.tsx`, `unlock-screen.tsx`, ruta `pin-unlock`, store `auth-transition-splash.ts`, `auth-transition-dismiss-gate.ts`, lógica de splash en `guards.tsx`.

**Se adaptan**: `TransitionOverlay` (suscripción imperativa), `use-login-submit` / `use-login-controller` / `use-auth-biometric-controller` (emiten eventos), `pin-unlock-screen` → componente `PinLockPanel` embebido en boot, watchers, `NotificationRouterBridge`, settings dev actions.

**Settings → Desarrollo**: las acciones de preview disparan **viajes sintéticos completos** contra la máquina real con adapters fake ("Probar viaje · Face ID success", "· cancel", "· PIN", "· error de red") — reemplazan "Probar splash · success/error" y sirven como validación tangible permanente.

## 9. Entrega por etapas (cada una probable en Expo Go)

1. **Máquina + tests + dev actions**: lógica completa testeada; en settings se disparan viajes simulados contra el overlay real. El flujo vivo no cambia.
2. **BootScreen + V1/V2 reales** (cold start Face ID): el flujo viejo sigue para login/PIN.
3. **V4 (login/signup/OAuth)** migrados.
4. **V3 (PIN) + V5 (re-lock)** migrados.
5. **Demolición**: borrar gate/stores/rutas viejas + actualizar docs (`app-lock-model.md`, este spec marcado implementado).

## 10. Fuera de alcance

- Cambios visuales a cualquier pantalla o al fern.
- Personalización del lock screen (avatar/nombre estilo MP) — posible follow-up.
- Cambios al modelo de seguridad (thresholds de re-lock, lockout de PIN, Keychain).
- Web: el flujo web conserva el comportamiento condicional actual del overlay.
