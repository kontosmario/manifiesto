import { Platform } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import { supabase } from '@/lib/supabase'
import { createNoncePair } from '@/lib/auth-nonce'

// Google sign-in is loaded lazily because the package's top-level
// import calls `TurboModuleRegistry.getEnforcing('RNGoogleSignin')`,
// which crashes the entire JS bundle when the native module isn't in
// the binary (Expo Go, dev builds without the lib, web). Lazy require
// keeps the bundle loadable; the runtime check `loadGoogle()` reports
// failure cleanly so the JS handler can show a friendly fallback.
type GoogleModule = typeof import('@react-native-google-signin/google-signin')
let cachedGoogleModule: GoogleModule | null | undefined
function loadGoogle(): GoogleModule | null {
  if (cachedGoogleModule !== undefined) return cachedGoogleModule
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedGoogleModule = require('@react-native-google-signin/google-signin') as GoogleModule
  } catch {
    cachedGoogleModule = null
  }
  return cachedGoogleModule
}

/**
 * Bridges the platform-native Sign in with Apple / Google flows to
 * Supabase Auth via `signInWithIdToken`. The provider returns a JWT
 * (id_token) that Supabase verifies against the issuer's JWKS — no
 * server-side client secret needed for either provider.
 *
 * Both flows handle BOTH new sign-ups and returning sign-ins
 * transparently: Supabase upserts into `auth.users` keyed by the
 * provider subject (`sub`), so the same user gets one row regardless
 * of how many times they tap the button.
 *
 * Setup checklist (won't work without these):
 *   Apple
 *     · Apple Developer Portal: enable "Sign In with Apple" for the
 *       bundle id `com.manifiesto.mobile`.
 *     · Supabase Dashboard → Authentication → Providers → Apple:
 *       enter the Service ID (e.g. `com.manifiesto.web`), Team ID,
 *       Key ID, and the .p8 private key.
 *     · iOS development build (not Expo Go) — the entitlement only
 *       exists in compiled binaries.
 *   Google
 *     · Google Cloud Console: create OAuth 2.0 Client IDs for iOS
 *       and Web (Web ID is the one Supabase needs).
 *     · `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` env var = Web client id.
 *     · `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` env var = reversed iOS
 *       client id (e.g. `com.googleusercontent.apps.123-abc`).
 *     · Supabase Dashboard → Authentication → Providers → Google:
 *       enter the Web Client ID and Web Client Secret.
 */

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID

// Configure on first successful module load — idempotent, so calling
// it again on subsequent loads is harmless. The Web client id is what
// Supabase verifies the id_token against on the backend, so it's
// required even on iOS.
let googleConfigured = false
function configureGoogleIfNeeded(google: GoogleModule) {
  if (googleConfigured || !GOOGLE_WEB_CLIENT_ID) return
  google.GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    offlineAccess: false,
  })
  googleConfigured = true
}

export interface SocialSignInResult {
  status: 'signed-in' | 'cancelled' | 'unavailable'
  error?: string
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false
  try {
    return await AppleAuthentication.isAvailableAsync()
  } catch {
    return false
  }
}

export function isGoogleSignInConfigured(): boolean {
  return Boolean(GOOGLE_WEB_CLIENT_ID) && loadGoogle() !== null
}

