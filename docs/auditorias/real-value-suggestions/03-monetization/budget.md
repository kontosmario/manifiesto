# 03 · Monetization — Presupuesto 💰

> Costos directos de activar monetización + costos variables que arrancan cuando hay revenue.

---

## Tabla resumen

| # | Item | Tipo | Costo arranque | Costo variable | Notas |
|---|------|------|----------------|----------------|-------|
| 3.3 | RevenueCat | SaaS | $0 | 1% del revenue después de $2.5K MTR | Free hasta $30K/año en ventas |
| 3.3a | Apple Developer Program | Licencia | $99/año | — | Ya probablemente pagado |
| 3.3b | Apple commission | Tax | — | 30% (15% año 2+) | Inevitable en iOS |
| 3.3c | Google Play commission | Tax | — | 30% (15% año 2+) | Cuando lleguen a Android |
| 3.6 | Edge function billing-webhook | Supabase | $0 (incluido) | $0.00001 / invocation | Trivial |
| 3.23 | Affiliate partner portal | Build | $0 dev time | comisiones recibidas | Postpone |
| 3.18+3.20 | Push notifications (RevenueCat envíos vs propio) | Servicio | $0 | $0 si self | RevenueCat tiene push tier paid |
| **TOTAL arranque** | | | **$99/año (Apple) + tu tiempo** | | |

---

## Detalle por item

### 3.3 · RevenueCat 💰 (free tier alcanza largo)

**Pricing:**
- **Free:** hasta $2.5K MTR (Monthly Tracked Revenue)
- **Starter:** 1% de revenue después de $2.5K MTR
- **Pro:** $999/mes flat después de $50K MTR

**Estimación para Manifiesto:**
- Si tenés 100 Pro users × $4.99/mes = $499 MTR → free tier ✅
- Si tenés 500 Pro users × $4.99/mes = $2495 MTR → todavía free tier ✅
- Si tenés 1000 Pro users × $4.99/mes = $4990 MTR → pagás 1% × $2490 = **$25/mes** → totalmente justificado

**Cuando vale la pena Pro tier ($999/mes flat):**
Cuando 1% del revenue > $999 → $99,900 MTR → ~20,000 Pro users. Si llegás ahí, RevenueCat es bargain.

**Alternativa cara: build it yourself.**
- StoreKit native + receipt validation server + Google Play Billing + multi-platform sync
- Tiempo: 2-3 semanas dev senior
- Mantenimiento perpetuo
- Bugs propios
- **NO RECOMENDADO.** RevenueCat es de los productos donde "no construyas vos" es la respuesta correcta 95% de veces.

---

### 3.3b · Apple commission (inevitable) 💸💸💸

Apple se queda con:
- **30%** del revenue del primer año por usuario
- **15%** del revenue del segundo año en adelante (Small Business Program si revenue total < $1M/año)

**Implicancia para Manifiesto:**

| Plan | Precio listado | Apple keeps | Vos recibís |
|------|----------------|-------------|-------------|
| Monthly $4.99 | $4.99 | $1.50 (año 1) | $3.49 |
| Annual $39.99 | $39.99 | $12.00 (año 1) | $27.99 |
| Annual $39.99 (renewal year 2+) | $39.99 | $6.00 | $33.99 |

**Tip:** una vez que tenés data de retention, **incentivar anual fuertemente** (33% saving messaging) baja churn y aumenta efectivamente cómo Apple te cobra (un usuario anual paga renovación = 15% sí o sí desde el año 2).

---

### 3.3c · Argentina-specific pricing

Apple ajusta precios automáticamente por territorio. En Argentina puede mostrarse:
- $4.99 USD → ~ARS 5000 (al tipo de cambio Apple)
- Esto afecta poder adquisitivo local

**Recomendación:**
Configurar pricing manual por territorio. Para AR considerá:
- Monthly: ~AR$3500-4500 (no $5000)
- Annual: ~AR$30,000-35,000

Apple maneja la conversión automáticamente cuando lanzás en distintas tiendas, pero podés override en App Store Connect → Pricing → Custom.

---

### 3.6 · Edge functions costs

Supabase incluye 500K function invocations/mes en free tier. Webhook recibirá ~5 events por suscripción/año + cron diario. Trivial — no llegás ni cerca del límite.

Si cruzás free tier: $2 por 1M invocations adicionales.

---

### 3.18 + 3.20 · Push notifications de billing 💰 opcional

Tenés 2 opciones para mandar push de trial-ending, win-back, etc:

