# Fijos: deuda por cuotas + editar sin rebobinar + días reales — diseño

**Fecha:** 2026-08-14 · **Estado:** aprobado en alcance por el owner (bundle de 3 fixes)
**Alcance:** solo cliente — cero migraciones, cero cambios en RPCs.

## Contexto

El "reinicio" de los fijos es emergente: `next_due_on` avanza únicamente al pagar
(`record_fixed_expense_payment`) y el cliente clasifica cada fijo contra la ventana de
accounting vigente (`computeItemStatus`, `fijos-aggregates.model.ts:175`). Ese modelo
tiene tres fallas, todas del lado del cliente — el backend ya hace lo correcto (la
identidad de cuota se ancla al vencimiento vía `period_month`, así que pagar repetido
salda las cuotas más viejas una por una, sin colisiones):

1. **Cuotas acumuladas invisibles e impagables.** `paidThisPeriod` gana sobre todo:
   tras pagar una cuota atrasada, el fijo salta a "Pagados" aunque `next_due_on`
   (ya avanzado) siga en el pasado. La deuda restante no se ve ni se puede pagar hasta
   el próximo ciclo → máximo una cuota de catch-up por ciclo. Además el hero cuenta el
   fijo vencido una sola vez, subestimando la deuda real.
2. **Editar rebobina el cursor.** El editor recalcula `next_due_on` con
   `buildNextDueOn(form.day)` también en edición (`add-fijo-v2-screen.tsx:226`): un
   fijo ya pagado este mes vuelve a la ocurrencia del mes actual → pendiente fantasma
   (re-pagar rebota por el UNIQUE del ledger). Es el CRITICAL del review de Fijos.
3. **"Vence en X días" falso en frecuencias no mensuales.** `daysUntilDue` opera sobre
   `day_of_month` con wrap mensual — nunca devuelve más de 31 días y para
   semanales/quincenales ignora `next_due_on`, que es la fecha exacta.

## Fix 1 — Deuda por cuotas, visible y pagable

### Espejo cliente de `advance` (prerequisito)

`commitment-date-utils.ts` tiene un espejo de `advance_fixed_expense_due_date` hoy
muerto y **divergente** (sin clamp de `day_of_month`). Se corrige para replicar el SQL
exacto: weekly +7 / biweekly +14 (ignoran ancla); monthly/quarterly/semiannual/annual
saltan y re-anclan a `day_of_month` clampado a los días reales del mes destino
(31 → feb 28/29 → **vuelve a 31** en marzo, porque se re-ancla desde el ancla, no desde
la fecha anterior). Tests de paridad con la semántica SQL.

### Modelo de cuotas vencidas

Función pura nueva (en `fijos-aggregates.model.ts` o módulo hermano):

```
computeMissedCuotas({ nextDueOn, frequency, dayOfMonth, today })
  → { count, periods: ISO[], oldestDue }
```

Itera desde `next_due_on` con el espejo de advance mientras la fecha sea `< hoy`.
`count` = cuotas vencidas acumuladas; `periods` = sus meses (para el CTA y microcopy).

### Clasificación: vencido gana sobre pagado

Nuevo orden en `computeItemStatus` (v5):

```
1. next_due_on < hoy               → 'overdue'   (aunque haya pago este ciclo)
2. paidThisPeriod                  → 'paid'
3. next_due_on >= cycleEnd         → last_paid_at ? 'paid' (cobertura) : 'future'
4. resto                           → 'pending'
```

Solo cambia la prioridad 1↔2; cobertura v4 y pending quedan intactos. Efecto lateral
deseado: un fijo semanal pagado la semana 1 cuyo siguiente vencimiento pasa sin pagarse
dentro del mismo ciclo ahora aparece vencido (hoy queda "pagado" todo el ciclo).

### UI (tab Vencidos)

- Card con `count > 1`: chip "Debés N cuotas" + monto adeudado = `count × amount`.
  Con `count == 1` se ve como hoy.
