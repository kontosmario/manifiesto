import * as Crypto from 'expo-crypto'

/**
 * CSPRNG bytes — fuente segura de aleatoriedad para material sensible
 * (nonce de Sign-in with Apple/Google, salt del PIN). Orden de prioridad:
 *
 *   1. `globalThis.crypto.getRandomValues` — disponible en builds dev y de
 *      producción (Hermes >= 0.74 / polyfill RN).
 *   2. `expo-crypto.getRandomBytes` — fallback para runtimes donde el global
 *      `crypto` no está cableado (p.ej. **Expo Go**). Usa el RNG seguro del
 *      SO (SecRandomCopyBytes en iOS / SecureRandom en Android), NUNCA
 *      Math.random.
 *
 * Tira solo si NINGUNO está disponible — jamás degradamos a un RNG
 * no-CSPRNG para material de seguridad (un nonce predecible permitiría un
 * replay del id_token; un salt predecible debilitaría el hash del PIN).
 */
export function getSecureRandomBytes(byteCount: number): Uint8Array {
  const webCrypto = (
    globalThis as {
      crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array }
    }
  ).crypto
  if (webCrypto?.getRandomValues) {
    const bytes = new Uint8Array(byteCount)
    webCrypto.getRandomValues(bytes)
    return bytes
  }
  if (typeof Crypto.getRandomBytes === 'function') {
    return Crypto.getRandomBytes(byteCount)
  }
  throw new Error(
    '[secure-random] No hay CSPRNG disponible (ni crypto.getRandomValues ' +
      'ni expo-crypto.getRandomBytes) — no generamos material sensible con ' +
      'un RNG inseguro.',
  )
}
