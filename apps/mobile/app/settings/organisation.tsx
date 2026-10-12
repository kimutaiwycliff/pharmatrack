import Ionicons from "@expo/vector-icons/Ionicons"
import { useState } from "react"
import { StyleSheet } from "react-native"
import { router } from "expo-router"
import { Button, EmptyState, FormScroll, ListRow, Screen, ScreenHeader, TextField } from "../../src/components"
import { SettingsLoader } from "../../src/features/settings/components/SettingsLoader"
import { SettingsSection } from "../../src/features/settings/components/SettingsSection"
import { saveOrg, type SettingsBranch, type SettingsData } from "../../src/features/settings/data"
import { hasErrors, orgPayload, validateOrgForm, type FieldErrors, type OrgForm } from "../../src/features/settings/logic/forms"
import { useCan } from "../../src/hooks/useCan"
import { errorMessage } from "../../src/lib/api"
import { env } from "../../src/lib/env"
import { toast } from "../../src/lib/toast"
import { useSessionStore } from "../../src/store/session"
import { useTheme } from "../../src/theme/useTheme"
import { space } from "../../src/theme/tokens"

// Organisation details (capability settings.organization — owner by default).
// Mirrors web's OrgSettingsForm: PATCH /api/settings?target=org, blank
// optional fields sent as undefined. In the Offline Edition there's no org
// table, so this edits the current branch row (repo/settings.ts). Branches are
// listed read-only from the same GET (web's Branches tab adds/edits them).

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE

export default function OrganisationSettings() {
  const theme = useTheme()
  const can = useCan()
  if (!can("settings.organization")) {
    return (
      <Screen>
        <ScreenHeader title="Organisation" />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
          message="Only the pharmacy owner can change organisation settings."
        />
      </Screen>
    )
  }
  return (
    <SettingsLoader title={OFFLINE ? "Pharmacy details" : "Organisation"} feature="Organisation settings">
      {(data, update) => <OrgFormView data={data} onSaved={update} />}
    </SettingsLoader>
  )
}

function OrgFormView({ data, onSaved }: { data: SettingsData; onSaved: (patch: Partial<SettingsData>) => void }) {
  const theme = useTheme()
  const sessionBranches = useSessionStore((s) => s.branches)
  const [form, setForm] = useState<OrgForm>(() => ({
    name: data.org?.name ?? "",
    registrationNumber: data.org?.registration_number ?? "",
    phone: data.org?.phone ?? "",
    email: data.org?.email ?? "",
    address: data.org?.address ?? "",
  }))
  const [errors, setErrors] = useState<FieldErrors<keyof OrgForm>>({})
  const [saving, setSaving] = useState(false)

  if (!data.org) {
    return (
      <EmptyState
        icon={<Ionicons name="business-outline" size={28} color={theme.textTertiary} />}
        message="No organisation found for this account."
      />
    )
  }

  function set(key: keyof OrgForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function onSave() {
    const errs = validateOrgForm(form)
    setErrors(errs)
    if (hasErrors(errs)) return
    const body = orgPayload(form)
    setSaving(true)
    try {
      await saveOrg(data, body)
      onSaved({ org: { ...data.org, ...body } })
      toast.success("Organization updated")
      router.back()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const branches: SettingsBranch[] = data.branches ?? sessionBranches

  return (
    <FormScroll footer={<Button title="Save" onPress={onSave} loading={saving} style={styles.footer} />}>
      <TextField
        label={OFFLINE ? "Pharmacy name" : "Organisation name"}
        value={form.name}
        onChangeText={(v) => set("name", v)}
        error={errors.name}
        autoCapitalize="words"
      />
      <TextField
        label="Registration number"
        value={form.registrationNumber}
        onChangeText={(v) => set("registrationNumber", v)}
        helper="Pharmacy / business registration number — printed on receipts"
        placeholder="e.g. CPK/P/123"
        autoCapitalize="characters"
      />
      <TextField
        label="Phone"
        value={form.phone}
        onChangeText={(v) => set("phone", v)}
        placeholder="+254 7XX XXX XXX"
        keyboardType="phone-pad"
      />
      <TextField
        label="Email"
        value={form.email}
        onChangeText={(v) => set("email", v)}
        error={errors.email}
        placeholder="info@pharmacy.co.ke"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <TextField
        label="Address"
        value={form.address}
        onChangeText={(v) => set("address", v)}
        multiline
      />

      {!OFFLINE && branches.length > 0 ? (
        <SettingsSection title={`Branches (${branches.length})`} footer="Add or rename branches from Settings on the web.">
          {branches.map((b) => (
            <ListRow
              key={b.id}
              title={b.name}
              subtitle={[b.address, b.phone].filter(Boolean).join(" · ") || null}
              leading={<Ionicons name="storefront-outline" size={20} color={theme.textSecondary} />}
            />
          ))}
        </SettingsSection>
      ) : null}
    </FormScroll>
  )
}

const styles = StyleSheet.create({
  footer: { marginTop: space.sm },
})
