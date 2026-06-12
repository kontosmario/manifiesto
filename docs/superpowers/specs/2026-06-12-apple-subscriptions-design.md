# Suscripciones de Apple (StoreKit / IAP nativo) — Diseño

> **Fecha**: 2026-06-12 (rev. 3) · **Branch**: `feature/subscriptions` · **Estado**: aprobado por owner (brainstorm 2026-06-12) + revisión técnica incorporada (2026-06-12)
>
> **Objetivo**: monetizar Manifiesto con suscripciones auto-renovables de
> Apple, 100% nativas (la compra usa la hoja de StoreKit; el usuario nunca
> ve un proveedor externo). Período libre de 30 días por usuario; al vencer
> sin pago, paywall duro que bloquea la app hasta suscribirse. Sin terceros
> en la validación (expo-iap + edge functions propias de Supabase).
>
> **Investigación de base**: 3 reportes (2026-06-12) sobre librerías IAP,
> validación server-side de Apple, y compliance de App Store Review. Las
> fuentes están citadas inline en las secciones que aplican.
>
> **Cambios de la rev. 2** (revisión técnica del owner): dedup por tabla de
> eventos con ordering por `signedDate` (reemplaza `last_notification_uuid`);
> routing de notificaciones por `original_transaction_id` (el `appAccountToken`
> deja de ser autoritativo post-compra); política de downgrade con conflicto
> de cap (grandfathering); UX del período de gracia; error distinguible en
> `restore()` cross-familia; guard de environment Sandbox/Production.
>
> **Cambios de la rev. 3** (review de implementación): (a) el webhook
> **bootstrapea el mapping** desde el `appAccountToken` de la transacción
> original cuando no existe (robustez si el cliente crashea antes de
> `validate-purchase`) — `appAccountToken` es autoritativo SOLO ahí, nunca en
> renovaciones; (b) `validate-purchase` y el webhook comparten **una única
> función idempotente de aplicación** con ordering por `signed_date` para no
> clobberearse; (c) copy del trial neutro ("Acceso completo", no "Prueba" —
> coherente con la regla de no usar "trial").

## Decisiones (Q&A con owner)

| Decisión | Elección | Por qué |
|---|---|---|
| Librería / validación | **expo-iap** (StoreKit 2), validación propia en Supabase | Sin terceros en la ruta de datos. La compra es Apple-nativa igual. |
| Período de 30 días | **App-gestionado, sin tarjeta** (NO "trial" de Apple) | Más amigable al inicio; el usuario no pone tarjeta hasta decidir pagar. |
| Al vencer sin pago | **Paywall duro** (bloqueo total) | Lo más simple y directo; requiere cuenta demo para la review. |
| Granularidad del entitlement | **Trial por usuario + suscripción por familia** | El trial monotónico mata el exploit; el cobro es por hogar (caps 2/4). |
| Empaquetado | Features core en TODOS los planes; diferenciar por cap + perks | En finanzas, fragmentar valor genera fricción. |
| Downgrade con hogar > cap | **Grandfather miembros, bloquear nuevas invitaciones** | Expulsar miembros por un evento de billing es hostil; bloquear invites es suficiente. |

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
  Apple devuelve en cada transacción/notificación. Lo usamos = `family_id`.
  ⚠️ Apple lo **persiste desde la transacción original** en todas las
  renovaciones futuras — si el purchaser cambia de familia, las
  notificaciones siguen trayendo el `family_id` viejo. Por eso es
  autoritativo **solo para bootstrapear el mapping en la transacción
  original** (ver §2); el routing posterior es por `original_transaction_id`.
- **`original_transaction_id`**: identificador estable de la suscripción en
  Apple; sobrevive renovaciones, upgrades y restores. Es **la** clave de
  routing de todo el ciclo de vida post-compra.
- **Sandbox**: el entorno de pruebas de Apple. Compras gratis, sin dinero
  real, con cuentas Apple falsas. Ver la sección "Cómo se prueba".

