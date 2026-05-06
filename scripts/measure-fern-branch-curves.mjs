// Extract the medial centerline of each silhouette branch.
//
// For each leaf bridge (the cream zone connecting the stem-top to a
// leaf base), we walk along the perpendicular to the bridge's
// dominant direction and sample the midpoint of the cream band at
// each step. The resulting points are fitted into a cubic Bézier
// suitable for a stroke-trace path that matches the silhouette's
// natural curvature.
//
// Strategy
//   ▸ Define the START anchor at the V tip (405.5, 486) — measured.
//   ▸ Define the END anchor at the leaf body base for each leaf.
//   ▸ Sample along the straight line between them; at each sample
//     find the local cream-band midpoint perpendicular to the line.
//   ▸ Output the CP1 and CP2 of a cubic that passes through the
//     anchors and best fits the sampled midpoints.

import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const SVG_PATH = resolve(PROJECT_ROOT, 'assets/brand/manifiesto-fern-v2-transparent.svg')

const RENDER_W = 1682
const RENDER_H = 1484
const VIEWBOX_W = 841
const VIEWBOX_H = 742
const TARGET = { r: 0xfd, g: 0xfe, b: 0xf9 }
const TOL = 30

const STEM_TOP = { x: 405.5, y: 486 }
// Leaf-body attachment endpoints (where the leaf path's inner-bottom
// curve meets the cream halo). Read off the SVG path data.
const SMALL_LEAF_BASE = { x: 364, y: 400 }
const BIG_LEAF_BASE = { x: 461, y: 371 }

const vbToPx = (p) => ({
  x: (p.x / VIEWBOX_W) * RENDER_W,
  y: (p.y / VIEWBOX_H) * RENDER_H,
})
const pxToVb = (p) => ({
  x: (p.x / RENDER_W) * VIEWBOX_W,
  y: (p.y / RENDER_H) * VIEWBOX_H,
})

function isCream(data, ch, idx) {
  return (
    data[idx + 3] > 200 &&
    Math.abs(data[idx] - TARGET.r) <= TOL &&
    Math.abs(data[idx + 1] - TARGET.g) <= TOL &&
    Math.abs(data[idx + 2] - TARGET.b) <= TOL
  )
}

/**
 * At the line point P, walk perpendicular to the bridge direction
 * (perpDir is a unit vector). Find the leftmost and rightmost cream
 * pixels along this perpendicular within `maxRadius` and return
 * their midpoint in pixel coords.
 */
function sampleMidpoint(data, ch, P, perpDir, maxRadius) {
  let minT = null
  let maxT = null
  for (let t = -maxRadius; t <= maxRadius; t += 1) {
    const px = Math.round(P.x + perpDir.x * t)
    const py = Math.round(P.y + perpDir.y * t)
    if (px < 0 || px >= RENDER_W || py < 0 || py >= RENDER_H) continue
    const idx = (py * RENDER_W + px) * ch
    if (isCream(data, ch, idx)) {
      if (minT === null || t < minT) minT = t
      if (maxT === null || t > maxT) maxT = t
    }
  }
  if (minT === null) return null
  const tMid = (minT + maxT) / 2
  return {
    x: P.x + perpDir.x * tMid,
    y: P.y + perpDir.y * tMid,
    width: maxT - minT, // band width in pixels along perpendicular
  }
}

