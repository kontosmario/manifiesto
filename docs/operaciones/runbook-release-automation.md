# Runbook · Release automation (Sprint C — C3 / C5 / C6 / C7 / C10)

> Última actualización: 2026-06-10 (post setup dominio + sitio legal)
> Status: **end-to-end verified end-to-end** — build 1.0.0 (1) llegó a TestFlight 2026-06-09 + OTA aplicado 2026-06-10 con URLs legales reales.
>
> Milestones relacionados:
> - [Apple Dev + EAS + TestFlight (2026-06-09)](../ESTADO-DEL-PROYECTO/2026-06-09-apple-dev-setup-completed.md)
> - [Dominio + sitio legal LIVE (2026-06-10)](../ESTADO-DEL-PROYECTO/2026-06-10-domain-and-legal-site-completed.md)

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
| `EXPO_BUILD_TOKEN` | `release.yml` (preferred) | expo.dev → access tokens → scope: **Build + Submit** | ⚠️ owner action pendiente (G-Infra2, 2026-06-10) |
| `EXPO_UPDATE_TOKEN` | `ota-update.yml` (preferred) | expo.dev → access tokens → scope: **Update** | ⚠️ owner action pendiente (G-Infra2, 2026-06-10) |
| `EXPO_TOKEN` | `release.yml`, `ota-update.yml` (fallback) | https://expo.dev/accounts/markon07/settings/access-tokens | ✅ (legacy, mantener hasta que `EXPO_BUILD_TOKEN` + `EXPO_UPDATE_TOKEN` estén verificados) |
| `EXPO_UPDATE_PRIVATE_KEY` | `ota-update.yml` | `keys/private-key.pem` generado con `npx expo-updates codesigning:generate` — ver sección "EAS Update code signing" | ⚠️ owner action pendiente (Sprint F · F1, 2026-06-10) |
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

## Dominio público + sitio (cheat sheet)

| Item | Valor |
|---|---|
| Dominio | `manifiestoapp.com` (Cloudflare Registrar) |
| DNS provider | Cloudflare (nameservers de Cloudflare) |
| Email forwarding | `soporte@manifiestoapp.com` + `support@manifiestoapp.com` → `kontosmario@gmail.com` (Cloudflare Email Routing) |
| Hosting sitio | Cloudflare Pages, proyecto `manifiestoapp-site` |
| Preview URL | https://manifiestoapp-site.pages.dev |
| Production URL apex | https://manifiestoapp.com |
| Production URL www | https://www.manifiestoapp.com |
| Repo del sitio | https://github.com/kontosmario/manifiestoapp-site |
| Privacy Policy | https://manifiestoapp.com/privacy/ |
| Terms of Service | https://manifiestoapp.com/terms/ |
| Single source URLs en app | `mobile/lib/legal-urls.ts` |

### Actualizar Privacy Policy o Terms

```bash
cd /Users/mario/apps/manifiestoapp-site
# Editar privacy/index.html o terms/index.html
# Bump fecha y versión en el <p class="meta"> del header
git add . && git commit -m "docs(legal): <descripción>" && git push origin main
# Cloudflare Pages deploya en ~30s automáticamente.
```

Si el cambio es **material** (no cosmético): considerar in-app notice con aceptación expresa del user.

### Si tenés que mover el dominio a otro provider

Cloudflare Pages funciona con cualquier DNS provider (no requiere que el dominio esté en Cloudflare). Si movés `manifiestoapp.com` a Namecheap/GoDaddy/etc:
1. En el nuevo provider: agregar CNAME `manifiestoapp.com` → `manifiestoapp-site.pages.dev` (apex CNAME flattening puede no estar soportado en todos los providers — usar A records contra IPs de Cloudflare Pages como fallback)
2. Para email: configurar MX records que apunten a `route1.mx.cloudflare.net` y `route2.mx.cloudflare.net` (los que Cloudflare Email Routing usa)
3. En Cloudflare Pages dashboard: borrar y re-agregar el custom domain para que reverify

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

### Trigger manual sin push (útil para hotfix urgente sin commit-push)

