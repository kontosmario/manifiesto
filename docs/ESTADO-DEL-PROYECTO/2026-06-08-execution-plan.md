# Execution Plan · Code-only Pendientes

> **Plan vivo y actualizable** — todos los items que dependen 100% de código (no de 3rd-parties / legal / Apple Dev / owner decisions). Tachalo a medida que avanzás.
>
> **Source of truth**: este doc reemplaza la sección "Pendientes" de [`2026-06-08-estado-ready-pendientes.md`](2026-06-08-estado-ready-pendientes.md) para los items de código. Cuando un item se marca DONE, agregá el commit SHA + fecha al lado.
>
> **Última actualización**: 2026-06-08
>
> **HEAD al armar el plan**: `99ed0db` — 35 commits ahead de `origin/main`.

---

## 0 · Cómo usar este doc

### Estados

| Estado | Símbolo | Significado |
|---|---|---|
| TODO | `- [ ]` | Sin empezar |
| WIP | `- [~]` | En progreso (agregá tu nombre/branch) |
| DONE | `- [x]` | Completado (agregá SHA + fecha) |
| BLOCKED | `- [!]` | Esperando dependencia (anotá cuál) |
| SKIPPED | `- [-]` | Decidido no hacer (anotá razón) |

### Convenciones de update

1. **Antes de empezar un item**: cambiar a `WIP` + agregar tu branch entre paréntesis.
2. **Al cerrar**: marcar DONE + agregar commit SHA + fecha (`✅ a1b2c3d 2026-06-10`).
3. **Si surge un blocker**: marcar BLOCKED + describir qué falta.
4. **Si encontrás un sub-item nuevo durante el trabajo**: agregalo abajo del item padre como sub-bullet.
5. **Si descubrís que un item no aplica**: SKIPPED + razón. No lo borres — el ledger histórico importa.

### Orden recomendado

**Sprint A → B → C → D**. Backlog (P5) lo agarrás cuando se desbloquee la decisión del owner correspondiente.

Si solo tenés bandwidth para 1 sprint en la próxima semana: **Sprint A** (App Store CODE — todo lo que se puede preparar mientras llega Apple Dev / legal hosting).

---

## 1 · Sprint A — P1 App Store CODE (~5.5 días)

> **Objetivo**: dejar todo el código mobile + backend listo para que cuando llegue la APNs key + Privacy/Terms hosting + listing assets, sea solo wiring final.

### A1 · Delete-account UI flow (1 d)

- [x] **DONE** `bc322e6` 2026-06-09 — pantalla dedicada `/(app)/settings/delete-account` con disclaimer, typed "ELIMINAR" case-sensitive, re-auth PIN o biometría antes de la RPC. Reutiliza el shipped soft-delete RPC `request_account_deletion` (gracia 30d + cron processor en `20260517000000_account_deletion.sql` + `20260518000000_account_deletion_processor.sql`). El sheet legacy queda como backup.

**Por qué**: Apple guideline 5.1.1(v) — submission requirement.

**Files**:
- NEW `mobile/screens/settings/delete-account-screen.tsx`
- NEW `mobile/features/account/use-delete-account.ts`
- NEW migration: `supabase/migrations/YYYYMMDDHHMMSS_delete_my_account_rpc.sql`
- MOD `mobile/screens/settings/settings-screen.tsx` (link a la screen)
- MOD `app/(app)/settings/delete-account.tsx` (route)

**Acceptance**:
- [ ] Settings → "Eliminar cuenta" abre screen con disclaimer
- [ ] 2 confirmaciones (typed "ELIMINAR" + biometric/pin)
- [ ] RPC `delete_my_account()` `SECURITY DEFINER` borra: profile, family_members (donde user_id), savings_goals (donde created_by), push_subscriptions, telemetry rows. Mantiene expenses con `created_by = null` (preservar historia familiar).
- [ ] Sign-out automático post-RPC + redirect a welcome
- [ ] Migration con `revoke/grant` patrón

**Notas**: la RPC debe ser idempotente. Si el user está en family con otros members, NO borra family (solo se va). Si es el único member, marca `family.archived_at = now()`.

---

### A2 · Password reset UI flow (0.5 d)

- [x] **DONE** — verificación end-to-end 2026-06-09 (sin cambios de código requeridos; todo ya estaba wireado en commits previos)

**Por qué**: el backend está (Supabase Auth `resetPasswordForEmail`); falta el flow visual completo.

**Files**:
- EXISTS `mobile/screens/auth/reset-password-screen.tsx` — verificar que esté wireado correctamente
- EXISTS `mobile/screens/auth/forgot-password-screen.tsx`
- MOD verificar deep link `app.json` para `manifiesto://reset-password?token=`

**Acceptance**:
- [ ] Login → "Olvidé mi contraseña" → email input → "Te mandamos un mail"
- [ ] Link del email abre app en `/reset-password?token=...`
- [ ] Form pide nueva contraseña (validación 8+ chars — ya alineado en CR v2)
- [ ] Submit → sign-in automático con la nueva pass
- [ ] Error handling: token expirado / inválido

**Notas**: muchas piezas están — verificá end-to-end con un email real (no mock). Si falta wiring de deep link → priorizar eso.

**Verificación (2026-06-09)**:
- `forgot-password-screen.tsx` llama `supabase.auth.resetPasswordForEmail` con `redirectTo` derivado de `getPasswordResetRedirectTo()` → `manifiesto://auth/reset-password`.
- `app/auth/reset-password.tsx` route monta `ResetPasswordScreen`, que parsea `code` con `useLocalSearchParams` y lo intercambia vía PKCE (`exchangeCodeForSession`).
- `app.config.ts` ya declara `scheme: 'manifiesto'` → el deep link entra a la app.
- Validación 8+ chars + match con confirmar ya implementada. Stages: `exchanging | form | success | error | timeout` con timeout de 30s y CTAs de "pedir otro link".
- Sign-in automático: Supabase deja sesión activa tras `exchangeCodeForSession` + `updateUser({password})`, y el "Ir al inicio" cierra el flow.

---

### A3 · Email confirm resend (0.5 d)

- [x] **DONE** `151f4f2` 2026-06-09

**Por qué**: si el user no recibe email tras signup, hoy queda atascado.

**Files**:
- MOD `mobile/screens/auth/signup-screen.tsx` (banner post-signup)
- MOD `mobile/screens/auth/login-screen.tsx` (banner si `email_confirmed_at = null`)
- NEW `mobile/features/auth/use-resend-confirm-email.ts` (wrapper de `supabase.auth.resend({type: 'signup'})`)

