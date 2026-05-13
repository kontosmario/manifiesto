import { Redirect } from 'expo-router'
import { FijosSmartAlertsVariantsScreen } from '@/screens/dev/fijos-smart-alerts-variants-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <FijosSmartAlertsVariantsScreen />
}