```bash
cd /Users/mario/apps/manifiesto
npx eas-cli update --branch production --message "<descripción del fix>" --non-interactive
```

Si tenés cambios sin commitear los va a publicar igual. Confirmá con `git status` antes para no embarrar.

Ejemplo real (2026-06-10):
- Cambio: `mobile/lib/legal-urls.ts` updated con URLs reales del dominio nuevo
- Comando: `npx eas-cli update --branch production --message "Update legal URLs → manifiestoapp.com + soporte email + sitio LIVE"`
- Update Group ID: `64b2bb9a-884e-4920-b736-a2de70324766`
- Tiempo: ~30s desde el comando hasta que el bundle estaba disponible para el TestFlight build
- Verificación: force-quit + re-open de la app en device → cold-start descarga el OTA + lo aplica

### Cómo verificar que el OTA llegó al device

1. Force-quit la app (swipe up + delete from app switcher)
2. Re-abrir desde home screen
3. Cold start descarga el OTA en background (~1-3s, invisible)
4. Verificar que el cambio se aplicó en la pantalla afectada

Si tarda más de 2-3 force-restarts:
- Verificar que el build TestFlight tiene `runtimeVersion: exposdk:54.0.0` matcheando el `runtime` del update en `expo.dev/.../updates/<id>`
- Verificar el network del device (a veces wifi corporativo bloquea CDN de Expo)

Si tocaste `package.json` (incluso dep no-native): el workflow lo skipea por seguridad. Forzá con `workflow_dispatch` después de confirmar que no agregaste deps nativas.

## EAS Update code signing (Sprint F · F1)

> Threat model: red team audit 2026-06-10 (Mobile H3 + Infra H-1). Si alguien filtra `EXPO_TOKEN` (dep comprometida en GitHub Actions, sesión `~/.expo` robada, phishing del dashboard de EAS), puede publicar un JS bundle malicioso al canal `production` y RCE-ear a todos los users en el próximo cold start (`fallbackToCacheTimeout: 0`). El code signing levanta la barrera: el atacante también necesita la **private key**, que vive offline en la máquina del owner + como GitHub Secret para CI.

### Cómo funciona

- `app.config.ts` declara `updates.codeSigningCertificate: './certs/certificate.pem'` + `codeSigningMetadata.alg: 'rsa-v1_5-sha256'`.
- El cert público (`certs/certificate.pem`) se bundlea en el binario en build time (sí, está commiteado al repo — es público por diseño).
- La private key (`keys/private-key.pem`) **nunca se commitea** (está en `.gitignore`) y vive en:
  1. La máquina del owner (`/Users/mario/apps/manifiesto/keys/private-key.pem`, permisos `600`).
  2. GitHub Secrets como `EXPO_UPDATE_PRIVATE_KEY` (PEM literal, multilínea).
- `ota-update.yml` escribe la key a un archivo temp del runner, pasa `--private-key-path` a `eas update`, y la borra en un step `if: always()`.
- En el device, `expo-updates` valida la firma del manifest contra el cert bundleado. Si no matchea, ignora el update y se queda con el bundle cacheado.

### Generación inicial (owner, una vez)

```bash
cd /Users/mario/apps/manifiesto
mkdir -p keys certs
npx expo-updates codesigning:generate \
  --key-output-directory keys \
  --certificate-output-directory certs \
  --certificate-validity-duration-years 10 \
  --certificate-common-name "Manifiesto"
```

Output:
- `keys/private-key.pem` (RSA-2048, **never commit**)
- `keys/public-key.pem` (informativo, no se usa en runtime)
- `certs/certificate.pem` (self-signed con la public key; se bundlea en el app)

> **Nota de algoritmo**: el campo `alg: 'rsa-v1_5-sha256'` en `app.config.ts` coincide con el keypair real RSA-2048 generado por `codesigning:generate` (verificable con `openssl rsa -in keys/private-key.pem -text -noout`). No tocar el `alg` salvo que Expo lo cambie en una versión futura del SDK.

