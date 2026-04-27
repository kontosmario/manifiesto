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
import { ModalGrabHandle } from '@/components/ui/modal-grab-handle'
import { ScreenHeader } from '@/components/ui/screen-header'
import { useScreenEntrance } from '@/components/ui/use-screen-entrance'
import { useTabFocusFade } from '@/components/ui/use-tab-focus-fade'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { useIsAnyModalOpen } from '@/lib/modal-visibility'
import { useNumpadOffset } from '@/lib/numpad-visibility'
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
  /**
   * Override the SafeAreaView background. Use for screens whose canvas
   * is intentionally brand-fixed (e.g. auth flow on cream regardless of
   * theme). Defaults to `theme.colors.background`.
   */
  backgroundColor?: string
  /**
   * Render the small horizontal grab handle at the very top of the
   * screen — visually telegraphs the swipe-down dismiss gesture for
   * full-page modals. Use on screens registered with
   * `presentation: 'modal'` (add-expense, add-fixed-expense, etc).
   */
  showGrabHandle?: boolean
  /**
   * Forwarded ref to the underlying ScrollView. Use it from the
   * parent screen to call imperative APIs like `scrollToEnd` —
   * needed e.g. on login to bring the password CTA into view when
   * the keyboard opens.
   */
  scrollRef?: React.RefObject<ScrollView | null>
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
  backgroundColor,
  showGrabHandle = false,
  scrollRef,
  children,
  contentContainerStyle,
  ...scrollViewProps
}: ScreenProps) {
  const router = useRouter()
  const segments = useSegments()
  const { theme } = useAppTheme()
  const isReducedMotionEnabled = useReducedMotion()
  const isTabScreen = (segments as readonly string[]).includes('(tabs)')
  const baseBottomPadding = theme.spacing.xxl + (isTabScreen ? 96 : 20)
  // Reserve extra bottom space when the shared InAppNumpad is open so
  // fields near the bottom of the scroll view stay reachable above
  // the numpad sheet.
  const numpadOffset = useNumpadOffset()
  const bottomPadding = baseBottomPadding + numpadOffset
  const { contentAnimatedStyle, headerAnimatedStyle } = useScreenEntrance({
    reducedMotion: isReducedMotionEnabled,
  })
  // Subtle fade-in on tab switches (180ms, 0.92 → 1). No-op on mount
  // or stack pops. Tab screens opt in automatically via `isTabScreen`.
  const tabFocusOpacity = useTabFocusFade()
  const tabFocusStyle = isTabScreen ? { opacity: tabFocusOpacity } : null

  // When a ModalCard is open on top, suspend the Screen's keyboard
  // avoidance so the content behind the sheet doesn't jump up when
  // the sheet's input opens the keyboard. The sheet handles its own
  // avoidance internally.
  const isAnyModalOpen = useIsAnyModalOpen()
  const shouldAvoidKeyboard = keyboardAware && !isAnyModalOpen
  // Double-avoidance guard. In scrollable + iOS mode the ScrollView's
  // `automaticallyAdjustKeyboardInsets` already pushes content up by
  // the keyboard height natively — if we ALSO wrap in
  // KeyboardAvoidingView with behavior="padding", the content jumps
  // up by 2× keyboard height. Only enable the KAV padding when we
  // can't rely on the ScrollView's native adjustment: non-scrollable
  // screens (no ScrollView), or Android (where the OS handles it via
  // windowSoftInputMode=adjustResize).
  const kavBehavior =
    shouldAvoidKeyboard && Platform.OS === 'ios' && !scrollable
      ? 'padding'
      : undefined

  // Only render the ScreenHeader when there's something to show. An
  // empty header still costs ~32pt (10 paddingTop + 22 gap to the body),
  // which pushes custom tops (back+title rows, hero cards) way below
  // the safe area. Skipping it keeps the first visible element tight
  // at the top — aligning with the Ajustes screen's look.
  const hasHeaderContent = Boolean(title || subtitle || canGoBack || rightSlot)
  const header = hasHeaderContent ? (
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
  ) : null

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor: backgroundColor ?? theme.colors.background,
        },
      ]}
    >
      <KeyboardAvoidingView
        behavior={kavBehavior}
        keyboardVerticalOffset={isTabScreen ? 8 : 0}
        style={styles.safeArea}
      >
        <Animated.View style={[styles.safeArea, tabFocusStyle]}>
        {scrollable ? (
          <ScrollView
            ref={scrollRef}
            automaticallyAdjustKeyboardInsets={shouldAvoidKeyboard}
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
            {showGrabHandle ? <ModalGrabHandle /> : null}
            {header}
            <Animated.View style={[contentAnimatedStyle, bodyStyle]}>{children}</Animated.View>
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
            {showGrabHandle ? <ModalGrabHandle /> : null}
            {header}
            <Animated.View style={[styles.nonScrollableBody, contentAnimatedStyle, bodyStyle]}>
              {children}
            </Animated.View>
          </View>
        )}
        </Animated.View>
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
