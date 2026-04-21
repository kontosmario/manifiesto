import { forwardRef, useCallback, useImperativeHandle, useRef, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import GorhomBottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetProps as GorhomBottomSheetProps,
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
  backgroundStyle?: GorhomBottomSheetProps['backgroundStyle']
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
  const sheetRef = useRef<GorhomBottomSheet>(null)

  useImperativeHandle(
    ref,
    () => ({
      present: () => sheetRef.current?.expand(),
      dismiss: () => sheetRef.current?.close(),
      snapTo: (index: number) => sheetRef.current?.snapToIndex(index),
    }),
    [],
  )

  const handleClose = useCallback(() => {
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
    <GorhomBottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enableDynamicSizing={enableDynamicSizing}
      enablePanDownToClose
      onClose={handleClose}
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
    </GorhomBottomSheet>
  )
})

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
})
