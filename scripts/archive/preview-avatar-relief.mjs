#!/usr/bin/env node
// Build an HTML preview comparing 4 monochrome 3D-relief variants of
// each avatar across both palettes (mint / peach) × both modes
// (light / dark). The original full-color variant is omitted because
// the relief is meant to replace it.
//
// Output: tmp/avatar-relief-preview.html
//
// Relief technique:
//   - Strip every individual `fill` from each path so the entire figure
//     inherits a single fill from the parent <g>. The figure becomes a
//     unified silhouette.
//   - Strip BG washes (perimeter rects + ≥92% bbox coverage) entirely.
//   - Center-scale the silhouette to 0.85 so canvas-hugging artwork
//     (vaca / tucan / oveja) gets natural padding and the drop shadow
//     no longer bleeds into a square halo behind the figure.
//   - Apply a diagonal LinearGradient (top-left light → bottom-right
//     deep) for the embossed body.
//   - Apply a thin stroke on every path so internal contours (head /
//     body / ear separations, wings, eyes) survive the silhouette
//     flattening.
//   - Apply a soft drop shadow filter for elevation.
//   - Apply a translucent rim highlight overlay (mix-blend-mode:
//     screen) simulating directional light from top-left.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const RAW_DIR = path.join(ROOT, 'mobile/assets/avatars/raw')
const OUT_FILE = path.join(ROOT, 'tmp/avatar-relief-preview.html')

const VIEWBOX = 1024
// Baseline scale used when the artwork already has natural padding
// inside the viewBox (most of the pack). For figures that hug the
// canvas borders (vaca / tucan / oveja), `computeAdaptiveScale` shrinks
// further so the silhouette still reads as a figure inside the circle
// instead of a square slab.
const FIGURE_SCALE = 0.85
// Target maximum dimension a figure can occupy after adaptive scaling.
// 0.78 leaves ~11% padding on each side — enough for the drop shadow
// to render fully inside the avatar circle without wrapping around
// like a square halo.
const TARGET_MAX_DIM = 0.78
const STROKE_WIDTH = 5
// Strokes only apply to paths whose bbox area covers ≥ this fraction
// of the canvas. Below this threshold, the path contributes to the
// unified silhouette fill but does NOT get its outline drawn — that
// keeps decorative micro-details (whiskers, fur tips, tiny spots) from
// cluttering the relief while preserving the big anatomical contours.
const STROKE_AREA_THRESHOLD = 0.025 // 2.5% of canvas area

// Theme tokens — mirror mobile/theme/palette.ts (primaryScale, accentScale).
const VARIANTS = {
  mintLight: {
    label: 'mint · light',
    avatarBg: '#FAF4EA', // creamSoft
    cellBg: '#F4F2ED', // canvas
    gradStart: '#F4FDF2', // primary-50 (highlight)
    gradMid: '#A6EF8F', // primary-300
    gradEnd: '#297811', // primary-800 (deepest)
    stroke: '#1F590D', // primary-900
    shadow: '#1F590D',
    shadowOpacity: 0.42,
    highlight: '#FFFFFF',
    highlightOpacity: 0.5,
  },
  mintDark: {
    label: 'mint · dark',
    avatarBg: '#305A47', // creamCard dark — surface-800
    cellBg: '#12211A', // surface-950
    gradStart: '#D1F7C5', // primary-200 (highlight on dark)
    gradMid: '#77E755', // primary-400
    gradEnd: '#1F590D', // primary-900
    stroke: '#0F2D06', // primary-950
    shadow: '#0A140C',
    shadowOpacity: 0.65,
    highlight: '#F2EAD3', // cream
    highlightOpacity: 0.32,
  },
  peachLight: {
    label: 'peach · light',
    avatarBg: '#FAF4EA',
    cellBg: '#F4F2ED',
    gradStart: '#FDF4F1', // accent-50
    gradMid: '#F2A78C', // accent-300
    gradEnd: '#7C2B0E', // accent-800
    stroke: '#5C200A', // accent-900
    shadow: '#5C200A',
    shadowOpacity: 0.4,
    highlight: '#FFFFFF',
    highlightOpacity: 0.5,
  },
  peachDark: {
    label: 'peach · dark',
    avatarBg: '#305A47', // forest dark surface still — same circle bg
    cellBg: '#12211A',
    gradStart: '#F8D1C3', // accent-200
    gradMid: '#EC7A51', // accent-400
    gradEnd: '#7C2B0E', // accent-800 (deep terracotta)
    stroke: '#2E1005', // accent-950
    shadow: '#0A140C',
    shadowOpacity: 0.65,
    highlight: '#FADFC8', // peachSoft
    highlightOpacity: 0.4,
  },
}

