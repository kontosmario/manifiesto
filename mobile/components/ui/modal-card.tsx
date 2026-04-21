import { type PropsWithChildren } from 'react'
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppCard } from '@/components/ui/card'
import { ModalCardHeader } from '@/components/ui/modal-card-header'
import { useModalCardMotion } from '@/components/ui/use-modal-card-motion'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface ModalCardProps extends PropsWithChildren {
  visible: boolean
  title: string
  subtitle?: string
  onClose: () => void
}

export function ModalCard({ visible, title, subtitle, onClose, children }: ModalCardProps) {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const {
    backdropMotionOpacity,
    dismissSheet,
    handleSheetDrag,
    handleSheetDragStateChange,
    isClosing,
    sheetOffset,
    sheetScale,
  } = useModalCardMotion({
    onClose,
    visible,
  })

  return (
    <Modal animationType="none" presentationStyle="overFullScreen" transparent visible={visible}>
      <Animated.View
        style={[
          styles.modalRoot,
          {
            opacity: backdropMotionOpacity,
          },
        ]}
      >
        <SafeAreaView
          accessibilityViewIsModal
          importantForAccessibility="yes"
          style={[styles.safeArea, { backgroundColor: theme.colors.overlay }]}
        >
          <Pressable
            accessible={false}
            style={styles.backdrop}
            onPress={() => {
              Keyboard.dismiss()
              dismissSheet()
            }}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.bottom > 0 ? 8 : 0}
            style={styles.keyboardArea}
          >
            <Animated.View
              style={[
                styles.sheet,
                {
                  transform: [{ translateY: sheetOffset }, { scale: sheetScale }],
                },
              ]}
            >
              <AppCard elevated style={styles.card}>
                <ModalCardHeader
                  isClosing={isClosing}
                  onGestureEvent={handleSheetDrag}
                  onHandlerStateChange={handleSheetDragStateChange}
                  subtitle={subtitle}
                  title={title}
                />
                <ScrollView
                  automaticallyAdjustKeyboardInsets
                  contentContainerStyle={[
                    styles.content,
                    { paddingBottom: Math.max(8, insets.bottom) },
                  ]}
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {children}
                </ScrollView>
              </AppCard>
            </Animated.View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  keyboardArea: {
    padding: 18,
  },
  sheet: {
    maxHeight: '88%',
  },
  card: {
    borderRadius: radii['2xl'], // hero-grade surface — preserves original 28
    gap: 8,
  },
  content: {
    gap: 16,
    marginTop: 8,
  },
})
