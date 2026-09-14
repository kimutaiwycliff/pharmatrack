import { useEffect, useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { apiFetch } from "../src/lib/api-fetch"
import { authClient } from "../src/lib/auth-client"
import { toast } from "../src/lib/toast"
import { useSessionStore } from "../src/store/session"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Card, Screen, ScreenHeader } from "../src/components"

// Mirrors apps/web/app/api/settings/route.ts (GET returns profile+org+branches
// in one call; PATCH ?target=profile|org|pin updates each) — same single
// endpoint web's Settings page uses. Scope for this pass: My Profile
// (name/phone/password/PIN) + Organization (owner-only). Branches, Services,
// and Appearance (manual theme override) are NOT built yet — deliberately
// deferred, not an oversight; web's equivalents still cover those.

interface OrgSettingsData {
  profile: { full_name: string; phone: string | null; role: string }
  has_pin: boolean
  org: { name: string; registration_number?: string; phone?: string; email?: string; address?: string } | null
}

export default function Settings() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { role } = useSessionStore()
  const isOwner = role === "owner"

  const [data, setData] = useState<OrgSettingsData | null>(null)
  const [loading, setLoading] = useState(true)

  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [profileSaving, setProfileSaving] = useState(false)

  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [pwSaving, setPwSaving] = useState(false)

  const [pin, setPin] = useState("")
  const [pinPassword, setPinPassword] = useState("")
  const [pinSaving, setPinSaving] = useState(false)

  const [orgName, setOrgName] = useState("")
  const [orgReg, setOrgReg] = useState("")
  const [orgPhone, setOrgPhone] = useState("")
  const [orgEmail, setOrgEmail] = useState("")
  const [orgAddress, setOrgAddress] = useState("")
  const [orgSaving, setOrgSaving] = useState(false)

  useEffect(() => {
    apiFetch("/api/settings")
      .then((r) => (r.ok ? (r.json() as Promise<OrgSettingsData>) : Promise.reject(new Error("Failed to load"))))
      .then((d) => {
        setData(d)
        setFullName(d.profile.full_name)
        setPhone(d.profile.phone ?? "")
        if (d.org) {
          setOrgName(d.org.name)
          setOrgReg(d.org.registration_number ?? "")
          setOrgPhone(d.org.phone ?? "")
          setOrgEmail(d.org.email ?? "")
          setOrgAddress(d.org.address ?? "")
        }
      })
      .catch(() => toast.error("Could not load settings"))
      .finally(() => setLoading(false))
  }, [])

  async function saveProfile() {
    setProfileSaving(true)
    try {
      const res = await apiFetch("/api/settings?target=profile", {
        method: "PATCH",
        body: JSON.stringify({ full_name: fullName, phone }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Could not save")
      toast.success("Profile updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setProfileSaving(false)
    }
  }

  async function changePassword() {
    if (!newPw || newPw.length < 8) { toast.error("New password must be at least 8 characters"); return }
    if (newPw !== confirmPw) { toast.error("Passwords do not match"); return }
    if (!currentPw) { toast.error("Enter your current password"); return }
    setPwSaving(true)
    try {
      const { error } = await authClient.changePassword({ currentPassword: currentPw, newPassword: newPw, revokeOtherSessions: true })
      if (error) throw new Error(error.message)
      toast.success("Password changed successfully")
      setCurrentPw(""); setNewPw(""); setConfirmPw("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setPwSaving(false)
    }
  }

  async function savePin() {
    if (!pinPassword) { toast.error("Enter your account password to confirm"); return }
    setPinSaving(true)
    try {
      const res = await apiFetch("/api/settings?target=pin", {
        method: "PATCH",
        body: JSON.stringify({ password: pinPassword, pin }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Could not save PIN")
      toast.success("PIN updated")
      setPin(""); setPinPassword("")
      setData((d) => (d ? { ...d, has_pin: true } : d))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setPinSaving(false)
    }
  }

  async function saveOrg() {
    setOrgSaving(true)
    try {
      const res = await apiFetch("/api/settings?target=org", {
        method: "PATCH",
        body: JSON.stringify({ name: orgName, registration_number: orgReg, phone: orgPhone, email: orgEmail, address: orgAddress }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Could not save")
      toast.success("Organization updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setOrgSaving(false)
    }
  }

  if (loading || !data) {
    return (
      <Screen>
        <ScreenHeader title="Settings" />
        <View style={styles.centered}><ActivityIndicator color={theme.green} /></View>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScreenHeader title="Settings" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>My profile</Text>
          <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={theme.textTertiary} value={fullName} onChangeText={setFullName} />
          <TextInput style={styles.input} placeholder="Phone number" placeholderTextColor={theme.textTertiary} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <Button title="Save profile" onPress={saveProfile} loading={profileSaving} variant="secondary" />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Change password</Text>
          <TextInput style={styles.input} placeholder="Current password" placeholderTextColor={theme.textTertiary} secureTextEntry value={currentPw} onChangeText={setCurrentPw} />
          <TextInput style={styles.input} placeholder="New password (min 8 characters)" placeholderTextColor={theme.textTertiary} secureTextEntry value={newPw} onChangeText={setNewPw} />
          <TextInput style={styles.input} placeholder="Confirm new password" placeholderTextColor={theme.textTertiary} secureTextEntry value={confirmPw} onChangeText={setConfirmPw} />
          <Button title="Change password" onPress={changePassword} loading={pwSaving} variant="secondary" />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{data.has_pin ? "Update till PIN" : "Set a till PIN"}</Text>
          <Text style={styles.hint}>Used for quick sign-in at the till on this device.</Text>
          <TextInput style={styles.input} placeholder="New 4-digit PIN" placeholderTextColor={theme.textTertiary} keyboardType="number-pad" maxLength={4} secureTextEntry value={pin} onChangeText={setPin} />
          <TextInput style={styles.input} placeholder="Account password (to confirm)" placeholderTextColor={theme.textTertiary} secureTextEntry value={pinPassword} onChangeText={setPinPassword} />
          <Button title={data.has_pin ? "Update PIN" : "Set PIN"} onPress={savePin} loading={pinSaving} variant="secondary" />
        </Card>

        {isOwner && data.org && (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Organization</Text>
            <TextInput style={styles.input} placeholder="Pharmacy name" placeholderTextColor={theme.textTertiary} value={orgName} onChangeText={setOrgName} />
            <TextInput style={styles.input} placeholder="PPB registration number" placeholderTextColor={theme.textTertiary} value={orgReg} onChangeText={setOrgReg} />
            <TextInput style={styles.input} placeholder="Contact phone" placeholderTextColor={theme.textTertiary} keyboardType="phone-pad" value={orgPhone} onChangeText={setOrgPhone} />
            <TextInput style={styles.input} placeholder="Contact email" placeholderTextColor={theme.textTertiary} autoCapitalize="none" keyboardType="email-address" value={orgEmail} onChangeText={setOrgEmail} />
            <TextInput style={styles.input} placeholder="Address" placeholderTextColor={theme.textTertiary} value={orgAddress} onChangeText={setOrgAddress} />
            <Button title="Save organization" onPress={saveOrg} loading={orgSaving} variant="secondary" />
          </Card>
        )}
      </ScrollView>
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    scrollContent: { gap: 12, paddingBottom: 24 },
    card: { gap: 10 },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: theme.textSecondary, textTransform: "uppercase" },
    hint: { fontSize: 12, color: theme.textTertiary, marginTop: -4 },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 15,
      backgroundColor: theme.surface,
      color: theme.text,
    },
  })
}
