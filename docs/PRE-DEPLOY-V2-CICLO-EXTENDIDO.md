# PRE-DEPLOY V2 · Feature "Ciclo extendido"

> **Estado:** ✅ **INTEGRADO** — backend (5 migraciones, dormantes) + cliente V2.
> **Fecha del análisis original:** 2026-07-28 · Validado contra la cuenta del owner en prod.
> **Fecha de la integración:** 2026-08-13 · Estrategia de coexistencia con el build de producción.
> **Pendiente:** aplicar las migraciones a prod (`supabase db push`) + QA en device.

---

## 1. El problema

Cuando pasa el día de cobro y el usuario **no confirma** que cobró, la app **congela**
la ventana del ciclo en el período anterior. Todo gasto cargado a partir de ese día queda en
un **limbo**: se guarda en la base, pero **no resta del saldo** que el usuario ve.

Peor: la actividad de la Home usa `useRecentExpenses(familyId, limit = 3)` — **"últimos N",
sin filtro de ciclo** — así que el gasto **SÍ aparece** en la lista mientras el saldo lo
ignora. Dos widgets de la misma pantalla diciendo cosas distintas. Ese es el síntoma que
reportó el owner: *"parece sumarse, pero nunca se resta"*.

### Caso real verificado (familia `61bdc187-…`, payday 20, fixed/monthly)

| | Ventana | Días | Fijos | **Saldo** |
|---|---|---|---|---|
| Hoy (congelado) | 20-jun → 20-jul | 30 | 1.200.482 | **1.277.211** |
| Con ciclo extendido | 20-jun → hoy | 39 | 1.310.482 | **1.167.211** |

La diferencia (110.000, el fijo "Cochera" del 20-jul) es exactamente lo que hoy queda en limbo.

> **Precisión del 2026-08-13:** el gasto en limbo **no se pierde**. Al confirmar, el build
> actual libera el freeze y ese gasto cae dentro de la ventana del ciclo NUEVO, donde sí
> resta. El bug es de **atribución** (sale del ciclo equivocado según el modelo del owner)
> y de **UX** (durante la extensión no resta de nada visible), no de plata perdida ni
> duplicada.

---

## 2. El modelo correcto (decisión del owner)

> **No cobraste ⇒ no hay ciclo nuevo.** La plata que gastás sale de lo que quedaba del
> ciclo actual, que **se está estirando** hasta que confirmes.

```
Ciclo 1:  [20-jun ────────── 20-jul ─── 28-jul)     ← cierra al confirmar
                            nominal    real (39 días)
Ciclo 2:  [28-jul ─────────────────────── 20-ago)   ← arranca donde terminó el anterior
```

- El ciclo nuevo arranca en la **fecha de confirmación** y termina en el **próximo payday
  configurado** (respetando siempre el ancla del usuario, el día 20).
- Si el ciclo 2 también se estira: `[28-jul → 25-ago)` y el siguiente `[25-ago → 20-sep)`.

**Propiedad que hace sólido el modelo:** los ciclos quedan **contiguos, sin huecos ni
solapamientos** — cada gasto pertenece a exactamente un ciclo. Con retraso crónico de 8 días
se estabiliza en ciclos de 23 días + 8 de extensión = 31. No se pierde ni se duplica un día.

**Efecto secundario correcto:** en un ciclo de 23 días el cupo diario sube (cobraste un mes
entero pero tenés menos días hasta el próximo cobro).

---

## 3. La estrategia de coexistencia (2026-08-13)

El análisis original decía que las dos mitades tenían que salir juntas, con reship
coordinado. **Eso resultó innecesario.** El backend puede salir AHORA, dormante, y cada
usuario hace su propio cutover cuando el build V2 le llegue.

### 3.1 El gate: `family_finance.cycle_model`

```
'nominal'  → comportamiento actual, byte por byte.  ← default; TODAS las familias hoy
'extended' → el ciclo se estira hasta la confirmación del cobro.
```

