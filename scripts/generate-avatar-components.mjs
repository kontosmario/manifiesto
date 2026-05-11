#!/usr/bin/env node
// Generates relief-style React Native Svg components from the raw SVG
// pack at mobile/assets/avatars/raw/<slug>.svg. Each component:
//
//   - flattens the original multicolor cartoon into a unified silhouette
//     by stripping every per-path `fill` so the figure inherits a
//     single gradient from the parent <G>
//   - strips full-canvas BG washes (perimeter rects + ≥92% bbox
//     coverage) so the silhouette renders with a clean cutout
//   - centers + adaptively scales the figure inside the 1024×1024
//     viewBox so canvas-hugging artwork still has padding for the drop
//     shadow to land cleanly
//   - draws a sparse outline pass on paths whose bbox area ≥ 2.5% of
//     the canvas, preserving major anatomical contours without
//     cluttering the silhouette with micro-stroke noise
//   - emits a self-contained <Filter> for the drop shadow + a
//     <LinearGradient> for the body gradient, both per-component so
//     callers can drive light/dark/peach palettes via theme tokens
//
// Theme tokens are passed as props from <AvatarAnimal/> (resolved from
// `useAppTheme().theme.isDark`). Defaults match the mint·light variant.
//
// Usage: node scripts/generate-avatar-components.mjs
//
// Side effects:
//   - rewrites mobile/assets/avatars/components/<slug>.tsx
//   - rewrites mobile/assets/avatars/index.ts (slugs + labels + map)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const RAW_DIR = path.join(ROOT, 'mobile/assets/avatars/raw')
const COMPONENTS_DIR = path.join(ROOT, 'mobile/assets/avatars/components')
const INDEX_FILE = path.join(ROOT, 'mobile/assets/avatars/index.ts')

// Spanish labels for each slug. Keep in sync with the Supabase seed
// (migration 20260515000000_avatar_pack_argentine.sql).
const LABELS = {
  alpaca: 'Alpaca',
  ballena: 'Ballena',
  capibara: 'Capibara',
  cerdo: 'Cerdo',
  colibri: 'Colibrí',
  condor: 'Cóndor',
  flamenco: 'Flamenco',
  gallina: 'Gallina',
  gato: 'Gato',
  hornero: 'Hornero',
  lechuza: 'Lechuza',
  'lobo-gris': 'Lobo gris',
  'lobo-marino': 'Lobo marino',
  mariposa: 'Mariposa',
  'mono-aullador': 'Mono aullador',
  nandu: 'Ñandú',
  nutria: 'Nutria',
  pato: 'Pato',
  perro: 'Perro',
  pinguino: 'Pingüino',
  puma: 'Puma',
  'tatu-carreta': 'Tatú carreta',
  tortuga: 'Tortuga',
  yaguarete: 'Yaguareté',
}

const VIEWBOX = 1024
const FIGURE_SCALE = 0.85
const TARGET_MAX_DIM = 0.78
const STROKE_AREA_THRESHOLD = 0.025
const STROKE_WIDTH = 5

// ── helpers ───────────────────────────────────────────────────────────

