import { type ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppTheme } from '@/theme/theme-provider'

interface StickyFooterProps {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  divider?: boolean
}

/**
 * Fixed footer anchored to the bottom of a non-scrollable `Screen`.
 *
 * Keyboard avoidance is intentionally delegated upward:
 *  · iOS — the parent `Screen` wraps non-scrollable content in a
 *    `KeyboardAvoidingView` with `behavior="padding"`, so when the
 *    keyboard appears the whole container (including this footer)
 *    shifts up. We don't need to add `keyboardHeight` here.
 *  · Android — `windowSoftInputMode=adjustResize` (default) shrinks
 *    the window, so again the footer naturally sits at the new
 *    bottom above the keyboard.
 *
 * Adding our own `keyboardHeight` padding here on top of the above
 * caused triple-avoidance: content was pushed ~2× keyboard height,
 * leaving the CTA floating in the middle of the screen with huge
 * empty space below it (visible bug in Onboarding/AddFijo/AddExpense).
 */
export function StickyFooter({ children, style, divider = true }: StickyFooterProps) {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const bottomPadding = Math.max(insets.bottom, 12)

  // We deliberately don't hide the footer when the InAppNumpad is
  // open: the numpad's Modal sheet visually covers the bottom of
  // the screen and blocks taps anyway, and as it slides down on
  // close it gradually reveals the footer underneath — seamless.
  // Hiding via `return null` while open caused a visible gap on
  // close: footer would only reappear AFTER the slide-down
  // finished, leaving the UI feeling delayed.

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: bottomPadding,
          backgroundColor: theme.colors.canvas,
          borderTopColor: theme.colors.border,
          borderTopWidth: divider ? StyleSheet.hairlineWidth : 0,
        },
        style,
      ]}
    >
      <View style={styles.inner}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  inner: {
    flexDirection: 'column',
    gap: 10,
    alignItems: 'stretch',
  },
})
