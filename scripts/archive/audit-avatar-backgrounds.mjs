#!/usr/bin/env node
// Auditor: walk every raw avatar SVG and report which `<path>` elements
// behave like a full-canvas wash. We compute each path's axis-aligned
// bounding box from the raw `d` numerics and flag anything covering
// most of the 1024×1024 viewBox. This catches BG layers that the
// perimeter-walk detector misses (interior-waypoint rects, paths with
// curves that still envelope the canvas, etc).
//
// Usage: node scripts/audit-avatar-backgrounds.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const RAW_DIR = path.resolve(__dirname, '../mobile/assets/avatars/raw')

const VIEWBOX = 1024
const BG_COVERAGE_THRESHOLD = 0.85 // >85% of canvas in BOTH dims = BG

function bboxFromPathD(dValue) {
  const numbers = dValue.match(/-?\d+(?:\.\d+)?/g) || []
  if (numbers.length < 2) return null
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
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
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

function isNeutralBgFill(fill) {
  // Mirror of the generator's rule: white, black, near-black, or
  // missing fill (defaults to black) all count as "neutral BG fills".
  if (fill === '(default)') return true
  const f = fill.toLowerCase()
  if (f === 'white' || f === '#ffffff' || f === '#fff') return true
  if (f === 'black' || f === '#000000' || f === '#000') return true
  if (f.startsWith('#')) {
    const hex = f.replace('#', '')
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      if (r + g + b < 30) return true
    }
  }
  return false
}

function audit(file) {
  const raw = fs.readFileSync(file, 'utf8')
  const slug = path.basename(file, '.svg')
  const pathRe = /<path\b([^>]*)\/>/g
  const findings = []
  let match
  let idx = 0
  while ((match = pathRe.exec(raw))) {
    const attrs = match[1]
    const fillMatch = attrs.match(/\bfill="([^"]+)"/)
    const dMatch = attrs.match(/\bd="([^"]+)"/)
    const fill = fillMatch ? fillMatch[1] : '(default)'
    if (!dMatch) {
      idx++
      continue
    }
    const bbox = bboxFromPathD(dMatch[1])
    if (!bbox) {
      idx++
      continue
    }
    const coverageX = bbox.width / VIEWBOX
    const coverageY = bbox.height / VIEWBOX
    const isBg = coverageX > BG_COVERAGE_THRESHOLD && coverageY > BG_COVERAGE_THRESHOLD
    if (isBg) {
      const perimeter = isPerimeterRect(dMatch[1])
      const neutral = isNeutralBgFill(fill)
      const isWhite =
        fill.toLowerCase() === 'white' ||
        fill === '#FFFFFF' ||
        fill === '#fff'
      // Mirror generator's combined rule:
      //   (perimeter && neutral)  OR  (white && bbox-coverage ≥ 92%)
      const currentlyDetected = (perimeter && neutral) || (isWhite && isBg)
      findings.push({
        index: idx,
        fill,
        coverage: `${(coverageX * 100).toFixed(0)}×${(coverageY * 100).toFixed(0)}%`,
        perimeterRect: perimeter,
        currentlyDetected,
      })
    }
    idx++
  }
  return { slug, totalPaths: idx, findings }
}

const files = fs
  .readdirSync(RAW_DIR)
  .filter((f) => f.endsWith('.svg'))
  .sort()
  .map((f) => path.join(RAW_DIR, f))

let totalFlagged = 0
let totalMissed = 0

for (const f of files) {
  const result = audit(f)
  if (result.findings.length === 0) continue
  console.log(`\n● ${result.slug} (${result.totalPaths} paths total)`)
  for (const finding of result.findings) {
    const tag = finding.currentlyDetected ? '  [✓ recolored]' : '  [✗ KEPT     ]'
    const perimeter = finding.perimeterRect ? 'perimeter-rect' : 'NOT-perimeter'
    console.log(
      `${tag} path[${finding.index}] fill=${finding.fill} cover=${finding.coverage} (${perimeter})`,
    )
    totalFlagged++
    if (!finding.currentlyDetected) totalMissed++
  }
}

console.log(
  `\nSummary: ${totalFlagged} canvas-covering paths flagged, ${totalMissed} NOT recolored by current heuristic.`,
)
