# 05 · Quality & Readiness — Roadmap

> Orden recomendado: lo que te da más visibilidad/seguridad/velocity primero.

---

## 🏁 Sprint 1 · Observabilidad (3 días)

### TASK 5.9 · Sentry crash reporting

**Effort:** 4 horas · 💰 free tier OK

(Detalle full en `../01-showstoppers-ios/roadmap.md` § 1.6)

Resumen:
1. `npx expo install @sentry/react-native sentry-expo`
2. Plugin en `app.config.ts`
3. `Sentry.init(...)` en `_layout.tsx`
4. EAS Build post-publish hook para sourcemaps
5. Verificar test crash en sandbox

---

### TASK 5.10 · PostHog analytics

**Effort:** 1 día · 💰 free tier OK

Detalle en `../01-showstoppers-ios/roadmap.md` § 1.7.

Sumar a eventos típicos:
- `feature_used` con tags por feature
- `paywall_*` events
- `tier_changed`

---

### TASK 5.11 · Performance monitoring

**Effort:** 1 día · viene gratis con Sentry o PostHog

Sentry Performance:
- `tracesSampleRate: 0.1` en init
- Custom transactions con `Sentry.startTransaction(...)` en:
  - App cold start
  - Navigation entre tabs
  - Supabase queries pesadas
  - Sync operations
- Alertas: p95 > 2s → Slack

---

### TASK 5.12 · Backend uptime monitoring

**Effort:** 30 min · 💰 free tools

