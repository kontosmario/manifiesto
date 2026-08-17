import { describe, expect, it } from 'vitest'
import {
  buildIngresosContent,
  buildReservaContent,
  selectIngresosVariant,
  selectReservaVariant,
} from '@/features/insights/neo-control-view-model'
import type { IngresosCiclo } from '@/features/insights/use-control-v2-data'

/**
 * Las dos secciones que se repusieron en Control tras el swap de pantalla
 * (9ae37db7): ingresos del ciclo y administración de la reserva.
 */

const mov = (over: Partial<IngresosCiclo['movimientos'][number]> = {}) => ({
  id: 'm1',
  fecha: '2026-08-12',
  kind: 'freelance' as const,
  descripcion: 'Proyecto',
  monto: 100_000,
  ...over,
})

const ingresos = (movimientos: IngresosCiclo['movimientos']): IngresosCiclo => ({
  total: movimientos.reduce((s, m) => s + m.monto, 0),
  movimientos,
})

describe('selectIngresosVariant', () => {
  it('total 0 → vacio, sea cual sea el modo de ingreso', () => {
    expect(selectIngresosVariant({ total: 0, incomeMode: 'fixed' })).toBe('vacio')
    expect(selectIngresosVariant({ total: 0, incomeMode: 'dynamic' })).toBe('vacio')
  })

  it('el modo separa "extra encima del sueldo" de "esto ES el presupuesto"', () => {
    expect(selectIngresosVariant({ total: 1, incomeMode: 'fixed' })).toBe('extra')
    expect(selectIngresosVariant({ total: 1, incomeMode: 'dynamic' })).toBe('variable')
  })

  it('EL BUG: total > 0 con la lista vacía NO puede decir "no entró nada"', () => {
    // `total` y `movimientos` son dos queries distintas y pueden divergir.
    // Con el largo de la lista mandando, la card afirmaba que no habías
    // cargado ningún cobro sobre un ciclo que sí tenía ingresos.
    expect(selectIngresosVariant({ total: 5000, incomeMode: 'fixed' })).toBe('extra')
    expect(selectIngresosVariant({ total: 5000, incomeMode: 'fixed' })).not.toBe('vacio')
  })
})

describe('buildIngresosContent', () => {
  it('corta en 3 filas y declara el resto en "+N más"', () => {
    const c = buildIngresosContent({
      variant: 'extra',
      ingresos: ingresos([
        mov({ id: 'a' }),
        mov({ id: 'b' }),
        mov({ id: 'c' }),
        mov({ id: 'd' }),
        mov({ id: 'e' }),
      ])
    })
    expect(c.rows).toHaveLength(3)
    expect(c.moreLabel).toBeTruthy()
    // El conteo del pill es sobre el TOTAL, no sobre lo visible: si dijera 3
    // el usuario creería que ya vio todo.
    expect(c.verdictLabel).toContain('5')
  })

  it('sin ocultos NO inventa el "+N más"', () => {
    const c = buildIngresosContent({ variant: 'extra', ingresos: ingresos([mov()]) })
    expect(c.moreLabel).toBeUndefined()
    expect(c.placeholderLabel).toBeUndefined()
  })

  it('un solo movimiento no arrastra el sufijo de conteo al pill', () => {
    const c = buildIngresosContent({ variant: 'extra', ingresos: ingresos([mov()]) })
    expect(c.verdictLabel).not.toContain('·')
  })

  it('usa la descripción cuando existe y cae al tipo cuando no', () => {
    const c = buildIngresosContent({
      variant: 'extra',
      ingresos: ingresos([mov({ id: 'a', descripcion: 'Bono anual' }), mov({ id: 'b', descripcion: null })])
    })
    expect(c.rows?.[0]?.title).toBe('Bono anual')
    expect(c.rows?.[1]?.title).toBeTruthy()
    expect(c.rows?.[1]?.title).not.toBe('')
  })

  it('una descripción en blanco NO deja la fila sin título', () => {
    const c = buildIngresosContent({
      variant: 'extra',
      ingresos: ingresos([mov({ descripcion: '   ' })])
    })
    expect(c.rows?.[0]?.title.trim()).not.toBe('')
  })

  it('la fecha no se corre un día (la trampa de parsear YYYY-MM-DD como UTC)', () => {
    const c = buildIngresosContent({
      variant: 'extra',
      ingresos: ingresos([mov({ fecha: '2026-08-01' })])
    })
    // Sea cual sea el locale activo, el día 1 tiene que aparecer como 1 —
    // con el parseo UTC caía a "31 jul" en toda zona al oeste de Greenwich.
    expect(c.rows?.[0]?.sub).toMatch(/(^|\D)1(\D|$)/)
  })

  it('el vacío trae placeholder y CTA, y ninguna fila', () => {
    const c = buildIngresosContent({ variant: 'vacio', ingresos: ingresos([]) })
    expect(c.rows).toEqual([])
    expect(c.placeholderLabel).toBeTruthy()
    expect(c.brot?.ctaLabel).toBeTruthy()
    expect(c.moreLabel).toBeUndefined()
  })

  it('diasMes 0 no filtra NaN ni Infinity al headline', () => {
    const c = buildIngresosContent({ variant: 'extra', ingresos: ingresos([mov()]) })
    const texto = (c.headline ?? []).map((s) => s.text).join('')
    expect(texto).not.toMatch(/NaN|Infinity/)
  })

  it('con total > 0 pero lista vacía: card sin filas y SIN el pozo de "no entró nada"', () => {
    const c = buildIngresosContent({ variant: 'extra', ingresos: { total: 5000, movimientos: [] } })
    expect(c.rows).toEqual([])
    expect(c.placeholderLabel).toBeUndefined()
    expect(c.moreLabel).toBeUndefined()
  })

  it('NINGUNA variante con ingresos ofrece la CTA "a la meta"', () => {
    // Aportar a la meta no descuenta del cupo: prometerlo contaba la misma
    // plata dos veces. Solo el estado vacío tiene CTA (cargar un cobro).
    for (const variant of ['extra', 'variable'] as const) {
      const c = buildIngresosContent({ variant, ingresos: ingresos([mov()]) })
      expect(c.brot?.ctaLabel).toBeUndefined()
    }
    expect(
      buildIngresosContent({ variant: 'vacio', ingresos: ingresos([]) }).brot?.ctaLabel,
    ).toBeTruthy()
  })

  it('la variante variable no promete "además de tu sueldo"', () => {
    const fijo = buildIngresosContent({ variant: 'extra', ingresos: ingresos([mov()]) })
    const dyn = buildIngresosContent({ variant: 'variable', ingresos: ingresos([mov()]) })
    const txt = (c: typeof fijo) => (c.headline ?? []).map((s) => s.text).join('')
    expect(txt(fijo)).not.toBe(txt(dyn))
    expect(txt(dyn)).not.toMatch(/sueldo/i)
  })
})

