import { useRef } from 'react'
import type { ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
  type ScrollViewProps,
} from 'react-native'
import Animated from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useSegments } from 'expo-router'
import { ModalGrabHandle } from '@/components/ui/modal-grab-handle'
import { ScreenHeader } from '@/components/ui/screen-header'
import { useScreenEntrance } from '@/components/ui/use-screen-entrance'
import { useTabScreenEntrance } from '@/components/ui/use-tab-screen-entrance'
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
  /**
   * Rendered inside the safe-area, BEHIND the scrollable content.
   * Use for absolute-positioned ambient decorations (blobs,
   * gradients) that must cover the full viewport and stay fixed
   * while the content scrolls. Putting them inside `children` would
   * either scroll with content (scrollable Screen) or get clipped
   * to the inner stack View's bounds.
   */
  backgroundSlot?: ReactNode
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
  backgroundSlot,
  children,
  contentContainerStyle,
  ...scrollViewProps
}: ScreenProps) {
  const router = useRouter()
  const segments = useSegments()
  const { theme } = useAppTheme()
  const isReducedMotionEnabled = useReducedMotion()
  // `isTabScreen` tiene que ser ESTABLE por pantalla: un screen de tab SIEMPRE
  // es de tab. Pero `useSegments()` es GLOBAL (la ruta ACTUAL), así que cuando
  // navegás a una sub-pantalla de Settings, los tab screens MONTADOS (lazy:false)
  // ven segments=Settings → isTabScreen=false → usan el bottomPadding chico (20).
  // Al volver y actualizarse a (tabs) → isTabScreen=true → bottomPadding salta a
  // 96 → el frame del contenido se encoge ~96px y TODO se reacomoda = el
  // "warp/parpadeo" al volver de Settings (medido: frame 860→764). En el flujo
  // normal segments siempre es (tabs) → no se nota.
  // Fix: latch. Una vez que esta instancia se vio dentro de (tabs), lo es para
  // siempre — ignora los segments transitorios de otra ruta mientras sigue
  // montada. Los screens NO-tab (settings, modales) montan con SU ruta (nunca
  // (tabs)), así que nunca quedan latcheados en true.
  const segmentsAreTabs = (segments as readonly string[]).includes('(tabs)')
  const isTabScreenRef = useRef(segmentsAreTabs)
  if (segmentsAreTabs) isTabScreenRef.current = true
  const isTabScreen = isTabScreenRef.current
  const baseBottomPadding = theme.spacing.xxl + (isTabScreen ? 96 : 20)
  // Reserve extra bottom space when the shared InAppNumpad is open so
  // fields near the bottom of the scroll view stay reachable above
  // the numpad sheet.
  const numpadOffset = useNumpadOffset()
  const bottomPadding = baseBottomPadding + numpadOffset
  const { contentAnimatedStyle, headerAnimatedStyle } = useScreenEntrance({
    reducedMotion: isReducedMotionEnabled,
    // Tab screens are pre-mounted + detached; this mount-only rise would
    // fire on their first native attach and jump the content up from
    // translateY 18. Tabs use the opacity-only `useTabScreenEntrance`
    // below instead, so skip the generic translate rise here.
    skip: isTabScreen,
  })
  // Calm, professional first-load entrance for tab screens: a single
  // opacity fade (no translate → no position jolt on the first attach
  // of a detached tab). Replaces the old translateX `useTabFocusFade`,
  // whose instant position snap was the remaining "first-load jolt".
  // First focus fades in; later switches are instant.
  const tabEntrance = useTabScreenEntrance(isTabScreen)
  const tabFocusStyle = isTabScreen ? tabEntrance.style : null

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
        {backgroundSlot}
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
