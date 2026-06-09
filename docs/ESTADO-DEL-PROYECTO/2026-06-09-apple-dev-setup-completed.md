# Apple Developer + EAS + TestFlight pipeline · COMPLETED

> **Fecha**: 2026-06-09
> **Tipo**: milestone — primer build production llegó a TestFlight y se instaló en device real.
> **Triggered por**: wizard guiado paso a paso a través de los 8 pasos del setup Apple Developer + EAS + GitHub Secrets.

## TL;DR

El owner partió de **cuenta Apple Developer recién pagada sin nada configurado** y terminó con **Manifeisto 1.0.0 (1) corriendo en su iPhone via TestFlight** vía un pipeline 100% automatizable.

| Item | Status | Verificación |
|---|---|---|
| Apple Developer App ID con capabilities | ✅ | `com.manifiesto.mobile.ZKYQF7UNYA` con Sign in with Apple + Push Notifications |
| APNs Authentication Key | ✅ | Key ID `J3525JQHM2`, asignada a EAS |
| App Store Connect API Key | ✅ | Key ID `HUNBRN89BT`, asignada a EAS + GitHub Secrets |
| App Store Connect app entry | ✅ | App ID `6776033487`, Manifiesto, Spanish (Mexico) |
| EAS Build Credentials | ✅ | Distribution Cert + Provisioning Profile (App Store), expira 2027-06-09 |
| GitHub Repository Secrets | ✅ | 6 secrets configurados (`EXPO_TOKEN`, `ASC_API_KEY_*`, etc.) |
| Workflow `release.yml` | ✅ | Verificado end-to-end: build → submit → TestFlight |
| Build 1.0.0 (1) en TestFlight | ✅ | Instalado en iPhone del owner |

## IDs y referencias canónicas

| Tipo | Valor | Notas |
|---|---|---|
| Apple Team ID | `ZKYQF7UNYA` | Mario Kontos (Individual) |
| Bundle ID iOS | `com.manifiesto.mobile.ZKYQF7UNYA` | ver gotcha #1 abajo |
| Android `package` | `com.manifiesto.mobile` | Android es independiente |
| App Store Connect App ID | `6776033487` | identifier público |
| Apple ID owner | `kontosmario@gmail.com` | |
| EAS project | `@markon07/manifiesto` (ID `54449767-9236-4734-972a-e561debd1360`) | |
| EAS user | `markon07` | |
| APNs Push Key ID | `J3525JQHM2` | Sandbox & Production, Team Scoped |
| ASC API Key ID | `HUNBRN89BT` | Gestor de apps (App Manager) |
| ASC Issuer ID | `e2ab69f2-ac94-482a-8e66-7a89f9a3cca4` | UUID del Team |
| Distribution Certificate Serial | `63D821BED94093DE572A73107FBC8367` | expira 2027-06-09 |
| Provisioning Profile ID | `78YL7CVZS6` | App Store, expira 2027-06-09 |

## Gotchas + decisiones (en orden cronológico del wizard)

### Gotcha #1 — Bundle ID con sufijo del Team ID

Al crear el App ID, Apple auto-rellenó el bundle id como `com.manifiesto.mobile.ZKYQF7UNYA` en vez del esperado `com.manifiesto.mobile`. Apple **no permite editar el bundle id post-registro** y borrarlo está bloqueado porque la entrada en App Store Connect ya existe (también auto-creada).

**Decisión**: aceptar el sufijo. Razones:
- El bundle id es invisible al usuario (solo lo ven Apple + EAS).
- El camino alternativo (borrar ASC entry → cooldown 30+ días de Apple → recrear App ID limpio) puede dejar bloqueado.
- Todo funciona idéntico con el sufijo.

**Implementación**: `app.config.ts` actualizado en commit `6c94c00`.

### Gotcha #2 — App Store Connect entry pre-existente

Cuando se registró el App ID, Apple **auto-creó** la entrada de Manifiesto en App Store Connect con metadata default (categoría Finanzas, SKU `manifiesto-ios-001`, etc.). No hubo que crear nada — solo verificar y anotar el App ID numérico `6776033487`.

### Gotcha #3 — APNs keys solo se descargan UNA vez

Apple Developer Portal genera el `.p8` y lo deja descargar exactamente una vez. Después solo se ven el Key ID + metadata, no el contenido. Si se pierde el `.p8`, hay que revocar la key y crear una nueva.

