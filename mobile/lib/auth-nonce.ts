import { sha256 } from 'js-sha256'

// Nonce helper for Sign in with Apple / Google id_token flows.
//
// Why a nonce: an id_token is just a JWT signed by the provider's
// private key. Without a nonce, a stolen identityToken can be
// replayed against `supabase.auth.signInWithIdToken` to impersonate
// the user (attack surface: phishing, malicious app that shares the
// bundle prefix, intercepted web flow, compromised analytics SDK).
//
// The defense (per OpenID Connect §15.5.2 and Supabase's docs):
//   1. Client generates a cryptographically-random `rawNonce`.
//   2. Client sends `sha256(rawNonce)` to the IdP as the `nonce` param.
//   3. IdP echoes the hashed nonce inside the signed id_token as the
//      `nonce` claim.
//   4. Client sends BOTH the id_token AND the `rawNonce` to Supabase.
//   5. Supabase recomputes `sha256(rawNonce)` and asserts equality
//      with the `nonce` claim — replay across sessions fails because
//      each session's raw nonce never leaves the device.
//
// Hashing happens client-side because the IdP only sees the hash;
// the raw value is the session-bound secret.
//
// CSPRNG note: we use `crypto.getRandomValues` (Hermes >= 0.74 ships
// it as a JS builtin, RN 0.81.x is pinned in package.json). We THROW
// rather than fall back to Math.random because a predictable nonce
// completely defeats this defense (an attacker who can guess the
// nonce can craft a replay that passes Supabase's check).

const NONCE_BYTES = 32

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

/**
 * Returns 32 bytes of CSPRNG randomness encoded as a 64-char hex
 * string. Throws if the runtime lacks a CSPRNG — we never silently
 * degrade to Math.random for security-critical material.
 */
export function generateRawNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES)
  const webCrypto = (globalThis as {
    crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array }
  }).crypto
  if (!webCrypto?.getRandomValues) {
    throw new Error(
      '[auth-nonce] crypto.getRandomValues unavailable — refusing to ' +
        'sign in with a non-CSPRNG nonce. This indicates a runtime ' +
        'regression (Hermes >= 0.74 ships getRandomValues natively).',
    )
  }
  webCrypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

/**
 * SHA-256 of the raw nonce, hex-encoded. js-sha256 is already a dep
 * (used by pin-lock); zero extra footprint.
 */
export function hashNonce(rawNonce: string): string {
  return sha256(rawNonce)
}

/** Convenience: both halves in one shot. */
export function createNoncePair(): { rawNonce: string; hashedNonce: string } {
  const rawNonce = generateRawNonce()
  return { rawNonce, hashedNonce: hashNonce(rawNonce) }
}
