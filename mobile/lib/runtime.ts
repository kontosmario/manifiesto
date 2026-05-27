import { LogBox, Platform } from 'react-native'
import { enableFreeze } from 'react-native-screens'
// NOTE: do NOT install `expo-sqlite/localStorage`. The previous polyfill
// persisted Supabase JWTs (access_token + refresh_token) into an
// unencrypted SQLite database, which left them readable by any
// process/backup with file-system access. Auth tokens now live in
// Keychain via `mobile/lib/supabase-secure-storage.ts`.
import 'react-native-url-polyfill/auto'
// Polyfill 1 — ensure globalThis.crypto + getRandomValues exist on Hermes.
// expo-standard-web-crypto is pure-JS (no native module); it checks if
// `crypto` is already defined and skips installation in that case.
import { polyfillWebCrypto } from 'expo-standard-web-crypto'
import {
  digestStringAsync,
  CryptoDigestAlgorithm,
  CryptoEncoding,
} from 'expo-crypto'
polyfillWebCrypto()
// Polyfill 2 — ensure crypto.subtle.digest exists for Supabase PKCE S256.
// Hermes has no SubtleCrypto, so @supabase/auth-js falls back to PKCE
// "plain" and emits a WARN. We install a minimal shim backed by
// expo-crypto's native digestStringAsync so S256 is used instead.
//
// expo-crypto.digestStringAsync returns a lower-case HEX string; Supabase
// expects an ArrayBuffer, so we convert hex → Uint8Array → ArrayBuffer.
if (typeof crypto !== 'undefined' && typeof crypto.subtle === 'undefined') {
  const hexToBuffer = (hex: string): ArrayBuffer => {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    }
    return bytes.buffer
  }
  ;(crypto as unknown as { subtle: SubtleCrypto }).subtle = {
    digest: async (algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> => {
      const algoName =
        typeof algorithm === 'string' ? algorithm : (algorithm as Algorithm).name
      const hex = await digestStringAsync(
        algoName as CryptoDigestAlgorithm,
        // data is a Uint8Array from TextEncoder; decode to a binary string
        // so expo-crypto hashes the same bytes Supabase encoded.
        typeof data === 'string'
          ? data
          : Array.from(new Uint8Array(data as ArrayBuffer))
              .map((b) => String.fromCharCode(b))
              .join(''),
        { encoding: CryptoEncoding.HEX },
      )
      return hexToBuffer(hex)
    },
  } as unknown as SubtleCrypto
}

// Activa el freezing de React subtrees para screens con
// `freezeOnBlur: true`. Sin este flag global, todos los
// `freezeOnBlur: true` en root-layout-shell + app-stack-shell eran
// no-ops · los screens blurred seguían re-rendering con cada theme /
// state / focus change, comiendo JS thread incluso cuando estaban
// fuera de pantalla.
//
// Tabs tienen `freezeOnBlur: false` explícito (memory: rompe gestos
// RNGH cuando true) así que enableFreeze() acá NO los afecta · sólo
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
