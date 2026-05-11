# 06 · Sprint plan detallado

> 12 semanas de Manifiesto desde "0 estructura productiva" hasta "live en App Store con monetización". Asume 1 dev senior full-time. Si es part-time, multiplicá por 2-3x.

---

## Sprint 0 — Setup (Semana 0, 5 días)

### Decisiones de producto a cerrar
- [ ] IAP día 1 o post-launch — **rec: día 1**
- [ ] AI Coach en v1.0 — **rec: sí**
- [ ] Widget — **rec: postpone v1.1**
- [ ] Wrapped — **rec: post-launch v1.1**
- [ ] es-MX/ES/CO — **rec: solo AR día 1**

### Servicios externos a crear
- [ ] Domain `manifiesto.app` registrado
- [ ] Vercel/Netlify/Cloudflare Pages para landing
- [ ] Email forwarding `soporte@manifiesto.app`
- [ ] RevenueCat account + project
- [ ] Sentry account + iOS project
- [ ] PostHog Cloud account
- [ ] BetterUptime account
- [ ] R2/B2 bucket para backups

### Legales
- [ ] Borrador Privacy Policy (usar iubenda o redactor)
- [ ] Borrador Terms of Service
- [ ] Hosting de ambos en URLs estables

### Tooling
- [ ] Confirmar Apple Developer Program activo
- [ ] Confirmar EAS project ID OK (ya está en `app.config.ts`)
- [ ] Probar `eas build --profile preview` exitoso
- [ ] Acceso a App Store Connect

**Hitos:** todos los servicios listos para que el dev no se bloquee la semana 1.

---

## Sprint 1 — Showstoppers core (Semana 1, 5 días)

### Tasks
- **L** TASK 1.1 Delete Account flow — backend + UI (1.5 días)
- **M** TASK 1.2 Apple Sign-In en login (4h)
- **M-Mi** TASK 1.3a Privacy + Terms hosteados (1 día)
- **Mi-J** TASK 1.3b Cablear links in-app (4h)
- **J** TASK 1.8 Eliminar `subscriptions-zombie` (30 min)
- **J-V** TASK 1.10 + 1.11 Version display + Support email (2h)

### Hitos
- Submit fake a TestFlight Internal pasa sin warnings de compliance
- Delete Account flow probado end-to-end
- Apple Sign-In funciona en login + signup

---

## Sprint 2 — Showstoppers polish + observability (Semana 2, 5 días)

### Tasks
- **L** TASK 1.4 Password reset flow (1 día)
- **M** TASK 1.5 Permission priming en onboarding (1 día)
- **Mi** TASK 1.6 Sentry wired + sourcemap upload (4h)
- **Mi** TASK 1.12 Email confirmation resend (4h)
- **J** TASK 1.7 PostHog wired + funnels iniciales (1 día)
- **V** TASK 1.13 + 1.17 + 1.18 Auth callback timeout + privacy disclosure (4h)
- **V** TASK 5.15 Typed telemetry events (refactor mínimo, 4h)

### Hitos
- Sentry capturando crashes en build dev
- PostHog rastreando primeros eventos
- Password reset funciona end-to-end
- Email confirmation con resend
- Sección 01 ✅ DONE

---

## Sprint 3 — Monetization backend (Semana 3, 5 días)

### Tasks
- **L** TASK 3.1 + 3.2 Schema migrations (subscriptions, billing_receipts) (4h)
- **L-M** TASK 3.3 RevenueCat setup + App Store Connect products (1 día full)
- **M-Mi** TASK 3.4 + 3.5 SDK wired + useBilling real (2 días)
- **J** TASK 3.6 Webhook edge function (1 día)
- **V** TASK 3.7 + 3.8 Cron trial expiry + Entitlement RLS (1 día)

### Hitos
- Compra sandbox iOS → entitlement detectado en app
- Webhook escribe en `subscriptions` correctamente
- Free user con 6 fijos NO puede crear el 7° (RLS bloquea)

---

## Sprint 4 — Monetization product (Semana 4, 5 días)

### Tasks
- **L** TASK 3.10 + 3.11 Tiers definitivos + feature gates client (2 días)
- **Mi** TASK 3.12 Soft paywall sheets en 6 entry points (1 día)
- **J** TASK 3.13 + 3.14 + 3.21 Hard limits + member cap (4h)
- **J** TASK 3.15 + 3.16 Paywall revamp + trial UX (1 día)
- **V** TASK 3.17 + 3.18 + 3.9 Trial banner + expiry push + Restore real (1 día)

