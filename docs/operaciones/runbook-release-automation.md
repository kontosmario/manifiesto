# Runbook · Release automation (Sprint C — C3 / C5 / C6 / C7 / C10)

> Última actualización: 2026-06-09
> Status: code-complete. Pendiente de secrets en GitHub Actions.

## TL;DR

| Workflow | Trigger | Output |
|---|---|---|
| `mobile-ci.yml` → `e2e` | push a `main` + manual | Playwright sobre `expo export --platform web` |
| `mobile-ci.yml` → `gitleaks` | todos | Falla CI si encuentra secretos |
| `release.yml` | tag `v*` + manual | `eas build` iOS + `eas submit` TestFlight |
| `ota-update.yml` | push a `main` (JS-only) + manual | `eas update --branch production` |

## Secrets requeridos en GitHub (Settings → Secrets → Actions)

| Secret | Usado por | De dónde sale |
|---|---|---|
| `EXPO_TOKEN` | `release.yml`, `ota-update.yml` | https://expo.dev/settings/access-tokens (perm: `build`, `update`, `submit`) |
| `EXPO_APPLE_ID` | `release.yml` (submit) | Apple ID que opera ASC (e.g. `ops@manifiesto.app`) |
| `EXPO_ASC_APP_ID` | `release.yml` (submit) | App Store Connect → App → General → Apple ID |
| `ASC_API_KEY_ID` | `release.yml` (submit) | https://appstoreconnect.apple.com/access/api → "Key ID" |
| `ASC_API_KEY_ISSUER_ID` | `release.yml` (submit) | mismo panel, "Issuer ID" |
| `ASC_API_KEY_P8_BASE64` | `release.yml` (submit) | Bajar el `.p8` una vez, `base64 -i AuthKey_XXXX.p8` |
| `SLACK_RELEASE_WEBHOOK` | `release.yml` (opcional) | Slack incoming webhook si querés notif post-release |

**Importante**:
- Mientras `ASC_API_KEY_P8_BASE64` esté vacío, `release.yml` corre el `eas build` pero salta el `eas submit` — el IPA queda en EAS dashboard y se sube manual.
- `EXPO_TOKEN` también lo necesita `eas update`. Sin él, `ota-update.yml` falla con `403`.

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
