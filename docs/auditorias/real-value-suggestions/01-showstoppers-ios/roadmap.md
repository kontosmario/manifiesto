# 01 · Showstoppers iOS — Roadmap de implementación

> Orden recomendado: del más bloqueante al menos. Esfuerzo en días-persona (1 dev senior). Marcá cada item ✅ con commit hash al cerrarlo.

---

## 🏁 Sprint 1 — Fundacionales legales y de cuenta (5-7 días)

### TASK 1.1 · Delete Account flow

**Status:** 🔴 TO DO · **Owner:** _backend + mobile_ · **Effort:** 2 días

**Pasos:**
1. **DB migration** — crear columna `profiles.deletion_requested_at TIMESTAMPTZ`
2. **RPC** `request_account_deletion()`:
   - Valida: si user es owner de familia con miembros activos, retorna error y exige transfer
   - Marca `deletion_requested_at = now()`
   - Encola job edge function
3. **Edge function** `process-account-deletion`:
   - Cancela suscripción activa (cuando IAP esté live)
   - Borra rows: `expenses`, `fixed_expenses`, `categories`, `notifications`, `push_subscriptions`, `family_members`
   - Si era único miembro de familia, borra `families` + `family_finance` + `savings_goals`
   - Auth: `supabase.auth.admin.deleteUser(userId)`
   - Log a `audit_log` (cuando exista — ver `../05-quality-readiness/`)
4. **UI** — `mobile/screens/settings/settings-screen.tsx`:
   - Fila destructiva "Eliminar cuenta" bajo Account
   - Sheet 2-step: explicar consecuencias + checkbox "Entiendo que es permanente"
   - Si es owner con miembros: bloquear, mostrar CTA "Transferir hogar"
5. **QA matrix**: solo, owner, miembro, owner-único, con/sin suscripción activa

**DoD:** flow completo de delete → re-signup con mismo email funciona limpio.

---

### TASK 1.2 · Apple Sign-In en Login

**Status:** 🔴 TO DO · **Owner:** _mobile_ · **Effort:** 4 horas

**Pasos:**
1. Import `signInWithApple` desde `mobile/features/auth/social-sign-in.ts:24-88` en `login-screen.tsx`
2. Botón posicionado **encima** de "Usar contraseña" (no como secundario)
3. Mostrar sólo si `isAppleSignInAvailable() === true` (devices iOS sin Apple ID configurado no lo verán)
4. Manejar reauth: si Supabase devuelve usuario que originalmente se signupeó con Google, hacer identity link (no crear cuenta nueva)
5. Haptic + smooth transition al success

**DoD:** signup con Google + login con Apple devuelve el mismo `user.id`.

---

### TASK 1.3 · Privacy Policy + Terms hosteados + linkeados

**Status:** 🔴 TO DO · **Owner:** _legal + frontend_ · **Effort:** 1 día (legal) + 2h (cableado)

