# Runbook · Release automation (Sprint C — C3 / C5 / C6 / C7 / C10)

> Última actualización: 2026-06-09 (post-wizard Apple Developer setup)
> Status: **end-to-end verified** — build 1.0.0 (1) llegó a TestFlight 2026-06-09.
>
> El [doc del milestone](../ESTADO-DEL-PROYECTO/2026-06-09-apple-dev-setup-completed.md) tiene el detalle de IDs, decisiones y gotchas del setup inicial.

## TL;DR

| Workflow | Trigger | Output |
|---|---|---|
| `mobile-ci.yml` → `e2e` | push a `main` + manual | Playwright sobre `expo export --platform web` |
| `mobile-ci.yml` → `gitleaks` | todos | Falla CI si encuentra secretos |
| `release.yml` | tag `v*` + manual | `eas build` iOS + `eas submit` TestFlight |
| `ota-update.yml` | push a `main` (JS-only) + manual | `eas update --branch production` |

## Secrets configurados en GitHub (2026-06-09 ✅)

| Secret | Usado por | De dónde salió | Status |
|---|---|---|---|
| `EXPO_TOKEN` | `release.yml`, `ota-update.yml` | https://expo.dev/accounts/markon07/settings/access-tokens | ✅ |
| `EXPO_APPLE_ID` | `release.yml` (legacy, ya no requerido) | `kontosmario@gmail.com` | ✅ (deprecado en 2026-06-09 — ASC API key reemplaza) |
| `EXPO_ASC_APP_ID` | `release.yml` (legacy) | App Store Connect App ID `6776033487` | ✅ (deprecado — hardcoded en `eas.json`) |
| `ASC_API_KEY_ID` | `release.yml` (submit) | App Store Connect → API key `HUNBRN89BT` | ✅ |
| `ASC_API_KEY_ISSUER_ID` | `release.yml` (submit) | `e2ab69f2-ac94-482a-8e66-7a89f9a3cca4` | ✅ |
| `ASC_API_KEY_P8_BASE64` | `release.yml` (submit) | `base64 -i AuthKey_HUNBRN89BT.p8 \| tr -d '\n' \| pbcopy` | ✅ |
| `SLACK_RELEASE_WEBHOOK` | `release.yml` (opcional) | — | ⚪ no configurado |

**Nota sobre `EXPO_APPLE_ID` / `EXPO_ASC_APP_ID`**: durante el dry-run del 2026-06-09 descubrimos que el syntax `$VAR` no funciona en la sección `submit` del `eas.json` (solo en `build`). El fix fue:
1. Hardcodear `ascAppId: "6776033487"` en `eas.json` (el ID es identifier público, no secret).
2. Remover `appleId` porque ASC API key reemplaza el login con Apple ID.
3. Los secrets siguen en GitHub por compatibilidad histórica pero el workflow ya no los lee.

Ver commit `0ae9081` para el fix.

## Credenciales en EAS (no en GitHub)

| Credential | Donde vive | Cómo se configuró |
|---|---|---|
| Distribution Certificate | EAS servers | `eas credentials` → iOS → production → Build Credentials → "All" (2026-06-09) |
| Provisioning Profile (App Store) | EAS servers | mismo flow (auto-generado), expira 2027-06-09 |
| APNs Push Key | EAS servers | `eas credentials` → Push Notifications → upload `.p8` Key ID `J3525JQHM2` |
| ASC API Key | EAS servers | `eas credentials` → App Store Connect → upload `.p8` Key ID `HUNBRN89BT` |

Los `.p8` originales viven en `~/secrets/manifiesto/` con permisos `600` (machine local del owner). **Si los perdés**:
- APNs: revocar en developer.apple.com → Keys, generar nueva, repetir upload en `eas credentials`.
- ASC: revocar en App Store Connect → API integrations, generar nueva, repetir upload + actualizar GitHub Secrets (`ASC_API_KEY_ID`, `ASC_API_KEY_ISSUER_ID`, `ASC_API_KEY_P8_BASE64`).

## Apple Developer setup (cheat sheet)

| Item | Valor |
|---|---|
| Team ID | `ZKYQF7UNYA` |
| Team name | Mario Kontos (Individual) |
| Bundle ID iOS | `com.manifiesto.mobile.ZKYQF7UNYA` (App Store) |
| Android `package` | `com.manifiesto.mobile` (Android es independiente, sin sufijo) |
| App Store Connect App ID | `6776033487` (numérico, identifier público) |
| Primary language | Spanish (Mexico) |
| Categoría App Store | Finanzas / Economía y empresa |
| Apple ID owner | `kontosmario@gmail.com` |

