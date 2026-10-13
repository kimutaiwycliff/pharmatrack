import Ionicons from "@expo/vector-icons/Ionicons"
import { useState, type ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import Animated from "react-native-reanimated"
import { Button, ErrorState, PressableScale, Sheet, SkeletonBlock, Text, TextField } from "../../../components"
import { useCan } from "../../../hooks/useCan"
import { useQuery } from "../../../hooks/useQuery"
import { ApiError, errorMessage } from "../../../lib/api"
import { env } from "../../../lib/env"
import { useMotion } from "../../../lib/motion"
import { toast } from "../../../lib/toast"
import { useTheme } from "../../../theme/useTheme"
import { radius, space } from "../../../theme/tokens"
import { deleteProduct, getDeleteImpact, setProductActive } from "../data"
import { erasedLines, historyLines, impactFromConflict, keptLines, nameMatches, removePlan, type ImpactCounts } from "../logic/deleteImpact"
import type { ProductDetail } from "../types"

interface DeleteProductSheetProps {
  open: boolean
  product: ProductDetail
  onClose: () => void
  /** "deleted" → leave the screen; "deactivated" → stay and refresh. */
  onDone: (result: "deleted" | "deactivated") => void
}

const LOCAL = env.EXPO_PUBLIC_OFFLINE_MODE

// One place to retire a product — mirrors web's DeleteProductDialog: shows
// what's attached, recommends Deactivate (reversible, keeps history), and only
// for products.delete_permanent (with the org-wide view) offers a typed-name
// permanent delete. Unused products just get a simple delete. Re-keyed by the
// parent each time it opens so it starts fresh.
export function DeleteProductSheet({ open, product, onClose, onDone }: DeleteProductSheetProps) {
  const theme = useTheme()
  const m = useMotion()
  const can = useCan()
  const [mode, setMode] = useState<"choose" | "permanent">("choose")
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState<null | "deactivate" | "delete">(null)
  // A plain delete can still hit a 409 if stock arrived meanwhile — then the
  // server's own impact replaces what we loaded.
  const [conflict, setConflict] = useState<ImpactCounts | null>(null)

  // The Offline Edition has no impact query; it gets the deactivate-or-delete choice below.
  const q = useQuery(open && !LOCAL ? `delete-impact:${product.id}` : null, () => getDeleteImpact(product.id))
  const impact = conflict ?? q.data?.impact ?? null

  async function deactivate() {
    setBusy("deactivate")
    try {
      await setProductActive(product, false)
      toast.success(`${product.name} deactivated — hidden from POS and inventory`)
      onDone("deactivated")
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't deactivate the product. Please try again."))
    } finally {
      setBusy(null)
    }
  }

  async function remove(permanent: boolean) {
    setBusy("delete")
    try {
      await deleteProduct(product.id, permanent ? { confirmName: typed } : undefined)
      toast.success(permanent ? `${product.name} permanently deleted` : `${product.name} deleted`)
      onDone("deleted")
      onClose()
    } catch (err) {
      const fromServer = err instanceof ApiError && err.status === 409 ? impactFromConflict(err.body) : null
      if (fromServer) setConflict(fromServer)
      toast.error(errorMessage(err, "Couldn't delete the product. Please try again."))
    } finally {
      setBusy(null)
    }
  }

  const plan = impact
    ? removePlan({
        impact,
        isActive: product.is_active,
        canEdit: can("products.edit"),
        canDeletePermanent: can("products.delete_permanent"),
        serverAllowsPermanent: q.data?.canDeletePermanently ?? false,
      })
    : null

  const deactivateOption = (state: "available" | "already") => (
    <PressableScale
      onPress={deactivate}
      disabled={busy !== null || state === "already"}
      accessibilityRole="button"
      accessibilityLabel={state === "already" ? "Already deactivated" : "Deactivate, recommended"}
      accessibilityHint="Hidden from POS and inventory. All history is kept and you can reactivate it any time."
      accessibilityState={{ disabled: busy !== null || state === "already", busy: busy === "deactivate" }}
      style={[styles.option, { borderColor: theme.green, backgroundColor: theme.green50 }, state === "already" && styles.dim]}
    >
      <View style={styles.optionHead}>
        <Ionicons name={state === "already" ? "checkmark-circle-outline" : "eye-off-outline"} size={18} color={theme.green600} />
        <Text variant="bodyStrong" tone="success">
          {busy === "deactivate" ? "Deactivating…" : state === "already" ? "Already deactivated" : "Deactivate (recommended)"}
        </Text>
      </View>
      <Text variant="caption" tone="secondary">
        Hidden from POS and inventory. All history is kept and you can reactivate it any time.
      </Text>
    </PressableScale>
  )

  let body: ReactNode
  // Which state the body shows — each change cross-fades.
  const bodyKey = LOCAL
    ? "local"
    : q.error && !impact
      ? "error"
      : !impact || !plan
        ? "loading"
        : plan.kind === "clean"
          ? "clean"
          : mode
  if (LOCAL) {
    body = (
      <>
        {product.is_active && can("products.edit") ? deactivateOption("available") : null}
        <Text tone="secondary">Deleting removes the product and its pack sizes from this device. This can&apos;t be undone.</Text>
        <Button title="Delete" variant="danger" onPress={() => remove(false)} loading={busy === "delete"} disabled={busy !== null} />
      </>
    )
  } else if (q.error && !impact) {
    body = <ErrorState compact message={q.error} onRetry={q.retry} />
  } else if (!impact || !plan) {
    body = (
      <View style={styles.loading} accessibilityLabel="Checking product history" accessibilityRole="progressbar">
        <SkeletonBlock height={16} width="80%" />
        <SkeletonBlock height={56} />
        <SkeletonBlock height={56} />
      </View>
    )
  } else if (plan.kind === "clean") {
    body = (
      <>
        <Text tone="secondary">This product has never been stocked or sold, so it can be deleted cleanly. This can&apos;t be undone.</Text>
        <Button title="Delete" variant="danger" onPress={() => remove(false)} loading={busy === "delete"} disabled={busy !== null} />
      </>
    )
  } else if (mode === "choose") {
    body = (
      <>
        <Text tone="secondary">This product has history attached:</Text>
        <View style={[styles.box, { backgroundColor: theme.muted, borderColor: theme.border }]}>
          {historyLines(impact).map((l) => (
            <Text key={l}>• {l}</Text>
          ))}
        </View>
        {plan.deactivate !== "hidden" ? deactivateOption(plan.deactivate) : null}
        {plan.permanent ? (
          <PressableScale
            onPress={() => setMode("permanent")}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel="Delete permanently"
            accessibilityHint="Erases the product, its batches and stock adjustments. Can't be undone."
            style={[styles.option, { borderColor: theme.border }]}
          >
            <View style={styles.optionHead}>
              <Ionicons name="trash-outline" size={18} color={theme.red} />
              <Text variant="bodyStrong" tone="danger">
                Delete permanently…
              </Text>
            </View>
            <Text variant="caption" tone="secondary">
              Erases the product, its batches and stock adjustments. Can&apos;t be undone.
            </Text>
          </PressableScale>
        ) : null}
        {plan.deactivate === "hidden" && !plan.permanent ? (
          <Text variant="caption" tone="secondary">
            Ask an owner or manager to deactivate or permanently delete it.
          </Text>
        ) : null}
      </>
    )
  } else {
    const matches = nameMatches(typed, product.name)
    body = (
      <>
        <View style={[styles.box, { backgroundColor: theme.red50, borderColor: theme.red }]}>
          <Text variant="bodyStrong">This permanently erases:</Text>
          {erasedLines(impact).map((l) => (
            <Text key={l} variant="caption">
              • {l}
            </Text>
          ))}
          <Text variant="bodyStrong" style={styles.kept}>
            Kept:
          </Text>
          {keptLines(impact).map((l) => (
            <Text key={l} variant="caption">
              • {l}
            </Text>
          ))}
        </View>
        <TextField
          label={`Type ${product.name} to confirm`}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
          error={typed.trim() && !matches ? "That doesn't match the product name yet" : null}
          inSheet
        />
        <View style={styles.actions}>
          <Button title="Back" variant="secondary" onPress={() => setMode("choose")} disabled={busy !== null} style={styles.flex} />
          <Button title="Delete permanently" variant="danger" onPress={() => remove(true)} loading={busy === "delete"} disabled={busy !== null || !matches} style={styles.flex} />
        </View>
      </>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Remove “${product.name}”?`} snapPoints={["85%"]} scrollable>
      <Animated.View key={bodyKey} entering={m.fadeIn} exiting={m.fadeOut} style={styles.body}>
        {body}
      </Animated.View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  option: { borderWidth: 1.5, borderRadius: radius.lg, padding: space.md, gap: space.xxs },
  optionHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dim: { opacity: 0.6 },
  box: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.xxs },
  kept: { marginTop: space.sm },
  loading: { gap: space.md },
  body: { gap: space.md },
  actions: { flexDirection: "row", gap: space.md },
  flex: { flex: 1 },
})
