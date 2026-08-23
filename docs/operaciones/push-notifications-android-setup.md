# Push notifications en Android — estado, gaps y runbook de integración

> Auditoría 2026-08-21 (rama `feat/ui-redesign`). Complementa
> `push-notifications-ios-setup.md`. OJO con ese doc: sus líneas sobre
> Android ("armar FCM directo aparte", "manejar separadamente el flow
> Android") describen el escenario APNs-directo que NUNCA se implementó.
> El pipeline real usa **Expo Push**, que abstrae APNs/FCM — el backend
> es idéntico para ambas plataformas.

## Resumen ejecutivo

- **Backend y crons: LISTOS.** Cero ramas por plataforma en todo
  `supabase/` (verificado por grep sobre migraciones y functions). El
  pipeline entero es agnóstico: cuando existan tokens Android, todo
  funciona sin tocar SQL ni edge functions.
- **Cliente: LISTO** tras los fixes del 2026-08-21 (canal incondicional,
  error FCM tipado, logging del catch mudo).
- **Bloqueante real: FCM no existe** (consolas Firebase/EAS) + el ícono
  monocromo de notificación + el deploy del fix del batch.

## Topología del pipeline (idéntica para iOS y Android)

```
pg_cron → dispatch_notifications_kind(kind)      [SQL, net.http_post]
        → notifications-orchestrator             [Bearer = ORCHESTRATOR_CRON_SECRET]
        → send-family-push  {messages:[...]}     [Bearer = service_role]
        → https://exp.host/--/api/v2/push/send   [lotes de 100]
        → APNs / FCM (lo resuelve Expo por token)
```

## Inventario de crons (el set efectivo; la última migración gana por jobname)

### Que terminan en push

| Job | Schedule | Función | Nota |
|---|---|---|---|
| `notifications-morning/midday/evening` | `0 * * * *` | `dispatch_notifications_kind('*_checkins')` | vía orchestrator |
| `notifications-fixed-upcoming` | `0 12 * * *` | `dispatch_notifications_kind('fixed_upcoming')` | vía orchestrator |
| `notifications-push-backlog` | `20,50 * * * *` | `dispatch_notifications_kind('push_backlog')` | **el relay real** — drena `list_unpushed_notifications()` y coalescea |

### Emisores (insertan en `notifications`; el backlog las pushea)

| Job | Schedule | Función |
|---|---|---|
| `streak-at-risk` | `0 23 * * *` | `cron_emit_streak_at_risk()` |
| `streak-broken` | `59 2 * * *` | `cron_emit_streak_broken()` |
| `streak-recovery` | `15 * * * *` | `cron_emit_streak_recovery_nudge()` |
| `weekly-insights` | `10 12 * * 1` | `cron_emit_weekly_insights()` |
| `assistant-dormant` | `25 * * * *` | `cron_emit_assistant_dormant()` |
| `control_price_hikes` | `5 12 * * *` | `cron_detect_price_hikes()` |
| `control_zombies` | `15 12 * * 1` | `cron_detect_zombies()` |

(Mantenimiento sin push: `close-previous-cycles`, `cleanup-notifications`,
`apply-retention-policies`, `advisor-push-ledger-cleanup`, etc.)

**Gotcha de staging:** `dispatch_notifications_kind` hace `return`
silencioso si el vault no tiene `orchestrator_url`
(`20260805130000_dispatch_orchestrator_url_por_ambiente.sql:72-77`).
Para probar push contra staging hay que cargar ese secreto primero.

## Veredictos por área

| Área | Veredicto | Detalle |
|---|---|---|
| Crons | LISTO | Sin lógica de plataforma; el allowlist de `list_unpushed_notifications()` filtra por `kind`, nunca por device |
| Coalescing/dedupe | LISTO | Agrupa por usuario y hace fan-out a todos sus endpoints; `isBatchDeliverable` solo excluye web-push (URLs http) |
| Limpieza de tokens muertos | LISTO | `DeviceNotRegistered` → delete (batch y single) + retención 90 días + cola de logout en cliente. FCM lo reporta igual que APNs |
| Payload | LISTO (con deploy pendiente) | Cero campos APNs-only. El batch manda `channelId`/`priority` desde el fix 2026-08-20 — **hay que deployar `send-family-push`**; sin eso Android recibe en canal fallback sin heads-up |
| `push_subscriptions` | GAP menor | No hay columna `platform` (solo `user_agent` libre `"android/15"`). No bloquea; impide medir adopción por plataforma. Opcional: migración + poblar desde `register-push-subscription` |
| Registro de token | LISTO | `register-push-subscription` valida formato Expo, idéntico en ambas |
| Permiso Android 13+ | LISTO | El priming llama `requestPermissionsAsync()` (expo-notifications mapea `POST_NOTIFICATIONS` solo); el permiso no está en `blockedPermissions` |
| Canal `default` | LISTO (fix 2026-08-21) | Se crea al boot, incondicional, en `notification-router-bridge` — antes dependía de permiso+familyId y podía no existir |
| Error de FCM ausente | LISTO (fix 2026-08-21) | `MissingFcmConfigError` + copy i18n en vez del stacktrace de Firebase; el catch mudo del path automático loguea en dev |
| Copy del priming | LISTO | Sin menciones a iOS/Apple en lo visible |
| Ícono de notificación | **GAP** | Sin `notification.icon`/`color` Android muestra un cuadrado gris. Fuente ideal: `assets/brand/manifiesto-fern-v2-transparent.svg` → PNG blanco-sobre-alpha 96×96 (espejar `scripts/generate-ios-app-icons.mjs`) |
| FCM | **GAP bloqueante** | No hay `google-services.json` ni `android.googleServicesFile` ni credenciales FCM V1 en EAS |
| `eas.json` submit | GAP | Falta `submit.production.android` (service account + track) |

## Runbook de integración (orden de bloqueo)

### Consolas (owner)

1. Firebase Console → proyecto → Add app Android con package
   **exactamente** `com.manifiesto.mobile`.
2. Descargar `google-services.json` (NO commitear).
3. Cloud Messaging → confirmar **FCM API v1** habilitada → Service
   accounts → Generate private key (la Server Key legacy está deprecada).
4. `eas credentials --platform android` → subir la FCM V1 service
   account key.
5. `eas secret:create --scope project --name GOOGLE_SERVICES_JSON
   --type file --value ./google-services.json`.
6. (Solo staging) cargar `orchestrator_url` en el vault del proyecto.

### Repo

7. Commit + deploy del fix del batch:
   `supabase functions deploy send-family-push`.
8. `app.config.ts` → bloque `android`:
   `googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json'`.
9. Generar `assets/brand/android-notification-icon.png` (blanco sobre
   alpha, 96×96) y convertir el plugin en tupla:
   `['expo-notifications', { icon, color, defaultChannel: 'default' }]`.
10. (Opcional) migración `platform` en `push_subscriptions`.
11. `eas.json` → `submit.production.android`.

### Verificación

12. Build device (`Device.isDevice` es guard duro) → conceder permiso →
    confirmar fila en `push_subscriptions` con `user_agent` `android/…`.
13. Relay manual: `select public.dispatch_notifications_kind('push_backlog');`
    → heads-up con ícono monocromo correcto.
14. Desinstalar la app → relay → confirmar poda del token
    (`DeviceNotRegistered`).
