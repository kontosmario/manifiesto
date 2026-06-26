/**
 * Password policy — Sprint H · H1
 *
 * Defense-in-depth client-side validation. Server-side Supabase also
 * enforces a minimum length (configured in the Supabase project), but
 * we apply a stricter local policy so the UX surfaces problems before
 * the round-trip and so the most common weak passwords never leave
 * the device.
 *
 * Rules:
 *   • Min 10 chars (Supabase default min is 6; we lift to 10).
 *   • Max 72 chars — bcrypt's effective input limit. Anything longer
 *     gets truncated silently server-side, which leads to confusing
 *     "wrong password" reports when the user types more than 72.
 *   • Reject all-numeric or all-alpha passwords — these are trivially
 *     bruteforceable and dominate breach corpora.
 *   • Reject a small built-in blocklist of the most common breach-list
 *     passwords. Kept SMALL on purpose (~30 entries) — we don't want
 *     to bundle a 10k-word dictionary in the app binary; the server
 *     handles deeper checks via HIBP-style integrations if/when added.
 *
 * Error copy:
 *   We deliberately avoid hinting at WHICH rule failed in detail
 *   ("password must contain at least one digit"). That gives a tiny
 *   bit of bruteforce-helper info. Instead we point at length + a
 *   generic "muy común" for the blocklist hit.
 */

const MIN_PASSWORD_LENGTH = 10
const MAX_PASSWORD_LENGTH = 72

/**
 * Top common passwords from breach lists (NIST 800-63B style guidance).
 * Stored lowercased so checks are case-insensitive without normalizing
 * the user's input — we preserve the original casing for the rest of
 * the flow but compare against `toLowerCase()`. Kept intentionally
 * small (~30 entries) — deeper checks are server-side.
 */
const COMMON_PASSWORDS = new Set<string>([
  '1234567890',
  '12345678910',
  '12345678901',
  'qwertyuiop',
  'password1!',
  'password12',
  'password123',
  'passw0rd1!',
  'iloveyou!1',
  'qwerty1234',
  'abc1234567',
  'admin12345',
  'welcome123',
  'manifiesto',
  'manifiesto1',
  'manifiesto1!',
  'letmein123',
  'football12',
  'baseball12',
  'sunshine12',
  'princess12',
  'dragon1234',
  'monkey1234',
  'shadow1234',
  'master1234',
  'qazwsxedc1',
  '!qaz2wsx3edc',
  'p@ssword1',
  'p@ssw0rd1',
  'changeme1!',
])

export interface PasswordPolicyResult {
  ok: boolean
  /** Human-readable Spanish message. Undefined when ok === true. */
  error?: string
}

/**
 * Validate a candidate password against the local policy.
 * Returns `{ ok: true }` or `{ ok: false, error }`.
 */
export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    }
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `La contraseña no puede tener más de ${MAX_PASSWORD_LENGTH} caracteres.`,
    }
  }

  const isAllDigits = /^\d+$/.test(password)
  const isAllAlpha = /^[A-Za-z]+$/.test(password)
  if (isAllDigits || isAllAlpha) {
    return {
      ok: false,
      error: 'Combina letras y números para una contraseña más segura.',
    }
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return {
      ok: false,
      error: 'Esa contraseña es muy común. Elige una más difícil de adivinar.',
    }
  }

  return { ok: true }
}

export const PASSWORD_POLICY = {
  MIN_LENGTH: MIN_PASSWORD_LENGTH,
  MAX_LENGTH: MAX_PASSWORD_LENGTH,
} as const
