# Month-close leftover decision (Spec B) — comportamiento real

> Estado: vivo en prod desde 2026-06-08. Persistencia de la decisión del user sobre el sobrante de un mes cerrado.
>
> **2026-06-11 — overhaul completo (auditoría A5/A5b/A5c)**: la fórmula
> del sobrante estaba rota en cliente Y server (doble resta de
> `savings_delta` → 0 idéntico, la decisión NUNCA se disparó desde el
> ship), y el branch `acumular` inflaba el sueldo en vez de sumar al
> saldo. Ambos rediseñados — ver secciones marcadas.

## Problema que resuelve

Cuando un mes cierra con sobrante (ingreso − gastado − ahorro comprometido > 0), antes de Spec B ese dinero quedaba "implícito en libre" y se diluía sin trazabilidad en el siguiente cycle. Spec B le da al user 4 caminos explícitos:

| Opción | Side effect | Cuándo elegirla |
|---|---|---|
| `meta` | suma a `savings_goals.current_amount` de la meta activa | quiere acelerar la meta |
| `acumular` | **inserta un `income_event`** (kind `other`, "Sobrante de <periodo>", `event_date` hoy AR) — entra al pipeline de ingresos extra del ciclo: disponible Home, cupo/proyección Control, checkin matinal, card "Entró este ciclo" | quiere usarlo este mes como margen extra |
| `reserva` | suma a `family_finance.monthly_reserve_amount` (stash) | aparta sin destino, decide después |
| `skip` | sólo persiste el row (audit + idempotencia) | "no quiero decidir hoy" |

> Historia de `acumular` (2026-06-11, A5c): antes seteaba
> `current_cycle_starting_balance = coalesce(balance, monthly_income) + sobrante`.
> La semántica del override es "plata disponible HOY" (reemplaza al
> sueldo y solo descuenta gasto desde hoy) — sembrarlo con el sueldo
> BRUTO a mitad de ciclo ignoraba todo lo ya gastado (caso real owner:
> Home pasó de ~$1.6M a ~$7.7M "disponibles"). El income_event produce
> el efecto que el copy siempre prometió: disponible = saldo actual + sobrante.

## Trigger

```
Usuario confirma cobro ─► upsert family_finance
                              │
              DB trigger      ▼
   trg_family_finance_salary_confirm ─► try_close_previous_cycle ─► UPSERT monthly_summaries
                                                                            │
   Cliente refresca controlIntelligenceQueryKey ◄──────────────────────────┘
                                                                            │
   useMonthCloseDecisionPending lee `monthly_summaries` + `month_close_decisions`
                                                                            │
                                  ▼
   Si hay summary reciente SIN decisión y sobrante > $1000 → emite `PendingDecision`
                                                                            │
                            ┌──────────────────────┐
                            ▼                      ▼
              Wrapped closing scene        MonthCloseDecisionSheet
              (path preferido cuando        (fallback standalone si
               se dispara el wrapped)        wrapped no dispara)
```

## Arquitectura

```
DB (month_close_decisions + family_finance + monthly_summaries)
    │
    ├─ apply_month_close_decision (RPC atómico, security definer)
    └─ Reads vía useMonthCloseDecisionPending
         │
         ▼
React Query cache
    │
    ├─ Home dashboard lee pending
    └─ Inyecta payload al cycle-wrapped-emitter cuando wrapped dispara
         │
         ▼
CycleWrappedModal (closing scene) │ MonthCloseDecisionSheet (standalone)
```

## Modelo de datos

### Tabla `month_close_decisions` ([migration V1](../../supabase/migrations/20260605120000_month_close_decision.sql) + [V2 schema rewrite](../../supabase/migrations/20260605140000_month_close_v2_summary_ref.sql))

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `family_id` | uuid FK | `families(id) on delete cascade` |
| `monthly_summary_id` | uuid FK | `monthly_summaries(id) on delete cascade` — **UNIQUE** |
| `sobrante` | numeric(12,2) | `CHECK >= 0`; clampeado al insert |
| `decision` | text | `CHECK in ('meta', 'acumular', 'reserva', 'skip')` |
| `meta_goal_id` | uuid FK nullable | `savings_goals(id) on delete set null`; requerido sólo con `decision='meta'` |
| `decided_at` | timestamptz | default `now()` |
| `decided_by` | uuid FK | `auth.users(id)` |

