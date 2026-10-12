import { useState } from "react"
import { Button, Sheet, Text, TextField } from "../../../components"
import { apiJson, errorMessage } from "../../../lib/api"
import { haptics } from "../../../lib/haptics"
import { toast } from "../../../lib/toast"
import { issueKind, type SyncIssue } from "../logic/kinds"

// R3: mark a sync issue resolved — PATCH /api/sync-issues/[id] with an
// optional note (≤500 chars, apps/web/app/api/sync-issues/[id]/route.ts).
// Same prompt and toasts as the web inbox. Render with key={issue?.id}.
export function ResolveSheet({ issue, onClose, onResolved }: { issue: SyncIssue | null; onClose: () => void; onResolved: (id: string, note: string | null) => void }) {
  const [note, setNote] = useState("")
  const [pending, setPending] = useState(false)
  const k = issue ? issueKind(issue.kind) : null

  async function resolve() {
    if (!issue) return
    const trimmed = note.trim()
    setPending(true)
    try {
      await apiJson(`/api/sync-issues/${encodeURIComponent(issue.id)}`, { method: "PATCH", body: trimmed ? { note: trimmed } : {} })
      haptics.success()
      toast.success("Resolved")
      onResolved(issue.id, trimmed || null)
    } catch (err) {
      haptics.error()
      toast.error(`Couldn't resolve — ${errorMessage(err)}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet
      open={!!issue}
      onClose={onClose}
      title="Resolve issue"
      scrollable
      footer={<Button title="Mark resolved" size="lg" loading={pending} onPress={() => void resolve()} />}
    >
      {issue && k ? (
        <>
          <Text variant="bodyStrong">{k.label}</Text>
          {k.describe(issue) ? <Text tone="secondary">{k.describe(issue)}</Text> : null}
        </>
      ) : null}
      <TextField
        inSheet
        label="What did you do? (optional)"
        placeholder="e.g. Recounted and adjusted stock"
        value={note}
        onChangeText={setNote}
        maxLength={500}
        multiline
        helper={`${note.length}/500`}
      />
    </Sheet>
  )
}
