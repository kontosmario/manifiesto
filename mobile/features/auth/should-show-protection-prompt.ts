// Sprint R-3 · R-3.1 — Pure decision for the "no-credentials" defense.
//
// Sprints R-1 (lock backbone) and R-2 (foreground inactivity tracker)
// guarantee that any user with biometric credentials OR a PIN is gated
// on cold start, background ≥5min, and foreground inactivity ≥15min.
//
// A signed-in user with NEITHER biometric NOR PIN has NO lock layer at
// all. The most common path into this state is the post-logout / re-
// sign-in flow: `logout.ts` wipes biometric credentials and PIN; on the
// next session the user is fully exposed until they manually re-enable
// something. This decision powers a sticky banner on Home that nudges
// them to configure Face ID or a PIN.
//
// The prompt is dismissible (we don't want to block the app) but it
// returns after `DISMISS_COOLDOWN_MS` so a casual swipe-away cannot
// permanently silence the recommendation.

const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface ShouldShowProtectionPromptInput {
  hasSession: boolean
  hasBiometricCredentials: boolean
  pinIsSet: boolean
  onboardingCompleted: boolean
  lastDismissedAt: number | null
  now: number
}

export function shouldShowProtectionPrompt(
  input: ShouldShowProtectionPromptInput,
): boolean {
  if (!input.hasSession) return false
  if (!input.onboardingCompleted) return false
  if (input.hasBiometricCredentials) return false
  if (input.pinIsSet) return false
  if (input.lastDismissedAt === null) return true
  const elapsed = input.now - input.lastDismissedAt
  // Sprint M · L-2 pattern (clock manipulation defense): a negative
  // delta means the user (or a tampered system clock) moved time
  // backwards relative to the dismissal stamp. Treat as "not dismissed"
  // so an attacker cannot suppress the prompt indefinitely by setting
  // the device clock forward at dismissal time and then back to normal.
  if (elapsed < 0) return true
  return elapsed >= DISMISS_COOLDOWN_MS
}

export const PROTECTION_PROMPT_COOLDOWN_MS = DISMISS_COOLDOWN_MS
