# 03 · Monetization — Roadmap

> Secuencia técnica para ir de **0 a IAP activo** sin sorpresas. Orden crítico: si saltás un paso, la activación falla en sandbox o app review.

---

## 🏁 Sprint A · Foundations backend (4-5 días)

### TASK 3.1 + 3.2 · Schema migrations

**Effort:** 4 horas · **Status:** 🔴 TO DO

```bash
npm run supabase -- migration new 'subscriptions_and_receipts'
```

Contenido del migration file → schema definido en `audit.md` § 3.1.

Después:
```bash
npm run supabase:remote:db:push
# regenerar tipos:
npm run supabase -- gen types typescript --project-id $REF > mobile/lib/database.types.ts
```

**DoD:** las dos tablas existen en producción con RLS habilitado.

---

### TASK 3.3 · RevenueCat account + product setup

**Effort:** 1 día completo (incluye burocracia App Store Connect) · 💰 cuenta RC gratis

**Pasos:**

1. **App Store Connect** (necesita Apple Developer Program activo):
   - Crear app "Manifiesto" si no existe
   - Bundle ID = `com.manifiesto.mobile` (ya en `app.config.ts`)
   - Crear **Auto-Renewable Subscription Group** "Hogar Pro"
   - Crear 2 productos:
     - `com.manifiesto.app.subscription.monthly` — $4.99 USD — 1 mes, free trial 14 días
     - `com.manifiesto.app.subscription.yearly` — $39.99 USD — 1 año, free trial 14 días
   - Configurar pricing por territorio (importante para Argentina ARS pricing localizado)
   - Llenar campos de marketing: display name, description (corto + largo), screenshots por nivel de plan

2. **App Store Connect → Apps → Manifiesto → App Information**:
   - Generar **App-Specific Shared Secret** (en "App Information" → "App-Specific Shared Secret"). Guardarlo.

3. **RevenueCat**:
   - Crear cuenta + Project "Manifiesto"
   - App "iOS" — bundle id `com.manifiesto.mobile`
   - Cargar App-Specific Shared Secret
   - Cargar In-App Purchase Key (se genera en App Store Connect Users → Keys → In-App Purchase)
   - Crear **Entitlement** `pro_access`
   - Crear **Offering** `default` con 2 packages:
     - `$rc_monthly` → `com.manifiesto.app.subscription.monthly`
     - `$rc_annual` → `com.manifiesto.app.subscription.yearly`
   - Asociar ambos productos al Entitlement `pro_access`
   - Anotar **Public SDK Key (iOS)** → `.env`

4. **TestFlight Sandbox testers**:
   - App Store Connect → Users → Sandbox Testers → crear 2-3 emails
   - En device iOS: Settings → App Store → Sandbox Account → login con sandbox tester

**DoD:** dashboard de RevenueCat muestra "Manifiesto iOS" con 2 products y 1 entitlement activos.

💰 BUDGET: $0 hasta $2.5K MTR. Apple Developer Program $99/año (probablemente ya pagado).

---

### TASK 3.4 + 3.5 · Wire SDK + replace mock

**Effort:** 2 días · **Status:** 🔴 TO DO

```bash
npm install react-native-purchases
```

Para Expo:
```bash
npx expo install react-native-purchases
```

Update `app.config.ts` si es necesario (RevenueCat es nativa, requiere prebuild si no usás Expo Go).

**1. Init:**
```ts
// mobile/lib/billing-init.ts
import Purchases, { LOG_LEVEL } from 'react-native-purchases'
import Constants from 'expo-constants'

export function configureBilling() {
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN)
  Purchases.configure({
    apiKey: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS!,
  })
}

export function identifyUser(userId: string) {
  Purchases.logIn(userId)
}

export function clearBillingIdentity() {
  Purchases.logOut()
}
```

Llamar `configureBilling()` en `app/_layout.tsx` y `identifyUser` post-login (en auth listener).

**2. Reemplazar `use-billing.ts`:** ver código en `audit.md` § 3.5.

**3. Update `billing-screen.tsx`:**
- `purchase(plan)` ahora llama `Purchases.purchasePackage`
- `startFreeTrial()` ahora es lo mismo (RevenueCat detecta automáticamente trial eligibility)
- Handler restore real

