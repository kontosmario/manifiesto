// Live-updating "today" hook.
//
// `useState(() => new Date())` freezes the date at mount time. If the
// user keeps the app open across midnight, every downstream
// projection (cycle day, days-until-payday, ending-balance forecast)
// silently uses yesterday's date. This hook re-evaluates `today` at:
//
//   1. The next local midnight, recursively rescheduling itself.
//   2. App foreground (the OS may have killed the timer in background,
//      and the date may have advanced while we weren't watching).
//
// Returns a `Date` whose `toDateString()` is guaranteed to match the
// device's wall-clock day. Components that derive cycle math from it
// will recompute via React's normal re-render cycle when `today` flips.

import { useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

export function useCurrentDate(): Date {
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const scheduleNextMidnight = () => {
      const now = new Date()
      const nextMidnight = new Date(now)
      // 100ms past midnight — small buffer so the timer fires *after*
      // the day has actually changed, never just before it.
      nextMidnight.setHours(24, 0, 0, 100)
      const ms = nextMidnight.getTime() - now.getTime()
      timer = setTimeout(() => {
        setToday(new Date())
        scheduleNextMidnight()
      }, ms)
    }

    const onAppStateChange = (status: AppStateStatus) => {
      if (status !== 'active') return
      // Foreground: the OS may have killed our timer. Refresh `today`
      // if the day actually changed and re-arm the schedule.
      const now = new Date()
      setToday((prev) =>
        now.toDateString() === prev.toDateString() ? prev : now,
      )
      if (timer != null) clearTimeout(timer)
      scheduleNextMidnight()
    }

    scheduleNextMidnight()
    const sub = AppState.addEventListener('change', onAppStateChange)
    return () => {
      if (timer != null) clearTimeout(timer)
      sub.remove()
    }
  }, [])

  return today
}