**Solo el cliente V2 lo escribe**, y lo hace en el mismo upsert que estampa la confirmación
del cobro. El cliente de producción **no puede** escribirlo ni pisarlo: su upsert de
`family_finance` arma el body con una lista FIJA de campos (destructuring explícito en
`financeInputToStoragePayload`), nunca un spread del row.

El cierre lo dispara un trigger `AFTER UPDATE` sobre `family_finance`, así que ve el flag
y el anchor **en la misma transacción** que la confirmación → el primer cierre extendido
sale en el instante del confirm, sin migración adicional ni coordinación de deploy.

### 3.2 Por qué NO se puede arreglar el limbo para el build actual

Se evaluó y se descartó con evidencia:

- **El saldo congelado es 100% cliente.** No existe palanca de servidor que lo mueva.
- **Archivar la extensión hoy haría OSCILAR el saldo en producción.** El build actual tiene
  dos caminos de datos con filtros opuestos: `home_snapshot` siembra la cache **excluyendo**
  archivados, mientras el refetch de `useExpenses` → `loadExpenses` **no filtraba**
  `archived_at`. Si el cierre archivara los días de extensión, el saldo saltaría entre dos
  números según qué query ganara la carrera — en un build congelado y sin OTA.
  *(Ese bug de oscilación se arregló en el cliente V2; ver §5.)*

Alternativas descartadas (**no reintentar**):

- **`cycle_type='custom'` con `length_days` creciendo por cron**: desactiva el freeze → el
  usuario nunca vuelve a ver el prompt "¿Ya cobraste?".
- **Back-datear los gastos**: corrompe el registro.
- **Clamp global por `max(period_end)` en la rama nominal** (idea del diseño inicial):
  producción tiene familias `dynamic` con summaries **legítimamente solapados** (un mensual
  viejo + semanales encima). Con ese clamp, cerrar `[08-may → 15-may)` daba `window_empty`
  y **el ciclo no cerraba**. La rama nominal usa los params tal cual, sin excepción.

---

## 4. Las migraciones (todas escritas, aplicadas y probadas en local)

| Archivo | Qué hace | ¿Mueve números hoy? |
|---|---|---|
| `20260813120000_extended_cycle_schema.sql` | `monthly_summaries.nominal_period_end` + `family_finance.cycle_model` | No (aditiva) |
| `20260813120100_close_monthly_cycle_dual_mode.sql` | Cierre dual-mode con encadenado por `period_end` | No (rama nominal idéntica) |
| `20260813120200_cycle_disponible_extended_window.sql` | Ventana extendida en el espejo server del saldo (push) | No¹ |
| `20260813120300_home_snapshot_extended_window.sql` | Ventana extendida + `nominal_period_end` en el history | No |
| `20260813120400_compute_pay_cycle_clamp_payday.sql` | **Fix del día 31** — archivo aparte | **SÍ**, ver §4.2 |

¹ Salvo el filtro `archived_at` de la CTE `press` — ver §4.3.

### 4.1 `close_monthly_cycle` dual-mode

- **Rama nominal:** `v_start/v_end` = los params. Sin clamp (ver §3.2).
- **Rama extended:** `v_start` = `max(period_end)` de los summaries que terminan **en o antes**
  del fin nominal de este ciclo (el filtro evita que un summary histórico solapado envenene
  el arranque), con piso a `p_period_end − 185`. `v_end` = `current_cycle_anchor` (fuente
  primaria; fallback a `last_salary_confirmed_at` en tz AR), con techo a `p_period_end + 185`.
- Guards 0/1/2 e idempotencia **intactos**, evaluados sobre los params nominales.
- `nominal_period_end` se escribe **siempre** (dual-write; en nominal coincide con `period_end`).
- `p_force` desactiva el modo extendido → el operador honra los params que pasa.
- **Ojo (drift del ledger):** esta redefinición parte del cuerpo **deployed**, no del archivo
  `20260708202341` del repo. La diferencia es el ancla de tz AR de `daily_totals`, que
  `20260722174332` aplica por text-patch sobre la definición viva. Partir del archivo del
  repo **regresaría** ese fix.

