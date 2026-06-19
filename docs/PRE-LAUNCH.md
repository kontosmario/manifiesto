# Manifiesto · PRE-LAUNCH — Checklist único de lanzamiento

> **Fecha**: 2026-06-15
> **Propósito**: documento ÚNICO y exclusivo con TODO lo que falta para publicar
> en App Store (y luego Play Store). Reemplaza la lectura dispersa de los docs de
> estado para la pregunta "¿qué falta para lanzar?".
> **Regla**: ningún ítem 🔴/🟡 de la sección "Blockers" puede quedar abierto al
> hacer Submit. Los 🔵 son acciones del owner (decisión de timing).

---

## 0. TL;DR

El producto está **funcionalmente completo y endurecido**. Suscripciones reales
(StoreKit 2 + validate-purchase + webhook ASSN v2), UI rediseñada y alineada a
Settings, estados claros (titular / cubierto / MVP), super-admin para acceso MVP,
compliance Apple 3.1.2 en la paywall. Todo el backend de suscripciones está
**vivo en prod** y verificado e2e en sandbox.

**Lo que BLOQUEA el launch hoy** (resumen):
1. ✅ **Build nuevo** — build **1.0.0 (7)** generado + subido a App Store Connect
   (2026-06-19, `eas build --auto-submit`). Incluye suscripciones + todo el trabajo
   reciente (rediseño de familia, contador fluido, fix de notificaciones, tabs
   dinámicas de fijos). Supersede al build 6. **Falta atarlo a la versión 1.0 en
   ASC (B2)** y enviarlo a review.
2. ✅ **Paid Apps Agreement activo** — hecho (banking vía DolarApp, 2026-06-15).
3. 🔴 **Primera suscripción enviada a revisión** con la versión de la app (Apple
   lo exige para el primer producto auto-renovable). Ver §1.
4. ✅ **APP_ENV → production** — hecho (2026-06-15, webhook redeployado) + test
   states limpiados.
5. ✅ **Captcha**: DESHABILITADO a propósito (decisión 2026-06-15) — era fricción
   sin protección (Supabase no lo enforce-aba). Ya no es un blocker.
6. 🔵 **Submit for Review** — el click final (owner decide cuándo).

---

## 1. Suscripciones / IAP — estado y pendientes

### ✅ Hecho (vivo en prod / en el código)
- Modelo per-familia, cascada `resolve_entitlement` (mvp > comped > family >
  trial > free), `validate-purchase` (JWS), webhook ASSN v2 idempotente.
- UI rediseñada: PaywallView + ManageView, estados (activa / "Habilitado hasta" /
  gracia / cortesía / **miembro cubierto** / **MVP**), downgrade diferido con
  banner optimista + reconciliación, sheets on-brand.
- **Compliance Apple 3.1.2(f)**: disclosure de auto-renovación en la paywall
  (cargo a Apple ID · renovación salvo cancelación 24hs · gestión en Ajustes),
  Términos + Privacidad + Restaurar, gestión vía App Store deep-link.
- Comprador vs miembro cubierto (`is_purchaser`), integrantes del hogar
  (avatar + nombre + ingreso), super-admin MVP (solo kontosmario@gmail.com).
- `validate-purchase` **deployado a prod**; migraciones `20260620120000`→`150000`
  **aplicadas a prod**.
- Verificado e2e en sandbox: alta, upgrade inmediato, downgrade diferido,
  restore, renovación, cross-family 409, MVP resolution.

### 🔴 Blockers de launch (suscripciones)
| # | Item | Detalle |
|---|---|---|
| S1 | ✅ **Paid Apps Agreement activo** | HECHO (2026-06-15) — banking vía DolarApp, agreement firmado. Sin esto Apple no permite vender. |
| S2 | **Primer producto de suscripción → "Submit for Review"** | Los productos `...monthly`/`.yearly` se mandan a revisión ATADOS a la versión de la app (Apple lo exige; sin eso → rechazo). **Paso a paso en §9.B.** |
| S3 | **EU DSA / trader status** | Apple pregunta en el submit. Respuesta conocida (no comerciante UE). |

### 🟡 Recomendado antes de Submit
- Re-correr el flujo en **TestFlight** (build nuevo) con una cuenta sandbox para
  confirmar el happy-path contra el build de producción.
