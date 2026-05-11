#!/usr/bin/env node
// Single-slug design exploration: render perro.svg in multiple style
// directions side-by-side so we can pick one before applying globally.
// Uses the same `fillBody` / `outlineBody` / adaptive-transform machinery
// as preview-avatar-relief.mjs but applied to a single slug across 5
// distinct visual styles × light/dark mode.
//
// Output: tmp/perro-style-variants.html

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const RAW_SVG = path.join(ROOT, 'mobile/assets/avatars/raw/perro.svg')
const OUT_FILE = path.join(ROOT, 'tmp/perro-style-variants.html')

const VIEWBOX = 1024
const FIGURE_SCALE = 0.85
const TARGET_MAX_DIM = 0.78
const STROKE_AREA_THRESHOLD = 0.025

const PALETTE = {
  light: {
    cellBg: '#F4F2ED',
    avatarBg: '#FAF4EA',
    primary: '#297811',     // primary-800
    primaryDeep: '#1F590D', // primary-900
    primaryMid: '#A6EF8F',  // primary-300
    primaryLight: '#F4FDF2',// primary-50
    accent: '#B84014',      // accent-600
    accentLight: '#F8D1C3', // accent-200
    cream: '#F2EAD3',
    creamSoft: '#FAF4EA',
    ink: '#1A1410',
    text: '#244235',
  },
  dark: {
    cellBg: '#12211A',
    avatarBg: '#305A47',
    primary: '#A6EF8F',     // primary-300
    primaryDeep: '#1F590D', // primary-900
    primaryMid: '#77E755',  // primary-400
    primaryLight: '#D1F7C5',// primary-200
    accent: '#F8D1C3',      // accent-200
    accentLight: '#FADFC8',
    cream: '#F2EAD3',
    creamSoft: '#FAF4EA',
    ink: '#0F2D06',
    text: '#A6EF8F',
  },
}

// ── shared SVG plumbing ───────────────────────────────────────────────

function isPerimeterRect(d) {
  const ns = d.match(/-?\d+(?:\.\d+)?/g) || []
  if (ns.length < 4 || ns.length % 2 !== 0) return false
  for (let i = 0; i < ns.length; i += 2) {
    const x = parseFloat(ns[i])
    const y = parseFloat(ns[i + 1])
    const onEdge =
      Math.abs(x) < 0.5 ||
      Math.abs(x - VIEWBOX) < 0.5 ||
      Math.abs(y) < 0.5 ||
      Math.abs(y - VIEWBOX) < 0.5
    if (!onEdge) return false
  }
  return true
}

function bboxCoverage(d) {
  const ns = d.match(/-?\d+(?:\.\d+)?/g) || []
  if (ns.length < 4) return { x: 0, y: 0, mnX: 0, mxX: 0, mnY: 0, mxY: 0 }
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity
  for (let i = 0; i < ns.length - 1; i += 2) {
    const x = parseFloat(ns[i])
    const y = parseFloat(ns[i + 1])
    if (x < mnX) mnX = x
    if (x > mxX) mxX = x
    if (y < mnY) mnY = y
    if (y > mxY) mxY = y
  }
  return {
    x: (mxX - mnX) / VIEWBOX,
    y: (mxY - mnY) / VIEWBOX,
    mnX, mxX, mnY, mxY,
  }
}

function isBgWash(d) {
  if (isPerimeterRect(d)) return true
  const c = bboxCoverage(d)
  return c.x >= 0.92 && c.y >= 0.92
}

function pathBboxArea(d) {
  const c = bboxCoverage(d)
  return c.x * c.y
}

function extractInner(svgRaw) {
  const m = svgRaw.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/)
  return m ? m[1] : ''
}

