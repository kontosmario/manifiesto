import { StyleSheet, View } from 'react-native'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Small horizontal pill rendered at the top of full-screen modals
 * (`presentation: 'modal'`) to visually telegraph the swipe-down
 * gesture that dismisses the sheet on iOS. Matches the dimensions
 * of the in-app numpad handle so the language is consistent across
 * every dismissable surface in the product.
 */
export function ModalGrabHandle() {
  const { theme } = useAppTheme()
  return (
    <View style={styles.area} pointerEvents="none">
      <View
        style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  area: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 0,
    // Pull the next element up to close the gap with the screen
    // header. The ScreenHeader's own paddingTop=10 leaves an awkward
    // void below the pill if we don't compensate.
    marginBottom: -25,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    opacity: 0.55,
  },
})