**Implementación**: guardado en `~/secrets/manifiesto/AuthKey_J3525JQHM2.p8` con `chmod 600`.

### Gotcha #4 — Mismo deal con la ASC API Key

Idéntico al de APNs: descarga única, `chmod 600`, guardado en `~/secrets/manifiesto/AuthKey_HUNBRN89BT.p8`.

### Gotcha #5 — App Store Connect API requiere "Solicitar acceso" la primera vez

Apple muestra un botón "Solicitar acceso" que es realmente auto-aprobado inmediatamente. Sin clickearlo no aparece la interfaz de generación de keys.

### Gotcha #6 — `eas credentials` "Use existing" vs "Generate new"

Cuando subimos las keys (APNs y ASC) a EAS, hay que decir **N** (No) cuando pregunta "Generate a new key?" — sino EAS crea una key nueva en Apple ignorando la que tenemos. La key "existing" se refiere a "ya generada en Apple" (caso nuestro).

### Gotcha #7 — Preview profile requiere ad-hoc provisioning + device UDIDs

El primer intento de dry-run usó profile `preview` (`distribution: internal`), que requiere registrar UDIDs de iPhones autorizados en developer.apple.com. Como no teníamos UDIDs registrados, EAS no pudo armar el provisioning ad-hoc.

**Decisión**: ir directo a profile `production` (`distribution: store`), que no requiere UDIDs porque la instalación es via TestFlight/App Store.

### Gotcha #8 — `autoIncrement` no compatible con `app.config.ts`

Segundo blocker del dry-run:

```
autoIncrement option is not supported when using app.config.js
```

EAS no soporta `autoIncrement` cuando la app usa dynamic config (TypeScript) porque la version se computa en runtime. Fix en commit `ce9caa6`: removido `autoIncrement: true` del profile production en `eas.json`. Bumps de version se hacen manualmente en `app.config.ts`.

### Gotcha #9 — `$VAR` syntax NO funciona en sección `submit` del `eas.json`

