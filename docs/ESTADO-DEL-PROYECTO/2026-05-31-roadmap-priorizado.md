# Roadmap priorizado · 2026-05-31

> **Origen:** auditoría exhaustiva de toda la documentación del repo (82 docs en
> `docs/`) + cross-check contra `git log` para descartar lo ya hecho.
> **Trigger:** owner confirmó **Apple Developer Program pago** → se desbloquea
> todo el bloque iOS/store que estuvo deferred desde 2026-05-11.
>
> **Fecha de corte:** 2026-05-31.
> **Estado del producto:** feature-complete desde 2026-05-09. El backlog que
> queda es **operacional + compliance + Apple-Dev-gated**, no más features
> core.
>
> **Cómo leer este doc:**
> - Las prioridades **P0…P7** son secuenciales por dependencia y urgencia:
>   P0 = bloqueante para submit, P1 = hardening pre-prod, etc.
> - Cada item lleva **effort estimado**, **dependencias** y un **link al
>   doc fuente** para no perder contexto.
> - Lo que está en ⏸️ DEFERRED es decisión consciente del owner; lo dejo
>   listado para que la decisión sea reabrible, no oculta.

---

## 0 · TL;DR ejecutivo

**Camino crítico a App Store:** ~3 a 4 semanas de trabajo concentrado sobre
P0 + parte de P1. El producto está listo funcionalmente; lo que falta es la
capa de **compliance legal + UX flows obligatorios + assets de tienda + un
puñado de toggles backend**.

| Prioridad | Bloque | Effort total | Bloquea submit? |
|-----------|--------|--------------|-----------------|
| **P0** | Compliance + assets App Store + push iOS | 3-4 sem | **Sí** |
| **P1** | Hardening backend pre-prod | 1-2 sem | Recomendado |
| **P2** | DevEx + CI + EAS automation | 1 sem | No, acelera iteración |
| **P3** | Quality / testing pre-launch | 8-10 d | No, baja riesgo de regresión |
| **P4** | Observability (Sentry + PostHog) | 1 sem | No, decisión owner |
| **P5** | Monetización (RevenueCat + paywalls) | 6-8 d | No, decisión owner |
| **P6** | Features iOS desbloqueadas (Widget, Live Activity, AASA) | 2-3 sem | No |
| **P7** | Backlog largo (AI coach, OCR, i18n, etc.) | varios | No |

**Lo mínimo absoluto para llegar a "Submit for Review":** P0 completo. El
resto se puede ir layerizando en updates post-launch.

---

## 1 · Lo que NO está en este roadmap (ya hecho)

Para no contaminar el plan: estos 10 frentes documentados como pendientes
en algún lado del repo **ya están mergeados a `main`** y verificados contra
git log al 2026-05-31:

- ✅ **Conversión cuenta** familia ↔ soltero (commits `991a11e`, `133a705`,
  `065106a`, `f926d7e`, `255bd2f`)
- ✅ **Modo soltero v1** (commits `51eb06c`, `5d472fb`, `9ab898f`)
- ✅ **PIN Lock 4 dígitos** (merge `0e1e340 feat/pin-lock`)
- ✅ **Pre-onboarding biometric setup** (merge `6d965dc`)
- ✅ **Tour-seen backend sync** (merge `9c72235`)
- ✅ **State sync coherence** (merge `d7269d6`)
- ✅ **Dark mode cluster Ajustes** (merge `e3679d4`)
- ✅ **New user initial state v1** (merge `587da7b` + onboarding-success)
- ✅ **Empty states ghost** gastos + fijos + control
- ✅ **Fijos overhaul completo** (4 migraciones prod + UX 13 iteraciones,
  últimos 2 días)

→ Si algún doc de `docs/superpowers/specs/` o `docs/auditorias/` los lista
como "pendientes", está desactualizado. Foto canónica del estado actual:
[ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/](2026-05-21-estado-actual/).

---

## 2 · P0 — Bloqueante App Store (3-4 semanas)

> Sin esto, **no se puede mandar a review**. Todo lo de abajo o lo exige
> Apple Review o es UX mínima esperada de un producto en App Store.