### Hitos
- Los 6 soft paywalls funcionan
- Trial countdown banner visible cuando aplica
- Restore purchases funciona en device físico
- Sección 03 ✅ DONE (excepto items secundarios 3.20-3.25)

---

## Sprint 5 — Engagement core (Semana 5, 5 días)

### Tasks
- **L-M** TASK 2.1 Streaks UI + persistencia (DB table + RPC + UI) (2 días)
- **Mi** TASK 2.24 Streak at-risk alarm (4h)
- **Mi** TASK 2.5 Notes column en gastos + UI (1 día spread)
- **J** TASK 2.22 Search en historial (1 día)
- **V** TASK 2.6 Reactions tabla + UI + push (2 días, sigue en W6)

### Hitos
- Home muestra streak prominente
- Notes funciona end-to-end
- Search ok en lista grande de gastos

---

## Sprint 6 — Engagement + AI Coach (Semana 6, 5 días)

### Tasks
- **L** Cerrar TASK 2.6 Reactions
- **M-Mi** TASK 2.17 AI Coach UX (input + sheet de respuesta + caching + gating) (3 días)
- **J** TASK 2.16 Smart categorization (LLM call) (1 día)
- **J** TASK 2.19 Daily closure recap push (1 día)
- **V** TASK 2.20 + 2.23 Mark-paid celebrations + first-expense walkthrough (1 día)

### Hitos
- AI Coach responde questions reales con context de la familia
- Free user gated después de 5 queries
- Daily recap programado correctamente
- Sección 02 fase 1-3 ✅ DONE

---

## Sprint 7 — ASO content (Semana 7, 5 días)

### Tasks
- **L** TASK 4.1-4.6 Metadata textual en App Store Connect (1 día)
- **L** TASK 4.13-4.18 Categorización + privacy label + encryption (4h)
- **M-Mi** TASK 4.8 + 4.9 Screenshots 6.7" + 6.5" (2-3 días Figma)
- **J** TASK 4.11 App Preview Video (1 día DIY)
- **V** TASK 4.19 + 4.12 Support URL + marketing imagery (1 día)

### Hitos
- App Store Connect listing 100% completo (excepto build)
- Screenshots production-ready subidas
- Video subido (si llegamos)
- Sección 04 ✅ DONE para v1.0

---

## Sprint 8 — Pre-submit + TestFlight (Semana 8, 5 días)

### Tasks
- **L-M** Full QA matrix en sandbox: signup → trial → purchase → cancel → restore (2 días)
- **Mi** TASK 1.9 Cualquier asset faltante final (medio día)
- **Mi** Sumar 3-5 testers externos a TestFlight (Family + friends)
- **J** Iterate basado en feedback de testers
- **V** Submit final a TestFlight Production + preparar Apple Review

### Hitos
- TestFlight build estable 24h sin crashes
- 3-5 testers reportan flow completo OK
- App Store Connect listing finalizado y ready to submit

---

## Sprint 9 — Apple Review (Semana 9, 5 días — pero mayormente esperando)

### Tasks
- **L** Submit a Apple App Review
- **M-J** Esperar review (típicamente 24-48h)
- **J** Si rechazo: iterate + resubmit
- **V** Si aprobado: schedule release "Manual"

### Mientras esperás
- TASK 5.27 RLS expense edit/delete fix (4h, urgente)
- TASK 5.26 Audit log table (1 día)

### Hitos
- App **APROBADA** por Apple
- Pero no released aún (Manual release)

---

## Sprint 10 — Quality hardening (Semana 10, 5 días)

### Tasks
- **L** TASK 5.28 + 5.29 + 5.30 user_settings + invitations + devices tables (2 días)
- **Mi** TASK 5.16 + 5.17 + 5.18 EAS Build automation + TestFlight auto-submit (1 día)
- **J** TASK 5.19 + 5.20 + 5.21 Tests en CI + sourcemap auto (1 día)
- **V** TASK 5.31 + 5.32 + 5.33 Crons de recurring + recap + cleanup (1 día)

### Hitos
- CI completo (lint + typecheck + tests + build + sourcemap)
- Crons productivos corriendo
- Schema preparado para escalabilidad

