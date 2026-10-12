import { useLocalSearchParams } from "expo-router"
import { NeedsInternet, Screen, ScreenHeader, useIsOnline } from "../../src/components"
import { ShiftDetailView } from "../../src/features/shifts/components/ShiftDetailView"

// R3: one shift's figures (online — GET /api/shifts/[id]). Opened from Shift
// history; the view lives in src/features/shifts so a tablet layout can reuse it.
export default function ShiftDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const online = useIsOnline()
  return (
    <Screen>
      <ScreenHeader title="Shift" />
      {!online ? <NeedsInternet feature="Shift details" /> : id ? <ShiftDetailView shiftId={id} /> : null}
    </Screen>
  )
}
