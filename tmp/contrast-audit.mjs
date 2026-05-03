// WCAG contrast audit for the Asistente Financiero screen.
// Reads hex + rgba values, alpha-blends transparent foregrounds onto
// their actual backgrounds, then computes luminance + ratio per
// WCAG 2.1.

const hexToRgb = (hex) => {
  const h = hex.replace(/^#/, '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

const blend = (fg, bg, alpha) => ({
  r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
  g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
  b: Math.round(fg.b * alpha + bg.b * (1 - alpha)),
})

const rgbToHex = (c) =>
  '#' +
  [c.r, c.g, c.b]
    .map((v) => v.toString(16).padStart(2, '0').toUpperCase())
    .join('')

const luminance = ({ r, g, b }) => {
  const ch = (v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

const ratio = (a, b) => {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// Verdict per WCAG 2.1 — `large` true means ≥18pt or ≥14pt bold.
const verdict = (r, large) => {
  const aa = large ? 3 : 4.5
  const aaa = large ? 4.5 : 7
  if (r >= aaa) return 'AAA ✅'
  if (r >= aa) return 'AA ✅'
  return 'FAIL ❌'
}

const FOREST = hexToRgb('#0F2A1E')
const CREAM = hexToRgb('#FFFBF2')

// Pre-compute the actual rendered backgrounds for the alpha-mixed
// pills/buttons that sit over forest or cream.
const pillBgOverForest = blend(hexToRgb('#C7EE9C'), FOREST, 0.14)
// `Visto` button: rgba(15,42,30,0.07) sits over the cream card surface.
const vistoBgOverCream = blend(hexToRgb('#0F2A1E'), CREAM, 0.07)

const cases = [
  // ── Header on dark forest ────────────────────────────────────────
  {
    label: 'Header title "Asistente"',
    fg: hexToRgb('#F6FBEF'),
    bg: FOREST,
    note: '26pt bold (large)',
    large: true,
  },
  {
    label: 'Header subtitle (rgba 0.70 over forest)',
    fg: blend(hexToRgb('#F6FBEF'), FOREST, 0.7),
    bg: FOREST,
    note: '13pt medium (small)',
    large: false,
  },
  {
    label: 'Pill value "+$X" (#C7EE9C on alpha pill bg)',
    fg: hexToRgb('#C7EE9C'),
    bg: pillBgOverForest,
    note: '13pt 800 bold ⇒ counts as large',
    large: true,
  },
  {
    label: 'Pill suffix "/mes potencial" (rgba 0.70 of leaf, on pill bg)',
    fg: blend(hexToRgb('#C7EE9C'), pillBgOverForest, 0.7),
    bg: pillBgOverForest,
    note: '11pt 600 (small)',
    large: false,
  },

  // ── InsightCard on cream ─────────────────────────────────────────
  {
    label: 'Card title #0F2A1E on cream',
    fg: hexToRgb('#0F2A1E'),
    bg: CREAM,
    note: '18pt 800 (large)',
    large: true,
  },
  {
    label: 'Card body (rgba 0.78 of forest on cream)',
    fg: blend(hexToRgb('#0F2A1E'), CREAM, 0.78),
    bg: CREAM,
    note: '14pt 500 (small)',
    large: false,
  },
  {
    label: 'Impact positive #2E7D5B on cream',
    fg: hexToRgb('#2E7D5B'),
    bg: CREAM,
    note: '14pt 800 ⇒ large per WCAG',
    large: true,
  },
  {
    label: 'Impact warning #C25A3E on cream',
    fg: hexToRgb('#C25A3E'),
    bg: CREAM,
    note: '14pt 800 ⇒ large per WCAG',
    large: true,
  },
  {
    label: 'Card border rgba 0.10 of forest on cream',
    fg: blend(hexToRgb('#0F2A1E'), CREAM, 0.1),
    bg: CREAM,
    note: 'UI component (≥3:1 = AA)',
    large: true,
  },

  // ── Buttons ──────────────────────────────────────────────────────
  {
    label: 'Primary CTA: cream on forest',
    fg: hexToRgb('#FFFBF2'),
    bg: hexToRgb('#0E3A26'),
    note: '14pt 700 bold ⇒ large per WCAG',
    large: true,
  },
  {
    label: '"Visto" text (rgba 0.72 forest) on Visto bg (rgba 0.07 over cream)',
    fg: blend(hexToRgb('#0F2A1E'), vistoBgOverCream, 0.72),
    bg: vistoBgOverCream,
    note: '14pt 700 ⇒ large',
    large: true,
  },
  {
    label: '"Visto" border rgba 0.10 of forest on cream',
    fg: blend(hexToRgb('#0F2A1E'), CREAM, 0.1),
    bg: CREAM,
    note: 'UI border (≥3:1)',
    large: true,
  },

  // ── TYPE_TONES (signal icon chips on cream) ──────────────────────
  // The chip is a small filled tile; the icon glyph is foreground.
  {
    label: 'TYPE_TONES.positive icon: #1C7E3A on chip #D4F0BF',
    fg: hexToRgb('#1C7E3A'),
    bg: hexToRgb('#D4F0BF'),
    note: '18pt icon ⇒ ≥3:1 per WCAG graphics',
    large: true,
  },
  {
    label: 'TYPE_TONES.warning icon: #9C6A12 on chip #FCEAC4',
    fg: hexToRgb('#9C6A12'),
    bg: hexToRgb('#FCEAC4'),
    note: '18pt icon (≥3:1)',
    large: true,
  },
  {
    label: 'TYPE_TONES.critical icon: #B33A1F on chip #FFE2D6',
    fg: hexToRgb('#B33A1F'),
    bg: hexToRgb('#FFE2D6'),
    note: '18pt icon (≥3:1)',
    large: true,
  },
  {
    label: 'TYPE_TONES.insight icon: #3E5A4A on chip #E2EAE2',
    fg: hexToRgb('#3E5A4A'),
    bg: hexToRgb('#E2EAE2'),
    note: '18pt icon (≥3:1)',
    large: true,
  },
]

const fmt = (rgb) => `${rgbToHex(rgb)} (rgb ${rgb.r},${rgb.g},${rgb.b})`

console.log(
  '\n' +
    'WCAG audit — Asistente Financiero — alpha-blended where applicable\n' +
    '═'.repeat(70) +
    '\n',
)
for (const c of cases) {
  const r = ratio(c.fg, c.bg)
  console.log(
    `${c.label}\n  fg  ${fmt(c.fg)}\n  bg  ${fmt(c.bg)}\n  ratio  ${r.toFixed(
      2,
    )}:1   ${verdict(r, c.large)}   ${c.note}\n`,
  )
}
