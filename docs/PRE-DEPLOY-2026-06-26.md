# PRE-DEPLOY · 2026-06-26 — ¿Qué falta para publicar Manifiesto en iOS y mandarla a revisión?

> **Documento de readiness de release, al día de HOY.** Auditoría punta a punta
> (código + backend en prod + config de build + compliance + docs) verificada
> contra el repo y contra producción el **2026-06-26**.
>
> **Supersede a `docs/PRE-DEPLOY.md` (2026-06-20) y a `docs/PRE-LAUNCH.md` (2026-06-15).**
> Si algo contradice a esos, este documento es el más fresco. Lo que cambió desde
> el 06-20: ~173 commits nuevos (Jardín/Logros, overhaul de onboarding, precios
> reales de StoreKit, moneda local/USD, fix de conectividad, hardening de backend),
> el `photosPermission` ES ya quedó aplicado, y aparecieron 2 hallazgos nuevos:
> **trabajo sin commitear en curso** y **drift de migraciones repo↔prod**.

- **App:** Manifiesto — finanzas personales del hogar. React Native + Expo (SDK 54) + Supabase.
- **Bundle id:** `com.manifiesto.mobile.ZKYQF7UNYA` · **Versión:** `1.0.0` · **Build en ASC:** `7` (06-19, desactualizado).
- **Verificado hoy:** `app.config.ts` (version/build/encryption/permisos), git (HEAD `cb204c3` + 63 archivos sin commitear), URLs legales (200), backend (241 migraciones en prod, 8 edge functions ACTIVE, advisors security+performance).

---

## 0. Veredicto en una línea

**No hay un solo bloqueante de CÓDIGO para que Apple apruebe.** La app está
feature-complete, el backend está 100% vivo en prod y el compliance del lado del
código está cubierto. Pero **el camino al submit es más largo que el 06-20** por
dos cosas concretas: (1) hay **trabajo de copy sin commitear/terminar** (barrido
de voseo) que hay que cerrar primero, y (2) el binario en ASC (build 7) está
**muy** desactualizado — le faltan ~173 commits — y como la OTA está bloqueada,
eso obliga a un **build nuevo (8)** recién después de commitear.

```
Código / features ............ ✅ listo (0 bloqueantes de review)
Backend / Supabase ........... ✅ vivo en prod (advisors de seguridad: ver §5)
Trabajo sin commitear ........ 🔴 63 archivos (barrido de voseo en curso) → cerrar y commitear
Build mecánica (EAS) ......... ✅ sin bloqueantes técnicos
Binario en ASC (build 7) ..... 🔴 desactualizado (~173 commits) → build 8 obligatorio
App Store Connect (owner) .... 🔴 atar build + suscripción a review + privacy label + DSA + submit
```

**Camino crítico estimado:** cerrar el barrido de copy (¿1–2 h?) → commit →
1 build EAS (~30–60 min de procesado) → ~1–2 h de owner-actions en ASC.

---

## 1. La pregunta directa: ¿qué falta para mandar a revisión?

### 🔴 Bloqueantes (sin esto no se publica / Apple rechaza / saldría una versión mala)

| # | Qué falta | Quién | Por qué bloquea |
|---|---|---|---|
| **1** | **Cerrar y commitear el trabajo en curso** (63 archivos, barrido de neutralización de voseo en el copy) | Yo / owner | Un build sale de código **commiteado**. Hoy el working tree tiene 284 ins/284 del sin commitear. Si se buildea así, el barrido queda a medias o no entra. Ver §6.1. |
| **2** | **Build nuevo (8)** que incluya TODO lo post-build-7 | Owner (`eas build`) | OTA bloqueada (sin EAS Enterprise). El build 7 (06-19) **no tiene** ~173 commits: Jardín/Logros, onboarding nuevo, precios reales de StoreKit, `photosPermission` ES, fix de conectividad, moneda/USD, OTP reset, freeze del saldo. Mandar el 7 = publicar una versión vieja y con bugs ya resueltos. Ver §6.2. |
| **3** | **Atar el build 8 a la versión 1.0** en ASC | Owner (ASC) | La versión hoy apunta a un build viejo. El binario nuevo no viaja por OTA. |
| **4** | **1er producto de suscripción → "Submit for Review", atado a la versión** + subir el **screenshot de review de la paywall** | Owner (ASC) | Apple exige que el primer auto-renovable se revise junto con la app. Si la paywall abre y StoreKit no trae productos aprobados → **rechazo**. El screenshot de review por producto es lo que más se olvida. |
| **5** | **App Privacy "Nutrition Label"** en ASC | Owner (ASC) | El `PrivacyInfo.xcprivacy` declara `NSPrivacyCollectedDataTypes` vacío, pero la app guarda email + datos financieros en Supabase. Hay que declararlo en el label de ASC o Apple rechaza por inconsistencia. |
| **6** | **DSA / EU trader status** | Owner (ASC) | Apple lo pregunta en el submit. Respuesta conocida: no comerciante UE. |
| **7** | **Click "Submit for Review"** + preguntas finales | Owner (ASC) | Export compliance: No · IDFA: No · contenido de terceros: No · DSA comerciante UE: No. |

