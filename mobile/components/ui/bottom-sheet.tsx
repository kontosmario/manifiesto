import { forwardRef, useCallback, useImperativeHandle, useRef, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  type BottomSheetBackdropProps,
  type BottomSheetModalProps,
} from '@gorhom/bottom-sheet'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'
import { triggerHaptic } from '@/lib/haptics'

export interface BottomSheetHandle {
  present: () => void
  dismiss: () => void
  snapTo: (index: number) => void
}

interface BottomSheetProps {
  children: ReactNode
  snapPoints?: Array<string | number>
  enableDynamicSizing?: boolean
  onDismiss?: () => void
  hapticOnDismiss?: boolean
  backgroundStyle?: BottomSheetModalProps['backgroundStyle']
}

export const BottomSheet = forwardRef<BottomSheetHandle, BottomSheetProps>(function BottomSheet(
  {
    children,
    snapPoints = ['50%', '90%'],
    enableDynamicSizing = false,
    onDismiss,
    hapticOnDismiss = true,
    backgroundStyle,
  },
  ref,
) {
  const { theme } = useAppTheme()
  const modalRef = useRef<BottomSheetModal>(null)

  useImperativeHandle(
    ref,
    () => ({
      present: () => modalRef.current?.present(),
      dismiss: () => modalRef.current?.dismiss(),
      snapTo: (index: number) => modalRef.current?.snapToIndex(index),
    }),
    [],
  )

  const handleDismiss = useCallback(() => {
    if (hapticOnDismiss) void triggerHaptic('selection')
    onDismiss?.()
  }, [hapticOnDismiss, onDismiss])

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  )

  return (
    <BottomSheetModal
      ref={modalRef}
      snapPoints={snapPoints}
      enableDynamicSizing={enableDynamicSizing}
      enablePanDownToClose
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{
        backgroundColor: theme.colors.borderStrong,
        width: 36,
        height: 4,
      }}
      backgroundStyle={[
        {
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: radii['2xl'],
          borderTopRightRadius: radii['2xl'],
        },
        backgroundStyle,
      ]}
    >
      <View style={styles.content}>{children}</View>
    </BottomSheetModal>
  )
})

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
})
