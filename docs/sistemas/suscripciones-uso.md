# Suscripciones por uso real — check-in post-pago

**Estado:** v1 in-app (sin push). Vivo desde 2026-06-23.
**Spec/Plan:** `docs/superpowers/specs/2026-06-23-sub-usage-checkin-design.md` · `docs/superpowers/plans/2026-06-23-sub-usage-checkin.md`

## Qué hace

Cuando el usuario **paga una suscripción** (gasto fijo de categoría 'Suscripciones', `status='active'`), el asistente le pregunta **cuánto la usó** (escala *Mucho / A veces / Casi nunca*). Re-pregunta a los ~15 días. Acumula las respuestas y, si el uso viene bajo, **escala hasta sugerir cancelarla**. Objetivo: que no pague subs que no usa, sin spamear.

Reemplaza el detector viejo *"sin movimiento hace 2+ meses"* (que infería no-uso por **ausencia de pago** — una sub que pagás pero no usás nunca se detectaba).

## Flujo

1. **Al pagar** → próxima vez en el asistente aparece la card *"Pagaste X · ¿cuánto la usaste?"* con la escala de 3 botones.
2. **A los ~15 días** sin nueva respuesta → re-pregunta *"¿Seguís usando X?"*.
3. **Mucho** → resetea la racha + afloja la cadencia (~35 días).
4. **2 negativas seguidas** → flag suave *"¿la estás aprovechando?"*.
5. **3 negativas (o 2 'casi nunca')** → flag fuerte *"¿realmente necesitás pagarla?"* con **Cancelar** (abre el editor del fijo + registra el intent) y **La sigo usando** (resetea).

## Arquitectura

### Datos (reusa las tablas del feature "subscriptions-zombie")
- **Respuestas:** `fixed_expense_usage_audit` (`fixed_expense_id, user_id, period text, level`). `period` = **fecha del check-in `'YYYY-MM-DD'`** → historial append-only por check-in (varias respuestas/mes). RPC nuevo **`record_subscription_usage(feid, level, period)`** (SECURITY DEFINER, idempotente `on conflict do update` — la tabla no tiene policy UPDATE).
- **Flag de cancelar:** `fixed_expense_action_intent` (`intent='cancel'`), vía `declare_subscription_intent`.
- **Prune:** `cron_prune_usage_audit` borra respuestas > 12 meses (cron mensual).

### Payload server-side (LIVE, sin ventana de ciclo)
`home_snapshot()` expone **`subscription_checkins`** — un array derivado por cada sub activa de categoría 'Suscripciones':
`{ fixed_expense_id, name, amount, last_payment_at (MAX paid_at, SIN ventana de ciclo), last_audit_at (MAX created_at del user), recent_levels (últimos 3), open_intent }`.

Va en **`home_snapshot` (live)**, NO en `control_snapshot` (materializado 3×/día → lag inservible para "preguntá al pagar"). El pago invalida home_snapshot → la card aparece pronto.

### Cliente
- `mobile/features/subscriptions-zombie/usage-checkin.ts` — `scoreSubscriptionUsage(checkin, now)` (pura): deriva `shouldAsk` / `prompt` ('pay'|'reask') / `flag` / `negativeStreak`. Umbrales en `usage-checkin.constants.ts` (`REASK_DAYS=15`, `REASK_DAYS_AFTER_HIGH=35`, `SOFT=2`, `HARD=3`).
- `control-signals.ts` → `buildSubUsageCheckin(args, now)`: lee `args.subscriptionCheckins`, corre el score, emite 0..2 cards `sub-usage-<feid>` con `replies` de escala.
- `use-control-v2-data.ts` lee `subscription_checkins` de `useHomeSnapshot` (cache caliente) e inyecta `subscriptionCheckins` a `buildControlSignals`.
- Acciones: `ControlAction` kinds `sub-usage-answer` (graba respuesta) y `sub-usage-cancel` (abre editor + declara intent), en `use-control-action-dispatcher.ts` → repo `record-subscription-usage.ts`.
- Render: `asistente-screen.tsx` muestra la fila de escala cuando `task.replies` está presente.

## Invariantes cross-ciclo (validadas adversarialmente)

La feature es **agnóstica al ciclo**: `close_monthly_cycle` no toca las tablas de uso; el trigger se ancla a `paid_at` (ledger durable, sobrevive el cierre) vs `created_at` (wall-clock). El monto se toma de `fixed_expenses.amount` vigente (NO del expense del pago, que se archiva/purga). El `subscription_checkins` NO usa ventana de ciclo (por eso una sub pagada a fin de ciclo no pierde su check-in). Detalle completo: sección "Invariantes cross-ciclo" del spec.

## Qué se retiró (Sistema A — reversible)
- `buildFromZombieNotifications` (señal *"sin movimiento 2+ meses"*) + su registro.
- El zombi sintético del `control_snapshot` en `use-control-v2-data` + el feed pasivo `<ZombieFeedSection>`.
- El cron `control_zombies` (desagendado). **No** se borraron tablas/funciones/columnas (`cron_detect_zombies()`, `control_snapshots.zombie_candidates`, `last_used_at`) — quedan dormidas.

## Pendiente (fast-follow)
Push del re-ask a 15 días (cron SQL diario + kind nuevo en `notifications-orchestrator`). v1 es solo card in-app.
