# Spec B — Month-close leftover decision + Reserva management + Meta wizard — Shipped 2026-06-08

Status: ✅ Code-complete y merged a `main` (merge commit `b4b19d8`). **75 commits** sobre la rama `feature/month-close-leftover-decision`. **8 migrations** nuevas. **544/544 tests** verdes. 3 rondas de code review aplicadas.

> 📖 **Docs canónicos de los sistemas:**
> - [`docs/sistemas/month-close-decision.md`](../sistemas/month-close-decision.md) — Spec B en detalle
> - [`docs/sistemas/reserva.md`](../sistemas/reserva.md) — administración de la reserva acumulada
> - [`docs/sistemas/savings-goal.md`](../sistemas/savings-goal.md) — meta + wizard + lifecycle
> - [`docs/sistemas/cycle-wrapped.md`](../sistemas/cycle-wrapped.md) — integración Spec B en la closing scene

---

## TL;DR

Sprint largo (75 commits, ~3 días de trabajo end-to-end). Tres features mayores que se entrelazan:

1. **Spec B — leftover decision**: cuando un mes cierra con sobrante > $1000 sin destino, el user elige `meta` / `acumular` / `reserva` / `skip`. La decisión queda persistida y es idempotente.
2. **Reserva management**: el monto acumulado vía decisiones `reserva` ahora es administrable desde Control v2 ("Tu Alcancía") — mover total/parcial al cycle balance o a la meta activa.
3. **Meta wizard + Settings simplificación**: nuevo wizard de 4 steps reusable; Settings → "Meta de ahorro" pasa a read-only + lifecycle (toggle + delete).

Además se rediseñó la closing scene del **Manifiesto Wrapped** para integrar la decisión Spec B inline (3 OptionCards + CTA confirma + confetti post-await), y se shippeó una pila importante de fixes UX (chip stack horizontal, chip Reserva en amber, MetaCard que no aparecía post-create, empty state engañoso de gastos en cycle frozen, etc).

3 rondas de code review en pre-merge, todos los findings cerrados.

---

## 1. Feature 1 — Spec B: month-close leftover decision

### 1.1. Por qué

Hasta este sprint, cuando un mes cerraba con sobrante (ingresos − gastos − ahorro proyectado > 0), ese dinero quedaba "implícito en libre" y se diluía en el siguiente cycle sin trazabilidad. El owner pedía: "que me pregunte qué hacer con esa plata".

### 1.2. Modelo de datos

Tabla nueva `month_close_decisions` ([`supabase/migrations/20260605120000_month_close_decision.sql`](../../supabase/migrations/20260605120000_month_close_decision.sql) + V2 [`20260605140000_month_close_v2_summary_ref.sql`](../../supabase/migrations/20260605140000_month_close_v2_summary_ref.sql)):

| Column | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `family_id` | uuid FK | `families(id) on delete cascade` |
| `monthly_summary_id` | uuid FK UNIQUE | `monthly_summaries(id) on delete cascade` — V2 reemplazó `month_iso text` |
| `sobrante` | numeric(12,2) | calculado canónicamente desde el summary; `>= 0` |
| `decision` | text | `'meta' \| 'acumular' \| 'reserva' \| 'skip'` |
| `meta_goal_id` | uuid FK nullable | requerido sólo cuando `decision='meta'` |
| `decided_at` | timestamptz | default `now()` |
| `decided_by` | uuid FK | `auth.users(id)` |

Idempotencia por UNIQUE(`monthly_summary_id`) — la insertion es el lock atómico para evitar double-apply.

Sumar también a `family_finance`:

```sql
add column monthly_reserve_amount numeric(12,2) not null default 0
  check (monthly_reserve_amount >= 0)
```

### 1.3. RPC `apply_month_close_decision`

Atómico, security-definer. V1 → V2 → V3 evolucionó la signature dentro del sprint mismo:

- **V1** ([`20260605120000`](../../supabase/migrations/20260605120000_month_close_decision.sql)): client pasaba `p_month_iso text` + `p_sobrante numeric`. Trust-the-client.
- **V2** ([`20260605140000`](../../supabase/migrations/20260605140000_month_close_v2_summary_ref.sql)): pasa a `p_monthly_summary_id uuid`. El sobrante se deriva server-side desde el summary canónico — el cliente ya no puede mentir el monto.
- **V3** ([`20260608030000`](../../supabase/migrations/20260608030000_harden_reserve_and_acumular_atomic.sql)): H2 finding del code review — collapsa el `SELECT INTO + UPDATE` de la rama `acumular` en un solo UPDATE atómico para eliminar la race window con el trigger de confirm-salary.

