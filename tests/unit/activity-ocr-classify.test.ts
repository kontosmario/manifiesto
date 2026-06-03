import { describe, expect, it } from 'vitest'
import { classify } from '../../mobile/features/activity-ocr/parser/classify'
import type { TransactionGroup } from '../../mobile/features/activity-ocr/types'

const IMAGE_WIDTH = 1206

const mkGroup = (
  lines: Array<{ text: string; top: number; left: number; width?: number; height?: number }>,
): TransactionGroup => ({
  top: Math.min(...lines.map((l) => l.top)),
  lines: lines.map((l) => ({
    text: l.text,
    frame: { top: l.top, left: l.left, width: l.width ?? 200, height: l.height ?? 50 },
  })),
})

describe('classify — simple egreso', () => {
  it('parses LA EUROPEA / - 26.000 ARS', () => {
    const group = mkGroup([
      { text: 'LA EUROPEA', top: 100, left: 215, width: 280, height: 60 },
      { text: '01 jun 2026', top: 175, left: 215, width: 220, height: 45 },
      { text: '- 26.000 ARS', top: 105, left: 940, width: 200, height: 55 },
    ])
    const tx = classify(group, IMAGE_WIDTH)
    expect(tx).not.toBeNull()
    expect(tx!.merchant).toBe('LA EUROPEA')
    expect(tx!.date).toBe('2026-06-01')
    expect(tx!.section).toBeNull()
    expect(tx!.primaryAmount).toEqual({ value: 26000, currency: 'ARS', sign: -1 })
    expect(tx!.secondaryAmount).toBeNull()
    expect(tx!.raw).toBe('LA EUROPEA 01 jun 2026 - 26.000 ARS')
  })
})

describe('classify — swap doble monto', () => {
  it('captures both primary and secondary amounts in vertical order', () => {
    const group = mkGroup([
      { text: 'USDc → ARS', top: 230, left: 215, width: 280, height: 60 },
      { text: '01 jun 2026', top: 305, left: 215, width: 220, height: 45 },
      { text: '- 16 USDc', top: 235, left: 940, width: 200, height: 55 },
      { text: '+ 23.697,71 ARS', top: 310, left: 850, width: 300, height: 50 },
    ])
    const tx = classify(group, IMAGE_WIDTH)
    expect(tx).not.toBeNull()
    expect(tx!.merchant).toBe('USDc → ARS')
    expect(tx!.primaryAmount).toEqual({ value: 16, currency: 'USDc', sign: -1 })
    expect(tx!.secondaryAmount).toEqual({ value: 23697.71, currency: 'ARS', sign: 1 })
  })
})

describe('classify — ingreso con decimal', () => {
  it('parses Cashback / + 15,49 USDc', () => {
    const group = mkGroup([
      { text: 'Cashback', top: 450, left: 215, width: 200, height: 60 },
      { text: '01 jun 2026', top: 525, left: 215, width: 220, height: 45 },
      { text: '+ 15,49 USDc', top: 455, left: 940, width: 220, height: 55 },
    ])
    const tx = classify(group, IMAGE_WIDTH)
    expect(tx).not.toBeNull()
    expect(tx!.merchant).toBe('Cashback')
    expect(tx!.primaryAmount).toEqual({ value: 15.49, currency: 'USDc', sign: 1 })
  })
})

describe('classify — miles con punto', () => {
  it('parses "- 110.000 ARS" as 110000, not 110', () => {
    const group = mkGroup([
      { text: 'A RASCHI SANTIAGO', top: 600, left: 215, width: 320, height: 60 },
      { text: '01 jun 2026', top: 675, left: 215, width: 220, height: 45 },
      { text: '- 110.000 ARS', top: 605, left: 940, width: 220, height: 55 },
    ])
    const tx = classify(group, IMAGE_WIDTH)
    expect(tx).not.toBeNull()
    expect(tx!.primaryAmount.value).toBe(110000)
  })
})

describe('classify — sin monto reconocible', () => {
  it('returns null when no amount in the right column', () => {
    const group = mkGroup([
      { text: 'Hoy', top: 50, left: 100, width: 200, height: 50 },
    ])
    expect(classify(group, IMAGE_WIDTH)).toBeNull()
  })
})

describe('classify — Unicode minus', () => {
  it('treats "−" (U+2212) as negative sign', () => {
    const group = mkGroup([
      { text: 'TEST', top: 100, left: 215, width: 280, height: 60 },
      { text: '01 jun 2026', top: 175, left: 215, width: 220, height: 45 },
      { text: '− 50 USDc', top: 105, left: 940, width: 200, height: 55 },
    ])
    const tx = classify(group, IMAGE_WIDTH)
    expect(tx).not.toBeNull()
    expect(tx!.primaryAmount.sign).toBe(-1)
    expect(tx!.primaryAmount.value).toBe(50)
  })
})

describe('classify — column divider', () => {
  it('uses imageWidth * 0.5 as default divider', () => {
    // merchant at left 580 (just under 603 = 1206 * 0.5) → left column.
    const group = mkGroup([
      { text: 'BORDERLINE', top: 100, left: 580, width: 100, height: 60 },
      { text: '- 100 ARS', top: 100, left: 700, width: 100, height: 60 },
    ])
    const tx = classify(group, IMAGE_WIDTH)
    expect(tx!.merchant).toBe('BORDERLINE')
    expect(tx!.primaryAmount.value).toBe(100)
  })

  it('honors a custom columnDividerRatio', () => {
    // With ratio 0.7, divider is at 844 (instead of 603), so merchant at 700 is still left.
    const group = mkGroup([
      { text: 'WIDER LEFT', top: 100, left: 700, width: 100, height: 60 },
      { text: '- 100 ARS', top: 100, left: 900, width: 100, height: 60 },
    ])
    const tx = classify(group, IMAGE_WIDTH, { columnDividerRatio: 0.7 })
    expect(tx!.merchant).toBe('WIDER LEFT')
    expect(tx!.primaryAmount.value).toBe(100)
  })
})
