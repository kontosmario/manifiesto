# Savings goal — comportamiento real

> Estado: vivo en prod. Rewrite mayor 2026-06-08 (wizard + Settings simplificación + dual hooks).

## Modelo

Tabla `savings_goals`. Shape mapeado en [`mobile/features/savings-goals/savings-goal.model.ts`](../../mobile/features/savings-goals/savings-goal.model.ts):

| Campo SQL | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `family_id` | uuid FK | `families(id)` |
| `title` | text | ≤ 40 chars (validado cliente) |
| `emoji` | text | default `🎯` si vacío |
| `goal_amount` | numeric | objetivo > 0 |
| `current_amount` | numeric | acumulado ≥ 0 (mutado por aportes manuales + RPCs Spec B / reserva) |
| `target_months` | int nullable | plazo deseado (3/6/12/24 o custom hasta 240) |
| `is_active` | boolean | lifecycle — `false` pausa la meta sin borrarla |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Validación cliente en `validateSavingsGoalInput`:
- `title` obligatorio, ≤ 40 chars
- `goalAmount > 0`
- `currentAmount >= 0`
- `targetMonths` si presente: entero positivo

## Dos hooks de lectura — `useSavingsGoal` vs `useLatestSavingsGoal`

| Hook | Filtro | Usuarios | Query key |
|---|---|---|---|
| [`useSavingsGoal(familyId)`](../../mobile/features/savings-goals/use-savings-goal.ts) | `is_active = true` | Home (MetaCard), Control v2 (alcancía), wrapped (activeGoal payload) | `['savings-goal', familyId ?? null]` |
| [`useLatestSavingsGoal(familyId)`](../../mobile/features/savings-goals/use-latest-savings-goal.ts) | sin filtro (devuelve cualquier estado) | Settings (read-only + lifecycle) | `['savings-goal-latest', familyId ?? null]` |

**Por qué dos hooks**: antes del rewrite, Settings usaba `useSavingsGoal`. Al toggle `is_active: false`, el hook devolvía `null` → la screen flippaba al EmptyState como si la meta se hubiera borrado. Owner reportó: "toggle off y desapareció la meta".

Fix: Settings pasa a `useLatestSavingsGoal` (sin filter). Home/Control siguen con `useSavingsGoal` — para ellos, una meta pausada NO debe rendirse (la meta del Home tiene que reflejar foco, no historial).

`staleTime: 5 * 60_000` en ambos — el goal cambia via mutation (que invalida explícito), silent refetches no aportan.

## Wizard de creación

[`mobile/components/savings-goals/create-savings-goal-wizard-sheet.tsx`](../../mobile/components/savings-goals/create-savings-goal-wizard-sheet.tsx). Bottom-sheet con 4 steps.

### Steps

| Step | Pregunta | Input | Default |
|---|---|---|---|
| 1 | "¿Cómo se llama tu meta?" | TextField título + EMOJI_PALETTE (12 opciones, 1 row scroll) | `'', '🎯'` |
| 2 | "¿Cuánto necesitás juntar?" | Display tappable → NumpadGrid on-demand | — |
| 3 | "¿En cuánto tiempo querés llegar?" | Chips 3/6/12/24 + custom (max 240) | `12` |
| 4 | "Revisá los detalles" | Resumen + CTA | — |

CTA del step 4 cambia a "Crear y aportar $X" cuando `suggestedInitialAmount > 0` (caso ReserveBlock "A una meta" sin goal previo — el wizard se abre con la reserva pre-armada).

### Chrome compartido

- Modal bottom-sheet con drag handle + drag-to-dismiss (`DISMISS_DISTANCE = 100`, `DISMISS_VELOCITY = 650`).
- Header: chevron-back (oculto en step 1) + progress dots + X close.
- Footer: `AppButton` primary full-width ("Continuar" / "Crear meta" / "Crear y aportar $N").
- Estado interno se resetea cuando `visible: false → true` — wizard arranca limpio cada vez sin que el caller tenga que pasar `key={...}`.

### Call sites (3)

| Surface | Cuándo | Notas |
|---|---|---|
| Control v2 alcancía — CTA "Crear meta" | sin goal en familia | path principal |
| ReserveBlock — "A una meta" sin goal | reserva > 0 + no hay goal | `pendingReserveAfterCreate` armado para aplicar aporte automático post-create |
| Onboarding | step opcional | crear meta inicial |

## Settings UX — read-only + lifecycle

[`mobile/screens/settings/savings-goal-screen.tsx`](../../mobile/screens/settings/savings-goal-screen.tsx). Antes: form completo de creación + edición. Ahora:

