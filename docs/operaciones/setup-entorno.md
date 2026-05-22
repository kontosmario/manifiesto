# Setup y entorno de desarrollo

> 🔧 Vigente. Guía operativa para levantar Manifiesto Mobile en local y operar contra Supabase. (Migrado desde el README raíz en la reorganización 2026-05-22.)

## Requisitos
- Node 22
- Docker Desktop
- Xcode para iOS local
- Android Studio para Android local
- Expo Go o un development build
- Dispositivo físico para probar push notifications

## Variables de entorno
Crear `.env` a partir de `.env.example`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
EXPO_PUBLIC_EAS_PROJECT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

> **Nota:** `EXPO_PUBLIC_AUTH_REDIRECT_PATH` fue eliminada en el hardening 2026-05-10. El redirect path está hardcodeado en `mobile/features/auth/auth-flow.ts` — no leer de env para prevenir un override que misdirija los mails de confirmación.

## Levantar la app
```bash
nvm use 22
npm install
npm run start
```

Atajos:

```bash
npm run ios
npm run android
```

## Scripts
```bash
npm run start
npm run ios
npm run android
npm run lint
npm run typecheck
npm run supabase -- --version
npm run supabase:remote:login
npm run supabase:remote:link
npm run supabase:db:push
npm run supabase:functions:deploy
```

## Configuración de Supabase
La CLI de Supabase ya queda instalada como dependencia local del proyecto. No hace falta instalar nada global.

Chequeo rápido:

```bash
npm run supabase -- --version
```

Como el foco del repo es operar contra el proyecto online, hay un wrapper remoto que lee credenciales desde `.env.supabase`.

1. Crear `.env.supabase` a partir de `.env.supabase.example`.
2. Completar:
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_DB_PASSWORD`
   - `SUPABASE_PROJECT_REF` ya viene sembrado con el ref actual del proyecto.
3. `.env.supabase` queda ignorado por git; es sólo para operar la CLI desde este repo.

Flujo remoto recomendado:

```bash
npm run supabase:remote:login
npm run supabase:remote:link
npm run supabase:remote:db:push
npm run supabase:remote:functions:deploy
```

También podés usar el wrapper genérico:

```bash
npm run supabase:remote -- db pull
npm run supabase:remote -- secrets set CLAVE=valor
npm run supabase:remote -- functions deploy send-family-push
```

Si querés saltear el wrapper, la CLI base sigue disponible:

```bash
npm run supabase -- migration new nombre_de_migracion
npm run supabase -- db diff
npm run supabase -- functions logs send-family-push --project-ref xaquigyhylzvuyfslkqq
```

Notas:
- `supabase:remote:login` usa `SUPABASE_ACCESS_TOKEN`.
- `supabase:remote:db:push` y `db pull` usan `SUPABASE_DB_PASSWORD`.
- `functions deploy` usa `SUPABASE_PROJECT_REF` y no depende del stack local.
- Las migraciones del proyecto viven en `supabase/migrations/`.
- `sql/supabase.sql` sigue siendo el snapshot completo del esquema, pero el flujo normal ahora debería pasar por migraciones + CLI.

Configuración funcional mínima del proyecto remoto:
- Habilitar `Authentication -> Providers -> Email`.
- En `Authentication -> URL Configuration`, agregar `manifiesto://auth/callback`.

## Email de confirmación
- El template local de registro vive en `supabase/templates/confirmation.html`.
- Los templates futuros de `reset password` y `magic link` viven en `supabase/templates/recovery.html` y `supabase/templates/magic-link.html`.
- `supabase/config.toml` ya apunta ese template a `auth.email.template.confirmation`.
- También quedaron configurados `auth.email.template.recovery` y `auth.email.template.magic_link`.
- En local, `auth.email.enable_confirmations = true`, así que el signup requiere confirmar el email antes de iniciar sesión.
- Para ver el correo durante desarrollo local, levantá Supabase y abrí Inbucket en `http://127.0.0.1:54324`.
- Hoy la UI de la app no expone `magic link` ni `reset password` desde todos los flujos, pero el branding del mail ya queda preparado.
- Si querés usar el mismo diseño en el proyecto remoto administrado por Supabase:
  - copiar los HTML a `Authentication -> Email Templates -> Confirm signup`, `Reset password` y `Magic Link`,
  - configurar SMTP propio en `Authentication -> Settings -> SMTP`,
  - y mantener `manifiesto://auth/callback` dentro de `URL Configuration`.

## Push notifications mobile
La tabla `push_subscriptions` soporta `provider = 'expo'` y la edge function puede enviar notificaciones a Expo Push.

Secrets mínimos de la Edge Function:

```bash
npm run supabase:remote -- secrets set SUPABASE_URL=https://tu-proyecto.supabase.co
npm run supabase:remote -- secrets set SUPABASE_ANON_KEY=<tu_anon_key>
npm run supabase:remote -- secrets set SUPABASE_SERVICE_ROLE_KEY=<tu_service_role_key>
```

Secrets opcionales si querés seguir soportando suscripciones web heredadas:

```bash
npm run supabase:remote -- secrets set WEB_PUSH_VAPID_PUBLIC_KEY=<public_key>
npm run supabase:remote -- secrets set WEB_PUSH_VAPID_PRIVATE_KEY=<private_key>
npm run supabase:remote -- secrets set WEB_PUSH_CONTACT_EMAIL=tu-email@dominio.com
```

Notas:
- Expo Push requiere dispositivo físico.
- Para obtener un token estable del proyecto, completá `EXPO_PUBLIC_EAS_PROJECT_ID`.
- `eas.json` ya viene preparado con perfiles `preview` y `production` (no tiene perfil `development` explícito — usar `expo start` para desarrollo local).
- El push iOS está bloqueado por la falta del Apple Developer Program — ver [push-notifications-ios-setup.md](push-notifications-ios-setup.md).

## Auth y deep linking
- La app usa el scheme `manifiesto://`.
- El callback de confirmación/email entra por `manifiesto://auth/callback`.
- El redirect path está hardcodeado en `mobile/features/auth/auth-flow.ts` (no configurable por env — hardening 2026-05-10).

## CI
El workflow de verificación mobile vive en `.github/workflows/mobile-ci.yml` y corre:
- `npm run lint`
- `npm run typecheck`

> Los tests (Vitest + Playwright) existen pero **no corren en CI** — ver [el snapshot 07](../ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/07-backend-servicios-db.md).

<!-- ✓ Contrastado contra código el 2026-05-22 -->
