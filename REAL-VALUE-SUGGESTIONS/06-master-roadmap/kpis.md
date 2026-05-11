# 06 · KPIs — Métricas para validar que el roadmap funciona

> Si no podés medir, no podés mejorar. Estas métricas tienen que ser visibles en dashboards desde el día 1 post-launch.

---

## 📊 North Star

**Activated MAU** = usuarios que han creado al menos 1 expense en los últimos 30 días.

Esta es la métrica de salud principal. Todo lo demás es leading o lagging indicator de esto.

---

## 🎯 Métricas por fase del funnel

### Acquisition (top of funnel)

| Métrica | Target v1.0 mes 3 | Tool | Fuente |
|---------|-------------------|------|--------|
| Installs mensuales | > 200 | App Store Connect | listings |
| Impression → install conversion | > 4% | App Store Connect | screenshots impact |
| Organic vs paid split | 70/30 | RevenueCat attribution | ASA + PostHog |
| Cost per Install (ASA) | < $0.80 | Apple Search Ads | campaigns |
| Keyword rank (top 5 keywords) | top 50 cada uno | AppFollow | seguimiento manual mes 1-3 |

### Activation

| Métrica | Target | Tool | Fuente |
|---------|--------|------|--------|
| Signup completion (de welcome view → signup completed) | > 60% | PostHog funnel | event_chain |
| Family onboarding completion (signup → first family) | > 80% | PostHog funnel | event_chain |
| First expense added (signup → first expense in 24h) | > 50% | PostHog funnel | "Activated" definition |
| Time-to-activation median | < 5 min | PostHog | tracking time delta |
| Onboarding step drop-off rate | < 10% per step | PostHog funnel | per-step events |

### Engagement / Retention

| Métrica | Target | Tool | Fuente |
|---------|--------|------|--------|
| D1 retention | > 60% | PostHog cohort | install cohort |
| D7 retention | > 30% | PostHog cohort | install cohort |
| D30 retention | > 15% | PostHog cohort | install cohort |
| Daily expenses created per active user | > 1.2 | PostHog | event_rate |
| Streak median length | > 7 days | DB query `user_streaks` | manual SQL |
| Family members per active family | > 1.5 (i.e. más de 50% son shared) | DB query | manual SQL |
| Session frequency (sessions/week) | > 4 | PostHog | session events |
| AI Coach queries per Pro user / mes | > 4 | PostHog | feature_used event |

### Monetization

| Métrica | Target mes 3 | Target mes 6 | Target mes 12 |
|---------|--------------|--------------|---------------|
| Trial start rate (active user → trial) | > 8% | > 12% | > 15% |
| Trial → Paid conversion | > 20% | > 25% | > 30% |
| Annual vs Monthly mix | 60/40 | 65/35 | 70/30 |
| MRR | > $50 | > $300 | > $1000 |
| ARPU (paid users only) | $3.80 | $3.95 | $4.10 |
| Churn rate mensual | < 10% | < 8% | < 6% |
| Refund rate | < 5% | < 3% | < 2% |
| LTV (Pro user) | $30 | $45 | $60 |
| LTV/CAC | > 2x | > 3x | > 4x |

### Quality / Operational

| Métrica | Target | Tool | Frecuencia review |
|---------|--------|------|-------------------|
| Crash-free sessions | > 99.5% | Sentry | daily |
| ANR rate | < 0.1% | Sentry | weekly |
| p95 cold start | < 2s | Sentry Perf | weekly |
| p95 home screen TTI | < 500ms | Sentry Perf | weekly |
| Push delivery success rate | > 95% | Edge function logs | weekly |
| App Store rating | > 4.3 ⭐ | App Store Connect | weekly |
| Review response rate (< 3 stars) | 100% | App Store Connect | daily |
| Support email response time | < 24h median | Postmark / inbox | daily |
| Sentry events trending | flat or decreasing | Sentry | weekly |
| Backup test pass rate | 100% quarterly | manual | quarterly |

