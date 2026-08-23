# PRE-DEPLOY — ¿Qué falta para publicar Manifiesto en iOS y mandarla a revisión?

> **Documento de readiness de release, hecho desde cero.** Auditoría punta a punta del
> proyecto (código + backend en prod + config de build + compliance + docs), no un
> resumen de checklists viejos. Si algo acá contradice a `docs/PRE-LAUNCH.md`, este
> documento es el más fresco y está verificado contra el código y contra prod.

- **Fecha:** 2026-06-20
- **App:** Manifiesto — finanzas personales del hogar. React Native + Expo (SDK 54) + Supabase.
- **Bundle id:** `com.manifiesto.mobile.ZKYQF7UNYA` · **Versión:** `1.0.0` · **Build en ASC:** `7`
- **Metodología:** 5 auditorías en paralelo (build/EAS · IAP/compliance · features · backend · docs) + verificación directa de número de build, recencia de git, estado de migraciones en prod y URLs legales.

---

## 0. Veredicto en una línea

**No hay un solo bloqueante de CÓDIGO.** La app está feature-complete, el backend está 100% vivo en prod y el compliance del lado del código está cubierto. Lo que falta para mandar a revisión son **acciones del owner en App Store Connect** + **una decisión de build**: el binario que está en ASC (build 7) **no incluye los arreglos de hoy** (reset de contraseña por OTP y el fix crítico del saldo), y como las OTA están bloqueadas, eso requiere un **build nuevo** antes del submit.

```
Código / features ........... ✅ listo (0 bloqueantes)
Backend / Supabase .......... ✅ 100% en prod (0 bloqueantes)
Build mecánica (EAS) ........ ✅ sin bloqueantes técnicos
Binario en ASC (build 7) .... 🔴 desactualizado → falta build nuevo
App Store Connect (owner) ... 🔴 atar build + suscripción a review + DSA + submit
```

---

## 1. La pregunta directa: ¿qué falta para mandar a revisión?

### 🔴 Bloqueantes (sin esto no se publica / Apple rechaza)

| # | Qué falta | Quién | Por qué bloquea |
|---|---|---|---|
| **1** | **Build nuevo (8)** que incluya los commits post-build-7 | Owner (correr `eas build`) | OTA bloqueada (sin EAS Enterprise). El build 7 (06-19) **no tiene** el reset por OTP ni el fix del saldo (ambos del 06-20). Si se manda el 7 tal cual, v1.0 sale con el reset de contraseña roto (el deep-link va a la web) y con el bug del saldo. Ver §6. |
| **2** | **Atar el build a la versión 1.0** en ASC | Owner (ASC) | Hoy la versión apunta a un build viejo (1), anterior a todo el código de suscripciones. El binario nuevo no viaja por OTA. |
| **3** | **Mandar el 1er producto de suscripción a revisión, atado a la versión** + subir el **screenshot de review de la paywall** | Owner (ASC) | Apple exige que el primer auto-renovable se revise junto con la app. Si la paywall abre y StoreKit no trae productos aprobados → **rechazo garantizado**. El screenshot de review por producto es lo que más se olvida. |
| **4** | **App Privacy "Nutrition Label"** en ASC | Owner (ASC) | El `PrivacyInfo.xcprivacy` declara `NSPrivacyCollectedDataTypes` vacío, pero la app guarda email + datos financieros en Supabase. Hay que declararlo en el label de ASC o Apple rechaza por inconsistencia. |
| **5** | **DSA / EU trader status** | Owner (ASC) | Apple lo pregunta en el submit. Respuesta conocida: no comerciante UE. |
| **6** | **Click "Submit for Review"** + 4–6 preguntas finales | Owner (ASC) | Export compliance: No · IDFA: No · contenido de terceros: No · DSA comerciante UE: No. |

### 🟡 Fuertemente recomendado antes del submit (no bloquea formalmente)

