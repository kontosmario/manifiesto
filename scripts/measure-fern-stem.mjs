// Measure the cream silhouette's stem in `manifiesto-fern-v2-transparent.svg`.
// Renders the SVG at high resolution, scans the cream-coloured pixels
// row by row, and computes:
//   ▸ The stem centerline: a smooth curve through the midpoint of
//     the stem at each Y where it's a single, isolated band.
//   ▸ The average stem width.
//
// Output: an SVG <path> d-string + a recommended stroke-width, both
// in viewBox coordinates (0..841 × 0..742). Paste these into the web
// preview / Reanimated component so the animated stroke aligns
// perfectly with the silhouette stem.
//
// Run: node scripts/measure-fern-stem.mjs

import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const SVG_PATH = resolve(PROJECT_ROOT, 'assets/brand/manifiesto-fern-v2-transparent.svg')

// Render at this many pixels along the SVG width (842 viewBox units).
// Higher = more precision; 1684 gives sub-half-unit accuracy.
const RENDER_W = 1682
const RENDER_H = 1484 // matches viewBox aspect 841:742

// Cream silhouette colour — tolerate slight rendering variation.
const TARGET = { r: 0xfd, g: 0xfe, b: 0xf9 }
const TOL = 30

// Rows we treat as "stem" candidates: the stem lives in roughly the
// bottom 2/3 of the artwork (below the V). We exclude the very top
// where the leaves dominate. In viewBox-Y the V sits around y≈470.
// Convert to pixel-Y in the rendered image: 470 / 742 * 1484 ≈ 940.
const STEM_TOP_PX = Math.round((470 / 742) * RENDER_H)
const STEM_BOTTOM_PX = RENDER_H

async function main() {
  const svg = await readFile(SVG_PATH, 'utf-8')
  const { data, info } = await sharp(Buffer.from(svg), { density: 600 })
    .resize(RENDER_W, RENDER_H, {
      fit: 'fill',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const channels = info.channels // 4 for RGBA
  const samples = []

  for (let py = STEM_TOP_PX; py < STEM_BOTTOM_PX; py += 1) {
    // Collect runs of cream pixels on this row. We want the stem
    // to be the LARGEST single horizontal run that's reasonably narrow
    // (bounded width — wider runs are leaf body or pill).
    const runs = []
    let runStart = -1
    for (let px = 0; px < RENDER_W; px += 1) {
      const idx = (py * RENDER_W + px) * channels
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const a = channels === 4 ? data[idx + 3] : 255
      const isCream =
        a > 200 &&
        Math.abs(r - TARGET.r) <= TOL &&
        Math.abs(g - TARGET.g) <= TOL &&
        Math.abs(b - TARGET.b) <= TOL
      if (isCream) {
        if (runStart < 0) runStart = px
      } else {
        if (runStart >= 0) {
          runs.push({ start: runStart, end: px - 1 })
          runStart = -1
        }
      }
    }
    if (runStart >= 0) runs.push({ start: runStart, end: RENDER_W - 1 })

    // The stem at this row should be the SHORTEST run wider than 2px
    // (skip noise) — but only when there's effectively one isolated
    // run (no leaf overlap). When multiple runs exist on a row we're
    // intersecting leaf area; skip those rows.
    const meaningful = runs.filter((r) => r.end - r.start + 1 >= 4)
    if (meaningful.length !== 1) continue
    const [run] = meaningful
    const width = run.end - run.start + 1
    const cx = (run.start + run.end) / 2

    // Convert pixel coords back to viewBox coords.
    const vbX = (cx / RENDER_W) * 841
    const vbY = (py / RENDER_H) * 742
    const vbW = (width / RENDER_W) * 841
    samples.push({ y: vbY, x: vbX, w: vbW })
  }

  if (samples.length < 5) {
    console.error(`! Only ${samples.length} stem samples — increase tolerance or check SVG path.`)
    return
  }

  // Trim noisy ends (top sample may include V transition; bottom may
  // include the rounded cap which inflates width). Take the stable
  // middle 80%.
  const trimStart = Math.round(samples.length * 0.05)
  const trimEnd = Math.round(samples.length * 0.95)
  const stable = samples.slice(trimStart, trimEnd)

  const widths = stable.map((s) => s.w)
  const avgWidth = widths.reduce((a, b) => a + b, 0) / widths.length
  const minWidth = Math.min(...widths)
  const maxWidth = Math.max(...widths)
  const medianWidth = [...widths].sort((a, b) => a - b)[Math.floor(widths.length / 2)]

  const top = stable[0]
  const bottom = stable[stable.length - 1]
  const mid = stable[Math.floor(stable.length / 2)]

  // Build a cubic Bézier from top to bottom passing through mid.
  // Control points pulled toward each endpoint give a smooth S that
  // matches small horizontal drift of the centerline.
  const cp1 = {
    x: top.x + (mid.x - top.x) * 0.4,
    y: top.y + (bottom.y - top.y) * 0.33,
  }
  const cp2 = {
    x: mid.x + (bottom.x - mid.x) * 0.6,
    y: top.y + (bottom.y - top.y) * 0.66,
  }

  const pathD = `M ${top.x.toFixed(2)} ${top.y.toFixed(2)} C ${cp1.x.toFixed(2)} ${cp1.y.toFixed(2)}, ${cp2.x.toFixed(2)} ${cp2.y.toFixed(2)}, ${bottom.x.toFixed(2)} ${bottom.y.toFixed(2)}`

  // Approximate path length (straight-line distance is close enough
  // for stroke-dasharray purposes — the curve is near-linear).
  const pathLen = Math.hypot(bottom.x - top.x, bottom.y - top.y)

  console.log('═══ Fern v2 stem measurements (viewBox coords) ═══')
  console.log(`Sample rows: ${samples.length} (stable: ${stable.length})`)
  console.log(`Top center:    (${top.x.toFixed(2)}, ${top.y.toFixed(2)})`)
  console.log(`Mid center:    (${mid.x.toFixed(2)}, ${mid.y.toFixed(2)})`)
  console.log(`Bottom center: (${bottom.x.toFixed(2)}, ${bottom.y.toFixed(2)})`)
  console.log(`Width: avg ${avgWidth.toFixed(2)}, median ${medianWidth.toFixed(2)}, min ${minWidth.toFixed(2)}, max ${maxWidth.toFixed(2)}`)
  console.log('')
  console.log('--- Recommended SVG ---')
  console.log(`stroke-width: ${medianWidth.toFixed(0)}`)
  console.log(`d="${pathD}"`)
  console.log(`stroke-dasharray: ${Math.ceil(pathLen + 10)}  (path length ≈ ${pathLen.toFixed(0)})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
