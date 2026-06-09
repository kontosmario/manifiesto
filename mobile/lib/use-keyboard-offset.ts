import { useEffect } from 'react'
import { Keyboard } from 'react-native'
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import { motionEasings } from '@/lib/motion'

/**
 * Tracks the keyboard height as a negative shared value so callers
 * can add it to a sheet's translateY for keyboard avoidance without
 * fighting `KeyboardAvoidingView` (which collapses flex sizing inside
 * Modals).
 *
 * Behavior:
 *   • `visible` false → resets offset to 0 + dismisses any open keyboard
 *     (avoids floating keyboard when the modal closes mid-edit)
 *   • Subscribes to `keyboardWillShow`/`keyboardWillHide` while visible;
 *     unsubscribes on close.
 *   • CRITICAL: resets offset on every `visible` transition. If the
 *     listener `hide` callback unmounts before firing, the offset can
 *     persist → the sheet re-opens translated and floats mid-screen.
 */
export function useKeyboardOffset(visible: boolean): SharedValue<number> {
  const keyboardOffset = useSharedValue(0)

  useEffect(() => {
    keyboardOffset.value = 0
    if (!visible) {
      Keyboard.dismiss()
      return
    }
    const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
      keyboardOffset.value = withTiming(-(e.endCoordinates.height ?? 0), {
        duration: e.duration ?? 250,
        easing: motionEasings.decelerate,
      })
    })
    const hideSub = Keyboard.addListener('keyboardWillHide', (e) => {
      keyboardOffset.value = withTiming(0, {
        duration: e.duration ?? 200,
        easing: motionEasings.decelerate,
      })
    })
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [visible, keyboardOffset])

  return keyboardOffset
}
