import Constants, { ExecutionEnvironment } from 'expo-constants'
import { Platform } from 'react-native'

export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient

export const canUseNativePushNotifications = Platform.OS !== 'web' && !isExpoGo

/**
 * Native-driver animations (`Animated.timing({ useNativeDriver: true })`)
 * require the `RCTAnimation` native module, which does not exist on web.
 * Passing `true` there triggers a runtime warning. Use this flag instead:
 * `true` on iOS/Android, `false` on web.
 */
export const USE_NATIVE_DRIVER = Platform.OS !== 'web'