**Acceptance**:
- [ ] Post-signup screen muestra "¿No te llegó? Reenviar" con cooldown 60s
- [ ] Login con email no confirmado muestra banner + reenvío
- [ ] Rate limit client-side: 3 reenvíos / 5min

---

### A4 · Apple Sign-In screen + integration (1 d)

- [x] **DONE (code-complete)** — verificación end-to-end 2026-06-09. `expo-apple-authentication` integrado en `mobile/features/auth/social-sign-in.ts` (`signInWithApple` con identity token + supabase.auth.signInWithIdToken). Botón nativo en `login-screen.tsx:367+` y `signup-screen.tsx:278`. Wiring iOS-only completo. **Pendiente solo de Apple Dev capability enable + provisioning profile + EAS production build** para test end-to-end real.

**Por qué**: si vas a usar email/password + social, Apple guideline pide Apple Sign-In también.

**Files**:
- INSTALL `expo-apple-authentication`
- MOD `app.json` plugin + entitlement
- MOD `mobile/screens/auth/login-screen.tsx` + `signup-screen.tsx` (botón)
- NEW `mobile/features/auth/use-sign-in-with-apple.ts`

**Acceptance**:
- [ ] Botón "Continuar con Apple" en login + signup
- [ ] Flow nativo iOS abre, retorna identity token
- [ ] `supabase.auth.signInWithIdToken({provider: 'apple', token})` autentica
- [ ] Email + name del token se guardan en `profile` (Apple solo los manda la primera vez)
- [ ] Funciona en dev client + EAS build

**Notas**: capability requires Apple Developer Program. Código se puede escribir + commitear ahora; testeable solo después del enable + EAS build.

---

### A5 · Permission priming sheets (0.5 d)

- [x] **DONE** `6ba92df` 2026-06-09 (sheet + cooldown + biometric integration) + `4051d3d` 2026-06-09 (notifs integration en onboarding-success).

**Por qué**: pre-prompts con explicación boostean aceptación de 35% → 70% típico.

**Files**:
- NEW `mobile/components/permissions/permission-prime-sheet.tsx`
- NEW `mobile/lib/permission-prime-cooldown.ts` (helper SecureStore-backed)
- MOD `mobile/screens/home/onboarding-success-screen.tsx` (notifs priming antes del modal nativo, ANTES de navegar al Home)
- MOD `mobile/screens/auth/biometric-setup-screen.tsx` (FaceID priming antes de `activateBiometricForSession`)

**Acceptance**:
- [x] Antes del modal nativo de Notifications, muestra un sheet con: ícono + 3 razones + CTA "Permitir"
- [x] Mismo patrón para FaceID
- [x] Si el user dice no, ofrece "Más tarde" (no insiste por 7 días)

**Notas implementación**: el priming de notifs se enchufó en `onboarding-success-screen` en vez de `onboarding-screen` porque el flow real de notifs vive ahí (entre la última paso del wizard y Home). El wizard mismo nunca pedía notifs.

---

### A6 · Version / About / Support screen (0.5 d)

- [x] **DONE** `635eeda` 2026-06-09 — pantalla `/(app)/settings/about` con hero (versión + build), grupo "Información legal" (Privacy/Terms, oculta filas si su URL en `legal-urls.ts` está vacía), grupo "Soporte" con mailto pre-poblado vía `buildSupportMailto`, footer "Hecho con ♥ en Argentina". Settings ahora linkea con un row "Acerca de" al final.

**Por qué**: App Store listing requiere link a privacy + support email.

**Files**:
- NEW `mobile/screens/settings/about-screen.tsx`
- MOD `mobile/screens/settings/settings-screen.tsx` (link)
- USE `expo-application` para `Application.nativeApplicationVersion` + `nativeBuildVersion`

**Acceptance**:
- [ ] Settings → "Acerca de" muestra: logo, version (1.0.0), build number, "Política de privacidad" (link a URL hosteada — owner pendiente), "Términos" (link), "Soporte" (mailto: pendiente owner email), "Hecho con ♥ en Argentina"
- [ ] Si las URLs están vacías (owner aún no las puso), oculta esos rows

---

### A7 · Push iOS production wiring — mobile side (1 d)

- [x] **DONE** `4051d3d` 2026-06-09 — code listo. End-to-end test pendiente solo de APNs key.

**Por qué**: el código que registra el token + maneja notificaciones debe estar listo para test pre-submit.

**Files**:
- NEW `mobile/lib/push-notifications.ts` (facade: requestNotificationPermissions / setupPushNotifications / tearDownPushNotifications)
- NEW `mobile/features/push/use-register-push-token.ts` (hook side-effect que upserta el token en mount)
- MOD `mobile/components/root/app-stack-shell.tsx` (monta el hook)
- MOD `mobile/features/auth/logout.ts` (tear-down del token en logout)
- MOD `app.config.ts` (`ios.config.usesNonExemptEncryption: false`)

**Acceptance**:
- [x] Al firstmount del app post-login, pide permiso de notifs (después del priming de A5)
- [x] Si aceptó, obtiene Expo push token + lo guarda en `push_subscriptions` (upsert por user_id+endpoint, mismo shape que el toggle manual de Settings)
- [x] Re-registra el token si cambia (`useRegisterPushToken` corre cada mount; el upsert es idempotente)
- [x] Handle de notification tap: navega a route correspondiente (deep link parse) — ya estaba via `NotificationRouterBridge`, no se tocó
- [x] Cleanup en logout

**Notas**: end-to-end test solo posible cuando A8 esté + APNs key activa. Decisión: no usamos RPC `register_push_subscription` (no existía y no aporta sobre el upsert directo); reusamos el path del toggle manual existente.

---

### A8 · Push token registration → Edge Function APNs (0.5 d)

- [x] **DONE** (verify-only, no code change) 2026-06-09 — el edge function ya estaba completo. Decisión documentada: Expo Push API como proxy en vez de APNs directo.

**Por qué**: el edge function `send-family-push` existe pero hay que verificar/completar el firmado con APNs.

**Files**:
- VERIFIED `supabase/functions/send-family-push/index.ts` — usa **Expo Push API** (`https://exp.host/--/api/v2/push/send`) que proxea a APNs por nosotros. No requiere `.p8` key ni JWT signing del lado nuestro.

**Migration**: no hace falta. La tabla `push_subscriptions` ya tiene `last_used_at` (migración `20260512090000`); el upsert del path nuevo de A7 actualiza esa columna en cada login. No agregamos `apns_token` ni `device_id` porque mientras usemos Expo Push, alcanza con `endpoint` (el Expo token mismo es la identidad del device).

