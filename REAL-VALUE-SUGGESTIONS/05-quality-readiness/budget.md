# 05 · Quality & Readiness — Presupuesto 💰

> Mostly free tier alcanza para los primeros meses. Premium tools cuando la base de usuarios lo justifique.

---

## Tabla resumen

| # | Item | Tipo | Free tier | Pago tier | Cuándo upgradear |
|---|------|------|-----------|-----------|-------------------|
| 5.9 | Sentry crash reporting | SaaS | 5K events/mes | $26/mes Team | > 2K MAU |
| 5.10 | PostHog analytics | SaaS | 1M events/mes | $0.00031/event | > 1M events |
| 5.12 | Uptime monitoring | SaaS | BetterUptime free 10 monitors | $18/mes Solo | siempre OK |
| 5.13 | Logs aggregation | SaaS | Supabase logs free / Logflare 12M/mes free | $20/mes | growing volume |
| 5.16 | EAS Build | SaaS | 30 builds/mes free Hobby | $99/mes Production | > 30 builds/mes |
| 5.23 | EAS Update OTA | Incluido en EAS | 1000 updates/mes free | incluido en Production | siempre |
| 5.24 | Feature flags | SaaS | PostHog incluido / GrowthBook self-hosted | incluido | — |
| 5.34 | DB backups storage | Cloud | $5/mes B2/R2/S3 small | varies | crece con DB |
| 5.36 | Secrets management | DevOps | git-secret, 1Password | $7.99/mes 1Password Family | siempre |
| **TOTAL pre-launch** | | | **$0-30/mes** | **$0-150/mes** | |

---

## Detalle por item

### 5.9 · Sentry

(Detalle full en `../01-showstoppers-ios/budget.md`)

Resumen: free hasta ~5K events/mes. Para tu primer trimestre alcanza sobrado. Cuando llegues a 2K MAU con telemetría de crashes + performance traces, considerá Team ($26/mes).

---

### 5.10 · PostHog

(Detalle full en `../01-showstoppers-ios/budget.md`)

Free tier: 1M events/mes incluye:
- Product analytics
- Session replays (5K/mes)
- Feature flags (1M requests/mes)
- A/B testing
- Surveys (1K responses/mes)

Pricing post-free es **usage-based**: $0.00031/event analytics, $0.0050/replay. Trivial al inicio.

---

### 5.16 · EAS Build 💰

**Free Hobby:** 30 builds/mes (suficiente para dev + features)
**Production tier:** $99/mes — 100 builds/mes + concurrencias + priority queue

**Cuándo upgradear:**
- Cuando 30 builds/mes se quedan cortos (típicamente cuando lanzás ramas + features paralelas)
- Cuando necesitás builds < 15 min (free tier puede tomar 30+ min en queue)

Para Manifiesto pre-launch + primer trimestre: Hobby alcanza. Después depende del ritmo de releases.

---

### 5.12 · Uptime monitoring 💰 free

**BetterUptime free tier:**
- 10 monitors
- 3 min check interval
- Email alerts
- Public status page (gratis)
- Incident management básico

Es **más que suficiente** para Manifiesto v1.0. Upgrade a Solo ($18/mes) solo si necesitás 30s interval o SMS alerts.

Setup gratis incluye:
- `https://YOUR_PROJECT.supabase.co/rest/v1/health` con anon key
- `https://YOUR_PROJECT.supabase.co/functions/v1/send-family-push` GET response
- DNS de manifiesto.app
- Apple App Store listing (vía external scraper si querés)

---

### 5.13 · Logs aggregation 💰 opcional

**Free options para empezar:**
- **Supabase Dashboard Logs** — incluido, retention 1-7 días
- **Logflare** — 12M events/mes free
- **Axiom** — 500GB ingestion free

**Pago options:**
- Logflare Team: $20-100/mes
- Axiom Team: $25/mes
- Datadog Logs: $0.10/GB ingested + $1.27/M lines (caro)

**Recomendación:** arranca con Supabase Dashboard. Cuando logs salen de control (>1GB/mes) pasá a Logflare.

---

### 5.34 · DB backups storage 💰

**Opciones de cold storage:**

| Servicio | Costo | Notas |
|----------|-------|-------|
| **Cloudflare R2** | $0.015/GB/mes + 0 egress | Best for backups |
| **Backblaze B2** | $0.005/GB/mes + $0.01/GB egress | Cheapest storage |
| **AWS S3 Glacier** | $0.0036/GB/mes + retrieval fees | Para archive long-term |
| **Wasabi** | $7/TB/mes flat | Predictible |

**Estimado Manifiesto:**
- DB en mes 1: <100MB
- DB en mes 12: <2GB
- Backup diario × 30 días + weekly × 12mo = ~70 backups
- Storage total estimate: < 10GB en año 1
- **Costo: < $1/mes en R2 ó B2** ✅ trivial

---

### 5.36 · Secrets management 💰 opcional

**Para equipo solo (tu solo):**
- `.env` files local + nunca commit + Git history clean = $0
- Backup `.env` en 1Password si ya pagás

