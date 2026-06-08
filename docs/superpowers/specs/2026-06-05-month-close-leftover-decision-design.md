# Decisión sobre el saldo a favor del cierre del mes — Design Spec (Spec B)

**Fecha**: 2026-06-05
**Branch**: `feature/month-close-leftover-decision`
**Predecesor**: Spec A.5 (`2026-06-05-monthly-accounting-reframe-design.md`) — mergeada en `304ca5f`.
**Estado**: Aprobado para implementación.

---

## 1. Objetivo

Cuando un mes financiero cierra con saldo positivo (`monthly_income - fijos - ahorro - gastos > 0`), preguntarle al usuario qué hacer con ese sobrante. 3 opciones:

1. **Enviarlo a una meta de ahorro** (si tiene meta activa; si no, crearla inline)
2. **Acumularlo al saldo del próximo mes** (queda como extra disponible)
3. **Guardarlo en reserva** (concepto nuevo: pozo sin destino concreto)

**Por qué**: hoy el sobrante se "diluye" en el próximo ciclo sin que el user note. Forzar una decisión activa al cierre alinea con el patrón mental del user dummy ("se me acabó el mes, ¿qué hago?").

## 2. Trigger

**Cuando el cliente detecta que hay un cierre de mes pendiente sin decisión.**

Detección on-app-open (Home mount):
1. Compute `lastMonthWindow = monthlyAccounting del mes anterior`
2. Si `today >= lastMonthWindow.end`: hay un mes cerrado.
3. Compute `sobrante = monthlyIncome - fijos_del_mes - savings_aportado_del_mes - gastos_del_mes`.
4. Si `sobrante >= UMBRAL` (~$1000 AR, configurable) Y `no existe month_close_decisions row para (family, lastMonthIso)` → mostrar sheet.

## 3. Modelo de datos

### 3.1 Nueva tabla `month_close_decisions`

```sql
create table public.month_close_decisions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  /** YYYY-MM-01: primer día del mes que se está cerrando. */
  month_iso text not null check (month_iso ~ '^\d{4}-\d{2}-\d{2}$'),
  /** Monto computado del sobrante al momento de la decisión. */
  sobrante numeric(12,2) not null check (sobrante >= 0),
  decision text not null check (decision in ('meta', 'acumular', 'reserva', 'skip')),
  /** Solo cuando decision='meta'. Apunta al goal donde se aportó. */
  meta_goal_id uuid null references public.savings_goals(id) on delete set null,
  decided_at timestamptz not null default now(),
  decided_by uuid not null references auth.users(id),
  unique(family_id, month_iso)
);

alter table public.month_close_decisions enable row level security;

create policy "family members read"
  on public.month_close_decisions for select
  using (
    exists (
      select 1 from public.family_members fm
      where fm.family_id = month_close_decisions.family_id
        and fm.user_id = auth.uid()
        and fm.role <> 'blocked'
    )
  );

create policy "family members insert"
  on public.month_close_decisions for insert
  with check (
    exists (
      select 1 from public.family_members fm
      where fm.family_id = month_close_decisions.family_id
        and fm.user_id = auth.uid()
        and fm.role <> 'blocked'
    )
    and decided_by = auth.uid()
  );
```

**`skip` decision**: si el user cierra el sheet sin elegir, se persiste con `decision='skip'` para que NO se vuelva a mostrar ese mes. Permite reabrirlo manualmente desde Settings → "Cierres pendientes" (out of scope V1).

### 3.2 Columna `monthly_reserve_amount` en `family_finance`

```sql
alter table public.family_finance
  add column if not exists monthly_reserve_amount numeric(12,2) not null default 0
    check (monthly_reserve_amount >= 0);
```

**Por qué columna y no tabla**: para V1 la reserva es un pozo monolítico que solo crece (sobrantes acumulados). No tracking histórico por mes. Una columna alcanza. Tabla `family_reserves_ledger` puede venir en fase 2 si demanda historial.

### 3.3 Cuando el user elige una opción

| Decision | Acción DB |
|---|---|
| `meta` | INSERT en `savings_goal_contributions` (la tabla existente) con `amount=sobrante`, `goal_id=meta_goal_id`. + INSERT en `month_close_decisions`. |
| `acumular` | UPDATE `family_finance.current_cycle_starting_balance = current_cycle_starting_balance + sobrante` (o setea si era null) + UPDATE `current_cycle_anchor = today's monthly.start`. + INSERT en `month_close_decisions`. |
| `reserva` | UPDATE `family_finance.monthly_reserve_amount = monthly_reserve_amount + sobrante`. + INSERT en `month_close_decisions`. |
| `skip` | Solo INSERT en `month_close_decisions`. |

## 4. Cómputo del sobrante (cliente)

