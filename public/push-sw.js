self.addEventListener('push', (event) => {
  let payload = {}

  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title = payload.title || 'Gastos Familia'
  const body = payload.body || 'Tenés una nueva notificación.'
  const url = payload.url || 'app'
  const iconUrl = new URL('favicon-32x32.png', self.registration.scope).toString()

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: iconUrl,
      badge: iconUrl,
      data: {
        url,
      },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetPath =
    event.notification && event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : 'app'
  const normalizedTargetPath = targetPath.startsWith('/') ? targetPath.slice(1) : targetPath
  const targetUrl = new URL(normalizedTargetPath || 'app', self.registration.scope).toString()

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      for (const client of allClients) {
        if (typeof client.focus === 'function') {
          try {
            if ('navigate' in client && typeof client.navigate === 'function') {
              await client.navigate(targetUrl)
            }
            await client.focus()
            return
          } catch {
            // no-op
          }
        }
      }

      if (typeof clients.openWindow === 'function') {
        await clients.openWindow(targetUrl)
      }
    })(),
  )
})
