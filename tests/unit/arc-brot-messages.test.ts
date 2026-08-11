import { describe, expect, it } from 'vitest'
import {
  createArcBrotPicker,
  ARC_BROT_COUNT,
  ARC_BROT_MESSAGES,
} from '@/components/navigation/arc-brot-messages'
import {
  ARC_BROT_INK_ABOVE,
  ARC_BUBBLE_GAP,
} from '@/components/navigation/arc-hub-geometry'
import esStates from '@/lib/i18n/locales/es/states.json'
import enStates from '@/lib/i18n/locales/en/states.json'

/** Random determinista, para poder afirmar sobre el barajado. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

describe('catálogo', () => {
  it('son 40 mensajes', () => {
    expect(ARC_BROT_COUNT).toBe(40)
  })

  it('los ids son únicos', () => {
    const ids = new Set(ARC_BROT_MESSAGES.map((m) => m.id))
    expect(ids.size).toBe(ARC_BROT_MESSAGES.length)
  })

  it('cada entrada tiene su copy en los dos idiomas', () => {
    const es = (esStates as { arcHub: { brot: Record<string, string> } }).arcHub.brot
    const en = (enStates as { arcHub: { brot: Record<string, string> } }).arcHub.brot
    for (const message of ARC_BROT_MESSAGES) {
      expect(es[message.id], `falta ES de ${message.id}`).toBeTruthy()
      expect(en[message.id], `falta EN de ${message.id}`).toBeTruthy()
    }
    // Y al revés: una clave huérfana en el JSON es copy que nadie muestra.
    expect(Object.keys(es).sort()).toEqual(
      ARC_BROT_MESSAGES.map((m) => m.id).sort(),
    )
    expect(Object.keys(en).sort()).toEqual(
      ARC_BROT_MESSAGES.map((m) => m.id).sort(),
    )
  })

  it('ninguno se pasa del ancho de una línea', () => {
    const es = (esStates as { arcHub: { brot: Record<string, string> } }).arcHub.brot
    const en = (enStates as { arcHub: { brot: Record<string, string> } }).arcHub.brot
    // 30 es el tope con el que se dimensionó la línea: a 12.5px/800 entra
    // entero en el ancho útil del device más angosto que soportamos.
    for (const message of ARC_BROT_MESSAGES) {
      expect(es[message.id].length, `ES ${message.id}`).toBeLessThanOrEqual(30)
      expect(en[message.id].length, `EN ${message.id}`).toBeLessThanOrEqual(30)
    }
  })

  it('ninguna pose es `peek`', () => {
    // `peek` no es una pose escalada: su viewBox de 72 ES un recorte pensado
    // para asomarse sobre el borde de una card. Suelto bajo el globo, Brot
    // queda cortado en el aire — y encima su escala 92/72 le da 15,3dp de
    // tinta por arriba, que se comerían la colita.
    expect(ARC_BROT_MESSAGES.filter((m) => m.pose === 'peek')).toEqual([])
  })

  it('ninguna pose se repite tanto como para que Brot se vuelva previsible', () => {
    const byPose = new Map<string, number>()
    for (const message of ARC_BROT_MESSAGES) {
      byPose.set(message.pose, (byPose.get(message.pose) ?? 0) + 1)
    }
    for (const [pose, count] of byPose) {
      expect(count, `pose ${pose}`).toBeLessThanOrEqual(5)
    }
  })
})

describe('globo de chat', () => {
  it('el globo despeja la tinta que Brot saca fuera de su caja', () => {
    // EL contrato que se rompió en device y que el prototipo no puede
    // mostrar: el componente web del handoff recorta exacto al viewBox, así
    // que ahí Brot nunca invade nada. En RN el canvas sobresale
    // `BROT_INK_BLEED_TOP` unidades por arriba para no guillotinar las hojas
    // al saltar, y con el aire medido sólo contra la CAJA esas hojas se
    // metían dentro del globo (cheer/radiant, ~3dp de invasión).
    expect(ARC_BUBBLE_GAP).toBeGreaterThanOrEqual(ARC_BROT_INK_ABOVE)
    // Y que sobre algo visible, no que apenas rocen.
    expect(ARC_BUBBLE_GAP - ARC_BROT_INK_ABOVE).toBeGreaterThanOrEqual(3)
  })

  it('sin colita, el globo se queda CERCA de Brot', () => {
    // No hay conector que lo señale: lo que lo hace suyo es la cercanía. Si
    // el aire creciera, el globo se leería como un cartel suelto del arco y
    // no como algo que dice Brot.
    expect(ARC_BUBBLE_GAP).toBeLessThanOrEqual(ARC_BROT_INK_ABOVE + 8)
  })
})

describe('createArcBrotPicker', () => {
  it('reparte los 40 antes de repetir ninguno', () => {
    const picker = createArcBrotPicker(ARC_BROT_COUNT, seeded(7))
    const seen = new Set<number>()
    for (let i = 0; i < ARC_BROT_COUNT; i += 1) seen.add(picker.next())
    expect(seen.size).toBe(ARC_BROT_COUNT)
  })

  it('no repite en el empalme entre dos vueltas', () => {
    // Barajado GUIONADO, no un seed: la costura entre vueltas es el único
    // punto donde la bolsa puede repetir, y con un seed cualquiera casi nunca
    // se pisa (probé 12 vueltas con seed y el caso no aparecía ni una vez —
    // el test pasaba con la protección desactivada).
    //
    // Con n = 3 y este guion, Fisher-Yates deja la primera vuelta en
    // [0,1,2] (se saca 2, 1, 0) y la segunda en [2,1,0]: el 0 queda otra vez
    // al final, justo después de haber salido. Sin la permuta al recargar,
    // `next()` devuelve 0 dos veces seguidas.
    const scripted = [0.9, 0.9, 0.1, 0.9]
    let call = 0
    const picker = createArcBrotPicker(3, () => scripted[call++] ?? 0.9)
    expect([picker.next(), picker.next(), picker.next()]).toEqual([2, 1, 0])
    expect(picker.next()).not.toBe(0)
  })

  it('tampoco repite a lo largo de muchas vueltas', () => {
    const picker = createArcBrotPicker(ARC_BROT_COUNT, seeded(99))
    let previous = -1
    for (let i = 0; i < ARC_BROT_COUNT * 12; i += 1) {
      const next = picker.next()
      expect(next).not.toBe(previous)
      previous = next
    }
  })

  it('el orden cambia entre vueltas', () => {
    const picker = createArcBrotPicker(ARC_BROT_COUNT, seeded(3))
    const first: number[] = []
    const second: number[] = []
    for (let i = 0; i < ARC_BROT_COUNT; i += 1) first.push(picker.next())
    for (let i = 0; i < ARC_BROT_COUNT; i += 1) second.push(picker.next())
    expect(second).not.toEqual(first)
  })

  it('con un solo mensaje no se cuelga', () => {
    const picker = createArcBrotPicker(1, seeded(1))
    expect([picker.next(), picker.next(), picker.next()]).toEqual([0, 0, 0])
  })

  it('con el catálogo vacío devuelve 0 en vez de undefined', () => {
    const picker = createArcBrotPicker(0, seeded(1))
    expect(picker.next()).toBe(0)
  })
})
