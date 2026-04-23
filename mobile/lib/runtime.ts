import { LogBox } from 'react-native'
import 'expo-sqlite/localStorage/install'
import 'react-native-url-polyfill/auto'

const ignoredExpoGlLogs = [
  "EXGL: gl.pixelStorei() doesn't support this parameter yet!",
] as const

LogBox.ignoreLogs([...ignoredExpoGlLogs])
