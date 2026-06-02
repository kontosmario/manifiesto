import { ActivityOcrPreviewScreen } from '@/screens/dev/activity-ocr-preview-screen'

// TEMPORAL — Phase B sideload build (2026-06-02). El __DEV__ redirect
// está sacado para que el preview build IPA pueda ejercitar el OCR
// pipeline en device real. Restaurar al cerrar Phase B:
//   import { Redirect } from 'expo-router'
//   if (!__DEV__) return <Redirect href="/(app)/settings" />
export default function Page() {
  return <ActivityOcrPreviewScreen />
}
