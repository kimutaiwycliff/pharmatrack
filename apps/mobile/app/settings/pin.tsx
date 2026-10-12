import Ionicons from "@expo/vector-icons/Ionicons"
import { useState } from "react"
import { StyleSheet } from "react-native"
import { router } from "expo-router"
import { Button, EmptyState, FormScroll, Text, TextField } from "../../src/components"
import { SettingsLoader } from "../../src/features/settings/components/SettingsLoader"
import { savePin, type SettingsData } from "../../src/features/settings/data"
import { hasErrors, validatePinForm, type FieldErrors, type PinForm } from "../../src/features/settings/logic/forms"
import { errorMessage } from "../../src/lib/api"
import { env } from "../../src/lib/env"
import { toast } from "../../src/lib/toast"
import { useTheme } from "../../src/theme/useTheme"
import { space } from "../../src/theme/tokens"

// Set / change your own till PIN. Mirrors web's "Quick PIN Login" card:
// PATCH /api/settings?target=pin with the account password as confirmation
// (the server re-checks it and refuses trivial PINs), and only once a phone
// number is on file, since PIN sign-in matches by phone. The Offline Edition
// has no account password — it stores the PIN locally (repo/settings.ts).

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE

export default function PinSettings() {
  return (
    <SettingsLoader title="Till PIN" feature="Your PIN">
      {(data, update) => <PinFormView data={data} onSaved={() => update({ has_pin: true })} />}
    </SettingsLoader>
  )
}

function PinFormView({ data, onSaved }: { data: SettingsData; onSaved: () => void }) {
  const theme = useTheme()
  const [form, setForm] = useState<PinForm>({ pin: "", confirm: "", password: "" })
  const [errors, setErrors] = useState<FieldErrors<keyof PinForm>>({})
  const [saving, setSaving] = useState(false)

  if (!OFFLINE && !data.profile.phone) {
    return (
      <EmptyState
        icon={<Ionicons name="call-outline" size={32} color={theme.textTertiary} />}
        title="Add your phone number first"
        message="PIN sign-in finds you by your phone number. Add it to your profile, then come back to set a PIN."
        action={{ label: "Edit my profile", onPress: () => router.replace("/settings/profile") }}
      />
    )
  }

  function set<K extends keyof PinForm>(key: K, value: string) {
    const v = key === "password" ? value : value.replace(/\D/g, "")
    setForm((f) => ({ ...f, [key]: v }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function onSave() {
    const errs = validatePinForm(form, { offline: OFFLINE })
    setErrors(errs)
    if (hasErrors(errs)) return
    setSaving(true)
    try {
      await savePin(data, form.pin, form.password)
      onSaved()
      toast.success(data.has_pin ? "PIN updated" : "PIN set — you can now sign in with it")
      router.back()
    } catch (err) {
      const msg = errorMessage(err)
      // The server's wrong-password answer belongs under the password field.
      if (/password/i.test(msg)) setErrors({ password: msg })
      else toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const maxLength = OFFLINE ? 8 : 4
  return (
    <FormScroll
      footer={<Button title={data.has_pin ? "Update PIN" : "Set PIN"} onPress={onSave} loading={saving} style={styles.footer} />}
    >
      <Text tone="secondary">
        {data.has_pin ? "Change the PIN you use" : "Set a PIN to sign in"} at the till with your phone number
        {data.profile.phone ? ` (${data.profile.phone})` : ""}.
      </Text>
      <TextField
        label={data.has_pin ? "New PIN" : "PIN"}
        value={form.pin}
        onChangeText={(v) => set("pin", v)}
        error={errors.pin}
        helper={OFFLINE ? "4 to 8 digits" : "4 digits — avoid 1234 or 0000"}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={maxLength}
        autoComplete="off"
      />
      <TextField
        label="Confirm PIN"
        value={form.confirm}
        onChangeText={(v) => set("confirm", v)}
        error={errors.confirm}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={maxLength}
        autoComplete="off"
      />
      {OFFLINE ? null : (
        <TextField
          label="Account password"
          value={form.password}
          onChangeText={(v) => set("password", v)}
          error={errors.password}
          helper="Confirms it's really you"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
        />
      )}
    </FormScroll>
  )
}

const styles = StyleSheet.create({
  footer: { marginTop: space.sm },
})
