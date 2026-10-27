import { SetupGuidePage } from "@/components/onboarding/SetupGuide"

export const metadata = { title: "Getting started" }

// The setup guide (ADR-019), always reachable from the sidebar.
export default function GettingStartedPage() {
  return <SetupGuidePage />
}
