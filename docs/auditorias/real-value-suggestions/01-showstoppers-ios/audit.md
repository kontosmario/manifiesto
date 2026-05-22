# 01 · Showstoppers iOS — Audit detallado

> Hallazgos contrastados contra el código real. Cada item incluye **file paths + line numbers** donde aplica y referencia a la Apple Guideline correspondiente.

---

## ⚠️ Correcciones al audit original (verificación 2026-05-11)

Revisada cada claim contra el código actual. Errores encontrados:

- **1.8 `subscriptions-zombie` NO es código zombie.** Es el módulo activo que implementa el detector de suscripciones zombi (consumido por `mobile/components/control-v2/zombie-feed-section.tsx` y 5+ componentes en `mobile/components/subscriptions-zombie/`). El naming es engañoso pero la feature está viva. **Acción: cancelado, NO borrar.** Si Apple Review observa el folder name, renombrarlo (`subscription-audit/` por ejemplo) en lugar de eliminarlo.

Todo el resto del audit en este archivo fue confirmado contra código real en la verificación inicial.

---

## 1.1 — Delete Account flow ausente

**Severidad:** ⛔ BLOCKER · **Guideline:** [App Store Review 5.1.1(v)](https://developer.apple.com/app-store/review/guidelines/#5.1.1)

**Hallazgo:**
Settings ofrece sólo `Logout` (línea 1018 de `mobile/screens/settings/settings-screen.tsx`). No existe ningún flujo para que el usuario elimine su cuenta y datos asociados.

**Evidencia:**
- `mobile/screens/settings/settings-screen.tsx:1011-1022` — sección "Account" sólo tiene logout
- `app/(app)/household-setup.tsx` — permite destruir familia pero NO la cuenta del usuario
- No existe RPC `delete_user_account()` en `sql/supabase.sql`
- No existe edge function para coordinar el borrado

**Impacto:**
Apple rechaza automáticamente apps con creación de cuenta que no ofrecen un mecanismo claro de eliminación (mismo nivel de prominencia que el signup).

**Fix esperado:**
1. Nueva fila destructiva "Eliminar cuenta" debajo de Logout
2. Sheet de confirmación de 2 pasos con consecuencias claras (familia, gastos, suscripción)
3. Si es owner de familia con miembros: forzar Transfer Ownership primero
4. RPC `request_account_deletion()` que marque `profiles.deletion_requested_at` + tira cleanup async
5. Edge function `process-account-deletion` que borre datos, cancele subs y revoque sesiones

---

## 1.2 — Apple Sign-In missing en LOGIN (presente sólo en SIGNUP)

**Severidad:** ⛔ BLOCKER · **Guideline:** [4.8 Login Services](https://developer.apple.com/app-store/review/guidelines/#sign-in-with-apple)

**Hallazgo:**
- `signup-screen.tsx:421-451` ofrece Apple + Google sign-in (correcto, parity)
- `login-screen.tsx` (mismo módulo) ofrece **sólo password + biometric**, NO ofrece Apple Sign-In

**Por qué es blocker:**
Guideline 4.8 exige que si ofrecés un proveedor social como Google/Facebook, debés ofrecer Apple Sign-In con **paridad de prominencia** en TODAS las pantallas que ofrecen login social. La paridad aplica también al re-login.

**Evidencia:**
```
mobile/features/auth/social-sign-in.ts:24-88 — exporta isAppleSignInAvailable() + signInWithApple()
  ✅ usado en signup
  ❌ NO importado en login-screen.tsx
```

**Fix esperado:**
Añadir botón Apple Sign-In en login screen, posicionado por encima de "Usar contraseña". Debe manejar reauth (usuario que se signupeó con Google ahora intenta Apple — Supabase lo trata como nuevo identity link).

---

## 1.3 — Privacy Policy + Terms no clickeables ni hosteadas

**Severidad:** ⛔ BLOCKER · **Guideline:** [5.1.1(i)](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage)

**Hallazgo:**
- `welcome-screen.tsx:119-123` — render de `<Text style={styles.fineprintLink}>` para "Términos" y "Privacidad" pero **sin onPress handler**
- `signup-screen.tsx:456-458` — mismo problema
- No existe URL configurada para Privacy Policy ni Terms
- No existe documento legal redactado en el repo

**Impacto triple:**
1. App Store exige URL de Privacy Policy en App Store Connect (campo obligatorio antes de submit)
2. Si la app recopila datos (lo hace: email, gastos, familia), exige privacy policy accesible
3. Links visibles pero no funcionales son flagged como deceptive UX en App Review

**Fix esperado:**
1. Redactar Privacy Policy (cubrir: data collected, retention, third parties, user rights GDPR/CCPA, contact)
2. Redactar Terms of Service (cubrir: cuentas, IAP, terminación, jurisdicción)
3. Hostear ambos en URL estable (ej. `manifiesto.app/privacy`, `manifiesto.app/terms`)
4. Cablear `Linking.openURL()` en `welcome-screen.tsx:119` y `signup-screen.tsx:456`
5. Sumar fila "Privacy Policy" + "Terms of Service" en Settings → Account

---

## 1.4 — Password reset ausente

**Severidad:** ⛔ BLOCKER (UX standard) · **Guideline:** UX expectation

**Hallazgo:**
`login-screen.tsx` no expone link "Olvidé contraseña". Supabase ya tiene template `supabase/templates/recovery.html` configurado pero la UI no lo dispara.

**Fix esperado:**
1. Link "Olvidé contraseña" debajo del input de password
2. Bottom sheet que pide email y llama `supabase.auth.resetPasswordForEmail(email, { redirectTo: 'manifiesto://auth/reset' })`
3. Nueva route `app/(auth)/reset-password.tsx` que procesa el token y permite setear nueva password
4. Copy claro: "Te mandamos un email. Revisá spam también."

---

## 1.5 — Onboarding sin permission priming

**Severidad:** ⛔ BLOCKER (Apple Review pattern) · **Guideline:** UX best practice

**Hallazgo:**
`mobile/screens/home/onboarding-screen.tsx` tiene wizard de 5 pasos (nombre, avatar, familia, ingreso, ahorro) pero ningún step pide permisos. Permisos se piden lazy (cuando el feature los necesita), lo cual:
- Reduce drásticamente la tasa de opt-in (push, biometric)
- En App Review puede flagearse como permission request sin contexto

**Fix esperado:**
Añadir 2 steps opcionales al onboarding:
- Post-avatar: "¿Habilitar Face ID para acceso rápido?" → priming + native prompt
- Pre-finish: "¿Querés que te avise antes de que se vaya el día?" → push permission

Si el user dice NO, no insistir hasta que el feature lo requiera explícitamente.

---

## 1.6 — Sin crash reporting

**Severidad:** ⛔ BLOCKER (Operational) · **Guideline:** Best practice

**Hallazgo:**
Telemetría 100% home-grown (`mobile/features/telemetry/event-queue.ts`) que envía eventos a Supabase RPC. **No captura JS crashes ni native crashes**.

**Evidencia:**
- No hay import de `@sentry/react-native` en `package.json`
- No hay `Sentry.init()` en `app/_layout.tsx`
- No hay error boundary global

**Riesgo post-launch:**
Lanzás a producción ciego. Un crash al abrir la app y no te enterás hasta que un usuario te escriba.

**Fix esperado:**
Sentry React Native + sourcemaps automáticos en EAS Build. Tier free cubre primer mes; luego $26/mes.

💰 **BUDGET:** Sentry Teams plan ~$26/mes ó SDK Free hasta 5K eventos/mes.

---

## 1.7 — Sin analytics de usuario

**Severidad:** ⛔ BLOCKER (Business) · **Guideline:** Best practice

**Hallazgo:**
Eventos home-grown se persisten en tabla `home_telemetry` pero **no hay forma de medir**:
- Funnel de activación (signup → primera familia → primer gasto)
- Retención D1/D7/D30
- Churn de paywall
- Comportamiento por cohort

**Fix esperado:**
PostHog (open source friendly) ó Amplitude (más maduro). Mi recomendación: **PostHog Cloud free tier (1M eventos/mes free)**.

💰 **BUDGET:** PostHog free hasta 1M eventos/mes; Amplitude Starter free hasta 10M MTU.

---

## 1.8 — ~~Folder `subscriptions-zombie` en build~~ ⚠️ AUDIT ERROR

**Status:** ⚠️ NO APLICA — claim original del audit incorrecto.

**Verificación 2026-05-11:** el folder `mobile/features/subscriptions-zombie/` NO es código legacy. Es la implementación activa del detector de suscripciones zombi (gastos fijos no usados). Está siendo consumido en producción por:
- `mobile/components/control-v2/zombie-feed-section.tsx`
- `mobile/components/subscriptions-zombie/` (5 componentes)
- `mobile/features/insights/fixed-expense-value-capture.ts`
- `mobile/features/fijos/fijos-aggregates.model.ts`
- `mobile/features/fixed-expenses/use-fixed-expenses.ts`

El módulo no expone IAP — su nombre proviene del concepto producto ("suscripciones zombi" = gastos fijos olvidados), no de StoreKit. Apple Review no tiene visibilidad sobre nombres de folders internos.

**Acción:** ninguna. Si querés evitar confusión interna a futuro, considerar rename a `subscription-audit/`, pero NO es un blocker de App Review.

---

## 1.9 — App Store assets no preparados

**Severidad:** ⛔ BLOCKER (Submit requirement)

**Hallazgo:**
- No hay screenshots 6.7" ni 6.5" en `assets/`
- No hay App Preview video (15-30s)
- No hay icon variants verificados (light/dark/tinted ya están en `assets/brand/` ✅)
- App Store Connect listing copy no redactado

**Detalle:** ver `../04-aso/audit.md`.

💰 **BUDGET:** Diseño de screenshots y video — ~$200-500 si tercerizás (Fiverr/Upwork) o tu propio tiempo + Figma.

---

## 1.10 — Sin Version/About info en Settings

**Severidad:** 🟡 IMPORTANTE (App Review hygiene)

**Hallazgo:**
Settings no muestra versión ni build. `package.json` dice `1.0.0` pero el usuario no lo ve. Apple Review pide poder identificar la build exacta que están revisando.

**Fix esperado:**
Footer en Settings: `Manifiesto 1.0.0 (build 42)` con `expo-constants.expoConfig.version` + `nativeApplicationVersion`.

---

## 1.11 — Sin Contact/Support link

**Severidad:** 🟡 IMPORTANTE · **Guideline:** 1.5 (Developer Information)

**Hallazgo:**
No hay forma in-app de contactar soporte. Apple exige al menos un canal accesible.

**Fix esperado:**
Settings → "Contactar soporte" que abre `mailto:soporte@manifiesto.app?subject=...&body=[user_id]`. Pre-poblá user_id + version + device para triage rápido.

💰 **BUDGET:** Email transaccional/inbox — Mailtrap o Postmark $10-25/mes si querés tracking.

---

## 1.12 — Email confirmation sin resend ni timer

**Severidad:** 🟡 IMPORTANTE (Activation killer)

**Hallazgo:**
Si Supabase requiere confirmación de email, `signup-screen.tsx:369` muestra mensaje "Revisá tu email..." pero:
- Sin botón resend
- Sin countdown ("podés pedir un nuevo email en 60s")
- Sin link a chequear spam
- Sin opción de cambiar el email

**Impacto:** alto bounce rate en signup.

**Fix esperado:**
Sheet dedicado post-signup con:
- "Te mandamos un email a `m***@gmail.com`" (masked)
- Botón "Reenviar email" (gated 60s)
- Botón "Cambiar email" → reseteo a signup
- Link "Abrir Gmail" / "Abrir Mail" (deep link)

---

## 1.13 — Auth callback puede colgarse infinitamente

**Severidad:** 🟡 IMPORTANTE

**Hallazgo:**
`auth-callback-screen.tsx:58` muestra "Confirmando acceso..." sin timeout. Si el callback nunca completa, el usuario está atrapado.

**Fix esperado:**
Timeout de 30s → mostrar "Está tardando más de lo normal" + retry + fallback "Volver a login".

---

## 1.14 — Manage Subscription deep link sólo accesible desde Billing screen

**Severidad:** 🟡 IMPORTANTE (cuando IAP esté live) · **Guideline:** 3.1.2

**Hallazgo:**
`billing-screen.tsx:715-719` tiene deep link a App Store sub management. Pero si user nunca abre Billing screen, no lo encuentra. Apple exige acceso prominente.

**Fix esperado:**
Fila adicional "Administrar suscripción" en Settings raíz, visible a usuarios con `activePlanId != null`.

---

## 1.15 — `dev-health` correctamente gated ✅

**Status:** ✅ DONE — `app/(app)/settings/dev-health.tsx:5` redirige si `!__DEV__`. No action needed.

---

## 1.17 — Data deletion confirmation copy

**Severidad:** 🟡 IMPORTANTE (GDPR/CCPA)

**Hallazgo:**
Cuando se construya Delete Account (item 1.1), el copy debe explicar:
- Qué se borra (cuenta, gastos, familia si es owner, suscripción)
- Qué retiene (datos legalmente requeridos: receipts de pago x 7 años)
- Tiempo de procesamiento (típicamente 30 días)
- Cómo cancelar la solicitud

---

## 1.18 — First-launch privacy disclosure

**Severidad:** 🟡 IMPORTANTE (App Review pattern)

**Hallazgo:**
Welcome screen no menciona qué datos se recopilan. App Review prefiere "we collect minimal data: email + family members + expenses you log. Read more →".

**Fix:** sumar 1 línea en welcome con link a Privacy Policy.

---

## 📋 Apple Review Pre-flight Checklist (compilado de hallazgos)

| ✅/❌ | Item | Notas |
|------|------|-------|
| ❌ | Delete Account flow | 1.1 |
| ❌ | Apple Sign-In en TODAS las pantallas con social login | 1.2 |
| ❌ | Privacy Policy URL en App Store Connect + accesible in-app | 1.3 |
| ❌ | Terms of Service URL accesible | 1.3 |
| ❌ | Password reset funcional | 1.4 |
| ❌ | Permission priming en onboarding | 1.5 |
| ❌ | Crash reporting | 1.6 |
| ⚠️ | ~~Eliminar código legacy `subscriptions-zombie`~~ | 1.8 — claim del audit incorrecto, módulo es feature activa |
| ❌ | Screenshots 6.7" + 6.5" | 1.9 |
| ❌ | App Preview video | 1.9 |
| ❌ | Version + build info visible | 1.10 |
| ❌ | Soporte/contacto in-app | 1.11 |
| ❌ | Email confirmation con resend | 1.12 |
| ❌ | Auth callback timeout | 1.13 |
| ✅ | `dev-health` gated a __DEV__ | 1.15 |
| ❌ | First-launch privacy disclosure | 1.18 |
| ❌ | Push Notification primer con copy claro | 1.5 |
| ✅ | Bundle ID + EAS project ID | ya configurados |
| ✅ | App Icon (light/dark/tinted) | en `assets/brand/` |
| ❓ | App Privacy nutrition label (App Store Connect) | configurar al crear listing |

---

## 🔬 Métricas de éxito post-fix

- 0 rechazos en primera submit a App Review
- Activation funnel: signup → primer gasto sin caída > 40%
- Crash-free sessions > 99.5% (Sentry)
- Tiempo signup→primer-gasto medio < 5 min

**Próximo doc:** `roadmap.md` con pasos concretos sprint-by-sprint.
