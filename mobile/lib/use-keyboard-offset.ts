import { useEffect } from 'react'
import { Keyboard, Platform } from 'react-native'
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import { motionEasings } from '@/lib/motion'
import { KEYBOARD_HIDE_EVENT, KEYBOARD_SHOW_EVENT } from '@/hooks/use-keyboard-height'

/**
 * Tracks the keyboard height as a negative shared value so callers
 * can add it to a sheet's translateY for keyboard avoidance without
 * fighting `KeyboardAvoidingView` (which collapses flex sizing inside
 * Modals).
 *
 * Behavior:
 *   • `visible` false → resets offset to 0 + dismisses any open keyboard
 *     (avoids floating keyboard when the modal closes mid-edit)
 *   • Subscribes to the platform-correct keyboard events (shared
 *     `KEYBOARD_SHOW_EVENT`/`KEYBOARD_HIDE_EVENT` from
 *     `use-keyboard-height` — Android never fires the `will*` pair);
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
    // Duración: en iOS `?? fallback` respeta el `duration: 0` legítimo
    // (teclado por hardware, cambios sin animación) y snapea en sincronía
    // con el sistema; en Android los eventos did* reportan 0 SIEMPRE, así
    // que `|| fallback` le da una duración real a la animación.
    const showSub = Keyboard.addListener(KEYBOARD_SHOW_EVENT, (e) => {
      keyboardOffset.value = withTiming(-(e.endCoordinates.height ?? 0), {
        duration: Platform.OS === 'ios' ? e.duration ?? 250 : e.duration || 250,
        easing: motionEasings.decelerate,
      })
    })
    const hideSub = Keyboard.addListener(KEYBOARD_HIDE_EVENT, (e) => {
      keyboardOffset.value = withTiming(0, {
        duration: Platform.OS === 'ios' ? e.duration ?? 200 : e.duration || 200,
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
