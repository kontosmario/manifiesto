import { useEffect } from 'react'
import type { AchievementViewItem } from '@/features/achievements/use-achievements'

/**
 * Module-scoped emitter used to preview the achievement unlock modal
 * from the dev tools in Settings, WITHOUT touching the database.
 *
 * Production flow (untouched by this):
 *   Trigger fires → INSERT achievements_earned → Supabase realtime →
 *   useAchievementUnlocks → AchievementUnlockBridge → modal.
 *
 * Dev preview flow (this file):
 *   Dev settings row → triggerAchievementPreview(item) →
 *   AchievementUnlockBridge listener → modal.
 *
 * The Bridge subscribes to both paths. The preview path is __DEV__
 * only and never reaches production builds because the only call
 * sites are gated behind `__DEV__` guards in the settings screen.
 *
 * Pattern mirrors `auth-transition-splash.ts` — singleton listeners
 * Set + plain functions, no Context needed.
 */

type Listener = (item: AchievementViewItem) => void

const listeners = new Set<Listener>()

/** Fires a preview of the unlock modal for the given catalog item.
 *  Identical shape to a real unlock — the Bridge can't tell the
 *  difference except that no DB insert exists for it. */
export function triggerAchievementPreview(item: AchievementViewItem): void {
  for (const l of listeners) l(item)
}

/** Hook for the Bridge — subscribes once on mount, unsubscribes on
 *  unmount. Safe to mount from multiple places (each subscriber gets
 *  every event), though in practice only the Bridge listens. */
export function useAchievementPreviewListener(callback: Listener): void {
  useEffect(() => {
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
    }
  }, [callback])
}