- **Si hay goal** (activo o inactivo, vía `useLatestSavingsGoal`):
  - `<MetaCard goal={goal} />` (mismo componente del Home)
  - Toggle "Activa / pausada" — flippea `is_active` con `useUpsertSavingsGoal`
  - "Eliminar meta" con confirm. Copy del confirm honesto: el row se borra de DB; los aportes históricos (`current_amount` snapshots) no migran a otro destino — están "consumidos" en cuanto a la trazabilidad de la app.
- **Si no hay goal**: empty state con redirect a Control v2 / Onboarding para crear via wizard.

## Activate inline desde Control

Si la familia tiene meta pausada (`is_active = false`), el alcancía card de Control v2 muestra el `MetaCard` con un CTA "Activar meta" inline (commit `dfce0ad`). Tap → upsert con `is_active: true` → la meta vuelve a aparecer en Home + se vuelve elegible para Spec B "meta" y para ReserveBlock "A una meta".

## Invalidaciones cross-mutation

`useUpsertSavingsGoal(familyId, userId)` — **crítico que se le pase `userId`**. Sin el `userId`, `syncAllAfterMutation` no puede invalidar `home_snapshot` (gated por userId) → la MetaCard nueva no aparecía hasta refresh manual.

Bug histórico (CR v3): el advisor host llamaba el hook sin userId. Fix: plumbear userId en TODOS los call sites (commits `d39e071` + `80cefbb`):

| Call site | Archivo |
|---|---|
| Wizard | [`create-savings-goal-wizard-sheet.tsx:139`](../../mobile/components/savings-goals/create-savings-goal-wizard-sheet.tsx) |
| Settings | [`savings-goal-screen.tsx:150`](../../mobile/screens/settings/savings-goal-screen.tsx) |
| Onboarding | [`onboarding-screen.tsx:124`](../../mobile/screens/home/onboarding-screen.tsx) |
| Control alcancía | [`control-v2-alcancia-card.tsx:117`](../../mobile/components/control-v2/control-v2-alcancia-card.tsx) |
| Advisor host | [`global-advisor-action-host.tsx:321`](../../mobile/components/control-v2/global-advisor-action-host.tsx) |

Scope de invalidación en `syncAllAfterMutation` para savings: incluye `savings-goal`, `savings-goal-latest`, `home-snapshot`, y el control intelligence query.

## Mutaciones que tocan `current_amount`

| Origen | RPC / Mutation | Notas |
|---|---|---|
| Aporte manual (botón "+" en MetaCard) | `useAddSavingsContribution` | suma local a `current_amount` |
| Spec B decisión `meta` | `apply_month_close_decision` (rama meta) | sobrante del cycle cerrado |
| Reserva → meta | `apply_reserve_decision` (target='meta') | parcial/total de la reserva |
| Edit manual desde Settings | `useUpsertSavingsGoal` | overwrite directo |

Todas invalidan `savings-goal` + `savings-goal-latest` para mantener Home/Control/Settings sincronizadas.

## Archivos relevantes

### Cliente — features

- Model + validación: [`mobile/features/savings-goals/savings-goal.model.ts`](../../mobile/features/savings-goals/savings-goal.model.ts)
- Repository: [`mobile/features/savings-goals/savings-goal.repository.ts`](../../mobile/features/savings-goals/savings-goal.repository.ts)
- Hook activo: [`mobile/features/savings-goals/use-savings-goal.ts`](../../mobile/features/savings-goals/use-savings-goal.ts)
- Hook latest (lifecycle): [`mobile/features/savings-goals/use-latest-savings-goal.ts`](../../mobile/features/savings-goals/use-latest-savings-goal.ts)
- Upsert: [`mobile/features/savings-goals/use-upsert-savings-goal.ts`](../../mobile/features/savings-goals/use-upsert-savings-goal.ts)
- Delete: [`mobile/features/savings-goals/use-delete-savings-goal.ts`](../../mobile/features/savings-goals/use-delete-savings-goal.ts)
- Aporte: [`mobile/features/savings-goals/use-add-savings-contribution.ts`](../../mobile/features/savings-goals/use-add-savings-contribution.ts)

### Cliente — UI

- Wizard sheet: [`mobile/components/savings-goals/create-savings-goal-wizard-sheet.tsx`](../../mobile/components/savings-goals/create-savings-goal-wizard-sheet.tsx)
- MetaCard (Home + Settings): [`mobile/components/home/meta-card.tsx`](../../mobile/components/home/meta-card.tsx)
- Quick-edit sheet (Control): [`mobile/components/control-v2/savings-goal-quick-edit-sheet.tsx`](../../mobile/components/control-v2/savings-goal-quick-edit-sheet.tsx)
- Settings screen: [`mobile/screens/settings/savings-goal-screen.tsx`](../../mobile/screens/settings/savings-goal-screen.tsx)

<!-- ✓ Sincronizado contra código el 2026-06-08 -->
