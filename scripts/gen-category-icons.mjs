#!/usr/bin/env node
/**
 * Pipeline de íconos de categoría (stickers multicolor del owner).
 *
 * Fuente: los SVG viven en `mobile/assets/category-icons/_src/<grupo>/<slug>.svg`
 * (copiados/optimizados desde la carpeta del owner). Este script:
 *   1. Optimiza cada SVG con SVGO (precisión 1).
 *   2. Rasteriza a PNG @256 con sharp → `mobile/assets/category-icons/<grupo>/<slug>.png`
 *      (asset del pipeline de Metro: lazy + cacheado, NO infla el bundle JS como
 *      inlinear strings; los stickers son fijos, no necesitan recolor en runtime).
 *   3. Emite `mobile/components/category/category-icon-registry.ts` con un
 *      Record<key, require(png)> + el listado de keys.
 *
 * key = "<grupo>/<slug>" (p.ej. "alimentacion/supermercado"). Estable, sin acentos.
 *
 * Primer import: pasá --import="<carpeta del owner>" para copiar+optimizar los SVG
 * crudos al _src del repo. Después regenerás sin --import (lee del repo).
 */
import { optimize } from 'svgo'
import sharp from 'sharp'
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'mobile/assets/category-icons/_src')
const OUT = join(ROOT, 'mobile/assets/category-icons')
const REG = join(ROOT, 'mobile/components/category/category-icon-registry.ts')
const PX = 256

function slugify(s) {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\.svg$/, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
function walk(d) {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = join(d, e.name)
    return e.isDirectory() ? walk(p) : e.name.endsWith('.svg') ? [p] : []
  })
}
const SVGO = {
  multipass: true,
  plugins: [
    'preset-default',
    { name: 'cleanupNumericValues', params: { floatPrecision: 1 } },
    { name: 'convertPathData', params: { floatPrecision: 1 } },
  ],
}

async function main() {
  // --import="folder": copia+optimiza los SVG crudos del owner al _src del repo.
  const importArg = process.argv.find((a) => a.startsWith('--import='))
  if (importArg) {
    const ownerDir = importArg.slice('--import='.length)
    if (existsSync(SRC)) rmSync(SRC, { recursive: true })
    mkdirSync(SRC, { recursive: true })
    for (const f of walk(ownerDir)) {
      const group = slugify(basename(dirname(f))) || 'extra'
      const slug = slugify(basename(f))
      const opt = optimize(readFileSync(f, 'utf8'), SVGO).data
      const dir = join(SRC, group)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, slug + '.svg'), opt)
    }
    console.log('imported + optimized →', SRC)
  }

  // genera PNGs + registry desde el _src del repo
  const files = walk(SRC)
  const entries = []
  for (const f of files) {
    const group = basename(dirname(f))
    const slug = slugify(basename(f))
    const key = `${group}/${slug}`
    const outDir = join(OUT, group)
    mkdirSync(outDir, { recursive: true })
    const png = join(outDir, slug + '.png')
    await sharp(Buffer.from(readFileSync(f, 'utf8')), { density: 384 })
      .resize(PX, PX, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(png)
    entries.push({ key, group, slug, rel: `../../assets/category-icons/${group}/${slug}.png` })
  }
  entries.sort((a, b) => a.key.localeCompare(b.key))

  const lines = [
    '// AUTO-GENERADO por scripts/gen-category-icons.mjs — NO editar a mano.',
    '// Íconos de categoría (stickers multicolor del owner) como PNG assets.',
    '/* eslint-disable @typescript-eslint/no-require-imports -- los PNG entran por el require() del asset pipeline de Metro (no son imports JS). */',
    "import type { ImageSourcePropType } from 'react-native'",
    '',
    'export const CATEGORY_ICONS: Record<string, ImageSourcePropType> = {',
    ...entries.map((e) => `  ${JSON.stringify(e.key)}: require(${JSON.stringify(e.rel)}),`),
    '}',
    '',
    'export type CategoryIconKey = keyof typeof CATEGORY_ICONS',
    '',
    `export const CATEGORY_ICON_KEYS = ${JSON.stringify(entries.map((e) => e.key), null, 2)} as const`,
    '',
  ]
  mkdirSync(dirname(REG), { recursive: true })
  writeFileSync(REG, lines.join('\n'))
  console.log('wrote', entries.length, 'icons →', REG)
}
main().catch((e) => { console.error(e); process.exit(1) })
