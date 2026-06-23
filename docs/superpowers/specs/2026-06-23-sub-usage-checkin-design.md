# Suscripciones por uso real — check-in post-pago (reemplaza el "zombi" por ausencia de pago)

**Fecha:** 2026-06-23
**Estado:** spec aprobado (diseño) — pendiente review del owner antes del plan
**Owner:** kontosmario@gmail.com

## Problema

Hoy conviven dos sistemas de "suscripción zombi":

- **Sistema A (vivo en prod, indirecto):** infiere "no la usás" por **ausencia de pago** (`fixed_expenses.last_paid_at` > 60 días) + ≥2 pagos. Produce la card *"X: sin movimiento hace 2+ meses"* (cron `cron_detect_zombies` + zombi sintético del `control_snapshot` → `buildFromZombieNotifications`). Defecto de fondo: mide **pago, no uso** → una sub que pagás todos los meses pero **no usás nunca se detecta** (su pago está al día). Detecta lo opuesto al objetivo.
- **Sistema B (construido pero "dormido"):** auditoría de **uso real** — tablas `fixed_expense_usage_audit` + `fixed_expense_action_intent`, RPCs, engine `subscription-audit-engine.ts`, card `AuditPromptCard` con escala *mucho/a_veces/casi_nunca*. PERO se dispara **pasivamente** (por candidatura + edad ≥60d al abrir el asistente), **no al pagar**, y el re-ask lo gobiernan cooldowns por clasificación, no un timer de 15 días.

**Objetivo:** que el asistente pregunte por **uso real** enganchado al **evento de pago**, re-pregunte a los ~15 días, acumule las respuestas, y escale hasta sugerir cancelar — sin spamear. Ayudar al usuario a no pagar subs que no usa.

## Decisiones (confirmadas con el owner)

1. **Arquitectura:** reusar las **tablas** del Sistema B + **flujo a medida** (lógica nueva simple alineada a este spec). No reusar el engine de B (consenso familiar, 5 clasificaciones, cooldowns).
2. **Sistema A:** **retirarlo** (apagar señal + cron; no borrar tablas).
3. **Escala:** 3 niveles — **Mucho / A veces / Casi nunca** (ya existe en B).
4. **Qué es "sub":** gasto fijo cuya **categoría es 'Suscripciones'** (`scope='fixed_expense'`) y `status='active'`.
5. **v1 = solo card in-app.** El **push** del re-ask a 15 días es **fast-follow** (paso aparte, reusa el cron del orchestrator).

## Modelo de datos (reusa B, sin tabla nueva)

### Respuestas de uso → `fixed_expense_usage_audit` (existente)
`(id, fixed_expense_id, family_id, user_id, period text, level CHECK mucho|a_veces|casi_nunca, created_at, updated_at)`, `unique(fixed_expense_id, user_id, period)`. RLS: select por miembro de la familia, insert self.

Clave del diseño: **`period` es `text` libre (sin CHECK de formato)**. Usamos `period` = **fecha del check-in** `'YYYY-MM-DD'` (no `'YYYY-MM'`). Así cada check-in es una fila distinta → **historial append-only**, varias respuestas por mes, sin tocar el schema. Re-responder el mismo check-in (misma fecha) hace `on conflict do update` (idempotente).

### Flag de cancelar → `fixed_expense_action_intent` (existente)
`intent='cancel'`, índice único parcial "1 intent abierto por fijo". Reusamos `declare_subscription_intent(feid,'cancel')` y `resolve_subscription_intent(...)`.

### Nuevo RPC: `record_subscription_usage(p_fixed_expense_id uuid, p_level text, p_period text)`
`audit_subscription` existente **hardcodea** `period := to_char(now(),'YYYY-MM')` (una fila/mes, overwrite) → no sirve para el historial por check-in. Agregamos un RPC nuevo `SECURITY DEFINER` (mismo patrón de validación: auth + membership + level válido) que inserta con el `p_period` explícito (la fecha del check-in), `on conflict (fixed_expense_id,user_id,period) do update set level, updated_at`. No tocamos `audit_subscription` (queda, sin callers tras retirar B-engine).

### Cadencia + racha = **derivadas server-side** (cross-ciclo safe)

