/**
 * Minimal stub for expo-linking used in vitest (Node environment).
 * Only the functions used by `auth-flow.ts` are stubbed.
 */
export function createURL(path: string): string {
  return `manifiesto://${path}`
}
