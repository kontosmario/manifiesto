#!/usr/bin/env node
// Generates monochrome silhouette React Native Svg components from
// the raw SVG pack at mobile/assets/avatars/raw/<slug>.svg.
//
// Each component flattens the source artwork's per-path fills so the
// figure inherits a single `currentColor` from the parent <G>. The
// silhouette tint is supplied by <AvatarAnimal/> based on theme
// (primary forest in light, cream in dark). No gradient, no filter,
// no drop shadow — minimal CPU + GPU work, which lets aging Android
// hardware run them at 60fps with the rest of the relief stack
// shelved.
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
// (migration 20260515000000_avatar_pack_argentine.sql — superseded by
// the latest pack-swap migration).
const LABELS = {
  alpaca: 'Alpaca',
  anteater: 'Oso hormiguero',
  bat: 'Murciélago',
  butterfly: 'Mariposa',
  camel: 'Camello',
  cat: 'Gato',
  cow: 'Vaca',
  crab: 'Cangrejo',
  crocodile: 'Cocodrilo',
  dog: 'Perro',
  duck: 'Pato',
  elephant: 'Elefante',
  elk: 'Alce',
  fish: 'Pez',
  frog: 'Rana',
  giraffe: 'Jirafa',
  hippo: 'Hipopótamo',
  husky: 'Husky',
  kangaroo: 'Canguro',
  lion: 'León',
  macaw: 'Guacamayo',
  manatee: 'Manatí',
  mianyang: 'Carnero',
  monkey: 'Mono',
  mouse: 'Ratón',
  octopus: 'Pulpo',
  ostrich: 'Avestruz',
  owl: 'Búho',
  panda: 'Panda',
  pelican: 'Pelícano',
  penguin: 'Pingüino',
  pig: 'Cerdo',
  rabbit: 'Conejo',
  raccoon: 'Mapache',
  rhino: 'Rinoceronte',
  rooster: 'Gallo',
  shark: 'Tiburón',
  squirrel: 'Ardilla',
  swan: 'Cisne',
  tiger: 'Tigre',
  turtle: 'Tortuga',
  whale: 'Ballena',
}

const VIEWBOX = 1024

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
// remaining kebab attributes.
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

function extractSvgInner(svgRaw) {
  const m = svgRaw.match(/<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/)
  if (!m) throw new Error('Could not find <svg> root')
  return m[1]
}

function buildBody(rawInner) {
  // Strip <defs> (svgrepo SVGs use solid fills only — no gradients to
  // preserve) and every per-path `fill="..."` so each <path> inherits
  // the parent <G>'s fill (the theme tint passed in by AvatarAnimal).
  const noDefs = rawInner.replace(/<defs>[\s\S]*?<\/defs>/g, '')
  return noDefs.replace(/<path\b([^>]*?)\/>/g, (match, attrs) => {
    const cleaned = transformPathAttributes(attrs)
    return `<Path${cleaned}/>`
  })
}

// ── component template ────────────────────────────────────────────────

function buildComponentFile(slug, body) {
  const name = `${pascalCase(slug)}Avatar`
  return `// AUTO-GENERATED — do not edit by hand.
// Source: mobile/assets/avatars/raw/${slug}.svg
// Regenerate via: node scripts/generate-avatar-components.mjs
import * as React from 'react'
import Svg, { Path, G as GRaw } from 'react-native-svg'

// react-native-svg's <G> type rejects children in TSX without a cast;
// matches the codebase pattern in hero-sparkline.tsx / fern-logo.tsx.
const G = GRaw as unknown as React.FC<{
  fill?: string
  children?: React.ReactNode
}>

interface ${name}Props {
  size?: number
  /** Silhouette tint. Defaults to a deep forest that reads on cream;
   *  pass the theme primary in light mode or cream in dark mode from
   *  <AvatarAnimal/>. */
  color?: string
}

/**
 * Monochrome silhouette — every path in the source artwork is
 * stripped of its own \`fill\` and inherits the parent <G>'s color.
 * No gradient, no filter, no drop shadow — keeps render cost flat for
 * older Android hardware while staying recognizable on iOS.
 */
export function ${name}({ size = 64, color = '#297811' }: ${name}Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">
      <G fill={color}>
        ${body}
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
// to React Native Svg components. Regenerate via:
//   node scripts/generate-avatar-components.mjs
//
// If you add/remove a slug here, update the Supabase seed in the
// latest avatar-pack migration too.
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
  /** Silhouette tint. */
  color?: string
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
    const body = buildBody(inner)
    const file = buildComponentFile(slug, body)
    fs.writeFileSync(path.join(COMPONENTS_DIR, `${slug}.tsx`), file, 'utf8')
    process.stdout.write(`✓ ${slug}.tsx\n`)
  }

  fs.writeFileSync(INDEX_FILE, buildIndexFile(slugs), 'utf8')
  process.stdout.write(`✓ index.ts (${slugs.length} slugs)\n`)
}

main()
