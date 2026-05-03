// Global offline indicator. Floats over the entire app so the user
// is informed about a lost network connection on every screen — not
// just the two surfaces that originally embedded `<OfflinePill />`
// inline. Mounted once in `root-layout-shell.tsx` between the route
// Stack and the splash overlays.
//
// Visual contract:
//   - Absolute-positioned at the top of the viewport, padded by the
//     device's top safe-area inset so it sits below the notch /
//     Dynamic Island / status bar without overlapping system chrome.
//   - `pointerEvents="box-none"` so taps fall through to the
//     underlying screen everywhere except on the pill itself (and
//     the pill is read-only, so even taps on it are no-op).
//   - Lives at z-index 40 — below the auth-transition splash (50)
//     and the cold-start splash, above all regular screen content.
//   - Re-uses `OfflinePill` for the visual; the pill self-gates on
//     `useOnlineStatus()` and renders `null` when online, so the
//     banner is invisible (and consumes no space) on connected devices.

import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OfflinePill } from '@/components/ui/offline-pill'

export function GlobalOfflineBanner() {
  const insets = useSafeAreaInsets()
  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { paddingTop: insets.top + 6 }]}
    >
      <OfflinePill />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 40,
  },
})
