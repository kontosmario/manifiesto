import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { getDefaultConfig } = require('expo/metro-config')
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const config = getDefaultConfig(__dirname)

config.resolver.assetExts.push('glb', 'gltf')

export default config
