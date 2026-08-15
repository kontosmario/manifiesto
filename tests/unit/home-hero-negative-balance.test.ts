/**
 * Saldo NEGATIVO en el hero del Home.
 *
 * El bug que estos tests fijan: `computeCycleDisponible` ya calculaba
 * `rawCycleBalance` (documentado como "< 0 ⇒ arriba del plan") pero el hero
 * consumía solo `availableToday`, que está clampeado a 0 — un hogar que se
 * pasó del ciclo veía "$0" y ninguna señal de por cuánto se pasó.
 *
 * Además había TRES puntos que se tragaban el signo con `Math.abs()`, así que
 * "pasar el número negativo" no alcanzaba: el monto se habría renderizado
 * positivo igual. El más traicionero es el worklet del contador fluido, que
 * IGNORA el prop `format` del caller y formatea en el UI thread.
 */

import { describe, expect, it } from 'vitest'

import { computeCycleDisponible } from '@/features/family/cycle-disponible'
import { selectHeroVariant } from '@/features/home/select-hero-variant'
import { formatCountForTest } from '@/components/home/animated/count-up-text'
import { formatMoneyWithSign, formatUsdWithSign } from '@/utils/money'

describe('saldo negativo — el dato', () => {
  it('un ciclo pasado de plan deja rawCycleBalance < 0 con availableToday clampeado', () => {
    // Cuenta QA del ciclo extendido al 2026-08-13: la ventana estirada de 37
    // días se come DOS alquileres, así que el ciclo cierra en rojo.
    const r = computeCycleDisponible({
      effectiveCycleIncome: 5_200_000,
      effectiveCycleDays: 37,
      commitmentPressure: 3_774_000,
      effectiveSavingsGoal: 780_000,
      totalAvailable: -1_572_200,
      cycleExtraIncome: 310_000,
      effectiveReservedFixed: 0,
      hasCycleOverride: false,
    })
    expect(r.rawCycleBalance).toBe(-1_262_200)
    // El clamp se queda: todo consumidor que no sea el hero sigue viendo 0.
    expect(r.availableToday).toBe(0)
  })
})

describe('saldo negativo — cadena completa con la cuenta QA del ciclo extendido', () => {
  it('los números reales de prod terminan en un hero rojo con el monto en menos', () => {
    // Encadena las tres piezas tal como corren en la pantalla, para que nadie
    // pueda romper el puente entre ellas sin que se note: disponible → variante
    // → formateo. Los inputs son los de `ciclo.extendido@manifiestoapp.com`
    // al 2026-08-13, y el saldo esperado coincide con el que devuelve la
    // función SQL `cycle_disponible` en producción (paridad app↔push).
    const disponible = computeCycleDisponible({
      effectiveCycleIncome: 5_200_000,
      effectiveCycleDays: 37,
      commitmentPressure: 3_774_000,
      effectiveSavingsGoal: 780_000,
      totalAvailable: -1_572_200,
      cycleExtraIncome: 310_000,
      effectiveReservedFixed: 0,
      hasCycleOverride: false,
    })

    const variant = selectHeroVariant({
      incomeConfigured: true,
      isDynamicIncome: false,
      dynamicSetup: false,
      rawCycleBalance: disponible.rawCycleBalance,
      balanceHydrating: false,
      cycleAdjusted: false,
      cycleBalanceDiff: 0,
    })

    expect(variant).toBe('over')
    // Lo que el usuario ve: el estático y el animado tienen que coincidir.
    expect(formatMoneyWithSign(disponible.rawCycleBalance)).toBe('-$1.262.200')
    expect(formatCountForTest(disponible.rawCycleBalance, 'moneySigned')).toBe('-$1.262.200')
    // Y lo que veía ANTES del fix: el mismo hogar, indistinguible de uno justo.
    expect(formatMoneyWithSign(disponible.availableToday)).toBe('$0')
  })
})

