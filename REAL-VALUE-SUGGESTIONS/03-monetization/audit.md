# 03 · Monetization — Audit detallado

> Estado actual: la UI de billing es de calidad producción, pero el motor está vacío. Score de readiness: **2/10** (per Agent D).

---

## 🔬 Estado actual del módulo billing

### Lo que SÍ existe ✅

| Archivo | Estado | Notas |
|---------|--------|-------|
| `mobile/features/billing/billing-plans.ts` | ✅ Completo | 2 planes definidos con product IDs |
| `mobile/screens/settings/billing-screen.tsx` | ✅ Polished | 1110 líneas: grid, FAQ, trust pills, comparison |
| `mobile/features/billing/use-billing.ts` | 🟡 MOCK | Optimistic timeouts, no SDK real |
| `app/(app)/settings/plan.tsx` | ✅ Route wired | Navegación entra sin error |
| Restore Purchases UI | 🟡 Stub | Botón existe, handler es alert() |
| Subscription deep link | ✅ Funcional | Linking a App Store / Play Store sub management |
| FAQ + trust pills | ✅ Completo | 5 preguntas, 3 trust badges |
| Trial 14 días copy | ✅ Listo | "Sin tarjeta" mencionado |

### Lo que NO existe ❌

| Item | Severidad | Notas |
|------|-----------|-------|
| Subscriptions table en DB | ⛔ blocker | Cero persistencia, todo mock state |
| Billing receipts log | ⛔ blocker | Sin auditoría de transacciones |
| RevenueCat SDK | ⛔ blocker | No instalado en `package.json` |
| StoreKit / Play Billing wiring | ⛔ blocker | Cero código de IAP nativo |
| Server Notifications webhook | ⛔ blocker | Apple no puede notificar renewals/cancel |
| Entitlement gating en RLS | ⛔ blocker | Free users acceden a todo |
| Feature gates en cliente | ⛔ blocker | Cero `if (isPro)` en código |
| Member cap enforcement | ⛔ blocker | Plans dicen "2 miembros" pero no se valida |
| Trial state real | 🟡 partial | Hardcoded 14 days local |
| Win-back hooks | — | No implementado |
| One-time purchases | — | No definidos |

---

## 📋 Detalle por item

### 3.1 / 3.2 — Schema tablas missing

**Faltan:**
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  product_id TEXT NOT NULL,            -- ej. com.manifiesto.app.subscription.monthly
  plan_id TEXT NOT NULL,                -- 'hogar-mensual' | 'hogar-anual'
  status TEXT NOT NULL,                 -- 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired'
  source TEXT NOT NULL,                 -- 'app_store' | 'play_store' | 'manual'
  store_subscription_id TEXT,           -- Apple original_transaction_id
  trial_starts_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  current_period_starts_at TIMESTAMPTZ,
  current_period_ends_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON subscriptions(family_id);
CREATE INDEX ON subscriptions(status, current_period_ends_at);
CREATE UNIQUE INDEX ON subscriptions(store_subscription_id) WHERE store_subscription_id IS NOT NULL;

CREATE TABLE billing_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  family_id UUID NOT NULL REFERENCES families(id),
  user_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL,            -- 'INITIAL_BUY' | 'RENEWAL' | 'CANCEL' | 'REFUND' | 'TRIAL_START' | 'TRIAL_CONVERT'
  raw_payload JSONB NOT NULL,          -- payload completo de App Store / RevenueCat
  amount_usd NUMERIC(10,2),
  currency TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON billing_receipts(family_id, processed_at DESC);
