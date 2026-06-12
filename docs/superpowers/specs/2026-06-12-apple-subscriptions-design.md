# Suscripciones de Apple (StoreKit / IAP nativo) — Diseño

> **Fecha**: 2026-06-12 · **Branch**: `feature/subscriptions` · **Estado**: aprobado por owner (brainstorm 2026-06-12)
>
> **Objetivo**: monetizar Manifiesto con suscripciones auto-renovables de
> Apple, 100% nativas (la compra usa la hoja de StoreKit; el usuario nunca
> ve un proveedor externo). Período libre de 30 días por hogar; al vencer
> sin pago, paywall duro que bloquea la app hasta suscribirse. Sin terceros
> en la validación (expo-iap + edge functions propias de Supabase).
>
> **Investigación de base**: 3 reportes (2026-06-12) sobre librerías IAP,
> validación server-side de Apple, y compliance de App Store Review. Las
> fuentes están citadas inline en las secciones que aplican.

## Decisiones (Q&A con owner)

| Decisión | Elección | Por qué |
|---|---|---|
| Librería / validación | **expo-iap** (StoreKit 2), validación propia en Supabase | Sin terceros en la ruta de datos. La compra es Apple-nativa igual. |
| Período de 30 días | **App-gestionado, sin tarjeta** (NO "trial" de Apple) | Más amigable al inicio; el usuario no pone tarjeta hasta decidir pagar. |
| Al vencer sin pago | **Paywall duro** (bloqueo total) | Lo más simple y directo; requiere cuenta demo para la review. |
| Granularidad del entitlement | **Por familia/hogar** | El cobro es por hogar (caps 2/4); evita el enredo de ventanas por-usuario. |
| Empaquetado | Features core en TODOS los planes; diferenciar por cap + perks | En finanzas, fragmentar valor genera fricción. |

## Glosario rápido (Apple)

- **StoreKit 2**: el framework de Apple para compras in-app. Produce, por
  cada transacción, un **JWS** (un JWT firmado por Apple, alg ES256) llamado
  *signed transaction* — la prueba criptográfica de que la compra ocurrió.
- **App Store Server API**: API REST de Apple para consultar el estado
  autoritativo de una suscripción (`getAllSubscriptionStatuses`). Auth con
  una **In-App Purchase key** (archivo `.p8` + Key ID + Issuer ID).
- **App Store Server Notifications v2 (ASSN v2)**: webhook server-to-server.
  Apple le pega a una URL nuestra en cada evento (renovó, falló, venció,
  reembolso, gracia) con un `signedPayload` (JWS). Es lo que mantiene el
  entitlement fresco aunque el usuario esté offline.
- **`appAccountToken`**: un UUID que el cliente adjunta a la compra y que
  Apple devuelve en cada transacción/notificación. Lo usamos = `family_id`
  para saber a qué hogar pertenece cada evento (el webhook no tiene sesión).
- **Sandbox**: el entorno de pruebas de Apple. Compras gratis, sin dinero
  real, con cuentas Apple falsas. Ver la sección "Cómo se prueba".

---

## 1. Modelo de datos (Supabase)

### Tabla nueva `family_entitlements`

| Columna | Tipo | Notas |
|---|---|---|
| `family_id` | uuid PK FK | `families(id) on delete cascade` |
| `free_access_until` | timestamptz | `families.created_at + interval '30 days'`. Calculado server-side (nunca el reloj del device). |
| `plan` | text | `'free' \| 'monthly' \| 'yearly' \| 'expired'` — el "valor en la cuenta" que el owner pidió. Derivado del estado real. |
| `subscription_status` | text | `'none' \| 'active' \| 'grace' \| 'expired'` |
| `original_transaction_id` | text null | Ancla estable de la suscripción en Apple (sobrevive renovaciones). |
| `product_id` | text null | `com.manifiesto.app.subscription.monthly` / `.yearly` |
| `expires_at` | timestamptz null | Vencimiento de la suscripción pagada. |
| `auto_renew` | boolean | Default true; puede pausarse desde Ajustes de iOS. |
| `environment` | text | `'Sandbox' \| 'Production'` — viene firmado en cada payload. |
| `last_notification_uuid` | text null | Dedup de ASSN v2 (Apple reintenta). |
| `comped` | boolean | Default false. True = acceso otorgado manualmente (cuenta demo de review, soporte). Saltea el gate. |
| `updated_at` | timestamptz | |