### Subir la private key a GitHub Secrets

1. Copiar el contenido completo del PEM (incluyendo `-----BEGIN/END RSA PRIVATE KEY-----` o `-----BEGIN/END PRIVATE KEY-----`):
   ```bash
   cat keys/private-key.pem | pbcopy
   ```
2. https://github.com/<owner>/manifiesto/settings/secrets/actions → **New repository secret**
3. Name: `EXPO_UPDATE_PRIVATE_KEY`
4. Value: pegar el contenido del PEM
5. **Add secret**

Verificación: el próximo run de `ota-update.yml` debería loggear "EAS Update completed" sin errores. Si `EXPO_UPDATE_PRIVATE_KEY` está vacío, el step "Write OTA signing key" falla con `::error::EXPO_UPDATE_PRIVATE_KEY secret is empty`.

### Primer deploy después de habilitar signing

El cert sólo se incrusta en builds nativos **nuevos** (cuando Expo procesa `app.config.ts`). El binario actualmente en TestFlight (1.0.0 (1), 2026-06-09) **no tiene el cert** y por lo tanto:
- Acepta updates **firmados** o **sin firmar** indistintamente (sin cert → sin verificación).
- Una vez que cortemos un build nuevo (tag `vX.Y.Z` próximo), ese binario va a empezar a verificar firmas.

Por ende: enviar el primer OTA firmado **antes** de cortar el próximo build nativo es seguro — pero la protección sólo entra en efecto a partir del próximo TestFlight build. Hasta entonces, la mitigación principal contra `EXPO_TOKEN` leak es la rotación rápida del token + revisar el dashboard de EAS Updates.

### Qué pasa si la firma falla en el cliente

- `expo-updates` descarta el update y se queda con el bundle anterior (cacheado).
- Logs (Sentry deshabilitado por ahora, ver `project_sentry_skipped.md`): `console.error` con `CodeSigningError` — visible vía Xcode console con device cableado.
- No hay UI de error: el user simplemente sigue viendo el bundle viejo. Ese silencio es by-design (atacante no tiene cómo distinguir "update firmado mal" de "update no llegó").

Cómo detectar el caso legítimo (CI publicó pero los devices no actualizan):
1. Verificar https://expo.dev/accounts/markon07/projects/manifiesto/updates que el update group exista.
2. Confirmar que `runtimeVersion` del update matchea el del build instalado.
3. Si todo matchea pero los devices no toman el update → mismatch de signing. Verificar que la key en GitHub Secrets corresponde al cert bundleado en el binario actual.

### Rotación de keys

Periodicidad recomendada: cada 2-3 años, o **inmediatamente** si sospechás compromiso (laptop robada, GitHub Secret accidentalmente expuesto).

1. Regenerar localmente:
   ```bash
   rm -rf keys/ certs/
   mkdir -p keys certs
   npx expo-updates codesigning:generate \
     --key-output-directory keys \
     --certificate-output-directory certs \
     --certificate-validity-duration-years 10 \
     --certificate-common-name "Manifiesto"
   ```
2. Commitear el nuevo `certs/certificate.pem` (el viejo se sobrescribe; OK porque es público).
3. Cortar un **build nativo nuevo** (tag `vX.Y.Z`) — el cert nuevo entra al binario solo en builds nuevos.
4. Esperar a que ese build llegue a producción (App Store rollout). Mientras tanto los binarios viejos siguen verificando contra el cert viejo — **no actualizar el GitHub Secret todavía** o vas a romper updates a los binarios viejos.
5. Cuando el adoption del build nuevo sea ≥ 95% (o pasaron 30 días, lo que sea antes), actualizar `EXPO_UPDATE_PRIVATE_KEY` en GitHub Secrets con el contenido del nuevo `keys/private-key.pem`.
6. El próximo OTA queda firmado con la nueva key — los binarios viejos lo van a rechazar (silenciosamente), pero ya están en minoría y eventualmente actualizan via App Store.

### Recovery — perdí la private key