**Tools:**
- [BetterUptime](https://betterstack.com/) free tier 10 monitors
- [UptimeRobot](https://uptimerobot.com/) free
- [Cronitor](https://cronitor.io/) free

Setup:
- Health check endpoint en Supabase: `GET /rest/v1/families?limit=1` (con anon key)
- Edge functions health: `GET /functions/v1/send-family-push` (responder OK con GET)
- Notifications a email + Slack si caída > 60s

---

### TASK 5.13 · Edge function logs aggregation

**Effort:** 4 horas · 💰 free options

**Opciones:**
- **Supabase Dashboard Logs** (incluido) — básico
- **Logflare** (free tier 12M events/mes) — integra nativo con Supabase
- **Axiom** (free tier 500GB ingestion) — querys SQL sobre logs
- **Logtail / BetterStack** — bonito UI

Recomendación: arrancar con Supabase Dashboard. Si los logs son muchos → Logflare.

---

### TASK 5.14 · Real-User Monitoring

**Effort:** 1 día · viene con Sentry Performance

Configurar:
- `enableAutoPerformanceTracking: true`
- `enableUserInteractionTracing: true`
- `tracePropagationTargets: ['supabase.co']`

Dashboard Sentry → Performance → ver waterfall de transactions.

---

### TASK 5.15 · Typed telemetry events

**Effort:** 1 día (refactor incremental)

Pasos:
1. Crear `mobile/features/telemetry/event-types.ts` con discriminated union (ver audit.md)
2. Update `event-queue.ts` para typed
3. Refactor incremental: cada touch de event handler, migrar a typed
4. Eslint rule custom para evitar regresión a strings

---

## 🏁 Sprint 2 · CI/CD foundations (3 días)

### TASK 5.16 · EAS Build automation

**Effort:** 1 día

`.github/workflows/build.yml`:
```yaml
name: Build
on:
  pull_request:
    branches: [main]
  push:
    tags: ['v*']
jobs:
  build-preview:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npm ci
      - run: eas build --profile preview --platform ios --non-interactive --no-wait
  
  build-prod:
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ... mismo setup
      - run: eas build --profile production --platform ios --non-interactive --no-wait
      - run: eas submit --platform ios --latest --non-interactive
```

Requiere:
- `EXPO_TOKEN` secret en GitHub
- Apple credentials en EAS

---

### TASK 5.17 · TestFlight auto-submit en tag

**Effort:** 4 horas

Cubierto en 5.16 con `eas submit`. Configurar `eas.json`:
```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "tu-apple-id@example.com",
        "ascAppId": "1234567890",
        "appleTeamId": "ABCD1234"
      }
    }
  }
}
```

---

### TASK 5.18 · Code signing automated

**Effort:** 4 horas

EAS Credentials maneja esto. Asegurar:
```bash
eas credentials
```
- Configurar Apple Distribution Certificate
- Provisioning Profile auto-managed por EAS
- App Store Connect API Key para submit

---

### TASK 5.19 · Tests en CI

**Effort:** 30 min

Update `mobile-ci.yml`:
```yaml
- run: npm run typecheck
- run: npm run lint
- run: npm test         # ← agregar
- run: npm run guard:legacy-spacing
- run: npm run guard:forbidden-copy
- run: npm run guard:motion-tokens
```

Tests existentes ya pasan (asumo). Si no, fix antes de habilitar gate.

---

### TASK 5.20 · E2E en CI

**Effort:** 1 día

Playwright E2E requiere Expo web build. Workflow:
```yaml
e2e:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npx playwright install --with-deps
    - run: npm run test:e2e
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: playwright-report/
```

⚠️ E2E requiere Supabase test instance ó mocks. Decisión: tener proyecto Supabase "manifiesto-staging" con seed data automatizado.

---

### TASK 5.21 · Sentry sourcemap upload

**Effort:** 4 horas

EAS Build post-publish hook:
```json
// eas.json
{
  "build": {
    "production": {
      "ios": { "credentialsSource": "remote" },
      "env": { "SENTRY_AUTH_TOKEN": "..." }
    }
  }
}
```

En `app.config.ts` plugin `sentry-expo` upload sourcemaps automáticamente cuando `SENTRY_AUTH_TOKEN` está presente.

---

### TASK 5.22 · Migration safety check

**Effort:** 2 horas

CI step que valida:
```yaml
- name: Check migration safety
  run: |
    # Bloquear DROP TABLE / DROP COLUMN sin --force flag
    if grep -rE 'DROP (TABLE|COLUMN)' supabase/migrations/ | grep -v 'IF EXISTS'; then
      echo "ERROR: destructive migration without IF EXISTS guard"
      exit 1
    fi
```

Plus: PR template con checklist de DBA review.

---

### TASK 5.23 · EAS Update (OTA)

**Effort:** 4 horas

Configurar EAS Update:
```bash
eas update:configure
```

Workflow para OTA en main:
```yaml
ota:
  if: github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  steps:
    - run: eas update --branch production --message "${{ github.event.head_commit.message }}"
```

⚠️ Cuidado: OTA solo para JS bundle. Cambios nativos requieren full build.

---

### TASK 5.24 · Feature flags

**Effort:** 1 día · 💰 free options

**Opciones:**
- **PostHog feature flags** — incluido en plan (free)
- **GrowthBook** — open source self-host
- **LaunchDarkly** — enterprise (caro)
- **Casa-cera: tabla feature_flags propia**

Para Manifiesto: PostHog feature flags. Ya estará instalado.

Casos de uso:
- Gradual rollout de OCR (10% → 50% → 100%)
- Killswitch para AI Coach si Anthropic tira mal
- A/B testing copy de paywall

```ts
// mobile/lib/feature-flags.ts
import { PostHog } from 'posthog-react-native'
export function useFeatureFlag(flagKey: string, defaultValue = false) {
  const ph = usePostHog()
  return ph.isFeatureEnabled(flagKey) ?? defaultValue
}
```

---

### TASK 5.25 · Rollback strategy docs

**Effort:** 2 horas

Documento `docs/RUNBOOKS.md` con:
- **Cómo rollback OTA:** `eas update --branch production --message "rollback" --runtime-version X.Y` apuntando al commit previo
- **Cómo rollback native build:** revert Apple "currently available" en App Store Connect a la build previa
- **Cómo rollback DB migration:** scripts de downgrade documentados, supabase migration revert
- **Cómo apagar feature en producción:** PostHog flag toggle
- **Cómo notificar usuarios:** push masivo + email + in-app banner

---

## 🏁 Sprint 3 · Schema + backend hygiene (4 días)

### TASK 5.26 · Audit log table

**Effort:** 1 día

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id),
  family_id UUID REFERENCES families(id),
  action TEXT NOT NULL, -- 'family.member.transferred_ownership', 'expense.deleted_by_owner', etc.
  target_type TEXT, target_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log(family_id, created_at DESC);
CREATE INDEX ON audit_log(actor_user_id, created_at DESC);
```

Trigger en operaciones críticas (transfer_ownership, block_member, delete_account, mass_delete).

UI: Settings → Family admin → "Historial de actividad" (item para v1.1).

---

### TASK 5.27 · Fix RLS expense edit/delete ⚠️

**Effort:** 2 horas · **CRITICAL FIX**

(Detalle en audit.md § 5.27)

⚠️ **Hacer con cuidado.** Probar primero en staging. Si la UI asume edit/delete por cualquier miembro, hay que ajustarla simultáneamente.

---

### TASK 5.28 · user_settings table

**Effort:** 2 horas

Hoy preferencias mezcladas en `profiles` + `family_finance`. Separar:
```sql
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_preference TEXT DEFAULT 'system',
  reduced_motion TEXT DEFAULT 'auto',
  language TEXT DEFAULT 'es-AR',
  daily_recap_enabled BOOLEAN DEFAULT true,
  daily_recap_hour INT DEFAULT 22,
  quiet_hours_start INT, quiet_hours_end INT,
  biometric_enabled BOOLEAN DEFAULT false,
  notifications_enabled BOOLEAN DEFAULT true,
  push_marketing_enabled BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Migration: copiar data existente de profiles + family_finance.

---

### TASK 5.29 · invitations table

**Effort:** 4 horas

Hoy `families.code` es estático. Mejor:
```sql
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMPTZ,
  max_uses INT DEFAULT 1,
  current_uses INT DEFAULT 0
);
```

Permite:
- Multiple invites simultáneos
- Expiry automático
- Tracking de quien usó cada code
- Revoke selectivo

---

### TASK 5.30 · devices / user_sessions

**Effort:** 1 día

```sql
CREATE TABLE user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL, -- expo Constants.installationId
  device_name TEXT, -- iPhone 15 Pro Max
  os TEXT, os_version TEXT, app_version TEXT,
  push_token TEXT, push_provider TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);
```

Permite:
- Settings → "Dispositivos conectados" + revoke
- Push token gestión limpia (deprecar `push_subscriptions` por esta tabla?)
- Audit de logins sospechosos

---

### TASK 5.31 · Recurring fixed expense generator ⚠️

**Effort:** 1 día · **Crítico (gap detectado)**

Hoy `advance_fixed_expense_due_date()` existe pero **solo se llama cuando user marca pago**. Implicancia:
- Si user olvida marcar, el fijo nunca avanza
- No hay generación automática de "shadow expense" del mes

**Spec:**
```sql
-- Cron diario 6am
SELECT cron.schedule(
  'advance-fixed-expenses',
  '0 6 * * *',
  $$
    -- 1. Para fijos con next_due_date < now() AND status = 'active'
    --    - crear notification "Tu fijo X vence hoy"
    --    - opcional: auto-create expense si user opta-in
    -- 2. Para fijos con next_due_date < now() - 30 days AND status = 'active'
    --    - marcar como 'overdue'
    --    - notificar
  $$
);
```

---

### TASK 5.32 · Monthly recap auto-gen

**Effort:** 4 horas

Cron mensual día 1 a las 6am genera data del Wrapped (item 2.4 en sección 02):
```sql
INSERT INTO monthly_wrapped (family_id, month, ...)
SELECT compute_wrapped_data(family_id, month)
FROM active_families
WHERE NOT EXISTS (SELECT 1 FROM monthly_wrapped WHERE ...);
```

---

### TASK 5.33 · Push subscription cleanup

**Effort:** 4 horas

Cron weekly:
```sql
DELETE FROM push_subscriptions
WHERE last_used_at < now() - interval '90 days'
   OR delivery_failure_count > 10;
```

Requiere primero TASK 5.x agregar columnas (last_used_at, delivery_failure_count).

---

### TASK 5.34 · DB backup strategy

**Effort:** 4 horas

**Setup:**
1. Edge function `nightly-backup` que ejecuta `pg_dump` (Supabase soporta esto en Pro tier)
2. Upload to S3/B2/R2 bucket
3. Retention: daily 30d, weekly 12mo
4. Restore runbook documentado

**Si estás en Supabase free tier:**
- Backups automáticos pero 7 días retention
- Migrar a Pro $25/mes cuando launches → backups 14 días automáticos

💰 BUDGET: ~$5/mes S3/R2 storage para backups archived.

---

## 🏁 Sprint 4 · Security hardening (2 días)

### TASK 5.35 · Rate limiting en RPCs sensibles

**Effort:** 1 día

`enforce_rate_limit_for_user()` ya existe (usado en push). Aplicar a:
- `bootstrap_family` — max 3/día por usuario (evitar spam)
- `join_family_by_code` — max 10/día por usuario
- `useCreateExpense` — max 200/día por usuario (mucho margen pero protege)
- `delete_account` — max 1/día por usuario

---

### TASK 5.37 · Service role usage audit

**Effort:** 4 horas

`SUPABASE_SERVICE_ROLE_KEY` debe usarse SOLO en edge functions, nunca en cliente.

Audit:
- Grep en `mobile/` por "service_role" → debe ser 0 matches
- Verificar `.env*` files no commiteados con service_role
- Asegurar `service_role_key` en Supabase Edge Function secrets, no en repo

---

### TASK 5.38 · Re-auth para destructive ops

**Effort:** 4 horas

Para acciones críticas, pedir biometric ó password:
```ts
// mobile/features/auth/use-require-reauth.ts
export async function requireReauth(reason: string): Promise<boolean> {
  if (await LocalAuthentication.hasHardwareAsync() && biometricEnrolled) {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: reason })
    return res.success
  }
  // Fallback: password sheet
  return await promptPasswordReauth()
}

// Uso:
async function handleDeleteAccount() {
  if (!(await requireReauth('Confirmá tu identidad para eliminar tu cuenta'))) return
  // proceder
}
```

Aplicar a:
- delete_account
- destroy_family
- transfer_ownership
- change_billing_email

---

### TASK 5.39 · 2FA opt-in

**Effort:** 1 día · **Postpone:** v1.5

Supabase soporta TOTP 2FA nativo:
```ts
const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
```

UI en Settings → Account → "Verificación en dos pasos".

---

## 🏁 Sprint 5 · Testing expansion (1 semana)

### TASK 5.1a-c, 5.4-5.7

Detallar más allá del audit. Tests críticos a sumar:

1. **Auth integration** (`tests/integration/auth.test.ts`):
   - Signup → confirm email → login → session persistido
   - Biometric save + restore
   - Social Sign-In flow (mockear con MSW)

2. **Expense lifecycle** (`tests/integration/expenses.test.ts`):
   - Create + read + edit + delete (con RLS check)
   - Filter + search
   - Backdate validation

3. **Fixed expense lifecycle:**
   - Create recurring → next_due_date avanza on payment
   - Installment counter
   - Status transitions

4. **Billing e2e:**
   - Mock RevenueCat → purchase → entitlement check → feature unlock
   - Restore purchases
   - Trial expiry simulation

5. **Visual regression:**
   - Storybook ó Playwright snapshots de Home, Gastos, Fijos, Control
   - Run on PR, alert on visual diff

6. **Accessibility:**
   - Manual VoiceOver pass de cada flow
   - Automated check con `@react-native-community/eslint-config` + `react-native-a11y` ESLint rules

---

## 📅 Cronograma sugerido

| Semana | Foco | Tasks |
|--------|------|-------|
| **W1** | Observabilidad | 5.9, 5.10, 5.11, 5.12, 5.14, 5.15 |
| **W2** | CI/CD foundations | 5.16, 5.17, 5.18, 5.19, 5.20, 5.21 |
| **W3** | Schema hygiene + crons | 5.26-5.34, 5.27 (security fix) |
| **W4** | Security + testing expansion | 5.35-5.39, 5.1a-c, 5.4-5.7 |
| **W5+** | Tooling polish | 5.22-5.25 |

---

## ⚠️ Pitfalls

1. **RLS fix (5.27) sin coordinar con UI**: si la UI asume "cualquier miembro puede editar" y backend dice "no", error 403 al usuario. Hacer cambio coordinado.
2. **Cron recurring expenses (5.31)**: si lo activás sin avisar, usuarios verán fixed expenses "moverse" misteriosamente. Comunicar via push o release notes.
3. **OTA Updates (5.23)**: si pusheas un breaking change vía OTA a usuarios en una versión vieja sin compatibility check, crashes masivos. Usar `runtimeVersion` correctamente.
4. **Feature flags en clave de UX crítica**: si tu flag controlla algo que el usuario YA pagó, riesgo de denegación de servicio. Ser conservador con qué flagear.
5. **Backup test que nunca corrés**: backups que no se prueban = backups que no existen. Cron quarterly que valida restore en staging.

---

**Próximo doc:** `budget.md`.
