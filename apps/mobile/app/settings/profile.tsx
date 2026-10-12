import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { router } from "expo-router"
import { normalizeKePhone } from "@pharmatrack/core"
import { Button, FormScroll, Text, TextField } from "../../src/components"
import { SettingsLoader } from "../../src/features/settings/components/SettingsLoader"
import { saveProfile, type SettingsData } from "../../src/features/settings/data"
import { hasErrors, validateProfileForm, type FieldErrors, type ProfileForm } from "../../src/features/settings/logic/forms"
import { roleLabel } from "../../src/features/staff/logic/staff"
import { errorMessage } from "../../src/lib/api"
import { env } from "../../src/lib/env"
import { toast } from "../../src/lib/toast"
import { useStaffStore } from "../../src/store/staff"
import { space } from "../../src/theme/tokens"

// My profile — name + phone. Mirrors web's ProfileSettingsForm and saves via
// PATCH /api/settings?target=profile (Offline Edition: repo/settings.ts
// updateLocalProfile). The phone is sent normalised to E.164: the server
// normalises too, and the Offline Edition's PIN sign-in matches the stored
// phone exactly, so a raw "0712…" saved locally would break sign-in.
// (Web's "Home branch" picker isn't here yet — the branch chip covers daily use.)

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE

export default function ProfileSettings() {
  return (
    <SettingsLoader title="My profile" feature="Your profile">
      {(data, update) => <ProfileFormView data={data} onSaved={update} />}
    </SettingsLoader>
  )
}

function ProfileFormView({ data, onSaved }: { data: SettingsData; onSaved: (patch: Partial<SettingsData>) => void }) {
  const [form, setForm] = useState<ProfileForm>(() => ({ fullName: data.profile.full_name, phone: data.profile.phone ?? "" }))
  const [errors, setErrors] = useState<FieldErrors<keyof ProfileForm>>({})
  const [saving, setSaving] = useState(false)

  function set<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function onSave() {
    const errs = validateProfileForm(form, { phoneRequired: OFFLINE })
    setErrors(errs)
    if (hasErrors(errs)) return
    const full_name = form.fullName.trim()
    const phone = form.phone.trim() ? normalizeKePhone(form.phone) : ""
    setSaving(true)
    try {
      await saveProfile(data, { full_name, phone })
      onSaved({ profile: { ...data.profile, full_name, phone: phone || null } })
      // Keep the till's "who is selling" name in step when it's the same person.
      const current = useStaffStore.getState().current
      if (current && data.profile.id && current.id === data.profile.id) {
        useStaffStore.getState().setCurrent({ ...current, name: full_name })
      }
      toast.success("Profile updated")
      router.back()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormScroll footer={<Button title="Save profile" onPress={onSave} loading={saving} style={styles.footer} />}>
      <TextField
        label="Full name"
        value={form.fullName}
        onChangeText={(v) => set("fullName", v)}
        error={errors.fullName}
        autoCapitalize="words"
        autoComplete="name"
        returnKeyType="next"
      />
      <TextField
        label="Phone number"
        value={form.phone}
        onChangeText={(v) => set("phone", v)}
        error={errors.phone}
        helper={OFFLINE ? "You sign in with this number and your PIN" : "Needed for PIN sign-in at the till"}
        placeholder="07XX XXX XXX"
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <View style={styles.role}>
        <Text variant="label" tone="secondary">
          Role
        </Text>
        <Text variant="bodyStrong">{roleLabel(data.profile.role)}</Text>
        <Text variant="caption" tone="tertiary">
          Your role is managed by the pharmacy owner
        </Text>
      </View>
    </FormScroll>
  )
}

const styles = StyleSheet.create({
  role: { gap: space.xxs },
  footer: { marginTop: space.sm },
})
