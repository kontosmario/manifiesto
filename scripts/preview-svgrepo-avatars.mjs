#!/usr/bin/env node
// Preview de los avatares svgrepo (clásicos, monocromos simples) en
// los dos modos del tema de Manifiesto. El usuario prefiere este
// estilo "sencillo" sobre los multicolor cartoon avatars actuales.
//
// El proceso por SVG:
//   1. Lee el original desde ~/Downloads/archive/<slug>-svgrepo-com.svg
//   2. Strip de TODOS los `fill="..."` para que las paths hereden del
//      `<g>` padre (silueta unificada — mismo trick que usamos para
//      el relief pack actual)
//   3. Render en 3 columnas: original | mono·light | mono·dark
//
// Output: tmp/svgrepo-avatars-preview.html

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(os.homedir(), 'Downloads/archive')
const OUT_FILE = path.join(ROOT, 'tmp/svgrepo-avatars-preview.html')

const VIEWBOX = 1024
// Selective stroke: only paths whose bbox area is ≥ this fraction of
// the canvas get their outline drawn. Below this threshold paths just
// contribute to the silhouette fill — keeps decorative micro-details
// (whiskers, fur tips, tiny eye dots) from cluttering the contour.
const STROKE_AREA_THRESHOLD = 0.025 // 2.5% of canvas
const STROKE_WIDTH = 6

// Theme tokens — mismos que avatar-animal.tsx usa actualmente.
const THEME = {
  light: {
    canvas: '#F4F2ED',
    avatarBg: '#FAF4EA', // creamSoft
    avatarTint: '#297811', // primary-800 — silueta deep forest sobre cream
    traceStroke: '#0F2D06', // primary-950 — contorno aún más oscuro para que se vea sobre la silueta
  },
  dark: {
    canvas: '#12211A',
    avatarBg: '#305A47', // creamCard dark — surface-800
    avatarTint: '#F2EAD3', // cream — silueta light sobre el ring forest
    traceStroke: '#FAF4EA', // creamSoft — contorno claro contrastante
  },
}

function bboxCoverage(d) {
  const ns = d.match(/-?\d+(?:\.\d+)?/g) || []
  if (ns.length < 4) return { x: 0, y: 0 }
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity
  for (let i = 0; i < ns.length - 1; i += 2) {
    const x = parseFloat(ns[i])
    const y = parseFloat(ns[i + 1])
    if (x < mnX) mnX = x
    if (x > mxX) mxX = x
    if (y < mnY) mnY = y
    if (y > mxY) mxY = y
  }
  return { x: (mxX - mnX) / VIEWBOX, y: (mxY - mnY) / VIEWBOX }
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
  // Returns the full fill body (all paths flattened) and an outline
  // subset (paths with bbox area >= STROKE_AREA_THRESHOLD). Strip
  // <defs> + per-path fills so the parent <g>'s fill drives the
  // silhouette.
  const noDefs = rawInner.replace(/<defs>[\s\S]*?<\/defs>/g, '')
  const fillPaths = []
  const outlinePaths = []
  noDefs.replace(/<path\b([^>]*?)\/>/g, (match, attrs) => {
    const dMatch = attrs.match(/\bd="([^"]+)"/)
    if (!dMatch) return ''
    const cleaned = attrs.replace(/\s*\bfill="[^"]*"/g, '')
    const tag = `<path${cleaned}/>`
    fillPaths.push(tag)
    if (pathBboxArea(dMatch[1]) >= STROKE_AREA_THRESHOLD) {
      outlinePaths.push(tag)
    }
    return ''
  })
  return {
    fillBody: fillPaths.join(''),
    outlineBody: outlinePaths.join(''),
  }
}

function buildMonoSvg(rawInner, mode) {
  // Silueta sólida sin trazos — máxima simplicidad.
  const t = THEME[mode]
  const { fillBody } = buildBodies(rawInner)
  return `<svg viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <g fill="${t.avatarTint}">
    ${fillBody}
  </g>
</svg>`
}

