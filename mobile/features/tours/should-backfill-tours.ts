// Pure decision for the one-shot tour-seen backfill applied to
// existing users at the first launch after this feature ships.
//
// Without this, every existing user (who never had auto-firing tours)
// would suddenly get tours on their next visit to home/gastos/fijos/
// control — perceived as unsolicited noise. We mark all 4 tours seen
// silently for anyone whose onboarding_completed_at predates the
// feature's deploy timestamp. New users (onboarding completed after
// the deploy) are untouched and get the regular auto-fire flow.

export interface BackfillInput {
  /** profiles.onboarding_completed_at — null when user is mid-wizard. */
  onboardingCompletedAt: string | null
  /** ISO timestamp from `backfill-config.ts`. */
  toursDeployedAt: string
  /** Whether the `tours-backfill-done` KV flag is already set. */
  backfillAlreadyDone: boolean
}

export function shouldBackfillToursAsSeen(input: BackfillInput): boolean {
  if (input.backfillAlreadyDone) return false
  if (input.onboardingCompletedAt === null) return false
  return input.onboardingCompletedAt < input.toursDeployedAt
}