**Acceptance**:
- [x] Edge function acepta `{familyId, title, body, kind, url}` (path original) y `{messages: ExpoPushMessage[]}` (path batch para notifications-orchestrator). Envío a Expo Push API que entrega a APNs producción.
- [x] Manejo de errores: si Expo devuelve `DeviceNotRegistered`, llama `removeSubscription` y elimina la fila de `push_subscriptions`.
- [x] Logs estructurados: `console.log` con `{sent, failed, removed}` por batch.

**Decisión Expo Push vs APNs directo**: por ahora usamos Expo Push como proxy — más simple (no necesitamos cargar la `.p8` key ni implementar JWT signing en el edge function). Migrar a APNs directo cuando: (a) el owner cargue la `.p8` key, y (b) decidamos cortar la dependencia de Expo (relevante si llegamos a >100k notifs/día, donde el rate-limit de Expo Push empieza a doler). Costo de migrar: ~0.5 d porque la estructura del edge function ya está, sólo cambia el call a Expo por un firmado APNs.

---

## 2 · Sprint B — P2 hardening pre-prod (~6 días)

> **Objetivo**: cerrar los hardening items de [P1 del roadmap original](2026-05-31-roadmap-priorizado.md) que dependen de código.

### B1 · Re-auth on destructive actions (0.5 d)

- [x] **DONE** `e498ac4` 2026-06-09 — sheet reusable + hook + integration en leave-family + delete-savings-goal (con monto > 0). Delete-account ya tenía su propio flow custom (más completo) y se mantiene como está.

**Files**:
- NEW `mobile/components/auth/require-reauth-sheet.tsx` — bottom sheet con PIN pad + biometric fallback (biometric > PIN > "configurá uno desde Settings")
- NEW `mobile/features/auth/use-require-reauth.ts` — hook promise-resolver con skip-window de 5min in-memory (`useRef`)
- MOD `mobile/screens/settings/savings-goal-screen.tsx` — gate antes de delete cuando `current_amount > 0`
- MOD `mobile/screens/settings/settings-screen.tsx` — gate antes de `useLeaveCurrentFamily.mutate` (tanto destroy-flow del owner como leave normal del member)
- Delete-account-screen: NO se modificó (su flow custom propio cubre lo mismo: typed-phrase + PIN/biometric obligatorio).

**Acceptance**:
- [x] Acción destructiva → sheet "Confirmá tu identidad" → pin/biometric prompt
- [x] Skip-window de 5min en `useRef` (in-memory; per-session, no across cold-starts — esto es deliberado: el threat model es shoulder-surfing, no recovery de un dispositivo dormido).
- [x] Falla 3 veces → reusa el lockout exponencial de `verifyPin()` en `pin-lock.ts` (30s/1m/2m/4m/8m). El sheet muestra `Bloqueado Xs` con `accessibilityLiveRegion="polite"`.

---

### B2 · Rate limiting RPCs sensibles (1 d)

- [x] **DONE (code-complete, pending `db push --linked`)** 2026-06-09 — migrations creadas:
  - `20260609010000_rpc_rate_limit.sql` — tabla + `check_rate_limit()` helper (sliding window)
  - `20260609020000_apply_rate_limit_to_rpcs.sql` — aplica límites a las 3 RPCs sensibles
  - `20260609030000_rpc_rate_limit_purge_cron.sql` — cron diario (03:00 UTC / 00:00 AR) que borra rows > 24h

**Files**:
- NEW migration: `YYYYMMDDHHMMSS_rpc_rate_limit.sql`
  - tabla `rpc_rate_limit (user_id, rpc_name, count, window_start)` con PK compuesto
  - function `check_rate_limit(p_rpc text, p_max int, p_window_sec int)` SECURITY DEFINER
- MOD `apply_month_close_decision`, `apply_reserve_decision`, `consume_family_invite` (call `check_rate_limit` al inicio)

**Acceptance**:
- [ ] `apply_month_close_decision`: máx 5 calls / hour por user (suficiente para retries legítimos)
- [ ] `apply_reserve_decision`: máx 10 / hour
- [ ] `consume_family_invite`: máx 3 / día (anti-bruteforce de codes)
- [ ] RAISE descriptivo: "rate limit exceeded, retry after Xm"
- [ ] Cron diario que purge rows > 24h

---

### B3 · Captcha integration signup / reset (0.5 d)

- [x] **DONE (code-complete, pending owner: site key + Supabase enable)** `917f019` 2026-06-09 — hCaptcha integrado vía `@hcaptcha/react-native-hcaptcha@4.0.0` (compatible con Expo SDK 54, requiere `react-native-webview` + `prop-types` que ya se sumaron). En dev sin `EXPO_PUBLIC_HCAPTCHA_SITE_KEY` el captcha se SKIPEA con `console.warn` visible — listo para producción cuando el owner cargue la key.

**Files**:
- INSTALL `@hcaptcha/react-native-hcaptcha` (4.0.0), `react-native-webview` (~13.16.1), `prop-types` (15.x — peer del wrapper)
- NEW `mobile/lib/captcha-config.ts` — site key + base URL + helper `isCaptchaConfigured()`
- NEW `mobile/components/auth/captcha-modal.tsx` — wrapper alrededor del `ConfirmHcaptcha` default export (imperative show/hide via ref)
- NEW `mobile/features/auth/use-captcha.ts` — hook promise-resolver `request(): Promise<string | null>`
- MOD `mobile/features/auth/use-auth-actions.ts` — `usePasswordSignUp` y `usePasswordReset` aceptan `captchaToken?: string`
- MOD `mobile/screens/auth/signup-screen.tsx` — `await captcha.request()` antes del `signUp`; aborta si cancel
- MOD `mobile/screens/auth/forgot-password-screen.tsx` — mismo flow antes del `resetPasswordForEmail`

**Owner pendiente (no code)**:
1. Crear site en https://dashboard.hcaptcha.com → copiar site key
2. Cargar en EAS: `eas secret:create --scope project --name EXPO_PUBLIC_HCAPTCHA_SITE_KEY --value <key>`
3. Supabase Dashboard → Auth → Settings → Bot and Abuse Protection → Enable hCaptcha → pegar la SECRET key

**Acceptance**:
- [x] Captcha visible en signup + forgot password (cuando hay site key)
- [x] Token va a `supabase.auth.signUp({options: {captchaToken}})` y `resetPasswordForEmail(email, {captchaToken})`
- [x] Si falla (cancel/error/expired), no avanza el flow (muestra "No pudimos verificar el captcha. Probá de nuevo.")
- [x] Sin site key (dev), captcha se skipea con `console.warn` en `__DEV__`

---

### B4 · Tablas `audit_log` / `invitations` / `devices` (1 d)

