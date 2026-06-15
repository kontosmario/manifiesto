# Notificaciones — sistema

> Última revisión: 2026-06-15 (efímeras + auditoría de cron + hardening
> del pipeline de push + atribución del actor en pushes sociales).
> **Mergeado a `main`** (commits `f4ed119`→`68559d2`).

## Modelo

- Tabla `public.notifications` **per-FAMILIA** (`family_id`): `title, body, kind,
  severity, created_at, user_id (nullable → family-wide si null), read_at,
  metadata, dedup_key, pushed_at`.
- El feed (`useFamilyNotifications`) lista todo (read+unread), limit 60. El badge
  del bell cuenta `read_at is null`. `dedup_key` evita duplicados (1 por día por
  fuente típicamente).
- Las preferencias por usuario: `notification_preferences` (channel_push,
  channel_inapp, kinds_muted, checkin_*_hour). Los crons SQL las respetan;
  los triggers event-driven todavía NO (deuda, ver §deuda).

## Efímeras (2026-06-15)

- **Borrar al leer**: dismiss explícito (✓/swipe) = HARD DELETE (`useDeleteNotification`).
- **Mark-on-open**: al abrir el feed se marca todo leído (`useMarkNotificationsSeen`)
  → el badge va a 0 (patrón estándar). Las filas siguen visibles esa sesión.
- **Auto-limpieza diaria** (`cron_cleanup_notifications_ephemeral`, cron
  `cleanup-notifications` 4am): borra **leídas >48h** + **cualquiera >14d**.
  Steady-state cae de ~4.8K a unos cientos. Spec:
  `docs/superpowers/specs/2026-06-15-notifications-ephemeral-design.md`.

## Fuentes (cron + eventos) — post-auditoría 2026-06-15

| Fuente | Cuándo | Gating | Valor |
|---|---|---|---|
| **checkin_morning** | 9h AR | cupo real del día; respeta prefs/mute; dedup diario | alto ✅ |
| **checkin_evening** | 20:30h AR | contextual (cargaste hoy o no) | alto ✅ |
| ~~checkin_midday~~ | — | **CORTADO 2026-06-15** (nudge genérico sin contexto) | — |
| **fixed_upcoming** | 9h AR | fijo que vence hoy/mañana (o notify_days_before) | medio ✅ |
| **streak_at_risk / broken / recovery** | TZ-aware (ventanas locales) | racha activa; recovery solo hitos 1/3/7/14; dedup | alto ✅ |
| **weekly_insights (goal_behind)** | lun 9h | solo si <30% del pace | medio ✅ |
| **price_hike** | 9:05h AR | solo Δ≥10% | bajo ✅ |
| **zombie_alert** | lun 9:15h AR | fijo activo sin uso/pago 60d+, ≥2 pagos | medio ✅ |
| ~~zombie_detected~~ | — | **REMOVIDO** (redundante con zombie_alert) | — |
| **fixed_paid / expense_logged** | al cargar gasto | event-driven (trigger) | medio |

