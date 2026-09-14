import { useEffect, useState } from "react"
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { apiFetch } from "../src/lib/api-fetch"
import { useSessionStore } from "../src/store/session"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Card, EmptyState, Screen, ScreenHeader, StatusBadge } from "../src/components"
import type { BadgeStatus } from "../src/components"

// Mirrors apps/web's /api/staff route family response shapes exactly (as
// researched directly against those handlers, not from memory): GET /api/staff
// returns this row shape per member. `branch_name` is a flattened convenience
// field; `branches` is the raw relation — both point at the same branch, kept
// here so either can be used defensively if one is ever null.
type StaffRole = "owner" | "manager" | "pharmacist" | "cashier"

interface StaffMember {
  id: string
  full_name: string
  role: StaffRole
  branch_id: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  branch_name: string | null
  banned: boolean
  ban_reason: "suspended" | "banned" | null
  branches: { name: string } | null
}

interface StaffListResponse {
  staff: StaffMember[]
}

// Role can never be set to "owner" from this screen — POST /api/staff rejects
// it outright, and there's no path in the product for creating a second owner
// from the staff list, so it's simply never offered as an option here (for
// either inviting or editing).
type AssignableRole = "manager" | "pharmacist" | "cashier"

const ASSIGNABLE_ROLES: { key: AssignableRole; label: string }[] = [
  { key: "manager", label: "Manager" },
  { key: "pharmacist", label: "Pharmacist" },
  { key: "cashier", label: "Cashier" },
]

const PIN_RE = /^\d{4}$/

function formatRole(role: StaffRole): string {
  switch (role) {
    case "owner":
      return "Owner"
    case "manager":
      return "Manager"
    case "pharmacist":
      return "Pharmacist"
    case "cashier":
      return "Cashier"
  }
}

// Devices run exclusively in Kenya (single timezone, no DST — see shifts.tsx/
// dashboard.tsx), so the device's local clock reads as Africa/Nairobi time.
function formatJoinDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })
}

function badgeFor(member: StaffMember): { status: BadgeStatus; label: string } {
  if (member.banned) {
    return member.ban_reason === "suspended"
      ? { status: "warning", label: "Suspended" }
      : { status: "danger", label: "Banned" }
  }
  if (!member.is_active) return { status: "neutral", label: "Inactive" }
  return { status: "ok", label: "Active" }
}

// Mirrors the server's write restrictions on PATCH/DELETE /api/staff/[id]
// (verified against those handlers directly): a manager can never edit an
// owner's row or another manager's row; an owner can edit anyone. Self-edit is
// also rejected server-side, but useSessionStore exposes no user id to check
// against here, so that one restriction is left to surface naturally as a
// server error instead (per this screen's spec).
function canManage(currentRole: string | null, target: StaffMember): boolean {
  if (currentRole === "owner") return true
  if (currentRole === "manager") return target.role !== "owner" && target.role !== "manager"
  return false
}