Signature final:

```sql
apply_month_close_decision(
  p_monthly_summary_id uuid,
  p_decision text,
  p_meta_goal_id uuid default null,
  p_new_cycle_anchor text default null
) returns void
```

Branches del RPC:

| `p_decision` | Side effect |
|---|---|
| `meta` | `savings_goals.current_amount += sobrante` (validando family ownership del goal) |
| `acumular` | `family_finance.current_cycle_starting_balance = coalesce(balance, monthly_income) + sobrante`, `cycle_anchor = p_new_cycle_anchor::date` |
| `reserva` | `family_finance.monthly_reserve_amount += sobrante` |
| `skip` | sólo persiste el row de decisión (audit + idempotencia) |

### 1.4. Trigger en el cliente

Hook `useMonthCloseDecisionPending(familyId)` en [`mobile/features/month-close/use-month-close-decision.ts`](../../mobile/features/month-close/use-month-close-decision.ts):

- `staleTime: 0` + `refetchOnMount: 'always'` + `refetchOnWindowFocus: true` — reacciona al row de `monthly_summaries` que crea el trigger DB post-cobro.
- Trae las 3 summaries más recientes + las decisiones existentes; devuelve la primera sin decidir.
- Constante `SOBRANTE_THRESHOLD = 1000` filtra los sobrantes ruido (cents/lints de redondeo).

Hook complementario `useApplyMonthCloseDecision(familyId)` — invalida `month-close-decision`, `family-finance`, `savings-goal`, `monthly-summaries`, `cycle-acumulado`.

### 1.5. Surface UX

Dos paths, ordenados por preferencia:

1. **Wrapped closing scene inline** ([`mobile/components/wrapped/cycle-wrapped-modal.tsx:884+`](../../mobile/components/wrapped/cycle-wrapped-modal.tsx)) — si el wrapped se dispara post-cobro, la decisión se ofrece en la última escena (3 OptionCards stagger + CTA "Confirmar y empezar"). Disparado por `home-dashboard.fireWrappedForClosedCycle`.
2. **Standalone sheet** ([`mobile/components/home/sheets/month-close-decision-sheet.tsx`](../../mobile/components/home/sheets/month-close-decision-sheet.tsx)) — fallback cuando el wrapped no dispara (ej: ciclo cerrado vacío sin recap). Auto-mountado desde Home si hay `pending` y el wrapped no está mostrando.

Race standalone vs wrapped resuelta con un gate (`acafd39 fix(month-close+wrapped): race standalone vs wrapped`).

---

## 2. Feature 2 — Reserva management

### 2.1. Por qué

Antes de este sprint, la decisión `reserva` guardaba el sobrante en `family_finance.monthly_reserve_amount` pero ese monto era inerte — visible (chip Home + sección Settings) pero sin manera de moverlo. Owner pidió: "quiero poder mandar la reserva al mes o a la meta cuando se me cante".

### 2.2. RPC `apply_reserve_decision`

[`supabase/migrations/20260608000000_apply_reserve_decision.sql`](../../supabase/migrations/20260608000000_apply_reserve_decision.sql) → hardened en [`20260608030000`](../../supabase/migrations/20260608030000_harden_reserve_and_acumular_atomic.sql) y [`20260608040000`](../../supabase/migrations/20260608040000_apply_reserve_atomic_where_guard.sql).

```sql
apply_reserve_decision(
  p_amount numeric,
  p_target text,           -- 'cycle' | 'meta'
  p_meta_goal_id uuid default null
) returns void
```

Implementación atómica (V3): single UPDATE con WHERE-guard sobre `monthly_reserve_amount >= p_amount`. Si no matchea (race con otro apply concurrente o reserva insuficiente), `get diagnostics row_count = 0` → RAISE `'amount exceeds reserve'`. Bajo MVCC, dos transactions simultáneas no pueden ambas leer "10" y restar "10": la segunda ve el resultado de la primera al re-evaluar el WHERE.

Para `target='cycle'`: mismo idiom que `apply_month_close_decision` rama acumular — coalesce con `monthly_income` para preservar el sueldo cuando el user no overrideó el balance.

### 2.3. UI — ReserveBlock en Control v2