```ts
// mobile/utils/month-close-sobrante.ts
import type { Expense } from '@/features/expenses/expense-repository.model'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'

export interface MonthCloseSobranteInput {
  lastMonthStart: Date
  lastMonthEnd: Date           // exclusive
  monthlyIncome: number
  expenses: Expense[]
  commitments: FixedExpense[]
  savingsContributedThisMonth: number
}

export function computeMonthCloseSobrante(input: MonthCloseSobranteInput): number {
  const inWindow = (d: Date) => d >= input.lastMonthStart && d < input.lastMonthEnd
  const gastos = input.expenses
    .filter((e) => inWindow(new Date(e.created_at)))
    .reduce((acc, e) => acc + Number(e.price), 0)
  // Fijos del mes pasado: los que tenían next_due_on en ese mes — pero la
  // mejor proxy es "expenses con commitment_id en la ventana". Sino el
  // payments table directo. V1: usamos expenses (lo que efectivamente
  // salió).
  return Math.max(
    0,
    input.monthlyIncome - gastos - input.savingsContributedThisMonth,
  )
}
```

## 5. UI — `MonthCloseDecisionSheet`

### 5.1 Estructura

`ModalCard` (patrón establecido en Settings sheets) con:

1. **Header**: "Cerraste el mes pasado con $X a favor"
2. **3 opciones grandes** (cards seleccionables):
   - 🎯 "A tu meta" → si tiene meta activa: "Sumar a [nombre meta]"; si no: "Crear una meta"
   - 📥 "Acumular" → "Sumar al saldo de este mes"
   - 🏦 "Reserva" → "Guardar aparte"
3. **CTA "Confirmar"** (disabled hasta que elija una)
4. **Botón texto pequeño "Decidir más tarde"** → triggera `skip` decision

### 5.2 Flow inline si no tiene meta

Si el user tap "A tu meta" Y no tiene `savings_goal.is_active = true`:
- El card se expande con un mini-form: input título + input monto objetivo + número de meses target.
- Tap "Confirmar" crea la meta + aporta el sobrante en la misma transacción.

### 5.3 Surface

Render desde el árbol del Home tras `onAppOpen` o `useEffect` que detecte el trigger. NO desde Settings.

## 6. Surfaces secundarias

| Surface | Cambio |
|---|---|
| Home metric card "Reserva" | Nueva card chica que muestra `monthly_reserve_amount` si > 0. Sin ella si = 0. |
| Settings → Finanzas familiares | Nueva fila "Reserva" con el monto + tap → sheet para retirar manualmente (V1: solo display, retiro en V2). |
| Asistente / signals | Signal nuevo "Cierre de mes pendiente — tenés $X sobrante" si hay decisión pendiente |

## 7. Edge cases

- **Sobrante negativo (cerraste en rojo)**: NO prompt. La columna check `sobrante >= 0` rechaza el INSERT.
- **Sobrante > 0 pero < umbral ($1000)**: NO prompt. Cifras chicas no valen interrupción. Esos pesos se acumulan implícitamente al saldo del próximo mes (comportamiento default).
- **User cierra app sin decidir**: NO se persiste skip hasta que tap "Decidir más tarde" explícito. Si solo cierra app, vuelve a aparecer próxima sesión.
- **Family con 2+ miembros**: cualquier miembro puede tomar la decisión. La unique constraint `(family_id, month_iso)` previene doble-aportar.
- **2 meses sin decidir** (user no abrió la app por mucho)**: el sheet pregunta por el MÁS reciente. Los más viejos quedan como pendientes; podemos mostrar contador en Settings (V2).
- **Cambió cycle_type en el medio**: el cómputo de `lastMonthWindow` usa el `monthlyAccounting` del mes pasado, que para monthly user usaba el salary cycle, para non-monthly usa calendar month. Coherente.

## 8. Testing

### 8.1 Unit

- `month-close-sobrante.test.ts`: 5 casos = sobrante positivo grande, exacto al umbral, sub-umbral, negativo (sin ahorro), con savings contribución registrada.

### 8.2 Integration (linked DB)

- Seed family con `monthly_income=1.000.000`, expenses por $700k en el mes pasado.
- Verificar via RPC que `month_close_decisions` está vacío para `(family, lastMonth)`.
- Insertar `month_close_decisions` con `decision='reserva'` → verificar `monthly_reserve_amount += 300k`.
- Insertar `decision='meta'` con `meta_goal_id` → verificar `savings_goal_contributions` row.

### 8.3 Manual smoke

- Cuenta monthly con cycle.end < today: verificar que aparece el sheet al abrir Home.
- Tap "A tu meta" sin tener meta: form inline aparece.
- Tap "Reserva" → confirmar → Settings muestra el monto.
- Tap "Decidir más tarde" → sheet cierra → re-abrir Home → no vuelve a aparecer (esa decisión queda como skip).

## 9. Out of scope V1

- Retiro de la reserva desde Settings (solo display)
- Historial de cierres pasados (lo más reciente only)
- "Cierres pendientes" centralizado en Settings
- Notificación push cuando cruza fin de mes
- Distribución parcial (ej: 60% a meta, 40% a reserva)

## 10. Próximos pasos

1. Self-review.
2. Plan + tasks.
3. Subagent execution.
4. E2E suite update.
5. Merge a main.