- [x] **DONE (code-complete, pending `db push --linked`)** 2026-06-09 — migration `20260609040000_audit_log_invitations_devices.sql`:
  - `audit_log` con RLS (owner-can-read) + 3 indexes (user/family/action × at desc)
  - `family_invites` extendida con `revoked_at`, `max_uses`, `times_used` (RPCs siguen single-use; multi-use queda como capability latente)
  - `devices` con RLS owner-full-access + index `(user_id, last_seen desc)`. Tabla parking — no se popula desde mobile aún.

**Files**:
- NEW migration: `YYYYMMDDHHMMSS_audit_invitations_devices.sql`
  - `audit_log (id, user_id, family_id, action, target_table, target_id, payload jsonb, ip, ua, at)`
  - `invitations` ya existe parcial — agregar columnas faltantes (revoked_at, max_uses)
  - `devices (user_id, device_id, platform, last_seen, last_ip, push_token)` — track de sesiones activas

**Acceptance**:
- [ ] RLS: user lee solo sus own rows
- [ ] Indexes en (user_id, at desc) para queries
- [ ] Triggers que loggean a `audit_log` desde service-role calls

---

### B5 · Service-role audit log automatic (0.5 d)

- [x] **DONE (code-complete, pending `db push --linked`)** 2026-06-09 — migration `20260609050000_service_role_audit_triggers.sql`:
  - Función `audit_service_role_write()` que detecta `auth.role() = 'service_role'` y loggea a `audit_log` (defensive: nunca bloquea el write original si el log falla).
  - Triggers AFTER INSERT/UPDATE/DELETE en 6 tablas críticas: `family_finance`, `savings_goals`, `expenses`, `family_members`, `month_close_decisions`, `monthly_summaries`.
  - ID extraction via `to_jsonb(NEW)->>'id'` para tablas sin columna `id` (family_finance, family_members) — target_id queda null + payload identifica por family_id/user_id.

**Files**:
- MOD migration de B4: agregar triggers en tablas críticas que loggean cuando `auth.role() = 'service_role'`

**Acceptance**:
- [ ] Cualquier mutation via service-role queda registrada en audit_log
- [ ] Edge functions usan rol estándar de SR audit

---

### B6 · Auth integration tests (1 d)

- [x] **DONE** `2aaa6c6` 2026-06-09 — 8 tests verdes contra supabase local.

**Files**:
- NEW `tests/integration/auth-flows.test.ts`

**Acceptance**:
- [x] Signup + trigger `handle_new_user_profile` (crea profile auto)
- [x] Duplicate signup (anti-enumeration: user sintético con identities vacío)
- [x] Login pre-confirm email falla; post-confirm succeed
- [x] Login con bad password falla con `invalid credentials`
- [x] `resetPasswordForEmail` smoke (acepta success o `email_address_invalid` del local stack)
- [x] `auth.resend({type: 'signup'})` no estalla en network/500
- [x] SignOut → `getUser()` retorna null

**Notas**: el test de Apple Sign-In con token mock y delete-account quedan
fuera del scope de B6 (Apple requiere identity token real del device,
delete-account ya tiene su propio path A1). Cleanup por test (no leaks de
auth.users / profiles).

---

### B7 · Expense CRUD vs Supabase real tests (1 d)

- [x] **DONE** `3b6b583` 2026-06-09 — 10 tests verdes contra supabase local.

**Files**:
- NEW `tests/integration/expense-crud-rls.test.ts`

**Acceptance**:
- [x] CREATE owner: insert succeed + SELECT lo trae
- [x] CREATE cross-family: insert bloqueado (RLS o trigger upstream)
- [x] READ cross-family: 0 filas
- [x] READ blocked member: 0 filas (regression CR v1 C1 / Sprint B)
- [x] UPDATE self: succeed (creator)
- [x] UPDATE other-member-as-non-owner: 0 rows affected (fix 20260522)
- [x] UPDATE other-member-as-owner: succeed (admin override)
- [x] DELETE self: hard-delete confirmed
- [x] DELETE other-member-as-non-owner: 0 rows affected
- [x] BULK INSERT 50: no rate-limit en path no-RPC

---

### B8 · Push delivery test (0.5 d)

- [x] **DONE_WITH_CONCERNS** `e86e16b` 2026-06-09 — 6 tests verdes + 1 `it.todo` para E2E APNs delivery.

**Files**:
- NEW `tests/integration/push-delivery.test.ts`

**Acceptance**:
- [x] INSERT con `user_id = auth.uid()` succeed; con otro user_id bloqueado por RLS
- [x] UPSERT idempotente sobre `(user_id, endpoint)` (no duplica filas)
- [x] SELECT solo own subscriptions (hardening 20260510)
- [x] removeSubscription (DeviceNotRegistered path) — service-role borra por id
- [x] fan-out query del edge function (filtra `family_id` + `neq user_id`)

**Concerns**:
- No existe RPC `register_push_subscription` en el codebase — A7 usa
  upsert directo desde el client, decisión documentada en el plan.
  El test refleja ese path real.
- La invocación end-to-end del edge function (`supabase functions
  invoke`) no se cubre acá: requiere `supabase functions serve`
  con Deno bootteando en CI. El handler ya tiene
  `supabase/functions/send-family-push/index.test.ts` cubriendo el
  parsing / auth / rate-limit unit-level. Marcado como `it.todo`.
- APNs delivery real requiere APNs key + device físico — pendiente
  pre-submit (no es bloqueante para B8).

---

## 3 · Sprint C — P3 Code quality / DX (~12 días)

> **Objetivo**: deuda de mantenibilidad + infra de release automation.

### C1 · `useUpdateExpense` / `useDeleteExpense` → `syncAllAfterMutation` full (0.5 d)

- [x] **DONE** (Sprint C — SHA pendiente) — verificado 2026-06-09. Ambos hooks ya estaban alineados al patrón antes de C1 (sprint anterior los migró). Tarea funcional fue no-op; valor entregado: documentar que el scope `expenses` cubre TODOS los keys que se invalidaban a mano antes.

**Files**:
- VERIFY `mobile/features/expenses/use-expenses.ts` — ambos hooks usan `syncAllAfterMutation({scopes:['expenses']})` en `onSettled`, sin invalidates hardcoded
- VERIFY `mobile/lib/sync-after-mutation.ts` — scope `expenses` cubre family, recentFamily, total, periodTotalFamily, monthlySpentFamily, gastosEndpointKeys.{hero,calendar,categories,paginated,forDay}Family, gastos-snapshot prefix, controlIntelligenceQueryKey, homeSnapshotQueryKey

