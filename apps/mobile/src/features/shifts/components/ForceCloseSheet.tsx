import { useState } from "react"
import { Button, Sheet, Text, TextField } from "../../../components"
import { errorMessage } from "../../../lib/api"
import { formatDateTime } from "../../../lib/dates"
import { haptics } from "../../../lib/haptics"
import { toast } from "../../../lib/toast"
import { forceCloseShift } from "../api"
import { parseOptionalCash } from "../logic/shifts"

// R3: a manager (shifts.close_others) ends someone else's open shift on the
// server — PATCH /api/shifts with closing cash optional, exactly like the web
// /shifts page's force-close. This sheet is the confirm step: who, since when,
// an optional drawer count and a note. Render with key={target?.id} so the
// fields start empty for each shift.

export interface ForceCloseTarget {
  id: string
  cashierName: string
  clockedInAt: string
}

interface ForceCloseSheetProps {
  target: ForceCloseTarget | null
  onClose: () => void
  onClosed: (shiftId: string) => void
}

export function ForceCloseSheet({ target, onClose, onClosed }: ForceCloseSheetProps) {
  const [cash, setCash] = useState("")
  const [notes, setNotes] = useState("")
  const [cashError, setCashError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
    if (!target) return
    const parsed = parseOptionalCash(cash)
    if (!parsed.ok) {
      setCashError("Enter an amount like 1500 or 1500.50, or leave it blank")
      return
    }
    setCashError(null)
    setPending(true)
    try {
      await forceCloseShift({ shiftId: target.id, closingCashCents: parsed.cents, notes })
      haptics.success()
      toast.success(`${target.cashierName}'s shift is closed`)
      onClosed(target.id)
    } catch (err) {
      haptics.error()
      toast.error(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet
      open={!!target}
      onClose={onClose}
      title={target ? `Close ${target.cashierName}'s shift?` : "Close shift"}
      scrollable
      footer={<Button title="Force close shift" variant="danger" size="lg" loading={pending} onPress={() => void submit()} />}
    >
      {target ? (
        <Text tone="secondary">
          {`Open since ${formatDateTime(target.clockedInAt)}. Use this when they forgot to clock out — it's recorded as force-closed by you.`}
        </Text>
      ) : null}
      <TextField
        inSheet
        label="Counted cash (optional)"
        placeholder="e.g. 4500"
        keyboardType="decimal-pad"
        value={cash}
        onChangeText={(t) => {
          setCash(t)
          if (cashError) setCashError(null)
        }}
        error={cashError}
        helper="Leave blank if nobody counted the drawer — no variance is recorded then."
      />
      <TextField
        inSheet
        label="Note (optional)"
        placeholder="Why it was closed"
        value={notes}
        onChangeText={setNotes}
        maxLength={1000}
        multiline
      />
    </Sheet>
  )
}
