# 05 · Quality & Readiness

> Estado: **tests + observabilidad + CI/CD necesitan inversión seria**. Sin esto, la app puede ser correcta pero el equipo va a vivir apagando incendios sin saber qué pasa.

📂 **Documentos:**
- `audit.md` — cobertura actual + gaps
- `roadmap.md` — qué cablear, en qué orden
- `budget.md` — herramientas + alternativas

---

## 📊 Status board

### Testing

| # | Item | Estado | Esfuerzo |
|---|------|--------|----------|
| 5.1 | Unit tests vitest (20 files actuales) | ✅ PARTIAL — buena base | — |
| 5.2 | E2E tests Playwright (4 files actuales) | 🟡 PARTIAL — auth scenarios cubiertos | — |
| 5.3 | Integration tests con Supabase test instance | 🔴 TO DO | 3 días |
| 5.4 | Billing flow e2e (mock → entitlement → gate) | 🔴 TO DO | 2 días |
| 5.5 | Push notification delivery e2e | 🔴 TO DO | 1 día |
| 5.6 | Visual regression tests | 🔴 TO DO | 2 días |
| 5.7 | Accessibility audit con VoiceOver | 🔴 TO DO | 2 días |
| 5.8 | Performance baseline (TTI, FPS, cold start) | 🔴 TO DO | 1 día |

### Observabilidad / Telemetry

| # | Item | Estado | Esfuerzo | 💰 |
|---|------|--------|----------|-----|
| 5.9 | Crash reporting (Sentry) | 🔴 TO DO | 4h | 💰 free→$26/mo |
| 5.10 | Product analytics (PostHog) | 🔴 TO DO | 1 día | 💰 free→$ |
| 5.11 | Performance monitoring (Sentry Perf ó Datadog) | 🔴 TO DO | 1 día | 💰 incluido |
| 5.12 | Backend uptime monitoring | 🔴 TO DO | 30 min | 💰 free tools |
| 5.13 | Edge function logs aggregation | 🔴 TO DO | 4h | 💰 logflare/axiom |
| 5.14 | Real-User Monitoring (RUM) | 🔴 TO DO | 1 día | 💰 incluido en Sentry/Datadog |
| 5.15 | Telemetry typed events (hoy son strings) | 🔴 TO DO | 1 día | — |

### CI/CD

| # | Item | Estado | Esfuerzo |
|---|------|--------|----------|
| 5.16 | EAS Build automation en CI | 🔴 TO DO | 1 día |
| 5.17 | TestFlight auto-submit en tag | 🔴 TO DO | 4h |
| 5.18 | Code signing automated (EAS Credentials) | 🔴 TO DO | 4h |
| 5.19 | Unit tests run en CI | 🟡 PARTIAL — lint+typecheck OK, no tests | 30min |
| 5.20 | E2E tests en CI | 🔴 TO DO | 1 día |
| 5.21 | Sourcemap upload auto (Sentry) | 🔴 TO DO | 4h |
| 5.22 | Migration safety check en PR | 🔴 TO DO | 2h |
| 5.23 | OTA Updates (EAS Update) configurado | 🔴 TO DO | 4h |
| 5.24 | Feature flags infra | 🔴 TO DO | 1 día |
| 5.25 | Rollback strategy documentada | 🔴 TO DO | 2h |

### Schema + Backend hygiene

| # | Item | Estado | Esfuerzo |
|---|------|--------|----------|
| 5.26 | Tabla `audit_log` para compliance | 🔴 TO DO | 1 día |
| 5.27 | RLS policy: expense update/delete by creator only | 🟡 GAP de seguridad encontrado | 2h |
| 5.28 | Tabla `user_settings` (separar de profile) | 🔴 TO DO | 2h |
| 5.29 | Tabla `invitations` (rastrear códigos) | 🔴 TO DO | 4h |
| 5.30 | Tabla `devices` / `user_sessions` para revocation | 🔴 TO DO | 1 día |
| 5.31 | Cron: recurring fixed expense generator | 🔴 TO DO | 1 día |
| 5.32 | Cron: monthly recap auto-generation | 🔴 TO DO | 4h |
| 5.33 | Push subscription cleanup automático | 🔴 TO DO | 4h |
| 5.34 | DB backup strategy + restore test | 🔴 TO DO | 4h |

### Security

| # | Item | Estado | Esfuerzo |
|---|------|--------|----------|
| 5.35 | Rate limiting en RPCs sensibles | 🟡 PARTIAL — solo push tiene | 1 día |
| 5.36 | Secrets management audit (no .env en repo) | ✅ probablemente OK | check |
| 5.37 | Supabase service_role usage audit | 🔴 TO DO | 4h |
| 5.38 | Re-auth para operaciones destructivas | 🔴 TO DO | 4h |
| 5.39 | 2FA opt-in | 🔴 TO DO | 1 día |

---

## 🎯 Top 5 ROI

1. **5.9 Sentry** — crash visibility = supervivencia
2. **5.10 PostHog** — entender users = decisiones informadas
3. **5.16 EAS Build automation** — velocity del equipo
4. **5.27 RLS expense update por creator** — fix de seguridad pendiente
5. **5.31 Cron recurring fixed expense generator** — feature implícito missing

---

## 🚦 DoD para esta sección

Antes de marcar 05 como ✅:
- [ ] Sentry capturando crashes en producción
- [ ] PostHog midiendo funnels
- [ ] CI build automation full (lint+test+e2e+build)
- [ ] EAS Update OTA wired
- [ ] RLS gaps de seguridad cerrados
- [ ] Crons de mantenimiento corriendo
- [ ] Backup + restore test exitoso
- [ ] At least 70% unit coverage de logic crítica (billing, expenses, fixed_expenses)

---

## 🔗 Cross-refs

- Sentry + PostHog también en `../01-showstoppers-ios/`
- Audit_log + subscriptions tables en `../03-monetization/`
- E2E tests del paywall en `../03-monetization/`