function buildBodies(rawInner) {
  const noDefs = rawInner.replace(/<defs>[\s\S]*?<\/defs>/g, '')
  const fillPaths = []
  const outlinePaths = []
  const allPathsWithArea = []
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity
  noDefs.replace(/<path\b([^>]*?)\/>/g, (m, attrs) => {
    const dM = attrs.match(/\bd="([^"]+)"/)
    if (!dM) return ''
    if (isBgWash(dM[1])) return ''
    const cleaned = attrs.replace(/\s*\bfill="[^"]*"/g, '')
    const tag = `<path${cleaned}/>`
    const area = pathBboxArea(dM[1])
    fillPaths.push(tag)
    allPathsWithArea.push({ tag, area })
    if (area >= STROKE_AREA_THRESHOLD) outlinePaths.push(tag)
    const ns = dM[1].match(/-?\d+(?:\.\d+)?/g) || []
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
    pathsByArea: allPathsWithArea,
    union: { mnX, mxX, mnY, mxY },
  }
}

function adaptiveTransform(union) {
  const w = (union.mxX - union.mnX) / VIEWBOX
  const h = (union.mxY - union.mnY) / VIEWBOX
  const maxDim = Math.max(w, h)
  const scale = maxDim > FIGURE_SCALE
    ? Math.min(FIGURE_SCALE, TARGET_MAX_DIM / maxDim)
    : FIGURE_SCALE
  const cx = (union.mnX + union.mxX) / 2
  const cy = (union.mnY + union.mxY) / 2
  return {
    scale,
    tx: VIEWBOX / 2 - cx * scale,
    ty: VIEWBOX / 2 - cy * scale,
  }
}

// ── style builders ────────────────────────────────────────────────────

// 1) Relief — current direction (gradient + drop shadow + selective stroke)
function buildRelief(bodies, transform, mode) {
  const p = PALETTE[mode]
  const id = `relief-${mode}`
  return `<svg viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad-${id}" x1="15%" y1="10%" x2="85%" y2="92%">
      <stop offset="0%" stop-color="${p.primaryLight}"/>
      <stop offset="55%" stop-color="${p.primaryMid}"/>
      <stop offset="100%" stop-color="${p.primary}"/>
    </linearGradient>
    <linearGradient id="rim-${id}" x1="20%" y1="10%" x2="80%" y2="90%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="${mode === 'dark' ? 0.32 : 0.5}"/>
      <stop offset="40%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="shadow-${id}" x="-25%" y="-20%" width="150%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="12"/>
      <feOffset dx="0" dy="20" result="off"/>
      <feFlood flood-color="${p.primaryDeep}" flood-opacity="${mode === 'dark' ? 0.65 : 0.42}"/>
      <feComposite in2="off" operator="in"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#shadow-${id})">
    <g transform="translate(${transform.tx.toFixed(2)} ${transform.ty.toFixed(2)}) scale(${transform.scale.toFixed(4)})">
      <g fill="url(#grad-${id})">${bodies.fillBody}</g>
      <g fill="none" stroke="${p.primaryDeep}" stroke-width="5" stroke-linejoin="round" stroke-opacity="0.55">${bodies.outlineBody}</g>
      <g fill="url(#rim-${id})" style="mix-blend-mode: screen">${bodies.fillBody}</g>
    </g>
  </g>
</svg>`
}

// 2) Sticker — chunky solid silhouette + thick cream halo + soft drop shadow
function buildSticker(bodies, transform, mode) {
  const p = PALETTE[mode]
  const id = `sticker-${mode}`
  const haloColor = mode === 'dark' ? p.cream : '#FFFFFF'
  return `<svg viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="halo-${id}" x="-25%" y="-25%" width="150%" height="150%">
      <feMorphology operator="dilate" radius="22" in="SourceAlpha" result="dil"/>
      <feFlood flood-color="${haloColor}"/>
      <feComposite in2="dil" operator="in" result="halo"/>
      <feGaussianBlur in="SourceAlpha" stdDeviation="14"/>
      <feOffset dx="0" dy="18" result="shadowOff"/>
      <feFlood flood-color="${p.primaryDeep}" flood-opacity="${mode === 'dark' ? 0.55 : 0.32}"/>
      <feComposite in2="shadowOff" operator="in" result="shadow"/>
      <feMerge>
        <feMergeNode in="shadow"/>
        <feMergeNode in="halo"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <g filter="url(#halo-${id})">
    <g transform="translate(${transform.tx.toFixed(2)} ${transform.ty.toFixed(2)}) scale(${transform.scale.toFixed(4)})">
      <g fill="${p.primary}">${bodies.fillBody}</g>
    </g>
  </g>
</svg>`
}