No agregamos columnas a `fixed_expenses`. **Ojo cross-ciclo (validado 2026-06-23):** el `home_snapshot` ventanea `fixed_expense_payments` al ciclo activo (`paid_at ∈ [cycle_start, cycle_end)`) y lo congela pre-cobro → el builder **no** puede leer "el pago disparador" si cayó en un ciclo ya cerrado. Una sub pagada a fin de ciclo perdería su primer check-in. Por eso el snapshot expone un payload **derivado server-side, SIN ventana de ciclo**:

`subscription_checkins`: array, una entrada por `fixed_expenses` con categoría 'Suscripciones' y `status='active'`:
- `fixed_expense_id`, `name`, `amount` (vigente — **NO** el expense del pago, que se archiva/purga).
- `last_payment_at` = `MAX(fixed_expense_payments.paid_at)` de la sub — **sin filtro de ciclo**.
- `last_audit_at` = `MAX(fixed_expense_usage_audit.created_at)` (del usuario).
- `recent_levels` = últimos ~3 `level` por `created_at desc` (para el scoring).
- `open_intent` = el `fixed_expense_action_intent` abierto (si hay).

Con eso el builder deriva todo sin tocar la ventana de ciclo ni el freeze:
- **Ask-al-pagar** = `last_payment_at > last_audit_at` (pago sin responder).
- **Re-ask** = `now − last_audit_at >= REASK_DAYS` (no depende de payments → robusto al cierre).
- **Racha** = `recent_levels` mapeados a score.

Las dos condiciones se evalúan por separado e idempotentes; nunca 2 cards para la misma sub en una corrida (cap 1–2). Este payload reemplaza el plan anterior de exponer `fixed_expense_usage_audit`/`payments` crudos (que sufren el windowing del ciclo).

## Flujo (la card)

1. **Al pagar** una sub (categoría 'Suscripciones') → la próxima vez en el asistente aparece la card de check-in: *"Pagaste Netflix · ¿cuánto la usaste el mes pasado?"* → **Mucho / A veces / Casi nunca**. Reusamos `AuditPromptCard` (ya tiene la escala). El `period` = fecha de hoy.
2. **A los ~15 días** sin nueva respuesta → re-pregunta amistosa: *"¿Seguís usando Netflix?"* (misma escala, nuevo `period`).
3. Responder de un toque → `record_subscription_usage(feid, level, today)` → la card se retira (dismiss) hasta el próximo check-in.

### Render en el asistente
- Nuevo builder `buildSubUsageCheckin(args)` en `control-signals.ts`, registrado en `buildControlSignals`. Lee de `BuildSignalsArgs` la lista de subs-con-check-in-pendiente (inyectada por `useControlV2Data` desde el snapshot). Devuelve 0..N `ControlAdvisorTask` (cap 1–2, como zombie).
- La card necesita **botones de escala** (3) en vez de la única CTA actual. Extendemos `ControlAdvisorTask` con un campo opcional `replies?: { label, action }[]` y renderizamos esa fila en `asistente-screen.tsx` debajo de la CTA. Alternativa de menor cambio: reusar el componente `AuditPromptCard` embebido como un "render especial" para `signal_family === 'sub-usage'`. (Decisión de implementación en el plan; ambas reusan la escala existente.)
- Nuevo `ControlAction` kind `'sub-usage-answer'` (`{ kind, fixedExpenseId, level }`) manejado en `use-control-action-dispatcher.ts` → llama `record_subscription_usage` + `dismissCard`.
- Filtrado central intacto: la señal entra por `buildControlSignals`; **no** re-filtrar dismissed/blocklist en consumidores; pasar `userId`; gatear en `signalsReady`. `signal_family = 'sub-usage'` (blocklist-able).

## Scoring + escalación

Score de no-uso por respuesta: `mucho=0 · a_veces=0.5 · casi_nunca=1`. Función pura `scoreSubscriptionUsage(audits)` (testeable, env node):

- **"Mucho"** → resetea la racha + **afloja la cadencia**: próxima pregunta ~30–45 días (no spamear lo que sí se usa).
- **2 respuestas negativas seguidas** (`>=0.5`) → **flag suave**: copy *"¿La estás aprovechando?"* (misma card, tono de aviso).
- **3 negativas seguidas, o 2 `casi_nunca` seguidas** → **flag fuerte**: *"Venís sin usar Netflix hace ~2 meses. ¿Realmente necesitás pagarla?"* + CTA **Cancelar** (`declare_subscription_intent('cancel')`) + reply **"La sigo usando"** (registra `mucho` y resetea).
- Tras declarar `cancel` → `IntentFollowupCard` existente (o equivalente) hasta resolver. `resolve_subscription_intent('completed','cancel')` archiva el fijo.

