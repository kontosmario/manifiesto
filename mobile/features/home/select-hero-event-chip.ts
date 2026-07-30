/**
 * Selector "uno por vez" del chip de evento del hero — Home rediseñada
 * (FASE 2 del cableado, plan `design/home-final-2026-07/PLAN-CABLEADO.md`).
 *
 * El stack viejo (`home-hero-card.tsx:369-635`) renderiza hasta 5 chips en
 * simultáneo (flexWrap); el mockup nuevo exige UN chip de evento + el chip
 * de fijos APARTE (README:55, metrics-model §8 "gap clave"). Este módulo es
 * la derivación PURA: recibe los mismos datos que el stack viejo ya usa y
 * devuelve a lo sumo un chip, respetando el orden de precedencia que el
 * stack viejo ya codificaba (acumulado > sumado > ajustado > ahorrando).
 *
 * Decisión de owner (2026-07-21, fijada): el chip "SOBRANTE $X" es el
 * ARRASTRE REAL del mes anterior (el dato `acumulado` que ya existe —
 * `use-current-cycle-acumulado.ts`), NO la proyección de cierre. Por eso el
 * copy del catálogo "💰 Sobrante $837k al cierre" no aplica tal cual
 * ("al cierre" = semántica de proyección):
 *
 *   DECISIÓN DE COPY (documentada, a validar por owner): se mantiene el
 *   lenguaje 💰/"Sobrante" del catálogo + la atribución de período del stack
 *   VIEJO (`hero.acumuladoChip` = "+{{amount}} de {{period}}", con
 *   `periodLabel.toLowerCase()` igual que `home-hero-card.tsx:414-417`):
 *     "💰 Sobrante $837k de junio 2026"
 *   Fallback sin periodLabel: "💰 Sobrante $837k del mes pasado".
 *
 * Copy restante = literales del catálogo (`estados.dc.html`):
 *   "📈 Sumaste $X al mes" · "✂️ Ajustado este mes". El chip AHORRANDO no
 *   tiene visual en el handoff (solo README:55) → default documentado a
 *   validar por owner: tone 'green' + "💚 {label del helper}" para los
 *   estados positivos (healthy/partial); el estado `consumed` ("Sin ahorro
 *   este mes") es un aviso, no un "AHORRANDO" → tone 'neutral' y el label
 *   del helper sin emoji.
 *
 * Formato de montos: `formatMoneyShort` — el MISMO helper del stack viejo
 * (no se inventa formato; "$123k" coincide con el mockup).
 *
 * i18n (pase F3.5): el copy vive en `home:heroChip.*` / `home:reserva.*`;
 * el helper resuelve vía `i18n.t` (mismo patrón que `computeSavingsHeroChip`).
 */

import type { SavingsHeroChip } from '@/components/home/home-hero-savings-helpers'
import { formatMoneyShort } from '@/utils/money'
import i18n from '@/lib/i18n'

export type HeroEventChipKind = 'acumulado' | 'sumado' | 'ajustado' | 'ahorrando'
export type HeroEventChipTone = 'green' | 'neutral'

/**
 * Shape que consume `HomeHero` del kit (`HomeEventChipVM` en
 * `mobile/components/redesign/home/home-screen.tsx:356-359`: `{tone,label}`)
 * + `kind` discriminante para telemetría/tests. Un `HeroEventChip` es
 * asignable a `HomeEventChipVM` tal cual.
 */
export interface HeroEventChip {
  kind: HeroEventChipKind
  tone: HeroEventChipTone
  label: string
}

export interface SelectHeroEventChipInput {
  /**
   * Arrastre real del mes anterior (decisión "acumular" del wrapped) —
   * `HomeHeroMetrics.acumulado` (`CycleAcumulado`: amount > 0 por contrato,
   * periodLabel humano e.g. "Mayo 2026").
   */
  acumulado: { amount: number; periodLabel: string } | null
  /** Override del ciclo activo — `cycleStartingBalanceOverride !== null`
   *  (`use-home-metrics.ts`, campo `cycleAdjusted`). */
  cycleAdjusted: boolean
  /** `current_cycle_starting_balance − monthly_income` con override activo;
   *  0 sin override. > 0 = "sumaste plata al mes" (override UP). */
  cycleBalanceDiff: number
  /** Chip de ahorro ya computado por `computeSavingsHeroChip`
   *  (`home-hero-savings-helpers.ts`). `null` = sin señal. */
  savingsChip: SavingsHeroChip | null
  /** Régimen de ingreso. En 'dynamic' el chip AHORRANDO se apaga SIEMPRE
   *  (gate explícito, espejo de `home-dashboard.tsx:649-660` — no depende
   *  de que el caller ya haya pasado `savingsChip: null`). */
  incomeMode: 'fixed' | 'dynamic'
}

