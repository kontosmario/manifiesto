# 06 · Dependency graph

> Qué bloquea a qué. Si saltás un nodo, lo que viene después no funciona o se rompe.

---

## 🌐 Vista macro

```
                 ┌──────────────────┐
                 │ Domain registered│
                 └────────┬─────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
       ┌─────────────┐         ┌──────────────┐
       │ Hosting     │         │ Email        │
       │ landing     │         │ soporte@     │
       └──────┬──────┘         └──────┬───────┘
              │                       │
              ▼                       │
       ┌─────────────┐                │
       │ Privacy +   │                │
       │ Terms hosted│                │
       └──────┬──────┘                │
              │                       │
              ▼                       ▼
       ┌───────────────────────────────────┐
       │ SHOWSTOPPERS 01 ALL items wired   │
       │ (Delete acc, Apple SI, Privacy)   │
       └────────────────┬──────────────────┘
                        │
                        ▼
           ┌────────────────────────┐
           │ Sentry + PostHog live  │
           └────────┬───────────────┘
                    │
                    ▼
       ┌────────────────────────────┐
       │ RevenueCat configured      │
       │ + Apple Store Connect SKUs │
       └────────────┬───────────────┘
                    │
       ┌────────────┼─────────────┐
       ▼            ▼             ▼
┌─────────────┐ ┌─────────┐ ┌──────────────┐
│ Schema DB   │ │ SDK     │ │ Webhook      │
│ subs+receipts│ │ wired   │ │ edge function│
└──────┬──────┘ └────┬────┘ └──────┬───────┘
       │             │             │
       └─────────────┴─────────────┘
                     │
                     ▼
        ┌───────────────────────┐
        │ Feature gates client  │
        │ + RLS server          │
        └──────────┬────────────┘
                   │
       ┌───────────┴────────────┐
       ▼                        ▼
┌────────────┐         ┌──────────────────┐
│ Soft       │         │ Engagement       │
│ paywalls   │         │ features         │
│ in product │         │ (streaks, etc)   │
└──────┬─────┘         └────────┬─────────┘
       │                        │
       └────────┬───────────────┘
                ▼
       ┌────────────────────┐
       │ AI Coach UX wired  │
       │ (backend ya OK)    │
       └────────┬───────────┘
                │
                ▼
       ┌────────────────────────┐
       │ ASO content + listing  │
       │ + screenshots + video  │
       └────────────┬───────────┘
                    │
                    ▼
       ┌────────────────────────┐
       │ App Store submission   │
       └────────────┬───────────┘
                    │
                    ▼
       ┌────────────────────────┐
       │ Apple Review APPROVED  │
       └────────────┬───────────┘
                    │
                    ▼
       ┌────────────────────────┐
       │ Schema hygiene         │
       │ (audit_log, etc.)      │
       └────────────┬───────────┘
                    │
                    ▼
       ┌────────────────────────┐
       │ CI/CD automation       │
       └────────────┬───────────┘
                    │
                    ▼
       ┌────────────────────────┐
       │ Crons + backups        │
       └────────────┬───────────┘
                    │
                    ▼
              🚀 PUBLIC LAUNCH
```

---

## 🔗 Dependencias críticas explicadas

### ⛔ Hard blockers — NO podés submitear sin esto

1. **Domain + hosting** → Privacy/Terms URLs no funcionan
2. **Privacy + Terms hosteados** → Apple requiere URL en App Store Connect
3. **Delete Account flow** → Apple rechaza 5.1.1(v) sin esto
4. **Apple Sign-In en login** → Apple rechaza 4.8 sin paridad
5. **App Store Connect IAP products configurados** → RevenueCat no puede testear
6. **RevenueCat configured** → useBilling no puede ser real
7. **Schema subscriptions table** → webhook no tiene dónde escribir
8. **Webhook deployed** → entitlement nunca se sincroniza
9. **RLS entitlement gating** → free users acceden a Pro features
10. **Screenshots subidas** → no podés clickar Submit en App Store Connect
11. **Privacy nutrition label completo** → no podés Submit

### 🔶 Soft blockers — podés submitear pero te rechazan o crash

12. **Sentry wired** → estás ciego post-launch a crashes
13. **PostHog wired** → no podés iterar basado en datos
14. **Restore Purchases real** → Apple rechaza si stub
15. **Manage Subscription deep link** → Apple rechaza si no visible
16. **Permission priming en onboarding** → Apple Review pide review notes detalladas
17. **Email confirmation resend** → bounce rate matarrá tu activation

### ⚡ Performance blockers — funcionan pero matan UX

18. **Cron recurring expense generator** → fijos se "atrasan" misteriosamente
19. **Push subscription cleanup** → bloat en DB
20. **Backup strategy** → cualquier disaster = data loss
21. **OTA Updates configurado** → no podés fix hot bugs post-launch

---

## 📋 Matrix de dependencias por sección

### Sección 01 (Showstoppers iOS)

| Item | Depende de | Bloquea a |
|------|------------|-----------|
| Delete Account | Schema (profiles.deletion_requested_at) + edge function | Submit App Store |
| Apple Sign-In login | Auth SDK | Submit App Store (4.8) |
| Privacy/Terms wired | Hosting + URLs | Submit App Store (5.1.1.i) |
| Password reset | Supabase email templates | Activation flow completion |
| Sentry | Sentry account + sourcemap secret | Visibility post-launch |
| PostHog | PostHog account + API key | Funnel analysis |
| Permission priming | Onboarding flow refactor | Push opt-in rates |

### Sección 02 (Engagement gaps)