describe('saldo negativo — el signo sobrevive el formateo', () => {
  it('formatMoneyWithSign antepone el menos', () => {
    expect(formatMoneyWithSign(-1_262_200)).toBe('-$1.262.200')
  })

  it('formatUsdWithSign antepone el menos', () => {
    expect(formatUsdWithSign(-1_052)).toBe('-US$ 1.052')
  })

  it('los formatters sin signo siguen devolviendo el absoluto (no se tocaron)', () => {
    expect(formatMoneyWithSign(318_400)).toBe('+$318.400')
    expect(formatMoneyWithSign(0)).toBe('$0')
  })

  it("el worklet del contador preserva el menos con unit 'moneySigned'", () => {
    // Esta es LA ruta que se ve: el hero usa `flourish`, que formatea en el
    // worklet e ignora el prop `format`. Sin esto el contador anima hacia el
    // negativo pero dibuja el número positivo todo el camino.
    expect(formatCountForTest(-1_262_200, 'moneySigned')).toBe('-$1.262.200')
    expect(formatCountForTest(-999, 'moneySigned')).toBe('-$999')
    expect(formatCountForTest(0, 'moneySigned')).toBe('$0')
    expect(formatCountForTest(1_262_200, 'moneySigned')).toBe('$1.262.200')
  })

  it("unit 'money' sigue clampeando el signo (meta-card / step-savings dependen)", () => {
    expect(formatCountForTest(-1_262_200, 'money')).toBe('$1.262.200')
  })

  it("unit 'moneyDelta' — el monto héroe del wrapped SIEMPRE lleva signo explícito", () => {
    // El veredicto de "La Edición" muestra "+$324.617" / "-$1.588.087": el
    // signo ES el veredicto. Mismo criterio r>0 que moneySigned para no
    // parpadear "+$0"/"-$0" al cruzar el cero durante el count-up.
    expect(formatCountForTest(324_617, 'moneyDelta')).toBe('+$324.617')
    expect(formatCountForTest(-1_588_087, 'moneyDelta')).toBe('-$1.588.087')
    expect(formatCountForTest(0, 'moneyDelta')).toBe('$0')
    expect(formatCountForTest(0.4, 'moneyDelta')).toBe('$0')
    expect(formatCountForTest(-0.4, 'moneyDelta')).toBe('$0')
  })

  it("para n ≥ 0, 'moneySigned' rinde byte-idéntico a 'money' — por eso el hero la usa SIEMPRE", () => {
    // El hero pasa unit="moneySigned" incondicional: el string se deriva del
    // shared value, que puede seguir negativo EN VUELO cuando la variante ya
    // flipeó a steady (over→steady tras cargar un ingreso). Con la unit
    // condicionada a la variante, ese tramo dibujaba el déficit sin signo.
    for (const n of [0, 1, 999, 2_452_537, 1_262_200]) {
      expect(formatCountForTest(n, 'moneySigned')).toBe(formatCountForTest(n, 'money'))
    }
    // Y en el tramo negativo del vuelo, el signo se queda.
    expect(formatCountForTest(-500_000, 'moneySigned')).toBe('-$500.000')
  })
})

describe('saldo negativo — selección de variante del hero', () => {
  const base = {
    incomeConfigured: true,
    isDynamicIncome: false,
    dynamicSetup: false,
    rawCycleBalance: 1_000_000,
    balanceHydrating: false,
    cycleAdjusted: false,
    cycleBalanceDiff: 0,
  }

  it("saldo positivo → 'steady'", () => {
    expect(selectHeroVariant(base)).toBe('steady')
  })

  it("saldo negativo → 'over'", () => {
    expect(selectHeroVariant({ ...base, rawCycleBalance: -1_262_200 })).toBe('over')
  })

  it("el borde: 0 NO es pasarse, -1 sí", () => {
    expect(selectHeroVariant({ ...base, rawCycleBalance: 0 })).toBe('steady')
    expect(selectHeroVariant({ ...base, rawCycleBalance: -1 })).toBe('over')
  })

  it("'over' gana sobre 'adjusted' — pasarse es más urgente que estar ajustado", () => {
    expect(
      selectHeroVariant({
        ...base,
        rawCycleBalance: -1_262_200,
        cycleAdjusted: true,
        cycleBalanceDiff: -500_000,
      }),
    ).toBe('over')
  })

  it("'empty' gana sobre todo: sin ingreso configurado no hay saldo que mostrar", () => {
    expect(
      selectHeroVariant({ ...base, incomeConfigured: false, rawCycleBalance: -1_262_200 }),
    ).toBe('empty')
  })

  it("dinámico sin ingresos cargados sigue cayendo en 'empty'", () => {
    expect(
      selectHeroVariant({
        ...base,
        isDynamicIncome: true,
        dynamicSetup: true,
        rawCycleBalance: -50_000,
      }),
    ).toBe('empty')
  })

  it('adjusted se mantiene intacto cuando el saldo no es negativo', () => {
    expect(
      selectHeroVariant({ ...base, cycleAdjusted: true, cycleBalanceDiff: -500_000 }),
    ).toBe('adjusted')
  })
})

describe('saldo negativo — gate de hidratación (flash rojo→verde de la primera carga)', () => {
  // El bug: home_snapshot siembra finance+gastos+fijos pero NO la suma de
  // income extra del ciclo → el primer paint calcula el saldo sin esa pata y
  // puede dar un negativo transitorio. El hero arrancaba ROJO y pasaba a
  // verde ~300ms después. Con `balanceHydrating` la rama 'over' espera a que
  // el monto termine de cargar.
  const base = {
    incomeConfigured: true,
    isDynamicIncome: false,
    dynamicSetup: false,
    rawCycleBalance: -1_262_200,
    balanceHydrating: false,
    cycleAdjusted: false,
    cycleBalanceDiff: 0,
  }

  it("hidratando + saldo negativo → 'steady', nunca rojo transitorio", () => {
    expect(selectHeroVariant({ ...base, balanceHydrating: true })).toBe('steady')
  })

  it("asentado + saldo negativo → 'over'", () => {
    expect(selectHeroVariant(base)).toBe('over')
  })

  it('hidratando NO pisa adjusted: el durazno del override no depende del saldo', () => {
    expect(
      selectHeroVariant({
        ...base,
        balanceHydrating: true,
        cycleAdjusted: true,
        cycleBalanceDiff: -500_000,
      }),
    ).toBe('adjusted')
  })

  it('modo dinámico hidratando (gasto sembrado sin income aún) → steady, no rojo', () => {
    // En dinámico el ingreso entra TODO por income_events: mientras esa query
    // carga, el saldo es -gasto-fijos — negativo garantizado si hubo gasto.
    expect(
      selectHeroVariant({
        ...base,
        isDynamicIncome: true,
        balanceHydrating: true,
        rawCycleBalance: -350_000,
      }),
    ).toBe('steady')
  })
})
