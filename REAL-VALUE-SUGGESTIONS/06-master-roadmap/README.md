# 06 · Master Roadmap

> Visión integrada: cómo combinar las 5 secciones anteriores en un plan operativo coherente, con sprints, dependencias, y presupuesto consolidado.

📂 **Documentos:**
- `sprint-plan.md` — secuencia recomendada de sprints semana-por-semana
- `budget-summary.md` — costos consolidados pre-launch + año 1
- `dependency-graph.md` — qué bloquea a qué (orden de ejecución)
- `kpis.md` — métricas para validar que el roadmap funciona

---

## 🗺️ Vista macro

```
┌─────────────────────────────────────────────────────────────┐
│ FASE 0 — PREP                                  (1 semana)   │
│ • Servicios externos creados (Sentry, PostHog, RevenueCat) │
│ • Domain manifiesto.app + email                            │
│ • Privacy Policy + Terms hosteados                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ FASE 1 — SHOWSTOPPERS                          (2 semanas)  │
│ • Delete Account                                            │
│ • Apple Sign-In en login                                    │
│ • Privacy + Terms wired                                     │
│ • Password reset                                            │
│ • Permission priming                                        │
│ • Sentry + PostHog                                          │
│ • Hygiene: zombie cleanup, version, support                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ FASE 2 — MONETIZATION FOUNDATIONS              (2 semanas)  │
│ • Schema subscriptions + receipts                           │
│ • RevenueCat setup                                          │
│ • useBilling real                                           │
│ • Webhook                                                   │
│ • Entitlement RLS                                           │
│ • Feature gates + soft paywalls                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ FASE 3 — ENGAGEMENT CORE                       (2 semanas)  │
│ • Streaks UI + persistencia                                 │
│ • Notes en gastos                                           │
│ • Search                                                    │
│ • Reactions                                                 │
│ • First-expense walkthrough                                 │
│ • Daily recap                                               │
│ • Mark-paid celebrations                                    │
│ • AI Coach UX (backend ya wired!)                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ FASE 4 — ASO + SUBMIT                          (2 semanas)  │
│ • Screenshots + Preview video                               │
│ • Listing copy + keywords + categorización                  │
│ • Privacy label                                             │
│ • Pre-submit checklist + TestFlight                         │
│ • Submit to App Review                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ FASE 5 — LAUNCH + QUALITY HARDENING            (2 semanas)  │
│ • Schema hygiene (audit_log, invitations, devices)          │
│ • RLS security fix                                          │
│ • CI/CD automation                                          │
│ • Crons + cleanup                                           │
│ • Backup strategy                                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ FASE 6 — POST-LAUNCH DIFFERENTIATORS           (continuous) │
│ • iOS Widget                                                │
│ • Live Activity                                             │
│ • Siri Shortcuts                                            │
│ • OCR                                                       │
│ • Manifiesto Wrapped                                        │
│ • Apple Search Ads                                          │
│ • Latam localization                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ FASE 7 — SCALE                                 (v1.5+)      │
│ • Apple Watch                                               │
│ • i18n English                                              │
│ • Affiliate revenue                                         │
│ • B2B2C                                                     │
│ • Achievements gallery                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Status board consolidado

| Fase | Sección | Items críticos | Items totales | Effort estimado | 💰 |
|------|---------|----------------|---------------|-----------------|-----|
| **0** | Setup | 4 | 6 | 1 semana | ~$45 |
| **1** | 01 + parte de 05 | 8 | 18 | 2 semanas | ~$30 + legal opcional |
| **2** | 03 | 9 (backend) | 21 | 2 semanas | $0 RevenueCat free |
| **3** | 02 (core) | 8 | 13 | 2 semanas | ~$50 AI tokens/mes |
| **4** | 04 | 6 | 13 | 2 semanas | $0-500 assets |
| **5** | 05 (resto) + 03 (paywall) | 10 | 18 | 2 semanas | $0-30/mes |
| **6** | 02 (iOS native) | 4 | 8 | 4-8 semanas | $2000-3000 contractor |
| **7** | 02 (advanced) + 03 (secundario) | 3 | 6 | continuous | varia |

**TOTAL crítico para launch:** ~12 semanas (3 meses) si ejecutás full-time.
**TOTAL realista** con 1 dev part-time: 4-6 meses.

---

## 🎯 Decisiones clave que tenés que tomar AHORA

Antes de empezar, hay 5 decisiones de producto que afectan todo lo siguiente:

### 1. ¿Lanzás con IAP activo desde día 1, o freemium-only primero?

| Opción | Pros | Contras |
|--------|------|---------|
| **Launch con IAP** | Revenue desde día 1, valida willingness to pay | Más complejidad, más riesgo de rechazo en review, paywall puede asustar early adopters |
| **Launch free, IAP en v1.1** | Lanzamiento más simple, recolectar feedback puro | Pierdes 2-3 meses de revenue, paywall fricción mayor al introducir luego |

**Recomendación:** **Launch con IAP activo desde día 1**. La sección 03 cubre todo. Trial 14 días sin tarjeta minimiza fricción.

### 2. ¿AI Coach v1.0 o postpone?

El backend (`control-advisor`) **ya está wired a Claude Sonnet**. El gap es solo UX. Costo de implementación: 3-5 días.

**Recomendación:** **AI Coach SI en v1.0**. Es el diferencial #1 vs competidores. Justifica solo el upgrade a Pro.

### 3. ¿iOS Widget v1.0 o postpone a v1.1?

Requiere Swift expertise. Sin contractor, agrega 2-3 semanas. Con contractor, $1500-2500 + 1 semana.

**Recomendación:** **Postpone a v1.1**. Lanzá sin widget, validá retención, después invertí. El widget read-only (no interactive) lo podés hacer en 2-3 días con `react-native-targets` si querés algo desde día 1.

### 4. ¿Manifiesto Wrapped v1.0 o post-launch?

Vehículo #1 de growth viral. ~$300-500 design + 5-7 días dev.

**Recomendación:** **Wrapped post-launch (v1.1, 1 mes después)**. Necesitás 1 mes de data de usuarios reales para generar Wrapped útil. Mientras tanto, focus en launch.

### 5. ¿Latam expansion desde día 1 o solo AR?

**Recomendación:** **Solo es-AR en v1.0**. Validás con tu mercado natural, después expandís. Cada locale es mantenimiento.

---

## 📅 Sprint plan resumido (12 semanas)

| Semana | Foco | Output esperado |
|--------|------|-----------------|
| **W0** | Setup servicios + decisiones | Domain, RevenueCat account, Sentry/PostHog projects, Privacy/Terms drafted |
| **W1** | Showstoppers core | Delete Account + Apple Sign-In + Privacy wired |
| **W2** | Showstoppers polish + observability | Password reset, permission priming, Sentry+PostHog live |
| **W3** | Monetization backend | Schema, RevenueCat SDK, webhook |
| **W4** | Monetization product | useBilling real, feature gates, soft paywalls, RLS |
| **W5** | Engagement core | Streaks, notes, search, daily recap |
| **W6** | Engagement + AI Coach | AI Coach UX, reactions, walkthrough, mark-paid celebrations |
| **W7** | ASO content | Screenshots, video, listing copy |
| **W8** | Pre-submit + TestFlight | Privacy label, full QA, internal testing |
| **W9** | Submit + Apple Review | Submit, iterate on Apple feedback |
| **W10** | Quality hardening | Schema hygiene, RLS fix, CI/CD automation |
| **W11** | Crons + backups + monitoring | Production-grade ops |
| **W12** | 🚀 **PUBLIC LAUNCH** | Manifiesto live en App Store AR |
| **W13-16** | Post-launch monitoring + iteration | Bug fixes, hot fixes via OTA, listen to reviews |
| **W17+** | Wrapped, Widget, OCR, expansion | v1.1, v1.2 con differentiators |

---

## 🚦 Definition of Done — Launch readiness

Antes de tirar el switch de "público":

### Producto
- [ ] Onboarding tested con 5+ usuarios reales fuera del equipo
- [ ] Activation rate (signup → primer gasto) > 50% en TestFlight
- [ ] Cero crashes detectados en TestFlight de 7+ días
- [ ] Performance: cold start < 2s en iPhone 12 ó superior
- [ ] Paywall trigger tests pasaron en sandbox

### Compliance
- [ ] Delete Account funcional
- [ ] Apple Sign-In en login + signup
- [ ] Privacy Policy + Terms accesibles
- [ ] App Privacy nutrition label completo
- [ ] Encryption export compliance declared

### Monetization
- [ ] RevenueCat sandbox tested
- [ ] 6 entry points de paywall verificados
- [ ] Restore purchases funciona en device
- [ ] Trial start/end probados
- [ ] Cancel flow visible y funcional

### Quality
- [ ] Sentry capturando production crashes
- [ ] PostHog tracking funnels críticos
- [ ] Uptime monitoring active
- [ ] Backup strategy tested
- [ ] Rollback runbook documented

### ASO
- [ ] Listing completo en App Store Connect
- [ ] Screenshots 6.7" subidas
- [ ] App Preview Video (opcional pero recomendado)
- [ ] Keywords optimizadas
- [ ] Support URL funcional
- [ ] Submission notes con demo credentials

### Operations
- [ ] CI builds passing en main
- [ ] EAS Update OTA configurado
- [ ] Feature flags infra ready
- [ ] Support email monitored
- [ ] Status page público live

---

## 🔗 Cómo usar este roadmap día a día

1. Cada sprint, mirá `06-master-roadmap/sprint-plan.md` para qué tasks tocan
2. Buscá la task en la sección correspondiente (01-05)
3. Lee `roadmap.md` de esa sección para pasos detallados
4. Implementás, cambiás estado a 🟡
5. Al cerrar, marcás ✅ con commit hash en el README de la sección
6. Si encontrás algo que falta, agregá al doc + actualizá master roadmap
7. Weekly: revisar status board macro acá

---

**Próximos docs en esta carpeta:**
- `sprint-plan.md` — desglose detallado semana-por-semana
- `budget-summary.md` — todo el dinero consolidado
- `dependency-graph.md` — qué se hace antes/después y por qué
- `kpis.md` — métricas para saber si vamos bien
