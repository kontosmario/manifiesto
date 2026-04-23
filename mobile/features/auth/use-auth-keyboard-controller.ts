import { Animated, Easing, Keyboard, Platform, TextInput } from 'react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthMode } from '@/features/auth/auth-flow'
import { USE_NATIVE_DRIVER } from '@/lib/runtime-environment'
import {
  computeAuthKeyboardShiftTarget,
  type FocusedAuthField,
} from '@/features/auth/auth-layout'

export function useAuthKeyboardController({
  isReducedMotionEnabled,
  mode,
}: {
  isReducedMotionEnabled: boolean
  mode: AuthMode
}) {
  const [availableContentHeight, setAvailableContentHeight] = useState(0)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [keyboardScreenY, setKeyboardScreenY] = useState(0)
  const [keyboardShiftTarget, setKeyboardShiftTarget] = useState(0)
  const [focusedField, setFocusedField] = useState<FocusedAuthField | null>(null)

  const nameInputRef = useRef<TextInput | null>(null)
  const emailInputRef = useRef<TextInput | null>(null)
  const passwordInputRef = useRef<TextInput | null>(null)
  const focusedFieldBaseBottomRef = useRef(0)
  const keyboardAnimationDurationRef = useRef(260)
  const [keyboardShift] = useState(() => new Animated.Value(0))

  const getFieldRef = useCallback((field: FocusedAuthField) => {
    switch (field) {
      case 'name':
        return nameInputRef.current
      case 'email':
        return emailInputRef.current
      case 'password':
        return passwordInputRef.current
    }
  }, [])

  const captureFieldBaseBottom = useCallback(
    (field: FocusedAuthField, shiftTarget = keyboardShiftTarget) => {
      const targetRef = getFieldRef(field)

      if (!targetRef || typeof targetRef.measureInWindow !== 'function') {
        focusedFieldBaseBottomRef.current = 0
        return
      }

      requestAnimationFrame(() => {
        targetRef.measureInWindow((_x, y, _width, height) => {
          focusedFieldBaseBottomRef.current = y + height + shiftTarget
        })
      })
    },
    [getFieldRef, keyboardShiftTarget],
  )

  const measureFocusedFieldShift = useCallback(
    (field: FocusedAuthField | null, nextKeyboardScreenY: number) => {
      if (!field || nextKeyboardScreenY <= 0) {
        setKeyboardShiftTarget(0)
        return
      }

      const targetRef = getFieldRef(field)

      if (!targetRef || typeof targetRef.measureInWindow !== 'function') {
        setKeyboardShiftTarget(0)
        return
      }

      requestAnimationFrame(() => {
        targetRef.measureInWindow((_x, y, _width, height) => {
          const fieldBottom = y + height
          const fallbackBaseFieldBottom = fieldBottom + keyboardShiftTarget
          const baseFieldBottom =
            focusedFieldBaseBottomRef.current > 0 ? focusedFieldBaseBottomRef.current : fallbackBaseFieldBottom
          const keyboardTopLimit = nextKeyboardScreenY - 20
          const nextTarget = computeAuthKeyboardShiftTarget({
            baseFieldBottom,
            focusedField: field,
            keyboardTopLimit,
            mode,
            platform: Platform.OS === 'android' ? 'android' : 'ios',
          })

          setKeyboardShiftTarget(nextTarget)
        })
      })
    },
    [getFieldRef, keyboardShiftTarget, mode],
  )

  const handleFieldFocus = useCallback(
    (field: FocusedAuthField) => {
      setFocusedField(field)
      captureFieldBaseBottom(field)

      if (keyboardHeight && keyboardScreenY > 0) {
        keyboardAnimationDurationRef.current = isReducedMotionEnabled ? 0 : 220
        measureFocusedFieldShift(field, keyboardScreenY)
      }
    },
    [captureFieldBaseBottom, isReducedMotionEnabled, keyboardHeight, keyboardScreenY, measureFocusedFieldShift],
  )

  const handleFieldBlur = useCallback((field: FocusedAuthField) => {
    setFocusedField((currentField) => {
      if (currentField !== field) {
        return currentField
      }

      focusedFieldBaseBottomRef.current = 0
      return null
    })
  }, [])

  useEffect(() => {
    const handleKeyboardShow = (event: {
      duration?: number
      endCoordinates: {
        height: number
        screenY: number
      }
    }) => {
      if (event.endCoordinates.height <= 0) {
        return
      }

      keyboardAnimationDurationRef.current =
        event.duration && event.duration > 0
          ? event.duration
          : isReducedMotionEnabled
            ? 0
            : 240
      setKeyboardHeight(event.endCoordinates.height)
      setKeyboardScreenY(event.endCoordinates.screenY)
      measureFocusedFieldShift(focusedField, event.endCoordinates.screenY)
    }

    const handleKeyboardHide = (event?: {
      duration?: number
      endCoordinates: {
        height: number
        screenY: number
      }
    }) => {
      keyboardAnimationDurationRef.current =
        event?.duration && event.duration > 0
          ? event.duration
          : isReducedMotionEnabled
            ? 0
            : 220
      setKeyboardHeight(0)
      setKeyboardScreenY(0)
      setKeyboardShiftTarget(0)
      focusedFieldBaseBottomRef.current = 0
    }

    const keyboardListeners = [
      Keyboard.addListener('keyboardWillShow', handleKeyboardShow),
      Keyboard.addListener('keyboardDidShow', handleKeyboardShow),
      Keyboard.addListener('keyboardWillHide', handleKeyboardHide),
      Keyboard.addListener('keyboardDidHide', () => {
        handleKeyboardHide()
      }),
    ]

    return () => {
      keyboardListeners.forEach((listener) => listener.remove())
    }
  }, [focusedField, isReducedMotionEnabled, measureFocusedFieldShift])

  useEffect(() => {
    const animation = Animated.timing(keyboardShift, {
      toValue: -keyboardShiftTarget,
      duration: keyboardAnimationDurationRef.current,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    })

    animation.start()

    return () => {
      animation.stop()
    }
  }, [keyboardHeight, keyboardShift, keyboardShiftTarget, mode])

  const dismissKeyboard = useCallback(() => {
    if (!keyboardHeight) {
      return
    }

    focusedFieldBaseBottomRef.current = 0
    setFocusedField(null)
    Keyboard.dismiss()
  }, [keyboardHeight])

  const handleViewportLayout = useCallback((height: number) => {
    setAvailableContentHeight((currentHeight) => {
      if (Math.abs(currentHeight - height) < 2) {
        return currentHeight
      }

      return height
    })
  }, [])

  return {
    availableContentHeight,
    emailInputRef,
    keyboardHeight,
    keyboardShift,
    nameInputRef,
    passwordInputRef,
    isKeyboardVisible: keyboardHeight > 0,
    actions: {
      dismissKeyboard,
      handleFieldBlur,
      handleFieldFocus,
      handleViewportLayout,
    },
  }
}
