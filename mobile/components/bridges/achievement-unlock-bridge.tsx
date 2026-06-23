import { useCallback, useState } from 'react'
import { FloracionView } from '@/components/garden/floracion-view'
import {
  useAchievementUnlocks,
  type AchievementViewItem,
} from '@/features/achievements/use-achievements'
import { useAchievementPreviewListener } from '@/lib/achievement-preview-emitter'

interface AchievementUnlockBridgeProps {
  userId: string
}

/**
 * App-level bridge that subscribes to realtime inserts on
 * `achievements_earned` for the current user and pops the
 * `AchievementUnlockModal` when a new badge arrives.
 *
 * Mounted once inside `AppStackShell` after the user+family are
 * resolved. Lives outside the navigation `Stack` so the modal
 * survives screen pushes — a streak milestone unlocked while the
 * user is in Gastos still celebrates above whatever screen they're
 * looking at.
 */
export function AchievementUnlockBridge({ userId }: AchievementUnlockBridgeProps) {
  const [active, setActive] = useState<AchievementViewItem | null>(null)

  // Stable callback — useAchievementUnlocks reads it as a dep, so a
  // fresh function each render would re-subscribe on every parent
  // update. useCallback keeps it stable.
  const handleUnlock = useCallback((item: AchievementViewItem) => {
    // If a celebration is already on screen, queue would be nicer
    // but for v1 we override — back-to-back unlocks (e.g., logging
    // an expense that simultaneously triggers `first_expense` and
    // `streak_7`) just show the most recent one. The first one's
    // toast lives ~4s so this almost never happens.
    setActive(item)
  }, [])

  const handleDismiss = useCallback(() => setActive(null), [])

  // Real unlock path: realtime channel filtered by user_id.
  useAchievementUnlocks(userId, handleUnlock)

  // Dev preview path: subscribes to a module-scoped emitter so the
  // Settings dev tools can fire the same modal without inserting a
  // real row. Listener is mounted unconditionally (cheap); the
  // emitter only fires when __DEV__ callers use it.
  useAchievementPreviewListener(handleUnlock)

  return <FloracionView item={active} onDismiss={handleDismiss} />
}
