# Gastos fijos: recurrencia respetada + confirmación de precio · Design

> 2026-05-30 · Spec aprobada por brainstorming · Implementación: writing-plans

## Goal

Dos features atadas en el cluster de Gastos Fijos:

1. **Recurrencia respetada**: el listado principal solo debe mostrar fijos del ciclo actual (no aparece un trimestral en meses que no tocan). Vencidos de ciclos anteriores siguen visibles con badge de **mora**.
2. **Confirmación de precio**: al registrar el 2do pago en adelante, abrir sheet para confirmar el monto real (puede haber cambiado por aumento o intereses por mora). Capturar la diferencia con chip diferenciador.

## Non-goals

- **NO** calculamos interés de mora — cada empresa cobra diferente. Solo registramos lo que el usuario realmente pagó.
- **NO** agregamos tabla nueva de historial de precios. El historial se reconstruye desde `expenses` con `commitment_id` (patrón actual).
- **NO** cambiamos el `home_snapshot` RPC. Filtramos client-side para evitar invalidación de cache.
- **NO** tocamos la lógica de `advance_fixed_expense_due_date` (ya respeta `day_of_month` y todas las frecuencias).

## Arquitectura

### A. Filtrado por ciclo (Feature 1)

**Cambios concentrados en `fijos-aggregates.model.ts`.** Cuatro estados derivados en vez de tres:

```ts
type FijoItemStatus = 'paid' | 'due' | 'overdue' | 'future'
```

- `paid` — hay `FixedExpensePayment` para este `fixedExpenseId` dentro del ciclo actual.
- `due` — no pagado y `next_due_on` cae dentro de `[cycleStart, cycleEnd)`.
- `overdue` — no pagado y `next_due_on < cycleStart` (vencimiento de ciclos previos sin pagar).
- `future` — no pagado y `next_due_on >= cycleEnd` (no toca este ciclo).

`computeItemStatus` recibe ahora el `cycleStart`/`cycleEnd` además del `today`. El controller pasa el ciclo desde `usePayCycle`.

**Filtrado por tab**:

- Tab **Pendientes**: `due + overdue` (lo accionable).
- Tab **Pagados / Próximos**: `paid + future` (control de "qué pagué" y "qué viene").
- Tabs **Todos** y **Zombis** se retiran (zombis ya estaba deprecada).

`isZombie` se queda en `FijoItem` (sigue siendo `false`) por compatibilidad pero deja de filtrar; lo limpio en una pasada futura.

### B. Visual de mora (Feature 1, parte UI)

En `FijoRow`:
- Cuando `computedStatus === 'overdue'`: el `statusOverlay` (mini-badge sobre el iconTile) usa el ícono `warning` con tono `error` (rojo) en vez del `schedule` actual.
- El subtitle line ("Vence en 5d") se reemplaza por **"En mora · 12 días"** con `theme.colors.error` muted.
- El monto se mantiene del `fixed_expenses.amount` actual (no calculamos extra). El cambio real se captura al pagar.

### C. Sheet de confirmación de precio (Feature 2)

Nuevo componente `mobile/components/fijos/confirm-fixed-payment-sheet.tsx`:

**Trigger**:
- `useFijoPaymentCount(commitmentId)` (o derivado del payload existente) determina si es el 1er pago.
- 1er pago → ejecuta `recordPaymentMutation.mutate({ fixedExpenseId })` directo (path actual).
- 2do+ → abre el sheet.

**Layout** (sigue el `feedback_form_modal_pattern.md` — Screen scrollable + RiseView staggered + CTA inline):

