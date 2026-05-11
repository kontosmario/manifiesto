# 01 · Showstoppers iOS

> Items que **bloquean el submit a App Store** o tienen alta probabilidad de generar rechazo en App Review. Resolver TODOS antes de mandar la build a TestFlight Production.

📂 **Documentos:**
- `audit.md` — hallazgos detallados con file paths + line numbers
- `roadmap.md` — pasos concretos de implementación
- `budget.md` — items con costo monetario 💰

---

## 📊 Status board

| # | Item | Estado | Apple Guideline | Esfuerzo | 💰 |
|---|------|--------|-----------------|----------|-----|
| 1.1 | Delete Account flow | 🔴 TO DO | 5.1.1(v) | 1-2 días | — |
| 1.2 | Apple Sign-In en LOGIN (no solo signup) | 🔴 TO DO | 4.8 | 4h | — |
| 1.3 | Privacy Policy + Terms hosteados + URLs clickeables | 🔴 TO DO | 5.1.1(i) | 1 día | 💰 hosting |
| 1.4 | Password reset / "Olvidé contraseña" | 🔴 TO DO | UX standard | 1 día | — |
| 1.5 | Onboarding: permission priming (push, biometric) | 🔴 TO DO | App Review pattern | 1 día | — |
| 1.6 | Crash reporting (Sentry) wired | 🔴 TO DO | Best practice | 4h | 💰 Sentry plan |
| 1.7 | Analytics externo (PostHog/Amplitude) | 🔴 TO DO | Best practice | 1 día | 💰 plan |
| 1.8 | Eliminar `subscriptions-zombie` folder | 🔴 TO DO | App Review hygiene | 30 min | — |
| 1.9 | App Store assets (screenshots + preview) | 🔴 TO DO | Submit requirement | 2-3 días | 💰 design/tools |
| 1.10 | Version/About info en Settings | 🔴 TO DO | Submit hygiene | 1h | — |
| 1.11 | Contact/Support link | 🔴 TO DO | 1.5 | 1h | 💰 email/inbox |
| 1.12 | Email confirmation: resend button + timeout | 🔴 TO DO | UX | 4h | — |
| 1.13 | Auth callback timeout + retry | 🔴 TO DO | UX | 2h | — |
| 1.14 | Push subscription deep-link en Settings global | 🟡 PARTIAL (solo en billing) | 3.1.2 | 30 min | — |
| 1.15 | `dev-health` ya gated a `__DEV__` | ✅ DONE | — | — | — |
| 1.16 | Manage Subscription deep link (cuando IAP esté live) | 🟡 PARTIAL | 3.1.2 | — | — |
| 1.17 | Data deletion confirmation copy (GDPR/CCPA framing) | 🔴 TO DO | Privacy | 2h | — |
| 1.18 | First-time-launch privacy disclosure | 🔴 TO DO | App Review | 2h | — |

---

## 🚦 Definition of Done (DoD) para esta sección

Antes de marcar la sección como ✅:
- [ ] Todos los items 🔴 deben pasar a ✅ con commit hash + fecha
- [ ] Build TestFlight pasa sin warnings de Apple
- [ ] Internal QA confirma flujo completo de Delete Account → re-signup funciona
- [ ] Privacy Policy + Terms accesibles desde Welcome + Signup + Settings
- [ ] Sentry capturando crash de test en producción

---

## 🔗 Cross-refs

- Receipt validation / IAP infrastructure → `../03-monetization/`
- Crashes + telemetry detalle → `../05-quality-readiness/`
- Screenshots optimizados → `../04-aso/`
