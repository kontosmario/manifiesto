import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'

/**
 * Returns the current software-keyboard height, in points. Updates
 * synchronously with `keyboardWillShow`/`keyboardWillHide` on iOS and
 * `keyboardDidShow`/`keyboardDidHide` on Android (which doesn't fire
 * the "will" events).
 *
 * Why not `KeyboardAvoidingView`: inside a `<Modal presentationStyle="overFullScreen">`
 * RN's KeyboardAvoidingView measures its frame against the wrong
 * native view (the modal is in a separate window on iOS), so its
 * bottom-padding ends up under- or over-shooting the actual keyboard
 * height. Tracking the height ourselves side-steps the issue entirely.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setHeight(e.endCoordinates?.height ?? 0)
    })
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setHeight(0)
    })

    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  return height
}
