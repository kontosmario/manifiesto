# Security pendings — 2026-05-08

Acciones diferidas del hardening del 2026-05-07/08. **Ninguna es bloqueante**: el escudo crítico (RLS, RPCs, edge functions, secure storage, PKCE) ya está en producción. Estas son mejoras de defensa-en-profundidad que requieren UI del dashboard, plan Pro, o cambios en cliente.

---

## 🛡 Estado actual — 2026-05-08

### Cerrado y desplegado en producción

| Vector | Estado | Notas |
|---|---|---|
| 5 vulnerabilidades **críticas** del audit principal | ✅ | RLS bypass, notif spoofing, edge billing abuse, JWT plaintext, financial cache plaintext |
| 8 vulnerabilidades **alta/media** del audit principal | ✅ | RPCs en blocked members, realtime fan-out, gateway-header spoof, biometric password, PKCE-only callback, etc. |
| 5 vulnerabilidades **alta/media** del advisor layer | ✅ | ADV-1 a ADV-5: jsonb caps, rate limits, blocked-member exclusion, SELECT own-only, prune cron |
| **L-1 native iOS** (`NSAllowsLocalNetworking`) | ✅ | Removida del `Info.plist` |
| **`legacy-web-src/`** | ✅ | Confirmado dead code (zero imports activos) |
| **`control-advisor`** edge function | ✅ | Eliminada de producción (era zombie — nunca se invocaba desde el cliente) |
| **PAT y DB password** | ✅ | Rotados 2026-05-08 |
| **Pre-commit secret scanner** | ✅ | `.githooks/pre-commit` activo |
| **3 migrations** de hardening | ✅ | Deployadas a producción |

### Pendings reales que quedan (no bloqueantes)

> **Nota 2026-05-22 — vuln RLS `expenses` ABIERTA:** las policies `expenses_update_members` y `expenses_delete_members` (baseline migration `20260413154000`) usan `is_family_member(family_id)` sin restricción de `created_by`. Cualquier miembro activo puede editar o borrar gastos de otro miembro de la misma familia. Ninguna migración posterior la tighteneó. Ver §15 abajo.