async function measureBranch(data, ch, label, startVB, endVB) {
  const startPx = vbToPx(startVB)
  const endPx = vbToPx(endVB)
  const dx = endPx.x - startPx.x
  const dy = endPx.y - startPx.y
  const len = Math.hypot(dx, dy)
  // Direction along the bridge, and perpendicular (rotate 90°).
  const dir = { x: dx / len, y: dy / len }
  const perp = { x: -dir.y, y: dir.x }
  const maxRadius = 80 // px — wider than any expected band

  // Sample at N equally-spaced points along the start→end line.
  const N = 12
  const samples = []
  for (let i = 1; i < N; i += 1) {
    const t = i / N
    const P = { x: startPx.x + dx * t, y: startPx.y + dy * t }
    const mid = sampleMidpoint(data, ch, P, perp, maxRadius)
    if (mid) samples.push({ t, ...mid })
  }

  // Convert mid samples back to viewBox coords.
  const samplesVB = samples.map((s) => ({ t: s.t, ...pxToVb(s), w: (s.width / RENDER_W) * VIEWBOX_W }))
  const avgWidth = samplesVB.reduce((a, b) => a + b.w, 0) / samplesVB.length

  // Fit a cubic Bézier with anchors fixed at startVB → endVB.
  // Choose control points so the curve passes through the t=1/3 and
  // t=2/3 sampled midpoints (least-squares alternative; cheap+good).
  const findT = (target) => samplesVB.reduce((best, s) => Math.abs(s.t - target) < Math.abs(best.t - target) ? s : best, samplesVB[0])
  const p1 = findT(0.33)
  const p2 = findT(0.66)

  // Solve for CP1, CP2 from a Bézier passing exactly through p1 (at
  // t=0.33) and p2 (at t=0.66). Cubic Bézier formula at t:
  //   B(t) = (1-t)^3*P0 + 3(1-t)^2*t*CP1 + 3(1-t)*t^2*CP2 + t^3*P3
  // Solve a 2-equation system per axis.
  const solve = (axis) => {
    const t1 = p1.t, t2 = p2.t
    const a1 = 3 * (1 - t1) ** 2 * t1
    const b1 = 3 * (1 - t1) * t1 ** 2
    const c1 = p1[axis] - (1 - t1) ** 3 * startVB[axis] - t1 ** 3 * endVB[axis]
    const a2 = 3 * (1 - t2) ** 2 * t2
    const b2 = 3 * (1 - t2) * t2 ** 2
    const c2 = p2[axis] - (1 - t2) ** 3 * startVB[axis] - t2 ** 3 * endVB[axis]
    // System: a1*CP1 + b1*CP2 = c1
    //         a2*CP1 + b2*CP2 = c2
    const det = a1 * b2 - a2 * b1
    const CP1 = (c1 * b2 - c2 * b1) / det
    const CP2 = (a1 * c2 - a2 * c1) / det
    return { CP1, CP2 }
  }
  const ex = solve('x')
  const ey = solve('y')
  const CP1 = { x: ex.CP1, y: ey.CP1 }
  const CP2 = { x: ex.CP2, y: ey.CP2 }

  console.log(`▸ ${label}`)
  console.log(`  Start: (${startVB.x.toFixed(2)}, ${startVB.y.toFixed(2)})`)
  console.log(`  End:   (${endVB.x.toFixed(2)}, ${endVB.y.toFixed(2)})`)
  console.log(`  CP1:   (${CP1.x.toFixed(2)}, ${CP1.y.toFixed(2)})`)
  console.log(`  CP2:   (${CP2.x.toFixed(2)}, ${CP2.y.toFixed(2)})`)
  console.log(`  Average band width: ${avgWidth.toFixed(2)} viewBox units`)
  console.log(`  → d="M ${startVB.x.toFixed(2)} ${startVB.y.toFixed(2)} C ${CP1.x.toFixed(2)} ${CP1.y.toFixed(2)}, ${CP2.x.toFixed(2)} ${CP2.y.toFixed(2)}, ${endVB.x.toFixed(2)} ${endVB.y.toFixed(2)}"`)
  console.log(`  → stroke-width ≈ ${Math.round(avgWidth * 0.55)}  (band×0.55, leaves gentle halo around stroke)`)
  console.log('')
}

async function main() {
  const svg = await readFile(SVG_PATH, 'utf-8')
  const { data, info } = await sharp(Buffer.from(svg), { density: 600 })
    .resize(RENDER_W, RENDER_H, { fit: 'fill', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const ch = info.channels

  console.log('═══ Fern v2 branch centerline fits (viewBox coords) ═══\n')
  await measureBranch(data, ch, 'SMALL leaf branch (V → small base)', STEM_TOP, SMALL_LEAF_BASE)
  await measureBranch(data, ch, 'BIG leaf branch (V → big base)', STEM_TOP, BIG_LEAF_BASE)
}

main().catch((e) => { console.error(e); process.exit(1) })
