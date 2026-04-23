export async function logoutSession(input: {
  onError: (error: unknown) => void
  onSuccess: () => void
}) {
  const { clearBiometricCredentials } = await import('@/lib/biometric-auth')
  const { supabase } = await import('@/lib/supabase')
  const { error } = await supabase.auth.signOut()

  if (error) {
    input.onError(error)
    return
  }

  await clearBiometricCredentials()
  input.onSuccess()
}