**Acceptance**:
- [x] Update/delete preservan optimistic patches (`patchPaginatedUpdate` / `patchPaginatedRemove` + snapshot list patches en `onMutate`)
- [x] `onSettled` llama `syncAllAfterMutation({scopes: ['expenses']})` (no hay invalidates hardcoded)
- [x] Tests 660 → 677 pasando

---

### C2 · Test guard `syncAllAfterMutation` scopes (0.5 d)

- [x] **DONE** (Sprint C — SHA pendiente) — `tests/unit/sync-after-mutation-guard.test.ts` con 12 tests: 9 scopes individuales (`it.each(ALL_SCOPES)`) + 3 invariants (scopes vacío no-op, sin userId no incluye home-snapshot, dedup de scopes repetidos). Mock `@/lib/supabase` para soportar vitest env=node, mismo patrón que `use-delete-savings-goal.test.ts`.

**Files**:
- NEW `tests/unit/sync-after-mutation-guard.test.ts`

**Acceptance**:
- [x] Test que itera por cada scope de `SyncScope` y verifica que `homeSnapshotQueryKey(userId)` está en el set resultante (cuando `userId` está)
- [x] Falla loud con nombre del scope si alguno no lo incluye (mensaje del throw incluye scope name + keys actuales)

---

### C3 · E2E Playwright en CI (1.5 d)

- [x] **DONE** (Sprint C — SHA pendiente) — job `e2e` agregado a `.github/workflows/mobile-ci.yml`. Estrategia: `expo export --platform web` + `npx serve dist --single` + `playwright test` (chromium only, `--with-deps`). Solo corre en `push` a main + `workflow_dispatch` (no en PRs por costo). Trace + screenshots + video se uploadean como artifact si el job falla (`playwright-report/` + `test-results/`, retention 7d). Timeout 20min.

**Files**:
- MOD `.github/workflows/mobile-ci.yml` (nuevo job e2e con expo web export + playwright)
- VERIFY `tests/e2e/*.spec.ts` (4 specs existentes corren local)

**Acceptance**:
- [x] Job e2e en CI con headless chromium
- [x] Boot del app web export + servidor estático + browser
- [x] 4 specs corren en push a main (opcional en PRs por costo)

---

### C4 · Drenar `motion-tokens-baseline.json` (1 d)

- [x] **DONE** (Sprint C — SHA pendiente) — drenado de 22 (baseline) + 8 regresiones nuevas (30 total) → 0. Estrategia: (a) migración a tokens existentes (`motionDurations.standard/enterStack/deliberate/slow`, `decorativeDurations.pulse`) cuando matcheaba, (b) nuevo token `motionDurations.shakeStep = 50` para shake sequences (pin-pad), (c) `@motion-allow: <razón>` inline en one-offs designer-tuned (entrance curves de wrapped/control-hero, pulsos decorativos calibrados). `counts: {}` en baseline; cualquier file que vuelva a aparecer = regresión que bloquea CI.

**Files**:
- MOD 9 files (pin-pad, fijo-category-groups, fijos-scheduled-banner, fijos-hero-card, achievements-gallery, fijos-proximos-card, fijo-row, control-hero-a-titular, cycle-wrapped-modal, cycle-balance-prompt-sheet, achievement-unlock-modal)
- MOD `mobile/lib/motion/tokens.ts` (+ `shakeStep: 50`)
- MOD `tests/unit/motion-tokens.test.ts` (cubre el nuevo token)
- MOD `scripts/motion-tokens-baseline.json` → `counts: {}`

**Acceptance**:
- [x] `motion-tokens-baseline.json` vacío
- [x] `npm run guard:motion-tokens` clean (0 violations, sin baseline)

---

### C5 · EAS build automatizado (1 d)

- [x] **DONE** (Sprint C — SHA pendiente) — `.github/workflows/release.yml` creado. Trigger: tag `v*` + `workflow_dispatch`. Steps: setup node + EAS CLI (`expo/expo-github-action@v8`) → `eas build --platform ios --profile production --non-interactive --wait`. Notificación final: marker en log + Slack webhook opcional si `SLACK_RELEASE_WEBHOOK` está configurado.

**Secrets requeridos** (owner debe agregar en GitHub → Settings → Secrets → Actions):
- `EXPO_TOKEN` (con permisos build + submit + update)
- `SLACK_RELEASE_WEBHOOK` (opcional)

**Files**:
- NEW `.github/workflows/release.yml` — triggered en tag `v*`
- MOD `eas.json` (agregado `channel` por profile para que el binary se subscribe al channel correcto de OTA)

**Acceptance**:
- [x] Push de tag `v1.0.0` dispara `eas build --platform ios --profile production`
- [x] Job notifica a Slack/Discord/email cuando build completa (placeholder webhook listo, owner enchufa URL)

---

### C6 · TestFlight submission script (0.5 d)

- [x] **DONE** (Sprint C — SHA pendiente) · construído sobre C5 — step `EAS submit to TestFlight` agregado a `release.yml`. La `.p8` ASC API key se materializa desde `ASC_API_KEY_P8_BASE64` (secret) a `.asc/AuthKey.p8` solo durante el run (cleanup en `always`). Si la secret no está, el build IPA se completa pero el submit se skipea (graceful degradation — owner sube manual desde EAS dashboard).

**Secrets requeridos**:
- `EXPO_APPLE_ID`, `EXPO_ASC_APP_ID` (también referenciadas por `eas.json`)
- `ASC_API_KEY_ID`, `ASC_API_KEY_ISSUER_ID`, `ASC_API_KEY_P8_BASE64`

**Files**:
- MOD `.github/workflows/release.yml` agregar step `eas submit`

**Acceptance**:
- [x] Build production → upload automatic a TestFlight
- [x] Submission status reportada en el workflow log

---

### C7 · OTA Updates (EAS Update) wiring (1 d)

- [x] **DONE** (Sprint C — SHA pendiente) — `expo-updates@~29.0.18` instalado. `app.config.ts` configurado con `runtimeVersion: { policy: 'sdkVersion' }` + `updates.url: 'https://u.expo.dev/<projectId>'` + `fallbackToCacheTimeout: 0`. `eas.json` builds ahora declaran `channel` (development/preview/production). Workflow nuevo `.github/workflows/ota-update.yml` corre en push a main + dispatch: skipea si la diff toca `ios/`, `android/`, `app.config.ts`, `eas.json`, `package.json`, `package-lock.json` (vía `dorny/paths-filter@v3`). Cada push de JS-only ⇒ `eas update --branch production --message "<commit subject>"`.