### 4.2 Fix del día 31 — dos bugs, no uno

`compute_pay_cycle` tenía **dos** defectos en el régimen mensual, ambos corregidos:

1. **La comparación de rama usaba el payday sin clampear.** Con día 31 y `p_today = 30-jun`,
   `30 >= 31` es falso → devolvía `[31-may → 30-jun)`, ventana que **no contiene** el día
   consultado.
2. **El fin del ciclo se derivaba del día ya clampeado** (`cycle_start + 1 mes`). Con día 31,
   `cycle_start` de junio es el 30 y el fin salía 30-jul… pero el payday de julio es el 31,
   así que `[30-jun → 30-jul)` dejaba al 30-jul **sin ciclo**.

Ambos se corrigen espejando lo que el cliente ya hacía con `buildPayDate`, así que el fix
**aumenta** la paridad app↔server. Verificación exhaustiva: 2 años × 31 paydays →
**0 ventanas que no contengan el día**, **0 no-contiguas**, **0 cambios** para payday ≤ 28.
Exposición viva: 2 familias en prod (payday 29 y 31).

### 4.3 El filtro `archived_at` de la CTE `press`

`press` (presión de fijos) no filtraba archivados, a diferencia de `spend`. Es un bug latente:
un pago ya contabilizado en un cierre podía volver a pesar en una ventana viva.
**No es un no-op universal.** Banco de pruebas de 120 familias sintéticas × 40 fechas:

| | filas | diferencias vs. función deployed |
|---|---|---|
| sin archivado en ventana viva | 4800 | **0** |
| con archivado en ventana viva | 4800 | 88 |

Se verificó que **ninguna de las 57 familias de prod** tiene hoy un gasto archivado con
`commitment_id` dentro de su ventana viva, así que el filtro no puede mover un número.
Se agrega por simetría y porque el archivado extendido hace más probable ese solape a futuro.

---

## 5. El cliente V2 (rama `feat/ui-redesign`)

| Archivo | Cambio |
|---|---|
| `mobile/utils/pay-cycle.ts` | `ExtendedCycleContext` + rama extendida en `computeMonthAnchored` + `financeToExtendedCycleContext` |
| `mobile/utils/monthly-accounting.ts` | Propaga el contexto a la ventana de accounting |
| `mobile/hooks/use-pay-cycle.ts` · `use-monthly-accounting.ts` | Leen `cycle_model` / `current_cycle_anchor` |
| `mobile/features/family/family-dashboard-model.ts` | `cycleAnchorTarget` = **hoy** durante la extensión (ver abajo) |
| `mobile/features/finance/family-finance.model.ts` | Tipo + mapeo + `cycleModel: 'extended'` en las dos rutas de confirmación |
| `mobile/features/finance/family-finance.repository.ts` | Columna opcional con retry defensivo |
| `mobile/features/expenses/use-expenses.ts` · `expense-repository.ts` | **`excludeArchived` unificado** + `archived_at` en las columnas |

**`cycleAnchorTarget` en modo extendido** hace dos cosas al precio de una: mientras el cobro
está pendiente vale **hoy**, así que (1) nunca coincide con el anchor guardado → el prompt
"¿Ya cobraste?" sigue apareciendo, y (2) es el valor que se **escribe** al confirmar, o sea
la fecha en que arranca el ciclo nuevo — la misma frontera que el servidor usa como
`period_end` real del ciclo que se estiró.

**La pantalla de Gastos se adapta sola.** El calendario de días "fuera de ciclo" se deriva de
`controller.cycleEnd`; en modo extendido esa ventana ya llega hasta hoy, así que
`outWindow` colapsa a vacía y esos días pasan a ser días normales del ciclo (que ahora sí
restan). El banner de "¿Ya cobraste?" sigue apareciendo, que es lo correcto.

