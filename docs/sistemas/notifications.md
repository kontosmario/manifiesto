# Notificaciones — sistema

> Última revisión: 2026-06-15 (efímeras + auditoría de cron). Branch
> `feature/notifications-ephemeral`.

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

## Deuda / futuro
- Los triggers event-driven (`notify_expense_change`, fixed_created/edited/deleted)
  NO consultan `notification_preferences` antes de emitir (los crons sí). Refactor
  para que respeten mute/channel. Riesgo moderado → testear antes.
- "Nuevo gasto cargado" / "Pago registrado" notifican también a quien lo cargó
  (redundante para el logger); evaluar notificar solo a OTROS miembros.
