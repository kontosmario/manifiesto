# 01 · Showstoppers iOS — Presupuesto requerido 💰

> Items que NO se pueden resolver sólo con tiempo de developer. Requieren servicio externo, licencia, o asesoría profesional.

---

## Tabla resumen

| # | Item | Tipo | Costo mensual | Costo one-time | Alternativa free |
|---|------|------|---------------|----------------|------------------|
| 1.3a | Asesoría legal (Privacy Policy + Terms) | Servicio profesional | — | $200-1000 USD | Template auto-generado (riesgo) |
| 1.3b | Generador legal (iubenda Pro) | SaaS | — | $27/año | Template manual |
| 1.3c | Hosting docs legales | SaaS | $0 | — | Vercel/Netlify free |
| 1.6 | Sentry crash reporting | SaaS | $0 (free tier) o $26/mes | — | Free tier alcanza primer semestre |
| 1.7 | PostHog analytics | SaaS | $0 (free 1M eventos) | — | Free tier alcanza primer año |
| 1.9a | Screenshots App Store (tercerizados) | Servicio | — | $200-500 USD | Hacelos vos en Figma |
| 1.9b | App Preview video (tercerizado) | Servicio | — | $100-300 USD | Screen recording + iMovie |
| 1.11 | Email transactional (Postmark/Resend) | SaaS | $15/mes | — | Mailto link simple sin tracking |
| **TOTAL mínimo** | | | **$0/mes** | **~$27/año** | usando todos los free tiers |
| **TOTAL recomendado** | | | **~$41/mes** | **~$500 one-time** | con legal + Sentry pago + assets profesionales |

---

## Detalle por item

### 1.3a · Asesoría legal Privacy Policy + Terms 💰💰

**Por qué importa:** la Privacy Policy mal redactada es la causa #1 de rechazo en App Review post-2024. También te expone a multas GDPR (hasta 4% revenue global) y CCPA ($7,500 por violación intencional).

**Opciones:**

| Opción | Costo | Riesgo | Recomendación |
|--------|-------|--------|---------------|
| Abogado tradicional Argentina | $500-1500 USD | Mínimo | Si vendés en EU/US sí o sí |
| Servicios online (Iubenda, Termly) | $27-120/año | Bajo | OK para MVP |
| Template gratis (PrivacyPolicies.com generator) | $0 | Medio | Aceptable para soft launch |
| Copiar de otra app | $0 | **Alto** | ❌ Nunca hagas esto |

**Mi recomendación para Manifiesto:** iubenda Privacy Policy Pro ($27/año) + Cookie Solution gratis. Cubre GDPR/CCPA/LGPD. Editás los datos en su panel y embebés.

URLs canónicas sugeridas:
- `https://manifiesto.app/privacy`
- `https://manifiesto.app/terms`

---

### 1.6 · Sentry crash reporting 💰

**Free tier:**
- 5K errors/mes
- 10K performance events/mes
- 50 replays/mes
- 1 usuario
- 30 días retention

**Pago (Team plan):**
- $26/mes (anual) ó $29/mes mensual
- 50K errors/mes
- Source maps automáticos
- Alertas Slack/email
- 90 días retention

**Recomendación:**
Empezar en **free**. Pasarte a Team cuando tengas >2K MAU o cuando 5K events/mes se quede corto. Estimado: free alcanza durante los primeros 3-6 meses post-launch.

**Alternativas:**
- Bugsnag (Lite free 7500 events): similar
- Firebase Crashlytics: **gratis ilimitado**, pero te ata a Google ecosystem y tracking es menos rico que Sentry
- Self-hosted Sentry: complicado de mantener para una app

---

### 1.7 · PostHog analytics 💰

**Free tier (Cloud):**
- 1M product analytics events/mes
- 5K session replays/mes
- 1K survey responses/mes
- 1M feature flag requests/mes

**Recomendación:**
PostHog free es **más generoso** que la mayoría. Empezar ahí. Si crecés, pasa a "Paid scale" usage-based (~$0.00031 por event).

**Alternativas:**
- Amplitude Starter: 10M MTU free pero menos features
- Mixpanel free: 20M events/mes pero retención limitada
- Plausible / Umami: agnostic, sólo web → no aplica
- Segment + destinos: $120/mes inicial, overkill para esta etapa

---

### 1.9 · App Store assets 💰💰

**Screenshots (6.7" + 6.5" obligatorios):**

| Opción | Costo | Calidad | Tiempo |
|--------|-------|---------|--------|
| Diseñador freelance Fiverr | $50-150 | Variable | 3-5 días |
| Diseñador en Upwork senior | $200-500 | Alta | 1 semana |
| Vos en Figma + plantillas Mockuuups | $0 + tu tiempo | Buena si tenés ojo | 2-3 días |
| Tools tipo PreviewMockup | $30 one-time | Aceptable | 1 día |

**App Preview Video (15-30s):**

| Opción | Costo | Tiempo |
|--------|-------|--------|
| Editor freelance | $100-300 | 5-7 días |
| Vos con Screen Recording + iMovie / DaVinci | $0 | 1-2 días |

**Mi recomendación para Manifiesto:** Hacelo vos en Figma con plantillas Mockuuups Studio. Tenés branding propio, copy en español, y conocés el producto. Tercerizar = riesgo de copy genérico.

---

### 1.11 · Email transactional 💰

Sólo necesario si querés **tracking + auto-response**. Si soporte va a un Gmail, $0.

| Servicio | Free tier | Pago | Notas |
|----------|-----------|------|-------|
| Postmark | 100 emails/mes free | $15/mes (10K) | Mejor deliverability |
| Resend | 3K/mes free | $20/mes (50K) | Más nuevo, DX excelente |
| SendGrid | 100/día free | $19.95/mes | Más establecido |
| Plain Gmail/Inbox | ∞ | $0 | OK para volúmenes bajos |

**Recomendación:** Gmail/Google Workspace ($6 user/mes que ya pagás probablemente) para arrancar. Migrar a Postmark cuando volumen de soporte > 100/mes.

---

## 🎯 Presupuesto recomendado para arrancar

**Stack mínimo viable (mes 1-3 post-launch):**

```
$  0/mes  · Sentry free tier
$  0/mes  · PostHog free tier
$  0/mes  · Hosting docs legales en Vercel
$  6/mes  · Google Workspace (soporte email)
─────────
$  6/mes  TOTAL recurrente
$ 27/año  · iubenda Privacy Policy Pro
$  0      · Screenshots hechos por vos
─────────
~$95 primer año total ⭐
```

**Stack profesional (post-product/market fit, mes 6+):**

```
$ 26/mes · Sentry Team
$  0/mes · PostHog free (alcanza)
$ 15/mes · Postmark
$  6/mes · Google Workspace
─────────
$ 47/mes  recurrente
$500      Asesor legal one-time
$300      Screenshots/video profesionales
─────────
~$1364 primer año total
```

---

## ⚠️ NO subestimar

- **Apple Developer Program**: $99/año obligatorio para publicar en App Store. Ya lo tenés probablemente porque tenés EAS project ID en `app.config.ts`. Si no, hacelo ya.
- **Google Play Developer**: $25 one-time (cuando llegues a Android).
- **Dominio**: si no tenés `manifiesto.app`, registrá ya. ~$15/año en Namecheap.
- **SSL**: gratis con Let's Encrypt o Vercel/Cloudflare.

---

**Total realista a presupuestar para iOS launch:** ~$200-500 one-time + $50/mes recurrente.