---

## 6. Verificación corrida

- **Comportamiento dual-mode** (DB local, caso real del doc): nominal cierra
  `[20-abr→20-may)` con 50.000; extended cierra `[20-abr→`**`28-may`**`)` con **160.000**.
  Ciclo siguiente: nominal `[20-may→20-jun)` con 110.000; extended encadena desde el
  **28-may** con 0. **Suma idéntica (160.000) en ambos mundos → el gasto se cuenta
  exactamente una vez.** Contigüidad, archivado e idempotencia verificados.
- **Regresión de la rama nominal:** la familia `dynamic` con summaries solapados cierra
  normal; una familia nominal con hueco histórico **no** lo absorbe (cero cambio observable);
  la misma familia en modo extended **sí** lo absorbe.
- **Paridad `cycle_disponible`:** md5 normalizado de la reconstrucción "vieja" **idéntico**
  al de la función deployed en prod → la comparación es válida. 4800 filas, **0 diferencias**.
- **`compute_pay_cycle`:** barrido exhaustivo, 3 propiedades, 0 violaciones (§4.2).
- **Cliente:** `tsc --noEmit` limpio · **179 archivos de test / 1799 tests, todos pasando**
  (13 nuevos en `tests/unit/pay-cycle-extended.test.ts`) · bundle de Metro exportado OK.

---

## 7. Qué falta

- [ ] **Aplicar las migraciones a prod.** El ledger está **alineado** (288 aplicadas, todas
      con archivo local — la nota histórica de "61 desalineadas" quedó obsoleta). Hay **8**
      pendientes: las 5 de esta feature más 3 preexistentes del 4-5 de agosto
      (`advisor_push_variable_conflict_parity`, `cron_schedule_parity`,
      `dispatch_orchestrator_url_por_ambiente`) que se aplicarían en la misma pasada.
      **Nunca por MCP** (re-estampa el timestamp): va por `supabase db push`.
- [ ] Correr primero en **staging** (`loyhlbemrrcenwejfsfq`) y verificar paridad.
- [ ] Sign-off del owner para la migración del día 31 (§4.2), que sí mueve números para
      2 familias.
- [ ] QA en device del timeline completo con una familia flaggeada.
- [ ] UI: pintar los días de extensión de un ciclo **cerrado** usando `nominal_period_end`
      (el dato ya viaja en el snapshot; falta el dibujo).
- [ ] UX del alta de gasto durante la extensión (*"Guardado · resta de este ciclo"*).

### Deuda diferida (análisis propio, no bloquea)

- Backfill de ventanas huérfanas históricas de familias que queden en nominal.
- Normalización per-día de `delta_vs_previous_percent` / "Vs mes pasado" / sparkline para
  ventanas de largo desigual (39 vs 23 días).
- Gating del título short-period del Wrapped (`< 21 días`) para el ciclo corto post-extensión.
- Runbook de operador: `p_force` sobre un summary extendido debe pasar la ventana **real**
  leída del row, y pasados 14 días del archivado el purge ya borró los gastos variables.
- Unificación de la frontera de tz del archivado (sliver 21:00–23:59 AR, preexistente).

---

## 8. Contexto relacionado

- **Ya aplicado (2026-07-27)**: migración `cycle_disponible_freeze_salary_pending` — alineó el
  push con la app. **No** resuelve el limbo; solo la paridad app↔push. La migración
  `20260813120200` extiende esa misma función.
- `apply_month_close_decision` **ignora** `p_new_cycle_anchor` (solo lo loguea) y la fórmula
  del sobrante ya es la corregida desde 2026-06-15 → **no** requiere cambios para esta feature.
- `try_close_previous_cycle` **no se toca**: sigue proponiendo ventanas nominales. El
  encadenado vive dentro de `close_monthly_cycle`.
