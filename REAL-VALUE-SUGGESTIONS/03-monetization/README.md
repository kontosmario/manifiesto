# 03 · Monetization

> ## ⏸️ SKIPPED — decisión del owner 2026-05-11
>
> El owner decidió **postponer la monetización entera** para esta fase. Razón concreta: RevenueCat requiere productos IAP en App Store Connect, que requiere Apple Developer Program ($99/año), que el owner no quiere comprometer todavía.
>
> **Todo lo de abajo queda en "TO DO" hasta que el owner reabra la decisión.** Reabrir cuando:
> 1. El owner haya comprado Apple Developer Program ($99/año), Y
> 2. Tenga claridad de pricing (tiers, monthly/annual, precios), Y
> 3. Confirme tasa de adopción esperada que justifique invertir 2 semanas de dev.
>
> Mientras tanto, `useBilling` sigue siendo mock (no rompe nada; la UI de billing se ve pero no procesa cobros reales).
>
> ---

> Estado original: **infraestructura scaffolded, integración 0%, paywall 0%**. La UI de billing está pulida (`billing-screen.tsx` 1110 líneas, plans definidos, FAQ, trial badge), pero `useBilling` es 100% mock. Ningún feature está gated. Esta sección es la diferencia entre lanzar como freeware o como SaaS.

📂 **Documentos:**
- `audit.md` — estado actual de billing + propuesta de tiers
- `roadmap.md` — paso-a-paso para activar IAP real
- `budget.md` — RevenueCat, Anthropic, costos transaccionales

---

## 📊 Status board

### Backend / Infra

| # | Item | Estado | Crítico | Esfuerzo |
|---|------|--------|---------|----------|
| 3.1 | Tabla `subscriptions` en DB | 🔴 TO DO | ⛔ blocker | 4h |
| 3.2 | Tabla `billing_receipts` (audit log de transacciones) | 🔴 TO DO | ⛔ blocker | 2h |
| 3.3 | RevenueCat account + product IDs registrados | 🔴 TO DO | ⛔ blocker | 1 día setup |
| 3.4 | StoreKit / Google Play Billing wired | 🔴 TO DO | ⛔ blocker | 2 días |
| 3.5 | `useBilling` hook real (reemplazar mock) | 🔴 TO DO | ⛔ blocker | 1 día |
| 3.6 | App Store Server Notifications v2 webhook | 🔴 TO DO | ⛔ blocker | 1 día |
| 3.7 | Cron de trial expiry enforcement | 🔴 TO DO | crítico | 4h |
| 3.8 | Entitlement RLS policies | 🔴 TO DO | crítico | 1 día |
| 3.9 | Restore Purchases real (hoy stub) | 🔴 TO DO | crítico | 2h |

### Producto / Paywall

| # | Item | Estado | Esfuerzo |
|---|------|--------|----------|
| 3.10 | Definir tiers FREE / PRO / FAMILY+ | 🟡 PARTIAL (Pro existe) | — |
| 3.11 | Feature gates implementados (Free vs Pro) | 🔴 TO DO | 2 días |
| 3.12 | Soft paywall triggers (3 entry points) | 🔴 TO DO | 1 día |
| 3.13 | Hard limit FREE: gastos fijos = 5 | 🔴 TO DO | 2h |
| 3.14 | Hard limit FREE: historial 3 meses | 🔴 TO DO | 2h |
| 3.15 | Paywall full-screen con value comparison | 🟡 PARTIAL (billing-screen existe pero falta gating UX) | 1 día |
| 3.16 | Free trial logic real (14 días, sin tarjeta) | 🔴 TO DO | 1 día |
| 3.17 | Trial countdown banner en Home | 🔴 TO DO | 4h |
| 3.18 | Trial expiry email / push | 🔴 TO DO | 1 día |
| 3.19 | Cancel flow in-app (deep link) | 🟡 PARTIAL (existe en billing-screen) | — |
| 3.20 | Win-back para usuarios que cancelaron | 🔴 TO DO | 1 día |
| 3.21 | Family plan: member cap enforcement | 🔴 TO DO | 4h |

### Revenue streams adicionales

| # | Item | Estado | Esfuerzo |
|---|------|--------|----------|
| 3.22 | One-time IAP: Manifiesto Wrapped premium download | 🔴 TO DO | 1 día |
| 3.23 | Affiliate cuentas remuneradas (Naranja X, Brubank, MP) | 🔴 TO DO | Negociación |
| 3.24 | B2B2C licencias a asesores financieros | 🔴 TO DO | Estrategia |
| 3.25 | Gift subscription (regalar Pro a otra familia) | 🔴 TO DO | 2 días |

---

## 🎯 Estrategia de tiers propuesta

```
┌─────────────────────────────────────────────────────────┐
│ FREE (Hogar Básico)            $0                       │
│   • 2 miembros máx                                      │
│   • Gastos variables ilimitados                         │
│   • Hasta 5 gastos fijos                                │
│   • Historial 3 meses                                   │
│   • Control sólo "Hoy"                                  │
│   • Notificaciones push básicas                         │
│   • 5 queries AI Coach/mes                              │
├─────────────────────────────────────────────────────────┤
│ PRO (Hogar Pro)              $4.99/mes · $39.99/año     │
│   • 6 miembros máx                                      │
│   • Gastos fijos ilimitados                             │
│   • Historial completo + export CSV/PDF                 │
│   • Control completo (Hoy + Plan + Meses)               │
│   • AI Coach ilimitado                                  │
│   • OCR de tickets ilimitado                            │
│   • Widget + Live Activity + Watch                      │
│   • Notificaciones avanzadas (quiet hours, smart)       │
│   • Multi-currency (no solo USD/ARS)                    │
│   • Manifiesto Wrapped mensual                          │
│   • 14 días free trial                                  │
├─────────────────────────────────────────────────────────┤
│ FAMILY+ (Hogar Extendido)    $79.99/año                 │
│   • 10 miembros + roles (admin/viewer/contributor)      │
│   • Sub-presupuestos por miembro                        │
│   • Reportes anuales personalizados                     │
│   • Manifiesto Wrapped Year edition                     │
│   • Soporte prioritario (24h response)                  │
│   • Early access features                               │
│   • Anniversary badge                                   │
└─────────────────────────────────────────────────────────┘
```

---

## 🚦 DoD de la sección

Antes de activar IAP en producción:
- [ ] Subscriptions table + receipts table en DB
- [ ] RevenueCat configurado en sandbox + production
- [ ] Webhook recibe Server Notifications v2
- [ ] RLS gates funcionan (free user no puede leer historial > 3 meses)
- [ ] Restore purchases probado en device real
- [ ] Trial start/end/cancel probado en sandbox
- [ ] Cancel desde App Store reflejado en app en < 1h
- [ ] Apple App Review: app explica claramente qué cubre la suscripción

---

## 🔗 Cross-refs

- AI Coach (su valor justifica el upgrade) → `../02-engagement-gaps/`
- Compliance de "Manage subscription" en Settings → `../01-showstoppers-ios/`
- App Store Review pitfalls de suscripciones → `../04-aso/`