**Cambios de la auditoría (migración `20260620170000`):** cortar midday;
zombies+price-hikes de la madrugada (~01h AR) a la mañana (~09h); sacar
zombie_detected; copy `"Gasto fijo: X vence hoy"` (desambigua el caso "Apple
espacio") + `"Pago registrado: X"` para fijos pagados.

Volumen: de ~5-8/día percibido → ~3-5 efectivas, cada una más clara y mejor timing.

## Pipeline de entrega (push) — hardening 2026-06-15

Camino completo de una notificación hasta el iPhone:

```
mobile (setupPushNotifications) → register-push-subscription (edge, valida
JWT + resuelve family) → push_subscriptions
   ↓
pg_cron → dispatch_notifications_kind(kind) → notifications-orchestrator
   ├─ processKind: emit_notifications_bulk_returning (inserta+dedup, devuelve
   │  ids) → fetchPushTokens → 1 msg por (fila × token) → send-family-push
   │  → marca pushed_at solo lo entregado
   └─ processPushBacklog (cada 30'): list_unpushed_notifications (allow-list
      cron-only, ventana 24h) → mismo fan-out → marca solo lo entregado
   ↓
send-family-push (batch) → Expo Push API → APNs/FCM → device
```

Hallazgos de la **auditoría adversarial 2026-06-15** (44 findings) y su fix:

| # | Problema | Fix |
|---|---|---|
| 1 | **Colapso por-device**: `Map` keyed por token → con 2+ notifs para un device en una corrida solo se enviaba la 1ª y el resto se marcaba pushed sin enviar (pérdida silenciosa) | `buildMessages` arma 1 mensaje por (fila × token); marca solo filas sin `error` transitorio |
| 2 | **`sendExpoBatch` ignoraba la respuesta de Expo** → 429/5xx contaban como enviados, tokens muertos nunca se podaban | Parsea tickets posicionales, poda `DeviceNotRegistered`, devuelve `statuses[]` alineado |
| 3 | **register-push-subscription sin deployar ~7-10 semanas** (no estaba en config.toml ni scripts) | Entries de las 6 functions en config.toml + `check-edge-functions-deployed.mjs` + deploy-all |
| 4 | **`last_used_at` solo al registrar** → retención 90d borraba tokens activos | Se refresca en cada envío exitoso |
| 5 | **`channel_push` cosmético** (no se respetaba server-side) | Filtro en `fetchPushTokens` + path directo: dropea tokens de quien muteó push, sin tocar el feed |
| 7 | **`processKind` nunca marcaba `pushed_at`** (~4.2k filas NULL) | `emit_notifications_bulk_returning` + marca lo entregado; backfill (NULL 4218→323) |

**verify_jwt (lección):** `notifications-orchestrator` corre con `verify_jwt=false`
en el gateway PORQUE el cron lo llama con un secret opaco dedicado
(`ORCHESTRATOR_CRON_SECRET`), no un JWT. Un redeploy sin la entry de
config.toml vuelve al default `true` y el gateway tira 401 sobre el secret
opaco → **todo el push agendado cae en silencio**. Esto pasó durante la
auditoría; el guard de cobertura + las entries explícitas lo previenen.

## Pushes sociales (client-driven) — gasto/ingreso/fijo de un familiar

Distinto del pipeline cron/orchestrator de arriba. Cuando un miembro
**carga/edita/borra** un movimiento, la app (no la DB) dispara un push a
los **OTROS** miembros vía `mobile/lib/send-family-push.ts` →
`sendFamilyPush()` → **path directo** de la edge `send-family-push` (JWT
del usuario, no service-role).

- **A quién:** la query del path directo hace `.neq('user_id', actorUserId)`
  → pushea a todos menos a quien lo cargó. Respeta blocked + `channel_push`.
- **Atribución del actor (2026-06-15):** `sendFamilyPush` resuelve el nombre
  de quien dispara (cache de perfil → `user_metadata.display_name` →
  fallback `"Un familiar"`) y reemplaza el token `{actor}` en title/body.
  Cada call site elige el verbo:
  - gasto → `"{actor} cargó un gasto"` · `"Almuerzo · $8.900"`
  - ingreso → `"{actor} registró un ingreso"`
  - fijo +/✎/✕ → `"{actor} sumó / editó / eliminó un gasto fijo"`
  Pushes sin el token (zombie/advisor) quedan intactos.
- **kinds:** `expense_logged / income_logged / fixed_created|edited|deleted`
  (todos en `ALLOWED_PUSH_KINDS` de send-family-push; antes caían a `'info'`).
- **NO crea fila** en `notifications`: el push es efímero. La **fila del feed**
  la crea por separado el trigger `notify_expense_change` (family-wide,
  guarda `created_by` → la UI renderiza el autor). O sea: feed = trigger,
  push = cliente; dos mecanismos distintos para el mismo evento.
- **Caveats:** (a) el push solo se dispara **desde la app** (un INSERT crudo
  en la DB dispara el feed pero NO el push); (b) si el receptor no tiene
  token registrado, no recibe (solo lo ve en el feed); (c) errores se tragan
  con `.catch(() => {})` (best-effort — no rompe el guardado del gasto).

## Deuda / futuro
- **Expo receipts (segunda llamada)**: hoy parseamos los *tickets* inmediatos
  (capturan `DeviceNotRegistered` para podar). NO poleamos los *receipts*
  asíncronos de Expo, que reportan fallos diferidos (`MessageRateExceeded`,
  errores de APNs/FCM tardíos). Para volumen alto, sumar un cron que consulte
  `/push/getReceipts` y pode/registre según el receipt. Bajo impacto al MAU
  actual.
- Los triggers event-driven (`notify_expense_change`, fixed_created/edited/deleted)
  NO consultan `notification_preferences` antes de emitir el feed (los crons sí).
  El **push** de esos kinds ya respeta `channel_push` (filtro en `fetchPushTokens`),
  pero el feed in-app no respeta `channel_inapp`/mute en el trigger. Refactor
  pendiente. Riesgo moderado → testear antes.
- El **push** social ya excluye al que cargó (path directo `.neq` actor). Pero
  la **fila del feed** (trigger `notify_expense_change`, family-wide) le aparece
  también a quien lo cargó — redundante para el logger. Evaluar emitir el feed
  solo a OTROS miembros.
- `notify_expense_change` (feed) **no atribuye el actor en el texto** del título
  (sí guarda `created_by`, que la UI renderiza). El **push** sí lo nombra
  ("{actor} cargó un gasto"). Si se quiere paridad, sumar el nombre al título
  del feed también.