Si `keys/private-key.pem` se pierde del filesystem local + nadie tiene backup, el GitHub Secret sigue siendo la única copia. Para rescatarla:
1. **No** abras el Secret en la UI de GitHub (no se puede leer una vez creado).
2. En su lugar: regenerar el keypair (paso "Rotación" arriba) — equivalente operacionalmente a un compromise event, y vas a tener que esperar al próximo build nativo para que la nueva key surta efecto.

Backup recomendado: 1Password o similar, vault personal del owner, no compartir.

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

Patrones custom en `.gitleaks.toml` (sincronizados con `.githooks/pre-commit` — G-Infra1, 2026-06-10):
- Supabase JWT HS256 (`{"alg":"HS256",...}`) + RS256 (`{"alg":"RS256",...}` — newer asymmetric keys)
- `sb_secret_*` / `sb_publishable_*` / `sbp_*` (Management API personal access tokens)
- Anthropic API keys (`sk-ant-*`)
- AWS access key IDs (`AKIA...`)
- Expo access tokens

Allowlist de docs: solo `docs/operaciones/runbook-backend-hardening.md` + `docs/operaciones/runbook-release-automation.md` (referencias históricas a tokens placeholder). Cualquier doc nuevo que necesite incluir un token sample tiene que agregarse explícitamente al allowlist — antes el wildcard `docs/.*\.md$` silenciaba real leaks.

## EXPO_TOKEN scoping — Build / Update / Submit per pipeline (G-Infra2)

> Red team audit 2026-06-10: el `EXPO_TOKEN` original es de cuenta y tiene scope completo (Build + Submit + Update + Project read/write). Si se filtra (dep comprometida en Actions, sesión de owner robada, etc.) el atacante puede tanto cortar un build nativo malicioso como publicar un OTA bundle malicioso. Separar el token por pipeline reduce el blast radius.

### Tokens a generar (owner action)

1. Login en https://expo.dev/settings/access-tokens
2. **Create token** → `EXPO_BUILD_TOKEN`
   - Scope: **Build** + **Submit** (deselect Update + cualquier otro).
   - Name suggestion: `manifiesto-ci-build-submit-YYYYMMDD`.
   - Copy el token (solo se muestra una vez).
3. **Create token** → `EXPO_UPDATE_TOKEN`
   - Scope: **Update** ONLY.
   - Name suggestion: `manifiesto-ci-update-YYYYMMDD`.
   - Copy el token.

> Si la UI de expo.dev no expone scopes por-permiso para tu plan, generá dos tokens distintos con scope completo y rotálos por separado — el aislamiento operacional (un token leak no compromete el otro pipeline) sigue siendo la mayor parte del win.

### Subir a GitHub Secrets

```
https://github.com/<owner>/manifiesto/settings/secrets/actions
```

- **New repository secret** → name `EXPO_BUILD_TOKEN`, value = token #1.
- **New repository secret** → name `EXPO_UPDATE_TOKEN`, value = token #2.

### Verificación

1. **Release pipeline**: cortar un tag pre-release (`v1.0.1-rc.1`) o disparar `Release` con `workflow_dispatch` → `profile: preview`. Mirar el step `Setup EAS`: si `EXPO_BUILD_TOKEN` está configurado, lo usa; sino loggea como si nada y cae al fallback.
2. **OTA pipeline**: hacer un commit JS-only (e.g. typo fix en copy) y push a `main`. Mirar el step `Setup EAS`: si `EXPO_UPDATE_TOKEN` está configurado, lo usa.
3. **Confirmar fallback**: temporalmente borrar `EXPO_BUILD_TOKEN` y re-disparar el workflow — debe seguir andando vía `EXPO_TOKEN`. Re-crear el secret cuando confirmás que el fallback funciona.

### Rotación

- Si un pipeline tira un error 401 / 403 desde EAS sin causa clara: rotar el token de **ese** pipeline (no necesariamente el otro).
- Periodicidad recomendada: cada 6 meses, o inmediatamente ante sospecha.
- Cuando rotás, dejá el viejo token activo unas horas hasta confirmar que el nuevo anda — luego revocá el viejo en expo.dev.