- Revisar si algún screenshot del listing muestra la pantalla de planes vieja
  (el rediseño cambió la UI; los 9 screenshots subidos son de features core, no
  de la paywall — confirmar).

---

## 2. Build & Release

| # | Item | Estado | Detalle |
|---|---|---|---|
| B1 | **Build nuevo con TODO el trabajo de suscripciones** | ✅ | **Build 1.0.0 (7)** subido a ASC 2026-06-19 (`eas build --profile production --auto-submit`, build ID `b60e565b`). Incluye suscripciones + rediseño de familia + contador fluido + fix de notificaciones + tabs dinámicas de fijos. (Supersede al build 6, ID `74688ee5`.) |
| B2 | Atar el build nuevo a la versión 1.0 en App Store Connect | 🔴 | **PENDIENTE (owner)** — en ASC, versión 1.0 → seleccionar el build **(7)**. Reemplaza el (1). |
| B5 | **OTA bloqueado** (post-launch) | ⚠️ | La firma de updates (`codeSigningCertificate`) requiere **EAS Enterprise**, que la cuenta no tiene → `eas update` falla al firmar. Implicancia: **todo cambio de JS requiere build** hasta resolver el plan (o sacar la firma). No bloquea esta submission. |
| B3 | hCaptcha baseUrl al dominio propio | ✅ | Ya configurado (commit `8f3d5b8`). |
| B4 | Verificar `npx expo export --platform ios` antes del build | ✅ | Se corre en cada cambio; última corrida verde. |

---

## 3. Config / Cleanup (antes de prod)

| # | Item | Estado | Acción |
|---|---|---|---|
| C1 | **`APP_ENV` → `production`** | ✅ HECHO (2026-06-15) | Seteado a `production` + webhook `appstore-notifications` redeployado para tomar el secret. El webhook ahora salta eventos de sandbox (`isSandboxUnderProd`). **Nota:** para un test de ciclo de vida (renovaciones) en TestFlight sandbox habría que volver a `sandbox` temporal; el e2e de ciclo ya se verificó. |
| C2 | **Limpiar estado fabricado de test** | 🟡 PENDIENTE | mario7 / family `351cf218` quedó en active-yearly-2027 de un test → volver a `none`. |
| C3 | **Captcha deshabilitado (decisión)** | ✅ | Kill-switch `CAPTCHA_ENABLED=false` en `mobile/lib/captcha-config.ts` — el modal era fricción sin protección (Supabase `security_captcha_enabled=false`). Quedamos con el rate-limiting nativo de Supabase. Para reactivar: flag a true + enforcement en Supabase. |
| C4 | Seed account de Apple Review | ✅ | `apple.review@manifiestoapp.com` lista (password rotado out-of-band). |

---

## 4. Seguridad / Backend

- ✅ Security audit saturado (11 passes / 14 sprints, ~185 findings). Ver
  `docs/ESTADO-DEL-PROYECTO/2026-06-11-security-hardening-FINAL.md`.
- ✅ Super-admin MVP: gate `is_super_admin()` por email; los RPCs admin
  (`admin_search_users`, `admin_set_mvp`) verifican el gate como PRIMERA línea
  (`forbidden` si no). **Verificado**: sin ser kontosmario → forbidden.
- ✅ `signed_date` ordering: `validate-purchase` rechaza receipts sin signedDate
  (no fabrica timestamps → no brickea entitlements).
- ✅ Captcha deshabilitado a propósito (C3); rate-limiting nativo de Supabase
  activo (`rate_limit_otp`, etc.).
- ✅ **Push pipeline hardening (2026-06-15)**: auditoría adversarial (44 findings)
  + fixes. Ver `docs/sistemas/notifications.md` (sección "Pipeline de entrega").
  Edge functions deployadas + migración `20260620180000` aplicada. **Causa raíz
  histórica**: `register-push-subscription` nunca estuvo deployada (no estaba en
  config.toml ni en los scripts) → push roto en silencio ~7-10 semanas.
- ⚠️ **Antes de cada release, correr `npm run supabase:functions:check`** — verifica
  que las 6 edge functions tengan entry en `config.toml` (con `verify_jwt` explícito)
  y no quede ninguna sin deployar/configurar. Los scripts npm de deploy ahora
  deployan TODAS, no una hardcodeada.

