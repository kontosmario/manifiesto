import { Redirect } from 'expo-router'
import { ActivityOcrPreviewScreen } from '@/screens/dev/activity-ocr-preview-screen'

// Sprint M · Audit #7 M-4 (2026-06-14): restore the __DEV__ gate that
// Phase B sideload (2026-06-02) temporarily removed for on-device OCR
// pipeline testing in the preview IPA. Sister dev routes
// (dev-health.tsx, dev/cycle-wrapped.tsx, dev/preview.tsx) all gate
// the same way; this one was the only outlier shipping ungated to
// production builds.
export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <ActivityOcrPreviewScreen />
}