```
┌─────────────────────────────────────┐
│  Confirmar pago                    × │
│  ─────────────────────────────────  │
│  [icon] Internet hogar              │
│         Último pago: $12.500 · marzo│
│                                     │
│  ┌─ Mismo monto · $12.500 ──── ✓ ┐ │   <- primario, default
│  └─────────────────────────────────┘ │
│  ┌─ Cambió ──────────────────────┐ │   <- secondary
│  └─────────────────────────────────┘ │
│                                     │
│  (si tocó "Cambió")                │
│  Monto pagado                       │
│  $ [12.500    ] ← input             │
│                                     │
│  Preview: +$1.500 · +12%            │   <- inline si difiere
│  [chip Aumento de precio]           │   <- o "Incremento con intereses" si overdue
│                                     │
│  [        Confirmar pago        ]  │
└─────────────────────────────────────┘
```

**Estados internos**:
- `mode: 'same' | 'changed'`
- `amountInput: string` (sincronizado con `mode === 'changed'`)
- `wasOverdue: boolean` (snapshot al abrir el sheet — se pasa como prop desde el item)

**Confirmar**:
- `same` → llama mutation con `amountOverride: undefined`.
- `changed` → llama mutation con `amountOverride: parsedAmount`.

### D. Cambios en la RPC (Feature 2, parte DB)

Migración nueva `20260530120000_record_fixed_payment_amount_override.sql`:

1. Agregar columna a `expenses`:
   ```sql
   ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_in_arrears boolean NOT NULL DEFAULT false;
   ```
2. Reemplazar `record_fixed_expense_payment` para aceptar nuevo parámetro:
   ```sql
   CREATE OR REPLACE FUNCTION record_fixed_expense_payment(
     p_fixed_expense_id uuid,
     p_amount_override numeric DEFAULT NULL
   ) RETURNS record AS $$
   DECLARE
     v_commitment record;
     v_payment_amount numeric;
     v_was_overdue boolean;
     v_period_month date;
     ...
   BEGIN
     -- ... load commitment
     v_was_overdue := v_commitment.next_due_on < CURRENT_DATE;
     v_payment_amount := COALESCE(p_amount_override, v_commitment.amount);

     -- si override + diferente, actualizar amount base
     IF p_amount_override IS NOT NULL AND p_amount_override <> v_commitment.amount THEN
       UPDATE fixed_expenses SET amount = p_amount_override, updated_at = now()
       WHERE id = v_commitment.id;
     END IF;

     -- crear expense con flag
     INSERT INTO expenses (..., price, paid_in_arrears, ...)
     VALUES (..., v_payment_amount, v_was_overdue, ...);

     -- resto idéntico
   END;
   $$;
   ```

Los callers existentes (cualquier RPC interno o trigger) siguen funcionando porque el parámetro tiene `DEFAULT NULL`.

### E. Tipos client + repositorio

- `mobile/features/fixed-expenses/fixed-expense.repository.ts`: `recordFixedExpensePayment(params: { id: string; amountOverride?: number })`.
- `mobile/features/fixed-expenses/use-fixed-expenses.ts`: `useRecordFixedExpensePayment` cambia la mutation a aceptar `{ fixedExpenseId, amountOverride? }`.
- `Expense` type: agregar `paid_in_arrears: boolean`.

### F. Chip diferenciador

En `FijoRow` y `FijosProximosCard` (`detectHikes`):
- Si el último expense del commitment tiene `paid_in_arrears = true` Y `trendDeltaPct > 0` → chip **"Incremento con intereses"** (color attention, ícono `alert`).
- Si solo `trendDeltaPct > 0` → chip **"Aumento de precio"** (color primary, ícono `trending_up`).
- Si `trendDeltaPct <= 0` o null → sin chip.

Reusa `TrendBadge` existente con prop nueva `variant: 'price' | 'arrears'`.

## Data flow

