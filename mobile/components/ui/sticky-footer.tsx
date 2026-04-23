import { useEffect, useState, type ReactNode } from 'react'
import {
  Keyboard,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppTheme } from '@/theme/theme-provider'

interface StickyFooterProps {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  divider?: boolean
}

export function StickyFooter({ children, style, divider = true }: StickyFooterProps) {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height)
    })
    const hide = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardHeight(0)
    })
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  const safeBottom = Math.max(insets.bottom, 12)
  const bottomPadding = keyboardHeight > 0 ? keyboardHeight - insets.bottom + 12 : safeBottom

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