- CTA "Pagar cuota de {mes}" ({mes} = mes de `next_due_on`). Repetible: cada pago salda
  la más vieja, el contador baja, el fijo permanece en Vencidos hasta ponerse al día y
  recién entonces salta a Pagados. Toast con "Deshacer" por cuota, como hoy.
- Hero/summary: `overdueAmount` pasa a sumar `count × amount` por ítem vencido.
- Ticker: el literal 'VENCIDO' se mantiene; con `count > 1` agrega "· N cuotas".

### Optimistic update

`useRecordFixedExpensePayment.onMutate` además de `last_paid_at` avanza `next_due_on`
localmente con el espejo clampado. Así la reclasificación es coherente en el mismo
frame (sin el avance local, con el nuevo orden el fijo recién pagado y al día seguiría
overdue hasta el refetch). El insert optimista del payment row se conserva (sigue
cubriendo los paths no-overdue). Rollback: el snapshot existente de `onError` ya
restaura la lista completa.

### Deshacer con deuda

`revert_fixed_expense_payment` ya rebobina el cursor a la cuota revertida; el fijo
vuelve a Vencidos con el contador correcto. Sin cambios, solo test.

## Fix 2 — Editar no rebobina

En el path de edición, `next_due_on` deja de recalcularse desde "este mes":

- Día y frecuencia sin cambios → `next_due_on` se conserva tal cual.
- Cambió el día → se re-ancla **dentro del período vigente del cursor**: mismo
  año/mes de `next_due_on`, día nuevo clampado a ese mes.
- Cambió la frecuencia → igual que el punto anterior (el período vigente se conserva;
  la nueva frecuencia aplica a partir del próximo avance).

Regla de oro: editar no crea ni perdona deuda — si el cursor estaba en el pasado, sigue
en el pasado. Helper puro `rebaseNextDueOn(existing, newDay)` + tests (incluye clamp).
El alta no cambia (`buildNextDueOn` sigue siendo correcto para crear).

## Fix 3 — "Vence en X días" real

`daysUntilDue` pasa a ser diferencia calendario pura entre `next_due_on` y hoy
(UTC midnight, mismo criterio de comparación que `computeItemStatus`). Se elimina la
aritmética por `day_of_month`/wrap. Los ítems `future` no aparecen en tabs, así que los
valores grandes no ensucian la UI; los `pending` de cualquier frecuencia muestran el
número real. El chip "Próximo fijo" del Home (`home-next-fixed-helpers.ts`) se revisa
en el plan: si comparte la aritmética vieja, usa el mismo helper nuevo.

## i18n

Keys nuevas en `fijos` (ES + EN): "Debés {{count}} cuotas", "Pagar cuota de {{month}}",
sufijo de ticker "· {{count}} cuotas". Correr la suite completa de tests (regla del
repo para cambios de copy).

## Testing

- Paridad del espejo advance vs semántica SQL (mes corto 31→feb→mar, weekly/biweekly).
- `computeMissedCuotas`: 0/1/N cuotas, quincenal multi-miss, trimestral.
- `computeItemStatus` v5: los 5 casos existentes (`fijos-aggregates.test.ts`) +
  overdue-gana-sobre-paid + semanal con miss intra-ciclo.
- `rebaseNextDueOn`: sin cambios / cambia día / cambia frecuencia / cursor en pasado /
  clamp.
- Flujo optimista: pagar con 2 cuotas vencidas → queda overdue con count 1; pagar la
  última → paid.

## Fuera de alcance

- RPC server-side "ponerme al día" (bulk): se evalúa después si el catch-up de a una
  molesta en la práctica.
- Edge del ciclo extendido (fijo que vence dos veces en la ventana estirada): esperar
  el QA en device del ciclo extendido.
- Override de monto que persiste el precio (intencional por spec 2026-05-30) y el
  price history limitado a 3 puntos (cosmético).