[`mobile/components/control-v2/control-v2-alcancia-card.tsx:471+`](../../mobile/components/control-v2/control-v2-alcancia-card.tsx) — `ReserveBlock` (self-contained, nullable). Render condicional cuando `monthlyReserveAmount > 0`. Banner indigo + 2 CTAs:

- **"Sumar al mes"** → `target='cycle'`, monto editable via `NumericEditSheet`. Por defecto pre-fillea con la reserva total.
- **"A una meta"** → `target='meta'`. Si no hay meta activa, abre el wizard de creación con `pendingReserveAfterCreate` armado para aplicar el aporte automático post-create. Si la meta existe pero está pausada, Alert pidiendo reactivar primero.

Render duplicado en empty state del alcancía card (`d1b65aa feat(alcancía): reserva visible y administrable también en empty state`).

---

## 3. Feature 3 — Meta wizard + Settings simplificación

### 3.1. Wizard de creación

[`mobile/components/savings-goals/create-savings-goal-wizard-sheet.tsx`](../../mobile/components/savings-goals/create-savings-goal-wizard-sheet.tsx) — bottom-sheet con 4 steps:

1. Título (≤40 chars) + emoji picker (12 opciones, default 🎯)
2. Monto objetivo (display tappable + NumpadGrid on-demand)
3. Plazo (chips 3/6/12/24 meses o custom)
4. Summary + submit ("Crear meta" / "Crear y aportar $N" si vino con `suggestedInitialAmount`)

Chrome compartido: drag handle + drag-to-dismiss, chevron-back/progress-dots/X header, AppButton primary footer. Estado se resetea al toggle `visible: false → true`.

Reusable desde 3 call sites: Control alcancía CTA principal, ReserveBlock "A una meta", Onboarding.

### 3.2. Settings → "Meta de ahorro" rewrite

[`mobile/screens/settings/savings-goal-screen.tsx`](../../mobile/screens/settings/savings-goal-screen.tsx). Antes: form completo de creación + edición. Ahora: read-only + lifecycle.

- Si hay goal (activo o inactivo): muestra `<MetaCard goal={goal} />` + toggle "Activa/pausada" + "Eliminar meta" con confirm.
- Si no hay: empty state con redirect a Control v2 / Onboarding para crear via wizard.

Critical bugfix: el toggle "off" antes hacía que `useSavingsGoal` devolviera null (porque filtra `is_active=true`) y la screen flippaba al EmptyState como si la meta se hubiera borrado. Fix: nuevo hook [`useLatestSavingsGoal`](../../mobile/features/savings-goals/use-latest-savings-goal.ts) (sin filter de activo) — Settings lo usa para preservar visibilidad post-pausa. Home/Control siguen con `useSavingsGoal` (solo activos).

---

## 4. Integración en el Manifiesto Wrapped

Last scene del wrapped ([`cycle-wrapped-modal.tsx:884+`](../../mobile/components/wrapped/cycle-wrapped-modal.tsx)) ahora:

- Renderiza `ClosingSceneRender` con awareness de `payload.pendingLeftoverDecision` y `payload.pastLeftoverDecision`.
- En **pending mode**: sección "Y TE SOBRARON $X" (con amount-pulse animado) + 3 `LeftoverOptionCard` (stagger entrance, selected state animado, press scale) + CTA "Confirmar y empezar" que llama `payload.onApplyLeftoverDecision`.
- En **past mode (replay)**: read-only. Muestra "YA DECIDISTE", la opción elegida con su badge ("Aporte realizado" / "Hecho" / "Guardado"), las otras inertes. Hint con la fecha de la decisión.
- Confetti dispara **después** del `await onApplyLeftoverDecision()` exitoso (no antes), evitando confetti prematuro si la mutation falla (M2 del code review v1).

Payload extension en [`mobile/lib/cycle-wrapped-emitter.ts:62-107`](../../mobile/lib/cycle-wrapped-emitter.ts):

```ts
pendingLeftoverDecision?: { monthlySummaryId: string; sobrante: number }
activeGoal?: { id: string; title: string; emoji: string } | null
nextCycleAnchor?: string
onApplyLeftoverDecision?: (input: ApplyDecisionInput) => Promise<void>

pastLeftoverDecision?: {
  decision: 'meta' | 'acumular' | 'reserva' | 'skip'
  sobrante: number
  metaGoalTitle?: string | null
  decidedAt: string
}
```

`pending` y `past` son mutuamente exclusivos. Si por error llegan los dos, `past` gana.

Replay invocable también desde Control v2 → "vs mes anterior" (`ec1783c feat(control): replay del wrapped desde "vs mes anterior" incluye decisión integrada`).