| Qué | Quién | Nota |
|---|---|---|
| Smoke-test del happy-path de compra en **TestFlight** contra el build nuevo | Owner | La compra inicial funciona aun con `APP_ENV=production`. |
| Confirmar que **ningún screenshot del listing** muestre la paywall/UI vieja | Owner | El rediseño de suscripciones cambió la UI; los 9 subidos son de features core. |
| Limpiar **estado de test fabricado** (`mario7` / family `351cf218` quedó en `active-yearly-2027`) | Owner/yo | Volver a `none`. |
| `NSPhotoLibraryUsageDescription` **en español** | Yo (código) | Evita fricción 5.1.1 (la app está en español, el string default sale en inglés). 5 min. |
| `npm run supabase:functions:check` antes del build | Yo | Las 6 edge functions con entry en `config.toml`. |
| **Remover `exp://**` de la allowlist de Redirect URLs de Supabase** (dev-only, agregado 2026-06-21 para probar Google en Expo Go) | Yo (Management API) | Wildcard amplio que **no debe quedar en prod**. Producción usa `manifiesto://auth/callback` (ya allowlisted). **Ver §6.1.** |
| Build nuevo (8) **debe incluir `expo-web-browser`** (dep del login con Google) | Owner (`eas build`) | Ya requerido por §6; al cortar desde `main` actual lo incluye. Sin él, el botón de Google falla (no crashea) con "unavailable" en prod. |

---

## 2. Qué tenemos (estado por bucket)

### ✅ COMPLETO

**Producto / cliente**
- Auth + onboarding completos: login/signup/reset (con el nuevo **OTP**), captcha (apagado a propósito), biometría + PIN, email confirmation, reauth para operaciones sensibles, relock en background/inactividad.
- Home (saldo + snapshot bundleado), Gastos (secciones + filtros + streaks + income interleaved), Fijos (3 tabs + urgencia + undo), Control V2 (6 cards), Settings, Logros, Metas de ahorro, Familia extendida (roles owner/member/covered + invites efímeros), Tours, OCR import.
- Estados de carga/empty/error presentes en las rutas críticas.

**Suscripciones / IAP** (código)
- `expo-iap` (StoreKit 2 nativo, JWS) — sin RevenueCat. Product IDs `…subscription.monthly`/`.yearly`.
- Compra con validación server-side antes de `finishTransaction`, restore visible en paywall y manage, auto-renew + grace period, downgrade diferido / upgrade inmediato, deep-link oficial de gestión, errores accionables en español.
- Disclosure de auto-renovación (Guideline 3.1.2) **visible antes de comprar**, con links a Terms y Privacy. Sin anti-steering.

**Backend (verificado en prod hoy)**
- **213/213 migraciones aplicadas** en prod (cero sin deployar, incluida la del freeze del saldo de hoy).
- 7 edge functions `ACTIVE`, las críticas con `verify_jwt` correcto (validate-purchase, appstore-notifications, register-push, notifications-orchestrator).
- 21 cron jobs activos, 43/43 tablas con RLS, todos los secrets de prod presentes, super-admin gated por email (`kontosmario@gmail.com`).

**Infra de release**
- Apple Developer + EAS + TestFlight setup completo. Build 1.0.0(7) en ASC.
- Export compliance (`usesNonExemptEncryption: false`), privacy manifests (app + ShareExtension), iconos finales 1024² (light/dark/tinted), Universal Links (`applinks:manifiestoapp.com`), Sign in with Apple, App Groups, Push.
- Dominio + sitio legal LIVE: **`/privacy/` y `/terms/` devuelven 200** (verificado hoy).
- Listing armado: copy (6 campos), 9 screenshots al tamaño exacto, age rating 4+, seed account `apple.review@manifiestoapp.com`.
- Security: 11 audit passes + 14 sprints, ~185 findings cerrados (verdict audit-saturated).

### 🟡 PARCIAL (existe y funciona, pero incompleto o con activación progresiva — **ninguno bloquea**)

