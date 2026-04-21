import { useEffect, useMemo, useState } from 'react'
import { Animated } from 'react-native'
import { State, type PanGestureHandlerGestureEvent, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'

export function useModalCardMotion({
  onClose,
  visible,
}: {
  onClose: () => void
  visible: boolean
}) {
  const isReducedMotionEnabled = useReducedMotion()
  const [backdropOpacity] = useState(() => new Animated.Value(0))
  const [sheetTranslateY] = useState(() => new Animated.Value(32))
  const [sheetScale] = useState(() => new Animated.Value(0.98))
  const [dragTranslateY] = useState(() => new Animated.Value(0))
  const [isClosing, setIsClosing] = useState(false)

  const sheetOffset = useMemo(
    () => Animated.add(sheetTranslateY, dragTranslateY),
    [dragTranslateY, sheetTranslateY],
  )
  const backdropMotionOpacity = useMemo(
    () =>
      Animated.multiply(
        backdropOpacity,
        dragTranslateY.interpolate({
          inputRange: [0, 240],
          outputRange: [1, 0.52],
          extrapolate: 'clamp',
        }),
      ),
    [backdropOpacity, dragTranslateY],
  )

  const dismissSheet = (tone: 'selection' | 'light' = 'selection') => {
    if (isClosing) {
      return
    }

    setIsClosing(true)
    void triggerHaptic(tone)

    if (isReducedMotionEnabled) {
      backdropOpacity.setValue(0)
      sheetTranslateY.setValue(32)
      sheetScale.setValue(1)
      dragTranslateY.setValue(0)
      setIsClosing(false)
      onClose()
      return
    }

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(dragTranslateY, {
        toValue: 260,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(sheetScale, {
        toValue: 0.98,
        damping: 20,
        stiffness: 210,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start(() => {
      dragTranslateY.setValue(0)
      setIsClosing(false)
      onClose()
    })
  }

  const restoreSheetPosition = () => {
    if (isReducedMotionEnabled) {
      dragTranslateY.setValue(0)
      sheetScale.setValue(1)
      return
    }

    Animated.parallel([
      Animated.spring(dragTranslateY, {
        toValue: 0,
        damping: 24,
        stiffness: 240,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.spring(sheetScale, {
        toValue: 1,
        damping: 20,
        stiffness: 220,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start()
  }

  const handleSheetDrag = ({ nativeEvent }: PanGestureHandlerGestureEvent) => {
    const nextTranslate = Math.max(0, nativeEvent.translationY)
    dragTranslateY.setValue(nextTranslate)
    sheetScale.setValue(1 - Math.min(nextTranslate / 1400, 0.025))
  }

  const handleSheetDragStateChange = ({
    nativeEvent,
  }: PanGestureHandlerStateChangeEvent) => {
    if (nativeEvent.state === State.BEGAN) {
      dragTranslateY.stopAnimation()
      sheetScale.stopAnimation()
      return
    }

    if (
      nativeEvent.state === State.END ||
      nativeEvent.state === State.CANCELLED ||
      nativeEvent.state === State.FAILED
    ) {
      const shouldDismiss = nativeEvent.translationY > 150 || nativeEvent.velocityY > 1050

      if (shouldDismiss) {
        dismissSheet('light')
        return
      }

      restoreSheetPosition()
    }
  }

  useEffect(() => {
    if (!visible) {
      backdropOpacity.setValue(0)
      sheetTranslateY.setValue(32)
      sheetScale.setValue(0.98)
      dragTranslateY.setValue(0)
      return
    }

    if (isReducedMotionEnabled) {
      backdropOpacity.setValue(1)
      sheetTranslateY.setValue(0)
      sheetScale.setValue(1)
      dragTranslateY.setValue(0)
      return
    }

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        damping: 22,
        stiffness: 210,
        mass: 0.95,
        useNativeDriver: true,
      }),
      Animated.spring(sheetScale, {
        toValue: 1,
        damping: 20,
        stiffness: 210,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.timing(dragTranslateY, {
        toValue: 0,
        duration: 1,
        useNativeDriver: true,
      }),
    ]).start()
  }, [
    backdropOpacity,
    dragTranslateY,
    isReducedMotionEnabled,
    sheetScale,
    sheetTranslateY,
    visible,
  ])

  return {
    backdropMotionOpacity,
    dismissSheet,
    handleSheetDrag,
    handleSheetDragStateChange,
    isClosing,
    sheetOffset,
    sheetScale,
  }
}
