# Push Notifications iOS — setup, costos, decisiones de arquitectura

> Fecha: 2026-05-09 · Estado: pendiente — bloqueado en compra de cuenta Apple Developer

## Contexto

El IPA actual (`dist/ios/Manifiesto-unsigned.ipa`) es **unsigned**. Sideloadly lo re-firma con Apple ID gratis al instalar en el iPhone. Apple ID gratis **no permite** el entitlement `aps-environment`, por eso al activar push aparece:

> "No se encontró ninguna cadena de autorización 'APS-ENVIRONMENT' para la app"

Esto NO es bug del código de Manifiesto — es una restricción estructural del ecosistema Apple. La única forma de habilitar push en iOS es con cuenta Apple Developer paga ($99/año USD).

---

## ¿Hay forma sin pagar?

**Para push notifications reales (APNs)**: no.

Workarounds parciales sin pagar:

| Opción | Cubre | Limitación |
|--------|-------|-----------|
| **Local Notifications** (`expo-notifications` schedule) | Recordatorios diarios, vencimientos de fijos, alertas de cupo computables al abrir la app | No cubre acciones cross-device (ej: "Mario cargó un gasto compartido"); el server no puede triggerear |
| **In-app banners** | Mostrar avisos al abrir la app | Usuario tiene que abrir la app para verlos |
| **Suprimir el error rojo** | UX más prolija en builds sideloaded | No agrega push real, solo oculta el mensaje |

---

## Cuándo pagar los $99

Apple Developer Program ($99/año USD) desbloquea:

| Feature | Obligatorio? |
|---------|--------------|
| Publicar en App Store | ✅ |
| TestFlight (beta hasta 10k testers) | ✅ |
| Push notifications reales | ✅ |
| Sign in with Apple en producción | ✅ |
| In-App Purchase / suscripciones | ✅ |
| HealthKit / NFC / Apple Pay | ✅ |

**Recomendación**: pagarlo cuando estemos a 4-8 semanas de querer:
- Compartir la app con 5+ beta testers (sideload no escala — apps expiran cada 7 días)
- Validar push end-to-end (asistente, alertas de cupo, gastos compartidos)
- Lanzar al store

A ~$8/mes, es la inversión más obvia para ir a producción en iOS.

---

## Apple Developer ≠ EAS

Son **dos costos distintos**:

| Servicio | Costo | Para qué |
|----------|-------|----------|
| **Apple Developer Program** | $99/año | Obligatorio para iOS — entitlements, App Store, TestFlight, push |
| **EAS (Expo cloud)** | Free tier alcanza para apps chicas; $99/mes solo si más de 30 builds/mes | Conveniencia: builds en cloud, OTA updates, push service wrapper |

Hoy estamos usando solo Apple-Developer-pendiente. EAS free tier ya configurado (`eas init` corrido, project linked a `@markon07/manifiesto`).

---

## Decisión de arquitectura: ¿Expo Push Service o APNs directo?

Una vez que tengamos cuenta Apple Developer paga, hay dos caminos para entregar push. **Son independientes del build mechanism** (build siempre con cuenta Apple Developer; delivery puede ir por cualquier camino).

### Opción A — Expo Push Service (lo que ya está implementado)

```ts
// Cliente
const token = await Notifications.getExpoPushTokenAsync({ projectId })

// Server (Supabase Edge Function `send-family-push`)
POST https://exp.host/--/api/v2/push/send
{ "to": "ExponentPushToken[xxxxx]", "title": "...", "body": "..." }
```

**Ventajas**:
- Setup en 5 min (ya hecho con `eas init`)
- Misma API para iOS + Android (Expo abstrae APNs y FCM)
- Expo maneja la rotación de certs APNs y FCM
- Free tier sin límite práctico para apps chicas/medianas

**Desventajas**:
- Vendor lock-in (Expo)
- Un hop extra: cliente → Expo → APNs
- Rate limits que Expo no documenta exactamente

### Opción B — APNs directo (sin Expo)

```ts
// Cliente
const token = await Notifications.getDevicePushTokenAsync()
// Returns raw APNs token (~64 hex chars)

// Server
// 1. Generar JWT firmado con la .p8 (descargada de Apple Dev Portal)
//    Headers JWT: { alg: 'ES256', kid: '<KEY_ID>' }
//    Payload: { iss: '<TEAM_ID>', iat: now }
// 2. POST https://api.push.apple.com/3/device/<deviceToken>
//    Headers:
//      authorization: bearer <jwt>
//      apns-topic: com.manifiesto.mobile
//      apns-push-type: alert
//    Body: { aps: { alert: { title: "...", body: "..." } } }
```

**Ventajas**:
- Cero vendor lock-in — directo a Apple
- Sin rate limits ajenos
- Latencia más baja (un hop menos)
- Analytics de delivery propias

