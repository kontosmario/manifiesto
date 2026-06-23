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

### Cadencia + racha = **derivadas** (sin columnas nuevas)
No agregamos columnas a `fixed_expenses` (evita el gotcha de `home_snapshot`). El builder cliente deriva todo de datos ya disponibles:
- **¿Toca preguntar?** = hay un `fixed_expense_payments` con `paid_at` posterior a la última `usage_audit.created_at` de esa sub (ask-al-pagar) **o** pasaron ≥15 días desde la última respuesta (re-ask).
- **Racha negativa** = contar las últimas respuestas (`level` mapeado a score) por orden `created_at desc`.

### Exponer en `home_snapshot`
Agregar al JSONB del RPC `home_snapshot()`:
- `subscription_usage_audits`: filas de `fixed_expense_usage_audit` de la familia, ventana ~12 meses (para que el builder lea el historial sincrónico, igual que `advisor_signal_dismissals`).
- `subscription_action_intents`: intents abiertos (`resolved_at is null`).

`fixed_expense_payments` y `fixed_expenses` (con `category_id`) **ya** vienen en el snapshot.

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
- Dismiss TTL escalado (`control-dismiss-store`): responder = dismiss; reaparece al próximo check-in derivado (no por TTL fijo, sino por `next_ask` derivado).
- Máx **1–2** cards de uso por corrida (como zombie hoy).
- v1 **no** emite push (cero riesgo de flood). El push del fast-follow reusará el dedup 14d + cooldown del cron existente.

## Qué retiramos (Sistema A)

- `buildFromZombieNotifications()` en `control-signals.ts` (la card *"sin movimiento 2+ meses"*).
- La síntesis de zombi del snapshot en `use-control-v2-data.ts` (`id 'snapshot-zombie-*'`).
- El cron `cron_detect_zombies` (unschedule en `pg_cron`; migración que lo da de baja). **No** se borran tablas/columnas (`last_used_at`, `control_snapshots.zombie_candidates`) — reversible.
- Revisar `subscription-audit-engine.ts` / `use-subscription-audit-feed.ts` / `zombie-feed-section.tsx`: lo que sea candidatura-pasiva del Sistema B se reemplaza por el flujo nuevo; lo reusable (la card de escala, los tipos) se conserva.

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

## Riesgos / consideraciones

- **Render multi-botón** es el cambio de UI más nuevo (hoy las cards tienen 1 CTA). Mitigación: reusar `AuditPromptCard` ya existente.
- **`home_snapshot`**: toda data nueva que el cliente deba ver hay que sumarla al RPC o el cache la pierde al refrescar (mordió 2×). El spec ya lo contempla.
- **Cuentas familiares:** las respuestas son per-usuario; para v1 (owner solo) el scoring usa las respuestas del usuario. Multi-miembro (consenso) queda como mejora futura, no v1.
- **Doc:** actualizar `docs/sistemas/asistente-financiero.md` (catálogo de señales + acciones) y `docs/sistemas/notifications.md` (al sumar el push fast-follow). Crear/actualizar `docs/sistemas/suscripciones-uso.md`.
