# 05 · Quality & Readiness — Audit detallado

> Cobertura actual: **Testing 5/10, Observability 0/10, CI/CD 3/10, Security 6/10**. Bases buenas pero faltan capas críticas para operar con confianza.

---

## 🧪 Testing

### Estado actual

**Unit tests:** `/tests/unit/` 20 archivos. Categorías:
- ✅ Cognitive layer / AI logic (`cognitive-layer.test.ts`)
- ✅ UI model logic (`animated-amount-format`, `home-dashboard-model`, `daily-budget-ring-model`)
- ✅ Data models (`fixed-expense-editor-model`, `household-setup-wizard-model`)
- ✅ Form/entry (`in-app-numpad-model`, `single-entry-memo`)
- ✅ Layout (`auth-layout`)
- ✅ Notifications orchestration (`notifications-chunking`)

**E2E tests:** `/tests/e2e/` 4 archivos:
- `smoke.spec.ts` — boot test sin auth
- `home-auth.spec.ts` — flujo autenticado
- `fijos-auth.spec.ts`
- `gastos-auth.spec.ts`

**Config:**
- Playwright: workers 1 (serial), timeout 60s, mobile viewport 430×932
- vitest configurado pero `npm test` no corre en CI

### Gaps de testing

| # | Gap | Severidad | Effort |
|---|-----|-----------|--------|
| 5.1a | Auth integration tests (login, session refresh, biometric, social) | Alto | 1 día |
| 5.1b | Expense CRUD tests contra Supabase | Alto | 1 día |
| 5.1c | Fixed expense lifecycle (create, pay, advance, archive) | Alto | 1 día |
| 5.4 | Billing flow e2e (mock purchase → entitlement → gating) | ⛔ blocker para 03 | 2 días |
| 5.5 | Push delivery flow (cron → orchestrator → expo push) | Medio | 1 día |
| 5.6 | Visual regression (snapshot UI principales) | Medio | 2 días |
| 5.7 | Accessibility (VoiceOver navigation full flows) | Alto (compliance) | 2 días |
| 5.8 | Performance baseline + regression alerts | Alto | 1 día |

---

## 📡 Observability

### Estado actual: **0 / 10**

**Telemetry implementada (home-grown):**
- `mobile/features/telemetry/event-queue.ts` (84 líneas) — batch debounced 50ms o 20 events
- Persistencia en tabla `home_telemetry` via RPC `log_home_event` / `log_home_events_bulk`
- `use-screen-telemetry.ts` (124 líneas) — session correlation, dwell time, screen open/close
- Eventos como freeform strings (NO typed)

**Lo que falta:**
- ❌ Crash reporting (Sentry / Crashlytics) → cubierto en `01-showstoppers-ios`
- ❌ Product analytics externo (PostHog / Amplitude / Mixpanel) → cubierto en `01-showstoppers-ios`
- ❌ Performance monitoring (TTI, JS FPS, native FPS, cold start)
- ❌ Backend / Supabase RPC latency tracking
- ❌ Edge Function logs aggregation
- ❌ Real-User Monitoring (RUM)
- ❌ Alerting (Slack/PagerDuty para errores críticos)
- ❌ Custom dashboards (MRR, churn, activation)

### Telemetry typed events (5.15)

**Problema:** strings como `"gastos.opened"`, `"gastos.element_tapped"` son fáciles de typo, no validables.

**Fix esperado:**
```ts
// mobile/features/telemetry/event-types.ts
export type TelemetryEvent =
  | { type: 'app_opened', sessionId: string }
  | { type: 'screen_opened', scope: ScreenScope, sessionId: string }
  | { type: 'expense_created', amount: number, categoryId: string, hasNotes: boolean }
  | { type: 'paywall_viewed', trigger: PaywallTrigger }
  | { type: 'purchase_initiated', planId: string }
  | { type: 'purchase_completed', planId: string, source: 'app_store' | 'play_store' }
  | { type: 'ai_query_sent', queryLength: number }
  | { type: 'streak_milestone', length: number }
  // ... etc
```

Usar discriminated unions para autocompletado + type safety + refactor seguro.

