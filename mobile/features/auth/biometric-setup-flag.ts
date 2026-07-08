import {
  deletePersistentValue,
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'

/**
 * Per-user "biometric setup screen has been shown" flag. Stored
 * device-locally so the AppEntryGate can decide whether to route a
 * brand-new account through `/(app)/biometric-setup` before the
 * onboarding wizard.
 *
 * Storage: SecureStore on native (survives reinstall on iOS, wipes on
 * Android wipe), localStorage on web — same pattern as `tour-seen.*`
 * and `tours-backfill-done`. SOBREVIVE al logout (fix 2026-07-08): la
 * decisión es del usuario y borrarla re-mostraba "Activa Face ID" en
 * cada re-login mid-onboarding; el re-ofrecimiento de Face ID post
 * logout lo cubre el prompt nativo del login (cooldown de 7 días).
 *
 * Key namespaced by userId so multiple accounts on the same device
 * each get their own decision.
 *
 * Value: literal `'1'` when shown; absence (null) means not shown.
 */
const PREFIX = 'biometric-setup-shown:'

function keyFor(userId: string): string {
  return `${PREFIX}${userId}`
}

export async function getBiometricSetupShown(userId: string): Promise<boolean> {
  if (!userId) return false
  const raw = await getPersistentValue(keyFor(userId))
  return raw === '1'
}

export async function markBiometricSetupShown(userId: string): Promise<void> {
  if (!userId) return
  await setPersistentValue(keyFor(userId), '1')
}

export async function clearBiometricSetupShown(userId: string): Promise<void> {
  if (!userId) return
  await deletePersistentValue(keyFor(userId))
}
