// Sprint R-3 · R-3.2 — Per-user persistence of the "protect your
// account" prompt dismissal timestamp.
//
// Stored in SecureStore (encrypted at rest) namespaced by userId so
// multiple accounts on the same device each get their own cooldown.
// Cleared on logout (see `logout.ts` Phase 2) so the next sign-in
// re-evaluates fresh.
//
// All operations are best-effort: a SecureStore failure should NOT
// prevent the user from interacting with the banner. The fallback for
// every failure is "treat as not dismissed", which means the worst
// case is showing the prompt again — exactly the safe direction for a
// security recommendation.

import * as SecureStore from 'expo-secure-store'

const KEY_PREFIX = 'protection-prompt-dismissed-at:'

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

export async function recordProtectionPromptDismissal(
  userId: string,
): Promise<void> {
  if (!userId) return
  try {
    await SecureStore.setItemAsync(keyFor(userId), String(Date.now()))
  } catch {
    // best-effort: if SecureStore fails, the next mount will treat as
    // "not dismissed" and show the prompt again. Acceptable.
  }
}

export async function readProtectionPromptDismissal(
  userId: string,
): Promise<number | null> {
  if (!userId) return null
  try {
    const raw = await SecureStore.getItemAsync(keyFor(userId))
    if (!raw) return null
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export async function clearProtectionPromptDismissal(
  userId: string,
): Promise<void> {
  if (!userId) return
  try {
    await SecureStore.deleteItemAsync(keyFor(userId))
  } catch {
    // best-effort
  }
}
