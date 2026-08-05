import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { getDefaultConfig } = require('expo/metro-config')
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const config = getDefaultConfig(__dirname)

config.resolver.assetExts.push('glb', 'gltf')

// ─── Los .env del disco NO viajan al bundle ─────────────────────────────────
//
// En dev, Expo transforma `expo/virtual/env` en un require.context sobre los
// `.env*` de la raíz y los mezcla con `{ ...process.env, ...archivos }` — es
// decir, EL ARCHIVO GANA. Como `process.env.EXPO_PUBLIC_*` se reescribe a ese
// módulo virtual (babel-preset-expo, modo dev), la app en el device terminaba
// leyendo el `.env` de PRODUCCIÓN aunque Metro se lanzara con el env de
// staging inyectado (scripts/env-runner.mjs). Detectado 2026-08-05: el bundle
// traía las DOS URLs de Supabase y ganaba la de prod.
//
// Bloquear los `.env` en el resolver deja el context VACÍO, y el propio
// template del transform cae entonces a `process.env` — que el serializer
// llena con el env del proceso de Metro:
//   · `npm start`          → el CLI carga .env (prod) en su proceso → prod ✓
//   · `npm run start:dev`  → env-runner inyecta .env.dev (staging)  → staging ✓
//
// Costo asumido: editar un .env con Metro corriendo ya no hot-reloadea (había
// que reiniciar igual para nuestros flujos, todos los scripts usan `-c`).
const envFilesBlock = new RegExp(
  `^${__dirname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\.env(\\..*)?$`,
)
const priorBlockList = config.resolver.blockList
config.resolver.blockList = [
  ...(Array.isArray(priorBlockList) ? priorBlockList : priorBlockList ? [priorBlockList] : []),
  envFilesBlock,
]

export default config
