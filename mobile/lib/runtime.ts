import { LogBox, Platform } from 'react-native'
import { enableFreeze } from 'react-native-screens'
// NOTE: do NOT install `expo-sqlite/localStorage`. The previous polyfill
// persisted Supabase JWTs (access_token + refresh_token) into an
// unencrypted SQLite database, which left them readable by any
// process/backup with file-system access. Auth tokens now live in
// Keychain via `mobile/lib/supabase-secure-storage.ts`.
import 'react-native-url-polyfill/auto'
import * as ExpoCrypto from 'expo-crypto'

// CSPRNG global — polyfill `globalThis.crypto.getRandomValues` so
// @supabase/auth-js generates the PKCE `code_verifier` with a
// cryptographically-secure RNG instead of its `Math.random()` fallback.
//
// Why this is load-bearing (red team 2026-06-21): the Google sign-in
// OAuth web flow (signInWithOAuth + PKCE — see
// mobile/features/auth/social-sign-in.ts) rests ENTIRELY on the verifier
// being unguessable. A `code` delivered to the custom scheme
// `manifiesto://auth/callback` (any app on the device can register it) is
// only useless to a hijacker because they lack the verifier. But Hermes
// ships NO global `crypto`, and auth-js's `generatePKCEVerifier` silently
// degrades to `Math.random()` when `typeof crypto === 'undefined'` — a
// predictable verifier that defeats the entire defense and replays into
// `exchangeCodeForSession` => account takeover.
//
// We use expo-crypto (a CSPRNG core Expo module that works in Expo Go AND
// dev/prod builds) rather than `react-native-get-random-values` (a native
// module ABSENT from Expo Go). This MUST run before `@/lib/supabase`
// loads — it does, because supabase.ts imports this module first.
{
  type CryptoGlobal = {
    getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T
    subtle?: unknown
  }
  const scope = globalThis as unknown as { crypto?: CryptoGlobal }
  if (typeof scope.crypto?.getRandomValues !== 'function') {
    const getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
      if (array == null) return array
      ExpoCrypto.getRandomValues(
        array as unknown as Parameters<typeof ExpoCrypto.getRandomValues>[0],
      )
      return array
    }
    const polyfilled: CryptoGlobal = { ...(scope.crypto ?? {}), getRandomValues }
    try {
      Object.defineProperty(scope, 'crypto', {
        value: polyfilled,
        configurable: true,
        writable: true,
      })
    } catch {
      scope.crypto = polyfilled
    }
  }
}

// Surfaces a regression (e.g. expo-crypto dropped / polyfill order broken)
// in dev BEFORE it ships an insecure verifier to production.
if (
  __DEV__ &&
  typeof (globalThis as unknown as { crypto?: { getRandomValues?: unknown } })
    .crypto?.getRandomValues !== 'function'
) {
  console.error(
    '[runtime] globalThis.crypto.getRandomValues is missing — the PKCE ' +
      'code_verifier would fall back to Math.random(). Sign-in is INSECURE.',
  )
}

// NOTE on the Supabase WARN "WebCrypto API is not supported. Code
// challenge method will default to use plain instead of sha256":
// the polyfill above wires `getRandomValues` (so the verifier IS a
// CSPRNG), but Hermes still has no `crypto.subtle`, so auth-js keeps the
// PKCE "plain" method. That is fine: with a high-entropy verifier, "plain"
// is secure — the challenge (== verifier) only ever travels inside the
// ephemeral system-browser request to the IdP over TLS, never to another
// app; the redirect only carries the `code`. We deliberately do NOT shim
// `subtle.digest` (a prior `expo-standard-web-crypto` attempt depended on
// the native `ExpoCryptoAES`, absent from the dev client, and crashed the
// bundle). Upgrading to "s256" is optional defense-in-depth, not required.

// Activa el freezing de React subtrees para screens con
// `freezeOnBlur: true`. Sin este flag global, todos los
// `freezeOnBlur: true` en root-layout-shell + app-stack-shell eran
// no-ops · los screens blurred seguían re-rendering con cada theme /
// state / focus change, comiendo JS thread incluso cuando estaban
// fuera de pantalla.
//
// Tabs tienen `freezeOnBlur: false` explícito (memory: rompe gestos
// RNGH cuando true) así que enableFreeze() aquí NO los afecta · sólo
// activa el freezing en los Stack screens (settings, notifications,
// modals add-expense / add-income / etc.) que SÍ declaran
// `freezeOnBlur: true`. Net: massive perf win en navegación stack sin
// breakage de gestos en tabs.
//
// Esto matchea el comportamiento que UITabBarController da por default
// en NativeTabs (path A) · una de las razones por las que aquella
// versión se sentía más rápida.
enableFreeze()

const ignoredExpoGlLogs = [
  "EXGL: gl.pixelStorei() doesn't support this parameter yet!",
] as const

// `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` is
// the Supabase SDK's expected boot-time error when there's no valid
// session: either first launch after install, session expired (default
// 30d), user signed out, or token rotated server-side. The SDK
// handles it correctly (session → null → `SIGNED_OUT` event →
// AppEntryGate redirects to login), but the rejection still surfaces
// in dev as a LogBox ERROR. We silence the noise because it has no
// signal value; if there's a REAL auth bug the user will see it as a
// stuck splash or a failed redirect, not as this log.
const ignoredSupabaseAuthLogs = [
  /Invalid Refresh Token/,
] as const

LogBox.ignoreLogs([...ignoredExpoGlLogs, ...ignoredSupabaseAuthLogs])

/**
 * Web-only console filter for 3rd-party library warnings we can't fix
 * upstream. Keep this list minimal and tie every entry to a specific
 * library + reason so it's obvious when to remove them.
 *
 * LogBox.ignoreLogs doesn't cover web because react-native-web routes
 * warnings through console.warn directly, bypassing the LogBox shim.
 */
if (Platform.OS === 'web' && typeof console !== 'undefined') {
  const IGNORED_WEB_WARNINGS: RegExp[] = [
    // @gorhom/bottom-sheet@5.2.10 still passes pointerEvents as a prop
    // inside BottomSheetHostingContainer. Tracked upstream.
    /props\.pointerEvents is deprecated/,
  ]
  const originalWarn = console.warn.bind(console)
  console.warn = (...args: unknown[]) => {
    const first = args[0]
    if (typeof first === 'string' && IGNORED_WEB_WARNINGS.some((re) => re.test(first))) {
      return
    }
    originalWarn(...args)
  }
}

// LogBox only catches messages routed through `console.warn` /
// `console.error` with the matching shape; Supabase's auth-js throws
// an `AuthApiError` that React Native's default unhandled-rejection
// handler logs verbatim through `console.error` BEFORE LogBox sees it.
// We add a defensive filter at the console layer too so the message
// is fully suppressed on native dev builds. Production strips dev
// loggers, so this has no production cost.
if (__DEV__ && typeof console !== 'undefined') {
  const SUPABASE_AUTH_NOISE: RegExp[] = [
    /Invalid Refresh Token/,
    /AuthApiError.*Refresh Token Not Found/,
  ]
  const originalError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    const flat = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ')
    if (SUPABASE_AUTH_NOISE.some((re) => re.test(flat))) {
      return
    }
    originalError(...args)
  }
}