**Para equipo 2+:**
- **1Password Teams** $7.99/usuario/mes — best balance
- **Bitwarden** free para teams pequeños, $40/año por persona Premium
- **HashiCorp Vault** self-host — gratis pero complejo

**Recomendación Manifiesto:** 1Password si ya lo usás. Bitwarden si querés free.

---

### Apple App Store specific

| Item | Costo |
|------|-------|
| Apple Developer Program | $99/año (ya pagado probablemente) |
| App Store Connect API Key | gratis |
| TestFlight | gratis (incluido en Developer Program) |
| App Store Server Notifications | gratis |
| Push Notification Service (APNs) | gratis |
| CloudKit / iCloud Drive (si lo usaras) | free tier generoso |

---

### Supabase tier 💰

Tu uso actual sugiere que estás en **Free tier** ($0/mes):
- 500MB database
- 1GB file storage
- 5GB egress
- 50K MAUs (Monthly Active Users)
- 500K Edge function invocations
- 2 projects max

**Cuándo pasar a Pro ($25/mes):**
- > 500MB DB (notif table + telemetry table crece rápido)
- > 50K MAUs (lejos pre-launch)
- Necesidad de PITR (Point In Time Recovery) backups
- > 7 días backup retention

**Estimado Manifiesto:**
- v1.0 launch: free OK
- ~6 meses con 1000 MAU + telemetry creciente: free OK
- ~12-18 meses post-launch: Pro indispensable

**Pro ($25/mes) incluye:**
- 8GB DB
- 100GB storage
- 250GB egress
- 100K MAUs
- 2M edge function invocations
- 7 días daily backup + 1 month weekly + PITR

---

### Expo/EAS suite 💰

**EAS Build:**
- Hobby (free): 30 builds/mes en cola compartida
- Production ($99/mes): 100 builds/mes priority queue + concurrent

**EAS Update:**
- Free 1000 updates/mes
- Incluido en Production tier

**EAS Submit:**
- Gratis, incluido

**Mi recomendación:** Hobby gratis hasta que el dev volume crezca o necesités priority queue.

---

## 🎯 Presupuesto recomendado por etapa

### Pre-launch (mes 0-1)

```
$0      Supabase Free tier
$0      Sentry Free tier
$0      PostHog Free tier
$0      BetterUptime Free tier
$0      EAS Hobby tier
$0      Logflare / Supabase Logs Free
$0-15   Domain manifiesto.app + email forwarding
$0-1    R2 backups (< 1GB)
────────
$0-16/mes
```

### Post-launch operacional (mes 3-12)

```
$0      Supabase Free (mientras alcance)
$0      Sentry Free (5K events/mes)
$0      PostHog Free (1M events/mes)
$0      BetterUptime Free
$0      EAS Hobby tier
$1      R2 backups
$15/año Domain renew
────────
$1-2/mes recurrente
```

### Año 2 (escalamiento)

```
$25/mes  Supabase Pro (DB > 500MB ó MAU > 50K)
$26/mes  Sentry Team
$0       PostHog (free aguanta mucho)
$99/mes  EAS Production (si dev volume lo justifica)
$5/mes   R2 backups extendidos
$18/mes  BetterUptime Solo (opcional)
────────
~$170/mes recurrente
```

---

## 💸 Costos operacionales totales año 1

**Escenario conservador (pre-PMF):**
```
$0/mes infra
$99/año Apple Developer Program
$15/año domain
─────────
~$120 total año 1 ⭐
```

**Escenario realista (con tracción):**
```
$25/mes Supabase Pro (mes 6+)
$26/mes Sentry Team (mes 9+)
$99/año Apple
$15/año domain
~$10/mes ASA test campaign
─────────
~$600 total año 1
```

**Escenario optimista (PMF logrado):**
```
$25/mes Supabase Pro full year
$26/mes Sentry full year
$99/mes EAS Production
$99/año Apple
$15/año domain
$300/mes Apple Search Ads
~$0.30/MAU AI Coach costs
─────────
~$5500/año + variable AI
```

---

## ⚠️ Trampas

1. **No subir a Sentry Team prematuro**. Free tier de 5K events alcanza varios meses. Upgrade cuando empezás a perder events útiles.
2. **No hacer free-tier-driven-design**. Si la app necesita Supabase Pro día 1 (por backups), pagalo. Decir "uso free, salgo en 6 meses" + outage por límite alcanzado = caída en reviews.
3. **Backups que no se prueban no existen**. R2 está perfecto pero si nunca restaurás, no sabés si funciona.
4. **OTA Updates incompatibles**: si pusheas JS que require Reanimated v5 pero el bundle nativo tiene v4 → crash masivo. Usar `runtimeVersion` correctamente.
5. **AI Coach costs surprise**: monitorear daily, no monthly. Un usuario que mande 1000 queries/día (script kiddie) puede comerte la cuota mensual en horas.

---

**Sección 05 completa.** Próximo y último: 06-master-roadmap.
