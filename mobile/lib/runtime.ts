import { LogBox, Platform } from 'react-native'
// NOTE: do NOT install `expo-sqlite/localStorage`. The previous polyfill
// persisted Supabase JWTs (access_token + refresh_token) into an
// unencrypted SQLite database, which left them readable by any
// process/backup with file-system access. Auth tokens now live in
// Keychain via `mobile/lib/supabase-secure-storage.ts`.
import 'react-native-url-polyfill/auto'

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
