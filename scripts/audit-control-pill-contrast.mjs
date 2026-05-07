#!/usr/bin/env node
// Audit WCAG contrast for the Control v2 score pill (light + dark).
//
// What it checks:
//   - Pill bg = tone @ 14% over the screen surface (per-mode)
//   - Pill border = tone @ 38%
//   - Foreground (icon + value): light mode uses an HSL-darkened
//     variant (L=22), dark mode uses the input tone as-is
//   - Text contrast ratio against the blended bg
//
// AA rule: ≥ 4.5:1 for normal text. Icons/UI ≥ 3:1.
//
// Run: node scripts/audit-control-pill-contrast.mjs

function hexToRgb(hex) { const h = hex.replace('#',''); return { r: parseInt(h.substring(0,2),16), g: parseInt(h.substring(2,4),16), b: parseInt(h.substring(4,6),16) } }
function rgbToHex({r,g,b}) { return '#' + [r,g,b].map(c => c.toString(16).padStart(2,'0')).join('').toUpperCase() }
function rgbToHsl({r,g,b}) { r/=255; g/=255; b/=255; const max=Math.max(r,g,b),min=Math.min(r,g,b); let h=0,s=0; const l=(max+min)/2; if(max!==min){const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min); switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}} return {h:h*360,s:s*100,l:l*100} }
function hslToRgb({h,s,l}) { h/=360; s/=100; l/=100; let r,g,b; if(s===0){r=g=b=l;} else {const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p}; const q=l<0.5?l*(1+s):l+s-l*s; const p=2*l-q; r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);} return {r:Math.round(r*255),g:Math.round(g*255),b:Math.round(b*255)} }
function relativeLuminance({r,g,b}){const l=c=>{const s=c/255; return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4)}; return 0.2126*l(r)+0.7152*l(g)+0.0722*l(b)}
function ratio(c1,c2){const L1=relativeLuminance(c1),L2=relativeLuminance(c2); const a=Math.max(L1,L2),b=Math.min(L1,L2); return (a+0.05)/(b+0.05)}
function blend(fg,bg,alpha){return {r:Math.round(fg.r*alpha+bg.r*(1-alpha)),g:Math.round(fg.g*alpha+bg.g*(1-alpha)),b:Math.round(fg.b*alpha+bg.b*(1-alpha))}}

function darkenForText(hex) {
  const hsl = rgbToHsl(hexToRgb(hex))
  return rgbToHex(hslToRgb({ h: hsl.h, s: Math.min(95, hsl.s + 8), l: 22 }))
}

// Approximate screen surfaces under the pill in each theme.
const surfaces = {
  light: hexToRgb('#FFFBF2'),
  dark:  hexToRgb('#0E2A1E'),
}

// Tones produced by the score adapter (control-v2-mock.ts).
const tones = {
  light: { 'green (≥65)': '#2E7D5B', 'yellow (50-64)': '#C9A23A', 'red (<50)': '#D96A4F' },
  dark:  { 'green (≥65)': '#9EE0B2', 'yellow (50-64)': '#F1D690', 'red (<50)': '#E88A70' },
}

function passLabel(r, kind) {
  if (kind === 'text') return r >= 4.5 ? '✅ AA' : r >= 3 ? '⚠ icon-only' : '❌ FAILS'
  return r >= 3 ? '✅ icon-OK' : '❌ FAILS'
}

for (const mode of ['light', 'dark']) {
  console.log(`\n=== ${mode.toUpperCase()} mode ===`)
  for (const [name, hex] of Object.entries(tones[mode])) {
    const tone = hexToRgb(hex)
    const pillBg = blend(tone, surfaces[mode], 0.14)
    const fgHex = mode === 'dark' ? hex : darkenForText(hex)
    const fg = hexToRgb(fgHex)
    const r = ratio(fg, pillBg)
    console.log(`  ${name.padEnd(16)} tone ${hex}  fg ${fgHex}  → ${r.toFixed(2)}:1  ${passLabel(r, 'text')}`)
  }
}

console.log('\nNotes:')
console.log('- Bg = tone @ 14% over the surface (alpha hex 0x24).')
console.log('- Border = tone @ 38% (not contrast-critical, 1px UI accent).')
console.log('- Light-mode foreground = darkenToneForText(tone): HSL → L=22, +8 sat.')
console.log('- Dark-mode foreground = tone as-is.')
console.log('- Suffix uses 0xC8 alpha on the foreground (~0.78 of fg) for hierarchy.')