### Deprecation de `EXPO_TOKEN`

Una vez `EXPO_BUILD_TOKEN` + `EXPO_UPDATE_TOKEN` están verificados (al menos un release + un OTA exitoso con cada uno), revocar el `EXPO_TOKEN` legacy en expo.dev y borrarlo de GitHub Secrets. Los workflows tienen `${{ secrets.EXPO_BUILD_TOKEN || secrets.EXPO_TOKEN }}` pero un secret faltante simplemente expande a string vacío — el step de Setup EAS reportará "EXPO_TOKEN required" si ambos faltan.

## Sourcemap retention audit — EAS dashboard (G-Infra3)

> Red team audit 2026-06-10: anyone con `EXPO_TOKEN` (incluso scope `Build` read-only) puede bajarse el IPA + sourcemaps de cualquier build histórico desde el EAS dashboard y reversear el bundle de la app. Default settings de EAS retienen artifacts indefinidamente — no hay TTL automático.

### Verificación periódica (owner, cada 3 meses)

1. https://expo.dev/accounts/markon07/projects/manifiesto/builds
2. Cada build production → **Artifacts** tab:
   - Verificar quién tiene acceso al build artifact + sourcemap.
   - Por default los artifacts son **project-member-only** (no público). Confirmar que esto sigue siendo así — si Expo cambia el default a "anyone with link", remediar inmediatamente.
3. Auditar el listado de project members en https://expo.dev/accounts/markon07/projects/manifiesto/settings → Members.
   - Solo debería estar el owner. Cualquier extra → review + remove.
4. Para builds viejos (> 90 días) que ya no están en producción: considerar borrarlos del dashboard (`...` → Delete) para reducir surface area.

### Sourcemap-specific notes

- Los sourcemaps se generan automáticamente en cada build production (necesarios para symbolication de crash reports — actualmente no usamos crash reporting pero los sourcemaps siguen subiéndose).
- Visibilidad: project-member-only. Verificar en cada build: Artifacts → "Source map" → confirmar URL requiere auth.
- Si se filtra un sourcemap: rotar todas las API keys hardcoded en el bundle (no hay ninguna en el código actual — verificar con `grep -r 'sk-\|AKIA\|sbp_' mobile/` antes de cada release) y cortar un build nuevo.

### Threat model — qué expone un sourcemap leak

- Bundle source completo de la app (todas las rutas, lógica de negocio, copy).
- Nombres de funciones internas + estructura de módulos.
- **NO** expone secrets si están bien configurados (Supabase publishable key es público por diseño; no debe haber service-role keys, Anthropic keys ni AWS keys en el bundle del cliente).
- Sí facilita reverse engineering + targeted attacks contra endpoints del backend (probar inputs maliciosos contra RPCs que descubrieron en el bundle).

Mitigación principal: hardening del backend (RLS strict — ver `docs/operaciones/runbook-backend-hardening.md`), input validation en cada RPC, rate limiting. El sourcemap leak no cambia el modelo de amenazas significativamente cuando el backend está bien defendido — pero la verificación periódica es defense-in-depth barato.

## Runtime version policy

`app.config.ts` define `runtimeVersion: { policy: 'sdkVersion' }`. Esto significa:
- SDK 54 builds solo aceptan OTAs publicados desde un repo con SDK 54.
- Cuando bumpees Expo SDK (54 → 55), TODOS los usuarios necesitan re-installar desde TestFlight / App Store. Un OTA no puede arreglar eso.
- Si querés un control más fino (e.g. pinear a un native module version), cambiá a `policy: 'fingerprint'` (requiere `@expo/fingerprint`).

## Apple Review credentials

La cuenta `apple.review@manifiestoapp.com` existe en producción para que los reviewers de Apple puedan loguearse al App Store review (referenciada en App Store Connect → Información para el equipo de revisión de apps).

### Política de credenciales

**Plain text PROHIBIDO en git**. La migration `20260611000000_seed_apple_review_account.sql` crea el user con un password placeholder (`bootstrap-CHANGE-ME-immediately`). Esto se rota out-of-band inmediatamente después de aplicar la migration.

