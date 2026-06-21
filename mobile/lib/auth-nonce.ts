import { sha256 } from 'js-sha256'
import { getSecureRandomBytes } from '@/lib/secure-random'

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
// CSPRNG note: la aleatoriedad sale de `getSecureRandomBytes`
// (crypto.getRandomValues en dev/prod builds; expo-crypto en Expo Go —
// ambas son CSPRNG del SO). NUNCA caemos a Math.random: un nonce
// predecible permitiría un replay del id_token que pasaría la
// verificación de Supabase.

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
  return bytesToHex(getSecureRandomBytes(NONCE_BYTES))
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