### 🟡 Fuertemente recomendado antes del submit (no bloquea formalmente)

| Qué | Quién | Nota |
|---|---|---|
| **Remover `exp://**` de la allowlist de Redirect URLs de Supabase** (dev-only, agregado para probar Google en Expo Go) | Yo (Management API) | Wildcard amplio que **no debe quedar en prod**. Producción usa `manifiesto://auth/callback` (ya allowlisted). Sigue pendiente desde el 06-20. |
| Smoke-test del happy-path de compra en **TestFlight** contra el build 8 | Owner | La compra inicial funciona aun con `APP_ENV=production`. |
| Confirmar que **ningún screenshot del listing** muestre la paywall/UI vieja | Owner | El rediseño de suscripciones + el de onboarding cambiaron UI; los 9 subidos son de features core. |
| Limpiar **estado de test fabricado** (`mario7` / family `351cf218` en `active-yearly-2027`) | Owner/yo | Volver a `none`. |
| Resolver el **drift de migraciones repo↔prod** (§5.2) | Yo | Higiene de reproducibilidad, no bloquea review. |
| `npm run supabase:functions:check` antes del build | Yo | Confirmar que las 8 edge functions tengan entry en `config.toml`. |
| Revisar los **advisors de seguridad** (1 ERROR + 239 WARN, §5.1) | Yo | No bloquean el review de Apple; sí conviene cerrarlos pre/post-launch. |

---

## 2. Qué tenemos (estado por bucket)

### ✅ COMPLETO

**Producto / cliente**
- Auth + onboarding completos: login/signup/reset (con **OTP** de 6 dígitos), captcha
  (apagado a propósito), biometría + PIN, email confirmation, reauth para operaciones
  sensibles, relock en background/inactividad, **Google + Apple sign-in** (OAuth web + PKCE).
- **Onboarding rediseñado** (06-23/24): chrome moderno, paleta unificada, flourishes
  premium (CountUpText), banda hero de marca, bienvenida al acceso completo con la
  pantalla de planes real + disclosure 3.1.2.
- Home (saldo + snapshot bundleado + freeze del ciclo hasta confirmar el cobro),
  Gastos, Fijos (tabs dinámicas + urgencia + undo), Control V2, Settings (reordenado),
  **Logros** (18 íconos SVG + galería + detalle), **Jardín de rachas** (solo lectura,
  4 vistas, Floración reemplazó el modal de logros), Metas de ahorro, Familia extendida,
  Tours, OCR import, **moneda local + cotización USD automática**.
- **Fix de conectividad** (06-25): verifica internet REAL antes de mostrar "sin conexión".
- Estados de carga/empty/error presentes en las rutas críticas.

**Suscripciones / IAP** (código)
- `expo-iap` (StoreKit 2 nativo, JWS) — sin RevenueCat. **Precios reales de StoreKit**
  con skeleton anti-flash (06-25). Product IDs `…subscription.monthly`/`.yearly`.
- Compra con validación server-side antes de `finishTransaction`, restore visible,
  auto-renew + grace, downgrade diferido / upgrade inmediato, deep-link de gestión.
- Disclosure de auto-renovación (3.1.2) visible antes de comprar, con links a Terms y Privacy.
- **Suscripciones por uso real** (merge 06-23, vivo en prod): check-in post-pago reemplazó
  al zombi por ausencia-de-pago.

**Backend (verificado en prod HOY)**
- **241 migraciones aplicadas** en prod (última `20260626175452_achievements_copy_neutralize_voseo`, de hoy).
- **8 edge functions `ACTIVE`** (se sumó `usd-rate` para la cotización). Las críticas con
  `verify_jwt` correcto: `validate-purchase` (true), `appstore-notifications` (false, webhook),
  `register-push-subscription` (true), `notifications-orchestrator` (false, cron).