---

## 5. Migrations (8 nuevas)

| # | Archivo | Qué hace |
|---|---|---|
| 1 | [`20260605120000_month_close_decision.sql`](../../supabase/migrations/20260605120000_month_close_decision.sql) | Tabla `month_close_decisions` v1 (month_iso) + `monthly_reserve_amount` column + RPC v1 |
| 2 | [`20260605130000_fix_month_close_anchor_cast.sql`](../../supabase/migrations/20260605130000_fix_month_close_anchor_cast.sql) | RPC fix: `current_cycle_anchor = p_new_cycle_anchor::date` |
| 3 | [`20260605140000_month_close_v2_summary_ref.sql`](../../supabase/migrations/20260605140000_month_close_v2_summary_ref.sql) | V2: drop `month_iso`, add `monthly_summary_id` UNIQUE; RPC deriva sobrante server-side |
| 4 | [`20260607230000_fix_acumular_preserves_salary.sql`](../../supabase/migrations/20260607230000_fix_acumular_preserves_salary.sql) | Rama `acumular`: coalesce con `monthly_income` (no `0`) para no nukear sueldo |
| 5 | [`20260608000000_apply_reserve_decision.sql`](../../supabase/migrations/20260608000000_apply_reserve_decision.sql) | RPC `apply_reserve_decision` v1 (target=cycle\|meta) |
| 6 | [`20260608010000_home_snapshot_includes_monthly_reserve.sql`](../../supabase/migrations/20260608010000_home_snapshot_includes_monthly_reserve.sql) | `home_snapshot` RPC rewrite — incluye `monthly_reserve_amount` en family_finance payload |
| 7 | [`20260608030000_harden_reserve_and_acumular_atomic.sql`](../../supabase/migrations/20260608030000_harden_reserve_and_acumular_atomic.sql) | H1 (family role filter) + H2 (atomic UPDATE en acumular y reserve cycle) del CR v1 |
| 8 | [`20260608040000_apply_reserve_atomic_where_guard.sql`](../../supabase/migrations/20260608040000_apply_reserve_atomic_where_guard.sql) | M4 del CR v2 — atomic WHERE-guard en reserve (sin SELECT-then-UPDATE) |

---

## 6. Code reviews — 3 rondas

### Ronda 1 (pre-merge, `3446249` + `e6d4f87`)

| Finding | Cómo se cerró |
|---|---|
| **H1** — `apply_reserve_decision` derivaba family sin filtrar role | filtro `role <> 'blocked'` + documentar asunción single-family-per-user (migration 7) |
| **H2** — race latente entre SELECT INTO y UPDATE en `acumular` y `reserve cycle` | collapsar en single UPDATE referenciando columnas de la misma row (migration 7) |
| **M1** — invalidaciones faltantes en `useApplyMonthCloseDecision` | agregar `cycle-acumulado`, `monthly-summaries`, `family-finance`, `savings-goal` |
| **M2** — confetti disparaba antes del await | mover el `setConfettiToken(t => t + 1)` post-await |
| **M3** — round-trip extra para active goal en ReserveBlock | embed en home_snapshot family-finance payload |
| **L1-L5** | varios polish menores + test coverage |

### Ronda 2 (post-V2 trigger, `d64823e`)

| Finding | Cómo se cerró |
|---|---|
| **M4** — race en `apply_reserve_decision` con SELECT-then-UPDATE | atomic WHERE-guard pattern (migration 8) |
| **M5** — copy del confirm de delete meta era engañoso ("se borrarán todos los aportes") | reescribir copy a lo que realmente pasa: el row se borra, los `current_amount` históricos no migran |
| **M6** — chip "Reserva" usaba color indigo igual que "+$X al mes sumado" | cambio a amber/gold ([`home-hero-card.tsx:474-479`](../../mobile/components/home/home-hero-card.tsx)) para diferenciar |

### Ronda 3 (post-rebase, `80cefbb`)

| Finding | Cómo se cerró |
|---|---|
| **M1** — el advisor host llamaba `useUpsertSavingsGoal(familyId)` sin `userId` → no invalidaba `home_snapshot` | plumb `userId` en [`global-advisor-action-host.tsx:321`](../../mobile/components/control-v2/global-advisor-action-host.tsx) |

---

## 7. Fixes UX importantes

### 7.1. MetaCard del Home no aparecía post-create (`d39e071`)