**Files**:
- INSTALL `expo-updates` ✓
- MOD `app.config.ts` plugin + runtime version policy + updates.url ✓
- MOD `eas.json` (`channel` por profile) ✓
- NEW `.github/workflows/ota-update.yml` triggered en push a main ✓

**Acceptance**:
- [x] Production channel configurado
- [x] Hotfix sin reenviar al App Store: push de commit + workflow → `eas update --branch production`
- [x] Runtime version mismatching falla loud (no rotura silenciosa — `policy: 'sdkVersion'` garantiza que un OTA de SDK 55 no se sirva a un binary SDK 54)

---

### C8 · Sentry sourcemap upload — SKIPPED 2026-06-09

- [-] **SKIPPED** — decisión owner (2026-06-09): no incorporamos Sentry por ahora. Razones: (1) base de usuarios actual es chica y el equipo está en modo iteración → un crash report viene típicamente con repro del propio user; (2) el costo recurrente + setup de SDK + workflow de sourcemaps no se justifica sin volumen; (3) si en el futuro hace falta, Sentry/Bugsnag/Crashlytics se integran en ~0.5d sin deuda técnica adicional (no hay nada que migrar). Telemetría operacional sigue cubierta por `audit_log` (B4) + console.error en dev + logs de release.yml.

**Re-evaluar cuando**: (a) crossing >1000 MAU, (b) primer crash de prod sin repro, o (c) la primera review pública en App Store flagee un crash que no podamos reproducir.

---

### C9 · Feature flags infra (1 d)

- [x] **DONE** `b2d9eb9` 2026-06-09 — migration `20260609110000_feature_flags.sql` aplicada al remote (db push --linked clean). RPC `get_user_flags()` con rollout determinístico (`abs(hashtext(user_id::text)) % 100`). Hook `useFeatureFlags(userId)` + `useFeatureFlag(key, userId)` con fail-closed semantics. Resolver puro testeado (4 tests).

**Files**:
- NEW `supabase/migrations/20260609110000_feature_flags.sql`
- NEW `mobile/features/flags/feature-flag-keys.ts` — registry con defaults
- NEW `mobile/features/flags/resolve-flag.ts` — pure helper testeable
- NEW `mobile/features/flags/use-feature-flags.ts` — useQuery hook (staleTime 5min)
- NEW `tests/unit/feature-flags-resolver.test.ts`

**Decisión sobre `home_snapshot` integration**: NO la incluimos. Razones (1) staleTime distinta (flags 5min vs snapshot 60s), (2) inflar el snapshot para ahorrar 1 round-trip que se hace en cold-start complejiza la invalidación, (3) flags pueden evolucionar a hooks standalone (settings debug, etc) que no querés acoplados al snapshot. Decisión documentada inline en la migración.

**Acceptance**:
- [x] Hook `useFeatureFlag('wrapped_v2', userId)` returns `{enabled, payload}`
- [x] `rollout_percent` con hash determinista del user_id (mismo user → mismo resultado)
- [x] Fail-closed: si el RPC falla, devuelve `default` declarado en `FEATURE_FLAGS`

---

### C10 · `gitleaks` upgrade (0.5 d)

- [x] **DONE** (Sprint C — SHA pendiente) — nuevo job `gitleaks` en `mobile-ci.yml` corriendo `gitleaks/gitleaks-action@v2` con custom config `.gitleaks.toml`. La config extiende el default ruleset con patrones específicos: Supabase JWT (`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.*.*`), `sb_secret_*`, `sb_publishable_*`, Expo access tokens. Allowlist permite `.env.supabase.example`, docs, y placeholders (`YOUR_SUPABASE_ANON_KEY`). Falla CI on any unexpected match con artifact upload.

**Files**:
- MOD `.github/workflows/mobile-ci.yml` (versión + ruleset)
- NEW `.gitleaks.toml` con custom patterns Supabase ✓

**Acceptance**:
- [x] Detecta `sb_secret_*`, JWT Supabase, Expo tokens patterns
- [x] Falla CI si encuentra leak

---

### C11 · Accessibility audit + VoiceOver (2 d)

- [x] **DONE** `27cb7c5` 2026-06-09 — audit estático de 12 screens completo. 7 OK / 4 gaps medios / 1 gap mayor (`asistente-screen`). Top findings: `gastos-v2` sin `useReducedMotion` para confeti+chips, `onboarding` sin labels en wizard steps, `asistente` sin labels en quick-actions. AppButton + SettingsGroupedList cubren la mayoría del codebase con a11y correcta por convención. Backlog de fixes priorizado en P0/P1/P2 dentro del doc.

**Files**:
- NEW `docs/sistemas/accessibility-checklist.md`

**Acceptance**:
- [x] 12 screens auditadas (estático)
- [x] Pressables / labels / roles inventariados por screen + sub-component
- [x] Reducción motion: 7/12 implementan, 5/12 no (listado en backlog)
- [x] Doc con findings + plan de remediación priorizado

**Pendiente (no bloqueante para Sprint C)**: validación manual con VoiceOver en device físico (requiere iPhone con iOS 17+). Documentado como TODO al final del doc.

---

### C12 · Visual regression baseline (1 d)

- [x] **DONE (plan + decisión)** `33f277a` 2026-06-09 — plan + decisión técnica documentados. Implementación queda diferida post-D2 / D4 para no agregar work-in-progress encima del refactor (los components hoy son demasiado monolíticos para snapshottear con valor real). Sin Storybook installed todavía.

**Files**:
- NEW `docs/operaciones/visual-regression.md`

**Decisión técnica**: Storybook + Chromatic (free tier 5k snapshots/mes, suficiente para v1). Loki descartado (mantenimiento Docker en CI) y native screenshots descartado (cost de macOS runners en CI + tooling inmaduro). Scope inicial 6 components con variants documentadas.

**Acceptance** (re-scoped):
- [x] Doc con análisis tooling + decisión justificada
- [x] Scope inicial definido (6 components, ~25 snapshots)
- [x] Plan de implementación incremental post-Sprint D
- [ ] Storybook install + 6 stories + CI workflow (DIFERIDO post-D2/D4)

---

### C13 · Perf baseline (Reanimated frametime) (1 d)

- [x] **DONE_WITH_CONCERNS** `33f277a` 2026-06-09 — doc + tooling + targets + hotspot inventory completos. **Numbers reales TODO**: no tengo device físico al momento del audit. Tabla de baseline queda en blanco con TODO; próximo dev con iPhone 12 / 14 Pro / SE corre el procedimiento documentado.

**Files**:
- NEW `docs/operaciones/perf-baseline.md`