**4. Sandbox testing:**
- Build dev → Settings → cambiar Sandbox Account a tester
- Open billing screen → tap "Empezar" → confirma compra sandbox
- Verificar `customerInfo.entitlements.active['pro_access']` retorna objeto válido

**DoD:** compra real en sandbox actualiza el estado de la app + appears en RevenueCat dashboard.

---

### TASK 3.6 · Webhook receiver

**Effort:** 1 día · **Status:** 🔴 TO DO

**1. Edge function:**
```bash
npx supabase functions new billing-webhook
```

```ts
// supabase/functions/billing-webhook/index.ts
import { createClient } from '@supabase/supabase-js'

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  const expectedKey = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')
  if (authHeader !== `Bearer ${expectedKey}`) return new Response('Unauthorized', { status: 401 })

  const event = await req.json()
  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const userId = event.event.app_user_id
  const { data: family } = await supa.from('family_members').select('family_id').eq('user_id', userId).single()
  if (!family) return new Response('Family not found', { status: 404 })

  // Upsert subscription
  await supa.from('subscriptions').upsert({
    family_id: family.family_id,
    user_id: userId,
    product_id: event.event.product_id,
    plan_id: deriveplanId(event.event.product_id),
    status: deriveStatus(event.event.type),
    source: event.event.store === 'APP_STORE' ? 'app_store' : 'play_store',
    store_subscription_id: event.event.original_transaction_id,
    trial_starts_at: event.event.type === 'TRIAL_STARTED' ? new Date(event.event.event_timestamp_ms) : null,
    current_period_starts_at: new Date(event.event.purchased_at_ms),
    current_period_ends_at: new Date(event.event.expiration_at_ms),
    cancelled_at: event.event.type === 'CANCELLATION' ? new Date(event.event.event_timestamp_ms) : null,
    auto_renew: !event.event.is_subscription_paused,
  }, { onConflict: 'store_subscription_id' })

  // Log receipt
  await supa.from('billing_receipts').insert({
    family_id: family.family_id,
    user_id: userId,
    event_type: event.event.type,
    raw_payload: event,
    amount_usd: event.event.price_in_purchased_currency,
    currency: event.event.currency,
  })

  return new Response('OK', { status: 200 })
})
```

**2. Deploy:**
```bash
npm run supabase:remote:functions:deploy
# (modificar package.json para deploy billing-webhook si está hardcoded a send-family-push)
```

**3. Configurar en RevenueCat:**
- Project Settings → Integrations → Webhooks → Add
- URL: `https://YOUR_PROJECT.supabase.co/functions/v1/billing-webhook`
- Authorization header: `Bearer <REVENUECAT_WEBHOOK_SECRET>` (generá uno random)
- Secret en Supabase: `npm run supabase:remote -- secrets set REVENUECAT_WEBHOOK_SECRET=...`

**4. Test:** RevenueCat dashboard → Testing → Send test event. Verificar row en `billing_receipts`.

**DoD:** evento sandbox de RevenueCat se escribe correctamente en `subscriptions` + `billing_receipts`.

---

### TASK 3.7 · Cron trial expiry

**Effort:** 4 horas

Migration:
```sql
SELECT cron.schedule(
  'enforce-trial-expiry',
  '0 0 * * *',
  $$
    UPDATE subscriptions SET status = 'expired', updated_at = now()
    WHERE status = 'trial' AND trial_ends_at < now()
  $$
);

SELECT cron.schedule(
  'notify-trial-ending-soon',
  '0 10 * * *',  -- 10am UTC daily
  $$
    SELECT net.http_post(
      url := 'https://YOUR_PROJECT.supabase.co/functions/v1/notify-trial-ending',
      headers := ...
    )
  $$
);
```

Edge function `notify-trial-ending` busca subs con `trial_ends_at BETWEEN now() AND now() + 2 days` y manda push via `send-family-push`.

---

### TASK 3.8 · Entitlement RLS

**Effort:** 1 día · **Status:** 🔴 TO DO

Migration → ver `audit.md` § 3.8.