| # | Item | Severidad | Esfuerzo | Sección |
|---|---|---|---|---|
| 15 | RLS expenses: cualquier miembro edita/borra gastos ajenos | **High** | ~30 min migration | [§15](#15-rls-expenses-cualquier-miembro-editaborra-gastos-ajenos) |
| 1 | Password policy (10 chars + complejidad) | Medium | 30s | [§1](#1-password-policy-dashboard-30s) |
| 5 | Verificar usuario `aye.tello18` en prod | Medium | 1 min | [§5](#5-verificación-del-usuario-de-test-ayetello18gmailcom) |
| 9 | Universal Links iOS (en lugar de custom scheme) | Medium | requiere dominio | [§9](#9-universal-links-en-lugar-de-custom-scheme-ios--m-2) |
| 11 | Android prebuild + audit del manifest | Medium | antes de Play Store | [§11](#11-android-prebuild--audit-del-manifest) |
| 2 | Captcha (con build update) | Medium | 15 min + build | [§2](#2-captcha-en-auth-dashboard--cambios-en-cliente) |
| 14 | Verificación manual vía SQL Editor | Low | 5 min | [§14](#14-verificar-manualmente-vía-sql-editor-cobertura-del-cli) |
| 3 | HIBP (plan Pro) | Low | 1 toggle | [§3](#3-hibp-leaked-password-protection-dashboard-10s) |
| 4 | Realtime private channels (confirmar) | Low | 1 click | [§4](#4-realtime-private-channels--rls-aware-subscriptions-dashboard-1-click) |
| 10 | APNs entitlement Release split | Low | requiere build local | [§10](#10-apns-entitlement--development-en-disco--m-1) |
| 6 | gitleaks "real" en lugar del shell scanner | Optional | 5 min | [§6](#6-pre-commit-secret-scanner--upgrade-a-gitleaks-real) |
| 7 | Limpieza de git history | Optional | 10 min | [§7](#7-limpieza-opcional-del-git-history-destructivo) |
| 12 | ~~Borrar `legacy-web-src/`~~ | ~~Optional~~ | ~~1 comando~~ | ✅ Eliminado (2026-05-22) — ver §12 |
| 13 | Network restrictions Postgres | Optional | 1 toggle | [§13](#13-network-restrictions-de-postgres-drift) |

### Posture honesto

**Estás MUY arriba del baseline de cualquier app financiera mobile-first típica.** Los vectores de ataque "atacante motivado puede vaciarte la base / facturarte miles de USD en Anthropic / leakear datos cross-family / spoofear notifs" están todos cerrados. Lo que queda es defensa en profundidad — endurecimientos que mueven la aguja gradualmente, no parches críticos.

**Para auditar este escudo en el futuro**: las migrations relevantes están en [`supabase/migrations/20260510*`](../../supabase/migrations/) y [`supabase/migrations/20260511000000_advisor_layer_hardening.sql`](../../supabase/migrations/20260511000000_advisor_layer_hardening.sql). El cliente: `mobile/lib/supabase-secure-storage.ts`, `mobile/lib/biometric-auth.ts`, `mobile/lib/query-client.ts`, `mobile/utils/routes.ts`. Recomendado re-auditar cada ~3 meses o cuando haya cambios grandes en RLS, auth, o edge functions.

---

## 1. Password policy (dashboard, ~30s)

**Estado:** pendiente
**Ubicación:** [Auth → Providers → Email](https://supabase.com/dashboard/project/xaquigyhylzvuyfslkqq/auth/providers)
**Cambios:**
- Minimum password length: `6` → `10`
- Password requirements: `(none)` → `lower_upper_letters_digits`

**Cierra:** AB-7 (credential stuffing con passwords débiles).
**Riesgo si no se hace:** medio. Botnets pueden probar 6-char passwords contra cuentas conocidas; el rate limit de Supabase Auth (30/5min/IP) frena la velocidad pero no bloquea desde /16 + proxies.
**Pre-requisito:** ninguno.

---

## 2. Captcha en Auth (dashboard + cambios en cliente)

**Estado:** diferido — requiere build nueva del cliente
**Ubicación:** Auth → Settings → Attack Protection → Captcha
**Cambios:**
- Activar hCaptcha o Cloudflare Turnstile (recomendado: Turnstile, gratis, sin friction visible)
- Pegar el secret key del provider en el dashboard

**Cliente (necesario antes de habilitarlo en producción):**
- Integrar el SDK del provider (Turnstile tiene RN binding nativo)
- Pasar el captcha token a `supabase.auth.signUp({ ..., options: { captchaToken } })` y `signInWithPassword({ ..., options: { captchaToken } })`
- Pasarlo también a `resetPasswordForEmail`
- Probar el fallback cuando el captcha no resuelve (red lenta, reintentos)

**Cierra:** AB-7 (signup abuse vía botnet) + email enumeration parcial.
**Riesgo si no se hace:** medio. Sin captcha, un atacante puede mintear cuentas anónimas y enumerar emails. Combinado con `enable_signup = true` esto facilita reconocimiento.
**⚠️ No habilitar sin el cliente actualizado:** rompe todos los signups y logins inmediatamente.

---

## 3. HIBP "Leaked password protection" (dashboard, ~10s)

**Estado:** pendiente — verificar si requiere plan Pro
**Ubicación:** misma sección que la password policy
**Cambios:** activar el toggle "Have I Been Pwned" / "Leaked password protection"

**Cierra:** AB-7 reuse de passwords filtradas en breaches públicos.
**Riesgo si no se hace:** bajo-medio. Sin esto, un usuario puede setear una password que ya está en HaveIBeenPwned. Toda la red puede probar credentials breach lists.
**Pre-requisito:** plan **Supabase Pro** o superior. Si estamos en Free, este toggle no aparece.

---

## 4. Realtime "private channels" / RLS-aware subscriptions (dashboard, ~1 click)

**Estado:** confirmar — probablemente ya está OK
**Ubicación:** Realtime / Database → Replication
**Cambios:** confirmar que las suscripciones `postgres_changes` aplican RLS

**Cierra:** completa el fix de BE-3 (filtro per-user de `notifications` en realtime). La migration ya tightenó la policy SELECT; este toggle asegura que ese filtro aplique también en suscripciones streamed.
**Riesgo si no se hace:** bajo en versiones recientes de Supabase Realtime (postgres_changes honra RLS por default desde mediados de 2024). Validación rápida: con un usuario A suscrito a `notifications` para `family_id = X`, insertar una row con `user_id = <usuario B>` y verificar que A NO la recibe.

---

## 5. Verificación del usuario de test `aye.tello18@gmail.com`

**Estado:** pendiente — la query a `auth.users` quedó bloqueada por sandbox de IA por contener PII. Hacerlo manualmente.
**Ubicación:** [SQL Editor](https://supabase.com/dashboard/project/xaquigyhylzvuyfslkqq/sql/new)
**Comando:**
```sql
select id, email, email_confirmed_at, created_at
from auth.users
where email = 'aye.tello18@gmail.com';
```

Si aparece un row → eliminarlo o forzar reset:
```sql
delete from auth.users where email = 'aye.tello18@gmail.com';
```

**Por qué importa:** [scripts/_create-test-user.sql](../../scripts/_create-test-user.sql) tenía `crypt('123456', gen_salt('bf'))` literal en git history. Cualquier ambiente donde se haya ejecutado tiene un usuario auto-confirmado con password `123456`. El script ya está parametrizado, pero hay que verificar que prod no haya recibido esa ejecución.

---

## 6. Pre-commit secret scanner — upgrade a `gitleaks` real

**Estado:** funcionando con scanner shell-native ([.githooks/pre-commit](../../.githooks/pre-commit))
**Mejora opcional:**
- Instalar `gitleaks` propiamente cuando haya `brew` disponible o vía descarga directa del binario:
  ```
  curl -L https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_8.x.x_darwin_arm64.tar.gz | tar xz
  sudo mv gitleaks /usr/local/bin/
  ```
- Reemplazar el contenido de `.githooks/pre-commit` por:
  ```bash
  #!/usr/bin/env bash
  gitleaks protect --staged --redact -v
  ```
- O dejar el shell-native como fallback y solo correr gitleaks si está en PATH.

**Por qué:** gitleaks tiene 200+ patrones contra los ~10 del shell-native actual. Cubre AWS, GCP, Azure, Slack, Stripe, Twilio, etc.

---

## 7. Limpieza opcional del `git history` (destructivo)

**Estado:** pendiente — decisión del owner
**Acciones posibles:**
- `asistente financiero.zip` (155KB, fuente legacy duplicada) — ya está staged para deletion, va a salir en el próximo commit. **Ya hecho a medias.**
- `tmp/*` — staged para untrack. Idem.
- **Limpiar history**: si querés borrar el zip y el contenido de `tmp/` también del git history (no solo del HEAD), hay que correr `git filter-repo` o BFG. Esto reescribe history y rompe a cualquiera con clones existentes. **Solo hacelo si vas a trabajar solo o vas a coordinar con el equipo.**

---

---

## Updates 2026-05-08 — coverage gaps audit

Auditamos las 4 zonas que el primer audit no había cubierto. Detalle:

### 8. ~~ANTHROPIC_API_KEY missing en producción~~ — RESUELTO 2026-05-08

**Estado:** ✅ cerrado por **eliminación de la función**.

La auditoría detectó que `control-advisor` (que requería ese secret) estaba deployada pero **nunca se invocaba desde el cliente** — los únicos usos del string `'control-advisor'` eran metadatos de notificación / query keys de TanStack, no llamadas reales. La función fue **eliminada de producción** (`supabase functions delete control-advisor`), eliminando:
- la dependencia del secret faltante
- el attack surface de un endpoint deployado-pero-zombie
- la confusión sobre si la función estaba "en uso"

El código fuente sigue en [`supabase/functions/control-advisor/`](../../supabase/functions/control-advisor/) para retomarlo si se decide cablear el asistente con Claude más adelante. Para reactivarlo en el futuro:
1. Cablear `supabase.functions.invoke('control-advisor', ...)` desde la pantalla de Control
2. `./scripts/npmw run supabase:remote -- secrets set ANTHROPIC_API_KEY=<value>`
3. `supabase functions deploy control-advisor`

### 9. Universal Links en lugar de custom scheme (iOS) — M-2

**Estado:** pendiente — requiere dominio + apple-app-site-association
**Riesgo:** custom scheme `manifiesto://` puede ser hijackeado por otra app iOS instalada después. Mitiga session fixation residual.
**Pasos:**
1. Comprar/usar dominio (ej. `manifiesto.app`)
2. Agregar entitlement `com.apple.developer.associated-domains` con `applinks:manifiesto.app`
3. Publicar `https://manifiesto.app/.well-known/apple-app-site-association` (JSON estático, sin redirects, content-type application/json)
4. Migrar Supabase auth redirect URL de `manifiesto://auth/callback` a `https://manifiesto.app/auth/callback`
5. Mantener `manifiesto://` como fallback

### 10. APNs entitlement = `development` en disco — M-1

**Estado:** EAS lo reescribe a `production` en builds de App Store, pero archivos locales (`xcodebuild -configuration Release`) shipan token sandbox.
**Acción:** verificá con `eas build --local --profile production --platform ios` y revisá el `.app/Manifiesto.app.xcent` final. Si el entitlement final quedó como `development`, agregá un `Manifiesto.Release.entitlements` separado y wirealo en `project.pbxproj` con `CODE_SIGN_ENTITLEMENTS[config=Release]`.

### 11. Android prebuild + audit del manifest

**Estado:** **coverage gap** — el repo no tiene `android/`, EAS lo genera al build
**Acción:** antes de la primera submission a Play Store, correr `npx expo prebuild --platform android --clean` y auditar el `android/app/src/main/AndroidManifest.xml` generado:
- `android:exported="false"` en activities/receivers (excepto el LAUNCHER y los intent filters de deep link)
- `android:allowBackup="false"` (sino backup ADB lee SharedPreferences + AsyncStorage)
- `android:usesCleartextTraffic="false"`
- `android:debuggable="false"` en release
- `android:networkSecurityConfig` apuntando a una config sin cleartext

### 12. `legacy-web-src/` — ✅ ELIMINADO (2026-05-22)

**Estado:** ✅ el directorio fue borrado en la limpieza 2026-05-22 (156 archivos eliminados + reorg de docs).
**Pendiente menor:** las exclusiones en `vitest.config.ts` y `eslint.config.js` todavía referencian `legacy-web-src` aunque el directorio ya no existe. No rompen nada (reglas de exclusión inofensivas sin el directorio), pero se pueden limpiar opcionalmente:
```bash
sed -i.bak "/legacy-web-src/d" vitest.config.ts eslint.config.js && rm vitest.config.ts.bak eslint.config.js.bak
```

### 13. Network restrictions de Postgres (drift)

**Estado:** producción permite `0.0.0.0/0` y `::/0` (open). Aceptable porque Supabase no expone Postgres directamente al público — el acceso pasa por PostgREST/CLI con auth. Pero para hardening adicional:
**Acción:** Dashboard → Settings → Database → Network Restrictions → restringir a IPs conocidas (oficina, casa, CI). Solo si tenés acceso desde IPs estables.

### 14. Verificar manualmente vía SQL Editor (cobertura del CLI)

El CLI no puede leer estos por permisos del rol `cli_login_postgres`. En el [SQL Editor](https://supabase.com/dashboard/project/xaquigyhylzvuyfslkqq/sql/new):

```sql
-- Migrations aplicadas
select version, name, statements[1] from supabase_migrations.schema_migrations
where version like '202605%' order by version desc limit 10;

-- Realtime publication
select * from pg_publication_tables where pubname = 'supabase_realtime';

-- pg_cron habilitado
select * from pg_extension where extname = 'pg_cron';

-- statement_timeout en authenticated
select rolname, rolconfig from pg_roles where rolname = 'authenticated';

-- Crons activos
select * from cron.job;
```

### 15. RLS expenses: cualquier miembro edita/borra gastos ajenos

**Estado:** ABIERTO — verificado 2026-05-22
**Severidad:** High
**Descripción:** Las policies `expenses_update_members` y `expenses_delete_members` definidas en la baseline migration (`20260413154000_mobile_baseline.sql`) solo comprueban `is_family_member(family_id)`. Ninguna migración posterior las tighteneó. Esto significa que cualquier miembro activo de la familia puede, via PostgREST directo, editar o borrar gastos de otro miembro de la misma familia.

**Impacto práctico hoy:** con 2 usuarios en prod (ambos de confianza), el riesgo es teórico. Cuando haya más miembros en una familia, un miembro podría borrar o modificar gastos ajenos.

**Fix sugerido:** nueva migration que restrinja UPDATE a `created_by = auth.uid()` (o al owner de la familia) y DELETE ídem. Ejemplo:

```sql
drop policy if exists "expenses_update_members" on public.expenses;
create policy "expenses_update_own"
on public.expenses
for update
to authenticated
using (created_by = auth.uid() or public.is_family_owner(family_id))
with check (created_by = auth.uid() or public.is_family_owner(family_id));

drop policy if exists "expenses_delete_members" on public.expenses;
create policy "expenses_delete_own"
on public.expenses
for delete
to authenticated
using (created_by = auth.uid() or public.is_family_owner(family_id));
```

**Consideración UX:** si se restringe UPDATE+DELETE al owner del gasto, la UI actual que permite al owner de la familia editar gastos de otros debe validarse. Confirmar comportamiento deseado antes de migrar.

---

## Apéndice: lo que YA está cerrado y desplegado

Solo para referencia (no son pendings, ya están en producción):

- ✅ Migrations [20260510000000_security_hardening_rls.sql](../../supabase/migrations/20260510000000_security_hardening_rls.sql) y [20260510000100_security_hardening_rate_limits.sql](../../supabase/migrations/20260510000100_security_hardening_rate_limits.sql)
- ✅ Migration [20260511000000_advisor_layer_hardening.sql](../../supabase/migrations/20260511000000_advisor_layer_hardening.sql) — cierra ADV-1..ADV-5 (jsonb caps, rate limits, blocked-member exclusion en advisor RPCs; SELECT own-only en `advisor_value_log`; `block_advisor_signal` y `dismiss_advisor_signal` RPCs reemplazan writes directos)
- ✅ Edge functions `send-family-push` y `control-advisor` redeployadas con sanitización + rate limit
- ✅ Cliente: SecureStore para JWT, exclusión de queries financieras del persister, biometric con refresh token, PKCE, route allowlist, redirect-path hardcoded, dismiss/block-signal vía RPC
- ✅ iOS: `NSAllowsLocalNetworking` removida de `Info.plist` (cierra L-1)
- ✅ `legacy-web-src/` eliminado del repo (limpieza 2026-05-22) — ver §12 para nota de exclusiones residuales
- ✅ `.githooks/pre-commit` activo (con `git config core.hooksPath .githooks`)
- ✅ PAT y DB password rotados (2026-05-08)
- ✅ `chmod 600 .env*`
- ✅ Account deletion flow completo (migraciones `20260517000000`, `20260518000000`, `20260518010000`): soft-delete 30d, RPC `request_account_deletion` + `cancel_account_deletion`, cron processor, lockdown service_role-only para funciones admin. Cierra App Store Guideline 5.1.1(v).

<!-- ✓ Contrastado contra código el 2026-05-22 -->