export async function signInWithApple(): Promise<SocialSignInResult> {
  if (Platform.OS !== 'ios') {
    return {
      status: 'unavailable',
      error: 'Sign in with Apple solo está disponible en iOS.',
    }
  }

  try {
    // Nonce: defends against id_token replay. We send the SHA-256
    // hash to Apple (which echoes it inside the signed JWT's `nonce`
    // claim) and pass the raw value to Supabase, which recomputes
    // the hash and asserts equality. A stolen token can't be
    // replayed because the attacker doesn't have the raw nonce.
    const { rawNonce, hashedNonce } = createNoncePair()

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    })

    if (!credential.identityToken) {
      return {
        status: 'unavailable',
        error: 'No recibimos un token válido de Apple.',
      }
    }

    // Apple only returns the user's name on the FIRST sign-in. We
    // forward it to Supabase so the trigger that creates the profile
    // can use it as `display_name`.
    const fullName = [
      credential.fullName?.givenName,
      credential.fullName?.familyName,
    ]
      .filter(Boolean)
      .join(' ')
      .trim()

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
      // Apple returns the email even on subsequent sign-ins through
      // the relay address — Supabase persists it on first sign-in.
    })

    if (error) {
      return { status: 'unavailable', error: error.message }
    }

    // Patch the profile display_name ONLY on first sign-in. Apple
    // technically returns fullName only the very first time the user
    // grants the app access — but a user who revokes+re-grants will
    // see Apple's name editor again, and if they type something
    // different the silent overwrite would clobber whatever the user
    // had customized inside the app. So we read the current metadata
    // and only patch when display_name is empty/missing.
    if (fullName) {
      const { data: { user } } = await supabase.auth.getUser()
      const existing = user?.user_metadata?.display_name
      const hasExistingName =
        typeof existing === 'string' && existing.trim().length > 0
      if (user && !hasExistingName) {
        await supabase.auth.updateUser({
          data: { display_name: fullName },
        })
      }
    }

    return { status: 'signed-in' }
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'ERR_REQUEST_CANCELED'
    ) {
      return { status: 'cancelled' }
    }
    return {
      status: 'unavailable',
      error: error instanceof Error ? error.message : 'No pudimos iniciar con Apple.',
    }
  }
}

export async function signInWithGoogle(): Promise<SocialSignInResult> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    return {
      status: 'unavailable',
      error: 'Google sign-in todavía no está configurado.',
    }
  }

  const google = loadGoogle()
  if (!google) {
    return {
      status: 'unavailable',
      error:
        'Google sign-in no está disponible en este build. Necesitas un development build (no Expo Go).',
    }
  }
  configureGoogleIfNeeded(google)

  try {
    await google.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
    // Cast: tsconfig `moduleSuffixes` resolves the package's
    // `.web.d.ts` (which types `signIn()` as `Promise<User>`) ahead of
    // the native `.d.ts`. At runtime the mobile module returns the
    // `{ type, data }` shape from the native declaration.
    const response = (await google.GoogleSignin.signIn()) as unknown as
      | { type: 'success'; data: { idToken: string | null } }
      | { type: 'cancelled' }

    if (response.type === 'cancelled') {
      return { status: 'cancelled' }
    }

    const idToken = response.data.idToken
    if (!idToken) {
      return {
        status: 'unavailable',
        error: 'No recibimos un token válido de Google.',
      }
    }

    // NOTE on nonce: ideally we'd generate a CSPRNG nonce, send the
    // hash to Google, and pass the raw value to Supabase (same defense
    // as Apple — protects against id_token replay). The version of
    // `@react-native-google-signin/google-signin` we use exposes
    // `signIn(loginHint?)` in its free tier, which has NO `nonce`
    // parameter (custom nonce support is gated behind the paid
    // GoogleOneTapSignIn surface). Without injecting a nonce into the
    // OAuth request, the id_token has no `nonce` claim, and passing
    // `nonce: rawNonce` to Supabase would make `signInWithIdToken`
    // reject the token. Tracked as a follow-up: upgrade to OneTap or
    // build the OAuth request manually via expo-auth-session.
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    })

    if (error) {
      return { status: 'unavailable', error: error.message }
    }

    return { status: 'signed-in' }
  } catch (error) {
    if (google.isErrorWithCode(error)) {
      if (error.code === google.statusCodes.SIGN_IN_CANCELLED) {
        return { status: 'cancelled' }
      }
      if (error.code === google.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return {
          status: 'unavailable',
          error: 'Google Play Services no está disponible en este dispositivo.',
        }
      }
    }
    return {
      status: 'unavailable',
      error: error instanceof Error ? error.message : 'No pudimos iniciar con Google.',
    }
  }
}