---

## ⚙️ CI/CD

### Estado actual: lint + typecheck only

**Workflow actual:** `.github/workflows/mobile-ci.yml` (31 líneas):
- Trigger: push to main, pull_request, workflow_dispatch
- Steps: node 22, npm ci, lint, typecheck
- Sin tests, sin build, sin deploy

**Gaps críticos:**

| # | Gap | Severidad |
|---|-----|-----------|
| 5.16 | EAS Build no automatizado | Alto |
| 5.17 | TestFlight submission manual | Alto |
| 5.18 | Code signing (EAS Credentials) probable setup pero no documented | Medio |
| 5.19 | `npm test` no corre en CI | Alto |
| 5.20 | E2E tests no corren en CI | Alto |
| 5.21 | Sentry sourcemap upload no automatizado | Alto |
| 5.22 | Migration safety check (¿migration breaking?) | Medio |
| 5.23 | OTA Updates (EAS Update) no configurado | Alto |
| 5.24 | Feature flags infra missing | Medio |
| 5.25 | Rollback strategy no documentada | Alto |

### CI ideal

```yaml
on: [push, pull_request]
jobs:
  validate:
    - lint
    - typecheck
    - unit tests (vitest)
    - guard:legacy-spacing
    - guard:forbidden-copy
    - guard:motion-tokens
  e2e:
    - playwright smoke
  build-preview:
    if: pull_request
    - eas build --profile preview
  build-production:
    if: tag matches 'v*'
    - eas build --profile production
    - sentry sourcemap upload
    - eas submit --platform ios
  ota:
    if: branch == main && no native changes
    - eas update --branch production
```

---

## 🗄️ Schema + Backend hygiene

### Tablas missing identificadas

| # | Tabla missing | Por qué importa |
|---|---------------|-----------------|
| 5.26 | `audit_log` | Compliance GDPR + fraud detection + para family-admin (track block/unblock/transfer/remove) |
| 5.28 | `user_settings` | Hoy preferencias mezcladas en `profiles` + `family_finance`. Separar para escalar |
| 5.29 | `invitations` | Códigos de familia se generan pero no se trackean (¿quién invitó? ¿cuándo expiró? ¿se usó?) |
| 5.30 | `devices` / `user_sessions` | Para revocation, multi-device login, security audit |

Tabla `subscriptions` + `billing_receipts` cubierta en `03-monetization`.
Tabla `user_streaks` + `achievements_earned` cubierta en `02-engagement-gaps`.

### Columnas faltantes

| Tabla | Columna faltante | Razón |
|-------|------------------|-------|
| `expenses` | `notes TEXT` | Pedido en docs UX, schema tiene pero no UI |
| `expenses` | `receipt_url TEXT` | OCR feature future |
| `expenses` | `tags TEXT[]` | Future granularity |
| `expenses` | `currency TEXT` | Multi-currency future |
| `family_finance` | `daily_recap_hour INT` | Para feature 2.19 |
| `family_finance` | `currency_code TEXT` | Default para nuevos gastos |
| `family_members` | `role TEXT` | owner/admin/member/viewer (hoy implícito) |
| `family_members` | `blocked_at TIMESTAMPTZ` | Referenced en send-family-push:401 pero no en schema |
| `push_subscriptions` | `last_used_at` | Para cleanup |
| `push_subscriptions` | `delivery_failure_count` | Para auto-cleanup |
| `push_subscriptions` | `platform` | iOS/Android/Web explicit |
| `notifications` | `priority` | Para batching diferente |
| `categories` | `monthly_cap_amount NUMERIC(12,2)` | Item 2.26 |
| `categories` | `icon_code TEXT` | Item 2.27 |

### Crons missing

| # | Cron | Crítico |
|---|------|---------|
| 5.31 | Recurring fixed expense generator (avanzar fechas + crear shadow expenses) | Alto |
| 5.32 | Monthly recap auto-generation (data para Wrapped) | Medio |
| 5.33 | Push subscription cleanup (stale tokens) | Medio |
| 3.7 | Trial expiry enforcement (en sección 03) | Alto |

