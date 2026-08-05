#!/usr/bin/env node
/**
 * Aplica supabase/seed.sql sobre la base que indique SUPABASE_DB_URL.
 *
 *   npm run db:seed:staging
 *
 * En local no hace falta: `supabase db reset` ya siembra solo (db.seed.enabled
 * en config.toml). Esto es para staging, donde no hay reset.
 *
 * Usa psql adentro de un contenedor descartable en vez de pedir psql instalado:
 * Docker ya es requisito del stack local, y así la versión de psql siempre
 * coincide con la del Postgres del servidor.
 *
 * El seed trae su propia guarda: aborta si encuentra usuarios que no son de
 * prueba. Igual acá repetimos el chequeo del ref de producción antes de
 * conectarnos, para fallar temprano y sin abrir conexión.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROD_PROJECT_REF = 'xaquigyhylzvuyfslkqq'
const seedPath = path.join(projectRoot, 'supabase', 'seed.sql')

function fail(message) {
  process.stderr.write(`\n✖ ${message}\n\n`)
  process.exit(1)
}

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  fail('Falta SUPABASE_DB_URL. Corré esto vía npm run db:seed:staging (usa env-runner).')
}
if (dbUrl.includes(PROD_PROJECT_REF)) {
  fail('SUPABASE_DB_URL apunta a PRODUCCIÓN. El seed es solo para local y staging.')
}
if (!existsSync(seedPath)) {
  fail(`No encuentro ${path.relative(projectRoot, seedPath)}.`)
}

process.stderr.write(`\n▸ sembrando ${dbUrl.replace(/:[^:@/]+@/, ':<oculta>@')}\n\n`)

const child = spawn(
  'docker',
  [
    'run', '--rm', '-i',
    '-v', `${seedPath}:/seed.sql:ro`,
    'postgres:17',
    'psql', dbUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', '/seed.sql',
  ],
  { cwd: projectRoot, stdio: 'inherit' },
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