---

## Sprint 11 — Production ops (Semana 11, 5 días)

### Tasks
- **L** TASK 5.34 + 5.12 Backup strategy + uptime monitoring (1 día)
- **M** TASK 5.23 + 5.24 EAS Update OTA + Feature flags PostHog (1 día)
- **Mi** TASK 5.25 Rollback runbook documentado (4h)
- **Mi** TASK 5.35 + 5.38 Rate limiting + re-auth destructive (1 día)
- **J-V** Buffer + final smoke tests + comunicación de launch

### Hitos
- Backups corriendo nightly
- OTA configurado y testeado en TestFlight
- Runbooks de emergencia documentados

---

## Sprint 12 — 🚀 PUBLIC LAUNCH (Semana 12, 5 días)

### Tasks

**Lunes — Launch day:**
- 9:00 — Press "Release this version" en App Store Connect
- 10:00 — Validar disponibilidad en App Store AR
- 10:30 — Post de launch en redes (Twitter, LinkedIn, Instagram)
- 11:00 — Email a beta testers + amigos: "Manifiesto está afuera"
- 12:00 — Monitor PostHog + Sentry primeras horas

**Martes-Jueves:**
- Respond a primeras reviews
- Monitor crashes Sentry agressively
- Fix issues críticos vía OTA si aparecen
- Engage on social

**Viernes — Retrospectiva:**
- Métricas de semana 1: installs, signups, activation, retention D1
- Identificar top 3 issues reportados
- Plan para Sprint 13 basado en datos reales

### Hitos
- 🎉 Manifiesto LIVE en App Store
- Primeros 100+ usuarios reales onboarded
- 0 crashes críticos sin tracking

---

## Sprint 13-16 — Post-launch stabilization (Mes 4)

### Foco
- **Bug fixes** basados en Sentry + reviews
- **Hot fixes** vía EAS Update OTA
- **Iterate** UX según data de PostHog
- **Respond** a 100% de reviews
- **Capture** quotes para marketing

### Possible items según data
- Si activation < 50% → revisar onboarding
- Si trial conversion < 20% → revisar paywall copy
- Si churn > 10% → revisar value delivery semana 1
- Si AI Coach undesued → revisar entry points

---

## Sprint 17-20 — Differentiators v1.1 (Mes 5)

### Tasks foco
- TASK 2.4 Manifiesto Wrapped (1 semana)
- TASK 2.7 + 2.8 iOS Widget (contractor o aprender) (1-2 semanas)
- TASK 2.15 OCR receipt (3-5 días)
- TASK 4.29 Apple Search Ads activate (1 semana setup + ongoing)

### Hitos
- v1.1 release con Wrapped + Widget
- ASA generando installs ROI > 2x
- Primer mes con MRR > $100

---

## Sprint 21-24 — Latam expansion v1.2 (Mes 6)

### Tasks
- TASK 4.21-4.24 Localización es-MX + es-ES + es-CO (1 semana)
- Soft launch in MX o ES
- TASK 2.10 Live Activity (1 semana)
- TASK 2.9 Siri Shortcuts (1 semana)
- TASK 2.11 Share Extension (1 semana)

### Hitos
- v1.2 release con Latam reach
- Primer mes con MRR > $500

---

## Sprint 25+ — Scale (Mes 7+)

### Possibly
- TASK 2.12 Apple Watch
- TASK 2.2 Achievements gallery
- TASK 5.39 2FA opt-in
- TASK 3.22-3.25 Revenue streams secundarios
- TASK 4.25 + i18n in-app English version
- Android port (v2.0)

---

## ⚠️ Riesgo principal: scope creep

Mantener disciplina. Si una task se está demorando > 50% del estimado, **time-box y postpone**. Mejor lanzar v1.0 sin algo y agregarlo en v1.1 que delayear el launch un mes.

**Mantra:** "Better launched than perfect."

---

## 🎯 Trigger points para acelerar/desacelerar

### Aceleramos (sprintar):
- Sentry detecta crash blocker post-launch
- Apple Review request specific change
- Competidor copia un feature

### Desaceleramos (postpone):
- Retención D7 < 15% → focus on retention, no en features
- Conversion trial→paid < 10% → focus on paywall, no en features
- Costos AI > 2x lo planeado → cap o downgrade modelo

---

**Próximo doc:** `budget-summary.md`.
