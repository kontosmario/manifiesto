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
//
// AppState awareness:
//   When the app returns from background, NetInfo's last-emitted
//   value is often a stale "offline" snapshot from when iOS/Android
//   suspended the radio. Without intervention, callers see a brief
//   `isOnline: false` flicker on every app resume — even when the
//   user is on solid wifi. We re-`fetch()` NetInfo on every
//   foreground transition so the consumer reads fresh truth.

import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(true)

  useEffect(() => {
    let mounted = true

    // Seed with the latest snapshot — NetInfo doesn't immediately
    // emit on subscribe, so without this the pill flickers from
    // "online" to "offline" on cold launch when the user is offline.
    NetInfo.fetch().then((state: NetInfoState) => {
      if (mounted) setOnline(resolveOnline(state))
    })

    const unsubscribeNet = NetInfo.addEventListener((state) => {
      setOnline(resolveOnline(state))
    })

    // On app foreground, force a fresh NetInfo probe. NetInfo's
    // cached state is unreliable across background/active cycles
    // (the OS may have suspended the network stack while we were
    // backgrounded). The probe replaces any stale "offline" reading
    // with the actual current connectivity.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return
      NetInfo.fetch().then((state: NetInfoState) => {
        if (mounted) setOnline(resolveOnline(state))
      })
    })

    return () => {
      mounted = false
      unsubscribeNet()
      appStateSub.remove()
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