```
User toca "✓ Registrar pago" en FijoRow
  │
  ├─ ¿1er pago?
  │    └─ sí → recordPaymentMutation.mutate({ id })  ← path actual
  │
  └─ 2do+ pago
       └─ abre ConfirmFixedPaymentSheet
            │  (sheet computa wasOverdue del item)
            └─ User confirma
                 ├─ same    → mutate({ id, amountOverride: undefined })
                 └─ changed → mutate({ id, amountOverride: input })
                      │
                      └─ RPC record_fixed_expense_payment(id, amount)
                           ├─ actualiza fixed_expenses.amount si cambió
                           ├─ inserta expense con paid_in_arrears = wasOverdue
                           ├─ avanza next_due_on (lógica existente)
                           └─ retorna nuevo expense + payment
```

## Manejo de errores

- **Sheet → mutation**: error toast con retry (patrón existente de `syncAllAfterMutation`).
- **RPC**: si `p_amount_override <= 0` → reject con `EXCEPTION 'amount_override_must_be_positive'`. Sheet valida client-side antes de mandar.
- **Conflict** (pago duplicado, mismo `period_month`): RPC ya tira error por UNIQUE constraint en `fixed_expense_payments`. Mensaje: "Este pago ya fue registrado para este período".

## Testing

- **Unit (vitest)**: `computeItemStatus` con cada combinación (paid, due, overdue, future) — el módulo es puro, fácil de testear.
- **Unit**: `recordFixedExpensePayment` repository con `amountOverride` mockeado.
- **Manual**:
  1. Crear fijo trimestral con día 20. Pagar. Avanzar fecha simulada a +30d → debe estar oculto del tab "Pendientes", visible en "Pagados / Próximos".
  2. Crear fijo mensual. Pagar (1er pago, sin sheet). Pagar de nuevo (sheet aparece, default "Mismo monto"). Pagar otra vez con "Cambió" + monto mayor → ver chip "Aumento de precio".
  3. Crear fijo mensual. Esperar a overdue (simular). Pagar con monto mayor → chip "Incremento con intereses".

## Riesgos y trade-offs

| Riesgo | Mitigación |
|---|---|
| `home_snapshot` no incluye `paid_in_arrears` → primer render del chip viene tarde | El RPC retorna el nuevo expense con la columna; el optimistic update lo setea. Reload de snapshot lo persiste. |
| Usuarios con fijos existentes y `next_due_on` desactualizado por bugs anteriores | Migración no toca datos existentes. Si hay drift, el user puede editar el fijo. |
| El check "1er pago" depende del query de expenses del commitment | Usamos el `expenses` ya en cache del snapshot. Función pura `isFirstPayment(commitmentId, expenses)`. |

## Resumen de archivos

**Nuevos:**
- `supabase/migrations/20260530120000_record_fixed_payment_amount_override.sql`
- `mobile/components/fijos/confirm-fixed-payment-sheet.tsx`

**Modificados:**
- `mobile/features/fijos/fijos-aggregates.model.ts` — `computeItemStatus` con 4 estados + ciclo
- `mobile/features/fijos/use-fijos-controller.ts` — pasar `cycleStart`/`cycleEnd` a aggregates
- `mobile/features/fixed-expenses/fixed-expense.repository.ts` — `amountOverride` param
- `mobile/features/fixed-expenses/use-fixed-expenses.ts` — mutation acepta `amountOverride`
- `mobile/features/fixed-expenses/fixed-expense.types.ts` — `paid_in_arrears` en `Expense`
- `mobile/components/fijos/fijo-row.tsx` — badge mora + chip diferenciador
- `mobile/components/fijos/fijo-trend-badge.tsx` (o donde viva) — `variant: 'price' | 'arrears'`
- `mobile/components/fijos/fijos-tabs.tsx` (o similar) — 2 tabs en vez de 4
- `mobile/screens/home/fijos-v2-screen.tsx` — cablear sheet
- `mobile/features/fijos/fijos-aggregates.model.ts` — `detectHikes` considera `paid_in_arrears`
- `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/03-home-control-fijos.md` — sync
- `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/07-backend-servicios-db.md` — RPC change

**Eliminados (cleanup):**
- Tab "Todos" y "Zombis" de `FijosTab` enum (si existe).
