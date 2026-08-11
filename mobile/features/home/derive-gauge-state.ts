/**
 * Estado del medidor de cupo diario del hero — "PODÉS GASTAR HOY".
 *
 * Mide **lo gastado HOY contra el cupo del día**, y devuelve además los dos
 * números que el hero rotula (GASTADO / DISPONIBLE) para que la pantalla no
 * los vuelva a derivar por su cuenta.
 *
 * ── Por qué cambió (owner, 2026-08-08) ──────────────────────────────
 * La versión original comparaba el PROMEDIO del ciclo
 * (`variableSpentInCurrentCycle / díaDelCiclo`) contra el cupo. Era una
 * decisión deliberada del cableado original, pero en la práctica dejaba la
 * barra clavada: un gasto nuevo mueve ese promedio una enésima parte
 * (dividido por el día del ciclo), así que al día 20 un gasto de $15.000
 * movía la barra 2 puntos porcentuales sobre un cupo de ~$32.000. El owner
 * lo reportó como "el gráfico no se mueve, jamás".
 *
 * Con el gasto del día el medidor responde 1:1: cargás $50.000 sobre un cupo
 * de $32.000 y la barra se llena y pasa a `over`, que es lo que de verdad
 * está pasando.
 *
 * ── La trampa del doble descuento ───────────────────────────────────
 * `computeCycleDisponible` compone el cupo por DOS ramas y sólo una de ellas
 * es bruta:
 *  · Sin override y en modo clásico: `(ingreso − fijos − ahorro) / días
 *    TOTALES`. Es un objetivo plano y BRUTO — no sabe nada del gasto, así que
 *    restarle lo de hoy es exactamente lo que corresponde.
 *  · Con override de saldo o ingreso dinámico: `discrecional / días
 *    RESTANTES`, y el discrecional sale de `totalAvailable`, que YA restó el
 *    gasto variable del ciclo — el de hoy incluido. Ahí el cupo que se ve ya
 *    bajó por lo que gastaste, y volver a restarlo descuenta dos veces el
 *    mismo gasto.
 *
 * Por eso el medidor no mide contra el cupo que se muestra sino contra el
 * cupo de APERTURA del día: lo que había para hoy antes de gastar. En la
 * rama bruta son el mismo número; en la otra hay que devolverle al cupo la
 * parte del gasto de hoy que ya se le había descontado, que es
 * `spentToday / díasRestantes` (el gasto se reparte entre los días que
 * quedan, no se le carga entero a hoy).
 *
 * Es la misma trampa que documenta `add-expense-impact.ts` para el paso 2 del
 * alta de gasto, resuelta acá de la misma manera para que las dos superficies
 * no se contradigan.
 */

/** Borde inferior del estado "al límite" (inclusive). */
export const GAUGE_LIMIT_THRESHOLD = 0.85
/** Borde superior del estado "al límite" (inclusive); > esto = excedido. */
export const GAUGE_OVER_THRESHOLD = 1.0

export type GaugeStatus = 'ok' | 'limit' | 'over'

export interface GaugeState {
  status: GaugeStatus
  /** `clamp(spentToday / openingBudget, 0, 1)`. El status usa el ratio SIN clamp. */
  fillRatio: number
  /** Cupo de APERTURA del día: lo que había para hoy ANTES de gastar. */
  openingBudget: number
  /** Lo gastado hoy, tal como se rotula en GASTADO. */
  spentToday: number
  /** Lo que queda del cupo de hoy; 0 si se pasó. */
  remainingToday: number
}

export interface DeriveGaugeStateInput {
  /** Gasto VARIABLE de hoy (`dashboard.variableSpentToday`). */
  spentToday: number
  /** Cupo canónico (`computeCycleDisponible().dailyBudget`). */
  dailyBudget: number
  /**
   * `true` cuando el cupo YA descontó el gasto de hoy — la rama con override
   * de saldo o ingreso dinámico. Es el MISMO flag con el que se compuso el
   * cupo (`hasCycleOverride`); ver el docblock del módulo.
   */
  cupoNetsSpend: boolean
  /**
   * Días entre los que el cupo reparte el discrecional
   * (`dashboard.effectiveCycleDays`): totales en la rama bruta, restantes en
   * la otra. Sólo se usa para devolverle al cupo la parte del gasto de hoy
   * que ya tenía descontada.
   */
  budgetDays: number
  /**
   * Discrecional del ciclo SIN clampear (`computeCycleDisponible`). Necesario
   * para reconstruir la apertura sin que el clamp a 0 la invente — ver
   * `computeOpeningDailyBudget`.
   */
  discretionaryRaw?: number
}