⚠️ **Cuidado al modificar policies existentes**: tener rollback plan. Probar primero en proyecto staging.

**Tests críticos:**
- Free user con 4 fijos puede leer todos
- Free user no puede crear el 6º (error en RPC)
- Free user no ve gastos > 3 meses
- Pro user ve todo
- Trial user es tratado como Pro

---

## 🏁 Sprint B · Producto + Paywall UX (5 días)

### TASK 3.10 · Tiers definitivos

**Effort:** sólo decisión + actualizar `billing-plans.ts`

Sumar export:
```ts
export const FREE_TIER_LIMITS = {
  members: 2,
  fixedExpenses: 5,
  historyMonths: 3,
  aiCoachQueriesPerMonth: 5,
  ocrPerMonth: 0,
  exportEnabled: false,
  widgetsEnabled: false,
}
```

### TASK 3.11 · Feature gates en cliente

**Effort:** 2 días

Crear `mobile/features/billing/use-feature-gate.ts` (ver audit.md § 3.11).

Auditar en cada feature donde aplica:
- `useCreateFixedExpense` → gate `unlimited_fixed`
- `useExpenseHistory` con date filter → gate `history_full`
- `useAskAICoach` → gate `ai_coach`
- `useRunOCR` → gate `ocr`
- `useExportCSV` → gate `export`

Cada gate → si `!allowed` retorna `() => openPaywall(feature, reason)`.

### TASK 3.12 · Soft paywall sheets

**Effort:** 1 día

Component `<PaywallSheet feature={...} reason={...} onClose={...} />`:
- Hero del feature con copy contextual
- 1 CTA primary "Probar 14 días gratis"
- Link secondary "Ya soy Pro" → restore purchases
- Animación entrada smooth (ya tienen ModalContentEntrance)

Test: cada uno de los 6 entry points (gastos fijos 6º, historial > 3m, AI Coach 6º, OCR, export, plan section) lanza el sheet correcto con copy correcto.

### TASK 3.13 + 3.14 · Hard limits

**Effort:** 2 horas total

Ya gated en cliente vía `useFeatureGate`. Asegurar que backend también lo respeta (RLS de 3.8). Si cliente bypassed → backend rechaza.

### TASK 3.15 · Paywall full-screen revamp

**Effort:** 1 día

`billing-screen.tsx` ya está. Sumarle:
- Comparison table side-by-side Free vs Pro (4-5 rows clave)
- Banner contextual cuando se accede desde un soft paywall: "Para ver historial completo, pasate a Pro"
- Cards de testimonials (preparar para post-launch, mockup ahora)

### TASK 3.16 · Free trial UX

**Effort:** ya wired vía RevenueCat. Sólo UX copy:
- "14 días gratis. No te cobramos nada todavía."
- En el botón CTA: si user es elegible para trial → "Empezar 14 días gratis" — si no → "Empezar por $4.99/mes"

### TASK 3.17 · Trial countdown banner

**Effort:** 4 horas

Component `<TrialBanner>` en Home top, conditional render si `isInTrial`:
```tsx
const daysLeft = Math.ceil((expiresAt - now) / 86400000)
return (
  <Pressable onPress={() => router.push('/settings/plan')}>
    <View style={styles.banner}>
      <Text>Trial Pro · Quedan {daysLeft} días</Text>
      <ChevronRight />
    </View>
  </Pressable>
)
```

### TASK 3.18 · Trial expiry push

**Effort:** 1 día — ya cubierto en 3.7 (cron `notify-trial-ending-soon`).

### TASK 3.20 · Win-back

**Effort:** 1 día

Cuando webhook recibe CANCELLATION:
1. Schedule push 7 días después con `pg_cron` one-off ó tabla `scheduled_pushes`
2. Push: "Volvé con 30% off los primeros 3 meses 💛"
3. Tap → billing-screen con offer code aplicado (Apple Promotional Offer)

Requiere configurar Promotional Offer en App Store Connect.

### TASK 3.21 · Member cap enforcement

**Effort:** 4 horas

Modificar RPC `join_family_by_code` y `bootstrap_family` para validar member count contra plan limit. Mensaje de error friendly que el cliente puede mapear a paywall.

---