| Item | Depende de | Bloquea a |
|------|------------|-----------|
| Streaks UI persistido | Schema `user_streaks` | Streak at-risk alarm + Wrapped data |
| Reactions | Schema `expense_reactions` | Family engagement loop |
| AI Coach UX | Sección 01 (PostHog), backend `control-advisor` (ya wired) | Differentiator + paywall trigger |
| Smart categorization | AI Coach infra | OCR autocomplete |
| OCR | `expenses.receipt_url` column + Camera permission | Reducir fricción de carga |
| iOS Widget | Swift/WidgetKit expertise o contractor | Lock screen + Live Activity |
| Wrapped | Monthly recap data + design plantillas | Viralidad orgánica |

### Sección 03 (Monetization)

| Item | Depende de | Bloquea a |
|------|------------|-----------|
| Schema subscriptions | Migration capability | Todo el resto de 03 |
| RevenueCat setup | App Store Connect IAP products | SDK wiring |
| useBilling real | RevenueCat SDK | Feature gates client |
| Webhook | RevenueCat configurado | Server sync of entitlements |
| Entitlement RLS | Schema subscriptions | Backend gating de Pro features |
| Feature gates client | useBilling real + RLS | Soft paywalls funcionar |
| Soft paywalls | Feature gates | Conversion del Pro tier |
| Trial flow | RevenueCat configurado + Apple promo offers | Conversion sin tarjeta |
| Restore Purchases real | useBilling real | Apple App Review approval |

### Sección 04 (ASO)

| Item | Depende de | Bloquea a |
|------|------------|-----------|
| Listing copy + keywords | Decisiones de positioning | Submit App Store |
| Screenshots | Dev build estable + datos demo bonitos | Submit App Store |
| App Preview Video | Screen recording flow estable | App Store Connect upload |
| Privacy nutrition label | Privacy Policy redactada + cómo se usan los datos clarísimo | Submit App Store |
| ASA campaigns | App publicada + base orgánica medida | Growth post-launch |

### Sección 05 (Quality)

| Item | Depende de | Bloquea a |
|------|------------|-----------|
| EAS Build CI | EAS account + Apple credentials | Velocity del equipo |
| Sourcemap upload | Sentry + EAS hook | Stack traces útiles |
| Cron recurring fixed | Schema sin gaps + edge function | Fijos productivos |
| Cron monthly recap | Schema `monthly_wrapped` table | Wrapped data ready |
| Audit log | Schema `audit_log` | Compliance + family-admin features |
| RLS expense edit/delete fix | Decisión de producto sobre quién edita | Security score |
| Backup test | R2 bucket configurado | Confianza operativa |

---

## ⚠️ Ciclos peligrosos (evitar)

### Ciclo 1: AI Coach circular dependency

```
AI Coach UX (sec 02) ──depends on──> Feature gates (sec 03) ──depends on──>
PostHog tracking (sec 01) ──to log AI usage──> AI Coach UX
```

**Resolución:** PostHog primero, después Feature gates, después AI Coach UX. Orden estricto.

### Ciclo 2: Onboarding metrics paradox

```
Permission priming onboarding (sec 01) ──improves──>
Push opt-in rate ──affects──>
Notifications strategy (sec 02) ──affects retention──>
ASA budget allocation (sec 04) ──needs PostHog data──> Onboarding metrics
```

**Resolución:** acepta que la primera versión de onboarding es "fly blind". Después de 2 semanas con data, iterás.

### Ciclo 3: Wrapped needs data, but needs Wrapped to attract users

```
Wrapped (sec 02) ──viralizes installs──>
More users ──provide more data──>
Better Wrapped content (loops)
```

**Resolución:** lanzá v1.0 sin Wrapped. Mes 2 ya tenés data. Wrapped en v1.1.

---

## 🚦 Paths críticos (longest dependency chains)

### Path crítico 1 — Submit-ready (8-10 semanas)

```
Domain (1 día)
  → Hosting (1 día)
  → Legal redacción (3-5 días)
  → Hosteados (1 día)
  → Privacy wired in-app (4h)
  → Showstoppers 01 cerrados (1 semana más)
  → ASO content prep (2 semanas)
  → Submit + Apple Review (1 semana)
```

### Path crítico 2 — IAP-ready (5-6 semanas)

```
Apple Developer activo (ya)
  → IAP products en App Store Connect (1 día)
  → RevenueCat configured (1 día)
  → Schema subs/receipts (4h)
  → SDK wired (2 días)
  → Webhook deployed (1 día)
  → Entitlement RLS (1 día)
  → Feature gates client (2 días)
  → Soft paywalls (1 día)
  → QA sandbox (1 semana)
```

### Path crítico 3 — AI Coach diferencial (3-4 semanas)

```
PostHog wired (1 día)
  → control-advisor backend (ya OK)
  → Client llama Edge function (1 día)
  → Sheet UI + caching (2 días)
  → Gating con feature gates (1 día — depende de path 2)
  → Prompt engineering + caching agresivo (2 días)
  → QA con familia real (1 semana)
```

---

## 💡 Cómo paralelizar

Si tenés 2-3 personas (vos + contractor) podés acelerar:

- **Persona 1 (backend/infra):** sección 01 backend + sección 03 backend + sección 05 schema
- **Persona 2 (frontend):** sección 01 UI + sección 02 + sección 03 client + sección 04 ASO content
- **Persona 3 (design):** sección 04 screenshots + sección 02 Wrapped assets

Paralelizando se reduce de 12 semanas a 6-8 semanas realista.

---

**Próximo doc:** `kpis.md`.
