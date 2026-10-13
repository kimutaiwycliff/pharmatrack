import Ionicons from "@expo/vector-icons/Ionicons"
import { useState, type ReactNode } from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import { normalizeKePhone } from "@pharmatrack/core"
import { Button, Chip, StatusBadge, Text, TextField } from "../../../components"
import { errorMessage } from "../../../lib/api"
import { formatDay } from "../../../lib/dates"
import { env } from "../../../lib/env"
import { toast } from "../../../lib/toast"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { phoneError } from "../../settings/logic/forms"
import { patchStaff, removeStaff, resendInvite, setStaffPin, type StaffPatch } from "../data"
import { ASSIGNABLE_ROLES, branchLabel, roleLabel, staffBadge, staffPinError, type StaffMember } from "../logic/staff"
import { confirm as askConfirm } from "../../../lib/confirm"

// One staff member: role, branch, phone, active/inactive, set PIN, resend
// invite, remove — the same actions (and the same PATCH/DELETE calls) as the
// old manage modal. Rendered inside a Sheet on phones (`inSheet`, so inputs
// lift with the keyboard) and in the right pane on tablets. Single-field
// PATCHes then a list refetch: the PATCH response omits banned/ban_reason.

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE

interface StaffDetailProps {
  member: StaffMember
  branches: { id: string; name: string }[]
  inSheet?: boolean
  /** After any successful write — refetch the list. */
  onChanged: () => void
  /** After removal — close the detail. */
  onRemoved: () => void
}

