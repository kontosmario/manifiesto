# 2026-06-11 — Refactor completo del flujo auth + pulido de superficies

> **Sesión**: refactor desde cero de la orquestación de autenticación
> (pedido owner: "que se sienta como Mercado Pago") + debugging en device
> real + pulido de welcome/signup/forgot + flujo de password reset.
> **Alcance**: 38 commits en `manifiesto` (`27af905..2d53a55`) + 2 en
> `manifiestoapp-site` (`31b2220`, `5ce5c06`) + config prod de Supabase.
> **Verificación**: 812 unit tests ✓ · tsc ✓ · eslint 0 errors ✓ ·
> `expo export` iOS ✓ · validado por el owner en Expo Go + IPA en device.

## 1. La máquina auth-flow (el refactor central)

Doc canónico: `docs/sistemas/auth-flow.md` · Spec:
`docs/superpowers/specs/2026-06-11-auth-flow-refactor-design.md` (✅
IMPLEMENTADO) · Demo de pacing: `docs/auth-flow-demo.html`.

**Qué se construyó** (`mobile/features/auth-flow/`): máquina de estados
pura (`transition(state, event) → {state, effects[]}`) + driver con
adapters inyectados + BootScreen como única superficie de arranque +
tokens de motion centralizados. Los 5 viajes (cold start FaceID, cancel,
PIN, login/signup, re-lock) corren sobre la máquina con 6 invariantes
anti-parpadeo. 35 tests nuevos de la lógica.

**Qué se demolió** (commit `005b385`): AppEntryGate, unlock-screen,
pin-unlock-screen, store auth-transition-splash, dismiss-gate, rutas
`/unlock` y `/pin-unlock`. −1.190 líneas netas.

## 2. Los tres bugs reales cazados en device (post-refactor)

| Bug | Root cause | Fix |
|---|---|---|
| Min-hold disparando 1.5s tarde | setTimeout starved por JS thread (Metro bundling + mount del home) | Flush wall-clock de timers vencidos en cada dispatch (`9b4e934`) |
| Cold-start animation cortada con Face ID real (~1s) | El bridge (z50) tapaba el launch splash (z20) al success | Soberanía del launch: overlay suprimido mientras esté visible; el launch persiste y ES el bridge del unlock, sale con soar (`ca91b27`, `ea588ce`) |
| **"Pantalla solo verde" post-passcode** (el gran culpable) | El prompt biométrico pone AppState=`inactive` TODO el prompt +1.4s después → el BackgroundSnapshotOverlay (verde sólido z100) tapaba el viaje entero. Password nunca lo disparaba (sin sheet) | `biometric-prompt-state` en el chokepoint `authenticateBiometricAccess`; el cover ignora ese `inactive`. `background` real sigue cubriendo (`a53cb1f`) |

Además: cancel → login usa la MISMA transición que el success (soar del
hero) y las entradas root-level a (auth)/(app) van con `animation:
'none'` — siempre ocurren cubiertas (`6b1ef12`).

## 3. Decisiones owner del día

- **Snapshot cover DESACTIVADO** (`SNAPSHOT_COVER_ENABLED=false`,
  `2be583b`): el contenido ya no desaparece en el app switcher. Revierte
  P·P-2 conscientemente — addendum en el doc de security hardening;
  **re-evaluar pre-submit App Store**.
- **Gate biométrico ACTIVO en Expo Go** (`8dc12eb`): la sheet de
  passcode es fea pero ejercita el mismo código que el build real.
- **Logo ENTERO (con tallo) en todos lados** (`9da5562`): chau
  `iconMode` en headers de login/signup y el círculo peach del login.
- **Hold del bridge 550ms** (`be0a918`): el soar-away es el feedback del
  éxito; 1200ms se leía como verde muerto.

## 4. Pulido de superficies auth

- **Recuperar acceso** (`e523478`): reescrita 1:1 con la anatomía del
  login (topNav chevron icónico + fern, hero staggered, dos estados).
- **Signup** (`ff21f3b`, `eea91a2`): el botón ya no se traga el tap con
  datos inválidos (pinta error + enfoca el campo + helper de requisitos);
  transiciones fluidas en TODOS los estados (SubmitCta interpolado +
  scale al press + crossfade flecha/spinner; StrengthMeter con fill en
  cascada; errorField pinta el campo culpable; FeedbackPill animado).
- **Welcome** (`a96b5ac`, `1461c08`): handoff splash→welcome
  pixel-aligned de nuevo (la reserva invisible no espejaba el
  dataDisclosure → fern ~20px arriba); EMPEZAR con sesión colgada ya no
  congela 2.5s (logout con imports estáticos — los dynamic imports no
  ahorraban nada en prod — + spinner en el CTA).
- **BootScreen con fireflies** (`39d7cc7`): la superficie de lock
  respira (mismo campo determinístico que el bridge).

## 5. Password reset end-to-end

Doc canónico: `docs/sistemas/password-reset.md`.

- **Decisión**: reset IN-APP (no web) — PKCE lo fuerza (el code solo lo
  canjea la app que lo pidió) y la pantalla acumula las defensas de
  sprints G/H/P.
- **Fix del rebote a manifiestoapp.com**: `redirectTo` ahora usa el
  Universal Link en builds reales (`0e05a18`); el exp:// de Expo Go no
  estaba en el allowlist y Supabase caía al Site URL.
- **Landing LIVE**: `manifiestoapp.com/auth/reset-password` (site repo
  `31b2220`+`5ce5c06`, deployada y verificada 200) — rebota a la app
  preservando el code; desktop-aware (iOS no dispara Universal Links
  desde 302s, por eso existe).
- **Emails en español brandeados** (Management API, autorización owner):
  Recovery ("Restablecé tu contraseña de Manifiesto") + Confirmation
  ("Confirmá tu email para entrar a Manifiesto").
- **Pendiente owner**: SMTP custom para `soporte@manifiestoapp.com`
  (cuenta Resend + DNS + settings — runbook en el doc). Mientras: sender
  built-in de Supabase (~2 mails/hora, suficiente para dev).

## 6. Entorno de desarrollo

- **Dev client local destrabado**: el Mac no tenía identidad de firma —
  certificado Apple Development creado vía Xcode + **WWDR G3 intermedio
  instalado** (solo estaba el G1 vencido 2023; era la causa de "No code
  signing certificates"). `npx expo run:ios --device` operativo.
- **IPA sin firmar**: `./scripts/build-ipa.sh` → `dist/ios/` (28MB,
  Release) — usado para validar Face ID real en device.
- **Dev journeys** (Settings → Desarrollo): "Probar viaje · Face ID
  success / cancel / error de red" corren la máquina real con adapters
  fake; "Forzar reset del flujo auth" como escape hatch.
- **Logs**: filtrar `[auth-flow]` en Metro — máquina, adapters, overlay,
  launch y snapshot-overlay loguean cada transición.

## 7. Estado de pendientes

| Pendiente | Dueño | Cuándo |
|---|---|---|
| Resend + SMTP `soporte@manifiestoapp.com` | Owner (signup) → Claude cierra DNS/SMTP | Pre-submit |
| Re-evaluar snapshot cover (P·P-2 desactivado) | Ambos | Pre-submit |
| `FadeInUp` triplicado (login/signup/forgot) → extraer a components/auth | Claude | Próximo cleanup |
| Relock+cancel: swap directo boot→login (sin soar — caso menor) | Claude | Si molesta |
| Android: SHA256 placeholder en assetlinks | Owner | Play Store launch |

**Siguiente etapa acordada**: pulido dirigido por el owner, tema por tema.
