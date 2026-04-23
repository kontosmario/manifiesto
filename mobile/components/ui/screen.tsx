import type { ReactNode } from 'react'
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
  type ScrollViewProps,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useSegments } from 'expo-router'
import { ScreenHeader } from '@/components/ui/screen-header'
import { useScreenEntrance } from '@/components/ui/use-screen-entrance'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

interface ScreenProps extends ScrollViewProps {
  title?: string
  titleColor?: string
  subtitle?: string
  rightSlot?: ReactNode
  canGoBack?: boolean
  keyboardAware?: boolean
  scrollable?: boolean
  bodyStyle?: StyleProp<ViewStyle>
}

export function Screen({
  title,
  titleColor,
  subtitle,
  rightSlot,
  canGoBack = false,
  keyboardAware = true,
  scrollable = true,
  bodyStyle,
  children,
  contentContainerStyle,
  ...scrollViewProps
}: ScreenProps) {
  const router = useRouter()
  const segments = useSegments()
  const { theme } = useAppTheme()
  const isReducedMotionEnabled = useReducedMotion()
  const isTabScreen = (segments as readonly string[]).includes('(tabs)')
  const bottomPadding = theme.spacing.xxl + (isTabScreen ? 96 : 20)
  const { contentAnimatedStyle, headerAnimatedStyle } = useScreenEntrance({
    reducedMotion: isReducedMotionEnabled,
  })

  const header = (
    <Animated.View style={headerAnimatedStyle}>
      <ScreenHeader
        canGoBack={canGoBack}
        rightSlot={rightSlot}
        subtitle={subtitle}
        title={title}
        titleColor={titleColor}
        onBackPress={() => {
          void triggerHaptic('selection')
          router.back()
        }}
      />
    </Animated.View>
  )

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor: theme.colors.background,
        },
      ]}
    >
      <KeyboardAvoidingView
        behavior={keyboardAware && Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={isTabScreen ? 8 : 0}
        style={styles.safeArea}
      >
        {scrollable ? (
          <ScrollView
            automaticallyAdjustKeyboardInsets={keyboardAware}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={[
              styles.content,
              {
                paddingBottom: bottomPadding,
              },
              contentContainerStyle,
            ]}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            {...scrollViewProps}
          >
            {header}
            <Animated.View style={contentAnimatedStyle}>{children}</Animated.View>
          </ScrollView>
        ) : (
          <View
            style={[
              styles.nonScrollableContent,
              {
                paddingBottom: bottomPadding,
              },
              contentContainerStyle,
            ]}
          >
            {header}
            <Animated.View style={[styles.nonScrollableBody, contentAnimatedStyle, bodyStyle]}>
              {children}
            </Animated.View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 22,
  },
  nonScrollableContent: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 22,
  },
  nonScrollableBody: {
    flex: 1,
    minHeight: 0,
  },
})