**RLS**:
- `SELECT`: miembros activos (no `blocked`) de la familia.
- `INSERT`: bloqueado a nivel policy (`with check (false)`). Toda escritura pasa por el RPC security-definer, que valida atómicamente.

**Idempotencia**: la UNIQUE constraint sobre `monthly_summary_id` previene double-apply. Si el cliente reintenta, el segundo insert salta — el caller ve un error.

### Columna extra en `family_finance`

```sql
add column monthly_reserve_amount numeric(12,2) not null default 0
  check (monthly_reserve_amount >= 0)
```

Acumula los sobrantes guardados como `reserva`. Su administración se documenta en [`reserva.md`](reserva.md).

## RPC `apply_month_close_decision`

Migración canónica vigente: [`20260615040000_acumular_es_income_event.sql`](../../supabase/migrations/20260615040000_acumular_es_income_event.sql).

```sql
apply_month_close_decision(
  p_monthly_summary_id uuid,
  p_decision text,
  p_meta_goal_id uuid default null,
  p_new_cycle_anchor text default null  -- aceptado por back-compat, IGNORADO desde 2026-06-11
) returns void
```

### Garantías

1. **Auth**: requiere `auth.uid()`; membership no-bloqueado + **owner-only** (Sprint F-DB F3). Lookup con mensaje genérico `'monthly_summary not accessible'` (Sprint I-DB1: no distingue "no existe" de "es de otra familia").
2. **Sobrante server-side**: derivado canónicamente desde el `monthly_summaries` referenciado:
   ```sql
   greatest(0, monthly_income - total_spent - savings_goal_amount)
   ```
   El cliente no puede mentir el monto.

   > ⚠ Historia (2026-06-11, A5b): hasta `20260615030000` restaba
   > `savings_delta`, pero el rollup define `savings_delta =
   > greatest(0, income − total_spent)` — **el sobrante mismo**. La
   > doble resta daba 0 idéntico: toda decisión acreditaba $0. La
   > fórmula correcta resta el ahorro COMPROMETIDO (`savings_goal_amount`).
3. **Atomic insert**: la insertion en `month_close_decisions` es el lock — si la UNIQUE constraint salta, el RPC retorna error sin ejecutar side-effects.
4. **Rate limit**: `check_rate_limit('apply_month_close_decision', 5, 3600)`.
5. **Audit log**: write explícito a `audit_log` con decision + sobrante (Sprint G-DB1).

### Branches

| `p_decision` | Validación extra | Side effect |
|---|---|---|
| `meta` | `p_meta_goal_id IS NOT NULL` + pertenece a la familia | `savings_goals.current_amount += sobrante` |
| `acumular` | `sobrante > 0` | `INSERT INTO income_events (kind 'other', 'Sobrante de <period_label>', event_date hoy AR, amount capeado al constraint 1e9)` — el trigger `trg_income_notification` avisa a la familia como con cualquier ingreso |
| `reserva` | — | `family_finance.monthly_reserve_amount += sobrante` |
| `skip` | — | sólo persiste el row de decisión |

> `p_new_cycle_anchor` ya no se valida ni se escribe (el guard de
> ventana F10/J-DB1 murió con el branch que lo necesitaba). El
> constraint defense-in-depth `family_finance_current_cycle_anchor_sane`
> (±400d) sigue vigente para el flujo de confirm-salary que sí escribe
> el anchor.

## Threshold de $1000

Constante client-side: [`mobile/features/month-close/sobrante.ts`](../../mobile/features/month-close/sobrante.ts):

```ts
export const SOBRANTE_THRESHOLD = 1000
```

Sobrantes por debajo no disparan el prompt — son ruido de redondeo / lints / fees pequeños que no ameritan interrupción.