Umbrales en constantes (`mobile/features/subscriptions-zombie/usage-checkin.constants.ts` o similar), ajustables: `REASK_DAYS=15`, `REASK_DAYS_AFTER_HIGH=35`, `SOFT_FLAG_STREAK=2`, `HARD_FLAG_STREAK=3`.

## Anti-spam (reusar, no duplicar)

- Diversity budget del asistente (≤3 por urgencia, cap 5 cards) — la card de uso entra a ese presupuesto.
- **Cadencia gobernada por el gate del builder** (no emitir si `now − last_audit_at < REASK_DAYS`), **NO** por el TTL del `control-dismiss-store`. Validado 2026-06-23: el dismiss-store es TTL-based y 'sub-usage' caería al `COOLDOWN_DAYS=7` (reaparición temprana = spam antes de los 15d) y un id por-período nunca acumula `ignoreCount`. El dismiss se usa solo como **supresión intra-sesión**; agregar 'sub-usage' a `BASE_TTL_DAYS` con valor `>= REASK_DAYS` como backstop.
- Máx **1–2** cards de uso por corrida (como zombie hoy).
- v1 **no** emite push (cero riesgo de flood). El push del fast-follow reusará el dedup 14d + cooldown del cron existente.

## Qué retiramos (Sistema A)

- `buildFromZombieNotifications()` en `control-signals.ts` (la card *"sin movimiento 2+ meses"*).
- La síntesis de zombi del snapshot en `use-control-v2-data.ts` (`id 'snapshot-zombie-*'`).
- El cron `cron_detect_zombies` (unschedule en `pg_cron`; migración que lo da de baja). **No** se borran tablas/columnas (`last_used_at`, `control_snapshots.zombie_candidates`) — reversible.
- Revisar `subscription-audit-engine.ts` / `use-subscription-audit-feed.ts` / `zombie-feed-section.tsx`: lo que sea candidatura-pasiva del Sistema B se reemplaza por el flujo nuevo; lo reusable (la card de escala, los tipos) se conserva.
- **Tests (mismo commit, validado 2026-06-23):** actualizar `tests/unit/control-signals.test.ts` — el caso *"caps output at 5 tasks and ranks by urgency"* inyecta 2 `zombie_alert` y assertea `out[0].urgency==='alta'`; se rompe al sacar `buildFromZombieNotifications`. Reemplazar el fixture/assert por la nueva fuente de urgencia alta (card sub-usage con flag fuerte) o quitar los `zombie_alert`. Revisar `tests/integration/control-snapshot.test.ts` si se toca `compute_control_snapshot`.

## Retención

Las filas de `fixed_expense_usage_audit` son append-only y hoy **no tienen prune**. Agregamos un cron de prune (patrón `cron_prune_advisor_interactions`) que borra respuestas con `created_at < now() - interval '12 months'`. El scoring mira las últimas ~3.

## Identificación de "sub" (gotcha a resolver en el plan)

No hay flag booleano de suscripción. Criterio: categoría con `name='Suscripciones'` y `scope='fixed_expense'` + `status='active'`. **Inconsistencia conocida a verificar:** el cron de zombie usa `kind='periodic'` mientras el engine cliente exige `kind='recurring'` — hay que confirmar qué `kind` reciben las subs creadas por el flujo AddFijo y filtrar por categoría (no por kind) para v1.

## Alcance v1

**Agregamos:**
- Migración: RPC `record_subscription_usage(feid, level, period)` + `home_snapshot()` expone `subscription_usage_audits` + `subscription_action_intents` + cron de prune 12m + unschedule de `cron_detect_zombies`.
- Cliente: builder `buildSubUsageCheckin` + función pura `scoreSubscriptionUsage` + `ControlAction` kind `'sub-usage-answer'` + dispatcher + render de réplicas de escala + inyección desde `useControlV2Data`.

**Reusamos:** tablas, `declare/resolve_subscription_intent`, escala/`AuditPromptCard`, filtrado central, dismiss store, diversity budget.

**Quitamos:** Sistema A (3 piezas).

