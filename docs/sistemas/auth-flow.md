# Auth Flow — máquina de estados (sistema canónico)

> Implementado 2026-06-11 según `docs/superpowers/specs/2026-06-11-auth-flow-refactor-design.md`.
> Demo de pacing: `docs/auth-flow-demo.html` (abre en browser, timings 1:1).

## Qué es

Toda la orquestación de autenticación (cold start, Face ID, PIN, login,
signup, OAuth, re-lock, transiciones) corre sobre UNA máquina de estados
pura + un driver con IO. Reemplaza al sistema anterior (AppEntryGate +
unlock screens + store `auth-transition-splash` + coordinación en 6
archivos), eliminado en el commit `005b385`.

## Arquitectura (mobile/features/auth-flow/)

| Archivo | Rol |
|---|---|
| `auth-flow-machine.ts` | Reducer puro `transition(state, event) → {state, effects[]}`. Sin React/IO/timers. Eventos fuera de estado = no-ops. |
| `auth-flow-controller.ts` | Driver singleton: ejecuta efectos contra adapters inyectados; `dispatchAuthFlow` / `getAuthFlowState` / `subscribeAuthFlow`. |
| `auth-flow-adapters.ts` | Adapters reales (probes, biometría, sesión fast/slow path, prefetch snapshot, resolveDestination, router, haptics). |
| `auth-flow-motion.ts` | **Todos los timings del feel.** Cambiar el pacing = tocar un número acá. |
| `resolve-destination.ts` | Ruteo post-auth puro (biometric-setup → onboarding → join → home). |
| `use-auth-flow.ts` | `useAuthFlowState()` + `useIsAuthOverlayVisible()` (incluye offline takeover). |
| `use-signal-destination-ready.ts` | Hook para que el destino libere el soar-away. |
| `offline-takeover.ts` | Takeover offline GLOBAL (heredero del rol app-wide del store viejo; independiente de la máquina). |
| `dev-journeys.ts` | Viajes simulados (Settings → Desarrollo) + `forceResetAuthFlow`. |

## Estados y eventos

```
idle → BOOT → probing → PROBES_RESOLVED ─┬─ guest            (sin sesión → welcome / login?autoBiometric=1)
                                         ├─ locked:biometric (prompt FaceID ∥ prefetch snapshot)
                                         ├─ locked:pin       (PinLockPanel en BootScreen ∥ prefetch)
                                         └─ bridging directo (sin lock, o isUnlocked post-login)

locked ─ FACE_ID_OK / PIN_OK ──────────→ bridging (haptic + min-hold 1.2s + safety 15s)
locked ─ FACE_ID_FAIL / USE_PASSWORD ──→ fallback-login → navigate /(auth)/login

guest/fallback/idle ─ LOGIN_PENDING ───→ bridging (authed=false; cubre el network call)
                     LOGIN_SUCCESS / SIGNUP_SUCCESS → authed=true + prefetch-snapshot
                     LOGIN_FAILED / EMAIL_CONFIRMATION_PENDING → guest (overlay se esconde)

bridging: BRIDGE_OPAQUE (callback del fade-in) ∧ authed → confirm-session + resolveDestination
          + navigate (CUBIERTO) → NAVIGATED
          NAVIGATED ∧ MIN_HOLD_ELAPSED ∧ DESTINATION_READY → revealing (soar-away) → REVEAL_DONE → ready
          LOAD_FAILED / SAFETY_ELAPSED → bridge-error → RETRY (re-prefetch) | SESSION_RESTORE_FAILED → login

ready ─ RELOCK(background>60s / inactivity 15min) → probing (reset-app-lock + navigate /)
any   ─ LOGOUT (logoutSession) → guest
```

`BOOT` es re-ejecutable desde fases terminales (guest/fallback-login/ready)
— cubre re-entradas al `/` (bounces de RequireAuth, flujos legacy).

## Invariantes (anti-parpadeo)

1. **Navegar solo cubierto**: `navigate` dispara al recibir `BRIDGE_OPAQUE`
   (emitido desde el callback de `withTiming` del fade-in del overlay, o de
   inmediato si el launch splash está cubriendo la pantalla).
2. **El cold-start splash es SOBERANO**: mientras `AuthLaunchSplash` está en
   pantalla el overlay queda suprimido — el bridge JAMÁS lo tapa (ni siquiera
   post-success: con Face ID real el OK llega a mitad del growth). La máquina
   navega por debajo y el fade-out propio del launch (~2.2s) revela el
   destino ya montado. Si el auth tarda más que el growth, el launch ya se
   fue y el bridge opera normal (fade-in + hold + soar sobre el boot fern).