function isPerimeterRect(dValue) {
  const numbers = dValue.match(/-?\d+(?:\.\d+)?/g) || []
  if (numbers.length < 4 || numbers.length % 2 !== 0) return false
  for (let i = 0; i < numbers.length; i += 2) {
    const x = parseFloat(numbers[i])
    const y = parseFloat(numbers[i + 1])
    const onEdge =
      Math.abs(x) < 0.5 ||
      Math.abs(x - VIEWBOX) < 0.5 ||
      Math.abs(y) < 0.5 ||
      Math.abs(y - VIEWBOX) < 0.5
    if (!onEdge) return false
  }
  return true
}

function bboxCoverage(dValue) {
  const numbers = dValue.match(/-?\d+(?:\.\d+)?/g) || []
  if (numbers.length < 4) return { x: 0, y: 0 }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < numbers.length - 1; i += 2) {
    const x = parseFloat(numbers[i])
    const y = parseFloat(numbers[i + 1])
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { x: (maxX - minX) / VIEWBOX, y: (maxY - minY) / VIEWBOX }
}

function isBgWash(dValue) {
  if (isPerimeterRect(dValue)) return true
  const c = bboxCoverage(dValue)
  return c.x >= 0.92 && c.y >= 0.92
}

function pathBboxArea(dValue) {
  // Returns the path's bbox area as a fraction of the 1024×1024 canvas.
  // Used to decide whether a path is large enough to warrant a stroke.
  const c = bboxCoverage(dValue)
  return c.x * c.y
}

function extractInner(svgRaw) {
  const m = svgRaw.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/)
  return m ? m[1] : ''
}

function detectInverseFillArtwork(rawInner) {
  // Some slugs (vaca / tucan / oveja) ship a different construction
  // than the rest: instead of a white BG with figure paths drawn on
  // top, they use a DARK perimeter-rect BG plus white "inverse-fill"
  // paths that trace from canvas corners around the figure to define
  // it by negative space. When we strip the BG and apply our gradient
  // to those paths, the inverse-fills render as canvas-edge slabs —
  // the "square behind the figure" the user reports.
  //
  // Detection signal: the original SVG ships a perimeter-rect with a
  // non-white fill (or no fill = default black). That's the giveaway
  // for the inverse-fill construction, and it cleanly catches just
  // those 3 slugs in the current pack.
  const noDefs = rawInner.replace(/<defs>[\s\S]*?<\/defs>/g, '')
  let isInverse = false
  noDefs.replace(/<path\b([^>]*?)\/>/g, (match, attrs) => {
    const dM = attrs.match(/\bd="([^"]+)"/)
    if (!dM || !isPerimeterRect(dM[1])) return ''
    const fM = attrs.match(/\bfill="([^"]+)"/)
    const fill = fM ? fM[1].toLowerCase() : null
    const isWhite =
      fill === 'white' || fill === '#ffffff' || fill === '#fff'
    if (!isWhite) isInverse = true
    return ''
  })
  return isInverse
}