## 🏁 Sprint C · Revenue streams secundarios (post-launch)

### TASK 3.22 · Wrapped premium one-time IAP

**Effort:** 1 día · **Postpone:** post-v1.0

Crear Non-Renewing Subscription o Non-Consumable IAP $1.99 → unlocks premium version del Wrapped.

### TASK 3.23 · Affiliate banks

**Effort:** Negociación 1-3 meses · **Postpone:** post-PMF

Roadmap:
1. Lista de bancos/fintech a contactar (5-10)
2. Pitch deck con MAU + audience profile
3. Negociar referral fees
4. Build Partner Portal (admin de partners + tracking)

### TASK 3.24 · B2B2C

**Effort:** Estrategia mes 6+

### TASK 3.25 · Gift subscriptions

**Effort:** 2 días · **Postpone:** v1.5

Consumable IAP → genera código → otra family redeems → 1 mes gratis para ellos.

---

## 📅 Cronograma sugerido

| Semana | Foco | Tasks |
|--------|------|-------|
| **W1** | Backend foundations | 3.1, 3.2, 3.3, 3.4 |
| **W2** | SDK + webhook | 3.5, 3.6, 3.7, 3.8 |
| **W3** | Producto + paywall | 3.10, 3.11, 3.12, 3.13, 3.14 |
| **W4** | UX trial + revamp | 3.15, 3.16, 3.17, 3.18, 3.21 |
| **W5** | QA exhaustivo | Sandbox testing en device real, todos los flujos |
| **Post-launch** | Win-back + revenue streams | 3.20, 3.22-3.25 |

---

## ⚠️ Pitfalls comunes

### Apple App Review

- ✅ **Cancel link**: dejar visible y funcional desde Settings (Guideline 3.1.2). YA TENÉS.
- ✅ **Restaurar compras**: botón visible en paywall (Guideline 3.1.1). FALTA implementar real.
- ✅ **Sin paywall hard al primer use**: Apple no quiere paywalls "agresivos" pre-uso. Empezá free, soft paywall después.
- ✅ **Promesas claras**: si decís "14 días free trial" en App Store → debe ser exacto en la app.
- ⚠️ **Family Sharing**: Apple permite que el comprador comparta la suscripción con su Family Sharing group. Manifiesto debería detectar esto via RevenueCat y compartir entitlement con la family unit de Apple. POSTERGAR — complejo.

### Sandbox testing gotchas

- Subscription periods en sandbox son **acelerados**: 1 mes = 5 min, 1 año = 1 hora. Considerar esto al testear renewals/trials.
- Sandbox accounts tienen limit de eventos por tiempo. Si testás mucho, crear varios.
- iOS Simulator NO permite IAP real. Usar device físico.

### Económicos

- **No olvidar que Apple se queda 30%** (15% el primer año si small business + 15% perpetuo a partir del año 1). Tu $4.99 son ~$3.50 efectivos.
- **Argentina fees**: si vendés en ARS, conversión + payout en USD tiene costo extra.
- **Refunds**: Apple permite hasta 90 días post-purchase. Plan para esto en cashflow.

---

## 🧪 QA checklist pre-launch IAP

- [ ] Compra mensual en sandbox iOS → entitlement activo
- [ ] Compra anual en sandbox iOS → entitlement activo
- [ ] Free trial start sin tarjeta → trial activo
- [ ] Cancel desde App Store Settings → app refleja en < 1h
- [ ] Restore después de reinstall → entitlement vuelve
- [ ] Bypass attempt: modificar `useBilling` retornando `isPro: true` → backend rechaza queries gated (RLS)
- [ ] 6º gasto fijo en free → muestra paywall correcto
- [ ] Historial > 3 meses en free → muestra paywall correcto
- [ ] AI Coach 6ta query en free → muestra paywall correcto
- [ ] Multi-device: compra en device A, abrir app en device B con mismo user → entitlement detectado
- [ ] Family sharing: usuario A es Pro, invita B a familia → B también es Pro automáticamente
- [ ] Webhook downtime simulation: cancelar en App Store, webhook falla → next app open reconciliation via `Purchases.getCustomerInfo()` lo detecta

---

**Próximo doc:** `budget.md`.
