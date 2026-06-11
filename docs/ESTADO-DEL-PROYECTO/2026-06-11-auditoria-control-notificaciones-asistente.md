# 2026-06-11 — Auditoría: Control · Notificaciones/Crons · Asistente

> **Disparador**: owner reportó (a) card "hasta cuándo te alcanza" con
> "sobrante $2.1M" teniendo ~$1.6M disponibles, (b) solo 2 notificaciones
> en el día (una "hardcodeada") y después silencio total, (c) fijos
> recién pagados (Claude AI, Expensas) marcados "SIN USO RECIENTE".
> **Método**: auditoría contra los datos REALES de la cuenta
> kontosmario@gmail.com en prod (SQL directo) + lectura de fórmulas.
> **Autorización owner**: cambios en Supabase prod concedidos.

## Hallazgos y fixes

### A1 · Cards de Control

| # | Hallazgo | Root cause | Fix |
|---|---|---|---|
| A1.1 | "Sobrante $2.1M" imposible | `sobrantePresupuestadoMes = libreTotal − promedioRobusto×diasMes`: proyectaba el MES ENTERO al ritmo típico (que excluye días pico) e **ignoraba los $4.34M ya gastados**. Reconstrucción exacta: 6.4M−4.34M variables ≈ 2.06M ✓ | `proyectado = gastadoHastaHoy + promedio×díasFuturos` (control-v2-mock). Arregla también la card "VS mes" y las señales de ahorro que consumen el mismo campo. Tests de regresión con el escenario real |
| A1.2 | `velocity_snapshots` mintiendo (avg7 $11.8k vs $135k reales el 10-jun) | El cron corre 01:00 AR; las cargas tardías/back-dateadas (imports OCR) invalidan la foto el resto del día. Verificado: el snapshot del 10-jun solo vio los gastos de Jun 3-4 | **Velocity fresca client-side** en `use-control-v2-data` (misma semántica y umbrales de stress que el cron) derivada de los gastos en memoria; snapshot del server como fallback con <7 días cerrados. Alimenta las señales del asistente |
| A1.3 | Score >100 posible | `sFijos` sin clamp: con fijosRatio bajo aportaba hasta 20/10 puntos | `Math.min(10, …)` |
| — | Vault/Alcancía, Patrón semanal, Semana, Cobertura de fijos, Hero | Fórmulas verificadas contra datos reales: correctas | Sin cambios |

### A2 · Crons y notificaciones

| # | Hallazgo | Root cause | Fix |
|---|---|---|---|
| A2.1 | **Push muerto en silencio** (el hallazgo madre) | `notifications-orchestrator` devolvía **401 en todas las llamadas**: el secret del Vault quedó stale tras la rotación de keys del hardening (2026-06-11). pg_net no alerta — los crons figuraban "succeeded" | Secret dedicado `ORCHESTRATOR_CRON_SECRET` (generado nuevo, nunca expuesto el service-role): env del function + Vault + check constant-time con fallback. Deploy `--no-verify-jwt` (el gateway no acepta bearer no-JWT; el gate real es el del código). **Verificado: dispatch 200, sent: 9** |
| A2.2 | Crons SQL legacy insertan filas pero **nadie pushea** (rachas, zombies, price hikes, weekly) | El orchestrator solo pushea lo que él mismo inserta; el handover quedó a mitad | **`push_backlog`**: columna `notifications.pushed_at` + RPCs `list_unpushed/mark_pushed` + kind nuevo en el orchestrator + cron cada 30'. Allow-list de kinds cron-only (no duplica checkins ni pushes sociales) |
| A2.3 | Checkin matinal "hardcodeado" ($169.852 todos los días) | Fórmula estática `(ingreso−fijos)/30` — ignoraba gasto real, buffer y posición del ciclo. Además `list_pending_notifications` ignoraba `notification_preferences` | Cupo real: `(libre−gastado)/días restantes` con buffer aplicado (espejo del Home) + copy de recuperación si el plan está pasado + respeto de mutes/channel. **Verificado contra tu cuenta: "~$47.152 para gustos. Quedan $707.287" — matemática exacta** |
| A2.4 | Crons duplicados (`morning-checkins`+`notifications-morning`, `fixed-upcoming`×2) | El stagger del Sprint Q re-creó los legacy que el handover había desagendado | Desagendados los 2 duplicados puros. Rachas/weekly QUEDAN en SQL (side effects: consumen escudos) y ahora pushean vía backlog |
| A2.5 | `notify_days_before` de los fijos ignorado en el aviso de vencimiento | Ventana fija hoy/mañana | Ventana default + el aviso anticipado configurado |

Las 2 notificaciones que llegaron = los `checkin_morning` insertados por
el cron SQL legacy (visibles in-app); "hardcodeada" = la fórmula estática.

### A3 · Asistente Financiero

| # | Hallazgo | Root cause | Fix |
|---|---|---|---|
| A3.1 | Claude AI y Expensas (pagados hace días) como "SIN USO RECIENTE" | `last_used_at` **no lo escribe ningún flujo** → siempre NULL → TODO fijo activo calificaba de zombie; `zombie_candidates` tomaba el top-3 por monto. (El cron de zombies además filtraba `kind='periodic'` que jamás matchea — los fijos reales son `'recurring'`) | Condición **payment-aware** en `compute_control_snapshot` y `cron_detect_zombies`: `greatest(last_used_at, last_paid_at) < now()−60d` — un fijo pagado hace <60 días no es zombie. **Verificado: zombie_candidates = [] para tu familia.** Copy del signal actualizado ("sin movimiento hace 2+ meses", CTA "Revisar"). RPC `rpc_mark_fixed_expense_used` creado para la futura affordance "lo sigo usando" |
| A3.2 | Señal de velocity con datos stale | Mismo A1.2 | La velocity fresca alimenta `buildVelocityWarning` |

## Artefactos

- **Migración**: `supabase/migrations/20260615010000_audit_notifications_y_zombies.sql` (aplicada a prod vía `db push`, historia en paridad)
- **Edge function**: `notifications-orchestrator` redeployado (cron secret + push_backlog)
- **Cliente**: `control-v2-mock.ts` (proyección + clamp), `use-control-v2-data.ts` (velocity fresca), `control-signals.ts` (copy zombie)
- **Tests**: `tests/unit/control-projection-honesta.test.ts` (escenario real de la cuenta como regresión)

## Verificaciones en prod (post-fix)

```
dispatch_notifications_kind('midday_checkins') → 200 {processed:156, sent:9}
compute_control_snapshot(familia owner) → zombie_candidates: []
list_pending_notifications('morning_checkins') → "~$47.152 para gustos. Quedan $707.287 del mes"
cron.job → morning-checkins/fixed-upcoming legacy fuera; notifications-push-backlog */30 activo
```

## Pendientes / seguimiento

- **Esta noche**: `streak_at_risk` (20:00 AR) debería llegar como PUSH por primera vez (vía backlog ≤30' después). Confirmar en device.
- `streak-recovery` (cada 15') y `weekly_insights` siguen como SQL emit → pushean vía backlog con hasta 30' de lag — aceptable.
- Las preferencias de HORA de checkin (`checkin_morning_hour`) siguen sin honrarse (el dispatch es a hora fija 9 AR); requeriría dispatcher horario — anotado, no bloqueante.
- Affordance "¿Lo seguís usando?" para zombies reales (RPC listo, falta UI slot de acción secundaria en las cards del asistente).
- `mailer_autoconfirm: true` y `password_min_length: 6` server-side — observaciones del config, decisión pendiente del owner.