function buildReliefBody(rawInner) {
  // Returns:
  //   - fillBody: every non-BG path (drives the unified silhouette via
  //     a single gradient fill on the parent <g>).
  //   - outlineBody: only paths whose bbox area ≥ STROKE_AREA_THRESHOLD
  //     (drives a sparse outline layer that preserves major features
  //     without cluttering the silhouette with micro-stroke noise).
  //   - figureUnion: the axis-aligned bbox enveloping every non-BG
  //     path, used by `computeAdaptiveTransform` to center + scale the
  //     figure into the viewBox with consistent padding regardless of
  //     how the artwork was originally laid out.
  //   - isInverseFill: true if the source uses the inverse-fill
  //     construction (signals `computeAdaptiveTransform` to shrink
  //     more aggressively).
  const noDefs = rawInner.replace(/<defs>[\s\S]*?<\/defs>/g, '')
  const isInverseFill = detectInverseFillArtwork(rawInner)
  const fillPaths = []
  const outlinePaths = []
  let mnX = Infinity
  let mxX = -Infinity
  let mnY = Infinity
  let mxY = -Infinity
  noDefs.replace(/<path\b([^>]*?)\/>/g, (match, attrs) => {
    const dMatch = attrs.match(/\bd="([^"]+)"/)
    if (!dMatch) return ''
    if (isBgWash(dMatch[1])) return ''
    const cleaned = attrs.replace(/\s*\bfill="[^"]*"/g, '')
    const tag = `<path${cleaned}/>`
    fillPaths.push(tag)
    if (pathBboxArea(dMatch[1]) >= STROKE_AREA_THRESHOLD) {
      outlinePaths.push(tag)
    }
    const ns = dMatch[1].match(/-?\d+(?:\.\d+)?/g) || []
    for (let i = 0; i < ns.length - 1; i += 2) {
      const x = parseFloat(ns[i])
      const y = parseFloat(ns[i + 1])
      if (x < mnX) mnX = x
      if (x > mxX) mxX = x
      if (y < mnY) mnY = y
      if (y > mxY) mxY = y
    }
    return ''
  })
  return {
    fillBody: fillPaths.join(''),
    outlineBody: outlinePaths.join(''),
    figureUnion: { mnX, mxX, mnY, mxY },
    isInverseFill,
  }
}

// Inverse-fill artworks (vaca / tucan / oveja) need a much tighter
// scale because the "figure" geometry intentionally extends to canvas
// corners as part of the negative-space construction. At 0.6, the
// scaled figure region fits inside the avatar circle with enough
// padding for the drop shadow to land cleanly, and the rounded corners
// of the inverse-fill regions read as part of the figure rather than a
// square slab against the avatar ring.
const INVERSE_FILL_TARGET_DIM = 0.62
const INVERSE_FILL_BASELINE = 0.62

function computeAdaptiveTransform(figureUnion, isInverseFill) {
  // Re-centers the figure inside the viewBox and shrinks it down so
  // the longest axis fits within the target max dim × VIEWBOX. Two
  // regimes:
  //   - Standard artworks: baseline FIGURE_SCALE, target TARGET_MAX_DIM.
  //   - Inverse-fill artworks: tighter both — INVERSE_FILL_BASELINE +
  //     INVERSE_FILL_TARGET_DIM — so the canvas-extending negative
  //     space construction renders inside the circle with breathing
  //     room and the drop shadow lands cleanly.
  const { mnX, mxX, mnY, mxY } = figureUnion
  const w = (mxX - mnX) / VIEWBOX
  const h = (mxY - mnY) / VIEWBOX
  const maxDim = Math.max(w, h)
  const baseline = isInverseFill ? INVERSE_FILL_BASELINE : FIGURE_SCALE
  const target = isInverseFill ? INVERSE_FILL_TARGET_DIM : TARGET_MAX_DIM
  const scale = maxDim > baseline ? Math.min(baseline, target / maxDim) : baseline
  const cx = (mnX + mxX) / 2
  const cy = (mnY + mxY) / 2
  const tx = VIEWBOX / 2 - cx * scale
  const ty = VIEWBOX / 2 - cy * scale
  return { scale, tx, ty }
}