**Fuera de v1 (fast-follow):** push del re-ask a 15 días (cron SQL diario + kind nuevo en `notifications-orchestrator`, respetando verify_jwt/dedup/cron secrets).

## Testing

- `scoreSubscriptionUsage` (pura): casos mucho→reset, 2 negativas→soft, 3/2-casi_nunca→hard, cadencia afloja tras 'mucho'. (vitest, env node.)
- Builder `buildSubUsageCheckin` vía `buildControlSignals` (patrón de `tests/unit/control-signals.test.ts`): paga-sin-responder→card; respondió hace <15d→no card; 3 negativas→flag fuerte con CTA cancelar.
- RPC `record_subscription_usage`: append-only por período, idempotente, RLS (member-only). (Integration si hay DB; si no, smoke del shape.)
- Validación por task: `npm run typecheck`, `eslint`, `npx expo export --platform ios` antes de declarar verificado. La migración se aplica a prod vía Management API y se verifica con una query.

## Invariantes cross-ciclo (validado adversarialmente 2026-06-23)

Verificado contra `close_monthly_cycle`, `home_snapshot` (freeze), la retención de pagos, y el feed del asistente. Veredicto: **safe-with-notes** — la feature no rompe el ciclo ni el ciclo corrompe sus datos; estas invariantes deben mantenerse:

1. **El cierre no toca las tablas de la feature.** `close_monthly_cycle` solo archiva `expenses` (`archived_at`) y upserta `monthly_summaries`. NO puede tocar/archivar/resetear `fixed_expense_payments`, `fixed_expense_usage_audit` ni `fixed_expense_action_intent`. Cualquier cambio futuro al cierre debe preservarlo.
2. **El trigger se ancla al ledger durable, no al expense efímero.** El evento de pago vive en `fixed_expense_payments.paid_at` (persiste cross-ciclo). El `expense` ligado se archiva al cerrar y se purga (retención last-3) → NUNCA derivar el trigger ni el monto del expense. Monto = `fixed_expenses.amount` vigente.
3. **El ask-al-pagar NO depende de la ventana de ciclo del snapshot.** Se deriva del payload `subscription_checkins` (sin filtro de ciclo). El array de `fixed_expense_payments` ventaneado del snapshot NO sirve para el check-in cross-ciclo.
4. **Las dos condiciones del trigger son independientes e idempotentes ante un cierre intermedio.** Re-ask por timer (`now − last_audit_at >= REASK_DAYS`) no depende de payments → robusto al cierre. Nunca 2 cards para la misma sub en una corrida.
5. **La cadencia la gobierna el gate del builder, no el TTL del dismiss-store.** El dismiss es supresión intra-sesión.
6. **El builder solo considera `status='active'` + categoría 'Suscripciones'.** Subs `archived`/`paused` (vía `resolve_subscription_intent`) quedan excluidas aunque sigan llegando en el snapshot.
7. **`record_subscription_usage` es `SECURITY DEFINER` e idempotente** (`on conflict (fixed_expense_id,user_id,period) do update`) — la RLS de `fixed_expense_usage_audit` no tiene policy de UPDATE.
8. **`period` del flujo nuevo es siempre `'YYYY-MM-DD'`;** `scoreSubscriptionUsage` debe ser robusto a (o ignorar) filas legacy `'YYYY-MM'` de `audit_subscription`.
9. **Prune de `usage_audit` = 12m, estrictamente `>> REASK_DAYS × streak_threshold`** para no truncar rachas activas (el scoring mira las últimas ~3).

## Riesgos / consideraciones

- **Render multi-botón** es el cambio de UI más nuevo (hoy las cards tienen 1 CTA). Mitigación: reusar `AuditPromptCard` ya existente.
- **`home_snapshot`**: toda data nueva que el cliente deba ver hay que sumarla al RPC o el cache la pierde al refrescar (mordió 2×). El spec ya lo contempla.
- **Cuentas familiares:** las respuestas son per-usuario; para v1 (owner solo) el scoring usa las respuestas del usuario. Multi-miembro (consenso) queda como mejora futura, no v1.
- **Doc:** actualizar `docs/sistemas/asistente-financiero.md` (catálogo de señales + acciones) y `docs/sistemas/notifications.md` (al sumar el push fast-follow). Crear/actualizar `docs/sistemas/suscripciones-uso.md`.