⚠️ **Sobre el sufijo `.ZKYQF7UNYA` del bundle ID iOS**: es resultado de un auto-provisioning de Apple al crear el App ID. Apple no permite cambiar el bundle ID post-registro y el delete está bloqueado por la entrada de App Store Connect. Decisión documentada en commit `6c94c00`: aceptamos el sufijo porque es invisible al usuario.

## Liberar una versión nueva (full release)

```bash
# 1. Asegurate de estar en main limpio
git checkout main && git pull

# 2. Bump version en app.config.ts (manual o vía `npm version`)
#    + commit
git commit -am "release: v1.0.1"

# 3. Cut el tag
git tag v1.0.1
git push origin main --tags

# 4. Mirá Actions → "Release (EAS build + TestFlight submit)"
#    Toma ~30-45min build + ~5min submit.
```

## Ship un hotfix sin re-submitir (OTA)

```bash
# Solo JS / asset changes (sin tocar package.json / ios/ / android/ / app.config.ts)
git commit -am "fix(home): copy en empty state"
git push origin main

# Actions → "OTA Update (EAS Update)" dispara automaticamente.
# ~3min y el bundle llega a usuarios en su próximo cold-start.
```

Si tocaste `package.json` (incluso dep no-native): el workflow lo skipea por seguridad. Forzá con `workflow_dispatch` después de confirmar que no agregaste deps nativas.

## Agregar un internal tester (App Store Connect)

1. https://appstoreconnect.apple.com/apps/6776033487/testflight/ios
2. Sidebar → **Pruebas internas** → grupo `Equipo` (creado 2026-06-09)
3. **Testers** → `+` → **Añadir desde App Store Connect Users** o agregar email nuevo
4. Si es email nuevo, también hay que registrarlos previamente en https://appstoreconnect.apple.com/access/users con rol "Developer" o "App Manager"

El tester recibe email con link de invitación a TestFlight. No requiere review de Apple.

## Bump version (sin autoIncrement)

`eas.json` ya no tiene `autoIncrement` porque no es compatible con `app.config.ts` dinámico. Bump manual:

```bash
# Editar app.config.ts
#   version: '1.0.0'  → '1.0.1'   (semver bump)
#   ios.buildNumber: '1' → '2'    (si lo agregaste; sino EAS infiere)
git commit -am "release: v1.0.1"
git tag v1.0.1
git push origin main --tags
```

⚠️ Apple App Store rechaza builds con el mismo `version+buildNumber` que ya recibió. Si subís 2 IPAs con `1.0.0 (1)`, el segundo falla en submit. Siempre bumpear al menos uno de los dos.

## Setup zero-to-TestFlight (primera vez)

Si arrancás desde repo limpio en otra Mac, el path mínimo es:

```bash
# 1. EAS login
npx eas-cli login

# 2. Verificar proyecto linkeado
npx eas-cli project:info
# → fullName @markon07/manifiesto, ID 54449767-9236-4734-972a-e561debd1360

# 3. Pull credentials (Distribution Cert + Profile + APNs + ASC)
#    ya están en EAS servers — solo verificás
npx eas-cli credentials
# iOS → production → mostrar Build Credentials → verificar todo presente
```

No hay que volver a generar nada en `eas credentials` — todo vive en EAS servers. La única limitación: si te logueás desde una Mac nueva, EAS te puede pedir el password de Apple Developer una vez para validaciones — los `.p8` siguen funcionando sin re-upload.

## E2E falló en CI

1. Bajá el artifact `playwright-report` del run que falló.
2. Abrí `playwright-report/index.html` localmente.
3. Reproducí local con `npm run test:e2e:ui`.

Los specs viven en `tests/e2e/*.spec.ts`. El job de CI no usa `expo start --web` (lento + flaky en CI) — usa `expo export --platform web` + `serve`.

## gitleaks detectó un secreto

Ver `docs/operaciones/runbook-backend-hardening.md`. Resumen:
1. **Rotar la credencial inmediatamente** (no esperar al fix de git).
2. Reescribir history con `git filter-repo` o `bfg`.
3. Force-push (coordinar con todos los devs).
4. Verificar que el nuevo secreto NO esté en ningún archivo committeado — actualizar `.env.example`.

Patrones custom en `.gitleaks.toml`:
- Supabase JWT (`anon` + `service_role`)
- `sb_secret_*` / `sb_publishable_*`
- Expo access tokens

## Runtime version policy

`app.config.ts` define `runtimeVersion: { policy: 'sdkVersion' }`. Esto significa:
- SDK 54 builds solo aceptan OTAs publicados desde un repo con SDK 54.
- Cuando bumpees Expo SDK (54 → 55), TODOS los usuarios necesitan re-installar desde TestFlight / App Store. Un OTA no puede arreglar eso.
- Si querés un control más fino (e.g. pinear a un native module version), cambiá a `policy: 'fingerprint'` (requiere `@expo/fingerprint`).