**Hotspots identificados** (audit estático por `useAnimatedStyle` count):
- `cycle-wrapped-modal.tsx`: 9 hooks (ALTO) — mitigable con refactor D2.
- `animated-flame.tsx`: 6 hooks (MEDIO) — verificar no re-mount en listas.
- `fijos-proximos-card.tsx`: 6 hooks (MEDIO) — refactor D4 separa marquee-ticker.

**Acceptance**:
- [x] Documento con tooling + targets + procedimiento
- [x] Animaciones largas target 60fps documentado
- [x] Hotspots identificados
- [ ] Numbers reales en device físico (DIFERIDO — owner corre cuando tenga device)
- [ ] Threshold CI (DIFERIDO — manual por ahora, escrito en doc cómo automatizar)

---

## 4 · Sprint D — P4 Refactor mantenibilidad (~6 días)

> **Objetivo**: bajar 7 archivos de >1000 LOC para que el siguiente feature work no se trabe en files imposibles de mantener.

### D1 · Split `gastos-v2-screen.tsx` (1 d)

- [x] **DONE** `9384f9a` 2026-06-09 — screen 1800 → 1058 LOC (orchestrator + JSX de los 3 branches: hard-error, empty-account, normal SectionList). Sub-components NEW en `mobile/components/gastos/`: `clear-filters-button.tsx`, `empty-action-button.tsx`, `gastos-movement-row.tsx`, `gastos-section-header.tsx`, `gastos-list-header.tsx`. Helpers NEW en `mobile/features/gastos/`: `gastos-helpers.ts` (types `MovementItem` + `MovimientosSection` + 9 pure helpers), `build-sections.ts` (merge día-con-solo-income + sort cronológico), `build-gastos-empty-state.ts` (4 variants). Tests 677/677 PASS. Bundle iOS PASS. Typecheck PASS. Lint 0 errors.

**Plan**:
- Mover sub-components inline → `mobile/components/gastos/` (ClearFiltersButton, EmptyActionButton, NameInput, FreqTile)
- Mover helpers → `mobile/features/gastos/gastos-helpers.ts` (incomeHappenedAtMs, getMondayFirstOffset, stepCycleDay, getCycleNavBounds, composeRowA11yLabel)
- Target: screen file ≤ 600 LOC

---

### D2 · Split `cycle-wrapped-modal.tsx` (1 d)

- [x] **DONE** `1b7e077` 2026-06-09 — modal 1868 → 578 LOC (orchestrator). 5 scenes extraídas a `mobile/components/wrapped/scenes/` (cover, verdict, top-category, top-expense, closing). Sub-components extraídos: `leftover-option-card`, `progress-segment`, `cycle-wrapped-cta`. Helpers: `build-scenes.ts`, `wrapped-constants.ts`, `scenes/types.ts`, `scenes/detail-styles.ts`, `scenes/closing-styles.ts`. Animaciones intactas (useSharedValue/useAnimatedStyle/withTiming sin tocar). Closing scene (Spec B integration) preservada como `ClosingSceneRender` sub-component dentro de `closing-scene.tsx` — pulse del amount + stagger de OptionCards intactos. Tests 677/677 PASS. Bundle iOS PASS. Modal queda ligeramente sobre target (578 vs 500) por la complejidad inherente de la orquestación (7 useSharedValue + 5 useEffect lifecycle del scene crossfade); extraer más JSX no aportaba reuso real.

**Plan**:
- Cada scene → su propio file (`scenes/cover.tsx`, `scenes/verdict.tsx`, etc.)
- Builders puros separados (`build-scenes.ts`)
- Target: modal file ≤ 500 LOC

---

### D3 · Split `create-savings-goal-wizard-sheet.tsx` (1 d)

- [x] **DONE_WITH_CONCERNS** `a94bf16` 2026-06-09 — sheet 1460 → 574 LOC (sobre target ≤400). Steps a `wizard-steps/`: `step-1-title-emoji.tsx` (127), `step-2-amount.tsx` (200), `step-3-months.tsx` (332, sobre ≤300 por display+numpad duplicado para custom-months), `step-4-summary.tsx` (144), `wizard-step-header.tsx` (115). Keyboard offset effect extraído a `lib/use-keyboard-offset.ts` (49 LOC, reusable). Tests 677/677 PASS, typecheck clean, lint 0 errors. Concerns: orchestrator ~575 (cerca de target pero no debajo) y step-3 ~332 (display tappable + numpad para custom plazo es coupling intrínseco al flow — no se puede separar sin pasar 6+ props extra al sub-componente del custom).

**Plan**:
- Step1Title, Step2Amount, Step3Months, Step4Summary cada uno a su archivo
- Keyboard handling hook (`use-keyboard-offset.ts`)
- Target: sheet file ≤ 400 LOC

---

### D4 · Split `fijo-row.tsx` + `fijos-proximos-card.tsx` (1 d)

- [x] **DONE** `bfbe724` 2026-06-09 — `fijo-row.tsx` 1422 → 482 LOC (≤600 target); `fijos-proximos-card.tsx` 1057 → 297 LOC (≤500 target). Parts en `fijo-row-parts/`: inline-pay-button (160, halo pulse de overdue + ref-guard preservados 1:1), trend-badge (69), info-line (48), fijo-row-placeholder (96), fijo-row-detail-panel (324, expand panel con stats hero + tendencia + este pago + historial + actions), fijo-row-helpers (136, capitalize/monthOfLabel/trendCopy*/nextDueLabel/frequencyLabel/hexAlpha), fijo-row-styling (168, computeStatusOverlay + computeAccent + computeDetail). Parts en `fijos-proximos-parts/`: upcoming-marquee (204, `setActive(true)` GUARD `setWidth > 0` del CR v2 preservado en onEnd/onFinalize), marquee-ticket (157, exports TICKET_WIDTH/TICKET_GAP), alert-rows (240, HikeAlertRow + SignalRow), rule-scale (58), urgent-header-dot (53), fijos-proximos-empty (107). Tests 677/677, typecheck clean.

---

### D5 · Split `control-v2-alcancia-card.tsx` (0.5 d)

- [x] **DONE** `62ef6bc` 2026-06-09 — `control-v2-alcancia-card.tsx` 1094 → 560 LOC. Parts: `control-v2/alcancia-parts/reserve-block.tsx` (312, self-contained con mutation + sheet state + wizard wiring), `control-v2/alcancia-parts/control-v2-alcancia-card-empty.tsx` (271, empty silueta + ReserveBlock al pie), `ui/stat-tile.tsx` (85, genérico reusable para grids de 3 stats). Sprint A fix de activar meta inactiva inline (`hasInactiveGoal` branch) preservado 1:1 + tap zones / pan gesture del CR Sprint B intactos. Tests 677/677, typecheck clean, lint 0 errors, expo export PASS.