/**
 * Cupo de APERTURA del día: lo que había para hoy ANTES de gastar.
 *
 * Se exporta porque tiene que ser el MISMO número en las dos superficies que
 * hablan del cupo del día — el medidor del hero y el "revisá el impacto" del
 * alta de gasto. Cuando cada una lo derivaba por su cuenta, la card y el paso
 * 2 mostraban cuentas distintas para el mismo gasto.
 */
export function computeOpeningDailyBudget(input: {
  dailyBudget: number
  spentToday: number
  cupoNetsSpend: boolean
  budgetDays: number
  /**
   * Discrecional del ciclo SIN clampear (`computeCycleDisponible`). Sólo lo
   * usa la rama que netea; en la bruta el cupo no depende del gasto.
   */
  discretionaryRaw?: number
}): number {
  const safeSpent = Math.max(0, input.spentToday)
  if (!input.cupoNetsSpend) return input.dailyBudget

  /**
   * La apertura NO se puede reconstruir sumándole `spentToday / días` al
   * `dailyBudget`: ese cupo viene de clampear el discrecional a 0 ANTES de
   * dividir, y el clamp borra por cuánto te pasaste. Con un hogar en override
   * que se comió el ciclo entero, `dailyBudget` es 0 y esa suma devolvía
   * `spentToday / días` — un objetivo del día que CRECE con cada gasto nuevo
   * ("GASTADO $130k DE $13k", y al siguiente "DE $18k").
   *
   * Se rehace la cuenta desde el discrecional crudo, devolviéndole lo gastado
   * hoy ANTES del clamp, con el mismo redondeo que `cycle-disponible` para no
   * separarse de él por un peso.
   */
  const days = Math.max(1, input.budgetDays)
  if (input.discretionaryRaw === undefined) {
    return input.dailyBudget + safeSpent / days
  }
  return Math.max(
    0,
    Math.round(Math.max(0, Math.round(input.discretionaryRaw + safeSpent)) / days),
  )
}

/**
 * `null` cuando el medidor no puede/debe mostrarse (cupo ≤ 0 o datos no
 * finitos) — el hero oculta el bloque completo (medidor + hairline).
 */
export function deriveGaugeState(input: DeriveGaugeStateInput): GaugeState | null {
  const { spentToday, dailyBudget, cupoNetsSpend, budgetDays, discretionaryRaw } =
    input
  if (!Number.isFinite(spentToday) || !Number.isFinite(dailyBudget)) return null
  if (!Number.isFinite(budgetDays)) return null
  // OJO: acá NO se corta por `dailyBudget <= 0`.
  //
  // En la rama override/dinámico el cupo es función del gasto y toca piso 0 en
  // cuanto te pasás (`cycle-disponible` lo clampea con `Math.max(0, …)`). Con
  // el corte adelante, el medidor DESAPARECÍA justo el día que más importa —
  // el que te pasaste— y la card se quedaba sin su bloque central. La guarda
  // que corresponde es sobre la APERTURA: si el día no tenía nada para gastar,
  // ahí sí no hay nada que medir.
  const safeSpent = Math.max(0, spentToday)
  const openingBudget = computeOpeningDailyBudget({
    dailyBudget,
    spentToday: safeSpent,
    cupoNetsSpend,
    budgetDays,
    discretionaryRaw,
  })
  if (openingBudget <= 0) return null

  const ratio = safeSpent / openingBudget
  const status: GaugeStatus =
    ratio > GAUGE_OVER_THRESHOLD ? 'over' : ratio >= GAUGE_LIMIT_THRESHOLD ? 'limit' : 'ok'

  return {
    status,
    fillRatio: Math.min(1, Math.max(0, ratio)),
    openingBudget,
    spentToday: safeSpent,
    remainingToday: Math.max(0, openingBudget - safeSpent),
  }
}