Fuente principal:
[auditorias/real-value-suggestions/01-showstoppers-ios/](../auditorias/real-value-suggestions/01-showstoppers-ios/).

### P0.A · Cuenta y flujos de auth obligatorios

| # | Item | Effort | Apple Dev req | Notas |
|---|------|--------|---------------|-------|
| P0.1 | **Delete Account UI end-to-end** | 2 d | No | Backend (RPCs `schedule_account_deletion`, cron) **ya está aplicado a prod**. Falta solo: Settings sheet de confirmación en 2 pasos, copy GDPR/CCPA (qué se borra / qué retiene / 30 d para cancelar). |
| P0.2 | **Apple Sign-In en Login** | 4 h | **Sí** | Signup ya lo tiene. Falta: botón en `login-screen`, identity link Supabase, handler de reauth. |
| P0.3 | **Password reset funcional** | 1 d | No | Link "¿Olvidaste tu contraseña?" en login, bottom sheet de email input, route `reset-password.tsx` con deep link, RPC `resetPasswordForEmail`. |
| P0.4 | **Email confirmation resend + cooldown** | 4 h | No | Post-signup sheet con resend gated a 60 s, opción "Cambiar email", deep links Open Mail / Open Gmail. |
| P0.5 | **Auth callback timeout (30 s)** | 2 h | No | Post-redirect, si Supabase no responde en 30 s mostrar "Tardando más de lo normal" + retry. |
| P0.6 | **Permission priming en onboarding** | 1 d | No | 2 micro-pasos: Face ID (post-avatar) y push (pre-finish). Ambos con "Tal vez después". Doc: [push-notifications-ios-setup.md](../operaciones/push-notifications-ios-setup.md). |

### P0.B · Legal hosting + privacy

| # | Item | Effort | Apple Dev req | Notas |
|---|------|--------|---------------|-------|
| P0.7 | **Privacy Policy + Terms redactados** | 1-2 sem (legal) / 1 d (template) | No | Owner action. Si se usa template: privacypolicies.com o termsfeed.com. Si se contrata: ~USD 200-1000. |
| P0.8 | **Hosting Privacy/Terms** | 5 min | No | GitHub Pages enable + DNS. URLs `https://manifiesto.app/privacy` y `/terms`. |
| P0.9 | **Wiring in-app de Privacy/Terms** | 2 h | No | Links en welcome, signup (footer), Settings → Legal. URL también va a App Store Connect. |
| P0.10 | **First-launch privacy disclosure** | 2 h | No | Welcome screen: 1 línea + link Privacy ("Al continuar aceptás nuestra Política de Privacidad"). |

### P0.C · UX mínima esperada en Settings

| # | Item | Effort | Apple Dev req | Notas |
|---|------|--------|---------------|-------|
| P0.11 | **Version / About info** | 1 h | No | Footer Settings: `Manifiesto 1.0.0 (build 42)` vía `expo-constants`. Tap → modal About con créditos. |
| P0.12 | **Contact / Support link** | 1 h | No | Settings → "Contactar soporte" → mailto `soporte@manifiesto.app` preformateado con `user_id + version + device + OS`. Owner action: crear inbox. |

### P0.D · Push iOS (production wiring)

Doc fuente: [operaciones/push-notifications-ios-setup.md](../operaciones/push-notifications-ios-setup.md).

| # | Item | Effort | Apple Dev req | Notas |
|---|------|--------|---------------|-------|
| P0.13 | **APNs key + entitlements iOS** | 1 d | **Sí** | Subir APNs Auth Key a Expo. `expo prebuild` + `entitlements.plist` con `aps-environment`. EAS build. Test delivery con `expo send`. |
| P0.14 | **Push permission priming dialog** | (incluido en P0.6) | No | El priming nativo se dispara desde el screen de P0.6. |
| P0.15 | **Backend → APNs token registration** | 4 h | **Sí** | El backend ya genera mensajes (Android web push funciona). Wirear endpoint para token iOS en `register_push_token` RPC. |