Tercer blocker, el más sutil:

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "$EXPO_APPLE_ID",   ← no substituido
      "ascAppId": "$EXPO_ASC_APP_ID"  ← no substituido
    }
  }
}
```

EAS lee los strings literales `$EXPO_APPLE_ID` y `$EXPO_ASC_APP_ID` como valores, en vez de expandir las env vars. El syntax `$VAR` **solo funciona en `build` profiles**, no en `submit`.

Además, `appleId` no es necesario cuando usás ASC API key (la key reemplaza el login con Apple ID).

**Fix en commit `0ae9081`**:
- Removido `appleId` de `eas.json`.
- Hardcodeado `ascAppId: "6776033487"` (identifier público, no secret).
- Cleanup de `EXPO_APPLE_ID` y `EXPO_ASC_APP_ID` del env: del step de submit en `release.yml`.

### Gotcha #10 — `eas submit` tarda más de lo esperado

Durante el primer submit exitoso, el step `Waiting for submission to complete` tardó **~45 minutos**. Es Apple procesando del lado de App Store Connect, no EAS. EAS sube el IPA en 2-3 min, después espera a que Apple confirme el procesamiento.

**No es bug** — es slow process de Apple. Se puede ver el estado real en https://expo.dev/accounts/markon07/projects/manifiesto/submissions/<id> y en https://appstoreconnect.apple.com/apps/6776033487/testflight/ios.

### Gotcha #11 — TestFlight "Lista para enviar" 🟡 no es "Lista para probar" 🟢

Una vez que el build llegó a App Store Connect, apareció como **"Lista para enviar"** (Ready to Submit). Esto **no** significa "instalable" — significa "Apple lo procesó pero todavía no respondiste el Export Compliance OR no creaste un grupo de internal testing".

Para hacer el build instalable:
1. Crear un grupo de internal testing (App Store Connect → TestFlight → Pruebas internas → `+`)
2. Agregar testers (mínimo el owner)
3. Agregar el build al grupo
4. Si Apple pregunta Export Compliance, responder "No, no usa encriptación" (compatible con `ios.config.usesNonExemptEncryption: false` que ya tenemos en `app.config.ts`)

Después de eso, el estado pasa a **"Lista para probar"** 🟢 y la app aparece en TestFlight mobile.

## Secrets de GitHub configurados

| Name | Valor (público o redacted) | Status |
|---|---|---|
| `EXPO_TOKEN` | **🔒 secret** — Expo PAT generado | ✅ |
| `EXPO_APPLE_ID` | `kontosmario@gmail.com` | ✅ (deprecado pero presente) |
| `EXPO_ASC_APP_ID` | `6776033487` | ✅ (deprecado — hardcoded en `eas.json`) |
| `ASC_API_KEY_ID` | `HUNBRN89BT` | ✅ |
| `ASC_API_KEY_ISSUER_ID` | `e2ab69f2-ac94-482a-8e66-7a89f9a3cca4` | ✅ |
| `ASC_API_KEY_P8_BASE64` | **🔒 secret** — `~344 chars terminando en =` | ✅ |
| `SLACK_RELEASE_WEBHOOK` | — | ⚪ no configurado (opcional) |

**Generación del base64 del `.p8`** (sin exponerlo en terminal):
```bash
base64 -i ~/secrets/manifiesto/AuthKey_HUNBRN89BT.p8 | tr -d '\n' | pbcopy
```

## Commits relevantes (en orden cronológico)

| SHA | Descripción |
|---|---|
| `6c94c00` | `fix(config): iOS bundleIdentifier → com.manifiesto.mobile.ZKYQF7UNYA` |
| `ce9caa6` | `fix(eas): quitar autoIncrement del profile production` |
| `0ae9081` | `fix(eas-submit): config simplificada con ASC API key + hardcoded ascAppId` |

## Lo que esto desbloquea

### Inmediatamente

- ✅ Test real de la app en device físico (iPhone del owner)
- ✅ Verificación de todas las features de Sprint A-D en ambiente production
- ✅ OTA updates funcionales (`ota-update.yml` ya wireado, JS-only changes shippean en ~3 min)
- ✅ Builds full vía tag push (`git tag v1.0.1 && git push --tags` → workflow auto)
- ✅ Capacidad de invitar testers internos (hasta 100 sin review de Apple)

### Para shippear v1.0 al App Store público

Solo faltan **owner actions de contenido** (no más Apple Developer setup):

| # | Item | Effort | Notas |
|---|---|---|---|
| 1 | Privacy Policy + Terms hosteados | 1 d | DNS `manifiesto.app` + GitHub Pages o equivalente |
| 2 | URLs en `mobile/lib/legal-urls.ts` | 5 min | Reemplazar placeholders con URLs reales |
| 3 | Screenshots (6.7" + 5.5" iPhone) | 1-2 d | Self-made o contratado USD 100-300 |
| 4 | App Preview video | 1 d (opcional) | Boost del conversion rate en App Store |
| 5 | Privacy Nutrition labels | 30 min | En App Store Connect, responder cuestionario |
| 6 | Listing copy (descripción, keywords) | 2 h | es-MX + opcional en-US |
| 7 | Age rating survey | 10 min | En App Store Connect |
| 8 | Submit for Review | 1 click | En App Store Connect |
| 9 | Apple review (1-3 días) | — | Apple decide |

## Re-evaluación de items que estaban "bloqueados por Apple Dev"

Estos items del execution plan + roadmap dependían del Apple Dev setup. Ahora todos están desbloqueados:

| Origen | Item | Estado pre-setup | Estado post-setup |
|---|---|---|---|
| Sprint A | A4 (Apple Sign-In) | `[x] DONE (code-complete), Apple Dev pending` | ✅ testeable en device |
| Sprint A | A7 (push iOS wiring) | `[x] DONE`, APNs key pending | ✅ APNs reales funcionan |
| Sprint A | A8 (edge function APNs) | `[x] DONE`, APNs key pending | ✅ push reales via edge function |
| Sprint C | C5 (EAS build automation) | `[x] DONE (code-complete)`, secrets pending | ✅ verified end-to-end |
| Sprint C | C6 (TestFlight submission) | `[x] DONE (code-complete)`, ASC pending | ✅ verified end-to-end |
| Sprint C | C7 (OTA updates) | `[x] DONE (code-complete)`, EAS Update channel pending | ✅ channel `production` activo |
| Sprint A | A6 (about screen) | `[x] DONE`, URLs placeholder | ⏳ URLs reales pendientes (item #2 arriba) |

## Referencias

- [Runbook release automation](../operaciones/runbook-release-automation.md) — operación día a día
- [Execution plan code-only](2026-06-08-execution-plan.md) — sprints A-D detalle
- [Roadmap priorizado 2026-05-31](2026-05-31-roadmap-priorizado.md) — vista macro
