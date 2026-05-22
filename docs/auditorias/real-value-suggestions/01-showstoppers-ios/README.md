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
| 1.1 | Delete Account flow | ✅ DONE (2026-05-11) | 5.1.1(v) | 1-2 días | — |
| 1.2 | Apple Sign-In en LOGIN (no solo signup) | ✅ DONE (2026-05-11) | 4.8 | 4h | — |
| 1.3 | Privacy Policy + Terms hosteados + URLs clickeables | 🟡 PARTIAL — UI wired (2026-05-11), URLs `manifiesto.app/privacy` y `/terms` faltan hostear | 5.1.1(i) | 1 día | 💰 hosting |
| 1.4 | Password reset / "Olvidé contraseña" | ✅ DONE (2026-05-11) | UX standard | 1 día | — |
| 1.5 | Onboarding: permission priming (push, biometric) | 🟡 PARTIAL — Settings tiene priming contextual; full onboarding-step priming deferred (cruza feature-complete) | App Review pattern | 1 día | — |
| 1.6 | Crash reporting (Sentry) wired | ⏸️ SKIPPED (decisión owner 2026-05-11) — postpuesto a post-launch | Best practice | 4h | 💰 Sentry plan |
| 1.7 | Analytics externo (PostHog/Amplitude) | ⏸️ SKIPPED (decisión owner 2026-05-11) — postpuesto a post-launch | Best practice | 1 día | 💰 plan |
| 1.8 | ~~Eliminar `subscriptions-zombie` folder~~ | ⚠️ AUDIT ERROR (no aplica) | — | — | — |
| 1.9 | App Store assets (screenshots + preview) | 🔴 TO DO — bucket separado (`04-aso/`) | Submit requirement | 2-3 días | 💰 design/tools |
| 1.10 | Version/About info en Settings | ✅ DONE (2026-05-11) | Submit hygiene | 1h | — |
| 1.11 | Contact/Support link | ✅ DONE (2026-05-11) — falta confirmar inbox `soporte@manifiesto.app` | 1.5 | 1h | 💰 email/inbox |
| 1.12 | Email confirmation: resend button + timeout | ✅ DONE (2026-05-11) | UX | 4h | — |
| 1.13 | Auth callback timeout + retry | ✅ DONE (2026-05-11) | UX | 2h | — |
| 1.14 | Push subscription deep-link en Settings global | 🟡 PARTIAL (solo en billing) | 3.1.2 | 30 min | — |
| 1.15 | `dev-health` ya gated a `__DEV__` | ✅ DONE | — | — | — |
| 1.16 | Manage Subscription deep link (cuando IAP esté live) | 🟡 PARTIAL | 3.1.2 | — | — |
| 1.17 | Data deletion confirmation copy (GDPR/CCPA framing) | ✅ DONE (2026-05-11) — incluida en DeleteAccountConfirmSheet | Privacy | 2h | — |
| 1.18 | First-time-launch privacy disclosure | ✅ DONE (2026-05-11) — línea sobre datos en welcome + link a Privacy | App Review | 2h | — |

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
