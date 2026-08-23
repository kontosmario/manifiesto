#!/usr/bin/env node
// Genera el SMALL ICON de notificaciones de Android desde el helecho
// canónico (`assets/brand/manifiesto-fern-v2-transparent.svg`).
//
// Android ≥5 usa SOLO el canal alfa del small icon (lo tiñe con el
// `color` del plugin de expo-notifications); sin un asset dedicado el
// OS muestra un cuadrado gris. La receta espeja la de
// `generate-ios-app-icons.mjs`: recolorear el SVG (acá: todo BLANCO),
// render a alta resolución, alpha-trim al bbox visible y encajar
// centrado con margen de seguridad en el lienzo final.
//
// Salida: assets/brand/android-notification-icon.png (96×96, xxxhdpi —
// el único tamaño que expo-notifications necesita; Android lo escala).
//
// Run: node scripts/generate-android-notification-icon.mjs

import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const SOURCE_SVG = resolve(PROJECT_ROOT, 'assets/brand/manifiesto-fern-v2-transparent.svg')
const OUT_PNG = resolve(PROJECT_ROOT, 'assets/brand/android-notification-icon.png')

const CANVAS = 96
// Margen de seguridad ~12%: la guía de status bar de Android pide que la
// silueta no toque los bordes del lienzo.
const SAFE = Math.round(CANVAS * 0.88)

async function main() {
  const svg = await readFile(SOURCE_SVG, 'utf8')
  // Silueta blanca pura: TODO fill/stroke del SVG pasa a #FFFFFF. El OS
  // solo lee el alfa, pero blanco es el asset canónico (y lo que se ve
  // en el preview del plugin).
  const white = svg
    .replace(/#FDFEF9/gi, '#FFFFFF')
    .replace(/#A9D57F/gi, '#FFFFFF')
    .replace(/fill="(?!none)[^"]+"/g, 'fill="#FFFFFF"')
    .replace(/stroke="(?!none)[^"]+"/g, 'stroke="#FFFFFF"')

  // Render grande → trim al bbox real → resize al área segura.
  const rendered = sharp(Buffer.from(white), { density: 512 })
  const trimmed = await rendered.png().toBuffer().then((b) =>
    sharp(b).trim().png().toBuffer(),
  )
  const fitted = await sharp(trimmed)
    .resize(SAFE, SAFE, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()
  const meta = await sharp(fitted).metadata()

  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: fitted,
        left: Math.round((CANVAS - (meta.width ?? SAFE)) / 2),
        top: Math.round((CANVAS - (meta.height ?? SAFE)) / 2),
      },
    ])
    .png()
    .toFile(OUT_PNG)

  console.log(`OK → ${OUT_PNG} (${CANVAS}×${CANVAS}, silueta ${meta.width}×${meta.height})`)
}

await main()