### Cómo rotar el password (procedimiento)

1. **Generar password seguro local** (no committearlo a ningún archivo):
   ```bash
   openssl rand -base64 24 | tr -d '+/=' | head -c 32
   ```

2. **Update en remote via SQL directo** (NO en migration):
   ```bash
   echo "update auth.users set encrypted_password = extensions.crypt('<NEW_PASSWORD>', extensions.gen_salt('bf')) where email = 'apple.review@manifiestoapp.com' returning email, updated_at;" | npx supabase db query --linked
   ```

3. **Actualizar App Store Connect**:
   - Andá a https://appstoreconnect.apple.com/apps/6776033487/distribution
   - Sección "Información para el equipo de revisión de apps"
   - Campo "Contraseña" → pegar el nuevo password
   - Click "Guardar"

4. **NO committear el password a ningún lado**. Si vos lo necesitás para tu password manager personal, agregalo ahí (NO en archivos del repo).

### Rotación periódica

- **Antes de cada App Store submit**: rotar (Apple no debería tener acceso histórico)
- **Después de cada submit aprobado**: ✅ podés optar por (a) rotar de nuevo (defensa-en-profundidad) o (b) dejar el password actual hasta el próximo submit
- **Si el repo se vuelve público**: rotar inmediatamente

### Por qué este flow

Documentado en red team audit 2026-06-10 (finding RLS F1 + Infra C-1): el password original (`AppleReview2026!`) estaba en plain text en la migration committed. Cualquier acceso al git history exponía credenciales prod. Rotación out-of-band + placeholder en migration cierra el gap.

## Calendario de rotación

Sprint P · Audit #9 P-7 (2026-06-10) — recordatorios concentrados para evitar que algo expire silenciosamente y rompa el pipeline.

| Item | Vence | Notas |
|---|---|---|
| Provisioning Profile (App Store) | 2027-06-09 | EAS auto-renueva on `eas build`. Si no buildeás dentro de los ~30 días anteriores a la fecha, el OTA channel se queda con binary stale y los TestFlight/App Store builds futuros fallan al firmar hasta correr `eas credentials` manual. |
| Code-signing cert (`certs/certificate.pem`) | 2036-06-10 | CI fail automático si quedan <90 días (`ota-update.yml` → "Cert expiry check", Sprint P · P-6). Ver "EAS Update code signing" para el procedure de rotación. |
| ASC API Key `.p8` (Key ID `HUNBRN89BT`) | N/A | Nunca expira hasta revoke manual desde App Store Connect. Rotar si el `.p8` se filtra o si dejás de usar la cuenta. |
| APNs Push Key `.p8` (Key ID `J3525JQHM2`) | N/A | Nunca expira hasta revoke manual desde Apple Developer. Misma política que ASC API Key. |
| App Store apple.review password | rotación ad-hoc | Antes de cada submit ([ver "Apple Review test account"](#apple-review-test-account-passwords)). |
| Distribution Certificate (EAS-managed) | 2027-06-09 | Se renueva con el Provisioning Profile dentro del flow de `eas build`. |

**Guarda automática (CI):**
- `ota-update.yml` → step "Cert expiry check" falla si `certs/certificate.pem` queda con <90 días (warning entre 90-365 días).
- `ota-update.yml` → step "Verify cert matches private key" falla si el cert en el repo y el `EXPO_UPDATE_PRIVATE_KEY` divergen.

**Guarda manual (humana):**
- Provisioning profile + dist cert: poner recordatorio en calendario para **2027-04-09** (60 días antes) que dispare un `eas build` aunque sea con changes vacíos para forzar la renovación.
- ASC API key y APNs key: no expiran, pero conviene revisar permisos cada 12 meses.
- Apple Review password: rotar antes de cada App Store submit.

Cuando agregues un nuevo recurso con expiración (otro cert, otra key, un dominio), **sumá la fila acá en el mismo commit**. Si no está en esta tabla, asumí que nadie va a acordarse.
