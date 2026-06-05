/**
 * Setup file for integration tests.
 *
 * Loads SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 * from `.env.supabase` if present. The keys point al proyecto linkeado
 * por default — los tests crean users efímeros con emails
 * `test-<stamp>@manifiesto.test` y los limpian con `cleanupFamily`.
 *
 * Si el caller exporta esas variables en su shell, se respetan
 * (process.env tiene prioridad). Para correr contra un stack local
 * basta con exportar SUPABASE_URL=http://127.0.0.1:54321 antes de
 * `npm run test:integration`.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ENV_FILE = resolve(process.cwd(), '.env.supabase')
const REQUIRED_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

function loadEnvFile(): Record<string, string> {
  try {
    const raw = readFileSync(ENV_FILE, 'utf8')
    const out: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim()
      out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

const fileEnv = loadEnvFile()
for (const key of REQUIRED_KEYS) {
  if (!process.env[key] && fileEnv[key]) {
    process.env[key] = fileEnv[key]
  }
}
