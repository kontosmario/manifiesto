// One-off helper: creates a Supabase auth user via the public signUp
// flow (same path the app uses). Reads the project URL + anon key from
// `.env`, runs `supabase.auth.signUp({ email, password })`, and reports
// the created user id (or whether email confirmation is required).
//
// Usage:
//   node scripts/create-test-account.mjs <email> <password>
//
// Example:
//   node scripts/create-test-account.mjs test@mail.com 123456

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {}
  const env = {}
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

const env = loadDotEnv(path.join(projectRoot, '.env'))
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env')
  process.exit(1)
}

const [, , email, password] = process.argv
if (!email || !password) {
  console.error('Usage: node scripts/create-test-account.mjs <email> <password>')
  process.exit(1)
}

const { createClient } = await import('@supabase/supabase-js')
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

console.log(`→ Creating account ${email} on ${new URL(SUPABASE_URL).hostname}…`)

const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: { display_name: email.split('@')[0] },
  },
})

if (error) {
  console.error('✗ signUp failed:', error.message)
  process.exit(1)
}

const user = data.user
const session = data.session

if (!user) {
  console.error('✗ signUp returned no user')
  process.exit(1)
}

console.log('')
console.log('✓ Auth user created')
console.log(`  user_id:        ${user.id}`)
console.log(`  email:          ${user.email}`)
console.log(`  email_confirmed: ${user.email_confirmed_at ? 'yes' : 'NO — confirmation email required'}`)
console.log(`  session:        ${session ? 'active (auto-confirmed in this project)' : 'none — confirm email first'}`)

if (!session) {
  console.log('')
  console.log('ℹ  This Supabase project has email confirmations enabled.')
  console.log('   To finish onboarding without checking the inbox, either:')
  console.log('   · Disable email confirmations in Auth → Providers → Email, OR')
  console.log('   · Click the magic link from the confirmation email, OR')
  console.log('   · Use `auth.admin.createUser({ email_confirm: true })` with')
  console.log('     a service_role key (not available in this .env).')
}