**Pasos:**
1. **Redactar Privacy Policy** (puede usar generador como [iubenda](https://www.iubenda.com/) o template Anthropic-aprobado adaptado al stack: Supabase, Expo Push, Anthropic API para control-advisor):
   - Datos recopilados: email, display name, gastos, finanzas familiares, push tokens
   - Third parties: Supabase (EU/US), Expo Push, Apple, Google (si usás Google Sign-In), Anthropic (control-advisor)
   - Retention: hasta delete account + 30 días
   - GDPR/CCPA rights: access, delete, port
   - Contact: soporte@manifiesto.app
2. **Redactar Terms of Service**:
   - Cuentas, edad mínima (13/16 según mercado)
   - IAP: renovación automática, cómo cancelar, refunds (Apple/Google policy)
   - Prohibited uses
   - Limitation of liability
   - Jurisdicción (Argentina probablemente — confirmar con tu abogado)
3. **Hostear**:
   - Opción A: páginas estáticas en Vercel/Netlify/GitHub Pages bajo `manifiesto.app/privacy` y `/terms`
   - Opción B: bucket S3/Supabase Storage público
4. **Cablear in-app**:
   - `welcome-screen.tsx:119-123` → `Pressable` con `Linking.openURL('https://manifiesto.app/privacy')`
   - `signup-screen.tsx:456-458` → idem
   - Settings → nueva subsección "Legal" con ambos links
5. **App Store Connect**: cargar URL de Privacy Policy en el listing

💰 **BUDGET:**
- Asesoría legal: $200-1000 USD una vez (Latam) — recomendado para Terms
- Hosting: $0 (Vercel free / GitHub Pages)
- Generador automatizado (iubenda Privacy Policy Pro): $27/año

**DoD:** desde welcome, signup y settings podés tocar los links y se abre la versión web.

---

## 🏁 Sprint 2 — Activation + Observability (5 días)

### TASK 1.4 · Password reset flow

**Effort:** 1 día

**Pasos:**
1. UI: link "Olvidé contraseña" en `login-screen.tsx`
2. Bottom sheet `forgot-password-sheet.tsx` con email + CTA
3. Llama `supabase.auth.resetPasswordForEmail(email, { redirectTo: 'manifiesto://auth/reset' })`
4. Nueva route `app/(auth)/reset.tsx` que valida token + permite nueva password
5. Verificar template `supabase/templates/recovery.html` se ve OK en mail
6. En Supabase Dashboard → Auth → Email Templates → asegurar `recovery` está configurado en proyecto remoto

**DoD:** reset funciona end-to-end con email de Inbucket en local y email real en staging.

---

### TASK 1.5 · Onboarding permission priming

**Effort:** 1 día

**Pasos:**
1. En `onboarding-screen.tsx` añadir 2 micro-steps opcionales:
   - Después de avatar (step 2): "¿Habilitar Face ID?" → `expo-local-authentication`
   - Después de ingreso (step 4): "¿Avisarte si te pasás del cupo?" → `expo-notifications.requestPermissionsAsync()`
2. Diseño: cada step es opcional, "Tal vez después" claramente visible
3. Persistir decisión en `profiles.onboarding_choices jsonb`
4. Si user dijo NO al onboarding, no volver a preguntar hasta que el feature lo requiera

**DoD:** opt-in rate de push > 50% (medible una vez analytics esté live).

---

### TASK 1.6 · Sentry crash reporting

**Effort:** 4 horas · 💰 BUDGET

**Pasos:**
1. `npx expo install @sentry/react-native sentry-expo`
2. `app.config.ts` → agregar plugin `sentry-expo`
3. `app/_layout.tsx` → `Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1 })`
4. EAS Build hook para subir sourcemaps automáticamente
5. Test: forzar un crash en `__DEV__` → ver event en Sentry dashboard
6. Linkear `user.id` post-login para correlacionar crashes con usuarios

**DoD:** crash de prueba aparece en Sentry con stack trace symbolicated.

---

### TASK 1.7 · PostHog analytics

**Effort:** 1 día · 💰 BUDGET (free tier)

**Pasos:**
1. `npm install posthog-react-native`
2. Init en `app/_layout.tsx` con `EXPO_PUBLIC_POSTHOG_KEY`
3. Wrap `mobile/features/telemetry/event-queue.ts` para que **además** de enviar a Supabase, mande a PostHog
4. Eventos clave a trackear: `signup_completed`, `family_created`, `first_expense_added`, `paywall_viewed`, `purchase_initiated`, `purchase_completed`, `app_opened`
5. Identify post-login con `user.id` + `family.id` como group
6. Funnels en PostHog dashboard: Onboarding → Activation → Paywall

**DoD:** podés ver funnel de signup → primera familia → primer gasto en PostHog.

---

## 🏁 Sprint 3 — Hygiene + UX edges (3 días)

### TASK 1.8 · Eliminar `subscriptions-zombie`

**Effort:** 30 min

```bash
git rm -r mobile/features/subscriptions-zombie/
npm run typecheck && npm run lint
```

Si typecheck rompe → eliminar imports rotos. Probablemente nada importa de ahí en el código activo.

---

### TASK 1.10 · Version/About info

**Effort:** 1 hora

```tsx
// mobile/screens/settings/settings-screen.tsx (footer)
import Constants from 'expo-constants'
const version = Constants.expoConfig?.version ?? '?'
const build = Constants.nativeBuildVersion ?? '?'
<Text>Manifiesto {version} ({build})</Text>
```

---

### TASK 1.11 · Contact / Support

**Effort:** 1 hora · 💰 BUDGET email transactional

Fila en Settings:
```tsx
Linking.openURL(`mailto:soporte@manifiesto.app?subject=Soporte Manifiesto&body=
---
User ID: ${userId}
Family ID: ${familyId}
Version: ${version}
Device: ${Device.modelName}
OS: ${Device.osVersion}
---
Cuéntanos qué pasó:
`)
```

💰 Si querés tracking + auto-response: Postmark ó Resend ~$15/mes.

---

### TASK 1.12 · Email confirmation resend

**Effort:** 4 horas

- Nuevo sheet `confirm-email-sheet.tsx` post-signup
- Email masked: `m***@gmail.com`
- Botón "Reenviar" con cooldown 60s (estado local)
- Botón "Cambiar email" → re-edita signup
- Link "Abrir Mail" → `Linking.openURL('message://')` (iOS Mail) ó `Gmail://`

---

### TASK 1.13 · Auth callback timeout

**Effort:** 2 horas

En `auth-callback-screen.tsx`:
```tsx
const timeoutRef = useRef<NodeJS.Timeout>()
useEffect(() => {
  timeoutRef.current = setTimeout(() => setTimedOut(true), 30000)
  return () => clearTimeout(timeoutRef.current)
}, [])

if (timedOut) return <ErrorState
  title="Está tardando más de lo normal"
  primaryAction={{ label: 'Reintentar', onPress: retry }}
  secondaryAction={{ label: 'Volver a login', onPress: () => router.replace('/login') }}
/>
```

---

### TASK 1.14 · Manage Subscription en Settings global

**Effort:** 30 min

Mover/duplicar el deep link `billing-screen.tsx:715-719` a una fila visible en Settings raíz, gated por `activePlanId != null`.

---

### TASK 1.17 · Delete account copy

**Effort:** 2 horas (parte del 1.1)

Incluido en TASK 1.1 — asegurar copy GDPR/CCPA compliant.

---

### TASK 1.18 · First-launch privacy disclosure

**Effort:** 2 horas

En welcome screen, debajo del tagline:
```tsx
<Text style={styles.privacyLine}>
  Recopilamos mínima información: tu email + lo que registres.{' '}
  <Pressable onPress={openPrivacy}>
    <Text style={styles.link}>Leer privacidad</Text>
  </Pressable>
</Text>
```

---

## 🏁 Sprint 4 — App Store submit (paralelizable con 03)

### TASK 1.9 · App Store assets

Ver `../04-aso/roadmap.md` para detalle. Resumen:
- Screenshots 6.7" (10 max) + 6.5" (10 max)
- App Preview video 15-30s
- App Icon ya está ✅
- Listing copy (name, subtitle, description, keywords) — ver 04-aso

💰 **BUDGET**: $200-500 si tercerizás screenshots/video; $0 + tu tiempo en Figma.

---

## 📅 Cronograma propuesto (2-3 semanas)

| Semana | Items |
|--------|-------|
| **W1** | 1.1 Delete Account · 1.2 Apple Sign-In login · 1.3 Privacy/Terms |
| **W2** | 1.4 Password reset · 1.5 Permission priming · 1.6 Sentry · 1.7 PostHog · 1.8 Zombie cleanup |
| **W3** | 1.10-1.14 + 1.17-1.18 UX edges · 1.9 ASO assets (paralelo) · Submit a TestFlight Internal |
| **W4** | TestFlight External Testing + iteración · App Review submission |

---

## ⚠️ Riesgos

- **Privacy Policy legal**: si no tenés abogado, usar generador y revisar. No copies a otro app sin ajustar (data flows son distintos).
- **App Review randomness**: a veces piden modificaciones post-submit. Tener Sentry + analytics ya wirados ayuda a justificar comportamientos sospechosos.
- **Apple Sign-In conflict**: si Supabase RLS asume email único, un user que se signupeó con email/password y ahora intenta Apple Sign-In con mismo email puede crear conflicto. Probar en staging primero.

---

**Próximo doc:** `budget.md` con desglose 💰 de la sección.
