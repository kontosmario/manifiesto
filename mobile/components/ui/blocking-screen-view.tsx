import { StyleSheet, View } from 'react-native'
import { authTokens } from '@/theme/palette'

interface BlockingScreenViewProps {
  /**
   * Legacy prop — preserved for back-compat with existing call sites.
   * Ignored: the splash overlay at root paints the brand surface, and
   * rendering a loading label underneath would just compete with it.
   */
  message?: string
}

/**
 * Passive backdrop for auth/transition routes that are still loading
 * their data.
 *
 * The animated brand splash (with breathing aurora + Fern logo) now
 * lives as a single persistent overlay at the root layout — see
 * `RootLayoutShell` and `auth-transition-splash`. That overlay fades
 * in/out without remounting, which means the FernLogo entrance
 * animation never replays mid-navigation and there are no skeleton
 * flashes between routes.
 *
 * Underneath the overlay, this component just paints the dark green
 * `welcomeBg` so the screen color stays consistent if the overlay is
 * fading or hidden during very fast transitions.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- props kept for back-compat with existing call sites
export function BlockingScreenView(_props: BlockingScreenViewProps) {
  return <View style={styles.backdrop} />
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: authTokens.welcomeBg,
  },
})