---

## 📈 Dashboards a configurar

### Dashboard 1: "Daily Health" (Sentry + PostHog + RevenueCat)

Frecuencia review: **diaria, 5 min** primera cosa de la mañana

| Card | Source | What to watch |
|------|--------|---------------|
| New installs (24h) | RevenueCat | trend vs prior 7d avg |
| New signups (24h) | PostHog | trend vs prior 7d avg |
| New paid conversions (24h) | RevenueCat | celebrar 🎉 |
| Crashes (24h) | Sentry | spike alert |
| Top error (24h) | Sentry | new errors |
| App Store reviews new | App Store Connect API | respond < 24h |

### Dashboard 2: "Weekly Cohort" (PostHog)

Frecuencia: **semanal, lunes 1h review**

| Sección | Métricas |
|---------|----------|
| Funnels | Acquisition → Activation → Retention → Monetization |
| Retention cohorts | D1, D7, D30 split by acquisition source |
| Trial conversion | Trial → Paid by week of trial start |
| Feature usage | AI Coach, Notes, Reactions, Streaks, Widget |
| Paywall conversion | Each entry point → purchase rate |

### Dashboard 3: "Monthly Business" (RevenueCat + custom)

Frecuencia: **mensual, primer lunes del mes**

| Sección | Métricas |
|---------|----------|
| Revenue | MRR, ARR, % growth MoM |
| Subscribers | Total active Pro, new this month, churned this month |
| Mix | Annual vs Monthly, AR vs MX/ES/CO |
| CAC | Total ad spend / new paid |
| LTV | Cohort-based actual + projected |
| LTV/CAC | Health ratio |
| Cohort retention | 6-mo old cohort retention chart |

---

## 🚨 Alertas / triggers automáticos

Configurar en PostHog + Sentry + Slack:

| Condición | Severidad | Acción |
|-----------|-----------|--------|
| Crash rate > 1% en 1h | 🚨 P0 | Sentry → Slack → investigar HOY |
| Activation drop > 20% día/día | 🚨 P0 | PostHog alert → review onboarding |
| Paywall view → purchase < 2% (7 day avg) | 🟡 P1 | revisar paywall copy |
| AI Coach errors > 5% | 🟡 P1 | revisar prompt + cache |
| Push delivery < 90% | 🟡 P1 | revisar tokens stale |
| Apple Review reject | 🚨 P0 | iterate ASAP |
| New 1-2 star review | 🟡 P1 | respond < 24h |
| MRR drops > 10% vs prior month | 🚨 P0 | investigar churn drivers |
| Webhook downtime > 5 min | 🚨 P0 | check Supabase edge function logs |
| Sentry uses > 80% del plan | 🟡 P1 | upgrade plan o reducir sample rate |

---

## 🎯 Goals trimestrales

### Q1 post-launch (mes 1-3)

- 🎯 1000+ installs
- 🎯 50+ Pro users
- 🎯 Crash-free > 99.5%
- 🎯 Rating > 4.3 ⭐
- 🎯 D30 > 15%

### Q2 post-launch (mes 4-6)

- 🎯 5000+ installs acumulados
- 🎯 250+ Pro users
- 🎯 MRR > $800
- 🎯 D30 > 25%
- 🎯 Reviews respondidas 100%
- 🎯 Lanzar Wrapped (item 2.4) + Widget (item 2.7)

### Q3 post-launch (mes 7-9)

- 🎯 15000+ installs acumulados
- 🎯 700+ Pro users
- 🎯 MRR > $2500
- 🎯 Expand a MX + ES
- 🎯 ASA generating positive ROI

### Q4 post-launch (mes 10-12)

- 🎯 30000+ installs
- 🎯 1500+ Pro users
- 🎯 MRR > $5000
- 🎯 PMF officially declared
- 🎯 Plan para Android port + i18n EN

---

## 📐 Cómo medir "Product/Market Fit"