### Función de acceso efectivo

```
acceso_efectivo(family) =
  comped
  OR now() < free_access_until
  OR subscription_status IN ('active', 'grace')
```

Si es false → **bloqueado** (paywall duro). Esta función vive en SQL
(`public.family_has_access(family_id) returns boolean`) y la consume tanto
el snapshot del cliente como las RLS si hiciera falta.

### RLS

- `SELECT`: miembros activos de la familia leen su propio entitlement.
- `INSERT`/`UPDATE`: **bloqueado a nivel policy** (`with check (false)`).
  Toda escritura pasa por las edge functions (security definer) — el cliente
  nunca puede declarar su propio plan.

### Seed

Un trigger en `families` (o backfill) crea la fila de entitlement con
`free_access_until = created_at + 30 días`, `plan = 'free'`. Las familias
existentes se backfillan: `free_access_until = greatest(created_at + 30d, now() + 30d)`
para no bloquear retroactivamente a nadie que ya usa la app (decisión:
todos arrancan con 30 días desde el deploy como piso).

---

## 2. Backend — 2 edge functions (Deno) + secrets

### `validate-purchase` (cliente → servidor, tras comprar)

1. Autentica al usuario de Supabase (JWT del cliente).
2. Recibe el `jwsRepresentation` (signed transaction de StoreKit 2).
3. **Verifica offline**: parsea el header JWS, lee el `x5c` (cadena de
   certs), valida leaf → intermedio Apple → **Apple Root CA-G3** (pineado,
   bundleado como constante), y verifica la firma ES256 con la pública del
   leaf. Recién entonces confía en el payload.
4. Extrae `original_transaction_id`, `product_id`, `expires_date`,
   `appAccountToken` (= family_id), `environment`.
5. (Opcional, robustez) Llama al **App Store Server API**
   `getAllSubscriptionStatuses` por `original_transaction_id` para el estado
   autoritativo.
6. **Upsert** del entitlement de la familia. Devuelve el entitlement nuevo.

Verificación de seguridad: el `family_id` del `appAccountToken` debe
coincidir con una familia donde el usuario autenticado es miembro — sino,
rechaza (un usuario no puede acreditar una compra a otra familia).

### `appstore-notifications` (Apple → servidor, ciclo de vida)

1. Recibe `{ signedPayload }` (JWS). Verifica firma + cadena igual que arriba.
2. Dedup: si `notification_uuid` ya está aplicado, responde 200 y corta.
3. Resuelve la familia por `appAccountToken` / `original_transaction_id`.
4. Actualiza el entitlement según `notificationType`:

| notificationType | Efecto en el entitlement |
|---|---|
| `SUBSCRIBED` (INITIAL_BUY / RESUBSCRIBE) | `active`, set product/expires |
| `DID_RENEW` | `active`, bump `expires_at` |
| `DID_FAIL_TO_RENEW` + GRACE_PERIOD | `grace` (mantener acceso hasta `gracePeriodExpiresDate`) |
| `DID_FAIL_TO_RENEW` (retry) | mantener hasta `expires_at`; decisión de producto si seguir sirviendo |
| `EXPIRED` / `GRACE_PERIOD_EXPIRED` | `expired` → bloqueo |
| `DID_CHANGE_RENEWAL_STATUS` (AUTO_RENEW_*) | set `auto_renew`; sigue activo hasta `expires_at` |
| `DID_CHANGE_RENEWAL_PREF` (UPGRADE) | cambiar `product_id` ya (nueva transacción) |
| `DID_CHANGE_RENEWAL_PREF` (DOWNGRADE) | registrar pendiente; cambia al próximo ciclo |
| `REFUND` | revocar (`expired`) |
| `REFUND_REVERSED` | re-otorgar |
| `REVOKE` (Family Sharing) | revocar para ese miembro |
| `TEST` | log + 200 (validación del endpoint) |

