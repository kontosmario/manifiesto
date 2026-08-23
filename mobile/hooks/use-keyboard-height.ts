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
/**
 * Nombres de evento de teclado por plataforma — Android nunca emite el par
 * `will*`, así que allá se escucha `did*`. Exportados para que todos los
 * hooks de teclado compartan la MISMA selección (ver use-keyboard-offset).
 */
export const KEYBOARD_SHOW_EVENT =
  Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
export const KEYBOARD_HIDE_EVENT =
  Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const showSub = Keyboard.addListener(KEYBOARD_SHOW_EVENT, (e) => {
      setHeight(e.endCoordinates?.height ?? 0)
    })
    const hideSub = Keyboard.addListener(KEYBOARD_HIDE_EVENT, () => {
      setHeight(0)
    })

    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  return height
}