function pascalCase(slug) {
  return slug
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

const ATTR_RENAME = {
  'fill-rule': 'fillRule',
  'fill-opacity': 'fillOpacity',
  'clip-rule': 'clipRule',
  'clip-path': 'clipPath',
}

// Strips xmlns/xml:space, drops `fill` (set on parent <G>), camelCases
// remaining kebab attributes. Used per-path in the silhouette body.
function transformPathAttributes(attrChunk) {
  return attrChunk.replace(
    /([a-zA-Z][a-zA-Z0-9_:-]*)=("[^"]*")/g,
    (full, name, value) => {
      if (name === 'xmlns' || name === 'xmlns:xlink' || name === 'xml:space') return ''
      if (name === 'fill' || name === 'stroke') return ''
      const renamed = ATTR_RENAME[name] || name
      return `${renamed}=${value}`
    },
  )
}

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
  return { x: (mxX - mnX) / VIEWBOX, y: (mxY - mnY) / VIEWBOX, mnX, mxX, mnY, mxY }
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

function extractSvgInner(svgRaw) {
  const m = svgRaw.match(/<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/)
  if (!m) throw new Error('Could not find <svg> root')
  return m[2] !== undefined ? m[2] : m[1]
}

function buildBodies(rawInner) {
  // Strip <defs> (only carried multicolor gradient definitions).
  // For each <path>: drop BG washes, strip individual fills, collect
  // into fillBody (all surviving paths) and outlineBody (subset whose
  // bbox area ≥ STROKE_AREA_THRESHOLD).
  const noDefs = rawInner.replace(/<defs>[\s\S]*?<\/defs>/g, '')
  const fillPaths = []
  const outlinePaths = []
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity
  noDefs.replace(/<path\b([^>]*?)\/>/g, (match, attrs) => {
    const dM = attrs.match(/\bd="([^"]+)"/)
    if (!dM) return ''
    if (isBgWash(dM[1])) return ''
    const cleaned = transformPathAttributes(attrs)
    const tag = `<Path${cleaned}/>`
    fillPaths.push(tag)
    if (pathBboxArea(dM[1]) >= STROKE_AREA_THRESHOLD) {
      outlinePaths.push(tag)
    }
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
    union: { mnX, mxX, mnY, mxY },
    counts: { fill: fillPaths.length, outline: outlinePaths.length },
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

// ── component template ────────────────────────────────────────────────

function buildComponentFile(slug, fillBody, outlineBody, transform) {
  const name = `${pascalCase(slug)}Avatar`
  const id = slug
  return `// AUTO-GENERATED — do not edit by hand.
// Source: mobile/assets/avatars/raw/${slug}.svg
// Regenerate via: node scripts/generate-avatar-components.mjs
import * as React from 'react'
import Svg, {
  Path,
  G as GRaw,
  Defs as DefsRaw,
  LinearGradient as LinearGradientRaw,
  Stop as StopRaw,
  Filter as FilterRaw,
  FeGaussianBlur as FeGaussianBlurRaw,
  FeOffset as FeOffsetRaw,
  FeFlood as FeFloodRaw,
  FeComposite as FeCompositeRaw,
  FeMerge as FeMergeRaw,
  FeMergeNode as FeMergeNodeRaw,
} from 'react-native-svg'

// react-native-svg's exported types omit several standard SVG filter
// attributes (\`result\`, \`in\`, \`in2\`, \`floodColor\`, etc.) — runtime
// works fine, only the TS surface is missing. We cast each tag through
// React.FC with an explicit prop shape so the JSX below typechecks
// (matches the codebase pattern in hero-sparkline.tsx / fern-logo.tsx).
const G = GRaw as unknown as React.FC<{
  fill?: string
  stroke?: string
  strokeWidth?: number | string
  strokeLinejoin?: string
  strokeLinecap?: string
  strokeOpacity?: number | string
  filter?: string
  transform?: string
  children?: React.ReactNode
}>
const Defs = DefsRaw as unknown as React.FC<{ children?: React.ReactNode }>
const LinearGradient = LinearGradientRaw as unknown as React.FC<{
  id: string
  x1: string | number
  y1: string | number
  x2: string | number
  y2: string | number
  children?: React.ReactNode
}>
const Stop = StopRaw as unknown as React.FC<{
  offset: string | number
  stopColor: string
  stopOpacity?: string | number
}>
const Filter = FilterRaw as unknown as React.FC<{
  id: string
  x?: string | number
  y?: string | number
  width?: string | number
  height?: string | number
  children?: React.ReactNode
}>
const FeGaussianBlur = FeGaussianBlurRaw as unknown as React.FC<{
  in?: string
  stdDeviation?: number | string
  result?: string
}>
const FeOffset = FeOffsetRaw as unknown as React.FC<{
  in?: string
  dx?: number | string
  dy?: number | string
  result?: string
}>
const FeFlood = FeFloodRaw as unknown as React.FC<{
  floodColor?: string
  floodOpacity?: number | string
  result?: string
}>
const FeComposite = FeCompositeRaw as unknown as React.FC<{
  in?: string
  in2?: string
  operator?: string
  result?: string
}>
const FeMerge = FeMergeRaw as unknown as React.FC<{ children?: React.ReactNode }>
const FeMergeNode = FeMergeNodeRaw as unknown as React.FC<{ in?: string }>

interface ${name}Props {
  size?: number
  /** Top-of-gradient color (highlight). */
  gradStart?: string
  /** Mid-gradient color. */
  gradMid?: string
  /** Bottom-of-gradient color (deepest). */
  gradEnd?: string
  /** Selective outline color drawn on major contour paths. */
  stroke?: string
  /** Drop shadow color. */
  shadow?: string
  /** Drop shadow opacity (0..1). */
  shadowOpacity?: number
}

/**
 * Relief-style avatar — silhouette flattened from the source artwork,
 * filled with a diagonal gradient (top-left light → bottom-right deep),
 * with a soft drop shadow + a sparse stroke pass on major contours.
 * Theme tokens (gradStart/gradMid/gradEnd/stroke/shadow) are resolved
 * upstream by <AvatarAnimal /> from \`useAppTheme()\`.
 */
export function ${name}({
  size = 64,
  gradStart = '#F4FDF2',
  gradMid = '#A6EF8F',
  gradEnd = '#297811',
  stroke = '#1F590D',
  shadow = '#1F590D',
  shadowOpacity = 0.42,
}: ${name}Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">
      <Defs>
        <LinearGradient id="bodyGrad-${id}" x1="15%" y1="10%" x2="85%" y2="92%">
          <Stop offset="0%" stopColor={gradStart} />
          <Stop offset="55%" stopColor={gradMid} />
          <Stop offset="100%" stopColor={gradEnd} />
        </LinearGradient>
        <Filter id="shadow-${id}" x="-25%" y="-20%" width="150%" height="160%">
          <FeGaussianBlur in="SourceAlpha" stdDeviation="12" />
          <FeOffset dx="0" dy="20" result="off" />
          <FeFlood floodColor={shadow} floodOpacity={shadowOpacity} />
          <FeComposite in2="off" operator="in" />
          <FeMerge>
            <FeMergeNode />
            <FeMergeNode in="SourceGraphic" />
          </FeMerge>
        </Filter>
      </Defs>
      <G filter="url(#shadow-${id})">
        <G transform="translate(${transform.tx.toFixed(2)} ${transform.ty.toFixed(2)}) scale(${transform.scale.toFixed(4)})">
          <G fill="url(#bodyGrad-${id})">
            ${fillBody}
          </G>
          <G fill="none" stroke={stroke} strokeWidth={${STROKE_WIDTH}} strokeLinejoin="round" strokeLinecap="round" strokeOpacity={0.55}>
            ${outlineBody}
          </G>
        </G>
      </G>
    </Svg>
  )
}

export default ${name}
`
}

// ── index.ts template ─────────────────────────────────────────────────

function buildIndexFile(slugs) {
  const sorted = [...slugs].sort()
  const importLines = sorted
    .map((slug) => `import { ${pascalCase(slug)}Avatar } from './components/${slug}'`)
    .join('\n')
  const slugUnion = sorted.map((s) => `  | '${s}'`).join('\n')
  const slugListEntries = sorted.map((s) => `  '${s}',`).join('\n')
  const labelEntries = sorted
    .map((s) => `  ${JSON.stringify(s)}: ${JSON.stringify(LABELS[s])},`)
    .join('\n')
  const componentEntries = sorted
    .map((s) => `  ${JSON.stringify(s)}: ${pascalCase(s)}Avatar,`)
    .join('\n')

  return `// AUTO-GENERATED avatar registry. Maps DB slugs (public.avatar_animals.slug)
// to React Native Svg relief-style components. Regenerate via:
//   node scripts/generate-avatar-components.mjs
//
// If you add/remove a slug here, update the Supabase seed in
// migration 20260515000000_avatar_pack_argentine.sql too.
//
// \`AvatarAnimal\` and \`AvatarAnimalRow\` USED to be re-exported from
// here, but that produced a require cycle:
//   \`assets/avatars/index.ts\` → \`components/ui/avatar-animal.tsx\`
//   \`components/ui/avatar-animal.tsx\` → \`assets/avatars/index.ts\`
// Consumers should import the components directly from
// \`@/components/ui/avatar-animal\`. This module owns only the slug
// registry, labels, components map, and pure helpers — no UI.
import type { ComponentType } from 'react'
${importLines}

export type AvatarSlug =
${slugUnion}

export interface AvatarComponentProps {
  size?: number
  /** Top-of-gradient color (highlight). */
  gradStart?: string
  /** Mid-gradient color. */
  gradMid?: string
  /** Bottom-of-gradient color (deepest). */
  gradEnd?: string
  /** Selective outline color drawn on major contour paths. */
  stroke?: string
  /** Drop shadow color. */
  shadow?: string
  /** Drop shadow opacity (0..1). */
  shadowOpacity?: number
}

export type AvatarComponent = ComponentType<AvatarComponentProps>

export const AVATAR_SLUGS: readonly AvatarSlug[] = [
${slugListEntries}
] as const

export const AVATAR_LABELS: Record<AvatarSlug, string> = {
${labelEntries}
}

export const AVATAR_COMPONENTS: Record<AvatarSlug, AvatarComponent> = {
${componentEntries}
}

const AVATAR_SLUG_SET = new Set<string>(AVATAR_SLUGS)

export function isAvatarSlug(value: string): value is AvatarSlug {
  return AVATAR_SLUG_SET.has(value)
}

export function randomAvatarSlug(): AvatarSlug {
  const i = Math.floor(Math.random() * AVATAR_SLUGS.length)
  return AVATAR_SLUGS[i]!
}

export function getAvatarComponent(slug: AvatarSlug): AvatarComponent {
  return AVATAR_COMPONENTS[slug]
}
`
}

// ── main ──────────────────────────────────────────────────────────────

function main() {
  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.endsWith('.svg'))
    .sort()
  const slugs = files.map((f) => f.replace(/\.svg$/, ''))

  const missing = slugs.filter((s) => !(s in LABELS))
  if (missing.length) {
    throw new Error(
      `Missing label entries for slugs: ${missing.join(', ')}. ` +
      `Add them to LABELS in scripts/generate-avatar-components.mjs.`,
    )
  }
  const extra = Object.keys(LABELS).filter((s) => !slugs.includes(s))
  if (extra.length) {
    process.stdout.write(
      `Warning: LABELS has entries with no matching SVG: ${extra.join(', ')}\n`,
    )
  }

  fs.mkdirSync(COMPONENTS_DIR, { recursive: true })

  for (const slug of slugs) {
    const svgPath = path.join(RAW_DIR, `${slug}.svg`)
    const raw = fs.readFileSync(svgPath, 'utf8')
    const noXmlDecl = raw.replace(/<\?xml[^?]*\?>/, '').trim()
    const inner = extractSvgInner(noXmlDecl)
    const { fillBody, outlineBody, union, counts } = buildBodies(inner)
    const transform = adaptiveTransform(union)
    const file = buildComponentFile(slug, fillBody, outlineBody, transform)
    fs.writeFileSync(path.join(COMPONENTS_DIR, `${slug}.tsx`), file, 'utf8')
    if (process.env.AVATAR_GEN_VERBOSE) {
      process.stdout.write(
        `✓ ${slug}.tsx — fill=${counts.fill} outline=${counts.outline} scale=${transform.scale.toFixed(3)}\n`,
      )
    } else {
      process.stdout.write(`✓ ${slug}.tsx\n`)
    }
  }

  fs.writeFileSync(INDEX_FILE, buildIndexFile(slugs), 'utf8')
  process.stdout.write(`✓ index.ts (${slugs.length} slugs)\n`)
}

main()
