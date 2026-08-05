#!/usr/bin/env node
/**
 * Corre un comando con las variables de un archivo de entorno concreto.
 *
 *   node scripts/env-runner.mjs .env.dev expo start -c
 *
 * Existe por dos razones:
 *
 * 1. Expo levanta `.env` solo. Para apuntar la app a otro backend sin editar
 *    `.env` a mano (y sin olvidarse de revertirlo) hace falta inyectar el
 *    archivo elegido antes de arrancar Metro.
 *
 * 2. GUARDA ANTI-PROD: si el archivo apunta al proyecto de producción, aborta.
 *    Todo el punto del ambiente de desarrollo es no tocar prod; un `start:dev`
 *    que silenciosamente hable con prod sería peor que no tener ambiente.
 *
 * Soporta el placeholder `__LAN_IP__` en cualquier valor: se reemplaza por la
 * IP de esta máquina en la red local. El stack local de Supabase escucha en
 * 0.0.0.0, pero un iPhone físico no resuelve `127.0.0.1` — necesita la IP LAN,
 * que cambia de red en red y por eso no se puede hardcodear.
 */

import { existsSync, readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Ref del proyecto de PRODUCCIÓN. Ningún comando de desarrollo debe apuntarle.
const PROD_PROJECT_REF = 'xaquigyhylzvuyfslkqq'

function fail(message) {
  process.stderr.write(`\n✖ ${message}\n\n`)
  process.exit(1)
}

function parseDotEnv(filePath) {
  const env = {}
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq === -1) continue

    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function lanIp() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address
      }
    }
  }
  return null
}

const [envFileArg, ...command] = process.argv.slice(2)

if (!envFileArg || command.length === 0) {
  fail('Uso: node scripts/env-runner.mjs <archivo-env> <comando...>')
}

const envPath = path.resolve(projectRoot, envFileArg)
if (!existsSync(envPath)) {
  fail(
    `No existe ${envFileArg}.\n` +
      `  Copialo del ejemplo:  cp ${envFileArg}.example ${envFileArg}\n` +
      `  Y completá los valores (ver docs/operaciones/ambiente-dev.md).`,
  )
}

const fileEnv = parseDotEnv(envPath)

// ── Placeholder de IP de red local ──────────────────────────────────────────
const needsLanIp = Object.values(fileEnv).some((v) => v.includes('__LAN_IP__'))
let ip = null
if (needsLanIp) {
  ip = lanIp()
  if (!ip) {
    fail(
      'No pude detectar la IP de esta máquina en la red local, y el archivo usa __LAN_IP__.\n' +
        '  Conectate a una red (Wi-Fi/Ethernet) o poné la IP a mano en el archivo.',
    )
  }
  for (const [key, value] of Object.entries(fileEnv)) {
    fileEnv[key] = value.replaceAll('__LAN_IP__', ip)
  }
}

// ── Guarda anti-prod ────────────────────────────────────────────────────────
const apunta = [fileEnv.EXPO_PUBLIC_SUPABASE_URL, fileEnv.SUPABASE_PROJECT_REF, fileEnv.SUPABASE_DB_URL]
  .filter(Boolean)
  .join(' ')

if (apunta.includes(PROD_PROJECT_REF)) {
  fail(
    `${envFileArg} apunta a PRODUCCIÓN (${PROD_PROJECT_REF}).\n` +
      '  Estos comandos son solo para local y staging. Si de verdad querés operar\n' +
      '  sobre prod, usá los scripts `supabase:remote:*`, que son explícitos.',
  )
}

const backend = fileEnv.EXPO_PUBLIC_SUPABASE_URL ?? fileEnv.SUPABASE_DB_URL ?? '(sin backend declarado)'
const etiqueta = fileEnv.MANIFIESTO_ENV_LABEL ?? envFileArg
process.stderr.write(
  `\n▸ ambiente: ${etiqueta}\n▸ backend : ${backend.replace(/:[^:@/]+@/, ':<oculta>@')}${ip ? `\n▸ IP LAN  : ${ip}` : ''}\n\n`,
)

// `${VAR}` en los argumentos se expande con los valores del archivo. Permite
// escribir en package.json cosas como `--db-url '${SUPABASE_DB_URL}'` sin que
// el shell las resuelva antes de que el archivo esté cargado (y sin que la
// URL con contraseña quede escrita en el repo).
const expandidos = command.map((arg) =>
  arg.replace(/\$\{([A-Z0-9_]+)\}/gu, (match, key) => {
    const value = fileEnv[key] ?? process.env[key]
    if (value === undefined) {
      fail(`El comando usa \${${key}}, pero ${envFileArg} no lo define.`)
    }
    return value
  }),
)

const [bin, ...args] = expandidos
const child = spawn(bin, args, {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    ...fileEnv,
    // CRÍTICO: sin esto, el CLI de Expo carga ADEMÁS el `.env` del disco (el
    // de producción) y serializa esos valores en su módulo virtual de env,
    // que viaja en el bundle junto con los inyectados. Resultado observado:
    // el bundle contenía LAS DOS URLs de Supabase (staging inlineada por babel
    // y prod en el módulo virtual) — el device podía terminar hablándole a
    // prod en silencio. Con EXPO_NO_DOTENV la única fuente de EXPO_PUBLIC_*
    // es el archivo que este runner cargó, así que el archivo elegido tiene
    // que ser AUTOSUFICIENTE (por eso .env.dev replica todas las claves
    // públicas de .env, no solo las de Supabase).
    EXPO_NO_DOTENV: '1',
    // Para poder invocar `supabase`/`expo` sin escribir node_modules/.bin.
    PATH: `${path.join(projectRoot, 'node_modules', '.bin')}:${process.env.PATH ?? ''}`,
  },
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
