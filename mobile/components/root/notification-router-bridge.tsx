import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import { isAppUnlocked } from '@/features/auth/app-lock-state'
import {
  getAuthFlowState,
  subscribeAuthFlow,
} from '@/features/auth-flow/auth-flow-controller'
import { canUseNativePushNotifications } from '@/lib/runtime-environment'
import {
  consumePendingNotificationRoute,
  setPendingNotificationRoute,
} from '@/lib/notification-pending-route'
import { normalizeAppRoute } from '@/utils/routes'

// J-Auth1 — App-lock bypass defense.
//
// Previously this handler called `router.push(...)` on every notification
// tap without consulting the app-lock state. A user with the lock screen
// up (cold start, Face ID pending, or after BackgroundRelockWatcher fired
// a re-lock on `AppState=active`) could tap a notification and land
// directly on a deep-linked route, skipping the biometric front door.
// BackgroundRelockWatcher's `router.replace('/')` and the tap's
// `router.push(...)` raced on `active` transition, so order was
// non-deterministic.
//
// Defense: gate every `openRoute` on `isAppUnlocked()`. When locked,
// stash the route via `setPendingNotificationRoute` and let `markAppUnlocked`
// flush it (subscribed below). The lock screen routes user to `/` via
// `markAppUnlocked` → `router.replace('/')`; once AppEntryGate releases,
// the pending route fires the deferred push.
//
// `shouldShowBanner: false` while foregrounded reduces visual surface —
// a banner over the lock screen could leak content (e.g. "Tu hogar agregó
// un gasto de $X").
const notificationHandler = {
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: false,
    shouldShowList: true,
  }),
}

export function NotificationRouterBridge() {
  const router = useRouter()

  useEffect(() => {
    if (!canUseNativePushNotifications) {
      return
    }

    let isMounted = true
    let subscription: { remove: () => void } | null = null

    const openRoute = (value: unknown) => {
      const route = normalizeAppRoute(typeof value === 'string' ? value : null)
      // J-Auth1 + spec 2026-06-11: if the app is locked OR the auth
      // journey is still in flight (bridge/reveal), defer the
      // navigation. Pushing mid-bridge sería clobbereado por el
      // replace(destino) del driver. Solo el LATEST pending route se
      // conserva — múltiples taps colapsan al intent más reciente.
      if (!isAppUnlocked() || getAuthFlowState().phase !== 'ready') {
        setPendingNotificationRoute(route)
        return
      }
      router.push(route as never)
    }

    // Flush del pending route cuando el viaje auth termina (`ready`) —
    // DESPUÉS de la navegación del driver, así el deep link aterriza
    // encima del destino en vez de ser pisado por el replace.
    const unsubscribeReady = subscribeAuthFlow(() => {
      if (!isMounted) return
      if (getAuthFlowState().phase !== 'ready') return
      const pending = consumePendingNotificationRoute()
      if (pending) {
        router.push(pending as never)
      }
    })

    void (async () => {
      const Notifications = await import('expo-notifications')

      Notifications.setNotificationHandler(notificationHandler)

      const response = await Notifications.getLastNotificationResponseAsync()
      if (!isMounted || !response) {
        return
      }

      openRoute(response.notification.request.content.data?.url)
      if (!isMounted) {
        return
      }

      subscription = Notifications.addNotificationResponseReceivedListener((nextResponse) => {
        openRoute(nextResponse.notification.request.content.data?.url)
      })
    })()

    return () => {
      isMounted = false
      subscription?.remove()
      unsubscribeReady()
    }
  }, [router])

  return null
}