---

## 5. Android (post-iOS)

| # | Item | Estado |
|---|---|---|
| A1 | Android prebuild + AndroidManifest audit | 🔴 pre-Play Store |
| A2 | SHA256 real en `assetlinks.json` (hoy placeholder) | 🔴 pre-Play Store |
| A3 | Google Play Console setup | 🔴 |

---

## 6. Decisiones / NO hacer

- **Sentry / crash reporting**: SKIPPED (decisión owner). Re-evaluar con triggers
  concretos (>1000 MAU / crash sin repro).
- **plan-tiles + mark de celebración**: conservan el look "hero" (gradiente
  forest) por decisión de diseño. Opcional calmarlos si se quiere 100% Settings.
- **App Preview video**: skipped en v1.0 (agregar en v1.1 si la conversión flojea).

---

## 7. Post-launch (no bloquea)
- Analytics / conversion tracking.
- Perf baseline FPS (Instruments en device — desbloqueado con TestFlight).
- Observability (P4) — decisión owner.
- Monitorear el webhook ASSN v2 + tasa de validate-purchase en prod.

---

## 8. Orden sugerido de ejecución
1. ✅ Paid Apps Agreement (S1) — hecho.
2. ✅ `APP_ENV → production` (C1) + test states limpiados (C2) + captcha off (C3) — hecho.
3. **[SIGUIENTE]** Bump buildNumber → `eas build` + `eas submit` (B1/B2). Ver §9.A.
4. Atar build a la versión + enviar productos de suscripción a revisión. Ver §9.B.
5. Smoke test en TestFlight (happy-path de compra).
6. **Submit for Review** (el click).

---

## 9. Runbook del owner — las 2 acciones manuales que quedan

### 9.A · Build nuevo + submit del binario
El binario en App Store Connect (1.0 build 1) es ANTERIOR a TODO el trabajo de
suscripciones (código nativo, no viaja por OTA). Hay que generar uno nuevo:
1. Bump `buildNumber` (lo gobierna `app.config.ts`).
2. `eas build --platform ios --profile production`.
3. `eas submit --platform ios` (sube el `.ipa` a App Store Connect).
4. En App Store Connect → versión 1.0 → atar el build nuevo (reemplaza el (1)).

### 9.B · Enviar la suscripción a revisión (lo que más confunde)
En App Store Connect se revisan DOS cosas por separado: (1) la app/versión y
(2) los **productos de suscripción**, cada uno con su propio estado de review
(*Missing Metadata → Ready to Submit → Waiting for Review → Approved*).

**Apple exige que el PRIMER producto auto-renovable se mande a revisión ATADO a
una versión de la app.** No se revisa solo. Y no se puede vender hasta que esté
"Approved" — si mandás la app sin las subs adjuntas, el reviewer abre la paywall,
StoreKit no puede traer los productos no aprobados → **rechazo**.

Pasos:
1. App Store Connect → app → **Suscripciones** → grupo "Manifiesto Hogar"
   (la localización del grupo ya está — fue el fix del `skuNotFound`).
2. Por cada plan (Mensual / Anual): confirmá **precio**, **duración**,
   **nombre + descripción localizados**, y subí el **screenshot de review** de
   la paywall (lo que más se olvida) → el estado pasa a *"Ready to Submit"*.
3. Andá a la **versión 1.0** → sección **"In-App Purchases and Subscriptions"** →
   **`+` y agregá los 2 productos** a esta versión.
4. Al hacer **"Submit for Review"** de la versión, las subs van a revisión JUNTO
   con la app.

**⚠️ Gotcha:** si NO adjuntás los productos a la versión (paso 3), no se revisan
→ la app puede aprobarse pero el IAP queda roto. Siempre adjuntarlos antes del
submit.

**Nota APP_ENV:** está en `production` → el webhook saltea eventos de **sandbox**.
Para el smoke-test en TestFlight, la **compra inicial igual funciona**
(`validate-purchase` no tiene ese guard); solo los eventos de ciclo de vida
sandbox (renovaciones) se saltean. Si querés re-testear renovaciones en
TestFlight, volvé `APP_ENV` a `sandbox` temporalmente.
