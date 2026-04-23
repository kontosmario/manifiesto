import { RequireAuth } from '@/components/guards'
import { InsightsScreen } from '@/screens/home/insights-screen'

export default function InsightsRoute() {
  return <RequireAuth>{({ familyId }) => <InsightsScreen familyId={familyId} />}</RequireAuth>
}