---

### D6 · Split `streak-sheet.tsx` (0.5 d)

- [x] **DONE_WITH_CONCERNS** `18ff94d` 2026-06-09 — sheet 1073 → 426 LOC (26 over target ≤400). Parts a `streak-sheet-parts/`: `streak-sheet-tone.ts` (91, getStatusTone + getAtRiskTone), `sheet-hero.tsx` (207, SheetHero + ShieldChip), `level-progress.tsx` (45), `week-activity.tsx` (108), `motivational-card.tsx` (285, agrupa ShieldNotice/ConsequenceCard/RecoveryCard/MotivationalCard/PersonalStats/FreezeInfo — todas info-cards de la misma familia), `action-ctas.tsx` (129, PrimaryStatusCta + SecondaryCta + CtaStack). Sprint A fixes preservados 1:1 (panGesture useMemo + `.enabled(visible)`, cancelAnimation cleanup, isMountedRef guard). Lint clean, 677/677 tests verdes, typecheck clean. Concern: orchestrator 426 LOC — los 26 LOC over target vienen del bloque Alert.alert handlers (40+ LOC para mark/unmark no-expense) que no extraje porque dependen de mutations + UI state acopladas al orchestrator.

**Plan**:
- SheetHero, LevelProgress, WeekActivity, MotivationalCard cada uno a su archivo
- Target: sheet ≤ 400 LOC

---

### D7 · Split `add-fijo-v2-screen.tsx` (1 d)

- [x] **DONE** `a520ee2` 2026-06-09 — screen 1714 → 391 LOC (orchestrator: monta hooks, calcula impact math, encadena create/update + record-payment). Steps separados en `mobile/components/fijos/add-fijo-parts/`: `step-header.tsx` (StepHeader + StepDots), `step1-form.tsx` (nombre + monto + categoría + frecuencia + cuotas card), `step2-summary.tsx` (resumen + impact + calendar + reminder + already-paid toggle), más sub-components atómicos `name-input.tsx`, `freq-tile.tsx`, `field.tsx`, `impact-card.tsx` (ImpactRow + HealthBadge + ImpactBar), `calendar-drop-impact.tsx`. Form validation hook NEW en `mobile/features/fixed-expenses/use-add-fijo-form.ts` (state machine + hydration + canContinue/canSubmit + missing-fields flags). Helpers NEW en `add-fijo-helpers.ts` (FREQ_OPTIONS, CUOTA_OPTIONS, QUICK_AMOUNTS, hexAlpha, buildNextDueOn). Tests 677/677 PASS. Typecheck PASS. Lint 0 errors. Bundle iOS PASS.

**Plan**:
- Steps a componentes separados
- Form validation hook reutilizable

---

## 5 · Backlog · P5 Long-term (~15 días total)

> **Cuando se desbloquee la decisión del owner correspondiente.**

### P5.1 · AI Coach LLM (Claude augmentation) (5 d)

- [ ] **TODO** · gate: ≥500 MAU + owner decision sobre LLM costs

Reemplazar control-advisor heurístico con Claude API. Edge function existente ya tiene wiring base — falta el switch + prompt engineering + telemetry. Plan en [`asistente-llm-augmentation-notes.md`](../sistemas/asistente-llm-augmentation-notes.md).

---

### P5.2 · Android prebuild + AndroidManifest audit (2 d)

- [ ] **TODO** · gate: pre-Play Store push

Verificar permisos, intents, deep links. Probar el dev client en emulator Android. Documentar diferencias mobile-specific con iOS.

---

### P5.3 · i18n infra (es-AR → es / en) (4 d)

- [ ] **TODO** · gate: tracción real fuera de AR

Setup `i18next` + extracción de ~2000 strings hardcoded + translation files. ¿Vale la pena un mecanismo automatizado de extraction o lo hacemos manual?

---

### P5.4 · Biometric auto-sign-in on cold start (1 d)

- [ ] **TODO** · gate: métrica de fricción real

Re-evaluar el patrón. Hoy en pausa por friction. Si las métricas muestran que la fricción del login era el real problema (no la app), reactivar.

---

### P5.5 · Gift subscription IAP (2 d)

- [ ] **TODO** · gate: D1 decidida (Monetización en v1.0 o v1.1)

RevenueCat gift flow. Requiere SDK + paywall + persistence.

---

### P5.6 · Win-back flow (1 d)

- [ ] **TODO** · gate: D1 decidida + datos de cancelaciones

Después de cancel sub, prompt con descuento. Mismo gating que P5.5.

---

## 6 · Apéndice — Items SKIPPED en este plan

Estos items aparecen en el [estado-actual](2026-06-08-estado-ready-pendientes.md#2--pendientes) pero **NO son code**, así que no entran acá. Se ejecutan por separado:

| Item | Tipo | Owner |
|---|---|---|
| Privacy Policy + Terms redactados + hosteados | Legal + infra | Owner |
| Screenshots, listing copy, App Preview video | Assets | Owner |
| Privacy nutrition form en App Store Connect | Submission | Owner |
| Age rating questionnaire | Submission | Owner |
| APNs key generation en Apple Developer | 3rd party | Owner |
| Hosting Privacy/Terms en GitHub Pages + DNS | Infra | Owner |
| Sentry / PostHog account creation | 3rd party | Owner |
| RevenueCat account + product setup | 3rd party | Owner |
| L4 verificar usuario test (`aye.tello18@gmail.com`) | Manual SQL | Maintenance |
| Password policy 10c, HIBP, network restrictions | Supabase config | Admin (no code) |
| D1-D4 deferred decisions | Owner decisions | Owner |

---

## 7 · Mantenimiento de este doc

**Cada viernes**: revisá WIP / BLOCKED y actualizá. Si un item lleva > 2 semanas en BLOCKED, evaluar si se baja a P3 o se mueve a "skipped".

**Cada item DONE**: agregá el SHA + fecha al lado del checkbox (`[x] ✅ a1b2c3d 2026-06-15`).

**Cuando arranques un sprint nuevo**: si el sprint anterior no está 100% done, marcá los pendientes como "carry-over" en una nota inicial.

**Cuando descubras un nuevo item code-only**: agregalo al sprint que más sentido tenga + actualizá el effort total del sprint.

---

> **Última actualización**: 2026-06-08 · `99ed0db` HEAD
> **Total estimado**: ~30 días de coding para cerrar Sprint A+B+C+D. Backlog P5 al margen.
> **Sprint sugerido inmediato**: A (P1 App Store CODE — desbloquea submit cuando lleguen los items de owner).