---

## 1. Modelo de datos y resolución de entitlement (Supabase)

> **Principio rector (refinamiento del owner 2026-06-12):** la suscripción
> **nunca se transfiere**; el acceso se **resuelve en runtime** desde varias
> fuentes con prioridad. Y el trial es un **reloj de calendario monotónico**
> que nunca se pausa ni se reinicia. Esto elimina por diseño el exploit de
> "entro a una familia paga, salgo, y reinicio mi prueba".

### Modelo híbrido: trial per-usuario, suscripción per-familia

- **Trial: per-usuario, derivado** de `profiles.created_at` (ya existe).
  No se guarda un contador de "días restantes" — se calcula
  `now() − profiles.created_at`. Sin estado que resetear → sin exploit.
  Una columna opcional `profiles.trial_days int default 30` permite variar
  la duración por cohorte sin tocar la lógica.
- **Suscripción: per-familia**, almacenada en `family_entitlements`. El owner
  compra *para el hogar* (`appAccountToken = family_id` en la compra
  inicial), que es como factura un plan de hogar. Todos los miembros activos
  heredan la cobertura.

### Tabla `family_entitlements` (estado actual de la suscripción)

| Columna | Tipo | Notas |
|---|---|---|
| `family_id` | uuid PK FK | `families(id) on delete cascade` |
| `subscription_status` | text | `'none' \| 'active' \| 'grace' \| 'expired'` |
| `original_transaction_id` | text null unique | Ancla estable de la suscripción en Apple (sobrevive renovaciones). **Clave de routing** de notificaciones y restores. |
| `product_id` | text null | `com.manifiesto.app.subscription.monthly` / `.yearly` |
| `pending_product_id` | text null | Downgrade registrado vía `DID_CHANGE_RENEWAL_PREF`; se aplica al próximo ciclo. |
| `purchaser_user_id` | uuid null | Quién disparó la compra (para soporte/auditoría; la cobertura es de la familia, no de este user). |
| `expires_at` | timestamptz null | Vencimiento de la suscripción pagada. |
| `grace_expires_at` | timestamptz null | `gracePeriodExpiresDate` cuando `status='grace'`. |
| `last_applied_signed_date` | timestamptz null | El `signed_date` de la última transacción aplicada — ordering del path unificado (§2). |
| `auto_renew` | boolean | Default true; puede pausarse desde Ajustes de iOS. |
| `environment` | text | `'Sandbox' \| 'Production'` — viene firmado en cada payload. |
| `comped` | boolean | Default false. True = acceso manual (cuenta demo de review, soporte). |
| `updated_at` | timestamptz | |

> Cambios rev. 2/3: se **elimina** `last_notification_uuid` (el dedup vive en
> `subscription_events`); se agregan `pending_product_id`, `grace_expires_at`
> y `last_applied_signed_date` (ordering del path unificado). El
> `family_entitlements` no guarda `free_access_until` ni un `plan`
> per-familia — el trial se deriva del usuario y el "plan" se computa en la
> resolución.

### Tabla nueva `subscription_events` (dedup + ordering + audit)

Guardar solo *el último* UUID de notificación rompe en dos casos: (a) Apple
reintenta una notificación **vieja** después de que llegó una nueva → el UUID
viejo ≠ último → pasa el dedup y pisa estado fresco con estado stale;
(b) llegada fuera de orden. El dedup correcto es por **tabla de eventos**:

```sql
create table subscription_events (
  notification_uuid text primary key,   -- dedup real: TODOS los UUIDs vistos
  original_transaction_id text not null,
  notification_type text not null,      -- + subtype si aplica
  signed_date timestamptz not null,     -- signedDate del payload firmado
  environment text not null,            -- 'Sandbox' | 'Production'
  raw_payload jsonb not null,           -- audit / replay / debug
  processed_at timestamptz not null default now()
);
create index on subscription_events (original_transaction_id, signed_date desc);
```

