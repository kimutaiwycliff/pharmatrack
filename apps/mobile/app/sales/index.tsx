import Ionicons from "@expo/vector-icons/Ionicons"
import { router } from "expo-router"
import { useState } from "react"
import { BranchSwitcher, MasterDetail, Screen, ScreenHeader } from "../../src/components"
import { useIsTablet } from "../../src/hooks/useIsTablet"
import { env } from "../../src/lib/env"
import { SaleReceipt, type SaleSelection } from "../../src/features/sales/components/SaleReceipt"
import { SalesList } from "../../src/features/sales/components/SalesList"
import { useTheme } from "../../src/theme/useTheme"

// Sales history (More → Sales history). Phones push /sales/[id] for a receipt;
// tablets keep the list on the left and the selected receipt on the right.
// List + receipt logic live in src/features/sales.
export default function SalesScreen() {
  const theme = useTheme()
  const tablet = useIsTablet()
  const [selected, setSelected] = useState<SaleSelection | null>(null)

  function open(sale: SaleSelection) {
    if (tablet) setSelected(sale)
    else router.push({ pathname: "/sales/[id]", params: { id: sale.id, source: sale.source } })
  }

  const header = <ScreenHeader title="Sales history" right={env.EXPO_PUBLIC_OFFLINE_MODE ? null : <BranchSwitcher />} />
  const selectedKey = selected ? `${selected.source}:${selected.id}` : null

  if (!tablet) {
    return (
      <Screen edges={["top", "left", "right"]}>
        {header}
        <SalesList onSelect={open} />
      </Screen>
    )
  }

  return (
    <Screen edges={["top", "left", "right"]}>
      {header}
      <MasterDetail
        master={<SalesList selectedKey={selectedKey} onSelect={open} />}
        detail={selected ? <SaleReceipt key={selectedKey} id={selected.id} source={selected.source} /> : null}
        placeholder={{
          icon: <Ionicons name="receipt-outline" size={40} color={theme.textTertiary} />,
          message: "Pick a sale to see its receipt, share it on WhatsApp or as a PDF.",
        }}
      />
    </Screen>
  )
}