PMF tiene varias señales. Manifiesto habrá logrado PMF cuando 3+ de estos sean ciertos:

1. **40%+ "very disappointed if app disappeared"** (Sean Ellis test) — manual survey en mes 6
2. **D30 retention > 25%** consistente 3 meses seguidos
3. **NPS > 50** entre Pro users
4. **Organic growth > 30%** de installs por mes vía word-of-mouth
5. **Trial conversion > 30%** sostenido
6. **MRR growth > 10% MoM** durante 6+ meses
7. **Customer support volume disminuyendo** mientras MAU sube
8. **Reviews mencionan "irreemplazable" o "no puedo vivir sin"** (manual check)

Si lográs 5+ de 8, PMF strong.

---

## 🧪 Experimentos a correr post-launch

Cada experimento corre **mínimo 14 días** o **1000 conversions**, lo que llegue primero.

### Experimento A: Paywall copy

**Hipótesis:** "Empezá 14 días gratis" convierte mejor que "Probá Pro 14 días"

- A: "Empezá 14 días gratis" (control)
- B: "Probá Pro 14 días" (variant)
- Metric: trial start rate
- Sample: 1000 paywall views por arm
- Test via Apple Custom Product Pages

### Experimento B: First screenshot

**Hipótesis:** screenshot del numpad (acción) convierte mejor que el financial radial (estético)

- A: financial radial dashboard (control)
- B: numpad mid-keypress (variant)
- Metric: impression → install rate
- Sample: 5000 impressions por arm

### Experimento C: Free trial requires card vs no card

**Hipótesis:** no requiring card aumenta trial starts pero baja trial→paid

- A: sin tarjeta (control)
- B: con tarjeta (variant)
- Metrics: trial start rate AND trial→paid conversion AND net revenue per cohort
- Sample: 200 trials por arm
- Importante: medir el NET effect, no solo una métrica

### Experimento D: AI Coach gating

**Hipótesis:** 5 queries/mes free es muy restrictivo

- A: 5 queries/mes (control)
- B: 10 queries/mes (variant)
- Metric: AI Coach query→paywall conversion + Pro retention
- Sample: 500 active free users por arm

---

## 📑 Cómo trackear el roadmap mismo

No solo importan las métricas del producto — también las del equipo:

| Métrica | Target |
|---------|--------|
| Sprint completion rate | > 80% de tasks completadas vs planeadas |
| Bug introduction rate | < 2 P0 bugs introducidos por sprint |
| Code review turnaround | < 24h median |
| Deploy frequency (post-launch) | > 1/semana via OTA, > 1/mes via store |
| Mean time to recovery (P0 incident) | < 2h |
| Dev satisfaction (you, if solo) | manual journaling — no burnout |

---

## 🔁 Cadencia de review

| Review | Frecuencia | Duration | Quién |
|--------|------------|----------|-------|
| Daily health check | diaria | 5 min | tú |
| Sprint review | semanal | 30 min | tú + collaborator si hay |
| Cohort retention | semanal | 15 min | tú |
| Business review | mensual | 1h | tú (writing summary) |
| Strategic review | trimestral | 4h | tú + advisor si tenés |
| Roadmap review | trimestral | 2h | tú + product whiteboard |

---

## 💡 Indicadores tempranos de "algo va mal"

Si ves cualquiera de estos, parar y debuggear:

- **Activation cae > 25% sin causa identificable** → posiblemente onboarding rompió
- **Crash rate sube > 0.5% en 24h** → última release tiene un bug
- **Paywall view → install/trial cae > 30%** → posible Apple change ó tu copy lo rompió
- **Support emails repiten la misma queja > 5 veces** → bug o UX confusion
- **Reviews bajan a 4.0** → critical issue not fixed
- **Sentry events nuevos no clasificados (categoría "new") > 20/día** → release breaking

---

**Sección 06 completa.** Próximo y final: actualizar el README master con status board final.