export function StaffDetail({ member, branches, inSheet, onChanged, onRemoved }: StaffDetailProps) {
  const theme = useTheme()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pin, setPin] = useState("")
  const [pinErr, setPinErr] = useState<string | null>(null)
  const [phone, setPhone] = useState(member.phone ?? "")
  const [phoneErr, setPhoneErr] = useState<string | null>(null)
  const busy = pending !== null
  const badge = staffBadge(member)
  const isOwner = member.role === "owner"

  async function run(label: string, fn: () => Promise<void>) {
    setPending(label)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that change. Please try again."))
    } finally {
      setPending(null)
    }
  }

  function patch(label: string, body: StaffPatch, done?: string) {
    return run(label, async () => {
      await patchStaff(member.id, body)
      if (done) toast.success(done)
      onChanged()
    })
  }

  function onSetPin() {
    const err = staffPinError(pin, { offline: OFFLINE })
    setPinErr(err)
    if (err) return
    setPending("pin")
    return setStaffPin(member.id, pin)
      .then(() => {
        setPin("")
        toast.success("PIN updated")
      })
      .catch((e: unknown) => setPinErr(errorMessage(e, "Couldn't set the PIN. Please try again.")))
      .finally(() => setPending(null))
  }

  function onSavePhone() {
    const err = phoneError(phone, { required: true })
    setPhoneErr(err)
    if (err) return
    return patch("phone", { phone: normalizeKePhone(phone) }, "Phone number saved")
  }

  function onResend() {
    return run("resend", async () => {
      const email = await resendInvite(member.id)
      toast.success(email ? `Invite resent to ${email}` : "Invite resent")
    })
  }

  async function onRemove() {
    const ok = await askConfirm({
      title: "Remove staff member",
      message: `Remove ${member.full_name} from this organization? This can't be undone.`,
      confirmLabel: "Remove",
      destructive: true,
    })
    if (!ok) return
    await run("remove", async () => {
      const note = await removeStaff(member.id)
      toast.success(note ?? "Staff member removed")
      onRemoved()
      onChanged()
    })
  }

  const phoneDirty = normalizeKePhone(phone) !== (member.phone ?? "")

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="headline" numberOfLines={2}>
            {member.full_name}
          </Text>
          <Text variant="caption" tone="secondary">
            {roleLabel(member.role)} · {branchLabel(member)} · joined {formatDay(member.created_at)}
          </Text>
        </View>
        <StatusBadge status={badge.tone} label={badge.label} />
      </View>

      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Section title="Role">
        {isOwner ? (
          <Text tone="secondary">Owner — role can&apos;t be changed here</Text>
        ) : (
          <ChipRow>
            {ASSIGNABLE_ROLES.map((r) => (
              <Chip
                key={r.key}
                label={r.label}
                selected={member.role === r.key}
                disabled={busy}
                accessibilityLabel={`Role ${r.label}`}
                onPress={() => member.role !== r.key && patch("role", { role: r.key }, `Role changed to ${r.label}`)}
              />
            ))}
          </ChipRow>
        )}
      </Section>

      <Section title="Branch">
        <ChipRow>
          <Chip
            label="Unassigned"
            selected={member.branch_id === null}
            disabled={busy}
            accessibilityLabel="No branch"
            onPress={() => member.branch_id !== null && patch("branch", { branch_id: null }, "Branch updated")}
          />
          {branches.map((b) => (
            <Chip
              key={b.id}
              label={b.name}
              selected={member.branch_id === b.id}
              disabled={busy}
              accessibilityLabel={`Branch ${b.name}`}
              onPress={() => member.branch_id !== b.id && patch("branch", { branch_id: b.id }, "Branch updated")}
            />
          ))}
        </ChipRow>
      </Section>

      {OFFLINE ? (
        member.phone ? (
          <Section title="Phone">
            <Text>{member.phone}</Text>
          </Section>
        ) : null
      ) : (
        <TextField
          label="Phone number"
          value={phone}
          onChangeText={(v) => {
            setPhone(v)
            if (phoneErr) setPhoneErr(null)
          }}
          error={phoneErr}
          helper="Used for PIN sign-in at the till"
          keyboardType="phone-pad"
          inSheet={inSheet}
          trailing={
            phoneDirty ? <Button title="Save" size="sm" variant="ghost" onPress={onSavePhone} loading={pending === "phone"} /> : null
          }
        />
      )}

      <TextField
        label="Set login PIN"
        value={pin}
        onChangeText={(v) => {
          setPin(v.replace(/\D/g, ""))
          if (pinErr) setPinErr(null)
        }}
        error={pinErr}
        helper="4 digits — they sign in at the till with their phone number and this PIN"
        keyboardType="number-pad"
        maxLength={4}
        secureTextEntry
        inSheet={inSheet}
        trailing={<Button title="Set PIN" size="sm" variant="ghost" onPress={onSetPin} loading={pending === "pin"} disabled={busy && pending !== "pin"} />}
      />

      <Button
        title={member.is_active ? "Deactivate" : "Activate"}
        variant={member.is_active ? "secondary" : "primary"}
        onPress={() => patch("active", { is_active: !member.is_active }, member.is_active ? "Staff member deactivated" : "Staff member activated")}
        loading={pending === "active"}
        disabled={busy && pending !== "active"}
        leadingIcon={
          <Ionicons
            name={member.is_active ? "person-remove-outline" : "person-add-outline"}
            size={18}
            color={member.is_active ? theme.text : theme.onAccent}
          />
        }
      />
      <View style={styles.actions}>
        {OFFLINE ? null : (
          <Button
            title="Resend invite"
            variant="secondary"
            onPress={onResend}
            loading={pending === "resend"}
            disabled={busy && pending !== "resend"}
            style={styles.flex}
          />
        )}
        <Button title="Remove" variant="danger" onPress={onRemove} loading={pending === "remove"} disabled={busy && pending !== "remove"} style={styles.flex} />
      </View>
    </View>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label" tone="secondary">
        {title}
      </Text>
      {children}
    </View>
  )
}

function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.lg, paddingBottom: space.lg },
  header: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  flex: { flex: 1 },
  section: { gap: space.xs },
  chips: { gap: space.sm },
  actions: { flexDirection: "row", gap: space.sm },
})