**Desventajas**:
- Setup ~1-2 horas (manejo .p8, JWT signing en Edge Function)
- Para Android hay que armar FCM directo aparte (otro setup). OJO: esto
  aplica SOLO a este escenario alternativo no implementado — con el
  pipeline actual (Expo Push) el backend ya es idéntico para ambas
  plataformas; ver `push-notifications-android-setup.md`.
- Mantenimiento: rotación de keys cada N años, monitoreo de errors APNs

### Recomendación

**Quedarnos con Expo Push Service** mientras estemos en beta + primeros usuarios. Para una fintech early-stage no vale la complejidad de APNs directo. Migración a APNs directo solo si:

- Volumen pasa los rate limits de Expo (muy poco probable hasta 10k+ users activos diarios)
- Querés analytics fine-grained de delivery
- Decisión estratégica de quitar dependencias externas

---

## Pasos para activar push cuando paguemos los $99

### En Apple Developer Portal

1. **Pagar la membresía** en https://developer.apple.com/programs/enroll/ ($99 USD)
2. **Identifiers → App IDs**:
   - Crear (o editar el existente) con bundle ID `com.manifiesto.mobile`
   - Capabilities: ✅ Push Notifications
3. **Keys → APNs Authentication Key**:
   - Crear "Manifiesto APNs Key"
   - Descargar `.p8` (única chance — guardar en password manager)
   - Anotar `Key ID` (10 chars) y `Team ID` (10 chars)
4. **Profiles → Provisioning Profiles**:
   - Crear development y distribution profiles que incluyan el bundle ID + push capability

### En EAS (linkear cuenta paga)

```bash
eas credentials
# Configurar cert + provisioning profile vía CLI interactivo
# EAS puede generar/manejar certs automáticamente si le das acceso a la cuenta Apple
```

O directamente:

```bash
eas build --platform ios --profile preview
# La primera vez te pide credenciales Apple, las guarda, y genera el IPA firmado
```

Si preferís Expo Push Service, **no hace falta tocar el código** — `Notifications.getExpoPushTokenAsync({ projectId })` ya está configurado correctamente. Apenas el binario tenga el entitlement, las push empiezan a llegar solas.

### Si decidís ir a APNs directo

Refactor pendiente:

1. Subir el `.p8` como Supabase secret: `supabase secrets set APNS_KEY_P8="$(cat AuthKey_XXX.p8)"`
2. Reescribir `supabase/functions/send-family-push/index.ts` para:
   - Generar JWT con HS256 + secret
   - POST a `api.push.apple.com` directo
3. En el cliente (`mobile/features/push/use-push-notifications.ts`), reemplazar `getExpoPushTokenAsync` por `getDevicePushTokenAsync`
4. Manejar separadamente el flow Android (FCM directo — solo en este
   escenario; bajo Expo Push el flow Android es el mismo, ver
   `push-notifications-android-setup.md`)

Estimado: 1-2 días de trabajo + testing exhaustivo.

---

## Notas de implementación actual

### Estado del código (2026-05-09)

| Componente | Estado |
|-----------|--------|
| `app.config.ts` extra.eas.projectId | ✅ Hardcoded `54449767-9236-4734-972a-e561debd1360` |
| `mobile/features/push/use-push-notifications.ts` | Usa `getExpoPushTokenAsync` — funcionará apenas el entitlement esté en el binario |
| `supabase/functions/send-family-push/` | Edge Function que invoca Expo Push API — listo |
| Tabla `advisor_signal_dismissals` | ✅ Aplicada en remote (per-user dismiss del asistente) |
| Tabla `push_subscriptions` | ✅ Existe desde baseline; soporta `provider = 'expo'` |
| `dist/ios/Manifiesto-unsigned.ipa` | Sin entitlement — push no funciona en sideload |
| `eas.json` perfiles | `preview` + `production` (no hay perfil `development` explícito; usar `expo start` para dev local) |

### Qué pasa cuando paguemos $99

Sin tocar código:
1. Crear App ID + APNs key + provisioning profile (15 min)
2. `eas build --platform ios --profile preview` (cloud build firmado, 20-30 min queue)
3. Instalar IPA firmado → push se registra automáticamente
4. Servidor sigue mandando vía Expo Push Service como hoy

---

## TL;DR

- **Para iOS en producción tenés que pagar Apple Developer Program ($99/año) sí o sí.** No hay forma de evitarlo.
- **EAS y Apple Developer son independientes**. Apple es obligatorio; EAS es conveniencia.
- **Push delivery es independiente del build**. Hoy usás Expo Push Service — funciona apenas el binario tenga entitlement. Migrar a APNs directo es opcional, no requisito.
- **Mientras tanto**: la app funciona sin push real. Podemos suprimir el error visible en builds sideloaded y/o agregar local notifications para los casos schedulables.

<!-- ✓ Contrastado contra código el 2026-05-22 -->
