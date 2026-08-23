# Fijos · "Primera cuota" en el alta — diseño

**Fecha:** 2026-08-23 · **Aprobado por:** owner (chat) · **Estado:** aprobado

## Problema

`buildNextDueOn(day)` devuelve SIEMPRE la ocurrencia de ESTE mes (decisión
2026-05-30 para que "ya pagué" no saltara dos meses). Crear un fijo con día 5
cualquier día posterior al 5 lo hace nacer VENCIDO con "Debes 1 cuota", sin
forma de decir "arranca el próximo 5". El único escape — el toggle "Ya pagué
la cuota más reciente" — registra un pago real (pesa en el gasto del ciclo);
y los planes en cuotas ni siquiera lo tienen.

## Decisión de producto (owner)

El usuario elige la **primera cuota entre dos FECHAS CONCRETAS**, no entre
abstracciones "este mes / este ciclo":

```
PRIMERA CUOTA
[ 5 de agosto · venció hace 18 días ]   [ 5 de septiembre ]
```

- Opción 1 = ocurrencia del período en curso (la regla actual).
- Opción 2 = la siguiente ocurrencia según la frecuencia
  (`advanceFixedExpenseDueDate`: +1 mes re-anclado al día, +7 semanal,
  +14 quincenal, +3/+6/+12 meses).
- Sufijo honesto en la opción 1: "venció hace N días" / "hoy" / "en N días".
- **SIN preselección y BLOQUEANTE** (iteración del owner tras el QA en
  device, 2026-08-23 — reemplaza al default inteligente del diseño
  original): el selector arranca vacío, el CTA del paso 2 no abre sin la
  elección (label "Elige la primera cuota" + aviso clay en el bloque, como
  el día y la frecuencia), y cambiar el día o la frecuencia RESETEA la
  elección — las dos fechas cambiaron, la decisión vieja no puede viajar
  al INSERT. Debajo del selector, un prompt "Elige cuándo cae la primera
  cuota." hasta que decide.
- Debajo, una línea dice en qué ciclo cae la elegida: "Impacta en este ciclo"
  o "Impacta a partir del próximo ciclo · no reserva cupo de este".
  **Ciclo extendido**: el hint se SUPRIME (el fin nominal ya pasó y el fin
  real se corre día a día — cualquier frase de ciclo sería falsa mañana).
  Las fechas del selector no dependen del ciclo y siguen exactas.

## Interacciones

- **"Ya pagué la cuota más reciente"**: compatible con la opción 1 (registra
  el pago del período en curso y el cursor avanza solo). Con la opción 2 el
  toggle se OCULTA y su valor se ignora en el submit (no hay cuota que pagar).
- **Cuotas (installments)**: el selector aplica igual — les da el escape que
  hoy no tienen. `installments_paid` arranca en 0 en ambos casos.
- **Edición**: SIN selector. La regla de oro "editar no crea ni perdona
  deuda" (`rebaseNextDueOn`) queda intacta.
- **Quick-add del Asesor** (`global-advisor-action-host`): sigue creando
  "vence hoy". Anotado como deuda, fuera de alcance.

## Visibilidad del fijo "futuro" (trampa resuelta con la feature)

Un fijo con `next_due_on >= cycleEnd` y sin pagos clasifica `future` y hoy no
entra en NINGUNA tab (desaparece de la lista hasta que llegue su ciclo). Con
la feature esto pasa de esquina rara a camino principal, así que: los `future`
entran en la tab **Pendientes** (se mantienen las 3 tabs, decisión owner),
con detalle "Próximo ciclo · {{fecha}}", ordenados después de los pendientes
del ciclo. Siguen EXCLUIDOS del total del hero (que es de este ciclo), del
chip del Home y de la reserva de cupo — eso ya es correcto.

## Lo que NO cambia (verificado en código, 2026-08-23)

- **Backend: cero migraciones.** No existe RPC de alta (INSERT directo por
  PostgREST y `next_due_on` viaja en el payload). `cycle_disponible` reserva
  sólo si `next_due_on < cycle_end`; `record_/revert_fixed_expense_payment`,
  `home_snapshot` y `list_pending_notifications` ya interpretan bien un
  cursor futuro. `period_month` del primer pago queda estampado con el mes
  del vencimiento elegido — coherente sin tocar nada.
- Clasificación v5 (vencido gana sobre pagado), `computeMissedCuotas`,
  `capMissedCuotas` y la divergencia hero-vs-cupo preexistente.

## Alcance técnico

1. `add-fijo-helpers.ts` — `buildNextDueOn(day, now?)` (now inyectable),
   `buildFirstCuotaOptions(day, frequency, now?)`,
   `defaultFirstCuotaChoice`, `resolveFirstDueOn`. Convención de "hoy"
   idéntica a la del clasificador (medianoche local → UTC).
2. `use-add-fijo-form.ts` — estado `firstCuotaChoice` (pick explícito sticky,
   default derivado del día elegido).
3. `add-fijo-v2-screen.tsx` — submit usa `resolveFirstDueOn` en alta; el
   encadenado de "ya pagué" se gatea a `choice === 'current'`.
4. `step2-summary.tsx` — radiogroup de 2 chips (kit `DayChips` ampliado a
   ids string) dentro del bloque "SE AGENDARÁ EN" + hint de ciclo.
5. `use-fijos-controller.ts` / vista — `future` entra al bucket Pendientes
   con su detalle propio.
6. i18n es/en (tuteo, paridad): eyebrow, labels con fecha, hint de ciclo,
   a11y, detalle de lista.
7. Tests: helpers (ambas ramas, clamp, cruce de año, semanal/anual, default),
   placement de ciclo (nominal en extendido), controller (future en
   Pendientes). Suite completa por cambio de copy.

## Riesgos aceptados

- Sub-mensuales: "la siguiente" para weekly/biweekly es +7/+14 días — puede
  caer en el mismo mes (la identidad `period_month` mensual ya limita el
  multi-pago ahí; sin cambio).
- `compute_control_snapshot` prorratea todos los `active` sin mirar
  `next_due_on` (un fijo futuro ya resta en `v_libre` del Control hoy);
  preexistente, no lo toca esta feature.
