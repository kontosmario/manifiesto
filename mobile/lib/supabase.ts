import '@/lib/runtime'
import { createClient, processLock } from '@supabase/supabase-js'
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
    // Lock del storage de auth. auth-js elige `navigatorLock` (Web Locks API)
    // en cuanto detecta un entorno de browser, y NUNCA lo hace en React
    // Native — así que esto solo aplica a web y el nativo queda igual que
    // antes (sin lock explícito, que es su default).
    //
    // Por qué se pisa: `navigatorLock` toma un lock EXCLUSIVO por storageKey
    // con timeout de 10s. En el harness de dev de web (`expo start --web`) el
    // lock se queda tomado entre fast-refreshes y recargas — cada
    // `getSession()` posterior (y esta app lo llama desde runProbes,
    // confirmSession, prefetch y cada header de query) revienta con
    // `NavigatorLockAcquireTimeoutError` en loop de a 10s.
    //
    // `processLock` es la alternativa que la propia doc de Supabase indica
    // para entornos no-browser: serializa in-process con una cadena de
    // promesas, sin coordinación entre pestañas. Para una preview de una sola
    // pestaña es exactamente la semántica que se quiere, y coincide con la
    // que el nativo ya tiene de hecho.
    ...(Platform.OS === 'web' ? { lock: processLock } : {}),
  },
})

// Pause the auth-js auto-refresh timer when the app is backgrounded
// and resume it on foreground. Without this, the timer fires while
// the OS has suspended I/O, the SecureStore read fails (the device
// may also be locked), and Supabase logs the failure as a transient
// console.error. Official pattern documented at
// https://supabase.com/docs/reference/javascript/auth-startautorefresh
// — only wire on native; web has no AppState.
//
// The subscription is captured so a future HMR re-eval (or test
// teardown) can call .remove() — at app runtime this module is
// evaluated once, so the listener lives for the process lifetime
// and there's no leak. Capturing is cheap insurance against the
// Metro fast-refresh case duplicating listeners.
if (Platform.OS !== 'web') {
  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh()
    } else {
      supabase.auth.stopAutoRefresh()
    }
  })
  // Expose on the module record so HMR can find and detach it.
  ;(globalThis as { __manifiesto_supabase_app_state_sub?: { remove: () => void } }).__manifiesto_supabase_app_state_sub = appStateSubscription
}
