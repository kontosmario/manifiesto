# Universal Links + App Links

> **Setup**: 2026-06-11 como parte de Sprint P · P-1 (close scheme hijacking vector).
> **Status**: ✅ LIVE en producción.
> **Reemplaza/complementa**: el scheme `manifiesto://` que sigue siendo fallback para flows OAuth.

## Qué resuelve

Apple iOS y Android registran custom URL schemes con first-come-first-served — si otra app del App Store registra `manifiesto://` y se instala antes que Manifiesto, intercepta los callbacks de auth (magic-link tokens, OAuth codes). Universal Links / App Links cierran ese vector porque están bindeados criptográficamente al bundle ID + el dominio que controlamos.

**Threat scenario cerrado**: malicious app intercepta `manifiesto://auth/callback?token=...` y exfiltra el token. Después del Universal Links setup, iOS abre directamente la app real (verificada via AASA) sin pasar por el chooser dialog.

## Arquitectura

```
Email link / OAuth redirect
        ↓
https://manifiestoapp.com/auth/callback?token=...
        ↓
iOS: lee AASA, verifica binding → abre Manifiesto app directamente
Android: lee assetlinks.json, verifica binding → abre Manifiesto app directamente
        ↓
mobile/screens/auth/auth-callback-screen.tsx procesa el token (PKCE flow)
```

## Componentes

### 1. Site repo (`kontosmario/manifiestoapp-site`)

Hosted en Cloudflare Pages con dominio custom `manifiestoapp.com`. Los archivos `.well-known/` viven en la raíz del sitio:

```
manifiestoapp-site/
├── .well-known/
│   ├── apple-app-site-association   # iOS Universal Links (no .json extension)
│   └── assetlinks.json              # Android App Links
├── _headers                          # Cloudflare Pages: forzar Content-Type
└── ... (resto del sitio público)
```

#### `apple-app-site-association` (iOS)

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["ZKYQF7UNYA.com.manifiesto.mobile.ZKYQF7UNYA"],
        "components": [
          {
            "/": "/auth/*",
            "comment": "Universal Link auth callback handler (Supabase OAuth + magic link)."
          }
        ]
      }
    ]
  },
  "webcredentials": {
    "apps": ["ZKYQF7UNYA.com.manifiesto.mobile.ZKYQF7UNYA"]
  }
}
```

- `appIDs`: formato `<TeamID>.<bundleID>`. El bundle ID tiene el sufijo `.ZKYQF7UNYA` por la auto-asignación de Apple Developer Portal en 2026-06-09.
- `components: "/": "/auth/*"`: intercepta cualquier path bajo `/auth/`. Permite expansión futura (auth/reset, auth/verify, etc).
- `webcredentials`: habilita auto-fill de Sign in with Apple credentials para esta app + dominio.

#### `assetlinks.json` (Android)

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.manifiesto.mobile.ZKYQF7UNYA",
    "sha256_cert_fingerprints": ["PLACEHOLDER_REPLACE_WITH_PLAY_CONSOLE_SHA256"]
  }
}]
```

> ⚠️ **SHA256 placeholder**: hasta que Android sea publicado en Play Store, el fingerprint real (App signing key certificate fingerprints → SHA-256) no está disponible. Cuando se publique Android:
> 1. Play Console → Setup → App integrity → App signing key certificate → SHA-256
> 2. Replace `PLACEHOLDER_REPLACE_WITH_PLAY_CONSOLE_SHA256` con el valor real
> 3. Commit + push al site repo
> 4. Verificar con `curl https://manifiestoapp.com/.well-known/assetlinks.json`

#### `_headers` (Cloudflare Pages override)

```
/.well-known/apple-app-site-association
  Content-Type: application/json
  X-Content-Type-Options: nosniff

/.well-known/assetlinks.json
  Content-Type: application/json
  X-Content-Type-Options: nosniff
```

> 📝 **Por qué**: Apple iOS rechaza el AASA si no llega con `Content-Type: application/json`. El AASA no tiene extensión `.json` por convención (Apple así lo especifica), entonces el content-sniffing default de Cloudflare lo serviría como `application/octet-stream` (rechazado por iOS). El `_headers` override fuerza el MIME correcto.

### 2. Mobile config (`app.config.ts` en repo principal)

