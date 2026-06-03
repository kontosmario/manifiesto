import { describe, expect, it } from 'vitest'
import { parseActivityLines } from '../../mobile/features/activity-ocr/parse-activity-lines'
import type { Line } from '../../mobile/features/activity-ocr/types'

const IMAGE_WIDTH = 1206

const mk = (text: string, top: number, left: number, width: number, height: number): Line => ({
  text,
  frame: { top, left, width, height },
})

describe('parseActivityLines — empty / invalid input', () => {
  it('returns empty result for empty lines', () => {
    expect(parseActivityLines([], IMAGE_WIDTH)).toEqual({ transactions: [], unmatched: [] })
  })

  it('returns empty result for non-positive imageWidth without throwing', () => {
    const lines: Line[] = [mk('LA EUROPEA', 100, 215, 280, 60)]
    expect(parseActivityLines(lines, 0)).toEqual({ transactions: [], unmatched: [] })
    expect(parseActivityLines(lines, -5)).toEqual({ transactions: [], unmatched: [] })
  })
})

describe('parseActivityLines — reference capture (4 transactions)', () => {
  it('produces the 4 transactions from the brief reference screenshot', () => {
    const lines: Line[] = [
      // tx 1: LA EUROPEA
      mk('LA EUROPEA', 100, 215, 280, 60),
      mk('01 jun 2026', 175, 215, 220, 45),
      mk('- 26.000 ARS', 105, 940, 200, 55),
      // tx 2: USDc → ARS swap
      mk('USDc → ARS', 350, 215, 280, 60),
      mk('01 jun 2026', 425, 215, 220, 45),
      mk('- 16 USDc', 355, 940, 200, 55),
      mk('+ 23.697,71 ARS', 430, 850, 300, 50),
      // tx 3: Cashback
      mk('Cashback', 600, 215, 200, 60),
      mk('01 jun 2026', 675, 215, 220, 45),
      mk('+ 15,49 USDc', 605, 940, 220, 55),
      // tx 4: A RASCHI SANTIAGO
      mk('A RASCHI SANTIAGO', 850, 215, 320, 60),
      mk('01 jun 2026', 925, 215, 220, 45),
      mk('- 110.000 ARS', 855, 940, 220, 55),
    ]

    const result = parseActivityLines(lines, IMAGE_WIDTH)
    expect(result.unmatched).toEqual([])
    expect(result.transactions).toHaveLength(4)

    expect(result.transactions[0]).toMatchObject({
      merchant: 'LA EUROPEA',
      date: '2026-06-01',
      section: null,
      primaryAmount: { value: 26000, currency: 'ARS', sign: -1 },
      secondaryAmount: null,
    })

    expect(result.transactions[1]).toMatchObject({
      merchant: 'USDc → ARS',
      date: '2026-06-01',
      section: null,
      primaryAmount: { value: 16, currency: 'USDc', sign: -1 },
      secondaryAmount: { value: 23697.71, currency: 'ARS', sign: 1 },
    })

    expect(result.transactions[2]).toMatchObject({
      merchant: 'Cashback',
      date: '2026-06-01',
      primaryAmount: { value: 15.49, currency: 'USDc', sign: 1 },
    })

    expect(result.transactions[3]).toMatchObject({
      merchant: 'A RASCHI SANTIAGO',
      date: '2026-06-01',
      primaryAmount: { value: 110000, currency: 'ARS', sign: -1 },
    })
  })
})

