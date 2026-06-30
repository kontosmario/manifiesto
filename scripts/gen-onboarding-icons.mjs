#!/usr/bin/env node
/**
 * Pipeline de íconos del onboarding (selección de tipo de hogar).
 *
 * MISMO método que `gen-category-icons.mjs`: stickers multicolor del owner
 * → SVGO (precisión 1) → PNG @256 con sharp → registry `Record<key, require(png)>`.
 * Se rasteriza (en vez de emitir componentes react-native-svg) porque los
 * stickers traen gradientes/`fill-opacity` que sharp resuelve trivial y que en
 * `<Path>` serían frágiles; además entran lazy por el asset pipeline de Metro.
 *
 * A diferencia de categorías, acá NO hay grupos: son 4 íconos planos
 * (solo / familia / compartir / casa) y la key == nombre del archivo.
 *
 * Fuente: `mobile/assets/onboarding-icons/_src/<key>.svg`
 * Salida: `mobile/assets/onboarding-icons/<key>.png`
 *         `mobile/components/onboarding/onboarding-icon-registry.ts`
 *
 * Regenerar: node scripts/gen-onboarding-icons.mjs
 */
import { optimize } from 'svgo'
import sharp from 'sharp'
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'mobile/assets/onboarding-icons/_src')
const OUT = join(ROOT, 'mobile/assets/onboarding-icons')
const REG = join(ROOT, 'mobile/components/onboarding/onboarding-icon-registry.ts')
const PX = 256

function slugify(s) {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\.svg$/, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const SVGO = {
  multipass: true,
  // svgo v4 ya NO incluye removeViewBox en preset-default → el viewBox se
  // preserva solo (sharp lo necesita para escalar bien).
  plugins: [
    'preset-default',
    { name: 'cleanupNumericValues', params: { floatPrecision: 1 } },
    { name: 'convertPathData', params: { floatPrecision: 1 } },
  ],
}

async function main() {
  if (!existsSync(SRC)) {
    console.error('No existe el _src:', SRC)
    process.exit(1)
  }
  const files = readdirSync(SRC).filter((f) => f.endsWith('.svg')).sort()
  const entries = []
  mkdirSync(OUT, { recursive: true })
  for (const f of files) {
    const key = slugify(basename(f))
    const opt = optimize(readFileSync(join(SRC, f), 'utf8'), SVGO).data
    const png = join(OUT, key + '.png')
    await sharp(Buffer.from(opt), { density: 384 })
      .resize(PX, PX, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(png)
    entries.push({ key, rel: `../../assets/onboarding-icons/${key}.png` })
  }
  entries.sort((a, b) => a.key.localeCompare(b.key))

  const lines = [
    '// AUTO-GENERADO por scripts/gen-onboarding-icons.mjs — NO editar a mano.',
    '// Íconos del onboarding (stickers multicolor del owner) como PNG assets.',
    '/* eslint-disable @typescript-eslint/no-require-imports -- los PNG entran por el require() del asset pipeline de Metro (no son imports JS). */',
    "import type { ImageSourcePropType } from 'react-native'",
    '',
    'export const ONBOARDING_ICONS = {',
    ...entries.map((e) => `  ${JSON.stringify(e.key)}: require(${JSON.stringify(e.rel)}) as ImageSourcePropType,`),
    '} satisfies Record<string, ImageSourcePropType>',
    '',
    'export type OnboardingIconKey = keyof typeof ONBOARDING_ICONS',
    '',
  ]
  mkdirSync(dirname(REG), { recursive: true })
  writeFileSync(REG, lines.join('\n'))
  console.log('wrote', entries.length, 'icons →', REG)
}
main().catch((e) => { console.error(e); process.exit(1) })