3. Soar-away solo con `navigated ∧ minHold ∧ destinationReady`.
4. Superficies idénticas en cada seam (BootScreen fern ≡ overlay fern,
   centro real de pantalla, sin insets).
5. Cero timers huérfanos (`cancel-timers` al salir del estado creador).
6. Prefetch del snapshot EN PARALELO con el prompt (locked) o al
   confirmar identidad (login).

## Timings (auth-flow-motion.ts)

| Token | Valor | Qué controla |
|---|---|---|
| `BRIDGE_FADE_IN_MS` | 180 | Fade-in del bridge (scale 0.97→1, bezier 0.23/1/0.32/1) |
| `BRIDGE_MIN_HOLD_MS` | 550 | Piso post-auth (1200→550 tras feedback en device 2026-06-11: el soar-away es el feedback del éxito) |
| `SOAR_AWAY_MS` | 550 | Salida (translateY −60, scale 1.15, bezier 0.4/0/0.2/1) |
| `SAFETY_TIMEOUT_MS` | 15000 | Bridge colgado → error(timeout) |
| `LOGIN_FALLBACK_FADE_MS` | 240 | Fade del auth stack al login (en `(auth)/_layout`) |

## Superficies

- **BootScreen** (`/` index): única superficie de arranque. Fern + wordmark;
  sub-estado PIN → `PinLockPanel`. Dispatchea `BOOT` al montar; el resto lo
  hace el driver.
- **TransitionOverlay** (root-layout-shell): always-mounted en native;
  renderiza `getOverlayMode(machine)` + offline takeover. Visuales en
  `AuthTransitionSplash` (fern + fireflies + error fallback con Reintentar).
- **AuthLaunchSplash** (cold start): intacto, auto-timed, debajo del prompt.
- Welcome/Login/Signup: diseños intactos; emiten eventos.

## Cómo probar (Settings → Desarrollo, solo __DEV__)

- **Probar viaje · Face ID success / cancel / error de red**: corren la
  máquina real con adapters fake (FaceID 2.2s, red 0.9s) contra el overlay
  real. Logs en Metro: filtrar `[auth-flow]`.
- **Forzar reset del flujo auth**: escape hatch si un viaje simulado queda
  colgado.

## Tests

- `tests/unit/auth-flow-machine.test.ts` — 26 casos (V1–V5, errores,
  retry, relock, no-ops fuera de estado, double-fire).
- `tests/unit/auth-flow-controller.test.ts` — driver con adapters fake
  (invariante 1, timers, prefetch fallido, restore fallido).
- `tests/unit/resolve-destination.test.ts` — matriz de ruteo.

## Gotchas

- **Timers starved**: setTimeout puede dispararse tarde con el JS thread
  bloqueado (Metro lazy-bundling en Expo Go dev, mount pesado del home) —
  medido 1.5s de drift en el min-hold. El driver registra el vencimiento
  wall-clock de cada timer y los flushea vencidos en cada dispatch
  (`flushOverdueTimers`), así DESTINATION_READY adelanta el reveal.

- `logoutSession` DEBE despachar `LOGOUT` (ya lo hace) — sin eso la máquina
  queda en `ready` y el próximo login no muestra bridge.
- `NotificationRouterBridge` difiere deep links hasta `phase === 'ready'`
  (un push mid-bridge sería pisado por el replace del driver).
- El slow-path de sesión (refresh token del Keychain) NO borra credenciales
  al expirar — el login con password las re-arma (decisión documentada).
- **Expo Go: gate biométrico OMITIDO en cold start** (2026-06-11). El host
  de Expo Go no tiene NSFaceIDUsageDescription → el "prompt" degrada a la
  sheet de passcode del sistema (full-screen, no representa el producto).
  `runProbes` reporta `shouldUseBiometric: false` en Expo Go: con sesión
  vas directo al bridge → home; el PIN de la app sigue gateando si está
  seteado. El gate biométrico real se prueba en dev-client/EAS/TestFlight;
  los viajes con prompt se simulan vía Settings → Desarrollo.
- Expo Go: `disableDeviceFallback` se suaviza en el adapter biométrico
  para los prompts user-triggered que quedan (login manual, enrolamiento).