describe('parseActivityLines — section inheritance', () => {
  it('inherits a section header into following transactions', () => {
    const lines: Line[] = [
      mk('Hoy', 40, 100, 100, 40),
      // tx under "Hoy"
      mk('LA EUROPEA', 200, 215, 280, 60),
      mk('01 jun 2026', 275, 215, 220, 45),
      mk('- 26.000 ARS', 205, 940, 200, 55),
    ]
    const result = parseActivityLines(lines, IMAGE_WIDTH)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].section).toBe('Hoy')
  })

  it('switches section when a new header appears mid-list', () => {
    const lines: Line[] = [
      mk('Hoy', 40, 100, 100, 40),
      // tx 1 under Hoy
      mk('A', 200, 215, 100, 60),
      mk('01 jun 2026', 275, 215, 220, 45),
      mk('- 10 ARS', 205, 940, 200, 55),
      // new section
      mk('Ayer', 500, 100, 100, 40),
      // tx 2 under Ayer
      mk('B', 700, 215, 100, 60),
      mk('31 may 2026', 775, 215, 220, 45),
      mk('- 20 ARS', 705, 940, 200, 55),
    ]
    const result = parseActivityLines(lines, IMAGE_WIDTH)
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0].section).toBe('Hoy')
    expect(result.transactions[1].section).toBe('Ayer')
  })

  it('extracts a section header bundled into a transaction group (merged by small gap)', () => {
    // Regression: en device real (2026-06-02 captura kontosmario) ML Kit
    // dejó "Hoy" en el mismo grupo Y que la primera transacción porque
    // el gap entre header y fila era < gapFactor*height. Resultado
    // anterior: merchant: "Hoy", section: null. Esperado tras fix:
    // merchant: "MERPAGO*MRPROVO", section: "Hoy".
    const lines: Line[] = [
      mk('Hoy', 100, 100, 80, 30), // header
      mk('MERPAGO*MRPROVO', 130, 215, 280, 60), // gap = 0 → merged
      mk('02 jun 2026', 195, 215, 220, 45),
      mk('- 55.984,50 ARS', 135, 940, 200, 55),
    ]
    const result = parseActivityLines(lines, IMAGE_WIDTH)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].merchant).toBe('MERPAGO*MRPROVO')
    expect(result.transactions[0].section).toBe('Hoy')
    expect(result.transactions[0].primaryAmount.value).toBe(55984.5)
    expect(result.unmatched).toEqual([])
  })
})

