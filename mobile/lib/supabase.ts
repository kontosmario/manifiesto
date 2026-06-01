import '@/lib/runtime'
import { createClient } from '@supabase/supabase-js'
import { AppState, Platform } from 'react-native'
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
    // localStorage polyfill. Bound to AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
    // (see supabase-secure-storage.ts for the threat-model rationale).
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

// Pause the auth-js auto-refresh timer when the app is backgrounded
// and resume it on foreground. Without this, the timer fires while
// the OS has suspended I/O, the SecureStore read fails (the device
// may also be locked), and Supabase logs the failure as a transient
// console.error. Official pattern documented at
// https://supabase.com/docs/reference/javascript/auth-startautorefresh
// — only wire on native; web has no AppState.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh()
    } else {
      supabase.auth.stopAutoRefresh()
    }
  })
}
