/**
 * Supabase clients for integration tests against the LOCAL Supabase stack.
 *
 * - `adminClient()` uses the service role JWT and bypasses RLS. Use it for
 *   seeding/teardown.
 * - `userClient(accessToken)` uses the anon JWT plus an end-user access token,
 *   so RLS evaluates `auth.uid()` correctly. Use it to call RPCs the way the
 *   app does in production.
 *
 * Defaults point at the standard local stack (54321/54322). Override via
 * `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` env vars.
 */
import { execFileSync } from 'node:child_process'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Local-stack JWTs are deliberately NOT hard-coded here so the pre-commit
 * secret scanner stays happy. They are the well-known, deterministic keys
 * that `supabase status -o json` prints for any default `supabase start`
 * install — we discover them lazily via the CLI and cache them in module
 * state so each test file pays the cost at most once.
 *
 * Override either piece by exporting `SUPABASE_URL`,
 * `SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` before running.
 */
export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'

let cachedAnonKey: string | null = process.env.SUPABASE_ANON_KEY ?? null
let cachedServiceKey: string | null =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
let cliLookupAttempted = false

function loadKeysFromCli(): void {
  if (cliLookupAttempted) return
  cliLookupAttempted = true
  try {
    const out = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    })
    const parsed = JSON.parse(out) as Record<string, string>
    if (!cachedAnonKey && parsed.ANON_KEY) cachedAnonKey = parsed.ANON_KEY
    if (!cachedServiceKey && parsed.SERVICE_ROLE_KEY) {
      cachedServiceKey = parsed.SERVICE_ROLE_KEY
    }
  } catch {
    // Stack not running, CLI missing, or anything else — leave the cached
    // keys as-is. Callers that need keys will throw or skip downstream.
  }
}

export function getAnonKey(): string {
  if (!cachedAnonKey) loadKeysFromCli()
  return cachedAnonKey ?? ''
}

export function getServiceRoleKey(): string {
  if (!cachedServiceKey) loadKeysFromCli()
  return cachedServiceKey ?? ''
}

export function adminClient(): SupabaseClient {
  const key = getServiceRoleKey()
  if (!key) {
    throw new Error(
      'Supabase service role key not available. Start the local stack with `supabase start` or export SUPABASE_SERVICE_ROLE_KEY.',
    )
  }
  return createClient(SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export function userClient(accessToken: string): SupabaseClient {
  const key = getAnonKey()
  if (!key) {
    throw new Error(
      'Supabase anon key not available. Start the local stack with `supabase start` or export SUPABASE_ANON_KEY.',
    )
  }
  return createClient(SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })
}

/**
 * Best-effort liveness probe. Returns true if the local Supabase REST endpoint
 * answers, false otherwise. Used by integration tests to skip gracefully
 * when the stack isn't running (e.g. CI).
 */
export async function isSupabaseLocalReachable(): Promise<boolean> {
  // We need the anon key to talk to PostgREST; if we cannot resolve it, the
  // stack is effectively unreachable for our purposes.
  const anonKey = getAnonKey()
  if (!anonKey) return false
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'GET',
      headers: { apikey: anonKey },
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    // 200 or 401 both prove the server is up; only network errors mean offline.
    return res.status < 500
  } catch {
    return false
  }
}