describe('parseActivityLines — Mercado Pago format', () => {
  // Mercado Pago tiene un layout muy distinto al bank captura:
  //   - Section headers son "31 de mayo" / "30 de mayo" (sin año)
  //   - NO HAY fecha por fila — vive solo en el section header
  //   - Currency es `$` prefix (no código ARS al final)
  //   - 3 líneas por fila izq: merchant, tipo (Compra/Transferencia),
  //     cuenta (Mastercard crédito / Visa crédito)
  //   - 2 líneas por fila der: amount + hora "HH:MM hs"
  //
  // Este fixture replica la captura kontosmario @ 2026-06-02
  // (Mercado Pago activity 31-may → 25-may). Esperado: 6 transactions,
  // todas con date derivada desde section, ARS, sign -1.

  it('parsea 6 transactions con date derivada del section header', () => {
    const lines: Line[] = [
      // section "31 de mayo"
      mk('31 de mayo', 50, 50, 200, 40),
      // tx 1 — Rio Uruguay Seguros
      mk('Rio Uruguay Seguros', 130, 215, 320, 50),
      mk('Compra', 185, 215, 100, 35),
      mk('Mastercard crédito', 230, 215, 220, 35),
      mk('- $65.600', 135, 800, 200, 45),
      mk('23:20 hs', 185, 900, 110, 30),

      // section "30 de mayo"
      mk('30 de mayo', 380, 50, 200, 40),
      // tx 2 — Claudia Beatriz Cardozo
      mk('Claudia Beatriz Cardozo', 460, 215, 380, 50),
      mk('Transferencia enviada', 515, 215, 280, 35),
      mk('Mastercard crédito', 560, 215, 220, 35),
      mk('- $16.048,50', 465, 800, 230, 45),
      mk('23:04 hs', 515, 900, 110, 30),
      // tx 3 — Mercado Libre
      mk('Mercado Libre', 700, 215, 200, 50),
      mk('Compra', 755, 215, 100, 35),
      mk('Visa crédito', 800, 215, 160, 35),
      mk('- $508.300', 705, 800, 220, 45),
      mk('14:37 hs', 755, 900, 110, 30),
      // tx 4 — Ludmila Sandra Anagua Chacon
      mk('Ludmila Sandra Anagua Chacon', 920, 215, 460, 50),
      mk('Transferencia enviada', 975, 215, 280, 35),
      mk('Mastercard crédito', 1020, 215, 220, 35),
      mk('- $51.355,20', 925, 800, 230, 45),
      mk('12:38 hs', 975, 900, 110, 30),

      // section "29 de mayo"
      mk('29 de mayo', 1170, 50, 200, 40),
      // tx 5 — Karla Belen Lencina Casabonne
      mk('Karla Belen Lencina Casabonne', 1250, 215, 470, 50),
      mk('Transferencia enviada', 1305, 215, 280, 35),
      mk('Mastercard crédito', 1350, 215, 220, 35),
      mk('- $12.478,24', 1255, 800, 230, 45),
      mk('14:04 hs', 1305, 900, 110, 30),

      // section "25 de mayo"
      mk('25 de mayo', 1490, 50, 200, 40),
      // tx 6 — Rodriguez Daniel Alejandro
      mk('Rodriguez Daniel Alejandro', 1570, 215, 440, 50),
      mk('Transferencia enviada', 1625, 215, 280, 35),
      mk('- $20.000', 1575, 800, 200, 45),
      mk('19:10 hs', 1625, 900, 110, 30),
    ]

    const result = parseActivityLines(lines, IMAGE_WIDTH, { defaultYear: 2026 })

    expect(result.unmatched).toEqual([])
    expect(result.transactions).toHaveLength(6)

    // Nota: tras el cambio a "join all merchant-candidate lines"
    // para soportar descripciones multi-línea de Santander/Provincia,
    // los merchants de Mercado Pago incluyen el tipo (Compra /
    // Transferencia enviada) y la cuenta (Mastercard crédito / Visa
    // crédito) joineadas con espacios. Es verbose pero accurate; la
    // UI de Phase D permitirá al user limpiarlos antes de guardar.
    expect(result.transactions[0]).toMatchObject({
      merchant: 'Rio Uruguay Seguros Compra Mastercard crédito',
      section: '31 de mayo',
      date: '2026-05-31',
      primaryAmount: { value: 65600, currency: 'ARS', sign: -1 },
    })
    expect(result.transactions[1]).toMatchObject({
      merchant: 'Claudia Beatriz Cardozo Transferencia enviada Mastercard crédito',
      section: '30 de mayo',
      date: '2026-05-30',
      primaryAmount: { value: 16048.5, currency: 'ARS', sign: -1 },
    })
    expect(result.transactions[2]).toMatchObject({
      merchant: 'Mercado Libre Compra Visa crédito',
      section: '30 de mayo',
      date: '2026-05-30',
      primaryAmount: { value: 508300, currency: 'ARS', sign: -1 },
    })
    expect(result.transactions[3]).toMatchObject({
      merchant: 'Ludmila Sandra Anagua Chacon Transferencia enviada Mastercard crédito',
      section: '30 de mayo',
      date: '2026-05-30',
      primaryAmount: { value: 51355.2, currency: 'ARS', sign: -1 },
    })
    expect(result.transactions[4]).toMatchObject({
      merchant: 'Karla Belen Lencina Casabonne Transferencia enviada Mastercard crédito',
      section: '29 de mayo',
      date: '2026-05-29',
      primaryAmount: { value: 12478.24, currency: 'ARS', sign: -1 },
    })
    expect(result.transactions[5]).toMatchObject({
      merchant: 'Rodriguez Daniel Alejandro Transferencia enviada',
      section: '25 de mayo',
      date: '2026-05-25',
      primaryAmount: { value: 20000, currency: 'ARS', sign: -1 },
    })
  })
})

