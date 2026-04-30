// Lightweight online/offline observer.
//
// Subscribes to `@react-native-community/netinfo` once per app and
// re-renders consumers when the boolean flips. Used by the offline
// pill on Home / Gastos so the user understands why the screen looks
// stale (or knows the swipe-delete just landed in a queue, etc.).
//
// We collapse the rich NetInfo state down to a single `isOnline`
// boolean — sub-components don't need to differentiate "wifi-no-net"
// from "cellular-no-net", they just need "is the data I'm seeing
// reflective of the live state?".

import { useEffect, useState } from 'react'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(true)

  useEffect(() => {
    // Seed with the latest snapshot — NetInfo doesn't immediately
    // emit on subscribe, so without this the pill flickers from
    // "online" to "offline" on cold launch when the user is offline.
    let mounted = true
    NetInfo.fetch().then((state: NetInfoState) => {
      if (mounted) setOnline(resolveOnline(state))
    })
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(resolveOnline(state))
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  return online
}

function resolveOnline(state: NetInfoState): boolean {
  // `isInternetReachable` is `null` on first emit; treat as online to
  // avoid a false-positive offline flash. Once the platform confirms
  // reachability, the next event corrects it.
  if (state.isInternetReachable === false) return false
  return state.isConnected !== false
}
