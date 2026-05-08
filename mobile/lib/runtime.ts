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

LogBox.ignoreLogs([...ignoredExpoGlLogs])

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
