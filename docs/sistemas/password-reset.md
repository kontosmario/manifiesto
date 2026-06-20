# Password reset — flujo end-to-end

> Implementado 2026-06-11. Complementa `universal-links.md` (la infra de
> dominios) y `auth-flow.md` (la máquina de estados).

## Flujo completo

```
Forgot password (app) → resetPasswordForEmail(redirectTo)
        ↓ email
https://<proyecto>.supabase.co/auth/v1/verify?token=...&type=recovery&redirect_to=...
        ↓ tap en Mail → Safari → 302 al redirect_to
https://manifiestoapp.com/auth/reset-password?code=...   (landing del sitio)
        ↓ JS rebota a manifiesto://auth/reset-password?code=... (+ botón manual)
app/auth/reset-password.tsx → ResetPasswordScreen
        ↓ exchange PKCE + re-auth gate (PIN/biometría si existen) + form
contraseña nueva seteada → home
```

## Piezas

| Pieza | Dónde | Nota |
|---|---|---|
| `redirectTo` | `mobile/features/auth/auth-flow.ts` → `getPasswordResetRedirectTo()` | Builds reales: Universal Link `https://manifiestoapp.com/auth/reset-password` (en el allowlist `auth/**`). Expo Go: `exp://...` via `Linking.createURL` — ver caveat abajo. |
| Landing web | `manifiestoapp-site/auth/reset-password.html` | Rebota a la app preservando `?code=`; botón manual + fallback sin app. **Por qué existe**: iOS NO dispara Universal Links desde redirects 302 — el verify de Supabase siempre aterriza en Safari primero. |
| Pantalla | `mobile/screens/auth/reset-password-screen.tsx` (ruta `app/auth/reset-password.tsx`) | Exchange PKCE, re-auth gate (G-Auth1), fricción fresh-install, política de contraseña, screen-capture protection. |

## Fallback por código OTP (2026-06-20)

Para que el reset funcione SIN depender del deep-link/Universal Link (que no abre
la app en Expo Go, y que iOS no dispara desde el redirect 302 de Supabase), el
mail incluye además un **código de 6 dígitos**. Flujo:

```
forgot-password (estado "sent") → campo "¿El link no te abrió la app?" + código
        ↓ router.replace('/auth/reset-password', { email, otp })
reset-password → verifyOtp({type:'recovery'}) → MISMA sesión de recovery que el PKCE
        ↓ (de acá en adelante, idéntico al path del link)
re-auth gate (PIN/biometría) + fricción fresh-install + form + política → home
```

- **Por qué es seguro**: NO baja la seguridad — el gate de PIN/biometría no se
  toca. El código solo reemplaza al link como forma de *entrar* (mismo token
  single-use, mismo TTL de 1h, mismo rate-limit de Supabase). El re-auth gate y
  la fricción fresh-install siguen aplicando antes de `updateUser({password})`.
- **Por qué funciona en todos lados**: no usa schemes ni AASA → idéntico en Expo
  Go, dev build y TestFlight.
- Piezas: `useVerifyRecoveryOtp` ([`use-auth-actions.ts`](../../mobile/features/auth/use-auth-actions.ts)),
  campo de código en [`forgot-password-screen.tsx`](../../mobile/screens/auth/forgot-password-screen.tsx),
  branch `otp` en [`reset-password-screen.tsx`](../../mobile/screens/auth/reset-password-screen.tsx).

> **✅ HECHO 2026-06-20** (Management API `PATCH /v1/projects/{ref}/config/auth`
> → `mailer_templates_recovery_content`, autorización owner): el template de
> **Recovery** ahora muestra el código — bloque *"¿No se abrió la app? Ingresá
> este código: `{{ .Token }}`"* justo después del botón, on-brand (peach
> `#F2B58A`, centrado). El link (`{{ .ConfirmationURL }}`) sigue funcionando
> igual. Idempotente: re-correr no duplica el bloque.

## Caveat Expo Go

El `exp://192.168.x.x:8081/--/auth/reset-password` de dev NO está en el
allowlist de Supabase → el 302 cae al Site URL (la home del sitio). Era
el bug reportado 2026-06-11 ("nos redirige a manifiesto.com") — en
builds reales ya no pasa (usa el Universal Link). Para probar el flujo
COMPLETO en Expo Go: agregar temporalmente `exp://192.168.*.*:*/**` al
allowlist (Dashboard → Auth → URL Configuration) y quitar al terminar.
La pantalla en sí se puede probar siempre abriendo el deep link a mano.

> **Actualización 2026-06-20**: con el **fallback por código OTP** (sección
> arriba) ya no hace falta el allowlist hack para probar en Expo Go — el código
> de 6 dígitos entra directo en la app, sin deep-link. Es el camino recomendado
> para testear el flujo completo en cualquier entorno.

## Runbook — email desde soporte@manifiestoapp.com (OWNER ACTION)

Hoy el mail sale del SMTP built-in de Supabase (`noreply@mail.app.supabase.io`,
rate-limited a ~2/hora y con branding Supabase). Para que salga de
`soporte@manifiestoapp.com`:

1. **Proveedor de envío** (recomendado: Resend — free tier 3k emails/mes,
   integra simple con Cloudflare DNS):
   - Crear cuenta en resend.com → Domains → Add `manifiestoapp.com`.
   - Resend muestra 3-4 registros DNS (SPF TXT, DKIM CNAME/TXT, opcional
     DMARC). Cargarlos en Cloudflare → DNS del dominio. Verificar en
     Resend (tarda minutos).
   - API Keys → crear key con permiso "Sending access".
2. **Supabase Dashboard** → Project Settings → Authentication → **SMTP
   Settings** → Enable Custom SMTP:
   - Host: `smtp.resend.com` · Port: `465` · Username: `resend`
   - Password: la API key de Resend
   - Sender email: `soporte@manifiestoapp.com` · Sender name: `Manifiesto`
3. ~~**Templates en español**~~ ✅ HECHO 2026-06-11 vía Management API
   (autorización owner): subjects + bodies brandeados en español para
   **Recovery** ("Restablecé tu contraseña de Manifiesto") y
   **Confirmation** ("Confirmá tu email para entrar a Manifiesto") —
   fondo `#0E3A26`, wordmark, botón cream al `{{ .ConfirmationURL }}`.
   Editables en Dashboard → Auth → Email Templates.
4. **Responder a soporte@**: el email forwarding de Cloudflare ya rutea
   `soporte@manifiestoapp.com` → inbox del owner (setup 2026-06-10), así
   que los replies de usuarios llegan.
5. Verificar: pedir un reset real → el mail llega de
   `soporte@manifiestoapp.com`, sin warning de spam (SPF/DKIM verdes en
   "mostrar original").

## Deploy de la landing

✅ LIVE 2026-06-11: `manifiestoapp-site` commits `31b2220` + `5ce5c06`
(desktop-aware) pusheados; verificado
`curl -sI https://manifiestoapp.com/auth/reset-password` → 200.

## Observaciones del config prod (2026-06-11, no tocadas)

- `mailer_autoconfirm: true` — los signups por email NO requieren
  confirmación (sesión inmediata). El template de confirmación aplica a
  los flujos que sí la disparan. Si algún día se quiere confirmación
  obligatoria, flipear en Dashboard → Auth → Providers → Email.
- `password_min_length: 6` server-side — el cliente exige 10 (Sprint
  H·H1, defensa local más estricta, decisión documentada).