Causa raíz: el wizard llamaba `useUpsertSavingsGoal(familyId, /* userId omitido */)`. Sin el `userId`, `syncAllAfterMutation` no podía invalidar `home_snapshot` (que está gated por userId) → la MetaCard nueva no aparecía hasta refresh / pull-to-refresh. Plumbing del `userId` en los 6 call sites del hook resolvió.

### 7.2. Tap zones del wrapped tapaban el CTA en mes neutro (`7bfec8e`)

Antes: las tap zones (left/right del 1/3 + 2/3) se ocultaban solo cuando había `pendingLeftoverDecision`. En mes neutro (sin sobrante) las tap zones quedaban activas en la última escena y se comían los taps del CTA "Empezar el próximo" → el user percibía el modal "reiniciándose" porque tap-right en realidad disparaba `onDismiss` y luego el bridge re-trigger lo abría de nuevo.

Fix: tap zones se ocultan SIEMPRE en la última escena, independiente de pending/past. El chevron back del header pasa a estar visible siempre en la última escena (no solo con pending) para que el user pueda retroceder.

### 7.3. Bridge re-trigger guard de 1.5s (`92da6d6`)

Causa indeterminada — algún re-render del home dashboard dispara `triggerCycleWrapped` dos veces dentro de ms. Fix pragmático: el bridge rechaza nuevos payloads dentro de `REOPEN_GUARD_MS = 1500` desde el último `onDismiss`. Suficiente para cubrir el doble-fire sin romper el flow legítimo (el replay manual desde Control v2 requiere ≥2 segundos de interacción).

### 7.4. Chip stack horizontal del home hero (`3578dd7`)

Antes 3 chips (Acumulado / Sumado / Reserva / Ajustado) en filas verticales. Layout horizontal con `flexWrap: 'wrap'` — caben 2-3 por fila según width disponible.

### 7.5. Empty state engañoso de gastos en cycle frozen (`bf5805a` + `d5c2f4e`)

Cuando `current_cycle_anchor` no matcheaba el cycle vigente (cycle frozen post-cobro a la espera de confirm), pero la familia tenía expenses fuera del cycle visible, la pantalla mostraba "Carga tu primer gasto" — engañoso, daba la sensación de data perdida.

Fix: el gate `isEmptyAccount` ahora incluye `!hasRecentExpensesOutsideCycle`. Cuando hay expenses recientes fuera del cycle visible, se muestra un variant nuevo `pending-confirm` con CTA "Confirmar cobro" que redirige al confirm flow.

### 7.6. `acumular` nukeaba el sueldo (`c6c79d9`)

Cuando el user no había hecho override del `current_cycle_starting_balance`, la rama acumular hacía `coalesce(balance, 0) + sobrante` → balance final = solo sobrante → dashboard interpretaba el cycle income como solo el sobrante. Sueldo "desaparecía".

Fix (migration 4): `coalesce(balance, coalesce(monthly_income, 0)) + sobrante`. Cuando no había override, asumimos que el income del cycle ES el sueldo configurado; el sobrante se suma encima.

### 7.7. "vs mes anterior" disclaimer (`cb84cc1`)

La card "vs mes anterior" del control comparaba `total_variable_spent` mes a mes, pero el usuario podía pensar que incluía fijos. Disclaimer ahora explícito: "compara variables, no incluye fijos".

### 7.8. Otros polish

| Commit | Cambio |
|---|---|
| `eda58bf` | Wrapped: eliminar parpadeo entre escenas (content flash + bg jump) |
| `857a0a4` | Wrapped: eliminar 3 categorías de warnings de reanimated/worklets |
| `f5e051b` | Wrapped: upgrade integral de animaciones (parallax, stagger, pulse, glow, confetti) |
| `dfce0ad` | Control alcancía: mostrar meta inactiva + CTA "Activar meta" inline |
| `64aa43d` | Home hero: muestra acumulado del mes anterior con breakdown + chip verde |
| `0e45890` | Home: cycle sheet espera al splash + CTA cobro saturado y tappable |
| `4117d88`/`86d446f`/`0bbb85e`/`94b9778`/`957c3ea` | CTA cobro: jerárquico, pulse, brand green, dark mode, copy más claro |

---

## 8. Trade-offs documentados

