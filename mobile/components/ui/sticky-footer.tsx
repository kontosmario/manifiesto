import { type ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View
        style={[
          styles.container,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: theme.colors.canvas,
            borderTopColor: theme.colors.border,
            borderTopWidth: divider ? StyleSheet.hairlineWidth : 0,
          },
          style,
        ]}
      >
        <View style={styles.inner}>{children}</View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    paddingTop: 12,
  },
  inner: {
    flexDirection: 'column',
    gap: 10,
    alignItems: 'stretch',
  },
})