```

**RLS:**
- `subscriptions` SELECT: cualquier miembro de la familia puede ver el estado
- `subscriptions` INSERT/UPDATE: SOLO service_role (vía webhook)
- `billing_receipts`: SOLO service_role

### 3.3 — RevenueCat setup

**Por qué RevenueCat (vs StoreKit directo):**
- ✅ Maneja Apple + Google + Stripe con misma API
- ✅ Server-side receipt validation incluido
- ✅ Webhooks unificados → 1 endpoint en lugar de 2
- ✅ Dashboard con MRR, churn, conversión out-of-the-box
- ✅ Free hasta $2.5K MTR (Monthly Tracked Revenue)
- ✅ A/B testing de paywalls incluido
- ❌ Vendor lock-in (pero migración posible si crecés mucho)

**Setup:**
1. Crear cuenta en revenuecat.com
2. Project "Manifiesto" → App "iOS"
3. Conectar App Store Connect (App-Specific Shared Secret)
4. Crear Entitlement "pro_access"
5. Crear Offerings: `default` con monthly + annual
6. Anotar Public SDK Key → `.env`: `EXPO_PUBLIC_REVENUECAT_API_KEY=...`

### 3.4 — Wire StoreKit via RevenueCat

```bash
npm install react-native-purchases
```

En `app.config.ts` agregar plugin si EAS Build lo requiere.

```ts
// mobile/lib/billing-init.ts
import Purchases from 'react-native-purchases'
export function initBilling(userId: string) {
  Purchases.configure({
    apiKey: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY!,
    appUserID: userId
  })
}
```

Llamar `initBilling(session.user.id)` post-login.

### 3.5 — `useBilling` real

Reemplazar mock en `use-billing.ts`:

```ts
export function useBilling() {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null)

  useEffect(() => {
    Purchases.addCustomerInfoUpdateListener(setCustomerInfo)
    Purchases.getCustomerInfo().then(setCustomerInfo)
  }, [])

  const isPro = customerInfo?.entitlements.active['pro_access'] != null
  const isInTrial = customerInfo?.entitlements.active['pro_access']?.periodType === 'trial'
  const expiresAt = customerInfo?.entitlements.active['pro_access']?.expirationDate

  const purchase = async (packageId: string) => {
    const offerings = await Purchases.getOfferings()
    const pkg = offerings.current?.availablePackages.find(p => p.identifier === packageId)
    if (!pkg) throw new Error('Package not found')
    return Purchases.purchasePackage(pkg)
  }

  const restore = () => Purchases.restorePurchases()

  return { isPro, isInTrial, expiresAt, purchase, restore, ... }
}
```

### 3.6 — App Store Server Notifications v2

**Edge function** `supabase/functions/billing-webhook/index.ts`:
- Recibe POST de RevenueCat (más fácil) ó directo de Apple ASN v2
- Valida signature
- Parsea event
- Upsert en `subscriptions`
- Inserta en `billing_receipts`
- Si tipo es `CANCELLATION` → trigger workflow win-back

**Configurar URL en RevenueCat:** Project Settings → Integrations → Webhooks.

### 3.7 — Cron trial expiry

`pg_cron`:
```sql
SELECT cron.schedule(
  'enforce-trial-expiry',
  '0 0 * * *',  -- daily at midnight UTC
  $$
    UPDATE subscriptions SET status = 'expired'
    WHERE status = 'trial' AND trial_ends_at < now();
  $$
);
```

Adicional: push notification 2 días antes del fin del trial via cron diario.

### 3.8 — Entitlement RLS policies

Decisión: **gating en backend, no solo cliente**. Si un usuario rompe el cliente igual no puede acceder.

Ejemplo: historial > 3 meses para usuarios free.
```sql
CREATE OR REPLACE FUNCTION is_pro(p_family_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE family_id = p_family_id
      AND status IN ('trial', 'active')
      AND current_period_ends_at > now()
  );
$$ LANGUAGE sql STABLE;

