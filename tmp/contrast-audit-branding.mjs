// Audit del nuevo asistente theme contra los tokens de branding-preview-2026-05-02.html
const hexToRgb = (hex) => {
  const h = hex.replace(/^#/, '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}
const blend = (fg, bg, a) => ({
  r: Math.round(fg.r * a + bg.r * (1 - a)),
  g: Math.round(fg.g * a + bg.g * (1 - a)),
  b: Math.round(fg.b * a + bg.b * (1 - a)),
})
const lum = ({ r, g, b }) => {
  const c = (v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}
const ratio = (a, b) => {
  const la = lum(a),
    lb = lum(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
const verdict = (r, large) => {
  const aa = large ? 3 : 4.5
  const aaa = large ? 4.5 : 7
  if (r >= aaa) return 'AAA'
  if (r >= aa) return 'AA '
  return 'FAIL'
}
const rgba = (hex, a) => blend(hexToRgb(hex), null, a) // helper not used directly
const onBg = (fgHex, fgAlpha, bgHex) => {
  const bg = hexToRgb(bgHex)
  const fg = blend(hexToRgb(fgHex), bg, fgAlpha)
  return ratio(fg, bg)
}

// Pure RGB pair
const r = (fgHex, bgHex) => ratio(hexToRgb(fgHex), hexToRgb(bgHex))

const tokens = {
  light: {
    shell: '#F5F1E5',
    cardBg: '#FFFFFF',
    headerTitle: '#14201A',
    headerSubtitleAlpha: { hex: '#14201A', a: 0.70 },
    pillBg: { hex: '#2E8B57', a: 0.10 }, // composed on shell
    pillIcon: '#2E8B57',
    pillValue: '#1F6B43',
    pillSuffix: { hex: '#1F6B43', a: 1.0 },
    cardTitle: '#14201A',
    cardBodyAlpha: { hex: '#14201A', a: 0.74 },
    impactPositive: '#1F6B43',
    impactWarning: '#B95A2B',
    ctaBg: '#2E8B57',
    ctaText: '#FFFFFF',
    vistoBgAlpha: { hex: '#14201A', a: 0.06 },
    vistoBorderAlpha: { hex: '#14201A', a: 0.18 },
    vistoTextAlpha: { hex: '#14201A', a: 0.74 },
    cardBorderAlpha: { hex: '#14201A', a: 0.10 },
  },
  dark: {
    shell: '#0F1A14',
    cardBg: '#1A2A22',
    headerTitle: '#F2EAD3',
    headerSubtitleAlpha: { hex: '#F2EAD3', a: 0.66 },
    pillBg: { hex: '#A8D89A', a: 0.14 },
    pillIcon: '#A8D89A',
    pillValue: '#A8D89A',
    pillSuffix: { hex: '#A8D89A', a: 0.72 },
    cardTitle: '#F2EAD3',
    cardBodyAlpha: { hex: '#F2EAD3', a: 0.78 },
    impactPositive: '#A8D89A',
    impactWarning: '#E89070',
    ctaBg: '#A8D89A',
    ctaText: '#0F1A14',
    vistoBgAlpha: { hex: '#F2EAD3', a: 0.06 },
    vistoBorderAlpha: { hex: '#F2EAD3', a: 0.20 },
    vistoTextAlpha: { hex: '#F2EAD3', a: 0.78 },
    cardBorderAlpha: { hex: '#F2EAD3', a: 0.16 },
  },
}

const audit = (mode) => {
  const t = tokens[mode]
  console.log(`\n━━━ ${mode.toUpperCase()} ━━━`)

  // Header on shell
  console.log(
    `Header title vs shell: ${r(t.headerTitle, t.shell).toFixed(2)}:1  ${verdict(r(t.headerTitle, t.shell), true)}`,
  )
  const subFg = blend(hexToRgb(t.headerSubtitleAlpha.hex), hexToRgb(t.shell), t.headerSubtitleAlpha.a)
  console.log(
    `Header subtitle vs shell: ${ratio(subFg, hexToRgb(t.shell)).toFixed(2)}:1  ${verdict(ratio(subFg, hexToRgb(t.shell)), false)}`,
  )

  // Pill (composed bg on shell)
  const pillBgRgb = blend(hexToRgb(t.pillBg.hex), hexToRgb(t.shell), t.pillBg.a)
  console.log(
    `Pill value vs pill bg: ${ratio(hexToRgb(t.pillValue), pillBgRgb).toFixed(2)}:1  ${verdict(ratio(hexToRgb(t.pillValue), pillBgRgb), true)}`,
  )
  const pillSuffixFg = blend(hexToRgb(t.pillSuffix.hex), pillBgRgb, t.pillSuffix.a)
  console.log(
    `Pill suffix vs pill bg: ${ratio(pillSuffixFg, pillBgRgb).toFixed(2)}:1  ${verdict(ratio(pillSuffixFg, pillBgRgb), false)}`,
  )

  // Card on shell (UI 3:1)
  console.log(
    `Card surface vs shell: ${r(t.cardBg, t.shell).toFixed(2)}:1  ${verdict(r(t.cardBg, t.shell), true)} (UI 3:1)`,
  )
  const cardBorderFg = blend(hexToRgb(t.cardBorderAlpha.hex), hexToRgb(t.cardBg), t.cardBorderAlpha.a)
  console.log(
    `Card border vs card: ${ratio(cardBorderFg, hexToRgb(t.cardBg)).toFixed(2)}:1  ${verdict(ratio(cardBorderFg, hexToRgb(t.cardBg)), true)} (UI 3:1)`,
  )

  // Card content
  console.log(
    `Card title vs card: ${r(t.cardTitle, t.cardBg).toFixed(2)}:1  ${verdict(r(t.cardTitle, t.cardBg), true)}`,
  )
  const bodyFg = blend(hexToRgb(t.cardBodyAlpha.hex), hexToRgb(t.cardBg), t.cardBodyAlpha.a)
  console.log(
    `Card body vs card: ${ratio(bodyFg, hexToRgb(t.cardBg)).toFixed(2)}:1  ${verdict(ratio(bodyFg, hexToRgb(t.cardBg)), false)}`,
  )

  // Impact lines
  console.log(
    `Impact positive vs card: ${r(t.impactPositive, t.cardBg).toFixed(2)}:1  ${verdict(r(t.impactPositive, t.cardBg), true)}`,
  )
  console.log(
    `Impact warning vs card: ${r(t.impactWarning, t.cardBg).toFixed(2)}:1  ${verdict(r(t.impactWarning, t.cardBg), true)}`,
  )

  // CTA
  console.log(
    `CTA text vs CTA bg: ${r(t.ctaText, t.ctaBg).toFixed(2)}:1  ${verdict(r(t.ctaText, t.ctaBg), true)}`,
  )
  console.log(
    `CTA bg vs card: ${r(t.ctaBg, t.cardBg).toFixed(2)}:1  ${verdict(r(t.ctaBg, t.cardBg), true)} (UI 3:1)`,
  )

  // Visto (on card)
  const vistoBgRgb = blend(hexToRgb(t.vistoBgAlpha.hex), hexToRgb(t.cardBg), t.vistoBgAlpha.a)
  const vistoBorderRgb = blend(hexToRgb(t.vistoBorderAlpha.hex), hexToRgb(t.cardBg), t.vistoBorderAlpha.a)
  const vistoTextRgb = blend(hexToRgb(t.vistoTextAlpha.hex), vistoBgRgb, t.vistoTextAlpha.a)
  console.log(
    `Visto text vs Visto bg: ${ratio(vistoTextRgb, vistoBgRgb).toFixed(2)}:1  ${verdict(ratio(vistoTextRgb, vistoBgRgb), true)}`,
  )
  console.log(
    `Visto border vs card: ${ratio(vistoBorderRgb, hexToRgb(t.cardBg)).toFixed(2)}:1  ${verdict(ratio(vistoBorderRgb, hexToRgb(t.cardBg)), true)} (UI 3:1)`,
  )
}

audit('light')
audit('dark')
