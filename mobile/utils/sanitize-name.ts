/**
 * Mirror of the backend `public.sanitize_display_name` function.
 *
 * Strips everything that isn't a Unicode letter, digit, space, hyphen,
 * apostrophe or period — so emojis, HTML angle brackets, backticks and
 * control chars all get dropped. Also collapses whitespace runs.
 *
 * Kept client-side as the first line of defense so the user sees clean
 * input live; the server trigger is the final authority.
 */
export function sanitizeDisplayName(raw: string): string {
  if (!raw) return ''
  // Unicode-aware whitelist: \p{L} letters, \p{N} digits, plus ` -'.` .
  const kept = raw.replace(/[^\p{L}\p{N} \-'.]/gu, '')
  return kept.replace(/\s+/g, ' ').trimStart()
}
