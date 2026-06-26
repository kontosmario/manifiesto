# Plantillas de email de Supabase Auth — ES + EN (owner action)

> **Qué es:** los emails transaccionales de auth (recovery, confirmación, etc.) viven en
> el **dashboard de Supabase** (Authentication → Emails → Templates), NO en el repo.
> Supabase manda **una** plantilla por tipo; no cambia el idioma por usuario salvo que
> se implemente un **Send Email Auth Hook** (custom SMTP/función). Para v1 entregamos
> plantillas **bilingües** (ES arriba / EN abajo) — cubren ambos públicos sin hook.
>
> **Cómo aplicarlo:** Supabase Dashboard → Authentication → Emails → cada template →
> pegar el HTML de abajo → Save. Conservar las variables `{{ .Token }}` / `{{ .ConfirmationURL }}`.
>
> **Mejora futura (no v1):** per-idioma real con un *Send Email Hook* que lea
> `profiles.preferred_language` y elija ES/EN. Documentado al pie.

---

## 1. Reset de contraseña (Recovery) — usa OTP `{{ .Token }}`

**Subject:** `Tu código de Manifiesto · Your Manifiesto code`

```html
<h2>Restablecer tu contraseña</h2>
<p>Usá este código para restablecer tu contraseña. Vence en 1 hora.</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
<p>Si no pediste esto, ignorá este mensaje.</p>
<hr>
<h2>Reset your password</h2>
<p>Use this code to reset your password. It expires in 1 hour.</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
<p>If you didn't request this, you can ignore this message.</p>
```

## 2. Confirmar registro (Confirm signup)

**Subject:** `Confirmá tu cuenta · Confirm your account`

```html
<h2>Confirmá tu cuenta</h2>
<p>Tocá el botón para confirmar tu email y empezar a usar Manifiesto.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar mi cuenta</a></p>
<hr>
<h2>Confirm your account</h2>
<p>Tap the button to confirm your email and start using Manifiesto.</p>
<p><a href="{{ .ConfirmationURL }}">Confirm my account</a></p>
```

## 3. Magic Link

**Subject:** `Tu acceso a Manifiesto · Your Manifiesto sign-in`

```html
<h2>Iniciar sesión</h2>
<p>Tocá el enlace para entrar a Manifiesto. Vence en poco tiempo.</p>
<p><a href="{{ .ConfirmationURL }}">Entrar a Manifiesto</a></p>
<hr>
<h2>Sign in</h2>
<p>Tap the link to sign in to Manifiesto. It expires soon.</p>
<p><a href="{{ .ConfirmationURL }}">Sign in to Manifiesto</a></p>
```

## 4. Cambio de email (Change Email Address)

**Subject:** `Confirmá tu nuevo email · Confirm your new email`

```html
<h2>Confirmá tu nuevo email</h2>
<p>Tocá el botón para confirmar el cambio de tu dirección de correo.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar el cambio</a></p>
<hr>
<h2>Confirm your new email</h2>
<p>Tap the button to confirm your email address change.</p>
<p><a href="{{ .ConfirmationURL }}">Confirm the change</a></p>
```

## 5. Reautenticación (Reauthentication) — OTP

**Subject:** `Código de verificación · Verification code`

```html
<h2>Código de verificación</h2>
<p>Ingresá este código para confirmar que sos vos.</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
<hr>
<h2>Verification code</h2>
<p>Enter this code to confirm it's you.</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
```

---

## Mejora futura — localización real por usuario (no v1)
Implementar un **Send Email Hook** (Auth Hooks → Send Email) que:
1. Reciba el evento de email + el `user_id`.
2. Lea `profiles.preferred_language` (ya existe).
3. Renderice la plantilla ES **o** EN según ese valor (no bilingüe).
Requiere una edge function + configurar el hook + (idealmente) SMTP propio. Costo medio;
las plantillas bilingües de arriba lo cubren para el launch.