/**
 * Devuelve el ÚNICO chip de evento del hero, o `null` cuando nada aplica.
 *
 * Precedencia (= orden del ternario del stack viejo, `home-hero-card.tsx:
 * 380-490` + savings chip):
 *   1. acumulado/sobrante  2. sumado (override UP)  3. ajustado (override
 *   DOWN/==0)  4. ahorrando (apagado en income dinámico).
 *
 * Guarda defensiva nueva (diferencia deliberada vs el stack viejo, que
 * hubiese pintado "+$0 de mayo"): un `acumulado` con amount no-finito o ≤ 0
 * (no debería existir por contrato) NO gana el slot — cae al siguiente.
 */
export function selectHeroEventChip(input: SelectHeroEventChipInput): HeroEventChip | null {
  const { acumulado, cycleAdjusted, cycleBalanceDiff, savingsChip, incomeMode } = input

  if (acumulado && Number.isFinite(acumulado.amount) && acumulado.amount > 0) {
    const period = acumulado.periodLabel?.trim()
    const amount = formatMoneyShort(acumulado.amount)
    return {
      kind: 'acumulado',
      tone: 'green',
      label: period
        ? i18n.t('home:heroChip.acumuladoPeriod', { amount, period: period.toLowerCase() })
        : i18n.t('home:heroChip.acumuladoLastMonth', { amount }),
    }
  }

  if (cycleAdjusted && Number.isFinite(cycleBalanceDiff) && cycleBalanceDiff > 0) {
    return {
      kind: 'sumado',
      tone: 'green',
      label: i18n.t('home:heroChip.added', { amount: formatMoneyShort(cycleBalanceDiff) }),
    }
  }

  if (cycleAdjusted) {
    return { kind: 'ajustado', tone: 'neutral', label: i18n.t('home:heroChip.adjusted') }
  }

  if (savingsChip && incomeMode !== 'dynamic') {
    const positive = savingsChip.kind !== 'consumed'
    return {
      kind: 'ahorrando',
      tone: positive ? 'green' : 'neutral',
      // Default documentado (sin visual en el handoff): 💚 solo en los
      // estados positivos; `consumed` conserva el label-aviso del helper.
      label: positive ? i18n.t('home:heroChip.saving', { label: savingsChip.label }) : savingsChip.label,
    }
  }

  return null
}

/**
 * Chip de FIJOS por pagar — va APARTE del selector (el mockup los muestra
 * conviviendo: evento + fijos). Fuente: `fixedPendingReserved`
 * (`use-home-metrics.ts` ← `effectiveCommitmentReserved`). Copy literal del
 * mockup principal (`home.dc.html`): "🗓️ $123k de fijos por pagar" — mismo
 * texto que el stack viejo (`hero.fixedReservedChip` = "{{amount}} de fijos
 * por pagar") con el 🗓️ del mockup. `null` cuando no hay fijos pendientes.
 */
export function selectFixedChip(fixedPendingReserved: number): string | null {
  if (!Number.isFinite(fixedPendingReserved) || fixedPendingReserved <= 0) return null
  return i18n.t('home:heroChip.fixedToPay', { amount: formatMoneyShort(fixedPendingReserved) })
}

/**
 * Chip "Reserva $X" (gold) — acople del chip gold viejo (decisión owner
 * 2026-07-21, review finding #6). Reserva del ciclo que NO debe desaparecer
 * visualmente. Informativo, aparte del selector rotativo; se muestra siempre
 * que monthly_reserve_amount > 0. Copy: mismo patrón que home.json
 * `hero.reserveChip` ("Reserva {{amount}}") con emoji prefix como los demás
 * chips del hero nuevo. i18n en `home:reserva.chip` (pase F3.5).
 */
export function selectReservaChip(monthlyReserveAmount: number): string | null {
  if (!Number.isFinite(monthlyReserveAmount) || monthlyReserveAmount <= 0) return null
  return i18n.t('home:reserva.chip', { amount: formatMoneyShort(monthlyReserveAmount) })
}