---

## 🔒 Security

### Estado actual: 6/10

**Lo que está bien:**
- ✅ RLS habilitado en todas las tablas (10/10)
- ✅ Helper `is_family_member()` consistente
- ✅ Expenses INSERT enforce `created_by = auth.uid()`
- ✅ Push subscriptions locked to `user_id = auth.uid()`
- ✅ Service role usage parece limitado a edge functions (verificar)
- ✅ Rate limiting en `send-family-push` (10/min/user)

### Vulnerabilidades identificadas

| # | Issue | Severidad |
|---|-------|-----------|
| 5.27 | **RLS no restringe expense UPDATE/DELETE por creator** | Alto |
| 5.35 | Rate limiting solo en push, no en bootstrap_family/join_family/expense_create | Medio |
| 5.37 | Service role usage no auditado | Medio |
| 5.38 | Operaciones destructivas (destroy_family, delete_account) no piden re-auth | Alto |
| 5.39 | No hay 2FA opt-in | Medio (es Supabase issue) |

#### Detalle 5.27 — Expense edit/delete vulnerability

**Estado actual:**
- Policy en `sql/supabase.sql:1281-1286` (citado por Agent D) permite que **cualquier miembro de la familia edite/borre cualquier gasto**, no solo el creator
- Esto puede ser feature (familia colaborativa) pero también vector de abuso (familiar enojado borrando todo)

**Decisión sugerida:**
- Default: only creator edits/deletes
- Owner override: con UI flag específico
- Audit log de toda modificación

**Fix:**
```sql
CREATE POLICY expenses_update_by_creator ON expenses FOR UPDATE
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

CREATE POLICY expenses_delete_by_creator_or_owner ON expenses FOR DELETE
USING (
  created_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM family_members
    WHERE family_id = expenses.family_id
      AND user_id = auth.uid()
      AND role = 'owner'
  )
);
```

#### Detalle 5.38 — Re-auth para destructive ops

Para acciones críticas (delete_account, destroy_family, transfer_ownership, change_billing_email):
- Pedir biometric ó password re-entry
- Generar token efímero válido 5 min
- Validar token en RPC server-side

---

## 📈 Métricas de salud que se deberían medir

Una vez que Sentry + PostHog estén live:

### Sentry
- Crash-free sessions > 99.5%
- ANR (App Not Responding) rate < 0.1%
- p95 cold start < 2s
- p95 navigation < 100ms
- Performance budget alerts

### PostHog
- Activation rate (signup → primer gasto en < 24h)
- D1, D7, D30 retention
- Funnels:
  - Onboarding completion
  - Trial start → paid conversion
  - Paywall view → purchase
- Cohorts: by acquisition channel, by tier
- Heatmaps de tap en pantallas críticas

### Backend
- Supabase RPC p95 latency
- Edge function invocation success rate
- Push delivery success rate
- DB connection pool utilization

---

## 🎚️ Performance baseline

### Métricas críticas a establecer pre-launch

| Métrica | Target | Cómo medir |
|---------|--------|------------|
| Cold start time | < 2s en iPhone 12 | Xcode Instruments |
| Time to interactive (home) | < 1s después de cold start | RN Profiler + Sentry |
| JS FPS scroll | > 55 fps sustained | Reanimated metrics |
| Native FPS animations | > 58 fps | Xcode Instruments GPU |
| Memory baseline | < 200MB at home | Xcode debug Memory |
| Memory leak rate | 0 growth over 10 min idle | Manual review |
| Network success rate | > 99% | Sentry |
| Push delivery latency | < 5s p95 | Edge function metrics |

---

## 📦 Backups + Disaster recovery

### Estado actual

- Supabase free tier: backups automáticos pero 7 días retention
- No documentado: restore procedure
- No testado: restore real

### Lo que debería existir (5.34)

- Backup diario a S3/B2 (independiente de Supabase) via `pg_dump` cron
- Retention: 30 días daily, 12 meses monthly
- Restore runbook documentado
- Test trimestral: restaurar en proyecto staging

---

**Próximo doc:** `roadmap.md`.