describe('parseActivityLines — Banco Macro format', () => {
  // Macro tiene:
  //   - Section: "Mayo" (solo el mes, sin año)
  //   - Fecha por fila: "29/05" (DD/MM sin año)
  //   - Amount: "+ $8,14" / "- $30.000,00" (signo, $, número)
  //   - 1 línea izq (merchant), 1 fecha (debajo), 1 amount derecha
  it('parsea sección "Mayo" + fechas DD/MM + amounts signo+$', () => {
    // Spacing entre rows ~220pt (real Macro tiene divisor + padding
    // entre cada fila). gapFactor 1.8 default separa OK.
    const lines: Line[] = [
      mk('Mayo', 50, 50, 100, 40),
      // tx 1 — Intereses (positivo)
      mk('Intereses', 200, 100, 200, 50),
      mk('29/05', 260, 100, 80, 35),
      mk('+ $8,14', 200, 940, 200, 45),
      // tx 2 — TRANSFERENCIA REALIZADA
      mk('TRANSFERENCIA REALIZADA', 420, 100, 380, 50),
      mk('24/05', 480, 100, 80, 35),
      mk('- $30.000,00', 420, 940, 250, 45),
      // tx 3 — TRANSFERENCIA RECIBIDA (positivo)
      mk('TRANSFERENCIA RECIBIDA', 640, 100, 380, 50),
      mk('23/05', 700, 100, 80, 35),
      mk('+ $290.000,00', 640, 940, 280, 45),
      // tx 4 — COMPRA CON TARJETA DE DEBITO
      mk('COMPRA CON TARJETA DE DEBITO', 860, 100, 480, 50),
      mk('22/05', 920, 100, 80, 35),
      mk('- $7.863,79', 860, 940, 220, 45),
    ]

    const result = parseActivityLines(lines, IMAGE_WIDTH, { defaultYear: 2026 })

    expect(result.unmatched).toEqual([])
    expect(result.transactions).toHaveLength(4)

    expect(result.transactions[0]).toMatchObject({
      merchant: 'Intereses',
      section: 'Mayo',
      date: '2026-05-29',
      primaryAmount: { value: 8.14, currency: 'ARS', sign: 1 },
    })
    expect(result.transactions[1]).toMatchObject({
      merchant: 'TRANSFERENCIA REALIZADA',
      date: '2026-05-24',
      primaryAmount: { value: 30000, currency: 'ARS', sign: -1 },
    })
    expect(result.transactions[2]).toMatchObject({
      merchant: 'TRANSFERENCIA RECIBIDA',
      date: '2026-05-23',
      primaryAmount: { value: 290000, currency: 'ARS', sign: 1 },
    })
    expect(result.transactions[3]).toMatchObject({
      merchant: 'COMPRA CON TARJETA DE DEBITO',
      date: '2026-05-22',
      primaryAmount: { value: 7863.79, currency: 'ARS', sign: -1 },
    })
  })
})

