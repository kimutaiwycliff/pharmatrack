import Ionicons from "@expo/vector-icons/Ionicons"
import { StyleSheet, View } from "react-native"
import { Button, ListRow, Sheet, StatusBadge, Text } from "../../../components"
import { formatDay } from "../../../lib/dates"
import { useTheme } from "../../../theme/useTheme"
import { radius, space } from "../../../theme/tokens"
import { rxStatusBadge } from "../logic/prescriptions"
import type { Prescription } from "../types"
import { confirm as askConfirm } from "../../../lib/confirm"

// List row + detail sheet for Prescriptions — web's row in
// app/(dashboard)/prescriptions/page.tsx (patient, status, allergy flag, drugs,
// prescriber · date, Complete / Cancel while active), with the full item
// details (dose, frequency, duration, qty) in the sheet.

const drugs = (rx: Prescription) => rx.items.map((i) => i.drug_name).filter(Boolean).join(", ") || "—"

export function PrescriptionRow({ rx, onPress }: { rx: Prescription; onPress: () => void }) {
  const theme = useTheme()
  const badge = rxStatusBadge(rx.status)
  const patient = rx.customer?.full_name ?? "Unknown patient"
  const when = formatDay(rx.created_at)
  return (
    <ListRow
      title={patient}
      subtitle={drugs(rx)}
      onPress={onPress}
      accessibilityLabel={`${patient}, ${badge.label}, ${drugs(rx)}, ${when}`}
      accessibilityHint="Shows the prescription"
      meta={
        <View style={styles.meta}>
          <StatusBadge status={badge.status} label={badge.label} />
          <Text variant="caption" tone="tertiary" numberOfLines={1} style={styles.flex}>
            {rx.prescriber_name ? `${rx.prescriber_name} · ` : ""}
            {when}
          </Text>
          {rx.customer?.allergies ? (
            <View style={styles.allergy}>
              <Ionicons name="warning-outline" size={14} color={theme.red} />
              <Text variant="caption" tone="danger" numberOfLines={1}>
                {rx.customer.allergies}
              </Text>
            </View>
          ) : null}
        </View>
      }
      trailing={<Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />}
    />
  )
}

interface PrescriptionSheetProps {
  rx: Prescription | null
  canManage: boolean
  busy: "completed" | "cancelled" | null
  onClose: () => void
  onStatus: (rx: Prescription, status: "completed" | "cancelled") => void
}

export function PrescriptionSheet({ rx, canManage, busy, onClose, onStatus }: PrescriptionSheetProps) {
  const theme = useTheme()
  const badge = rx ? rxStatusBadge(rx.status) : null

  function cancel() {
    if (!rx) return
    void askConfirm({
      title: "Cancel this prescription?",
      message: "It moves out of the active list.",
      cancelLabel: "Keep it",
      confirmLabel: "Cancel prescription",
      destructive: true,
    }).then((ok) => {
      if (ok) onStatus(rx, "cancelled")
    })
  }

  const footer =
    rx && badge && canManage && rx.status === "active" ? (
      <View style={styles.actions}>
        <Button title="Cancel" variant="danger" onPress={cancel} loading={busy === "cancelled"} disabled={!!busy} style={styles.flex} />
        <Button
          title="Mark completed"
          onPress={() => onStatus(rx, "completed")}
          loading={busy === "completed"}
          disabled={!!busy}
          style={styles.flex}
        />
      </View>
    ) : undefined

  return (
    <Sheet open={!!rx} onClose={onClose} title={rx?.customer?.full_name ?? "Prescription"} snapPoints={["75%"]} scrollable footer={footer}>
      {rx && badge ? (
        <View style={styles.body}>
          <View style={styles.line}>
            <StatusBadge status={badge.status} label={badge.label} />
            <Text tone="secondary" style={styles.flex}>
              {formatDay(rx.created_at)}
              {rx.customer?.phone ? ` · ${rx.customer.phone}` : ""}
            </Text>
          </View>
          {rx.customer?.allergies ? (
            <View style={[styles.allergyBox, { backgroundColor: theme.red50, borderColor: theme.red }]}>
              <Ionicons name="warning-outline" size={18} color={theme.red} />
              <Text tone="danger" style={styles.flex}>
                Allergies: {rx.customer.allergies}
              </Text>
            </View>
          ) : null}
          {rx.prescriber_name || rx.prescriber_reg_no ? (
            <Detail label="Prescriber" value={[rx.prescriber_name, rx.prescriber_reg_no ? `Reg. ${rx.prescriber_reg_no}` : null].filter(Boolean).join(" · ")} />
          ) : null}
          {rx.diagnosis ? <Detail label="Diagnosis" value={rx.diagnosis} /> : null}
          <Text variant="label" tone="secondary" accessibilityRole="header">
            Medications
          </Text>
          {rx.items.map((it, i) => {
            const how = [it.dose, it.frequency, it.duration, it.quantity ? `Qty ${it.quantity}` : null].filter(Boolean).join(" · ")
            return (
              <View key={it.id ?? i} style={[styles.item, { borderColor: theme.border }]} accessible>
                <Text variant="bodyStrong">{it.drug_name ?? "—"}</Text>
                {how ? <Text tone="secondary">{how}</Text> : null}
                {it.instructions ? (
                  <Text variant="caption" tone="tertiary">
                    {it.instructions}
                  </Text>
                ) : null}
              </View>
            )
          })}
          {rx.notes ? <Detail label="Notes" value={rx.notes} /> : null}
        </View>
      ) : null}
    </Sheet>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail} accessible>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <Text>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm, marginTop: space.xxs },
  allergy: { flexDirection: "row", alignItems: "center", gap: space.xxs, maxWidth: "100%" },
  body: { gap: space.md },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  allergyBox: { flexDirection: "row", alignItems: "center", gap: space.sm, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  detail: { gap: space.xxs },
  item: { gap: space.xxs, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  actions: { flexDirection: "row", gap: space.sm },
})
