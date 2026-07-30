# PRE-DEPLOY V2 · Feature "Ciclo extendido"

> **Estado:** ⏸️ DISEÑADO Y VALIDADO, **sin implementar**.
> **Gate:** debe salir **con el build V2** (rediseño). No puede salir antes.
> **Fecha del análisis:** 2026-07-28 · Validado contra la cuenta del owner en prod.

---

## 1. El problema

Cuando pasa el día de cobro y el usuario **no confirma** que cobró, la app **congela** la
ventana del ciclo en el período anterior. Todo gasto cargado a partir de ese día queda en
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

## 3. Qué hay que cambiar

### 3.1 Cliente (⚠️ **por esto necesita build**)

El saldo se calcula **íntegramente en la app** — el servidor solo lo replica para el push.

- `mobile/utils/pay-cycle.ts` → `computeMonthAnchored`: con el cobro pendiente, la ventana
  **se extiende hasta hoy** en vez de congelarse en `payday_this`.
- `mobile/features/family/family-dashboard-model.ts` → la ventana de accounting y el
  `cycleAnchorTarget` acompañan el modelo nuevo.
- El ciclo nuevo arranca en la **fecha de confirmación** (hoy `current_cycle_anchor` guarda
  el payday).

### 3.2 Backend (migración, sin build)

- `close_monthly_cycle`: `period_end` = **fin real** (fecha de confirmación), no el payday
  nominal. Sin esto los gastos de la extensión **no se archivan** y se **recuentan** en el
  ciclo siguiente → **doble conteo**.
- **Columna nueva** en `monthly_summaries`: `nominal_period_end date` (nullable, sin backfill).
  `period_start`/`period_end` ya registran la ventana real, pero para **pintar** la extensión
  en la UI hay que distinguir el fin nominal del real. Derivarlo del `salary_payment_day` se
  rompe si el usuario cambia su día de cobro → **guardarlo**.

### 3.3 Mapa de consumidores (hacer ANTES de tocar)

El modelo de ciclo lo consumen: `compute_pay_cycle`, `home_snapshot`, `velocity`,
`control`, `try_close_previous_cycle` (cron de cierre) y el cliente. Es un cambio del
**núcleo financiero**, no un parche: relevar cada call-site antes de implementar.

---

## 4. Por qué NO puede salir antes del build V2

- **La lógica es cliente** → no hay palanca de servidor que la reemplace.
- **No hay OTA disponible** (sin cuenta paga de Expo), aunque el proyecto tiene EAS Update
  configurado y firmado (`u.expo.dev/54449767-…`, RSA-2048, canales por perfil).
  👉 *Si en algún momento se habilita el tier gratuito, esto sale sin build de tienda.*
- **Las dos mitades van juntas.** Aplicar solo la migración crea una divergencia distinta
  (backend cierra con ventana extendida, cliente sigue congelando). Reship coordinado, mismo
  patrón que el cutover del catálogo de categorías.

### Alternativas descartadas (no reintentar)

- **`cycle_type='custom'` con `length_days` creciendo por cron**: simula la ventana extendida
  desde la base, pero **desactiva el freeze** (los ciclos rolling no congelan) → el usuario
  **nunca vuelve a ver el prompt "¿Ya cobraste?"**. Y si el cron falla un día, el número queda
  mal. Cambia un problema por uno peor.
- **Back-datear los gastos** para que caigan en la ventana congelada: corrompe el registro.

---

## 5. Checklist pre-deploy V2

- [ ] Mapa de consumidores del modelo de ciclo (§3.3)
- [ ] Cliente: ventana extendida + ancla del ciclo nuevo en la confirmación
- [ ] Migración: `close_monthly_cycle` con fin real + columna `nominal_period_end`
- [ ] Verificar que **no haya doble conteo** al confirmar (el riesgo #1 de esta feature)
- [ ] Review adversarial de ambas mitades
- [ ] Coordinar: migración + build en la misma ventana de deploy
- [ ] UI: pintar los días de extensión en ciclos cerrados (la vista nueva de Gastos ya
      muestra los días "fuera de ciclo" del ciclo vigente)

---

## 6. Contexto relacionado

- **Ya aplicado (2026-07-27)**: migración `cycle_disponible_freeze_salary_pending` — alineó el
  push con la app (antes el "Buen día" anunciaba el ciclo nuevo mientras la app mostraba el
  congelado). **No** resuelve el limbo; solo la paridad app↔push.
- **Divergencia preexistente**: `compute_pay_cycle` compara `extract(day) >= v_day` (número de
  día, payday sin clampear) → con `salary_day=31` devuelve ventanas que ni contienen la fecha
  consultada. Exposición viva: familia `bb05f4b2-978c-4696-9b58-3292ef817042` (day 31 +
  dynamic). Merece su propia migración; **tocarlo junto con esta feature tiene sentido**.
- **UX complementario** (no bloqueante, cliente): marcar en la actividad de la Home los gastos
  fuera de ciclo, y avisar al guardar (*"Guardado · cuenta para el próximo ciclo"*). Hoy el
  alta de gasto **no avisa nada** — es el momento de máxima expectativa y está mudo.