describe('parseActivityLines — Banco Francés format', () => {
  // Francés tiene:
  //   - Section: "02 de junio de 2026" (día + de + mes + de + año, ya soportado)
  //   - SIN fecha por fila
  //   - Amount: "$ -5.000,00" ($-first negativo) o "$ 3,03" ($-first positivo sin signo)
  //   - 1-2 líneas izq (merchant solo, sin tipo ni cuenta)
  it('parsea amounts $-first con y sin signo + date inheritance', () => {
    // Spacing: el captura de Francés tiene cards con whitespace
    // generoso entre rows. Usamos top deltas de ~150pt para que
    // groupRows separe limpiamente.
    const lines: Line[] = [
      mk('02 de junio de 2026', 50, 50, 300, 40),
      // tx 1 — Transferencia (negativo, $-first)
      mk('Transferencia', 200, 50, 200, 50),
      mk('$ -5.000,00', 200, 800, 220, 45),
      // tx 2 — Movi.entre cuentas tarjeta
      mk('Movi.entre cuentas tarjeta', 380, 50, 350, 50),
      mk('$ -15.000,00', 380, 800, 230, 45),
      // tx 3 — Ajuste intereses ganados (positivo SIN signo)
      mk('Ajuste intereses ganados', 560, 50, 320, 50),
      mk('$ 3,03', 560, 800, 100, 45),

      mk('01 de junio de 2026', 740, 50, 300, 40),
      // tx 4 — Pago con visa debito (negativo, $-first)
      mk('Pago con visa debito', 890, 50, 280, 50),
      mk('$ -7.299,75', 890, 800, 220, 45),
    ]

    const result = parseActivityLines(lines, IMAGE_WIDTH, { defaultYear: 2026 })

    expect(result.unmatched).toEqual([])
    expect(result.transactions).toHaveLength(4)

    expect(result.transactions[0]).toMatchObject({
      merchant: 'Transferencia',
      section: '02 de junio de 2026',
      date: '2026-06-02',
      primaryAmount: { value: 5000, currency: 'ARS', sign: -1 },
    })
    expect(result.transactions[1]).toMatchObject({
      merchant: 'Movi.entre cuentas tarjeta',
      date: '2026-06-02',
      primaryAmount: { value: 15000, currency: 'ARS', sign: -1 },
    })
    expect(result.transactions[2]).toMatchObject({
      merchant: 'Ajuste intereses ganados',
      date: '2026-06-02',
      primaryAmount: { value: 3.03, currency: 'ARS', sign: 1 },
    })
    expect(result.transactions[3]).toMatchObject({
      merchant: 'Pago con visa debito',
      section: '01 de junio de 2026',
      date: '2026-06-01',
      primaryAmount: { value: 7299.75, currency: 'ARS', sign: -1 },
    })
  })
})

describe('parseActivityLines — Banco Provincia format', () => {
  // Provincia tiene:
  //   - SIN section headers (solo transactions con per-row date)
  //   - Fecha DD/MM al top de cada row (sin año)
  //   - Amount con `- $ 35.000,00` (signo + espacio + $ + número) o
  //     `$ 50.000,00` ($ + número, sin signo = positivo)
  //   - Descripción multi-línea debajo de la fecha (full-width)

  it('parsea sin sections + amounts $-with-space + descripciones multi-línea', () => {
    const lines: Line[] = [
      // tx 1 — DEBITO DEBIN (descripción 1 línea)
      mk('28/05', 100, 50, 80, 35),
      mk('- $ 35.000,00', 100, 900, 250, 45),
      mk('DEBITO DEBIN DB.DEBIN 28/05-S.064925 C:20236622445', 160, 50, 850, 40),
      // tx 2 — CREDITO TRASPASO (descripción 2 líneas)
      mk('28/05', 320, 50, 80, 35),
      mk('$ 50.000,00', 320, 900, 220, 45),
      mk('CREDITO TRASPASO CAJERO AUTOM. TRANSF DE', 380, 50, 700, 40),
      mk('CONTI/ARIEL ALFREDO (20207008142) VAR', 425, 50, 600, 40),
      // tx 3 — ACREDITACION INTERESES (positivo $-first sin signo)
      mk('26/05', 580, 50, 80, 35),
      mk('$ 11,23', 580, 900, 130, 45),
      mk('ACREDITACION INTERESES ACREDIT. INTERESES', 640, 50, 700, 40),
      mk('PERIODO DESDE 24-04-2026 HASTA 22-05-2026', 685, 50, 700, 40),
    ]

    const result = parseActivityLines(lines, IMAGE_WIDTH, { defaultYear: 2026 })

    expect(result.unmatched).toEqual([])
    expect(result.transactions).toHaveLength(3)

    expect(result.transactions[0]).toMatchObject({
      merchant: 'DEBITO DEBIN DB.DEBIN 28/05-S.064925 C:20236622445',
      section: null,
      date: '2026-05-28',
      primaryAmount: { value: 35000, currency: 'ARS', sign: -1 },
    })
    expect(result.transactions[1]).toMatchObject({
      merchant: 'CREDITO TRASPASO CAJERO AUTOM. TRANSF DE CONTI/ARIEL ALFREDO (20207008142) VAR',
      date: '2026-05-28',
      primaryAmount: { value: 50000, currency: 'ARS', sign: 1 },
    })
    expect(result.transactions[2]).toMatchObject({
      merchant: 'ACREDITACION INTERESES ACREDIT. INTERESES PERIODO DESDE 24-04-2026 HASTA 22-05-2026',
      date: '2026-05-26',
      primaryAmount: { value: 11.23, currency: 'ARS', sign: 1 },
    })
  })
})

