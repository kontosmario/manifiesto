#!/usr/bin/env node
// Generate iOS App Icon variants (Light / Dark / Tinted) from the
// canonical Manifiesto fern SVG (`assets/brand/manifiesto-fern-v2-transparent.svg`).
// Outputs three 1024×1024 PNGs sized for the
// `Images.xcassets/AppIcon.appiconset/Contents.json` iOS 18+
// appearances metadata.
//
// Strategy: render the recoloured v2 fern at high resolution onto a
// transparent canvas, alpha-trim to the visible bbox, scale it to fit
// a safe area, then composite onto the variant's background colour
// dead-centre. The trim step makes the output independent of how the
// SVG's viewBox is padded.
//
// Run: node scripts/generate-ios-app-icons.mjs

import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const SOURCE_SVG = resolve(PROJECT_ROOT, 'assets/brand/manifiesto-fern-v2-transparent.svg')
const OUT_DIR = resolve(PROJECT_ROOT, 'assets/brand')
const ICON_SET_DIR = resolve(
  PROJECT_ROOT,
  'ios/Manifiesto/Images.xcassets/AppIcon.appiconset',
)

// ─── Manifiesto palette (mobile/theme/palette.ts authTokens) ───────
const FOREST = '#0E3A26'
const FOREST_DEEP = '#082118'
const CREAM = '#FFFBF2'
const LEAF_BRIGHT = '#9FD97A'
const LEAF_DARK = '#1F7A4B'

// Source colours in the v2 SVG that we recolour per variant.
//   ▸ #FDFEF9 — the cream silhouette / "halo" that wraps the leaves
//     and forms the stem. Becomes `structureColor` in each variant.
//   ▸ #A9D57F — the two leaf surfaces. Becomes `leafColor`.
const SRC_SILHOUETTE = 'FDFEF9'
const SRC_LEAVES = 'A9D57F'

// Render config.
const CANVAS = 1024

function recolor(svg, leafColor, structureColor) {
  return svg
    .replaceAll(`fill="#${SRC_LEAVES}"`, `fill="${leafColor}"`)
    .replaceAll(`fill="#${SRC_LEAVES.toLowerCase()}"`, `fill="${leafColor}"`)
    .replaceAll(`fill="#${SRC_SILHOUETTE}"`, `fill="${structureColor}"`)
    .replaceAll(`fill="#${SRC_SILHOUETTE.toLowerCase()}"`, `fill="${structureColor}"`)
}

/**
 * Compose an icon by preserving the v2 SVG's native composition.
 *
 * The v2 logo's source SVG has a viewBox of 841×742 (landscape). Inside
 * that frame the designer placed the cream silhouette + leaves at very
 * specific margins (top ~15%, bottom ~12%, left ~12%, right ~7%). That
 * positioning IS the brand's reference centring — we don't re-center
 * the artwork algorithmically, we just expand the surrounding canvas
 * to a 1024×1024 square and fill the extra space with the variant's
 * background colour so it reads as one continuous frame.
 */
async function composeIcon({ svgRaw, bg, leafColor, structureColor }) {
  const recolored = recolor(svgRaw, leafColor, structureColor)

  // 1. Render the recoloured (transparent-bg) fern fitted into a
  //    1024×1024 frame. `fit: 'contain'` preserves the SVG's 841×742
  //    aspect → the artwork lands inside a 1024×904 region with the
  //    designer's exact margins; the remaining ~60px top/bottom is
  //    transparent. This reproduces the v2 SVG's native composition
  //    on a square canvas without any algorithmic re-centring.
  const fernLayer = await sharp(Buffer.from(recolored), { density: 400 })
    .resize(CANVAS, CANVAS, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()

  // 2. Composite over a fully-coloured background canvas. The bg
  //    fills both the letterbox bands and every transparent pixel
  //    inside the SVG's viewBox — exactly what the dark-green rect
  //    does inside `manifiesto-fern-v2.svg`, just driven by the
  //    variant palette.
  const composed = await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: bg,
    },
  })
    .composite([{ input: fernLayer, top: 0, left: 0 }])
    .png({ compressionLevel: 9, palette: false })
    .toBuffer()

  return {
    png: composed,
    diag: {
      mode: 'native-composition',
      canvas: `${CANVAS}×${CANVAS}`,
      bg,
    },
  }
}

async function main() {
  const svgRaw = await readFile(SOURCE_SVG, 'utf-8')

  await mkdir(OUT_DIR, { recursive: true })
  await mkdir(ICON_SET_DIR, { recursive: true })

  const variants = {
    light: {
      file: 'ios-icon-light.png',
      cfg: {
        bg: CREAM,
        leafColor: LEAF_DARK,
        structureColor: FOREST,
      },
    },
    dark: {
      file: 'ios-icon-dark.png',
      cfg: {
        bg: FOREST,
        leafColor: LEAF_BRIGHT,
        structureColor: CREAM,
      },
    },
    tinted: {
      file: 'ios-icon-tinted.png',
      cfg: {
        bg: FOREST_DEEP,
        leafColor: '#FFFFFF',
        structureColor: '#FFFFFF',
      },
    },
  }

  for (const [name, { file, cfg }] of Object.entries(variants)) {
    const { png, diag } = await composeIcon({ svgRaw, ...cfg })
    const outPath = resolve(OUT_DIR, file)
    await writeFile(outPath, png)
    const xcName = `AppIcon-${name[0].toUpperCase() + name.slice(1)}-1024x1024.png`
    await writeFile(resolve(ICON_SET_DIR, xcName), png)
    console.log(
      `✓ ${name.padEnd(7)} → ${file}  ${diag.canvas}  bg=${diag.bg}  (${diag.mode})`,
    )
  }

  const contents = {
    images: [
      {
        filename: 'AppIcon-Light-1024x1024.png',
        idiom: 'universal',
        platform: 'ios',
        size: '1024x1024',
      },
      {
        appearances: [{ appearance: 'luminosity', value: 'dark' }],
        filename: 'AppIcon-Dark-1024x1024.png',
        idiom: 'universal',
        platform: 'ios',
        size: '1024x1024',
      },
      {
        appearances: [{ appearance: 'luminosity', value: 'tinted' }],
        filename: 'AppIcon-Tinted-1024x1024.png',
        idiom: 'universal',
        platform: 'ios',
        size: '1024x1024',
      },
    ],
    info: {
      version: 1,
      author: 'manifiesto',
    },
  }
  await writeFile(
    resolve(ICON_SET_DIR, 'Contents.json'),
    JSON.stringify(contents, null, 2),
    'utf-8',
  )

  console.log('\n✓ AppIcon-{Light,Dark,Tinted}-1024x1024.png written to xcassets')
  console.log('✓ Contents.json updated')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
