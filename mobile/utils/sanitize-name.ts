import { useCallback, useState } from 'react'

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

interface UseSanitizedInputOptions {
  initial?: string
  maxLength?: number
}

/**
 * Controlled string state that funnels every update through
 * `sanitizeDisplayName` and clamps to `maxLength`. The caller wires
 * `value` + `setValue` into a TextInput exactly like a normal
 * useState('').
 */
export function useSanitizedInput({
  initial = '',
  maxLength = 40,
}: UseSanitizedInputOptions = {}) {
  const [value, setValueState] = useState<string>(() =>
    sanitizeDisplayName(initial).slice(0, maxLength),
  )

  const setValue = useCallback(
    (next: string) => {
      const cleaned = sanitizeDisplayName(next).slice(0, maxLength)
      setValueState(cleaned)
    },
    [maxLength],
  )

  return { value, setValue }
}