-- Modificar policy de expenses SELECT:
CREATE POLICY expenses_select_with_history_limit ON expenses FOR SELECT USING (
  is_family_member(family_id) AND (
    is_pro(family_id) OR created_at >= (now() - interval '3 months')
  )
);
```

Similar para `fixed_expenses.count > 5` en free tier.

### 3.9 — Restore Purchases real

```ts
const handleRestore = async () => {
  try {
    const customerInfo = await Purchases.restorePurchases()
    if (customerInfo.entitlements.active['pro_access']) {
      Alert.alert('¡Listo!', 'Restauramos tu suscripción.')
    } else {
      Alert.alert('Sin suscripciones', 'No encontramos compras previas en esta cuenta.')
    }
  } catch (e) {
    Alert.alert('Error', 'No pudimos restaurar. Intentá de nuevo.')
  }
}
```

### 3.10 — Tiers FREE / PRO / FAMILY+

**Estado actual:** `billing-plans.ts` define solo 2 (mensual + anual del mismo tier). Falta FREE explícito y FAMILY+ propuesto.

**Sugerencia:** mantener 2 tiers paid + free. FAMILY+ se puede sumar en v1.5 cuando tengas data de si hay demanda.

```typescript
// billing-plans.ts extendido
export const BILLING_PLANS = {
  free: { /* no IAP, default state */ },
  pro_monthly: { /* existente */ },
  pro_annual: { /* existente */ },
}

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

### 3.11 — Feature gates en cliente

Helper:
```ts
// mobile/features/billing/use-feature-gate.ts
export function useFeatureGate(feature: 'ai_coach' | 'ocr' | 'export' | 'widgets' | 'history_full' | 'unlimited_fixed') {
  const { isPro } = useBilling()
  const usage = useUsageCounters()  // tracking de uso del free tier
  
  if (isPro) return { allowed: true, reason: null }
  
  const limit = FREE_TIER_LIMITS[feature]
  if (limit === false || limit === 0) return { allowed: false, reason: 'pro_only' }
  if (typeof limit === 'number' && usage[feature] >= limit) return { allowed: false, reason: 'limit_reached' }
  
  return { allowed: true, reason: null }
}
```

Uso:
```tsx
const gate = useFeatureGate('ai_coach')
if (!gate.allowed) return <PaywallSheet feature="ai_coach" reason={gate.reason} />
```

### 3.12 — Soft paywall triggers

Identificados 3 momentos óptimos:
1. **Al intentar agregar el 6º gasto fijo** → "Tu hogar tiene 5 fijos. Pasá a Pro para sumar más"
2. **Al pedir historial > 3 meses** → "Vé tu plata desde el día 1 con Pro"
3. **Al abrir sección Plan/Meses del Control** → "Insights completos en Pro"

Adicionales:
4. AI Coach query 6+ del mes → "Ya hiciste tus 5 preguntas. Con Pro son ilimitadas"
5. Botón cámara OCR → "Snap recibos con Pro"
6. Settings → Export → "Exportá toda tu historia con Pro"

Cada uno con **sheet contextual** (no modal full-screen agresivo): hero del feature + 1 button "Probar Pro 14 días gratis" + link sutil "Ya tengo cuenta" → restore.

### 3.13 / 3.14 — Hard limits FREE

En `useCreateFixedExpense`:
```ts
const fixedExpensesCount = useFixedExpenseCount()
const gate = useFeatureGate('unlimited_fixed')
if (!gate.allowed && fixedExpensesCount >= 5) {
  return openPaywall('fixed_expense_limit')
}
```

Para historial: ya gestionado en backend (RLS). Cliente sólo necesita catch + mostrar paywall si retorna < requested.

### 3.15 — Paywall full-screen vs soft

`billing-screen.tsx` ya existe. Lo que falta es:
- Triggerlo automáticamente desde los entry points (3.12)
- Hacerle el header dinámico según contexto ("Para ver más de 3 meses, …")
- Cards con feature comparison side-by-side (no hay hoy)

### 3.16 — Free trial real

Con RevenueCat es trivial: el config del producto en App Store Connect tiene "Introductory Offer" de 14 días free. RevenueCat lo respeta automáticamente. **No requerir tarjeta requiere usar promotional offers, no introductory.**

⚠️ **Decisión estratégica:** trial sin tarjeta tiene mejor conversión a trial-start pero peor conversión trial→paid. Trial con tarjeta es inverso. Recomiendo **trial sin tarjeta** primero, medir, ajustar.

### 3.17 — Trial countdown banner