- **Single-family-per-user assumption**: `apply_reserve_decision` deriva la family con `select ... from family_members where user_id = auth.uid() limit 1` (filtrando role≠blocked). El día que se introduzca multi-family real, el RPC debe migrar a aceptar `p_family_id uuid` explícito como parameter. Documentado en el comment de la migration 7.
- **Sobrante calculado server-side desde V2**: el cliente ya no puede inflarse el sobrante. Trade-off: si cambia la definición canónica de "sobrante" (hoy `monthly_income - total_spent - savings_delta`), hay que migrar el RPC. Aceptable porque hay un único contrato en la DB.
- **Confetti restrained**: solo en wrapped verdict positivo + en la confirmación de decisión real (meta/acumular/reserva). Skip en `skip` (es no-decisión) y en past mode (read-only).
- **`pending` vs `past` mutuamente exclusivos**: el emitter docu lo declara. Si por bug llegan los dos, `past` gana (mostrar el read-only es más seguro que dejar al user re-decidir un mes ya cerrado).

---

## 9. Escenarios validados manualmente

| Escenario | Validación |
|---|---|
| Mes con sobrante > $1000 — path `meta` | sobrante suma a `savings_goals.current_amount` |
| Mes con sobrante — path `acumular` | suma al cycle balance del nuevo mes + sets anchor; preserva sueldo |
| Mes con sobrante — path `reserva` | suma a `monthly_reserve_amount`; chip amber visible en home hero |
| Mes con sobrante — path `skip` | persiste row sin side-effect; UNIQUE previene re-prompt |
| Mes neutro (`sobrante < $1000`) | hook devuelve null; wrapped vanilla sin sección Spec B |
| Mes negativo (overspend + `savings_delta < 0`) | sobrante = `greatest(0, ...)` = 0; no prompt |
| Cobro DOWN/UP override del cycle balance | `acumular` respeta el override; `reserva` no toca cycle balance |
| Wizard creación + activate/deactivate/delete meta | Settings refleja toggle sin flippear a empty state |
| Reserva → meta con monto parcial editable | balance reservado decrementa exacto; goal incrementa exacto |
| Empty state gastos en cycle frozen | variant `pending-confirm` con CTA confirmar cobro |
| Wrapped replay sin decisión | modo vanilla, sin sección Spec B |
| Wrapped replay con decisión persistida | modo read-only, muestra opción elegida + fecha |

---

## 10. Cifras

- **Commits**: 75 (en `feature/month-close-leftover-decision`)
- **Migrations**: 8 nuevas
- **Tests**: 544/544 ✅
- **RPCs nuevos**: 2 (`apply_month_close_decision` v1→v2→v3, `apply_reserve_decision` v1→v2→v3)
- **RPCs modificados**: 1 (`home_snapshot` — sumó `monthly_reserve_amount`)
- **Hooks nuevos**: 4 (`useMonthCloseDecisionPending`, `useApplyMonthCloseDecision`, `useApplyReserveDecision`, `useLatestSavingsGoal`)
- **Componentes nuevos**: 3 (`CreateSavingsGoalWizardSheet`, `MonthCloseDecisionSheet`, `ReserveBlock`)
- **Componentes con cambio mayor**: `CycleWrappedModal` (closing scene rewrite), `Control v2 alcancía card`, `Settings savings-goal screen`
- **Code reviews**: 3 rondas — todos los findings cerrados pre-merge

---

## Commits notables

(rango `b4f5af6..70baf76`, 75 commits)

- `839d79d` — feat(db): month-close decisions table + monthly_reserve column + apply RPC
- `5ef5d82` — feat(ui): MonthCloseDecisionSheet
- `04d2c8f` — refactor(month-close): V2 — apoyar en monthly_summaries
- `adc0242` — feat(wrapped): integrar decisión saldo a favor en última escena
- `725d95f` — feat(wrapped): replay muestra decisión persistida (read-only)
- `fd8032c` — feat(reserve): administrar reserva desde alcancía
- `e346c26` — feat(meta): wizard sheet para crear meta + hide MetaEmptyCard del Home
- `28c7976` — refactor(settings): meta read-only + delete
- `3446249` / `e6d4f87` / `d64823e` / `80cefbb` — 3 rondas de code review
- `7bfec8e` — fix(wrapped): tap zones tapaban el CTA en mes neutro
- `92da6d6` — fix(wrapped-bridge): guard contra re-trigger
- `d39e071` — fix(savings-goal): plumb userId en TODOS los call sites
- `bf5805a` + `d5c2f4e` — fix(gastos): empty state engañoso en cycle frozen
- `cb84cc1` — ui(vsmes-card): aclarar scope de la comparativa

<!-- ✓ Sincronizado contra código el 2026-06-08 -->
