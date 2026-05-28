export async function logoutSession(input: {
  onError: (error: unknown) => void
  onSuccess: () => void
}) {
  const { clearBiometricCredentials } = await import('@/lib/biometric-auth')
  const { supabase } = await import('@/lib/supabase')
  const { resetAppLock } = await import('@/features/auth/app-lock-state')
  const { clearLastUserProfile } = await import('@/lib/last-user-cache')
  const { resetAllTours } = await import('@/features/tours/persistence')
  const { clearAllTourPending } = await import('@/features/tours/tour-pending-store')
  const { deletePersistentValue } = await import('@/lib/persistent-kv')
  const { clearBiometricSetupShown } = await import(
    '@/features/auth/biometric-setup-flag'
  )

  // Capture userId BEFORE signOut so we can namespace the per-user
  // flag clear. After signOut the session is null and we'd lose
  // the ability to target the right key.
  const sessionResponse = await supabase.auth.getSession()
  const userId = sessionResponse.data.session?.user.id ?? null

  const { error } = await supabase.auth.signOut()

  if (error) {
    input.onError(error)
    return
  }

  // Atomic cleanup: await every persisted artifact of the previous
  // session BEFORE handing control back via onSuccess. The SIGNED_OUT
  // handler in `use-auth-session` also fires these clears, but its
  // calls are fire-and-forget and race against the next screen's
  // mount — clearing them here with explicit awaits eliminates the
  // window where the login screen could read stale data (e.g. the
  // previous user's avatar/name from the last-user cache).
  const { clearPin } = await import('@/lib/pin-lock')
  await clearBiometricCredentials()
  await clearPin()
  await clearLastUserProfile()
  // Tours device-local cleanup:
  //   • `resetAllTours()` clears only `tours-disabled` (the per-user
  //     "seen" flags moved to backend on 2026-05-27; backend persists
  //     across sessions/devices, so we don't touch them on logout)
  //   • `clearAllTourPending()` wipes every `tour-seen-pending.<key>`.
  //     Critical: without this, a pending flag from user A would be
  //     drained on user B's next launch under user B's auth.uid(),
  //     marking user B as having seen a tour they never saw.
  //   • `tour-seen.migration-v2-done` is cleared so the one-shot
  //     legacy migration re-evaluates against the next user's device
  //     state (e.g. iCloud restore of SecureStore left flags from
  //     another install)
  //   • `tours-backfill-done` was the pre-2026-05-27 device-local
  //     backfill flag; we delete it defensively in case of leftover
  //     residuals from a stale install
  await resetAllTours()
  await clearAllTourPending()
  await deletePersistentValue('tour-seen.migration-v2-done')
  await deletePersistentValue('tours-backfill-done')
  // Pre-onboarding biometric-setup flag (per-user). If the user
  // signed out mid-onboarding without seeing the screen, they should
  // see it again on the next login.
  if (userId) {
    await clearBiometricSetupShown(userId)
  }
  // Re-arm the app-lock gate so the next session (if a different
  // user signs in on the same device, or the same user signs back
  // in) goes through the biometric re-confirmation again.
  resetAppLock()
  input.onSuccess()
}