function buildTracesSvg(rawInner, mode) {
  // Silueta sólida + outline selectivo sobre paths grandes. Preserva
  // detalles internos (cuerpo / cabeza / patas separadas, contornos
  // de alas, marcas grandes) sin saturar con trazos micro.
  const t = THEME[mode]
  const { fillBody, outlineBody } = buildBodies(rawInner)
  return `<svg viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <g fill="${t.avatarTint}">
    ${fillBody}
  </g>
  <g fill="none" stroke="${t.traceStroke}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.55">
    ${outlineBody}
  </g>
</svg>`
}

function slugFromFilename(filename) {
  return filename.replace(/-svgrepo-com\.svg$/, '').replace(/\.svg$/, '')
}

function inlineRawSvg(svgRaw) {
  return svgRaw.replace(/<\?xml[^?]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '').trim()
}

function main() {
  const files = fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.endsWith('.svg'))
    .sort()

  const rows = files
    .map((file) => {
      const slug = slugFromFilename(file)
      const raw = fs.readFileSync(path.join(SRC_DIR, file), 'utf8')
      const inner = extractInner(raw)
      const original = inlineRawSvg(raw)
      const monoLight = buildMonoSvg(inner, 'light')
      const tracesLight = buildTracesSvg(inner, 'light')
      const tracesDark = buildTracesSvg(inner, 'dark')
      return `<tr>
  <td class="slug">${slug}</td>
  <td class="cell light"><div class="ring light">${original}</div></td>
  <td class="cell light"><div class="ring light">${monoLight}</div></td>
  <td class="cell light"><div class="ring light">${tracesLight}</div></td>
  <td class="cell dark"><div class="ring dark">${tracesDark}</div></td>
</tr>`
    })
    .join('\n')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>SVGRepo avatars — preview monocromo Manifiesto</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px 16px 64px;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
    background: ${THEME.light.canvas};
    color: #12211A;
  }
  h1 { font-size: 20px; margin: 0 0 6px; letter-spacing: -0.02em; text-align: center; }
  p.lede { font-size: 13px; margin: 0 0 24px; text-align: center; color: #3B6D57; }
  table { border-collapse: separate; border-spacing: 0; margin: 0 auto; background: #FFFBF2; border-radius: 18px; overflow: hidden; box-shadow: 0 12px 40px -16px rgba(15,46,31,0.18); }
  th { padding: 14px 18px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #EFE8D9; }
  th.head.light { background: #FAF4EA; color: #244235; }
  th.head.dark  { background: #12211A; color: #A6EF8F; border-color: #1F332A; }
  th:first-child { width: 120px; text-align: right; background: #F4EFE3; color: #3B6D57; }
  td { padding: 14px 18px; vertical-align: middle; border-bottom: 1px solid #F4EFE3; }
  td.cell.dark { border-bottom-color: #1F332A; }
  tr:last-child td { border-bottom: none; }
  .slug { font-size: 13px; font-weight: 700; text-align: right; color: #244235; font-variant: tabular-nums; }
  .cell { width: 140px; }
  .cell.dark { background: ${THEME.dark.canvas}; }
  .ring {
    width: 108px;
    height: 108px;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
  }
  .ring.light { background: ${THEME.light.avatarBg}; }
  .ring.dark  { background: ${THEME.dark.avatarBg}; }
  .ring svg { width: 78%; height: 78%; display: block; }
</style>
</head>
<body>
<h1>SVGRepo avatars — preview Manifiesto</h1>
<p class="lede">${files.length} slugs × 4 variantes — original · monocromo plano · monocromo + trazos internos (light + dark)</p>
<table>
<thead>
<tr>
  <th>slug</th>
  <th class="head light">original</th>
  <th class="head light">mono plano</th>
  <th class="head light">mono + trazos</th>
  <th class="head dark">trazos · dark</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  fs.writeFileSync(OUT_FILE, html, 'utf8')
  process.stdout.write(`Written: ${OUT_FILE} (${files.length} slugs)\n`)
}

main()
