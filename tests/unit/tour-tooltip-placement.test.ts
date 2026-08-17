import { describe, expect, it } from 'vitest'
import {
  resolveTooltipPlacement,
  TOOLTIP_HEIGHT_SEED,
} from '@/features/tours/tour-tooltip-placement'

/** iPhone típico con isla + tab bar, que es donde se reportó el bug. */
const BASE = {
  screenH: 844,
  usableTop: 59,
  usableBottom: 844 - 83 - 34, // tab bar + home indicator
  gap: 16,
}

const place = (o: Partial<Parameters<typeof resolveTooltipPlacement>[0]>) =>
  resolveTooltipPlacement({
    ...BASE,
    targetY: 300,
    targetH: 120,
    tooltipH: TOOLTIP_HEIGHT_SEED,
    ...o,
  })

describe('resolveTooltipPlacement — el tooltip nunca tapa lo que explica', () => {
  it('con lugar abajo, va abajo (flujo natural de lectura)', () => {
    const r = place({ targetY: 200, targetH: 100, tooltipH: 200 })
    expect(r.placement).toBe('below')
    expect(r.top).toBeGreaterThanOrEqual(200 + 100 + BASE.gap)
  })

  it('un recuadro pegado al fondo manda el tooltip ARRIBA', () => {
    const r = place({ targetY: 560, targetH: 120, tooltipH: 200 })
    expect(r.placement).toBe('above')
    // Y no puede solaparse con el recuadro que explica.
    expect(r.top + 200).toBeLessThanOrEqual(560)
  })

  it('EL BUG: un tooltip alto NO se coloca en un hueco donde no entra', () => {
    // roomAbove (225) es mayor que roomBelow (147), pero el tooltip mide 298
    // (la escala de texto «Máxima») y no entra en NINGUNO. La versión vieja
    // elegía 'above' por ser el hueco más grande y lo dejaba encimado.
    const r = place({ targetY: 300, targetH: 120, tooltipH: 298 })
    expect(r.maxHeight).not.toBeNull()
    // Recortado al hueco → el contenido scrollea en vez de desbordar.
    expect(r.maxHeight!).toBeLessThanOrEqual(298)
    expect(r.maxHeight!).toBeGreaterThanOrEqual(120)
  })

  it('cuando entra, no se recorta (no aparece scroll de la nada)', () => {
    expect(place({ targetY: 200, targetH: 80, tooltipH: 180 }).maxHeight).toBeNull()
  })

  it('nunca queda detrás de la status bar', () => {
    const r = place({ targetY: 90, targetH: 40, tooltipH: 260 })
    expect(r.top).toBeGreaterThanOrEqual(BASE.usableTop)
  })

  it('nunca queda detrás de la tab bar (los botones siempre alcanzables)', () => {
    const r = place({ targetY: 600, targetH: 100, tooltipH: 220 })
    const alto = r.maxHeight ?? 220
    expect(r.top + alto).toBeLessThanOrEqual(BASE.usableBottom + 0.5)
  })

  it('respeta los insets REALES del device, no constantes hardcodeadas', () => {
    // Mismo recuadro, dos devices distintos: un tooltip que hay que empujar
    // contra el techo. El device sin isla puede subir más porque su zona no
    // usable de arriba es menor — con constantes fijas los dos daban igual.
    const geom = { targetY: 300, targetH: 60, tooltipH: 300 }
    const conIsla = place(geom)
    const sinIsla = resolveTooltipPlacement({
      ...geom,
      screenH: 667,
      usableTop: 20,
      usableBottom: 667 - 49,
      gap: 16,
    })
    expect(conIsla.top).toBeGreaterThanOrEqual(59)
    expect(sinIsla.top).toBeGreaterThanOrEqual(20)
    expect(sinIsla.top).toBeLessThan(conIsla.top)
  })

  it('el caso `list` de Gastos: ancla alta y tooltip largo', () => {
    // extendToScrollEnd sube el ancla al ~10% del viewport y estira el rect.
    const r = place({ targetY: 84, targetH: 520, tooltipH: 240 })
    // Sea cual sea el lado, no puede montarse sobre el recuadro.
    if (r.placement === 'above') {
      expect(r.top + (r.maxHeight ?? 240)).toBeLessThanOrEqual(84)
    } else {
      expect(r.top).toBeGreaterThanOrEqual(84 + 520)
    }
  })
})