### P0.E · App Store assets + listing copy

Fuente: [auditorias/real-value-suggestions/04-aso/](../auditorias/real-value-suggestions/04-aso/).

| # | Item | Effort | Apple Dev req | Notas |
|---|------|--------|---------------|-------|
| P0.16 | **Screenshots 6.7" (10 imágenes)** | 2-3 d self / USD 200-500 contratado | **Sí** | 1290×2796. Frames: Home cuaderno, Daily Budget, Add gasto, Fijos hero, Asistente, Control insights, Wrapped, Settings, Onboarding step, Achievement unlock. |
| P0.17 | **Screenshots 6.5" (10, opcional)** | 1-2 d | **Sí** | Soporta más devices. Skippable v1.0. |
| P0.18 | **App Preview video (15-30 s MP4)** | 1-2 d self / USD 100-300 contratado | **Sí** | Pitch: registrar gasto → ver cuánto queda hoy → cierre con Wrapped. |
| P0.19 | **Listing copy completo** | 2 h | No | App Name 30c, Subtitle 30c, Keywords 100c, Promo 170c, Description 4000c. Drafts ya escritos en `04-aso/audit.md`, falta review + tweak final. |
| P0.20 | **Privacy Nutrition Label** | 2 h | **Sí** | Cuestionario en App Store Connect: data linked to user (email, financial data), data not collected (location, contacts, etc). Hay que enumerar tipos. |
| P0.21 | **Age Rating Questionnaire** | 1 h | **Sí** | Sin contenido sensible → Rating 4+. |
| P0.22 | **Support URL + Marketing URL** | (incluido P0.7-9) | No | Mismo dominio del Privacy. |

**Subtotal P0:** ~17-22 días dev + 1-2 sem legal en paralelo + owner actions
(comprar inbox, GitHub Pages, screenshots).

---

## 3 · P1 — Hardening backend pre-prod (1-2 semanas)

> No bloquean submit pero **deberían estar antes de exposición pública**.
> Fuente: [operaciones/pendientes-seguridad.md](../operaciones/pendientes-seguridad.md),
> [auditorias/real-value-suggestions/05-quality-readiness/](../auditorias/real-value-suggestions/05-quality-readiness/).

### P1.A · Toggles Supabase (1 hora total, son dashboards)

| # | Item | Effort | Notas |
|---|------|--------|-------|
| P1.1 | **Password policy:** 10 chars + complejidad | 30 s | Dashboard → Auth → Password Policy. |
| P1.2 | **HIBP (Have I Been Pwned) protection** | 10 s | Toggle on. |
| P1.3 | **Network restrictions Postgres** | 1 toggle | Solo IPs Supabase / edge + Vercel. |
| P1.4 | **Realtime private channels** | verificación 1 m | Confirmar policy `authenticated only`. |

### P1.B · Cambios de código

| # | Item | Effort | Notas |
|---|------|--------|-------|
| P1.5 | **Captcha (Cloudflare Turnstile) en auth** | 15 m setup + 4 h wiring + build | Endpoints `/signup`, `/login`. Free tier alcanza. |
| P1.6 | **Re-auth para operaciones destructivas** | 1 d | `delete_account`, `destroy_family`, `transfer_ownership`. Re-pedir password o biometric. |
| P1.7 | **Rate limiting en RPCs sensibles** | 1 d | Hoy solo push tiene. Agregar a `bootstrap_family`, `join_family`, `create_expense`. Usar `pg_throttle` o tabla `rate_limit_buckets`. |
| P1.8 | **Service role audit** | 4 h | Validar que solo edge functions usen service_role. Grep + lockdown. |

### P1.C · Schema missing (post pre-prod)

| # | Item | Effort | Notas |
|---|------|--------|-------|
| P1.9 | **`audit_log` table** | 1 d | GDPR + fraud detection. Schema: `(id, user_id, family_id, action, target_id, payload jsonb, created_at, ip)`. |
| P1.10 | **`invitations` table** | 4 h | Track códigos de familia (quién invitó, expiración, used_at). Hoy va por `family_codes` informal. |
| P1.11 | **`devices` / `user_sessions` table** | 1 d | Revocation per-device, multi-device login visibility en Settings. |