// 3) Outline — line art only, no fill
function buildOutline(bodies, transform, mode) {
  const p = PALETTE[mode]
  return `<svg viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(${transform.tx.toFixed(2)} ${transform.ty.toFixed(2)}) scale(${transform.scale.toFixed(4)})">
    <g fill="none" stroke="${p.primary}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">
      ${bodies.outlineBody}
    </g>
  </g>
</svg>`
}

// 4) Duotone — body in primary, top-N largest non-body details in accent
function buildDuotone(bodies, transform, mode) {
  const p = PALETTE[mode]
  // Sort paths by area desc. Largest = body. Next ~6 = accent details.
  const sorted = [...bodies.pathsByArea].sort((a, b) => b.area - a.area)
  const bodyPaths = sorted.slice(0, 1).map((x) => x.tag).join('')
  const accentPaths = sorted.slice(1, 7).map((x) => x.tag).join('')
  const restPaths = sorted.slice(7).map((x) => x.tag).join('')
  return `<svg viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(${transform.tx.toFixed(2)} ${transform.ty.toFixed(2)}) scale(${transform.scale.toFixed(4)})">
    <g fill="${p.primary}">${bodyPaths}${restPaths}</g>
    <g fill="${p.accent}">${accentPaths}</g>
  </g>
</svg>`
}

// 5) Flat — single solid silhouette, no gradient, no stroke, no shadow
function buildFlat(bodies, transform, mode) {
  const p = PALETTE[mode]
  return `<svg viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(${transform.tx.toFixed(2)} ${transform.ty.toFixed(2)}) scale(${transform.scale.toFixed(4)})">
    <g fill="${p.primary}">${bodies.fillBody}</g>
  </g>
</svg>`
}

// 6) Cutout — debossed look (figure pressed into the canvas)
function buildCutout(bodies, transform, mode) {
  const p = PALETTE[mode]
  const id = `cutout-${mode}`
  // Inner-shadow trick: render the figure with `fill="${avatarBg}"` (so it
  // matches the surrounding ring → invisible base) and overlay an inner
  // shadow filter that simulates light from top-left, dark from bottom-
  // right edges. The figure reads as a depression in the surface.
  return `<svg viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="inner-${id}" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="14" result="blur"/>
      <feOffset in="blur" dx="8" dy="10" result="off"/>
      <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="diff"/>
      <feFlood flood-color="${p.primaryDeep}" flood-opacity="${mode === 'dark' ? 0.85 : 0.55}"/>
      <feComposite in2="diff" operator="in" result="shadow"/>
      <feMerge>
        <feMergeNode in="SourceGraphic"/>
        <feMergeNode in="shadow"/>
      </feMerge>
    </filter>
  </defs>
  <g transform="translate(${transform.tx.toFixed(2)} ${transform.ty.toFixed(2)}) scale(${transform.scale.toFixed(4)})">
    <g fill="${p.primary}" filter="url(#inner-${id})">${bodies.fillBody}</g>
  </g>
</svg>`
}

// ── render the comparison page ────────────────────────────────────────