- **Performance advisors limpios** (solo INFO de índices sin uso aún — tráfico bajo, no es bug).
- Hardening de performance del backend cerrado (RLS init-plan, índices FK, policies, dup-index — 06-25).
- Super-admin gated por email (`kontosmario@gmail.com`).

**Infra de release**
- Apple Developer + EAS + TestFlight setup completo.
- Export compliance (`usesNonExemptEncryption: false`), privacy manifests (app + ShareExtension),
  iconos 1024² (light/dark/tinted), Universal Links (`applinks:manifiestoapp.com`),
  Sign in with Apple, App Groups, Push.
- **`photosPermission` en español** ya aplicado en `app.config.ts:104` (commit `4e37793`) —
  cierra el 🟡 que el PRE-DEPLOY del 06-20 dejaba abierto.
- Dominio + sitio legal LIVE: `/privacy/` y `/terms/` (en `lib/legal-urls.ts`).
- Listing armado: copy (6 campos), 9 screenshots al tamaño exacto, age rating 4+,
  seed account `apple.review@manifiestoapp.com`.
- Security: 11 audit passes + 14 sprints, ~185 findings cerrados (verdict audit-saturated).

### 🟡 PARCIAL (existe y funciona, ninguno bloquea)

| Item | Estado | Nota |
|---|---|---|
| **Alcancía (ahorro)** en Control V2 | Se desbloquea con ≥3 días con gastos | Activación progresiva por diseño. Capeada al dinero real disponible. |
| **Asistente financiero** | Señales heurísticas completas; LLM (Claude) detrás del flag `ai_coach` (off) | El path consume datos locales; el LLM es enhancement futuro. |
| **Wrapped de cierre de ciclo** | Flujo de decisión del sobrante completo; `wrapped_v2` detrás de flag | No atasca al usuario. |
| **App Privacy label** | `xcprivacy` con `NSPrivacyCollectedDataTypes` vacío | Completar el label en ASC (bloqueante #5). |
| **Notificaciones "sin culpa" (Jardín)** | Backend reformulado; pendiente activar emisores con OK del owner | No bloquea. |

### 🔴 INCOMPLETO (conocido, **no bloqueante** para v1.0)

| Item | Nota |
|---|---|
| `control-advisor` edge function | Dormida por diseño (sin `ANTHROPIC_API_KEY` → 503 limpio). Drift `verify_jwt` (config=false / prod=true) — irrelevante hasta prenderla. |
| Android | Post-iOS: prebuild + AndroidManifest + SHA256 real en `assetlinks.json` + Play Console. |

### 💡 NICE-TO-HAVE (no bloquean)

- Splash branded · notification icon monocromo dedicado · App Preview video (skipped v1.0).
- `appleId`/`appleTeamId` en `eas.json submit` para submit no-interactivo.
- Perf baseline (Instruments) · VoiceOver pass · cleanup de secrets deprecados.
- Borrar `apple.review@manifiestoapp.com` post-aprobación (opcional).
- Sentry/crash reporting: SKIPPED (decisión owner; re-evaluar con >1000 MAU o crash sin repro).

---

## 3. Detalle por dimensión

### 3.1 Build / EAS / config nativa — ✅ sin bloqueantes técnicos
Flujo **managed/prebuild**: `ios/`/`android/` gitignored; EAS hace `expo prebuild` limpio
y regenera `Info.plist`/entitlements desde **`app.config.ts`** (fuente de verdad).
- `version: '1.0.0'` (`app.config.ts:22`), `buildNumber: '7'` (`:214`), `appVersionSource: local`.
- `usesNonExemptEncryption: false` (`:234`), bundle `com.manifiesto.mobile.ZKYQF7UNYA` (`:205`).
- `runtimeVersion: { policy: 'sdkVersion' }`, `photosPermission` ES (`:104`), `microphonePermission: false`.
- Sin SDKs de tracking → ATT N/A, coherente con `NSPrivacyTracking=false`.
- **El único trabajo de build pendiente es bumpear a `8` y cortar** (después de commitear, §6).

### 3.2 IAP / Compliance — ✅ código listo; bloqueantes = owner-actions en ASC
Todo el billing, los disclosures 3.1.2, el restore visible, el deep-link de gestión y el
backend de validación (`validate-purchase` ES256 + webhook ASSN v2 idempotente) están en
estado de submit. **No hay cambios de código necesarios para pasar review.** Bloqueantes =
#4 (suscripción a review + screenshot), #5 (privacy label), #6 (DSA) — todos en ASC.

### 3.3 Completitud de features — ✅ 0 halt items
Flujos críticos implementados con sus estados. Los parciales (alcancía, asistente LLM,
wrapped V2) son defensibles. Features de dev gated por `__DEV__`.

### 3.4 Backend / Supabase — ✅ vivo, con items de hardening abiertos
- **Migraciones:** 241 en prod. **Drift con el repo (239 archivos): ver §5.2.**
- **Edge functions:** 8 ACTIVE. Único drift en `control-advisor` (dormida) — no bloquea.
- **Advisors de seguridad: 1 ERROR + 239 WARN abiertos — ver §5.1.** No bloquean el review.

---

## 4. Runbook de owner (App Store Connect)

1. **(Pre)** Cerrar el barrido de copy + commitear (§6.1).
2. **Build nuevo:** `eas build --platform ios --profile production --auto-submit` (bump a 8). Esperar el procesado en ASC.
3. **Atar el build 8 a la versión 1.0.**
4. **Suscripciones → revisión:** confirmar precio/duración/nombre+descripción localizados de los 2 productos → subir **screenshot de review de la paywall** → "Ready to Submit" → agregarlos a la versión 1.0 en "In-App Purchases and Subscriptions". El grupo "Manifiesto Hogar" ya tiene localización.
5. **App Privacy label:** declarar email + datos financieros (Contact Info / Financial Info / User Content).
6. **Smoke test en TestFlight** del happy-path de compra contra el build 8.
7. **Submit for Review** + responder: Export compliance No · IDFA No · contenido terceros No · DSA comerciante UE No.

---

## 5. Backend — hallazgos a cerrar (no bloquean el review de Apple)

### 5.1 Advisors de seguridad (Supabase) — abiertos al 2026-06-26
Corrida hoy de `get_advisors` (security):

| Nivel | Hallazgo | Lectura | Acción sugerida |
|---|---|---|---|
| **ERROR** ×1 | **Security Definer View** — `public.account_deletions_due` definida con `SECURITY DEFINER` | **Benigno.** La vista es un `SELECT id, deletion_scheduled_at FROM profiles WHERE deletion_scheduled_at <= now()`; la consume el cron de borrado (service role). No expone columnas sensibles. | Opcional: recrearla con `security_invoker = true` para limpiar el advisor. |
| **WARN** ×239 | **Public Can Execute SECURITY DEFINER Function** — `anon` puede ejecutar casi todos los RPCs | **Mitigado, no abierto de par en par.** Cada RPC sensible gatea por `auth.uid()` / `is_super_admin()` internamente (ej.: `admin_set_mvp` → `forbidden` si no sos super-admin). El advisor es conservador: marca el grant, no una fuga real. | Hardening: `REVOKE EXECUTE … FROM anon` en las que deban ser solo `authenticated`. Barrido, no urgente. |
| **WARN** ×1 | **Leaked Password Protection Disabled** (HaveIBeenPwned) | Toggle de Supabase Auth apagado. | Owner: prenderlo en el dashboard (1 click). Histórico residual conocido. |

> **Veredicto:** ninguno bloquea el review de Apple (Apple no corre el linter de Supabase).
> Son deuda de hardening. El ERROR de la vista es el de cierre más barato; los 239 WARN
> son un barrido de `REVOKE` para otra sesión.

### 5.2 Drift de migraciones repo ↔ prod
- **Prod:** 241 migraciones aplicadas (última `20260626175452_achievements_copy_neutralize_voseo`, hoy).
- **Repo:** 239 archivos en `supabase/migrations/` (última `20260625170000_expenses_insert_single_strict_policy.sql`).
- **Qué está en prod y NO en el repo:**
  - `sim_account_mario_kenility_01/02/03` — la cuenta demo (aplicada vía MCP, no commiteada).
  - `achievements_copy_neutralize_voseo` (hoy) — fix de copy de logros aplicado directo a prod.
  - Las migraciones de perf/RLS (`rls_initplan_perf`, `fk_covering_indexes`, `function_search_path`, etc.) se aplicaron a prod **vía MCP con timestamps distintos** a los archivos locales (mismo contenido, otro `version`).
- **Riesgo operativo:** si alguien corre `supabase db push` desde el repo, los archivos locales con timestamps **anteriores** a los ya aplicados en prod se intentarían aplicar como nuevos → DDL duplicado → posibles errores ("policy already exists"). **No tocar `db push` sin reconciliar primero.**
- **Acción sugerida (no bloquea):** versionar en el repo las migraciones que solo viven en prod (al menos el fix de voseo de logros) y documentar que las de perf ya están aplicadas, para que el repo reproduzca prod.

---

## 6. Los dos puntos calientes de hoy

### 6.1 🔴 Trabajo sin commitear en curso (barrido de voseo)
El working tree tiene **63 archivos modificados, 284 inserciones / 284 borrados** (cambio
simétrico = find-replace de copy). Coincide con la migración aplicada hoy a prod
`achievements_copy_neutralize_voseo`: es la **neutralización del voseo argentino en el copy**
de la app (lado cliente), **en curso y sin commitear**.

- **Implicancia:** un build sale de código commiteado. Hay que **terminar el barrido,
  revisarlo y commitearlo** antes de cortar el build 8. Si no, sale a medias.
- **Decisión a tomar:** ¿el barrido de voseo entra en v1.0 o se difiere? Si entra (lo
  más coherente con el fix de DB ya en prod), cerrarlo primero. Si se difiere, decidir
  qué hacer con la migración de logros ya aplicada (la copy de DB ya está neutralizada,
  el cliente no — quedaría inconsistente).

### 6.2 🔴 El build 7 está MUY desactualizado (~173 commits)
El build **7** se subió el **2026-06-19**. Todo lo del 06-20 en adelante quedó afuera, y la
OTA está bloqueada. Lo que falta en el binario incluye, entre otros:

| Bloque (post build 7) | Qué es | Impacto si se manda el 7 |
|---|---|---|
| Jardín + Logros | Sistema de rachas + 18 íconos SVG + Floración | Features visibles ausentes. |
| Onboarding nuevo (T0–T4) | Chrome moderno + bienvenida con planes reales | Onboarding viejo. |
| Reset por OTP + freeze del saldo | (ya estaban afuera del 7 según PRE-DEPLOY 06-20) | Reset roto + bug del saldo. |
| Precios reales de StoreKit | Paywall con precios live + skeleton | Precios hardcodeados/placeholder. |
| `photosPermission` ES | String del prompt de fototeca en español | Sale en inglés (fricción 5.1.1). |
| Fix de conectividad | Verificar internet real antes de "sin conexión" | Falsos "sin conexión". |
| Moneda local + USD | Cotización automática | Ausente. |
| Hardening de backend (cliente) | Contrapartes cliente del hardening | Desalineado con prod. |

> **Recomendación:** v1.0 debe salir con **build 8** cortado desde `main` **después** de
> commitear el barrido de voseo (§6.1). Es la única vía (OTA bloqueada).

---

## 7. Resumen ejecutivo para decidir hoy

1. **¿Entra el barrido de voseo en v1.0?** → si sí, **cerrarlo y commitear** (bloqueante #1). Decidir antes de buildear.
2. **Build 8** desde `main` (bloqueante #2) — incluye los ~173 commits + el barrido.
3. Mientras procesa: **atar build + suscripción a review + privacy label + DSA** (#3–#6, todo en ASC).
4. **Smoke test en TestFlight** del build 8 y **Submit** (#7).
5. **Antes del submit:** remover `exp://**` de Supabase + limpiar `mario7` (🟡).
6. Backend hardening (advisors §5.1) y drift de migraciones (§5.2): **post-launch**, no bloquean.

**Cero trabajo de código bloqueante para que Apple apruebe** — salvo cerrar el barrido de
copy ya empezado. El resto es build + owner-actions en ASC.

---

## Apéndice — Verificación directa (2026-06-26)

- **app.config.ts:** version `1.0.0`, buildNumber `7`, `usesNonExemptEncryption:false`, `photosPermission` ES, bundle `…ZKYQF7UNYA`.
- **git:** HEAD `cb204c3`; 63 archivos sin commitear (284/284, barrido de copy); 0 untracked; ~173 commits desde el último doc de estado (06-17).
- **Backend (Management API, read-only):** 241 migraciones en prod (última hoy); 8 edge functions ACTIVE; performance advisors solo INFO; security advisors 1 ERROR + 239 WARN + leaked-password.
- **Legal:** `lib/legal-urls.ts` → `manifiestoapp.com/privacy/` y `/terms/`.
- **Relación con docs previos:** supersede `PRE-DEPLOY.md` (06-20) y `PRE-LAUNCH.md` (06-15). El §9 runbook de PRE-LAUNCH sigue válido para el detalle de "submit de la suscripción".