> No es un guard en la DB; el RPC acepta cualquier sobrante >= 0. El threshold es decisión de producto en el cliente.

## Detección y aplicación en el cliente

### `useMonthCloseDecisionPending(familyId)`

[`mobile/features/month-close/use-month-close-decision.ts`](../../mobile/features/month-close/use-month-close-decision.ts).

```ts
{
  staleTime: 0,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
}
```

`staleTime: 0` + `refetchOnMount: 'always'` garantiza que al volver al Home (e.g. tras confirmar cobro, que dispara el trigger DB que crea el summary), el hook re-evalúa la presencia de decisión pendiente. Sin esto, el cache stale enmascaraba el nuevo summary.

Estrategia:
1. Trae las 3 `monthly_summaries` más recientes de la familia (select incluye `savings_goal_amount` desde 2026-06-11).
2. Trae las decisiones existentes para esos summary ids.
3. Devuelve el primero SIN decisión, calcula `sobrante` cliente-side con **`computeSobranteFromSummary`** ([`sobrante.ts`](../../mobile/features/month-close/sobrante.ts) — fórmula canónica compartida con `home-dashboard.tsx`) y compara contra `SOBRANTE_THRESHOLD`.
4. Si pasa el threshold → `PendingDecision { monthlySummaryId, sobrante, periodLabel, periodStart, periodEnd }`. Si no → `null`.

> ⚠ Historia (2026-06-11, A5): la fórmula vivía duplicada en los dos
> call-sites restando `savings_delta` → 0 idéntico → el prompt no se
> mostró NUNCA desde el ship de Spec B. Regresión cubierta en
> [`tests/unit/month-close-sobrante.test.ts`](../../tests/unit/month-close-sobrante.test.ts)
> con el row real de Abril 2026.

### `useApplyMonthCloseDecision(familyId)`

Mutation wrapper sobre la RPC. Invalida:

- `month-close-decision` (refresca el hook anterior para que pendiente desaparezca)
- `family-finance` (cambios en cycle balance / reserve)
- `savings-goal` (cambios en `current_amount`)
- `monthly-summaries`
- `cycle-acumulado` (chip del home hero — sin esto, el chip "Ajustado" viejo persistía hasta refresh manual)

## Surface UX — 2 paths

### Path A — Wrapped closing scene (preferido)

Cuando el wrapped dispara post-cobro (cycle cerrado con `expenses_count > 0`), la última escena integra la decisión inline. Ver [`cycle-wrapped.md`](cycle-wrapped.md) para el detalle.

El home dashboard arma el payload con `pendingLeftoverDecision`, `activeGoal`, `nextCycleAnchor`, y `onApplyLeftoverDecision`. La closing scene renderiza 3 `LeftoverOptionCard` + CTA "Confirmar y empezar".

### Path B — Standalone sheet (fallback)

[`mobile/components/home/sheets/month-close-decision-sheet.tsx`](../../mobile/components/home/sheets/month-close-decision-sheet.tsx).

Auto-mountado desde el home cuando:
- Hay `pending` activo
- El wrapped NO disparó (e.g. cycle cerrado vacío sin recap) o ya cerró sin tomar la decisión

3 OptionCards tap-to-select + CTA "Aplicar" + link "Decidir más tarde" (no persiste, sólo cierra).

La race standalone vs wrapped se resuelve con un gate en home-dashboard: si el wrapped está mostrando, el sheet NO se abre (commit `acafd39`).

## Gates

| Condición | Decisión |
|---|---|
| No hay sesión | ⛔ RPC raise `'No session'` |
| Summary inexistente O de otra familia | ⛔ RPC raise `'monthly_summary not accessible'` (genérico, I-DB1) |
| Caller no es OWNER de la familia | ⛔ RPC raise `'only family owner can apply month close decision'` |
| `decision` no en el enum | ⛔ RPC raise `'invalid decision'` |
| `decision='meta'` sin `meta_goal_id` o meta de otra familia | ⛔ RPC raise |
| Rate limit 5/hora | ⛔ `check_rate_limit` raise |
| Sobrante < $1000 (calculado cliente) | ⛔ Hook devuelve null, no se muestra prompt |
| Ya hay decisión para ese `monthly_summary_id` | ⛔ UNIQUE constraint salta — RPC retorna error |
| Onboarding flow (primer cobro) | ⛔ no hay summary cerrado → no hay pending |

