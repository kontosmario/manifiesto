import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'

export type AppHapticTone =
  | 'none'
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error'

export async function triggerHaptic(tone: AppHapticTone) {
  if (tone === 'none' || Platform.OS === 'web') {
    return
  }

  try {
    switch (tone) {
      case 'selection':
        await Haptics.selectionAsync()
        return
      case 'light':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        return
      case 'medium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        return
      case 'heavy':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
        return
      case 'success':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        return
      case 'warning':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        return
      case 'error':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        return
      default:
        return
    }
  } catch {
    return
  }
}
