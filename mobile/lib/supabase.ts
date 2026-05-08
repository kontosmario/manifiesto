import '@/lib/runtime'
import { createClient } from '@supabase/supabase-js'
import { supabaseSecureStorage } from '@/lib/supabase-secure-storage'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Expo env vars: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Persist the session in Keychain / Android Keystore via
    // expo-secure-store instead of an unencrypted SQLite-backed
    // localStorage polyfill. Bound to WHEN_UNLOCKED_THIS_DEVICE_ONLY
    // so the encrypted blob never travels in iCloud/iTunes backups.
    storage: supabaseSecureStorage,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    persistSession: true,
    // PKCE removes the implicit-flow access_token / refresh_token
    // params from the OAuth callback URL, which closes the
    // session-fixation vector via deep-link phishing
    // (manifiesto://auth/callback?access_token=<attacker-jwt>).
    flowType: 'pkce',
  },
})