| Item | Estado | Nota |
|---|---|---|
| **Alcancía (ahorro)** en Control V2 | UI lista, se desbloquea con ≥3 días con gastos ("Disponible pronto") | Activación progresiva por diseño, no bug. Copy claro. |
| **Asistente financiero** | Señales heurísticas completas; integración LLM (Claude) detrás del flag `ai_coach` (default off) | El path de Asistente consume datos locales; el LLM es enhancement futuro. |
| **Wrapped de cierre de ciclo** | Flujo de decisión del sobrante completo, con opción "skip"; `wrapped_v2` detrás de flag (default V1) | No atasca al usuario. |
| **Push remotas** | Tablas + preferencias + mark-as-read OK; requieren **dev/prod build** (no Expo Go) | La app va al App Store, no a Expo Go → resuelto en el binario. |
| **NSPhotoLibraryUsageDescription** | Inyectado por el plugin con string default **en inglés** | Recomendado localizar (§1 🟡). |
| **App Privacy label** | `xcprivacy` con `NSPrivacyCollectedDataTypes` vacío | Hay que completar el label en ASC (bloqueante #4). |

### 🔴 INCOMPLETO (conocido, **no bloqueante** para v1.0)

| Item | Nota |
|---|---|
| Sugerencia automática de monto a la meta (Alcancía) | Se muestra "—" hasta tener historial (≥3 días). Defensible. |
| `control-advisor` edge function | Dormida por diseño (sin `ANTHROPIC_API_KEY` en prod → 503 limpio). Drift de `verify_jwt` (config dice false, prod true) — irrelevante hasta prenderla. |

### 💡 NICE-TO-HAVE (mejoras, no bloquean)

- Splash branded (hoy blanco puro) · notification icon monocromo dedicado.
- `.storekit` config local (para tests en Simulator; el e2e ya se hizo en sandbox real).
- App Preview video (skipped en v1.0 por decisión).
- Higiene: `expo prebuild --clean` para no confundir con el `ios/` stale en disco.
- `appleId`/`appleTeamId` en `eas.json submit` para un submit 100% no-interactivo.
- Perf baseline (Instruments), VoiceOver manual pass, Storybook/Chromatic, cleanup de secrets deprecados.
- Borrar la cuenta `apple.review@manifiestoapp.com` post-aprobación (opcional).

---

## 3. Detalle por dimensión

### 3.1 Build / EAS / config nativa — ✅ sin bloqueantes
Flujo **managed/prebuild**: `ios/` y `android/` están gitignored; EAS hace `expo prebuild` limpio y regenera `Info.plist`/entitlements desde **`app.config.ts`** (fuente de verdad). Los archivos en `ios/` en disco están **stale** (`CFBundleVersion=5`, `aps-environment=development`) pero **no se usan** en el build de la nube → no bloquean.

- Version `1.0.0` (`app.config.ts:22`), buildNumber `7` (`:190`), `appVersionSource: local`.
- Export compliance, privacy manifests, iconos 1024², runtimeVersion `sdkVersion`, capabilities (Apple Sign-in, Associated Domains, App Groups, Push) — todo OK.
- ~~Sin `expo-tracking-transparency` ni SDKs de tracking → ATT N/A, coherente con `NSPrivacyTracking=false`.~~ **Cambió el 2026-08-23:** entra el SDK de Meta (`react-native-fbsdk-next`) para atribución de app ads + SKAdNetwork. La app PIDE ATT al arrancar (`expo-tracking-transparency`) y el privacy manifest sale con `NSPrivacyTracking=true`. **Label de App Privacy en ASC actualizado el 2026-08-23** (ID del dispositivo, Interacción con el producto e Historial de compras → Publicidad de terceros + Análisis, vinculados, "usados para rastrearte" = Sí; se publica al instante, sin versión nueva). Runbook: `docs/operaciones/meta-sdk-atribucion.md`.

### 3.2 IAP / Compliance — ✅ código listo; bloqueantes = owner-actions en ASC
Todo el código de billing, los disclosures 3.1.2, el restore visible en ambas vistas, el deep-link de gestión y el backend de validación (`validate-purchase` con firma ES256 + webhook ASSN v2 idempotente) están en estado de submit. **No hay cambios de código necesarios para pasar review.** Los bloqueantes son #3 (suscripción a review), #4 (privacy label), #5 (DSA) — todos en ASC.

### 3.3 Completitud de features — ✅ 0 halt items
Los flujos críticos (auth, home, gastos, fijos, control, cierre de ciclo) están implementados con sus estados. Los 3 "parciales" (alcancía, asistente LLM, wrapped spec-B) son defensibles y no atascan al usuario. No hay TODOs activos en componentes; las features de dev están gated por `__DEV__`.

**Watch items para QA (no bloqueantes):** transiciones offline→online en Home/Gastos/Fijos; ciclo de cobro + timezone en devices no-ARS; flows de reauth (biometría + password) en edge cases.

### 3.4 Backend / Supabase — ✅ listo, verificado contra prod
- **Migraciones:** 213 locales = 213 en prod. Última: `20260620260000_home_snapshot_freeze_until_salary_confirmed` (la de hoy, ya aplicada). El caso "cliente nuevo necesita columna que falta en RPC" está cubierto.
- **Edge functions:** 7 activas; único drift en `control-advisor` (verify_jwt config=false / prod=true) — **no bloquea** porque está dormida. Acción al prenderla: re-deploy + setear `ANTHROPIC_API_KEY`.
- **Cron:** 21 jobs activos (cierre de ciclos, notifs, streaks, retención/purga, account-deletion). **RLS:** 43/43 tablas. **Secrets:** todos presentes salvo `ANTHROPIC_API_KEY` (intencional). **Super-admin:** gated por email, seguro para prod. **Seeds demo:** idempotentes, no contaminaron prod (190 usuarios reales; solo `apple.review` como seed).

---

## 4. Runbook de owner (App Store Connect)

1. **Build nuevo:** `eas build --platform ios --profile production --auto-submit` (incluye los fixes del 06-20). Esperar el procesado en ASC.
2. **Atar el build nuevo a la versión 1.0** (reemplaza el build 1).
3. **Suscripciones → revisión:** confirmar precio/duración/nombre+descripción localizados de los 2 productos → subir **screenshot de review de la paywall** → estado "Ready to Submit" → agregarlos a la versión 1.0 en "In-App Purchases and Subscriptions". El grupo "Manifiesto Hogar" ya tiene localización (fix del `skuNotFound`).
4. **App Privacy label:** declarar email + datos financieros (Contact Info / Financial Info / User Content según corresponda).
5. **Smoke test en TestFlight** del happy-path de compra contra el build nuevo.
6. **Submit for Review** + responder: Export compliance No · IDFA No · contenido terceros No · DSA comerciante UE No.

---

## 5. Riesgos / cosas a vigilar

- **OTA bloqueada (sin EAS Enterprise):** todo cambio de JS requiere build. Esto convierte cada fix posterior al build en "esperar al próximo binario". Ver §6.
- **Inconsistencia de screenshots:** el rediseño de suscripciones cambió la paywall; verificar que el listing no muestre la versión vieja.
- **Estado de test en prod:** `mario7`/family `351cf218` en `active-yearly-2027` — limpiar antes del submit.
- **Timezone del ciclo de cobro:** validar en devices con tz ≠ AR (hay sync, pero conviene QA).

---

## 6. ⚠️ El punto más importante: el build 7 está desactualizado

El build **7** se subió el **2026-06-19**. **Todo lo del 2026-06-20 quedó afuera** del binario, y como las OTA están bloqueadas, **solo entra con un build nuevo**:

| Commit (06-20) | Qué es | Impacto si se manda el build 7 sin esto |
|---|---|---|
| `fcc8952`…`c6f8ab6` | **Reset de contraseña por OTP** (código de 6 dígitos, numpad propio, layout de login) | El reset queda **roto**: el deep-link manda a `manifiestoapp.com` en vez de resetear en la app. |
| `c4f85d8`, `064187a` | **Fix crítico del saldo** (freeze del ciclo hasta confirmar el cobro) | El **bug del saldo** (saltaba al ingreso nuevo sin confirmar) **viaja a producción**. El fix del RPC ya está en prod, pero el cliente del build 7 no tiene la otra mitad. |

> **Decisión a tomar:** v1.0 debería salir con un **build nuevo (8)** que incluya estos dos arreglos. Mandar el build 7 tal cual = publicar con el reset de contraseña roto y el bug del saldo. Recomendación: **rebuild antes del submit.**
>
> (Los cambios de moneda local / cotización USD / rediseño de logros del 06-19 podrían estar o no en el build 7 según el momento exacto del corte; el build nuevo los incluye de todos modos.)

---

## 6.1 Google sign-in (OAuth web flow) — agregado 2026-06-21

Se agregó **iniciar sesión con Google** vía el flujo **OAuth web de Supabase** (`signInWithOAuth` + PKCE), NO el id_token nativo. Es seguro (code exchange server-side, sin nonce replayable) y anda en Expo Go.

**Estado:**
- Proveedor Google **habilitado en Supabase prod** (client id + secret cargados; el secret vive solo en Supabase, no en el repo).
- Código: `mobile/features/auth/social-sign-in.ts` (flujo OAuth web) + **polyfill CSPRNG** de `globalThis.crypto.getRandomValues` con expo-crypto en `mobile/lib/runtime.ts`. Este polyfill es **load-bearing de seguridad** (hallazgo red team 2026-06-21): sin él, `@supabase/auth-js` generaba el `code_verifier` de PKCE con `Math.random()` en Hermes → verifier predecible → account takeover.
- `expo-web-browser` agregado a `package.json` → **requiere build nativa nueva** (Expo Go ya lo trae; el dev build actual / producción no). El build 8 (ya requerido por §6) lo incluye al cortarse desde `main`.

**🔴 A REMOVER ANTES DE LANZAR (config dev-only en prod):**
- En **Supabase → Authentication → URL Configuration → Redirect URLs** se agregó **`exp://**`** SOLO para probar Google en **Expo Go** (ahí el redirect es `exp://<ip>:8081/--/auth/callback`, que de otro modo no matchea). Es un wildcard amplio que **no debe quedar en producción**. La app de producción usa `manifiesto://auth/callback` (ya allowlisted) y no necesita el `exp://`. **Sacarlo de la allowlist antes del submit / cuando se deje de probar en Expo Go.**

**Cómo probar:**
- **Expo Go:** funciona ya (con `exp://` agregado + el polyfill CSPRNG). Apple igual NO funciona en Expo Go (necesita dev build).
- **Dev build / producción:** requiere build nuevo con `expo-web-browser`; el redirect `manifiesto://auth/callback` ya está allowlisted.

---

## 6.2 Comportamiento de signup social + hardening (2026-06-22)

Análisis del comportamiento correcto al apretar Google/Apple desde "Crear cuenta" (4 agentes + Apple HIG / Google / paper pre-account-takeover USENIX 2022). Conclusión: el login social es un flujo **único e idempotente** — si el email ya existe → **login automático + auto-link**, NO error "ya registrado". El comportamiento de la app ya era correcto; **no se tocó el flujo social**.

**Aplicado:**
- **#1** Signup: el panel de confirmación por email ahora ofrece "¿Ya tenés cuenta? Iniciá sesión" + copy condicional (no filtra existencia). Antes un email ya registrado quedaba esperando un mail que Supabase no manda (anti-enumeración).
- **#2** Notificación "se vinculó una identidad" activada y localizada en Supabase (mitigación barata del pre-account-takeover; antes un auto-link era 100% silencioso).
- **#3** "Continuar con Google" agregado al login (paridad con Apple, las 3 vistas).

**🟡 DIFERIDO — #4 verificación de email en el alta (`mailer_autoconfirm=false`):** es el fix de RAÍZ del pre-account-takeover (con autoconfirm=true una cuenta email/password se marca "verificada" sin probar posesión del buzón, lo que habilita la fusión por email). **Decisión owner 2026-06-22: dejarlo para después.** Riesgo residual bajo-a-moderado, parcialmente mitigado por #2. Para retomarlo bien hace falta construir el **fallback por OTP de 6 dígitos para el signup** (igual que el reset de contraseña: template con `{{ .Token }}` + `verifyOtp` + UI de código), porque la confirmación por link sola depende de PKCE (only same-device) y no anda en Expo Go ni cross-device. Recién después prender `autoconfirm=false`.

---

## 7. Resumen ejecutivo para decidir hoy

1. **¿Publicamos los fixes de hoy en v1.0?** → Sí ⟹ **correr un build nuevo** (bloqueante #1). Es la única vía (OTA bloqueada).
2. Mientras procesa el build: **atar build + mandar la suscripción a review + completar App Privacy label + DSA** (bloqueantes #2–#5, todo en ASC).
3. **Smoke test en TestFlight** del build nuevo y **Submit** (#6).
4. Lo demás (parciales, incompletos, nice-to-have) **no bloquea** v1.0.

**Estimación de camino crítico:** ~1 build (procesado de EAS/ASC, típicamente 30–60 min) + ~1–2 h de owner-actions en ASC. Cero trabajo de código bloqueante (salvo el opcional de localizar el string de fotos, 5 min).

---

## Apéndice — Metodología y fuentes

**Auditoría multi-agente (5 en paralelo), 2026-06-20:**
1. Build / EAS / config nativa iOS — `app.config.ts`, `eas.json`, `package.json`, privacy manifests, iconos.
2. IAP / suscripciones / StoreKit + compliance — `mobile/features/billing/*`, `mobile/components/billing/*`, `validate-purchase`, `legal-urls.ts`, listing.
3. Completitud de features — barrido de marcadores (TODO/FIXME/WIP/placeholder) + estados por área en `mobile/`.
4. Backend Supabase — migraciones vs prod (Management API read-only), edge functions + `config.toml`, cron, RLS, secrets, super-admin.
5. Reconciliación de docs — `docs/PRE-LAUNCH.md` (canónico, build 7) + `docs/ESTADO-DEL-PROYECTO/` + roadmap.

**Verificación directa (yo):** número de build (`app.config.ts` → 1.0.0/7), recencia de git (commits del 06-20 en `main` post-build), URLs legales (`/privacy/` y `/terms/` → 200), estado de migraciones en prod (213/213).

**Relación con `docs/PRE-LAUNCH.md`:** PRE-LAUNCH sigue siendo el checklist operativo de owner-actions. Este documento lo complementa con la verificación de código/prod y agrega el hallazgo del build desactualizado (§6), que PRE-LAUNCH no captura porque se escribió antes de los fixes de hoy.
