import { describe, expect, it } from 'vitest'
import {
  PROTECTION_PROMPT_COOLDOWN_MS,
  shouldShowProtectionPrompt,
  type ShouldShowProtectionPromptInput,
} from '@/features/auth/should-show-protection-prompt'

const NOW = 1_700_000_000_000

function baseInput(
  overrides: Partial<ShouldShowProtectionPromptInput> = {},
): ShouldShowProtectionPromptInput {
  return {
    hasSession: true,
    hasBiometricCredentials: false,
    pinIsSet: false,
    onboardingCompleted: true,
    lastDismissedAt: null,
    now: NOW,
    ...overrides,
  }
}

describe('shouldShowProtectionPrompt', () => {
  it('returns false when there is no session', () => {
    expect(shouldShowProtectionPrompt(baseInput({ hasSession: false }))).toBe(false)
  })

  it('returns false when onboarding is not complete', () => {
    expect(
      shouldShowProtectionPrompt(baseInput({ onboardingCompleted: false })),
    ).toBe(false)
  })

  it('returns false when biometric credentials are configured', () => {
    expect(
      shouldShowProtectionPrompt(baseInput({ hasBiometricCredentials: true })),
    ).toBe(false)
  })

  it('returns false when a PIN is configured', () => {
    expect(shouldShowProtectionPrompt(baseInput({ pinIsSet: true }))).toBe(false)
  })

  it('returns true when never dismissed and account is unprotected', () => {
    expect(shouldShowProtectionPrompt(baseInput())).toBe(true)
  })

  it('returns false when dismissed within the 24h cooldown window', () => {
    const oneHourAgo = NOW - 60 * 60 * 1000
    expect(
      shouldShowProtectionPrompt(baseInput({ lastDismissedAt: oneHourAgo })),
    ).toBe(false)
  })

  it('returns false exactly one millisecond before cooldown expiry', () => {
    const justBeforeExpiry = NOW - (PROTECTION_PROMPT_COOLDOWN_MS - 1)
    expect(
      shouldShowProtectionPrompt(
        baseInput({ lastDismissedAt: justBeforeExpiry }),
      ),
    ).toBe(false)
  })

  it('returns true exactly at cooldown expiry', () => {
    const atExpiry = NOW - PROTECTION_PROMPT_COOLDOWN_MS
    expect(
      shouldShowProtectionPrompt(baseInput({ lastDismissedAt: atExpiry })),
    ).toBe(true)
  })

  it('returns true when dismissed more than 24h ago', () => {
    const twoDaysAgo = NOW - 2 * PROTECTION_PROMPT_COOLDOWN_MS
    expect(
      shouldShowProtectionPrompt(baseInput({ lastDismissedAt: twoDaysAgo })),
    ).toBe(true)
  })

  it('returns true when elapsed delta is negative (clock manipulation defense)', () => {
    // Attacker scenario: dismissed the prompt with a clock set far in
    // the future, then reset the clock to "now" — the stored stamp is
    // greater than `now`, so the naive `elapsed >= cooldown` check
    // would treat it as "not yet expired" and suppress the prompt
    // indefinitely. The negative-delta guard catches this.
    const futureStamp = NOW + 365 * 24 * 60 * 60 * 1000
    expect(
      shouldShowProtectionPrompt(baseInput({ lastDismissedAt: futureStamp })),
    ).toBe(true)
  })
})