**Errores en el cliente** (2026-06-11, A5b.3): los dos paths de apply
tienen try/catch con `toast.error` ("No pudimos guardar tu decisión…").
El sheet standalone queda abierto para reintentar; la CTA del wrapped
re-throws para no disparar confetti en error. Antes eran unhandled
rejections silenciosas.

## Compatibilidad con replay

El wrapped soporta replay desde Control v2 → card "vs mes anterior". Cuando el cycle ya tiene decisión persistida, el payload incluye `pastLeftoverDecision { decision, sobrante, metaGoalTitle?, decidedAt }` y la closing scene entra en modo read-only (las 3 opciones se renderean con la elegida marcada y las otras inertes; sin CTA aplicable).

`pendingLeftoverDecision` y `pastLeftoverDecision` son mutuamente exclusivos en spec. Si por bug llegan los dos, `past` gana (read-only es safer).

## Archivos relevantes

### Cliente

- Fórmula canónica del sobrante: [`mobile/features/month-close/sobrante.ts`](../../mobile/features/month-close/sobrante.ts)
- Hooks: [`mobile/features/month-close/use-month-close-decision.ts`](../../mobile/features/month-close/use-month-close-decision.ts)
- Standalone sheet: [`mobile/components/home/sheets/month-close-decision-sheet.tsx`](../../mobile/components/home/sheets/month-close-decision-sheet.tsx)
- Wrapped closing scene (Spec B integration): [`mobile/components/wrapped/cycle-wrapped-modal.tsx:884+`](../../mobile/components/wrapped/cycle-wrapped-modal.tsx)
- Emitter payload extension: [`mobile/lib/cycle-wrapped-emitter.ts:62-107`](../../mobile/lib/cycle-wrapped-emitter.ts)
- Trigger inyección del payload pending: [`mobile/components/home/home-dashboard.tsx`](../../mobile/components/home/home-dashboard.tsx) (`fireWrappedForClosedCycle`)

### DB

- V1 (tabla + RPC + column): [`supabase/migrations/20260605120000_month_close_decision.sql`](../../supabase/migrations/20260605120000_month_close_decision.sql)
- Fix anchor cast: [`20260605130000_fix_month_close_anchor_cast.sql`](../../supabase/migrations/20260605130000_fix_month_close_anchor_cast.sql)
- V2 schema (monthly_summary_id): [`20260605140000_month_close_v2_summary_ref.sql`](../../supabase/migrations/20260605140000_month_close_v2_summary_ref.sql)
- Fix acumular preserves salary: [`20260607230000_fix_acumular_preserves_salary.sql`](../../supabase/migrations/20260607230000_fix_acumular_preserves_salary.sql)
- V3 atomic UPDATE: [`20260608030000_harden_reserve_and_acumular_atomic.sql`](../../supabase/migrations/20260608030000_harden_reserve_and_acumular_atomic.sql)
- Fix fórmula sobrante + ventana anchor: [`20260615030000_fix_month_close_sobrante_y_anchor_window.sql`](../../supabase/migrations/20260615030000_fix_month_close_sobrante_y_anchor_window.sql)
- **Vigente** — acumular = income_event: [`20260615040000_acumular_es_income_event.sql`](../../supabase/migrations/20260615040000_acumular_es_income_event.sql)

### Tests

- Unit (fórmula canónica, row real de Abril 2026): `tests/unit/month-close-sobrante.test.ts`
- Integration: `tests/integration/month-close-decision-flow.test.ts`

<!-- ✓ Sincronizado contra código el 2026-06-11 (auditoría A5/A5b/A5c) -->
