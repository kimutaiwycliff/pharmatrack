import { useLocalSearchParams } from "expo-router"
import { Screen, ScreenHeader } from "../../src/components"
import { SaleReceipt } from "../../src/features/sales/components/SaleReceipt"

// One sale's receipt (reprint / share). `source=outbox` = a sale on this phone
// the server hasn't accepted yet (id = its client id); anything else is a
// server sale id (or, in the Offline Edition, a local ledger sale id).
export default function SaleReceiptScreen() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>()
  return (
    <Screen edges={["top", "left", "right"]}>
      <ScreenHeader title="Receipt" />
      <SaleReceipt key={`${source}:${id}`} id={String(id)} source={source === "outbox" ? "outbox" : "server"} />
    </Screen>
  )
}