**Subtotal P1:** 6-8 días.

---

## 4 · P2 — DevEx + CI + EAS automation (1 semana)

Fuente: [07-backend-servicios-db.md:650-652](2026-05-21-estado-actual/07-backend-servicios-db.md#L650-L652).

| # | Item | Effort | Notas |
|---|------|--------|-------|
| P2.1 | **Vitest + Playwright en CI pipeline** | 1 d | Hoy CI solo corre lint + typecheck. Tests existen (283 passing) pero no se ejecutan. Workflow GitHub Actions. |
| P2.2 | **EAS Build automatizado en CI** | 1 d | `eas build --platform ios --profile production` on tag push. |
| P2.3 | **TestFlight submission automatizado** | 4 h | `eas submit -p ios` post-build. Requiere App Store Connect API key. |
| P2.4 | **OTA Updates (EAS Update) configurado** | 4 h | `eas update --channel production` para hotfixes JS sin re-submit. |
| P2.5 | **Sentry sourcemap upload en CI** | 2 h | Post P4.1. Hook en EAS build. |
| P2.6 | **Feature flags infra** | 1 d | Hoy hay flags hardcoded en `lib/feature-flags.ts`. Migrar a tabla `feature_flags` + RPC + cache cliente. Pattern básico. |
| P2.7 | **Pre-commit scanner gitleaks upgrade** | 30 m | Doc: [pendientes-seguridad.md:129](../operaciones/pendientes-seguridad.md#L129). |
| P2.8 | **Cleanup `legacy-web-src/`** | 30 m | Cosmético. Doc: [pendientes-seguridad.md:208](../operaciones/pendientes-seguridad.md#L208). |
| P2.9 | **Cleanup dead code `components/home/control-*`** | 30 m | Doc: [03-home-control-fijos.md:692](2026-05-21-estado-actual/03-home-control-fijos.md#L692). |

**Subtotal P2:** 4-5 días.

---

## 5 · P3 — Quality / testing pre-launch (8-10 días)

Fuente: [auditorias/real-value-suggestions/05-quality-readiness/](../auditorias/real-value-suggestions/05-quality-readiness/).

| # | Item | Effort | Criticidad |
|---|------|--------|------------|
| P3.1 | **Auth integration tests** (login, session refresh, biometric, social, PIN) | 2 d | Alto |
| P3.2 | **Expense CRUD tests contra Supabase** | 1 d | Alto |
| P3.3 | **Fixed expense lifecycle tests** (create → pay → revert → cycle close) | 2 d | Alto |
| P3.4 | **Push delivery tests** (cron → APNs/FCM → expo receive) | 1 d | Medio |
| P3.5 | **Accessibility VoiceOver flows** | 2 d | Alto (compliance) |
| P3.6 | **Visual regression** (snapshot UI principales) | 1 d | Medio |
| P3.7 | **Performance baseline** (cold start, scroll FPS, snapshot RPC latency) | 1 d | Alto |

**Subtotal P3:** 8-10 días. Se puede paralelizar con P0/P1.

---

## 6 · P4 — Observability post-launch (1 semana)

> **Owner decision 2026-05-11:** deferred para post-v1. Reabrir ahora que
> hay Apple Dev y se acerca el launch.

| # | Item | Effort | Costo | Notas |
|---|------|--------|-------|-------|
| P4.1 | **Sentry crash reporting** | 4 h | USD 26/mes (5K events free) | `@sentry/react-native` + EAS hook + sourcemap upload (ver P2.5). |
| P4.2 | **PostHog analytics externo** | 1 d | USD 0-200/mes (1M events free) | Reemplaza `home_telemetry` interno por algo escalable. |
| P4.3 | **Typed event taxonomy** | 1 d | — | Antes de wiring P4.2 definir 20-30 events canónicos: `expense_created`, `fijo_paid`, `wrapped_completed`, etc. |
| P4.4 | **Backend RPC latency tracking** | 4 h | — | Wrapper de Supabase client que reporta `p50/p95` a PostHog. |
| P4.5 | **Custom dashboards** (MRR, churn, activation, retention) | 1 d | — | Solo si P5 (monetización) está on. |

**Subtotal P4:** 4-5 días. Decisión owner si va antes o después de submit.

---

## 7 · P5 — Monetización (6-8 días, decisión owner)

> Apple Dev pago = **se desbloquea IAP**. Pero la decisión de cobrar es del
> owner. Si la respuesta es "sí v1.0", esto bloquea el submit (paywalls
> tienen que estar wireados antes). Si es "sí v1.1", se hace post-launch.
> Fuente: [auditorias/real-value-suggestions/03-monetization/](../auditorias/real-value-suggestions/03-monetization/).

### P5.A · Schema (1 d)

| # | Item | Effort | Notas |
|---|------|--------|-------|
| P5.1 | **`subscriptions` table** | 4 h | `(family_id, status, trial_start, trial_end, current_period_start, current_period_end, autorenew, plan_id, ...)`. |
| P5.2 | **`billing_receipts` table** | 4 h | `(id, family_id, event_type, raw_payload jsonb, amount, currency, created_at)`. RLS: solo service_role inserts. |
| P5.3 | **RLS + indices** | 2 h | Members read own family. Indices en `(family_id, status, current_period_ends_at)`. |

### P5.B · RevenueCat wiring (2-3 d)

| # | Item | Effort | Notas |
|---|------|--------|-------|
| P5.4 | **`react-native-purchases` install + config** | 4 h | iOS + Android. Product IDs en App Store Connect. |
| P5.5 | **`initBilling(userId)` en `app/_layout.tsx`** | 2 h | Post-login. |
| P5.6 | **`useBilling()` reemplaza mock actual** | 4 h | `mobile/features/billing/use-billing.ts` hoy retorna `{ isPro: true }` siempre. |
| P5.7 | **Edge function `billing-webhook/`** | 1 d | Webhook RevenueCat → upsert `subscriptions` + insert `billing_receipts`. |

### P5.C · Paywall triggers + gates (3-4 d)

| # | Item | Effort | Notas |
|---|------|--------|-------|
| P5.8 | **`useFeatureGate(feature)` helper** | 4 h | Features: `ai_coach`, `ocr`, `export`, `widgets`, `history_full`, `unlimited_fixed`. |
| P5.9 | **Soft paywall sheets en 6 momentos** | 2 d | 6º fijo creado, 3+ meses history, control insights, coach query 6+, OCR tap, export. |
| P5.10 | **Hard limits FREE tier** | 1 d | 5 fijos máx, 3 meses history, 5 coach queries/mes. |
| P5.11 | **`is_pro()` SQL function + gating backend** | 4 h | RLS / RPC checks. |
| P5.12 | **Trial countdown banner** | 4 h | Home sticky: "Trial Pro · Quedan X días". |

**Subtotal P5:** 6-8 días.

---

## 8 · P6 — Features iOS desbloqueadas por Apple Dev (2-3 sem)

> Cosas que sí o sí necesitan certificados de Apple Developer. Cada una es
> un mini-proyecto. Lista en orden de **ROI percibido**.

| # | Feature | Effort | Notas |
|---|---------|--------|-------|
| P6.1 | **Universal Links + AASA** | 1 d | Dominio + `apple-app-site-association` en GitHub Pages. Habilita: invitar familia con link, deep links a fijos / gastos / wrapped, share. Doc: [pendientes-seguridad.md:179](../operaciones/pendientes-seguridad.md#L179). |
| P6.2 | **iOS Widget Home** (Daily Budget) | 4-5 d | WidgetKit. Muestra "te quedan $X hoy" y "próximo fijo en N días". Aliveness real. |
| P6.3 | **Live Activity** (procesando pago / pre-cobro) | 3-4 d | ActivityKit. Banner Dynamic Island cuando se procesa un pago de fijo. |
| P6.4 | **Siri Shortcuts** (registrar gasto por voz) | 2-3 d | "Hey Siri, gasté 2000 en supermercado". App Intents. |
| P6.5 | **Apple Watch app** | 1-2 sem | Glance de "te quedan $X hoy" + registrar gasto rápido. Mayor lift. |
| P6.6 | **NativeTabs (iOS Liquid Glass)** | 2-3 d | Doc: [01-arquitectura-stack-navegacion-estado.md:566](2026-05-21-estado-actual/01-arquitectura-stack-navegacion-estado.md#L566). Tabs nativas iOS 18+. |

**Subtotal P6:** ~3 semanas si se hacen todos. Recomendado: P6.1 + P6.2
para v1.1 (post-launch corto), resto v1.2+.

---

## 9 · P7 — Backlog largo (no urgente)

> Lo que está documentado pero no es prioritario. Mantengo el listado para
> que la decisión de reabrir sea consciente, no por olvido.

| # | Feature | Estado actual | Notas |
|---|---------|---------------|-------|
| P7.1 | **AI Coach LLM (Claude augmentation)** | 100% heurístico hoy (`control-signals.ts`, 2171 líneas) | Doc: [sistemas/asistente-llm-augmentation-notes.md](../sistemas/asistente-llm-augmentation-notes.md). Activar cuando ≥ 500 MAU y haya Bucket B presupuestal. |
| P7.2 | **OCR ticket con Gemini 2.5 Flash** | Queued en `02-engagement-gaps/` | Add expense by photo. Effort: 2-3 d. ROI condicional a uso real. |
| P7.3 | **i18n (EN / PT / MX / ES neutro)** | No urgente | Hoy 100% es-AR. Re-evaluar si hay tracción fuera de AR. |
| P7.4 | **Biometric auto-sign-in en mount** | En pausa | Doc: [02-auth-onboarding.md:621](2026-05-21-estado-actual/02-auth-onboarding.md#L621). Decisión cuando se mida fricción cold-start. |
| P7.5 | **Verificar usuario test `aye.tello18@gmail.com`** | Pendiente | Doc: [pendientes-seguridad.md:109](../operaciones/pendientes-seguridad.md#L109). 1 minuto, query manual. |
| P7.6 | **Android prebuild + AndroidManifest audit** | Pre-Play Store | Doc: [pendientes-seguridad.md:196](../operaciones/pendientes-seguridad.md#L196). Cuando se decida ir a Play Store. |
| P7.7 | **Gift subscription IAP** | Bucket B monetización | Post P5. |
| P7.8 | **Win-back flow + trial expiry cron** | Bucket B monetización | Post P5. |
| P7.9 | **Affiliate / B2B2C (Naranja, Brubank, asesores)** | Bucket B largo | Explorar después de 1K MAU pagos. |

---

## 10 · Owner action items (no-code)

Cosas que requieren **acción del owner** y bloquean items de P0:

| # | Item | Bloquea | Effort owner | Costo |
|---|------|---------|--------------|-------|
| OWN.1 | **Apple Developer Program** | P0 entero | ✅ HECHO | USD 99/año |
| OWN.2 | **Redacción Privacy Policy + Terms** (o contratación) | P0.7 | 1-2 sem self / contratar | USD 200-1000 |
| OWN.3 | **GitHub Pages enable + DNS para `manifiesto.app`** | P0.8, P6.1 | 5 min | USD 0 |
| OWN.4 | **Inbox `soporte@manifiesto.app`** | P0.12 | 3 min | USD 0-25/mes |
| OWN.5 | **Screenshots design** (self o contratado) | P0.16-18 | 2-3 d self / contratar | USD 200-500 |
| OWN.6 | **App Preview video** (self o contratado) | P0.18 | 1-2 d self / contratar | USD 100-300 |
| OWN.7 | **Decisión: ¿Monetización en v1.0 o v1.1?** | P5 | conversación | — |
| OWN.8 | **Decisión: ¿Sentry + PostHog antes o después de submit?** | P4 | conversación | — |

---

## 11 · Sprint plan recomendado (4 semanas a Submit)

> Asume 1 dev (Claude + owner) + paralelización legal + assets contratados.

### Semana 1 · Compliance core
- **L-Mi:** P0.1 (Delete Account UI), P0.2 (Apple Sign-In login), P0.3
  (Password reset).
- **J-V:** P0.4 (Email confirm resend), P0.5 (Auth timeout), P0.10
  (First-launch privacy disclosure).
- **Paralelo owner:** OWN.2 (legal start), OWN.3 (DNS), OWN.4 (inbox).

### Semana 2 · UX flows + push iOS
- **L-Ma:** P0.6 (Permission priming), P0.11 (Version/About), P0.12 (Support).
- **Mi-V:** P0.13-15 (push iOS production wiring + EAS build test).
- **Paralelo:** P1.1-4 (toggles Supabase, 1 h total), P1.5 (Captcha).

### Semana 3 · Store assets + hardening
- **L-Mi:** P0.7-9 (Privacy/Terms wiring, asume legal entrega Sem 2).
- **J-V:** P1.6 (re-auth destructive), P1.7 (rate limiting RPCs).
- **Paralelo:** OWN.5 + OWN.6 (screenshots + video, contratado o self).

### Semana 4 · Listing + TestFlight interno
- **L-Ma:** P0.16-19 (screenshots upload + listing copy final).
- **Mi:** P0.20 (Privacy nutrition), P0.21 (age rating).
- **J:** P2.2-3 (EAS build + TestFlight submit auto). Build TestFlight
  interno.
- **V:** QA compliance checklist + bug bash. Submit to Apple Review.

### Semana 5+ · Review + polish
- Esperar review Apple (~24-72 h).
- Mientras tanto: P3 (testing), P4 (observability) según decisión owner.

---

## 12 · Checklist Pre-Submit (printable)

```
COMPLIANCE
  [ ] Delete Account flow funcional end-to-end
  [ ] Apple Sign-In en login + signup
  [ ] Privacy Policy URL accesible + in-app
  [ ] Terms of Service URL accesible + in-app
  [ ] Password reset funcional
  [ ] Permission priming Face ID + push
  [ ] Email confirmation resend + cooldown
  [ ] Auth callback timeout 30 s
  [ ] First-launch privacy disclosure

UX MÍNIMA
  [ ] Version + build info visible
  [ ] Contact/Support link funcional
  [ ] Manage Subscription (si IAP) o N/A

PUSH iOS
  [ ] APNs key subida a Expo
  [ ] Entitlements iOS configurados
  [ ] Token registration backend → APNs OK
  [ ] Test delivery production OK

APP STORE LISTING
  [ ] 10 screenshots 6.7" subidos
  [ ] App Preview video subido
  [ ] Listing copy (name, subtitle, keywords, promo, description)
  [ ] Privacy Nutrition Label completado
  [ ] Age Rating completado
  [ ] Support URL + Marketing URL

BUILD
  [ ] EAS build production OK
  [ ] TestFlight interno funcional
  [ ] dev-health gated a __DEV__
  [ ] Bundle ID + EAS project ID OK
  [ ] App Icon (light/dark/tinted)

HARDENING (recomendado)
  [ ] Password policy 10c + complejidad
  [ ] HIBP toggle on
  [ ] Captcha en auth
  [ ] Re-auth destructive ops
  [ ] Rate limiting RPCs sensibles
```

---

## 13 · Mantenimiento de este doc

Este doc es **fecha-stamped (2026-05-31)** y refleja el estado a esa fecha.
Cuando se completen items:

1. Mover los completados a una sección "Hecho post-2026-05-31" al final,
   con commit hash + fecha.
2. Si surgen pendientes nuevos, agregar al bloque correspondiente con
   fecha de descubrimiento.
3. Cada 2-3 semanas regenerar la **TL;DR** y el **sprint plan** según
   progreso real.

Cuando este doc se vuelva obsoleto, reemplazarlo con
`docs/ESTADO-DEL-PROYECTO/<YYYY-MM-DD>-roadmap-priorizado.md` y marcar éste
como histórico en el header.