function buildReliefSvg(rawInner, variantKey) {
  const t = VARIANTS[variantKey]
  const { fillBody, outlineBody, figureUnion, isInverseFill } = buildReliefBody(rawInner)
  const { scale, tx, ty } = computeAdaptiveTransform(figureUnion, isInverseFill)
  const id = variantKey
  return `<svg viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bodyGrad-${id}" x1="15%" y1="10%" x2="85%" y2="92%">
      <stop offset="0%" stop-color="${t.gradStart}"/>
      <stop offset="55%" stop-color="${t.gradMid}"/>
      <stop offset="100%" stop-color="${t.gradEnd}"/>
    </linearGradient>
    <linearGradient id="rim-${id}" x1="20%" y1="10%" x2="80%" y2="90%">
      <stop offset="0%" stop-color="${t.highlight}" stop-opacity="${t.highlightOpacity}"/>
      <stop offset="40%" stop-color="${t.highlight}" stop-opacity="0"/>
    </linearGradient>
    <filter id="drop-${id}" x="-25%" y="-20%" width="150%" height="160%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="12"/>
      <feOffset dx="0" dy="20" result="off"/>
      <feFlood flood-color="${t.shadow}" flood-opacity="${t.shadowOpacity}"/>
      <feComposite in2="off" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <g filter="url(#drop-${id})">
    <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">
      <g fill="url(#bodyGrad-${id})" stroke="none">
        ${fillBody}
      </g>
      <g fill="none" stroke="${t.stroke}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.55">
        ${outlineBody}
      </g>
      <g fill="url(#rim-${id})" stroke="none" style="mix-blend-mode: screen">
        ${fillBody}
      </g>
    </g>
  </g>
</svg>`
}

function main() {
  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.endsWith('.svg'))
    .sort()

  const order = ['mintLight', 'mintDark', 'peachLight', 'peachDark']

  const headerCells = order
    .map((k) => {
      const v = VARIANTS[k]
      const cls = k.includes('Dark') ? 'dark' : 'light'
      return `<th class="head ${cls}">${v.label}</th>`
    })
    .join('')

  const rows = files
    .map((file) => {
      const slug = file.replace(/\.svg$/, '')
      const raw = fs.readFileSync(path.join(RAW_DIR, file), 'utf8')
      const inner = extractInner(raw)
      const cells = order
        .map((k) => {
          const v = VARIANTS[k]
          const cls = k.includes('Dark') ? 'dark' : 'light'
          const svg = buildReliefSvg(inner, k)
          return `<td class="cell ${cls}" style="background:${v.cellBg}"><div class="ring" style="background:${v.avatarBg}">${svg}</div></td>`
        })
        .join('')
      return `<tr><td class="slug">${slug}</td>${cells}</tr>`
    })
    .join('\n')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Avatar relief preview — Manifiesto</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px 16px 64px;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
    background: #F4F2ED;
    color: #12211A;
  }
  h1 { font-size: 20px; margin: 0 0 6px; letter-spacing: -0.02em; text-align: center; }
  p.lede { font-size: 13px; margin: 0 0 24px; text-align: center; color: #3B6D57; }
  table { border-collapse: separate; border-spacing: 0; margin: 0 auto; background: #FFFBF2; border-radius: 18px; overflow: hidden; box-shadow: 0 12px 40px -16px rgba(15,46,31,0.18); }
  th { padding: 14px 18px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #EFE8D9; }
  th.head.light { background: #FAF4EA; color: #244235; }
  th.head.dark { background: #12211A; color: #A6EF8F; border-color: #1F332A; }
  th:first-child { width: 110px; text-align: right; background: #F4EFE3; color: #3B6D57; }
  td { padding: 12px 14px; vertical-align: middle; border-bottom: 1px solid #F4EFE3; }
  td.cell.dark { border-bottom-color: #1F332A; }
  tr:last-child td { border-bottom: none; }
  .slug { font-size: 13px; font-weight: 700; text-align: right; color: #244235; font-variant: tabular-nums; }
  .cell { width: 132px; }
  .ring {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
  }
  .ring svg { width: 100%; height: 100%; display: block; }
</style>
</head>
<body>
<h1>Avatar relief preview</h1>
<p class="lede">27 slugs × 4 variantes — mint · light/dark + peach · light/dark · escala adaptativa (max ${(TARGET_MAX_DIM * 100).toFixed(0)}% del canvas) · stroke selectivo (paths con bbox-area ≥ ${(STROKE_AREA_THRESHOLD * 100).toFixed(1)}%)</p>
<table>
<thead>
<tr><th>slug</th>${headerCells}</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  fs.writeFileSync(OUT_FILE, html, 'utf8')
  process.stdout.write(`Written: ${OUT_FILE}\n`)
}

main()