**Opción A: tu propio sistema (ya implementado)**
- Edge function `send-family-push` ya existe
- Cron + `pg_cron` + edge func combo
- Costo: $0 (incluido en Supabase free tier para empezar)

**Opción B: RevenueCat Customer Center (paid feature)**
- Triggers automáticos por evento de suscripción
- $0 hasta cierto volume
- No vale el upgrade — tenés infra propia

**Recomendación:** Opción A (ya la tenés).

---

### 3.23 · Affiliate partner portal 💰💰 (revenue positivo)

Esto **no cuesta dinero** — **genera**.

**Modelo típico:**
- Naranja X: $5-15 USD por cuenta abierta
- Brubank: $10-20 USD por cuenta + uso
- Mercado Pago: varían según producto

**Investment requerido:**
- Tiempo desarrollo Partner Portal: 1 semana
- Marketing relación con cada partner: 2-4 semanas negociación
- Backend tracking + webhooks per partner

**Revenue potencial:**
Si 5% de Free users (más motivados a optimizar plata) clickea + convierte → MAU 5000 × 5% × $10/conversión = $2500/mes de revenue secundario.

**Postpone hasta tener >1000 MAU.**

---

## 🧮 Modelo financiero proyectado

Asumiendo conversión típica de freemium B2C:
- Activation: 60% (signup → primer gasto)
- Trial start: 8% de signups
- Trial → Paid: 25%
- Churn mensual: 5%
- Mix monthly/annual: 30%/70%

### Mes 3 post-launch (escenario conservador)

```
500 signups acumulados
  × 60% activation = 300 active users
  × 8% trial start = 24 trial users
  × 25% conversion = 6 paying users
  × ($4.99 × 0.3 + $39.99/12 × 0.7) = $1.50 + $2.33 = $3.83 ARPU/mes
  
MRR = 6 × $3.83 = $23 USD
Después Apple cut (30%): $16
RevenueCat: free
Anthropic AI costs: 6 × $0.30 = $1.80
─────────────
NET mes: ~$14
```

⚠️ A los 3 meses estás aún en zona experimental. **No tomar decisiones de pricing con estos números** — esperar mes 6+.

### Mes 12 post-launch (escenario optimista)

```
5000 signups acumulados
  × 60% activation = 3000 active users
  × 8% trial start = 240 trial users
  × 25% conversion (compounding) = 200 paying users (después de churn)
  × $3.83 ARPU = $766 MRR
  
Yearly: $766 × 12 = $9192 ARR
Apple cut: ~$2750
RevenueCat: free (under $2.5K MTR aún)
Anthropic costs: $60/mes = $720/año
Hosting (Supabase, Vercel): ~$240/año
─────────────
NET year 1: ~$5500
```

### Mes 24 (escenario PMF logrado)

```
20K signups, 800 paying users
MRR: $3000+
ARR: $36K+
Net después de costos: $20-25K
```

A esa altura considerás:
- Pasar Supabase Pro ($25/mes)
- RevenueCat Starter (1% revenue)
- Sentry Team
- Asesor financiero contratado
- Marketing budget

---

## 💸 Presupuesto total monetización

**Pre-IAP launch (este sprint):**
- $0 incremental (RevenueCat free, infra incluida)
- Tu tiempo: 2-3 semanas de un dev

**Post-IAP launch (operational):**
- $0/mes hasta $2.5K MTR
- ~30% del revenue listado se va a Apple
- Variables: AI Coach tokens ~$0.30/user/mes, OCR si usás cloud ~$0.001/scan

**Si tirás de un Big Bang marketing post-launch:**
- $200-1000/mes en Apple Search Ads o Meta ads → tracking de attribution
- ROI medible con PostHog + RevenueCat funnels

---

## ⚠️ Cuidado con

1. **Promotional Offers de Apple**: hasta 70% discount, sirven para win-back. Pero abusarlos baja el LTV percibido. Usar con criterio.
2. **Refunds inflados primer mes**: usuarios mal informados que piden refund. Asegurate que el copy del paywall + el trial sean súper claros para reducir refund rate.
3. **Forex risk Argentina**: cobrás en USD pero gastás en ARS (developers, infra ARS). El BCRA + AFIP pueden complicar repatriación. Asesoría contable es buena idea cuando empieces a facturar.
4. **No subestimar Apple Family Sharing**: si una persona compra Pro y comparte con su Apple Family, tu usuario base efectivo es 2-6x más grande pero revenue por persona es 1x. Trade-off virality vs ARPU.

---

**Sección 03 completa.** Próxima sección: ASO.
