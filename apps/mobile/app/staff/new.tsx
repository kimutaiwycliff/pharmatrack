import Ionicons from "@expo/vector-icons/Ionicons"
import { useState } from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import { router } from "expo-router"
import { Button, Chip, EmptyState, FormScroll, NeedsInternet, Screen, ScreenHeader, Text, TextField, useIsOnline } from "../../src/components"
import { createStaff, markStaffChanged } from "../../src/features/staff/data"
import { ASSIGNABLE_ROLES, validateInvite, type AssignableRole, type InviteForm } from "../../src/features/staff/logic/staff"
import { hasErrors, type FieldErrors } from "../../src/features/settings/logic/forms"
import { useCan } from "../../src/hooks/useCan"
import { errorMessage } from "../../src/lib/api"
import { env } from "../../src/lib/env"
import { toast } from "../../src/lib/toast"
import { useSessionStore } from "../../src/store/session"
import { useTheme } from "../../src/theme/useTheme"
import { space } from "../../src/theme/tokens"

// Invite a staff member (online: POST /api/staff → they get a "set your
// password" email; the plan's staff limit is enforced server-side) or, in the
// Offline Edition, create a local account that signs in with phone + PIN.
// Same fields, roles and messages as the old inline form.

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE

export default function NewStaff() {
  const theme = useTheme()
  const can = useCan()
  const online = useIsOnline()
  const title = OFFLINE ? "Add staff member" : "Invite staff"
  let body
  if (!can("staff.manage")) {
    body = (
      <EmptyState
        icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
        message="Only owners and managers can add staff."
      />
    )
  } else if (!OFFLINE && !online) body = <NeedsInternet feature="Inviting staff" />
  else body = <NewStaffForm />
  return (
    <Screen>
      <ScreenHeader title={title} />
      {body}
    </Screen>
  )
}

function NewStaffForm() {
  const branches = useSessionStore((s) => s.branches)
  const [form, setForm] = useState<InviteForm>({ name: "", email: "", phone: "", pin: "" })
  const [role, setRole] = useState<AssignableRole>("cashier")
  const [branchId, setBranchId] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors<keyof InviteForm>>({})
  const [submitting, setSubmitting] = useState(false)

  function set(key: keyof InviteForm, value: string) {
    setForm((f) => ({ ...f, [key]: key === "pin" ? value.replace(/\D/g, "") : value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function onSubmit() {
    const errs = validateInvite(form, { offline: OFFLINE })
    setErrors(errs)
    if (hasErrors(errs)) return
    setSubmitting(true)
    try {
      await createStaff({ ...form, role, branchId })
      markStaffChanged()
      toast.success(OFFLINE ? `${form.name.trim()} can now sign in with their PIN` : `Invitation sent to ${form.email.trim()}`)
      router.back()
    } catch (err) {
      const msg = errorMessage(err)
      if (!OFFLINE && /email|exist/i.test(msg)) setErrors({ email: msg })
      else toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormScroll
      footer={
        <Button title={OFFLINE ? "Create staff" : "Send invite"} onPress={onSubmit} loading={submitting} style={styles.footer} />
      }
    >
      <Text tone="secondary">
        {OFFLINE
          ? "They'll sign in on this device with their phone number and PIN."
          : "We'll email them a link to set their password. They can also sign in at the till with a PIN once one is set."}
      </Text>
      <TextField
        label="Full name"
        value={form.name}
        onChangeText={(v) => set("name", v)}
        error={errors.name}
        autoCapitalize="words"
      />
      {OFFLINE ? null : (
        <TextField
          label="Email address"
          value={form.email}
          onChangeText={(v) => set("email", v)}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
      )}
      <TextField
        label={OFFLINE ? "Phone number" : "Phone number (optional)"}
        value={form.phone}
        onChangeText={(v) => set("phone", v)}
        error={errors.phone}
        helper={OFFLINE ? "Used to sign in" : "Needed later for PIN sign-in"}
        placeholder="07XX XXX XXX"
        keyboardType="phone-pad"
      />
      {OFFLINE ? (
        <TextField
          label="PIN"
          value={form.pin}
          onChangeText={(v) => set("pin", v)}
          error={errors.pin}
          helper="4 to 8 digits"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
        />
      ) : null}

      <View style={styles.group}>
        <Text variant="label" tone="secondary">
          Role
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          {ASSIGNABLE_ROLES.map((r) => (
            <Chip key={r.key} label={r.label} selected={role === r.key} onPress={() => setRole(r.key)} accessibilityLabel={`Role ${r.label}`} />
          ))}
        </ScrollView>
      </View>

      <View style={styles.group}>
        <Text variant="label" tone="secondary">
          Branch
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          <Chip label="Unassigned" selected={branchId === null} onPress={() => setBranchId(null)} accessibilityLabel="No branch" />
          {branches.map((b) => (
            <Chip key={b.id} label={b.name} selected={branchId === b.id} onPress={() => setBranchId(b.id)} accessibilityLabel={`Branch ${b.name}`} />
          ))}
        </ScrollView>
      </View>
    </FormScroll>
  )
}

const styles = StyleSheet.create({
  group: { gap: space.xs },
  chips: { gap: space.sm },
  footer: { marginTop: space.sm },
})
