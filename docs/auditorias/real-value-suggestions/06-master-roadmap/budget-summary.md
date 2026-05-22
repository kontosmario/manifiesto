# 06 · Budget Summary 💰

> Consolidación de todos los costos de las 5 secciones. Lo que cuesta llevar Manifiesto de "0 público" a "operación profesional escalable".

---

## 🎯 TL;DR

| Escenario | Pre-launch (one-time) | Año 1 mensual promedio | Total año 1 |
|-----------|----------------------|------------------------|-------------|
| **Mínimo viable** | $130-200 | $2-10/mes | ~$300-400 |
| **Recomendado** | $500-800 | $30-100/mes | ~$1500-2500 |
| **Profesional** | $2000-4000 | $200-500/mes | ~$8000-12000 |

---

## 🏗️ Pre-launch (one-time)

### Mínimo viable (~$130-200)

| Concepto | Sección | Costo |
|----------|---------|-------|
| Apple Developer Program (anual) | 03 | $99/año |
| Domain `manifiesto.app` | 01 | $15/año |
| iubenda Privacy Policy Pro | 01 | $27/año |
| Mockuuups Studio (one-time alt) | 04 | $0-30 |
| Screenshots + video DIY | 04 | $0 |
| **TOTAL** | | **~$141-171** |

### Recomendado (~$500-800)

Sumar al mínimo:
| Concepto | Sección | Costo |
|----------|---------|-------|
| Asesor legal (Terms + Privacy review) | 01 | $200-500 |
| Diseñador freelance para screenshots polish | 04 | $200-500 |
| Música licensed para Preview Video | 04 | $15-30 |
| 1Password Family (secrets mgmt) | 05 | $7.99/mes ($96/año) |
| Mockuuups Studio lifetime | 04 | $99 |
| **TOTAL** | | **~$620-1175** |

### Profesional (~$2000-4000)

Sumar al recomendado:
| Concepto | Sección | Costo |
|----------|---------|-------|
| Designer senior screenshots completo | 04 | $500-800 |
| Editor video freelance | 04 | $200-300 |
| Manifiesto Wrapped design plantillas | 02 | $300-500 |
| Contractor iOS Widget (si lo querés v1.0) | 02 | $1500-2500 |
| **TOTAL** | | **~$2500-4100** |

---

## 📅 Operational año 1 (mensual)

### Mínimo viable

| Concepto | Sección | Costo/mes | Notas |
|----------|---------|-----------|-------|
| Supabase Free | 05 | $0 | Hasta 50K MAU + 500MB |
| Sentry Free | 01/05 | $0 | Hasta 5K events/mes |
| PostHog Free | 01/05 | $0 | Hasta 1M events/mes |
| RevenueCat Free | 03 | $0 | Hasta $2.5K MTR |
| BetterUptime Free | 05 | $0 | Hasta 10 monitors |
| EAS Hobby | 05 | $0 | Hasta 30 builds/mes |
| Logflare Free (logs) | 05 | $0 | Hasta 12M events |
| Vercel Hobby (landing) | 01 | $0 | Suficiente |
| Cloudflare R2 backups | 05 | <$1/mes | Hasta 10GB |
| Google Workspace soporte | 01 | $0-6/mes | Opcional |
| **TOTAL** | | **$0-7/mes** | |

### Operativo con tracción (mes 4-6 post-launch)

Asumiendo 1000 MAU, ~50 Pro users, ~25K MTR.

| Concepto | Sección | Costo/mes | Notas |
|----------|---------|-----------|-------|
| Supabase Free | 05 | $0 | Todavía OK |
| Sentry Free | 01 | $0 | OK |
| PostHog Free | 01 | $0 | OK con eventos típicos |
| RevenueCat Free | 03 | $0 | Bajo $2.5K MTR |
| Anthropic Claude (AI Coach) | 02 | ~$15-30 | 50 Pro × $0.30 |
| ASA test campaign | 04 | $150-300 | $5-10/día |
| Postmark email | 01 | $0-15 | Si quieres tracking |
| Google Workspace | 01 | $6 | |
| Cloudflare R2 | 05 | $1 | |
| **TOTAL** | | **$175-355/mes** | |

### Operativo PMF logrado (mes 9-12)

Asumiendo 5K MAU, ~250 Pro users, ~$1250 MTR.

| Concepto | Sección | Costo/mes | Notas |
|----------|---------|-----------|-------|
| Supabase Pro | 05 | $25 | DB y MAU crecidos |
| Sentry Team | 01 | $26 | Eventos crecidos |
| PostHog | 01 | $0-30 | Aún free probablemente |
| RevenueCat | 03 | $0 | Bajo $2.5K MTR aún |
| Anthropic Claude | 02 | $75-150 | 250 Pro users |
| ASA optimized | 04 | $500-1000 | Acquisition serio |
| AppFollow Basic | 04 | $23 | Keyword tracking |
| Cloudflare R2 | 05 | $2 | |
| 1Password Family | 05 | $8 | |
| Postmark | 01 | $15 | |
| Google Workspace | 01 | $6 | |
| **TOTAL** | | **$680-1285/mes** | |

---

## 💸 Costos variables — escalan con uso

### Anthropic Claude (AI Coach) por usuario activo Pro