El `raw_payload` es el audit trail para soporte ("me cobró pero estoy
bloqueado") y permite replay si un bug procesó mal un evento.

### Path unificado de aplicación (rev. 3)

`validate-purchase` (cliente) y `appstore-notifications` (Apple) escriben los
mismos `family_entitlements`. Para que no se clobbereen, ambos pasan por
**una sola función SQL idempotente** `apply_subscription_transaction(...)`:

1. Recibe `{ original_transaction_id, family_id?, product_id, expires_at,
   status, signed_date, environment, ... }`.
2. **Ordering**: si `signed_date <= family_entitlements.last_applied_signed_date`
   de esa suscripción → **no muta** (es estado igual o más viejo). Idempotente.
3. Aplica el efecto y setea `last_applied_signed_date = signed_date`.

Así el orden de llegada (cliente primero o webhook primero, retry, fuera de
orden) no importa: gana el `signed_date` más nuevo, siempre.

### Resolución de acceso (cascada, server-side, solo DB)

La resolución es un **cálculo puro de DB** — NO consulta StoreKit (el recibo
de Apple se valida una sola vez al comprar; ver §2). Función SQL
`public.resolve_entitlement(user_id) returns table(source text, plan text, days_left int, has_access boolean)`:

```
resolve_entitlement(user) =
  1. comped                         → { source:'comped',  has_access:true }
  2. familia tiene sub activa/gracia → { source:'family',  plan, has_access:true }
        familia = family_members activo del user; sub = family_entitlements
        de esa familia con subscription_status IN ('active','grace')
  3. dentro del trial monotónico    → { source:'trial', days_left, has_access:true }
        days_left = greatest(0, trial_days − (now()::date − profiles.created_at::date))
  4. else                           → { source:'free',   has_access:false }  ← bloqueado
```

La cascada `own_subscription > family_membership` del modelo conceptual
**colapsa en el nivel 2** porque en billing de hogar la sub del owner ES la
de la familia (el purchaser compra para su familia actual). El "plan" que el
owner pidió como valor de cuenta = el `source` + `product_id` de esta
resolución (`free` / `monthly` / `yearly`, o `family`/`comped`/`trial`).

### Snapshot del cliente

`family_entitlement_snapshot(user_id)` envuelve `resolve_entitlement` y
devuelve lo que la UI necesita: `{ source, plan, has_access, days_left,
expires_at, subscription_status, member_cap, member_count, pending_product_id }`.
Se cachea con React Query; el gate y los nudges lo consumen. **El cliente
nunca decide su propio acceso** — solo refleja lo que la función server-side
resolvió.

> **Propagación post-compra (recomendado, barato)**: suscribirse con
> **Supabase Realtime** a `family_entitlements` de la propia familia, e
> invalidar el snapshot al recibir cambios. Así el desbloqueo tras la compra
> del owner llega a los miembros al instante, sin esperar refetch/foreground.

### RLS

- `SELECT`: miembros activos de la familia leen el entitlement de su familia.
  `subscription_events` **no** es legible por clientes (solo service role).
- `INSERT`/`UPDATE`: **bloqueado a nivel policy** (`with check (false)`).
  Toda escritura pasa por las edge functions (security definer) — el cliente
  nunca puede declarar su propio plan.

### Seed / backfill

- Trial: no necesita seed — se deriva de `profiles.created_at` que ya existe.
  Para no bloquear retroactivamente a usuarios actuales cuyo `created_at` ya
  pasó los 30 días, el deploy aplica un **piso**: `profiles.trial_days`
  backfilleado a `greatest(30, (now()::date − created_at::date) + 30)` para
  las cuentas existentes (todos arrancan con ≥30 días desde el deploy). Las
  cuentas nuevas usan el default 30.
- `family_entitlements`: trigger en `families` crea la fila con
  `subscription_status='none'`. Familias existentes se backfillan a `'none'`.

### El sistema de familias/invitaciones YA EXISTE

No hay que construir invitaciones ni el RLS de owner — está implementado y
RPC-gated: `bootstrap_family`, `create_family_invite`, `consume_family_invite`,
`peek_family_invite`, `generate_invite_code`, `family_remove_member`,
`family_transfer_ownership`, `leave_current_family`, `convert_family_to_solo`,
`is_family_owner`, `is_family_member_active`, `family_block_member`. Esta
feature solo **conecta** la resolución de entitlement a esa membresía
existente, y agrega **un check de cap** en `create_family_invite` (ver §5).
(Verificar en implementación que el RLS de `family_members` es owner-gated —
el patrón RPC sugiere que sí.)

### Edge cases conocidos

- **Purchaser que cambia de hogar (limitación v1, acotada)**: la sub está
  anclada a `family_id` vía el mapping `original_transaction_id → family_id`
  que vive en **nuestra DB** (no en Apple). Si el purchaser transfiere
  ownership o se va del hogar con la sub activa, la sub sigue cubriendo a esa
  familia (Apple factura al Apple ID del comprador sin importar nuestros
  roles), y el comprador cae a trial/free en su nuevo hogar aunque siga
  pagando. Es rarísimo pre-lanzamiento. Como el mapping es nuestro, la
  migración en v2 es un `UPDATE` de una fila (re-anclar la sub), no un cambio
  de protocolo con Apple. Para v1, `restore()` detecta el caso y muestra un
  mensaje accionable (ver §3).
- **Exploit residual del trial**: borrar la cuenta y re-registrarse reinicia
  el reloj (nuevo `created_at`). Mitigable con DeviceCheck/App Attest, pero
  es overkill pre-launch — el costo del exploit (rehacer onboarding y perder
  todos los datos) ya es disuasivo. Documentado; revisar post-launch si
  aparece en métricas.

---

## 2. Backend — 2 edge functions (Deno) + secrets

### `validate-purchase` (cliente → servidor, tras comprar/restaurar)

1. Autentica al usuario de Supabase (JWT del cliente).
2. Recibe el `jwsRepresentation` (signed transaction de StoreKit 2).
3. **Verifica offline**: parsea el header JWS, lee el `x5c` (cadena de
   certs), valida leaf → intermedio Apple → **Apple Root CA-G3** (pineado,
   bundleado como constante), y verifica la firma ES256 con la pública del
   leaf. Recién entonces confía en el payload.
4. Extrae `original_transaction_id`, `product_id`, `expires_date`,
   `appAccountToken`, `signed_date`, `environment`.
5. (Opcional, robustez) Llama al **App Store Server API**
   `getAllSubscriptionStatuses` por `original_transaction_id` para el estado
   autoritativo.
6. **Compra nueva** (no existe mapping para ese `original_transaction_id`):
   verifica que el `family_id` del `appAccountToken` coincida con una familia
   donde el usuario autenticado es **miembro activo** — sino, rechaza (un
   usuario no puede acreditar una compra a otra familia). Con el OK, persiste
   el mapping `original_transaction_id → family_id` y llama a
   `apply_subscription_transaction` (§1).
7. **Restore** (ya existe mapping): el routing es por `original_transaction_id`
   contra el mapping existente (NO por el `appAccountToken`, que puede estar
   stale).
   - Si el mapping apunta a la familia actual del usuario → re-sincroniza vía
     `apply_subscription_transaction` y devuelve el entitlement. Caso feliz.
   - Si apunta a **otra** familia (purchaser que se mudó de hogar) →
     devolver un **código de error distinguible**
     (`SUBSCRIPTION_BOUND_TO_OTHER_FAMILY`), no un fallo genérico. El
     cliente muestra: *"Tu suscripción está asociada a otro hogar.
     Contactanos."* Nunca un error opaco a alguien que **está pagando**.

El estado del plan se lee del **servidor** (snapshot), no del StoreKit local.

### `appstore-notifications` (Apple → servidor, ciclo de vida)

1. Recibe `{ signedPayload }` (JWS). Verifica firma + cadena igual que arriba.
2. **Guard de environment**: si `payload.environment === 'Sandbox'` y el
   proyecto corre como producción (`ENV === 'production'`) → insertar en
   `subscription_events` (audit) + 200 + **skip de toda mutación**. Evita
   que un evento de sandbox pise el entitlement de una familia real si los
   `family_id` colisionan post-seed. (Si dev y prod son proyectos Supabase
   separados, el guard igual queda como cinturón de seguridad.)
3. **Dedup por tabla**: insert en `subscription_events`; si el
   `notification_uuid` ya existe → 200 y corta.
4. **Routing por `original_transaction_id`** contra el mapping en
   `family_entitlements`:
   - **Mapping existe** → usarlo. El `appAccountToken` del payload es
     informativo (logging), **nunca autoritativo** — Apple lo persiste de la
     transacción original y queda stale si el purchaser cambió de familia.
   - **Mapping NO existe Y es `SUBSCRIBED/INITIAL_BUY`** → **bootstrap**: usar
     el `appAccountToken` de ESTA transacción (= la familia compradora, aún
     no migró) para crear el mapping. Robustez clave: si el cliente compró
     pero crasheó/perdió red antes de `validate-purchase`, el webhook es el
     único que crea el entitlement. El JWS está verificado, así que el
     `appAccountToken` es auténtico; el check de membresía vive en
     `validate-purchase` (el bootstrap confía en el token firmado — peor caso,
     un pagante acredita otra familia, que es su propia pérdida).
   - **Mapping NO existe y NO es initial buy** (renovación/expiración de una
     sub que nunca vimos) → audit en `subscription_events` + 200, sin mutar
     (no hay a quién acreditar; el `validate-purchase`/restore lo resolverá).
5. Llama a `apply_subscription_transaction` (§1) con el efecto del
   `notificationType` — el ordering por `signed_date` está adentro:

| notificationType | Efecto en el entitlement |
|---|---|
| `SUBSCRIBED` (INITIAL_BUY / RESUBSCRIBE) | `active`, set product/expires |
| `DID_RENEW` | `active`, bump `expires_at`, limpiar `grace_expires_at`; si había `pending_product_id`, aplicarlo y limpiarlo |
| `DID_FAIL_TO_RENEW` + GRACE_PERIOD | `grace`, set `grace_expires_at = gracePeriodExpiresDate` (acceso continúa; UX en §6.5) |
| `DID_FAIL_TO_RENEW` (retry) | mantener hasta `expires_at`; decisión de producto si seguir sirviendo |
| `EXPIRED` / `GRACE_PERIOD_EXPIRED` | `expired` → bloqueo |
| `DID_CHANGE_RENEWAL_STATUS` (AUTO_RENEW_*) | set `auto_renew`; sigue activo hasta `expires_at` |
| `DID_CHANGE_RENEWAL_PREF` (UPGRADE) | cambiar `product_id` ya (nueva transacción) |
| `DID_CHANGE_RENEWAL_PREF` (DOWNGRADE) | set `pending_product_id`; **si `member_count > cap` del plan destino, notificar al owner** (política §5) |
| `REFUND` | revocar (`expired`) |
| `REFUND_REVERSED` | re-otorgar |
| `REVOKE` (Family Sharing) | revocar para ese miembro |
| `TEST` | log + 200 (validación del endpoint) |

6. Responde 200 (Apple reintenta hasta ~5 veces si no).

**Regla de oro**: las notificaciones pueden llegar fuera de orden o
perderse. El path unificado + ordering por `signed_date` maneja lo primero;
para lo segundo, ante ambigüedad (y periódicamente), llamar al Server API y
dejar que el estado autoritativo gane sobre el local.

### Config en App Store Connect

- URL de notificaciones **Producción** y **Sandbox** separadas → apuntan a
  `…/functions/v1/appstore-notifications`. Versión **2**. Botón "Request a
  Test Notification" para validar el endpoint.
- Secrets de Supabase (nunca en el cliente): `APPLE_IAP_KEY_P8`,
  `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_BUNDLE_ID`
  (`com.manifiesto.mobile.ZKYQF7UNYA`), `APPLE_ROOT_CA_G3` (cert pineado),
  `ENV` (`'production' | 'development'`, para el guard de environment).

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
  por Apple (3.1.1). Maneja el código
  `SUBSCRIPTION_BOUND_TO_OTHER_FAMILY` con el mensaje accionable de §2
  (nunca un error genérico a un usuario pagante).
- El estado del plan se lee del **servidor** (snapshot del entitlement), no
  del StoreKit local — el server es la fuente de verdad.

### Snapshot del entitlement

Un RPC `family_entitlement_snapshot(user_id)` que envuelve
`resolve_entitlement` (§1) y devuelve
`{ source, plan, has_access, days_left, expires_at, subscription_status,
member_cap, member_count, pending_product_id }`.
Se cachea con React Query e invalida tras compra/restore/cambio de familia,
y opcionalmente vía Realtime sobre `family_entitlements` (§1).
`appAccountToken = family_id` en la compra.

Fuentes: [expo-iap](https://github.com/hyochan/expo-iap) (ahora OpenIAP)

---

## 4. Enforcement — el paywall duro

Patrón espejo del overlay de auth-flow que ya existe (`auth-flow-machine` +
`TransitionOverlay`). Un `SubscriptionGate` montado alto en el árbol:

- Al entrar (y al volver de background), lee `has_access` del snapshot.
- Si **bloqueado** (`source:'free'`): monta el paywall como overlay **no
  descartable** sobre la app. La única salida es suscribirse (o restaurar).
- Si **`source:'trial'`**: acceso normal + nudge por umbrales (§6.3).
- Si **`source:'family'` o `'comped'`**: acceso normal, **sin nudge ni
  contador** (su acceso no depende del trial — mostrarlo confundiría).
- Si **`source:'subscription'`** (pago activo propio): acceso normal.
  Si `subscription_status:'grace'`: acceso normal + banner de gracia para el
  owner (§6.5).

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

### Política de downgrade con conflicto de cap (anual→mensual, hogar de 3–4)

`DID_CHANGE_RENEWAL_PREF (DOWNGRADE)` aplica al próximo ciclo, y una familia
de 4 puede quedar sobre un plan con cap 2. Política (estándar de la
industria, cero fricción):

1. **Grandfather los miembros existentes** — nadie es expulsado
   automáticamente. Expulsar por un evento de billing es hostil y genera
   tickets de soporte.
2. **Bloquear nuevas invitaciones** mientras `member_count > cap` del plan
   vigente: un check en `create_family_invite` (ya es RPC — un check más,
   sobre miembros activos), con mensaje claro en la UI de invitar.
3. **Avisar al owner al detectar el downgrade pendiente** (la notificación
   llega *antes* del cambio): *"Tu plan baja a Mensual el {fecha}. Tu hogar
   tiene 4 miembros; podrán seguir, pero no podrás invitar nuevos hasta
   volver al Anual o reducir el hogar."*

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
3. **Comunicación del período libre — sin spam** — SOLO cuando
   `source === 'trial'`. Un miembro de familia o un pago activo NUNCA ve el
   contador (sería confuso — su acceso no depende del período libre). Reglas:
   - **Badge pasivo permanente** en Settings: "Acceso completo: N días
     restantes" (copy neutro — NO "Prueba"/"trial", coherente con §7).
   - **Banner dismissible** solo en los umbrales `[7, 3, 1]` días, una vez
     por umbral (se guarda el último umbral mostrado). Nada de recordatorio
     diario.
   - **Cero push** salvo el día 1 (el único con urgencia real).
   ```ts
   const TRIAL_NUDGE_THRESHOLDS = [7, 3, 1]
   function shouldShowFreeAccessBanner(snap, lastShownThreshold) {
     if (snap.source !== 'trial') return false
     const t = TRIAL_NUDGE_THRESHOLDS.find((x) => snap.days_left <= x)
     return t !== undefined && t !== lastShownThreshold
   }
   ```
4. **Estado del plan en Settings** — la `billing-screen` muestra el plan
   activo, vencimiento, y "Administrar en Ajustes de iOS" (cancelar es
   responsabilidad de Apple, no nuestra). Si `source:'family'`, muestra
   "Tu acceso viene de tu hogar" en vez de un plan propio. Si hay
   `pending_product_id` (downgrade), mostrar "Cambia a Mensual el {fecha}".
5. **Período de gracia (`status:'grace'`)** — el acceso continúa, pero si
   el owner no se entera de que su pago falló, la familia entera cae a
   paywall "de sorpresa". Reglas:
   - **Banner persistente (no dismissible) solo para el owner**: *"Hay un
     problema con tu pago. Actualizalo para no perder acceso."*
   - CTA con deep link al billing de Apple:
     `https://apps.apple.com/account/billing` — es el flujo oficial (el
     problema de pago se arregla en Apple, no en la app).
   - **Miembros no-owner: nada** hasta que expire (no pueden accionar el
     pago; alertarlos solo genera ansiedad sin salida).
6. **Edge al salir de la familia** — en el flujo `leave_current_family`, si
   el período libre del usuario ya venció, advertir ANTES de confirmar: *"Si
   salís de la familia pasás al plan gratuito (tu período de prueba ya
   finalizó)."* Evita la sorpresa y comunica implícitamente que re-entrar no
   reinicia nada.

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

> Con el **guard de environment** (§2), los eventos de sandbox quedan
> registrados en `subscription_events` pero nunca mutan entitlements de
> producción. Casos a probar explícitamente con renovación acelerada:
> reintento de notificación vieja (dedup), fuera de orden (ordering por
> `signed_date`), bootstrap del webhook sin `validate-purchase` previo,
> downgrade con hogar > cap, gracia → recuperación, y restore en un hogar
> distinto al de compra (error distinguible).

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

1. **Modelo + resolución + enforcement**: tablas `family_entitlements` y
   `subscription_events`, `apply_subscription_transaction` (path unificado),
   `profiles.trial_days` + backfill (piso de 30 días), `resolve_entitlement`
   + `family_entitlement_snapshot`, `SubscriptionGate` + overlay, nudge por
   umbrales, edge de leave-family, check de cap en `create_family_invite`.
   Testeable con un unlock/comped mock (sin IAP real todavía). **Conecta** a
   la membresía existente, no la reconstruye.
2. **expo-iap + `validate-purchase`**: dependencia nativa, `use-billing`
   real, edge function de validación con verificación JWS, mapping
   `original_transaction_id → family_id`, restore con error distinguible.
   Compra end-to-end en sandbox.
3. **Webhook ASSN v2 + reconciliación**: edge function de notificaciones con
   guard de environment, dedup por tabla, bootstrap del mapping en initial
   buy, routing por `original_transaction_id`, ciclo de vida completo (incl.
   gracia y downgrade pendiente), Server API para reconciliar. UX de gracia
   (§6.5) y aviso de downgrade (§5).
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
- Re-anclaje de la suscripción cuando el purchaser cambia de hogar
  (mitigado: mapping en nuestra DB + error distinguible en restore; v2 si
  aparece en soporte).
- `CONSUMPTION_REQUEST` (responderlo reduce reembolsos abusivos — candidato
  a v2 post-launch).
- Mitigación del exploit "delete account + re-registro" del trial
  (DeviceCheck/App Attest — overkill pre-launch; monitorear métricas).
