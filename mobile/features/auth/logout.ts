export async function logoutSession(input: {
  onError: (error: unknown) => void
  onSuccess: () => void
}) {
  const { clearBiometricCredentials } = await import('@/lib/biometric-auth')
  const { supabase } = await import('@/lib/supabase')
  const { resetAppLock } = await import('@/features/auth/app-lock-state')
  const { clearLastUserProfile } = await import('@/lib/last-user-cache')
  const { resetAllTours } = await import('@/features/tours/persistence')
  const { deletePersistentValue } = await import('@/lib/persistent-kv')
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
  await clearBiometricCredentials()
  await clearLastUserProfile()
  // Tours-seen flags (`tour-seen.{key}`) are device-scoped in SecureStore.
  // On logout we wipe them so a subsequent signup OR login (this user
  // or another) gets the same fresh tour experience as a first install.
  // The `tours-backfill-done` flag is also wiped so the AppEntryGate
  // hook re-evaluates against whoever signs in next.
  await resetAllTours()
  await deletePersistentValue('tours-backfill-done')
  // Re-arm the app-lock gate so the next session (if a different
  // user signs in on the same device, or the same user signs back
  // in) goes through the biometric re-confirmation again.
  resetAppLock()
  input.onSuccess()
}