Component nuevo `TrialBanner` en Home (top sticky):
> "Trial Pro · Quedan 8 días"

Con CTA "Confirmar suscripción" → billing screen. Diseño no agresivo, color amarillo suave.

### 3.18 — Trial expiry notification

Push 2 días antes:
> "Te quedan 2 días de trial. Si te gusta, pasale Pro a tu hogar 💛"

Push el día de expiry si no convirtió:
> "Tu trial terminó. Volvé cuando quieras con un toque."

### 3.19 — Cancel flow

Ya existe deep link `billing-screen.tsx:715-719`. Sólo necesita ser visible globalmente en Settings (ver `01-showstoppers-ios/`).

### 3.20 — Win-back para canceled

Cuando webhook recibe CANCELLATION:
1. Marcar `subscriptions.cancelled_at`
2. Schedule push 7 días después: "Te extrañamos. Volvé con 30% off los primeros 3 meses"
3. Usar Apple Promotional Offers para discount

### 3.21 — Family plan member cap

En `bootstrap_family` y `join_family_by_code` validar:
```sql
DECLARE member_count INT;
DECLARE max_members INT;
BEGIN
  SELECT COUNT(*) INTO member_count FROM family_members WHERE family_id = p_family_id;
  SELECT CASE
    WHEN is_pro(p_family_id) THEN 6   -- Pro tier
    ELSE 2                            -- Free tier
  END INTO max_members;
  
  IF member_count >= max_members THEN
    RAISE EXCEPTION 'member_cap_reached: % miembros para este plan', max_members;
  END IF;
END
```

### 3.22 — Manifiesto Wrapped premium download

One-time IAP $1.99 que desbloquea:
- Versión "Premium Year Wrapped" con cards extra (5 cards más)
- Resolution 4K para imprimir
- Sin watermark de Manifiesto en share (delicado: tampoco perder viralidad)

Productor de revenue secundario, plus opportunity para usuarios que no quieren commitment de subscripción.

### 3.23 — Affiliate cuentas remuneradas

**Negociar con:**
- Naranja X
- Brubank
- Mercado Pago
- Ualá
- Personal Pay

**Modelo:** referral fee $5-20 USD por cuenta abierta exitosamente. Banner contextual en Control cuando `available_cash > $50K ARS sin allocation`: "¿Sabías que tu plata podría rendir 80% anual en cuenta remunerada?".

**Tracking:** UTM en deep links + webhook desde partner. Requiere infra de Partner Portal.

### 3.24 — B2B2C licencias a asesores

**Modelo:** asesor financiero certificado paga $19.99/mes y puede invitar hasta 20 hogares a Pro gratis. Receives metadata anonimizada (no datos individuales) para coaching.

**No para v1.0** — explora cuando tengas tracción.

### 3.25 — Gift subscription

Comprable como In-App Purchase consumible. Genera código que otra familia puede redeem.

Caso de uso: regalar mes Pro a hermano/padres. Viralidad + revenue.

---

## 📐 Pricing rationale

| Tier | Precio | Punto de referencia | Notas |
|------|--------|---------------------|-------|
| FREE | $0 | YNAB Free, Spendee Free | Es la puerta de entrada |
| PRO mensual | $4.99 | YNAB $14.99, Mint free pero ads | Aggressive low entry |
| PRO anual | $39.99 | 33% saving vs mensual | Anclar como recomendado |
| FAMILY+ | $79.99/año | Niche tier para tracción | Postergar |

**Argentina ajuste:** considerá pricing localizado en ARS para evitar fricción de conversión. RevenueCat soporta multi-currency.

---

## 📊 Métricas para validar

Post-launch, trackear en RevenueCat + PostHog:

| Métrica | Target inicial |
|---------|----------------|
| Trial start rate (signups → trial) | > 8% |
| Trial → Paid conversion | > 25% |
| MRR mes 3 | $500+ |
| Churn mensual | < 8% |
| LTV | > $40 |
| LTV/CAC | > 3x |

---

**Próximo doc:** `roadmap.md` con secuenciación técnica.
