import { Platform } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { supabase } from '@/lib/supabase'
import { createNoncePair } from '@/lib/auth-nonce'

// Sprint O · Audit #8 O-Info (2026-06-14): strip ASCII control bytes +
// Unicode `Cf` format chars (bidi marks/overrides, zero-width, BOM)
// from the Apple-supplied fullName before persisting it as
// display_name. End-to-end safe today — the read path sanitizes — but
// removing this at write time keeps clean data in `auth.users.user_metadata`
// and mirrors the same regex used by the edge functions. Source kept
// grep-friendly by building the regex via `new RegExp`.
function stripBidiAndControls(value: string): string {
  const re = new RegExp(
    // eslint-disable-next-line no-control-regex
    '[\\x00-\\x1F\\x7F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]+',
    'gu',
  )
  return value.replace(re, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Bridges the platform sign-in flows to Supabase Auth.
 *
 *   · **Apple** uses the native id_token flow (`signInWithIdToken`): the
 *     OS returns a JWT that Supabase verifies against Apple's JWKS. A
 *     CSPRNG nonce binds the token to this request so a stolen token
 *     can't be replayed. Requires an iOS development build (the Sign in
 *     with Apple entitlement only exists in compiled binaries — Expo Go's
 *     `aud` is `host.exp.Exponent`, which we deliberately don't accept).
 *
 *   · **Google** uses Supabase's OAuth **web flow** (`signInWithOAuth` +
 *     PKCE) instead of a native id_token. See `signInWithGoogle` below for
 *     the full rationale — short version: it needs no client-side nonce,
 *     ships no Google credentials in the app, and works in Expo Go.
 *
 * Both flows handle BOTH new sign-ups and returning sign-ins
 * transparently: Supabase upserts into `auth.users` keyed by the
 * provider subject (`sub`), so the same user gets one row regardless
 * of how many times they tap the button.
 */

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

/**
 * Google sign-in via Supabase's OAuth **web flow** (Authorization Code
 * + PKCE) — NOT the native `@react-native-google-signin` id_token flow.
 *
 * Why the web flow (replaces the Sprint J · J-Auth4 disable):
 *   · **No client-side nonce gymnastics.** Security comes from PKCE: the
 *     `code` returned in the redirect is useless without the
 *     `code_verifier` that never leaves this device, and the final token
 *     exchange runs server-side with the Google client secret stored in
 *     Supabase. A stolen `code` can't be replayed. (This is what the
 *     native free-tier SDK could NOT give us — it exposed no `nonce`
 *     parameter, leaving the id_token replayable, so we'd hidden it.)
 *   · **Works in Expo Go.** `expo-web-browser` is a core Expo module, so
 *     no native `@react-native-google-signin` binary is required.
 *   · **Ships no Google credentials.** Supabase holds the Web Client ID +
 *     secret (Dashboard → Authentication → Providers → Google).
 *
 * Flow:
 *   1. `signInWithOAuth({ provider: 'google', skipBrowserRedirect: true })`
 *      builds the Google consent URL with the PKCE challenge and stashes
 *      the `code_verifier` in Supabase's secure storage.
 *   2. `WebBrowser.openAuthSessionAsync` opens it in an ephemeral system
 *      browser session and resolves once the Google → Supabase →
 *      `…/auth/callback` redirect completes.
 *   3. We pull `?code=` from the redirect and `exchangeCodeForSession`
 *      swaps it (using the stored verifier) for a real session.
 *
 * The redirect URL is derived with `Linking.createURL('auth/callback')`
 * so it resolves to `manifiesto://auth/callback` in dev/standalone builds
 * and to the `exp://…/--/auth/callback` host inside Expo Go. BOTH must be
 * listed in Supabase → Authentication → URL Configuration → Redirect URLs
 * for the corresponding runtime to complete the flow.
 *
 * Note (PKCE "plain"): Hermes has no `crypto.subtle`, so auth-js falls
 * back to the plain code-challenge method (see mobile/lib/runtime.ts).
 * Still secure — the verifier never leaves the device — and fully
 * compatible with `exchangeCodeForSession`.
 */
const GOOGLE_SIGN_IN_ENABLED = true

export function isGoogleSignInConfigured(): boolean {
  // The web flow needs no client-side credentials — Google is configured
  // entirely server-side in Supabase. The kill-switch lets us hide the
  // entry point instantly if the provider ever misbehaves.
  return GOOGLE_SIGN_IN_ENABLED
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
    //
    // Sprint O · Audit #8 O-Info (2026-06-14): both `givenName` and
    // `familyName` are user-controlled (the Apple "edit name" sheet
    // lets the user type whatever they want). Strip bidi marks /
    // overrides and other Cf chars defensively — a user planting U+202E
    // in their first name would otherwise propagate it through
    // `display_name` into push titles ("Buen día, <reversed>") seen
    // by family members.
    const rawGiven = credential.fullName?.givenName ?? ''
    const rawFamily = credential.fullName?.familyName ?? ''
    const fullName = stripBidiAndControls(
      [rawGiven, rawFamily].filter(Boolean).join(' '),
    )

    const { data, error } = await supabase.auth.signInWithIdToken({
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
    //
    // Sprint G · G-Auth5: use the `user` already returned by
    // `signInWithIdToken` instead of a redundant `supabase.auth.getUser()`
    // round-trip. Flaky network was causing `user` to come back null
    // and the display_name patch to be silently skipped on first
    // sign-in.
    if (fullName) {
      const user = data?.user
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
  // Kill-switch mirror — even a stray deep link / CTA can't drive the
  // flow when Google is turned off.
  if (!GOOGLE_SIGN_IN_ENABLED) {
    return {
      status: 'unavailable',
      error:
        'Google sign-in está temporalmente deshabilitado en esta versión. Prueba con Apple o email + contraseña.',
    }
  }

  try {
    const redirectTo = Linking.createURL('auth/callback')

    // PKCE: Supabase generates the code challenge and stores the verifier
    // in secure storage. `skipBrowserRedirect` keeps us in control of
    // opening the URL ourselves (vs an automatic browser redirect that
    // only works on web).
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        // Force the account chooser so a user with multiple Google
        // accounts isn't silently logged in with the last one.
        queryParams: { prompt: 'select_account' },
      },
    })

    if (error || !data?.url) {
      return {
        status: 'unavailable',
        error: error?.message ?? 'No pudimos iniciar el flujo con Google.',
      }
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { status: 'cancelled' }
    }
    if (result.type !== 'success' || !result.url) {
      return {
        status: 'unavailable',
        error: 'No pudimos completar el inicio con Google.',
      }
    }

    // The redirect lands as `…/auth/callback?code=…` (PKCE). The global
    // `URL` is available via `react-native-url-polyfill/auto`, imported
    // in mobile/lib/runtime.ts.
    const callbackUrl = new URL(result.url)
    const oauthError =
      callbackUrl.searchParams.get('error_description') ??
      callbackUrl.searchParams.get('error')
    if (oauthError) {
      return { status: 'unavailable', error: oauthError }
    }

    const code = callbackUrl.searchParams.get('code')
    if (!code) {
      return {
        status: 'unavailable',
        error: 'No recibimos el código de autorización de Google.',
      }
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeError) {
      return { status: 'unavailable', error: exchangeError.message }
    }

    return { status: 'signed-in' }
  } catch (error) {
    return {
      status: 'unavailable',
      error: error instanceof Error ? error.message : 'No pudimos iniciar con Google.',
    }
  }
}