5. Responde 200 (Apple reintenta hasta ~5 veces si no).

**Regla de oro**: las notificaciones pueden llegar fuera de orden o
perderse. Ante ambigüedad (y periódicamente), llamar al Server API y dejar
que el estado autoritativo gane sobre el local.

### Config en App Store Connect

- URL de notificaciones **Producción** y **Sandbox** separadas → apuntan a
  `…/functions/v1/appstore-notifications`. Versión **2**. Botón "Request a
  Test Notification" para validar el endpoint.
- Secrets de Supabase (nunca en el cliente): `APPLE_IAP_KEY_P8`,
  `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_BUNDLE_ID`
  (`com.manifiesto.mobile.ZKYQF7UNYA`), `APPLE_ROOT_CA_G3` (cert pineado).

Fuentes: [App Store Server API](https://developer.apple.com/documentation/appstoreserverapi) · [ASSN v2](https://developer.apple.com/documentation/AppStoreServerNotifications/App-Store-Server-Notifications-V2)

---

## 3. Cliente — reemplazar el mock por IAP real

### Dependencia nativa

`expo-iap` (~4.3.1, StoreKit 2, config plugin con auto-entitlement en EAS).
Es **módulo nativo** → requiere build (como `expo-share-intent` / ML Kit),
NO corre en Expo Go ni viaja por OTA. Guard de entorno como los otros.

### `use-billing.ts` (reemplaza el mock con setTimeout)

- `getProducts()`: trae los productos de StoreKit por sus IDs.
- `purchase(plan)`: setea `appAccountToken = family_id`, dispara la compra
  (hoja nativa de Apple), obtiene el `jwsRepresentation`, lo manda a
  `validate-purchase`, y recién con el OK del server hace `finishTransaction`.
- `restore()`: StoreKit restore → re-valida contra el server. **Obligatorio**
  por Apple (3.1.1).
- El estado del plan se lee del **servidor** (snapshot del entitlement), no
  del StoreKit local — el server es la fuente de verdad.

### Snapshot del entitlement

Un query/RPC `family_entitlement_snapshot(family_id)` que devuelve
`{ plan, acceso_efectivo, free_access_until, expires_at, subscription_status }`.
Se cachea con React Query e invalida tras compra/restore. El gate lo consume.

Fuentes: [expo-iap](https://github.com/hyochan/expo-iap) (ahora OpenIAP)

---

## 4. Enforcement — el paywall duro

Patrón espejo del overlay de auth-flow que ya existe (`auth-flow-machine` +
`TransitionOverlay`). Un `SubscriptionGate` montado alto en el árbol:

- Al entrar (y al volver de background), lee `acceso_efectivo` del snapshot.
- Si **bloqueado**: monta el paywall como overlay **no descartable** sobre
  la app. La única salida es suscribirse (o restaurar una compra previa).
- Si **en ventana libre**: acceso normal + un recordatorio sutil de cuántos
  días quedan (no intrusivo).
- Si **pago activo**: acceso normal, sin overlay.

Interacción con el auth-flow: el gate de suscripción corre **después** del
unlock (igual que el share-import gate) — primero autenticás, después se
evalúa el acceso. Nunca se procesa el paywall antes de tener sesión.

---

## 5. Empaquetado de planes

| | Libre (30 días) | Mensual (USD 4.99) | Anual (USD 39.99) |
|---|---|---|---|
| Todas las features core | ✅ | ✅ | ✅ |
| Cap de miembros | 2 | 2 | **4** |
| Soporte prioritario / features anticipadas | — | — | ✅ |

El gate principal es binario (pagás → acceso; vencido → bloqueo). La
diferenciación mensual/anual es el cap de miembros (ya implementado en
`billing-plans.ts`) + los perks que ya están en el copy. **No** se traban
features core detrás del anual. Si el owner quiere trabar algo específico
(OCR de capturas, multi-moneda) se decide aparte — fuera del scope de v1.

---

## 6. UI — dirección de diseño

Toda UI nueva o mejorada sigue los principios de las skills de diseño del
proyecto (`ui-ux-pro-max`, `impeccable`, `emil-design-eng`, `gpt-taste`) y
**el sistema visual que ya existe** (cards de Control, `billing-screen`,
state-tokens, RiseView, BreatheDot, MaterialIcons — sin emojis).

Superficies:

1. **Paywall (`billing-screen` mejorado)** — debe cumplir el checklist de
   Apple (sección 7). Mejoras sobre lo actual: aviso de auto-renovación,
   links a Términos/Privacidad in-app, botón Restaurar, "qué incluye"
   explícito. Motion con las curvas del sistema (ease-out exponencial, sin
   bounce). **Nunca la palabra "trial"** (período app-gestionado).
2. **Overlay de bloqueo** — el paywall montado como gate no-descartable.
   Entrada con el feel de auth (reveal suave), copy cálido y honesto
   ("Tu mes gratis terminó. Elegí tu plan para seguir.").
3. **Recordatorio de días restantes** — chip sutil en Home/Settings durante
   la ventana libre ("Acceso completo hasta el DD/MM"). Sin presión.
4. **Estado del plan en Settings** — la `billing-screen` muestra el plan
   activo, vencimiento, y "Administrar en Ajustes de iOS" (cancelar es
   responsabilidad de Apple, no nuestra).

Las mejoras concretas de cada pantalla se diseñan en la fase de
implementación con las skills, partiendo de lo que ya hay (no rehacer).

---

## 7. Compliance de App Store Review (checklist)

El paywall DEBE tener (cada faltante es causa documentada de rechazo, 3.1.2):

- [ ] Título/nombre del plan
- [ ] Precio + período ("USD 4.99 / mes"), prominente y legible
- [ ] Qué incluye (el valor)
- [ ] Aviso de auto-renovación ("se renueva solo; cancelás cuando quieras en Ajustes")
- [ ] Link a **Términos de uso (EULA)** dentro del paywall
- [ ] Link a **Política de privacidad** dentro del paywall
- [ ] Botón **Restaurar compras**
- [ ] **Sin** toggle de "free trial" (Apple los rechaza desde ene-2026) ni la palabra "trial"

Además:
- **Cuenta demo** en las notas de review (`apple.review@manifiestoapp.com`)
  con entitlement `comped = true` server-side, para que el revisor pase el
  login Y el paywall y vea la app completa.
- **IAP visible y funcional** para el revisor (testea en sandbox).
- **Account deletion in-app** (5.1.1) — confirmar que el path existe.
- Login obligatorio justificado (5.1.1) — la app tiene features de cuenta
  significativas (hogar multi-miembro, sync). Anotarlo en review notes.
- **Family Sharing** (opcional, on-brand): se puede activar por suscripción
  en ASC (irreversible). Decisión del owner; v1 puede salir sin esto y
  agregarlo después.

Fuentes: [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) · [RIP toggle paywall (RevenueCat)](https://www.revenuecat.com/blog/growth/rip-toggle-paywall/)

---

## 8. Cómo se prueba — cuentas y "tarjetas" demo (primera vez)

> **El punto que más confunde**: en pruebas de Apple **NO se usan tarjetas
> reales y no se mueve plata.** No existe una "tarjeta demo" que cargás —
> el entorno *sandbox* simula la compra sin cobrar nada. Hay tres niveles:

### Nivel 1 — Xcode StoreKit Configuration file (`.storekit`)

Un archivo de config local que define los productos y precios **sin pegarle
a Apple**. Permite probar el flujo de compra (UI, loading, confirmación)
100% local, sin cuenta ni red. Ideal para iterar el paywall. **Limitación**:
no ejercita el server (no dispara `validate-purchase` ni notificaciones).
La velocidad de renovación se configura en *Editor → Subscription Renewal Rate*.

### Nivel 2 — Sandbox (cuentas Apple de prueba)

1. En App Store Connect → **Users and Access → Sandbox → Testers** creás
   **Sandbox Apple IDs** (cuentas Apple falsas; usás un email que controlás,
   p. ej. un alias `+sandbox`). **No piden tarjeta real.**
2. En el iPhone, *Ajustes → Developer → Sandbox Apple Account* (o te lo
   pide al comprar), iniciás sesión con ese sandbox ID.
3. Comprás en la app → la hoja de Apple aparece, confirmás → **compra gratis,
   sin cobro**. Esto SÍ ejercita todo: `validate-purchase`, el entitlement,
   y dispara notificaciones reales a la **URL de Sandbox**.
4. **Renovación acelerada**: una suscripción mensual renueva cada ~5 min en
   sandbox (configurable). Así probás renovación, vencimiento, gracia y
   reembolso en minutos en vez de meses.

### Nivel 3 — TestFlight

Usa billing tipo-sandbox pero las suscripciones **renuevan cada 24 h**
(desde dic-2024). Es el end-to-end más cercano a producción. Tu build de
TestFlight ya existe (build 4); cuando integremos IAP, una build nueva con
`expo-iap` lo habilita.

### La cuenta demo de la REVIEW (cosa distinta)

Es una cuenta **real** de Manifiesto (`apple.review@manifiestoapp.com`) que
ponés en las notas de review para que el revisor entre. Como el paywall es
duro, le damos a esa cuenta `comped = true` server-side para que vea la app
completa sin tener que comprar. (El revisor igual puede testear el IAP en
sandbox si quiere.)

Fuentes: [Testing subscriptions (sandbox/StoreKit config)](https://developer.apple.com/documentation/storekit/testing-an-auto-renewable-subscription) · [TestFlight subscription testing](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testing-subscriptions-and-in-app-purchases-in-testflight/)

---

## 9. Fases de implementación

1. **Modelo + free-window + enforcement**: tabla `family_entitlements`,
   trigger/backfill, `family_has_access`, snapshot RPC, `SubscriptionGate` +
   overlay. Testeable con un unlock mock (sin IAP real todavía).
2. **expo-iap + `validate-purchase`**: dependencia nativa, `use-billing`
   real, edge function de validación con verificación JWS. Compra
   end-to-end en sandbox.
3. **Webhook ASSN v2 + reconciliación**: edge function de notificaciones,
   manejo del ciclo de vida completo, Server API para reconciliar.
4. **App Store Connect + compliance**: crear productos + grupo de
   suscripción, completar elementos del paywall, cuenta demo comped, build
   nueva de TestFlight, submit.

Cada fase deja software funcionando y testeable. El plan de implementación
(writing-plans) detalla las tasks bite-sized.

---

## 10. Acciones del owner (fuera del código)

- Crear la **In-App Purchase key** en App Store Connect (`.p8` + Key ID +
  Issuer ID) y pasármela para cargarla como secrets de Supabase.
- Crear el **grupo de suscripción** + los 2 productos (mensual/anual) con
  sus precios por región.
- Configurar las **URLs de ASSN v2** (prod + sandbox) en ASC.
- Crear **Sandbox testers** para las pruebas.
- Decidir si activar **Family Sharing** (irreversible) — puede ir en v2.

## 11. Fuera de scope (v1)

- Family Sharing de la suscripción (se puede sumar después).
- Ofertas promocionales / códigos de oferta.
- Trial nativo de Apple (elegimos período app-gestionado).
- Planes adicionales más allá de mensual/anual.
- Trabar features core específicas detrás del anual (binario por ahora).
- Android / Play Billing (cuando haya launch de Play Store).
