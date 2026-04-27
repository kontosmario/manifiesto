import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { profileQueryKey, useMyProfile, type Profile } from '@/features/profile/use-profile'

const FALLBACK_TZ = 'America/Argentina/Buenos_Aires'

/**
 * Reads the device's current IANA timezone (e.g. "America/Argentina/Buenos_Aires"
 * or "Europe/Madrid") and writes it to `profiles.timezone` whenever it
 * differs from the value we last persisted for this user. Mounted in
 * AppStackShell so it runs on every authenticated session.
 *
 * Why this exists: the streak trigger uses `profiles.timezone` to decide
 * which calendar day an expense belongs to. Storing it server-side means
 * the day boundary always matches the user's actual location, even if
 * they travel — and even if multiple devices write the same row, the
 * last one wins (which is fine: we only care about "where the user is
 * right now").
 */
export function useTimezoneSync() {
  const session = useAuthSession()
  const queryClient = useQueryClient()
  const userId = session.data?.user.id
  const profileQuery = useMyProfile(userId)

  // Avoid re-issuing the same UPDATE every render while the network
  // request is in flight or the cache is still warming. The ref tracks
  // the last value we successfully wrote (or know is already correct
  // server-side).
  const lastSyncedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!userId) {
      lastSyncedRef.current = null
      return
    }
    const deviceTz = resolveDeviceTimezone()
    const serverTz = profileQuery.data?.timezone ?? null
    if (serverTz === deviceTz) {
      lastSyncedRef.current = deviceTz
      return
    }
    if (lastSyncedRef.current === deviceTz) return
    lastSyncedRef.current = deviceTz

    void (async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ timezone: deviceTz })
        .eq('id', userId)
      if (error) {
        // Roll back the ref so a later render can retry. Streak math
        // still works server-side via the trigger's BA fallback, so
        // this is best-effort.
        lastSyncedRef.current = null
        return
      }
      queryClient.setQueryData<Profile | null>(profileQueryKey(userId), (prev) =>
        prev ? { ...prev, timezone: deviceTz } : prev,
      )
    })()
  }, [userId, profileQuery.data?.timezone, queryClient])
}

function resolveDeviceTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz && tz.length > 0 ? tz : FALLBACK_TZ
  } catch {
    return FALLBACK_TZ
  }
}