export default function Staff() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { role, branches } = useSessionStore()

  // All hooks are declared unconditionally, above the role gate below — the
  // gate is an early return that depends on `role`, and `role` starts out
  // null until the session finishes loading, so hooks can't be placed after
  // it without risking a different hook order across renders.
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // Bumped by retry/pull-to-refresh/any successful write to re-run the fetch
  // effect below without exposing the fetch function itself as a captured
  // effect dependency (mirrors appointments.tsx/dashboard.tsx's shape, per
  // this repo's react-hooks/set-state-in-effect rule).
  const [reloadToken, setReloadToken] = useState(0)
  const [banner, setBanner] = useState<string | null>(null)

  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteName, setInviteName] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [invitePhone, setInvitePhone] = useState("")
  const [inviteRole, setInviteRole] = useState<AssignableRole>("cashier")
  const [inviteBranchId, setInviteBranchId] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSubmitting, setInviteSubmitting] = useState(false)

  const [managingStaffId, setManagingStaffId] = useState<string | null>(null)
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const [pinInput, setPinInput] = useState("")
  const [pinError, setPinError] = useState<string | null>(null)

  // Derived (not a stale snapshot) so that after any successful write bumps
  // reloadToken and the list refetches, the open sheet picks up the fresh
  // row automatically — this is what lets patchStaff() below simply refetch
  // the list rather than merging the PATCH response back in by hand.
  const managingStaff = staff.find((s) => s.id === managingStaffId) ?? null

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch("/api/staff")
        if (!res.ok) {
          setError(`Could not load staff (HTTP ${res.status})`)
          return
        }
        const json = (await res.json()) as StaffListResponse
        setStaff(json.staff)
        setLoaded(true)
        setError(null)
      } catch {
        setError("Could not reach the server. Check your connection and try again.")
      } finally {
        setRefreshing(false)
      }
    }
    load()
  }, [reloadToken])

  function retry() {
    setReloadToken((t) => t + 1)
  }

  function onRefresh() {
    setRefreshing(true)
    setReloadToken((t) => t + 1)
  }

  function openInvite() {
    setBanner(null)
    setShowInviteForm(true)
  }

  function closeInvite() {
    setShowInviteForm(false)
    setInviteName("")
    setInviteEmail("")
    setInvitePhone("")
    setInviteRole("cashier")
    setInviteBranchId(null)
    setInviteError(null)
  }

  async function handleSubmitInvite() {
    setInviteError(null)
    const trimmedName = inviteName.trim()
    const trimmedEmail = inviteEmail.trim()
    if (trimmedName.length < 2) {
      setInviteError("Enter the staff member's full name")
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setInviteError("Enter a valid email address")
      return
    }
    setInviteSubmitting(true)
    try {
      const res = await apiFetch("/api/staff", {
        method: "POST",
        body: JSON.stringify({
          email: trimmedEmail,
          full_name: trimmedName,
          role: inviteRole,
          branch_id: inviteBranchId,
          phone: invitePhone.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setInviteError(body?.error ?? `Could not send invite (HTTP ${res.status})`)
        return
      }
      closeInvite()
      setBanner(`Invitation sent to ${trimmedEmail}`)
      setReloadToken((t) => t + 1)
    } catch {
      setInviteError("Could not reach the server. Check your connection and try again.")
    } finally {
      setInviteSubmitting(false)
    }
  }

  function openManage(id: string) {
    setBanner(null)
    setSheetError(null)
    setPinError(null)
    setPinInput("")
    setManagingStaffId(id)
  }

  function closeManage() {
    setManagingStaffId(null)
    setSheetError(null)
    setPinError(null)
    setPinInput("")
  }

  // Shared by the role chips, branch chips, and the active/inactive toggle —
  // all three are sparse single-field PATCHes. On success this deliberately
  // does NOT merge the response back into local state (the response also
  // omits banned/ban_reason, per this route's documented quirk); it just
  // refetches the list, and `managingStaff` above re-derives from that.
  async function patchStaff(id: string, body: Record<string, unknown>) {
    setActionPending(true)
    setSheetError(null)
    try {
      const res = await apiFetch(`/api/staff/${id}`, { method: "PATCH", body: JSON.stringify(body) })
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null
        setSheetError(errBody?.error ?? `Could not update staff member (HTTP ${res.status})`)
        return
      }
      setReloadToken((t) => t + 1)
    } catch {
      setSheetError("Could not reach the server. Check your connection and try again.")
    } finally {
      setActionPending(false)
    }
  }

  function handleRolePress(newRole: AssignableRole) {
    if (!managingStaff || actionPending || newRole === managingStaff.role) return
    void patchStaff(managingStaff.id, { role: newRole })
  }

  function handleBranchPress(newBranchId: string | null) {
    if (!managingStaff || actionPending || newBranchId === managingStaff.branch_id) return
    void patchStaff(managingStaff.id, { branch_id: newBranchId })
  }

  function handleToggleActive() {
    if (!managingStaff || actionPending) return
    void patchStaff(managingStaff.id, { is_active: !managingStaff.is_active })
  }

  function handleSetPin() {
    if (!managingStaff) return
    setPinError(null)
    const trimmed = pinInput.trim()
    if (!PIN_RE.test(trimmed)) {
      setPinError("PIN must be exactly 4 digits")
      return
    }
    void submitPin(managingStaff.id, trimmed)
  }

  async function submitPin(id: string, pin: string) {
    setActionPending(true)
    try {
      const res = await apiFetch(`/api/staff/${id}`, { method: "PATCH", body: JSON.stringify({ pin }) })
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null
        setPinError(errBody?.error ?? `Could not set PIN (HTTP ${res.status})`)
        return
      }
      setPinInput("")
      setBanner("PIN updated")
    } catch {
      setPinError("Could not reach the server. Check your connection and try again.")
    } finally {
      setActionPending(false)
    }
  }

  async function handleResend() {
    if (!managingStaff || actionPending) return
    setActionPending(true)
    setSheetError(null)
    try {
      const res = await apiFetch(`/api/staff/${managingStaff.id}/resend`, { method: "POST" })
      const body = (await res.json().catch(() => null)) as { ok?: boolean; email?: string; error?: string } | null
      if (!res.ok) {
        setSheetError(body?.error ?? `Could not resend invite (HTTP ${res.status})`)
        return
      }
      setBanner(body?.email ? `Invite resent to ${body.email}` : "Invite resent")
    } catch {
      setSheetError("Could not reach the server. Check your connection and try again.")
    } finally {
      setActionPending(false)
    }
  }

  function handleRemovePress() {
    if (!managingStaff) return
    const target = managingStaff
    Alert.alert(
      "Remove staff member",
      `Remove ${target.full_name} from this organization? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => void removeStaff(target.id) },
      ],
    )
  }

  async function removeStaff(id: string) {
    setActionPending(true)
    setSheetError(null)
    try {
      const res = await apiFetch(`/api/staff/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null
        setSheetError(errBody?.error ?? `Could not remove staff member (HTTP ${res.status})`)
        return
      }
      closeManage()
      setBanner("Staff member removed")
      setReloadToken((t) => t + 1)
    } catch {
      setSheetError("Could not reach the server. Check your connection and try again.")
    } finally {
      setActionPending(false)
    }
  }

  if (role && !["owner", "manager"].includes(role)) {
    return (
      <Screen>
        <ScreenHeader title="Staff" />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
          message="Only owners and managers can view staff."
        />
      </Screen>
    )
  }

  if (error && !loaded) {
    return (
      <Screen style={styles.centered}>
        <ScreenHeader title="Staff" />
        <Card style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
          <Button
            title="Retry"
            variant="secondary"
            onPress={retry}
            icon={<Ionicons name="refresh-outline" size={18} color={theme.text} />}
          />
        </Card>
      </Screen>
    )
  }

  if (!loaded) {
    return (
      <Screen style={styles.centered}>
        <ScreenHeader title="Staff" />
        <Text style={styles.label}>Loading…</Text>
      </Screen>
    )
  }

  return (
    <Screen>
      <FlatList
        data={staff}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.green} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <ScreenHeader title="Staff" />
              <Button
                title={showInviteForm ? "Close" : "Invite"}
                onPress={() => (showInviteForm ? closeInvite() : openInvite())}
                icon={showInviteForm ? undefined : <Ionicons name="add" size={18} color="#fff" />}
                style={styles.newButton}
              />
            </View>

            {banner ? (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>{banner}</Text>
                <Pressable onPress={() => setBanner(null)} hitSlop={8}>
                  <Ionicons name="close" size={16} color={theme.green} />
                </Pressable>
              </View>
            ) : null}

            {showInviteForm ? (
              <Card style={styles.formCard}>
                <Text style={styles.formTitle}>Invite staff member</Text>

                <TextInput
                  style={styles.input}
                  placeholder="Full name"
                  placeholderTextColor={theme.textTertiary}
                  value={inviteName}
                  onChangeText={setInviteName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor={theme.textTertiary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Phone number (optional)"
                  placeholderTextColor={theme.textTertiary}
                  keyboardType="phone-pad"
                  value={invitePhone}
                  onChangeText={setInvitePhone}
                />

                <Text style={styles.fieldLabel}>Role</Text>
                <RoleChipRow value={inviteRole} onChange={setInviteRole} styles={styles} disabled={inviteSubmitting} />

                <Text style={styles.fieldLabel}>Branch</Text>
                <BranchChipRow
                  branches={branches}
                  value={inviteBranchId}
                  onChange={setInviteBranchId}
                  styles={styles}
                  disabled={inviteSubmitting}
                />

                {inviteError ? <Text style={styles.error}>{inviteError}</Text> : null}

                <View style={styles.formActionsRow}>
                  <Button title="Cancel" variant="secondary" onPress={closeInvite} style={styles.formActionButton} />
                  <Button
                    title="Send invite"
                    onPress={handleSubmitInvite}
                    loading={inviteSubmitting}
                    style={styles.formActionButton}
                  />
                </View>
              </Card>
            ) : null}

            {error ? <Text style={styles.inlineError}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <StaffRow
            member={item}
            canManage={canManage(role, item)}
            onManage={() => openManage(item.id)}
            theme={theme}
            styles={styles}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="people-outline" size={28} color={theme.textTertiary} />}
            message="No staff members yet"
          />
        }
      />

      <Modal visible={managingStaff != null} animationType="slide" transparent onRequestClose={closeManage}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeManage} />
          {managingStaff ? (
            <View style={[styles.modalSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.modalHeaderRow}>
                  <View style={styles.modalNameCol}>
                    <Text style={styles.modalName} numberOfLines={1}>
                      {managingStaff.full_name}
                    </Text>
                    <Text style={styles.modalMeta}>
                      {formatRole(managingStaff.role)} · {managingStaff.branch_name ?? managingStaff.branches?.name ?? "No branch"}
                    </Text>
                  </View>
                  <Pressable onPress={closeManage} hitSlop={12}>
                    <Ionicons name="close" size={24} color={theme.text} />
                  </Pressable>
                </View>

                {sheetError ? <Text style={styles.error}>{sheetError}</Text> : null}

                <Text style={styles.modalSectionLabel}>Role</Text>
                {managingStaff.role === "owner" ? (
                  <Text style={styles.modalStaticValue}>Owner — role can&apos;t be changed here</Text>
                ) : (
                  <RoleChipRow
                    value={managingStaff.role as AssignableRole}
                    onChange={handleRolePress}
                    styles={styles}
                    disabled={actionPending}
                  />
                )}

                <Text style={styles.modalSectionLabel}>Branch</Text>
                <BranchChipRow
                  branches={branches}
                  value={managingStaff.branch_id}
                  onChange={handleBranchPress}
                  styles={styles}
                  disabled={actionPending}
                />

                <Text style={styles.modalSectionLabel}>Status</Text>
                <Button
                  title={managingStaff.is_active ? "Deactivate" : "Activate"}
                  variant={managingStaff.is_active ? "danger" : "primary"}
                  onPress={handleToggleActive}
                  loading={actionPending}
                  icon={
                    <Ionicons
                      name={managingStaff.is_active ? "person-remove-outline" : "person-add-outline"}
                      size={18}
                      color="#fff"
                    />
                  }
                />

                <Text style={styles.modalSectionLabel}>Set login PIN</Text>
                <View style={styles.pinRow}>
                  <TextInput
                    style={[styles.input, styles.pinInput]}
                    placeholder="4-digit PIN"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                    value={pinInput}
                    onChangeText={setPinInput}
                  />
                  <Button title="Set PIN" onPress={handleSetPin} loading={actionPending} style={styles.pinButton} />
                </View>
                {pinError ? <Text style={styles.error}>{pinError}</Text> : null}

                <View style={styles.modalActionsRow}>
                  <Button
                    title="Resend invite"
                    variant="secondary"
                    onPress={handleResend}
                    loading={actionPending}
                    style={styles.formActionButton}
                  />
                  <Button
                    title="Remove"
                    variant="danger"
                    onPress={handleRemovePress}
                    disabled={actionPending}
                    style={styles.formActionButton}
                  />
                </View>
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>
    </Screen>
  )
}

function RoleChipRow({
  value,
  onChange,
  styles,
  disabled,
}: {
  value: AssignableRole
  onChange: (role: AssignableRole) => void
  styles: Styles
  disabled?: boolean
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
      {ASSIGNABLE_ROLES.map((r) => (
        <Pressable
          key={r.key}
          disabled={disabled}
          onPress={() => onChange(r.key)}
          style={[styles.chip, value === r.key && styles.chipActive, disabled && styles.chipDisabled]}
        >
          <Text style={[styles.chipText, value === r.key && styles.chipTextActive]}>{r.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}

function BranchChipRow({
  branches,
  value,
  onChange,
  styles,
  disabled,
}: {
  branches: { id: string; name: string }[]
  value: string | null
  onChange: (branchId: string | null) => void
  styles: Styles
  disabled?: boolean
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
      <Pressable
        disabled={disabled}
        onPress={() => onChange(null)}
        style={[styles.chip, value === null && styles.chipActive, disabled && styles.chipDisabled]}
      >
        <Text style={[styles.chipText, value === null && styles.chipTextActive]}>Unassigned</Text>
      </Pressable>
      {branches.map((b) => (
        <Pressable
          key={b.id}
          disabled={disabled}
          onPress={() => onChange(b.id)}
          style={[styles.chip, value === b.id && styles.chipActive, disabled && styles.chipDisabled]}
        >
          <Text style={[styles.chipText, value === b.id && styles.chipTextActive]}>{b.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}

function StaffRow({
  member,
  canManage,
  onManage,
  theme,
  styles,
}: {
  member: StaffMember
  canManage: boolean
  onManage: () => void
  theme: Theme
  styles: Styles
}) {
  const badge = badgeFor(member)
  const branchLabel = member.branch_name ?? member.branches?.name ?? "No branch"

  return (
    <Pressable disabled={!canManage} onPress={onManage}>
      <Card style={[styles.staffCard, !canManage && styles.staffCardDisabled]}>
        <View style={styles.staffHeaderRow}>
          <View style={styles.staffNameCol}>
            <Text style={styles.staffName} numberOfLines={1}>
              {member.full_name}
            </Text>
            <Text style={styles.staffMeta} numberOfLines={1}>
              {formatRole(member.role)} · {branchLabel}
            </Text>
          </View>
          <StatusBadge status={badge.status} label={badge.label} />
        </View>

        <View style={styles.staffFooterRow}>
          <Text style={styles.staffJoinDate}>Joined {formatJoinDate(member.created_at)}</Text>
          <Ionicons
            name={canManage ? "chevron-forward" : "lock-closed-outline"}
            size={18}
            color={theme.textTertiary}
          />
        </View>
      </Card>
    </Pressable>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    centered: { flex: 1, gap: 8 },
    label: { fontSize: 15, color: theme.text },
    error: { color: theme.red, fontSize: 13 },
    errorCard: { gap: 8 },
    inlineError: { color: theme.red, fontSize: 13 },

    listContent: { paddingBottom: 24 },
    header: { gap: 10, marginBottom: 12 },
    titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    title: { fontSize: 20, fontWeight: "700", color: theme.text },
    newButton: { paddingVertical: 10, paddingHorizontal: 16 },

    banner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      borderRadius: 8,
      borderWidth: 1,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: theme.green50,
      borderColor: theme.green100,
    },
    bannerText: { flex: 1, fontSize: 13, color: theme.green, fontWeight: "600" },

    formCard: { gap: 10 },
    formTitle: { fontSize: 15, fontWeight: "700", color: theme.text },
    fieldLabel: { fontSize: 12, fontWeight: "600", color: theme.textSecondary },
    formActionsRow: { flexDirection: "row", gap: 8, marginTop: 4 },
    formActionButton: { flex: 1 },

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

    filterRow: { gap: 8, paddingVertical: 2 },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.muted,
    },
    chipActive: { backgroundColor: theme.greenCta, borderColor: theme.greenCta },
    chipDisabled: { opacity: 0.5 },
    chipText: { fontSize: 13, fontWeight: "600", color: theme.textSecondary },
    chipTextActive: { color: "#fff" },

    rowGap: { height: 8 },
    staffCard: { gap: 8 },
    staffCardDisabled: { opacity: 0.6 },
    staffHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
    staffNameCol: { flex: 1, gap: 2 },
    staffName: { fontSize: 15, fontWeight: "600", color: theme.text },
    staffMeta: { fontSize: 12, color: theme.textSecondary },
    staffFooterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
    staffJoinDate: { fontSize: 12, color: theme.textTertiary },

    modalRoot: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    modalSheet: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderWidth: 1,
      borderBottomWidth: 0,
      padding: 16,
      maxHeight: "85%",
      gap: 10,
    },
    modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
    modalNameCol: { flex: 1, gap: 2 },
    modalName: { fontSize: 17, fontWeight: "700", color: theme.text },
    modalMeta: { fontSize: 13, color: theme.textSecondary },
    modalSectionLabel: { fontSize: 12, fontWeight: "600", color: theme.textSecondary, marginTop: 8 },
    modalStaticValue: { fontSize: 14, color: theme.text },
    modalActionsRow: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 8 },

    pinRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    pinInput: { flex: 1 },
    pinButton: { paddingHorizontal: 16 },
  })
}

type Styles = ReturnType<typeof createStyles>
