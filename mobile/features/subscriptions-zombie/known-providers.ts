/**
 * Hardcoded list of well-known subscription brands for the contextual
 * onboarding chip. Match is case-insensitive substring; conservative —
 * we prefer false negatives (no chip on unknown local brands) over
 * false positives (chip on something that isn't a subscription).
 */
export const KNOWN_SUBSCRIPTION_PROVIDERS = [
  'netflix',
  'spotify',
  'disney',
  'hbo',
  'max',
  'prime video',
  'amazon prime',
  'apple',
  'icloud',
  'youtube premium',
  'youtube music',
  'crunchyroll',
  'storytel',
  'audible',
  'chatgpt',
  'claude',
  'notion',
  'adobe',
  'canva',
  'github',
  'gym',
  'smartfit',
  'megatlon',
  'fit',
] as const

export function matchesKnownProvider(name: string): boolean {
  if (!name) return false
  const lower = name.toLowerCase()
  return KNOWN_SUBSCRIPTION_PROVIDERS.some((p) => lower.includes(p))
}