describe('parseActivityLines — Banco Santander format', () => {
  // Santander tiene:
  //   - Sin section headers de fecha (sólo "Mov. Últimos 7 días" como label)
  //   - Fecha DD/MM/YY (año 2 dígitos = 20YY)
  //   - Amount tipo `-$200.000,00` (signo pegado a $) o `$200.000,00`
  //     (sin signo = positivo)
  //   - Concepto en 2 líneas: tipo + ID/sub-descripción

  it('parsea fechas DD/MM/YY + amounts -$ y conceptos multi-línea', () => {
    const lines: Line[] = [
      // tx 1 — Debito debin (negativo)
      mk('02/06/26', 100, 50, 110, 35),
      mk('Debito debin', 100, 220, 200, 45),
      mk('Id Debin 0v1jxon1lg6lgd0g...', 145, 240, 280, 35),
      mk('-$200.000,00', 100, 900, 220, 45),
      // tx 2 — Transf recibida cvu (positivo, sin signo)
      mk('01/06/26', 290, 50, 110, 35),
      mk('Transf recibida cvu dif titular', 290, 220, 400, 45),
      mk('De Lucas Dario Palacio / Mer...', 335, 240, 380, 35),
      mk('$200.000,00', 290, 900, 200, 45),
      // tx 3 — Compra con tarjeta de debito (negativo)
      mk('30/05/26', 480, 50, 110, 35),
      mk('Compra con tarjeta de debito', 480, 220, 380, 45),
      mk('Pago Tc Cenco - Tarj Nro. 3322', 525, 240, 380, 35),
      mk('-$174.856,53', 480, 900, 230, 45),
    ]

    const result = parseActivityLines(lines, IMAGE_WIDTH, { defaultYear: 2026 })

    expect(result.unmatched).toEqual([])
    expect(result.transactions).toHaveLength(3)

    expect(result.transactions[0]).toMatchObject({
      merchant: 'Debito debin Id Debin 0v1jxon1lg6lgd0g...',
      section: null,
      date: '2026-06-02',
      primaryAmount: { value: 200000, currency: 'ARS', sign: -1 },
    })
    expect(result.transactions[1]).toMatchObject({
      merchant: 'Transf recibida cvu dif titular De Lucas Dario Palacio / Mer...',
      date: '2026-06-01',
      primaryAmount: { value: 200000, currency: 'ARS', sign: 1 },
    })
    expect(result.transactions[2]).toMatchObject({
      merchant: 'Compra con tarjeta de debito Pago Tc Cenco - Tarj Nro. 3322',
      date: '2026-05-30',
      primaryAmount: { value: 174856.53, currency: 'ARS', sign: -1 },
    })
  })
})

describe('parseActivityLines — unmatched', () => {
  it('routes groups without a parseable amount into unmatched', () => {
    const lines: Line[] = [
      // No amount on the right → unmatched (not a section header either).
      mk('something weird', 100, 215, 280, 60),
      mk('01 jun 2026', 175, 215, 220, 45),
    ]
    const result = parseActivityLines(lines, IMAGE_WIDTH)
    expect(result.transactions).toEqual([])
    expect(result.unmatched).toHaveLength(1)
  })
})
