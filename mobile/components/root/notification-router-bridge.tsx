import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import { canUseNativePushNotifications } from '@/lib/runtime-environment'
import { normalizeAppRoute } from '@/utils/routes'

const notificationHandler = {
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
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
      router.push(route as never)
    }

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
    }
  }, [router])

  return null
}