describe('selectReservaVariant', () => {
  it('sin meta → sinMeta (la CTA primaria tendrá que crearla)', () => {
    expect(selectReservaVariant({ goal: null })).toBe('sinMeta')
  })

  it('meta activa → conMeta', () => {
    expect(selectReservaVariant({ goal: { isActive: true } })).toBe('conMeta')
  })

  it('una meta PAUSADA no es lo mismo que no tener meta', () => {
    // El hogar tiene UNA sola meta: si la pausada cayera en `sinMeta`, la CTA
    // ofrecería CREAR y el wizard pisaría la que ya existe. Tiene que ser su
    // propio estado, que reactiva.
    expect(selectReservaVariant({ goal: { isActive: false } })).toBe('metaPausada')
    expect(selectReservaVariant({ goal: { isActive: false } })).not.toBe('sinMeta')
  })
})

describe('buildReservaContent', () => {
  it('el monto del pozo y el del headline son el MISMO número formateado', () => {
    const c = buildReservaContent({ variant: 'conMeta', amount: 340_000 })
    const texto = (c.headline ?? []).map((s) => s.text).join('')
    expect(c.amount).toBeTruthy()
    expect(texto).toContain(c.amount!)
  })

  it('sin meta la CTA primaria habla de CREAR, no de aportar', () => {
    const con = buildReservaContent({ variant: 'conMeta', amount: 1000 })
    const sin = buildReservaContent({ variant: 'sinMeta', amount: 1000 })
    expect(sin.metaCtaLabel).not.toBe(con.metaCtaLabel)
    // La secundaria (sumar al ciclo) no cambia entre variantes.
    expect(sin.cicloCtaLabel).toBe(con.cicloCtaLabel)
  })

  it('las dos variantes traen siempre las dos CTAs y un Brot', () => {
    for (const variant of ['conMeta', 'sinMeta'] as const) {
      const c = buildReservaContent({ variant, amount: 500 })
      expect(c.metaCtaLabel).toBeTruthy()
      expect(c.cicloCtaLabel).toBeTruthy()
      expect(c.brot?.title).toBeTruthy()
      expect(c.brot?.body?.length).toBeGreaterThan(0)
    }
  })

  it('un monto enorme no se parte ni pierde formato', () => {
    const c = buildReservaContent({ variant: 'conMeta', amount: 99_999_999 })
    expect(c.amount).not.toMatch(/NaN|Infinity/)
  })
})