function main() {
  const raw = fs.readFileSync(RAW_SVG, 'utf8')
  const inner = extractInner(raw)
  const bodies = buildBodies(inner)
  const transform = adaptiveTransform(bodies.union)

  const VARIANTS = [
    { key: 'relief', label: 'relief', desc: 'gradiente diagonal + drop shadow + stroke selectivo (referencia actual)', build: buildRelief },
    { key: 'sticker', label: 'sticker', desc: 'silueta sólida + halo cream grueso + drop shadow suave (estilo iMessage)', build: buildSticker },
    { key: 'outline', label: 'outline', desc: 'line-art puro, sin fill — sólo contornos de los paths grandes', build: buildOutline },
    { key: 'duotone', label: 'duotone', desc: 'cuerpo en primary + 6 detalles más grandes en accent peach (editorial)', build: buildDuotone },
    { key: 'flat', label: 'flat', desc: 'silueta sólida monocromática, sin gradiente ni shadow (minimal)', build: buildFlat },
    { key: 'cutout', label: 'cutout', desc: 'figura "presionada" en la superficie via inner shadow (debossed)', build: buildCutout },
  ]

  const headerCells = VARIANTS.map((v) => `<th class="head">${v.label}</th>`).join('')

  const lightRow = `<tr><td class="mode-label">light</td>${VARIANTS.map((v) => {
    const svg = v.build(bodies, transform, 'light')
    return `<td class="cell light"><div class="ring light">${svg}</div></td>`
  }).join('')}</tr>`

  const darkRow = `<tr><td class="mode-label dark">dark</td>${VARIANTS.map((v) => {
    const svg = v.build(bodies, transform, 'dark')
    return `<td class="cell dark"><div class="ring dark">${svg}</div></td>`
  }).join('')}</tr>`

  const descRows = VARIANTS.map((v) => `<tr class="desc-row"><td><strong>${v.label}</strong></td><td colspan="6">${v.desc}</td></tr>`).join('\n')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>perro · variantes de diseño</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 16px 64px; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; background: #F4F2ED; color: #12211A; }
  h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: -0.02em; text-align: center; }
  p.lede { font-size: 13px; margin: 0 0 28px; text-align: center; color: #3B6D57; }
  table.grid { border-collapse: separate; border-spacing: 0; margin: 0 auto 24px; background: #FFFBF2; border-radius: 18px; overflow: hidden; box-shadow: 0 12px 40px -16px rgba(15,46,31,0.18); }
  table.grid th { padding: 14px 18px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #3B6D57; border-bottom: 1px solid #EFE8D9; background: #FAF4EA; }
  table.grid th:first-child { width: 90px; background: #F4EFE3; }
  table.grid td { padding: 16px 18px; vertical-align: middle; border-bottom: 1px solid #F4EFE3; }
  .mode-label { font-size: 12px; font-weight: 700; color: #244235; text-transform: uppercase; letter-spacing: 0.08em; text-align: right; padding-right: 18px !important; background: #F4EFE3; }
  .mode-label.dark { color: #A6EF8F; background: #12211A; }
  .cell { width: 160px; }
  .cell.dark { background: #12211A; border-bottom-color: #1F332A; }
  .ring { width: 120px; height: 120px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; margin: 0 auto; }
  .ring.light { background: #FAF4EA; }
  .ring.dark { background: #305A47; }
  .ring svg { width: 100%; height: 100%; display: block; }
  table.descs { border-collapse: collapse; margin: 0 auto; max-width: 900px; font-size: 13px; color: #244235; }
  table.descs td { padding: 8px 12px; border-top: 1px solid #EFE8D9; }
  table.descs td:first-child { width: 110px; color: #297811; font-weight: 700; vertical-align: top; }
</style>
</head>
<body>
<h1>perro · variantes de diseño</h1>
<p class="lede">6 estilos × light/dark — para elegir dirección antes de aplicar al pack completo</p>
<table class="grid">
<thead><tr><th></th>${headerCells}</tr></thead>
<tbody>
${lightRow}
${darkRow}
</tbody>
</table>
<table class="descs">
${descRows}
</table>
</body>
</html>`

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  fs.writeFileSync(OUT_FILE, html, 'utf8')
  process.stdout.write(`Written: ${OUT_FILE}\n`)
}

main()