| Modelo | Use case | Cost per query | Cost per Pro user/mes |
|--------|----------|----------------|----------------------|
| Claude Haiku 4.5 | Categorization | ~$0.0006 | $0.12 (200 categorizaciones) |
| Claude Sonnet 4.6 | AI Coach conversational | ~$0.007 | $0.28 (40 queries) |
| **TOTAL por Pro user** | | | **$0.40/mes** |

Con 1000 Pro users → $400/mes en AI tokens.
Con 5000 Pro users → $2000/mes.

⚠️ **Sin prompt caching agresivo, estos costos pueden 5x.**

### Apple commission (revenue tax)

| Año 1 (sin Small Business Program) | Año 2+ (Small Business) |
|------------------------------------|-------------------------|
| 30% commission | 15% commission |
| Tu $4.99 → recibís $3.49 | Tu $4.99 → recibís $4.24 |

### Apple Search Ads ROI

Asumiendo CPI $0.50, install→trial 8%, trial→paid 25%:
- Cost per paying user: $0.50/(0.08 × 0.25) = $25
- Si LTV > $75 → ROI > 3x (sano)
- Si LTV < $50 → no escalar hasta mejorar retention

---

## 📊 Proyección financiera consolidada

### Escenario conservador

| Métrica | Mes 3 | Mes 6 | Mes 12 |
|---------|-------|-------|--------|
| MAU | 300 | 1500 | 4000 |
| Pro users | 10 | 60 | 200 |
| MRR (USD) | $40 | $230 | $766 |
| Apple cut | $12 | $69 | $230 |
| Net revenue | $28 | $161 | $536 |
| Costos infra | $5 | $200 | $800 |
| **Net mensual** | **$23** | **-$39** | **-$264** |

Conservador: año 1 invertido es ~$3000-4000 negativo. PMF arriva año 2.

### Escenario optimista

| Métrica | Mes 3 | Mes 6 | Mes 12 |
|---------|-------|-------|--------|
| MAU | 1000 | 5000 | 15000 |
| Pro users | 50 | 300 | 1000 |
| MRR (USD) | $200 | $1150 | $3830 |
| Apple cut | $60 | $345 | $1150 |
| Net revenue | $140 | $805 | $2680 |
| Costos infra | $20 | $400 | $1500 |
| **Net mensual** | **$120** | **$405** | **$1180** |

Optimista: cubris costos en mes 3, profit positivo desde mes 4. Year 1 net ~+$10K.

---

## 🎁 Revenue streams secundarios (post-PMF)

| Stream | Estimado mensual mes 12 |
|--------|------------------------|
| Affiliate banks (5% de Free users converting) | $200-1000 |
| One-time Wrapped Premium IAP | $50-200 |
| Gift subscriptions | $30-100 |
| B2B asesores | $200-500 (early stage) |

**Potencial extra:** $500-1800/mes adicionales en mes 12.

---

## 🚨 Costos hidden / sorpresas

### Que pueden golpearte sin querer

| Concepto | Costo potencial | Mitigación |
|----------|-----------------|------------|
| Forex spreads (cobrar USD, gastar ARS) | 3-8% pérdida | Apertura cuenta USD AR formal |
| Refunds Apple (first 90 días) | Hasta 5% revenue | Paywall copy claro reduce |
| Sandbox testing exceso | Bloqueo temporal | Crear varios sandbox accounts |
| AI Coach abuse user | $100-500/mes | Rate limiting estricto + alertas |
| Supabase egress charges si vídeo OCR | $0.09/GB > 5GB | Compresión + paginación |
| ASA underperforming campaign | $300-500 quemados | Empezá con $5/día test, no $50 |
| Apple Developer Agreement updates | tu tiempo | Suscribirse a newsletter Apple |
| Tax implications cobranza USD | varía AR | Asesor contable necesario |

---

## 💼 Profesional / contable

Cuando llegues a > $5K MRR considerá:

| Servicio | Costo | Cuándo |
|----------|-------|--------|
| Contador AR (monotributo o RI) | $50-150/mes | Desde día 1 si vendés |
| Asesor legal app contracts | $200/hora ocasional | Cuando IAP arranca |
| Tax planning USA→AR | $500/año | Cuando MRR > $5K |
| Bookkeeping software | $20/mes | Cuando facturás regularmente |

---

## 🎯 Recommended budget allocation (año 1 realista)

Si tu presupuesto total para año 1 es **$3000**:

```
$ 200  Pre-launch one-time (domain, legal, screenshots DIY)
$ 100  Apple Developer Program
$1000  Apple Search Ads (mes 4-12, $111/mes promedio)
$ 800  AI Coach tokens (mes 3-12, $89/mes promedio)
$ 300  Supabase Pro upgrade (último cuatrimestre)
$ 300  Sentry Team upgrade (último cuatrimestre)
$ 200  Misc tooling + contingency
$ 100  Contador AR primer año
─────
$3000 total
```

Esto te lleva de 0 a una operación con ~2000 MAU y ~$500-800 MRR. Path realista a PMF.

---

## 💎 Mi recomendación final

**Si tu budget es < $500:** lanzá con todo free tier, hacé screenshots DIY, no corrás ads. Validá hipótesis con orgánico.

**Si tu budget es $500-2000:** invertí en (1) legal proper, (2) screenshots polished, (3) primeros 3 meses ASA. Mejor stack de tooling para arrancar.

**Si tu budget es > $2000:** sumá (4) contractor para iOS Widget, (5) ASA budget continuo, (6) Supabase Pro desde día 1 para backups serios.

---

**Próximo doc:** `dependency-graph.md`.
