# Notificaciones efímeras — Design

> **Fecha**: 2026-06-15
> **Branch**: `feature/notifications-ephemeral`
> **Goal**: que la base no acumule notificaciones. El badge se limpia al abrir el
> feed (patrón estándar), y una auto-limpieza diaria poda las leídas (48h) y
> cualquiera vieja (14d). El dismiss explícito (✓/swipe) ya hace hard delete.

## Contexto (estado actual verificado)

- Tabla `public.notifications` (per-FAMILIA): `id, family_id, title, body, kind,
  created_by, created_at, user_id (nullable → family-wide si null), read_at
  (nullable), severity, metadata, dedup_key, pushed_at`.
- **Delete-on-read YA existe** (V2): `useDeleteNotification` (✓/swipe) y
  `useDeleteAllNotifications` hacen HARD DELETE. RLS `notifications_update_mark_read`
  permite marcar `read_at` cuando `user_id is null OR = auth.uid()`.
- El feed (`useFamilyNotifications`) lista TODO (read + unread), limit 60, sin
  filtro por `read_at`. El badge (`useUnreadNotificationsCount`) cuenta
  `read_at is null`.
- Retención existente: `cron_apply_retention_policies()` borra notifications con
  `created_at < 30d`. Cron mensual (`0 4 1 * *`).
- Datos hoy: 4869 filas · 4 leídas · 4865 no-leídas · 1845 family-wide · 21 >30d ·
  183 familias. El problema = acumulación de NO-LEÍDAS (los usuarios no despachan
  cada una a mano).

## Decisión de diseño

NO borrar al instante de "ver" (perdería alertas accionables — el error que las
apps maduras evitan). En cambio: **badge-se-limpia-al-abrir + auto-limpieza con
gracia**. Las notifs de Manifiesto son señales transitorias (check-ins, alertas,
hikes, cierre de ciclo) → bajo valor de archivo → gracia corta (48h leídas).

## Componentes

### 1. Mark-on-open (cliente)
- `useMarkNotificationsSeen(familyId, userId)` — mutation:
  ```
  UPDATE public.notifications
     SET read_at = now()
   WHERE family_id = :familyId
     AND read_at IS NULL
     AND (user_id IS NULL OR user_id = :userId)
     AND kind NOT LIKE 'advisor_%'
  ```
  (mismo filtro que el feed). Gateado por la RLS existente. Update directo desde
  el cliente (no RPC).
- **Dónde se llama**: al montar la pantalla de notificaciones
  (`notifications-screen.tsx`), una sola vez por apertura. Optimista: setear el
  unread count a 0 + marcar `read_at` en los items cacheados; invalidar en
  onSettled.
- Las notifs siguen VISIBLES (el feed no filtra por `read_at`); solo dejan de
  contar para el badge. El ✓/swipe individual sigue borrando.
- **Family-wide**: `read_at` es compartido → "visto por uno = visto por el hogar"
  (modelo existente del bell). Aceptado; sin tabla de reads per-miembro.

### 2. Auto-limpieza diaria (migración)
- Nueva función `public.cron_cleanup_notifications_ephemeral()` (security definer,
  chunked en 10k):
  - `DELETE ... WHERE read_at IS NOT NULL AND read_at < now() - interval '48 hours'`
  - `DELETE ... WHERE created_at < now() - interval '14 days'`
- `revoke all from public; grant execute to service_role` (la corre pg_cron).
- Cron nuevo **diario**: `cron.schedule('cleanup-notifications', '0 4 * * *',
  'select public.cron_cleanup_notifications_ephemeral()')`.
- El bloque de 30d en `cron_apply_retention_policies()` se DEJA como backstop
  inofensivo (la limpieza diaria de 14d siempre lo deja sin trabajo). No se
  recrea esa función grande (menos riesgo).

### 3. Limpieza del backlog (one-shot en la misma migración)
- Aplicar la política nueva una vez al final de la migración:
  ```
  DELETE FROM public.notifications WHERE read_at IS NOT NULL AND read_at < now() - interval '48 hours';
  DELETE FROM public.notifications WHERE created_at < now() - interval '14 days';
  ```
- El resto (<14d no-leídas) se marca-leído al abrir el feed y muere en 48h.

## Data flow
1. Sistema crea notif (check-in, hike, etc.) → `read_at = null`, cuenta para badge.
2. Usuario abre feed → `useMarkNotificationsSeen` → `read_at = now()` → badge 0.
   Items siguen visibles.
3. Usuario hace ✓/swipe en una → HARD DELETE (existente).
4. Cron diario: borra leídas >48h + cualquiera >14d.

## Edge cases
- **Sin familyId/userId**: la mutation no corre (guard).
- **Realtime**: el insert de notifs nuevas refresca el feed; tras mark-on-open
  una notif nueva entra como no-leída (badge sube) — correcto.
- **advisor_%**: excluidas (viven en otra superficie con su propio dismiss).
- **Rollback**: la mutation es optimista con rollback en onError (como
  `useDeleteNotification`).
- **Idempotencia del cron**: chunked + condiciones por timestamp → seguro de
  re-correr.

## Testing
- Unit (pure/SQL-logic): N/A directo (es SQL + un update). 
- Verificación manual en prod (autorizado): correr la migración, confirmar que
  `cron_cleanup_notifications_ephemeral()` borra el set esperado, y que el cron
  queda agendado (`cron.job`). Confirmar el conteo post-backlog-cleanup.
- Cliente: tsc/lint/expo export; verificación en device (abrir feed → badge 0,
  items visibles; ✓ borra; reload no re-trae las borradas).

## NO incluye (YAGNI)
- Tabla de reads per-miembro (se mantiene el `read_at` compartido family-wide).
- Borrado literal al abrir (rechazado).
- Cambios al sistema de push o a `notification_preferences`.
