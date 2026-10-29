import { DashboardPreview } from './6-dashboard'

// Vorschau Screen 6b: Dashboard ohne Pflanzen (neues Konto nach „Später“ im Onboarding).
export default function EmptyDashboardPreview() {
  return <DashboardPreview plants={[]} />
}
