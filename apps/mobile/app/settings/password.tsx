import { useState } from "react"
import { StyleSheet } from "react-native"
import { router } from "expo-router"
import { Button, FormScroll, IconButton, NeedsInternet, Screen, ScreenHeader, Text, TextField, useIsOnline } from "../../src/components"
import { hasErrors, validatePasswordForm, type FieldErrors, type PasswordForm } from "../../src/features/settings/logic/forms"
import { authClient } from "../../src/lib/auth-client"
import { errorMessage } from "../../src/lib/api"
import { toast } from "../../src/lib/toast"
import { space } from "../../src/theme/tokens"

// Change the account password (online only — Better Auth's changePassword,
// signing out other sessions, as before). Messages match web's
// ProfileSettingsForm. The Offline Edition has no password, so NeedsInternet
// explains that if this screen is ever reached there.

export default function PasswordSettings() {
  const online = useIsOnline()
  return (
    <Screen>
      <ScreenHeader title="Change password" />
      {online ? <PasswordFormView /> : <NeedsInternet feature="Changing your password" />}
    </Screen>
  )
}

function PasswordFormView() {
  const [form, setForm] = useState<PasswordForm>({ current: "", next: "", confirm: "" })
  const [errors, setErrors] = useState<FieldErrors<keyof PasswordForm>>({})
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  function set(key: keyof PasswordForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function onSave() {
    const errs = validatePasswordForm(form)
    setErrors(errs)
    if (hasErrors(errs)) return
    setSaving(true)
    try {
      const { error } = await authClient.changePassword({ currentPassword: form.current, newPassword: form.next, revokeOtherSessions: true })
      if (error) throw new Error(error.message)
      toast.success("Password changed successfully")
      router.back()
    } catch (err) {
      const msg = errorMessage(err)
      if (/current|invalid password|incorrect/i.test(msg)) setErrors({ current: msg })
      else toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const eye = (
    <IconButton
      icon={show ? "eye-off-outline" : "eye-outline"}
      accessibilityLabel={show ? "Hide passwords" : "Show passwords"}
      onPress={() => setShow((s) => !s)}
    />
  )

  return (
    <FormScroll footer={<Button title="Update password" onPress={onSave} loading={saving} style={styles.footer} />}>
      <Text tone="secondary">You&apos;ll stay signed in here; other phones and browsers are signed out.</Text>
      <TextField
        label="Current password"
        value={form.current}
        onChangeText={(v) => set("current", v)}
        error={errors.current}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoComplete="current-password"
        trailing={eye}
      />
      <TextField
        label="New password"
        value={form.next}
        onChangeText={(v) => set("next", v)}
        error={errors.next}
        helper="At least 8 characters"
        secureTextEntry={!show}
        autoCapitalize="none"
        autoComplete="new-password"
      />
      <TextField
        label="Confirm new password"
        value={form.confirm}
        onChangeText={(v) => set("confirm", v)}
        error={errors.confirm}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoComplete="new-password"
      />
    </FormScroll>
  )
}

const styles = StyleSheet.create({
  footer: { marginTop: space.sm },
})
