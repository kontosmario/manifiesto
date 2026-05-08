# Security pendings — 2026-05-08

Acciones diferidas del hardening del 2026-05-07/08. **Ninguna es bloqueante**: el escudo crítico (RLS, RPCs, edge functions, secure storage, PKCE) ya está en producción. Estas son mejoras de defensa-en-profundidad que requieren UI del dashboard, plan Pro, o cambios en cliente.

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

## Apéndice: lo que YA está cerrado y desplegado

Solo para referencia (no son pendings, ya están en producción):

- ✅ Migrations [20260510000000_security_hardening_rls.sql](../../supabase/migrations/20260510000000_security_hardening_rls.sql) y [20260510000100_security_hardening_rate_limits.sql](../../supabase/migrations/20260510000100_security_hardening_rate_limits.sql)
- ✅ Edge functions `send-family-push` y `control-advisor` redeployadas con sanitización + rate limit
- ✅ Cliente: SecureStore para JWT, exclusión de queries financieras del persister, biometric con refresh token, PKCE, route allowlist, redirect-path hardcoded
- ✅ `.githooks/pre-commit` activo (con `git config core.hooksPath .githooks`)
- ✅ PAT y DB password rotados (2026-05-08)
- ✅ `chmod 600 .env*`
