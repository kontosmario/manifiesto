// Measure fern v2 branch attachment points by scanning rows ABOVE
// the stem top. At each row, find ALL contiguous cream runs and
// classify by whether the run sits left or right of the stem axis.
// The right-most extent of the LEFT halo (closest to stem) gives the
// small-leaf branch attach line; symmetrically for the BIG halo.

import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const SVG_PATH = resolve(PROJECT_ROOT, 'assets/brand/manifiesto-fern-v2-transparent.svg')

const RENDER_W = 1682
const RENDER_H = 1484
const TARGET = { r: 0xfd, g: 0xfe, b: 0xf9 }
const TOL = 30
const VIEWBOX_W = 841
const VIEWBOX_H = 742

const STEM_X_VB = 405.5
const STEM_TOP_Y_VB = 486
const SCAN_TOP_Y_VB = 360

const STEM_X_PX = (STEM_X_VB / VIEWBOX_W) * RENDER_W
const STEM_TOP_PX = Math.round((STEM_TOP_Y_VB / VIEWBOX_H) * RENDER_H)
const SCAN_TOP_PX = Math.round((SCAN_TOP_Y_VB / VIEWBOX_H) * RENDER_H)

async function main() {
  const svg = await readFile(SVG_PATH, 'utf-8')
  const { data, info } = await sharp(Buffer.from(svg), { density: 600 })
    .resize(RENDER_W, RENDER_H, { fit: 'fill', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const ch = info.channels

  // For each row: find runs, classify left/right of stem center.
  let smallNearestX = -Infinity // RIGHT-most x of LEFT halo (closest to stem from the left)
  let smallNearestY = null
  let bigNearestX = +Infinity // LEFT-most x of RIGHT halo (closest to stem from the right)
  let bigNearestY = null
  let smallExtremeX = +Infinity // LEFT-most x of LEFT halo (outer edge)
  let smallExtremeY = null
  let bigExtremeX = -Infinity
  let bigExtremeY = null

  for (let py = SCAN_TOP_PX; py < STEM_TOP_PX; py += 1) {
    let runStart = -1
    const runs = []
    for (let px = 0; px < RENDER_W; px += 1) {
      const i = (py * RENDER_W + px) * ch
      const isCream =
        data[i + 3] > 200 &&
        Math.abs(data[i] - TARGET.r) <= TOL &&
        Math.abs(data[i + 1] - TARGET.g) <= TOL &&
        Math.abs(data[i + 2] - TARGET.b) <= TOL
      if (isCream) {
        if (runStart < 0) runStart = px
      } else {
        if (runStart >= 0) {
          if (px - runStart >= 4) runs.push({ start: runStart, end: px - 1 })
          runStart = -1
        }
      }
    }
    if (runStart >= 0 && RENDER_W - 1 - runStart >= 4)
      runs.push({ start: runStart, end: RENDER_W - 1 })

    for (const r of runs) {
      const isLeftOfStem = r.end < STEM_X_PX
      const isRightOfStem = r.start > STEM_X_PX
      if (isLeftOfStem) {
        // Small halo. Track inner (right) edge closest to stem (the
        // LARGEST end x), and outer (left) edge furthest from stem.
        if (r.end > smallNearestX) {
          smallNearestX = r.end
          smallNearestY = py
        }
        if (r.start < smallExtremeX) {
          smallExtremeX = r.start
          smallExtremeY = py
        }
      } else if (isRightOfStem) {
        // Big halo. Inner = leftmost = smallest start x.
        if (r.start < bigNearestX) {
          bigNearestX = r.start
          bigNearestY = py
        }
        if (r.end > bigExtremeX) {
          bigExtremeX = r.end
          bigExtremeY = py
        }
      }
    }
  }

  const toVB = (px, py) => ({ x: (px / RENDER_W) * VIEWBOX_W, y: (py / RENDER_H) * VIEWBOX_H })

  const sIn = toVB(smallNearestX, smallNearestY)
  const sOut = toVB(smallExtremeX, smallExtremeY)
  const bIn = toVB(bigNearestX, bigNearestY)
  const bOut = toVB(bigExtremeX, bigExtremeY)

  console.log('═══ Fern v2 branch attachments (viewBox coords) ═══')
  console.log(`V tip (stem top): (${STEM_X_VB}, ${STEM_TOP_Y_VB})`)
  console.log('')
  console.log('▸ SMALL leaf halo (left of stem):')
  console.log(`  Inner edge nearest stem: (${sIn.x.toFixed(2)}, ${sIn.y.toFixed(2)})`)
  console.log(`  Outer edge: (${sOut.x.toFixed(2)}, ${sOut.y.toFixed(2)})`)
  console.log('')
  console.log('▸ BIG leaf halo (right of stem):')
  console.log(`  Inner edge nearest stem: (${bIn.x.toFixed(2)}, ${bIn.y.toFixed(2)})`)
  console.log(`  Outer edge: (${bOut.x.toFixed(2)}, ${bOut.y.toFixed(2)})`)
  console.log('')

  // Branch paths: V tip → halo inner edge attach point.
  const sBranch = `M ${STEM_X_VB} ${STEM_TOP_Y_VB} Q ${(STEM_X_VB + sIn.x) / 2} ${STEM_TOP_Y_VB - 6}, ${sIn.x.toFixed(2)} ${sIn.y.toFixed(2)}`
  const bBranch = `M ${STEM_X_VB} ${STEM_TOP_Y_VB} Q ${(STEM_X_VB + bIn.x) / 2} ${STEM_TOP_Y_VB - 6}, ${bIn.x.toFixed(2)} ${bIn.y.toFixed(2)}`

  const sLen = Math.hypot(sIn.x - STEM_X_VB, sIn.y - STEM_TOP_Y_VB)
  const bLen = Math.hypot(bIn.x - STEM_X_VB, bIn.y - STEM_TOP_Y_VB)

  console.log('--- Recommended SVG ---')
  console.log(`SMALL branch d="${sBranch}"  (length ≈ ${sLen.toFixed(0)})`)
  console.log(`BIG   branch d="${bBranch}"  (length ≈ ${bLen.toFixed(0)})`)
}

main().catch((e) => { console.error(e); process.exit(1) })