```ts
ios: {
  bundleIdentifier: 'com.manifiesto.mobile.ZKYQF7UNYA',
  associatedDomains: ['applinks:manifiestoapp.com'],
  // ...
},
android: {
  intentFilters: [
    {
      action: 'VIEW',
      autoVerify: true,
      data: [
        { scheme: 'https', host: 'manifiestoapp.com', pathPrefix: '/auth' },
      ],
      category: ['BROWSABLE', 'DEFAULT'],
    },
    // KEEP existing manifiesto:// scheme intent filter as fallback
  ],
},
```

`autoVerify: true` en Android le dice al OS que verifique el binding al instalar/actualizar la app. Si falla la verificación (assetlinks.json no responde o no matchea), Android cae al chooser dialog — degradación segura.

### 3. Supabase Auth config

Vía Dashboard (https://supabase.com/dashboard/project/<ref>/auth/url-configuration):

- **Site URL**: `https://manifiestoapp.com`
- **Redirect URLs** (allowlist):
  - `manifiesto://auth/callback` (legacy scheme — preserve)
  - `manifiesto://auth/**` (scheme wildcard — defensive)
  - `https://manifiestoapp.com/auth/callback` (Universal Link)
  - `https://manifiestoapp.com/auth/**` (Universal Link wildcard — defensive)

> 📝 El config.toml local (`supabase/config.toml`) tiene valores de DEV (127.0.0.1). **No correr** `supabase config push --linked` sin antes haber actualizado el local con los valores prod — el push sobrescribe TODA la sección [auth] en prod.

## Verificación end-to-end

```bash
# 1. AASA accesible + Content-Type correcto
curl -sI https://manifiestoapp.com/.well-known/apple-app-site-association | grep -E "HTTP|content-type"
# Expected: HTTP/2 200 + content-type: application/json

# 2. assetlinks accesible
curl -sI https://manifiestoapp.com/.well-known/assetlinks.json | grep -E "HTTP|content-type"
# Expected: HTTP/2 200 + content-type: application/json

# 3. Content válido
curl -s https://manifiestoapp.com/.well-known/apple-app-site-association | python3 -m json.tool
# Expected: valid JSON con applinks.details[0].appIDs incluyendo el TeamID+bundleID

# 4. iOS validator (Apple AASA validator)
# Web: https://search.developer.apple.com/appsearch-validation-tool/
# Input: https://manifiestoapp.com
# Expected: Universal Links binding válido

# 5. Android validator (Google Digital Asset Links tester)
# Web: https://developers.google.com/digital-asset-links/tools/generator
# Input: https://manifiestoapp.com + bundle ID + cert fingerprint
# Expected: assetlinks.json válido (después de replace del placeholder)
```

## Trade-offs y residuales aceptados

- **Scheme fallback `manifiesto://`**: lo mantenemos en el allowlist porque algunos OAuth providers (especialmente en flows web embebidos) usan el scheme directamente sin pasar por Universal Links. La verificación criptográfica del Universal Link es el primary defense; el scheme es el secondary.
- **Android Placeholder SHA256**: hasta el Android launch, el binding no es funcional en Android. iOS está 100% operativo. Bloqueante solo para Android v1.0.
- **Universal Clipboard exclusion silently dropped** (`expo-clipboard` 8.x bug): la opción `excludeFromUniversalClipboard` se ignora en la versión actual; invite codes siguen sincronizando a Universal Clipboard. Mitigado por TTL del invite + low-impact. Re-test post-SDK 56 bump.

## Rotación / mantenimiento

- **Cuando cambia el TeamID o bundle ID** (no debería pasar en años): update `appIDs` en AASA + `package_name` en assetlinks + commit + push site repo.
- **Cuando se publica Android**: replace SHA256 placeholder con Play Console fingerprint (ver §"assetlinks.json" arriba).
- **Cuando expira el cert de Play signing** (cada 25 años por default): regenerar fingerprint en Play Console, actualizar assetlinks.

## Referencias

- [Apple — Supporting Associated Domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
- [Android — Verify Android App Links](https://developer.android.com/training/app-links/verify-android-applinks)
- [Sprint P · P-1 milestone](../ESTADO-DEL-PROYECTO/2026-06-11-security-hardening-FINAL.md#sprint-p-—-audit-9-fixes-7-commits)
- Site repo: https://github.com/kontosmario/manifiestoapp-site
