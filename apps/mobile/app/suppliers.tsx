import { useEffect, useState } from "react"
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { apiFetch } from "../src/lib/api-fetch"
import { useSessionStore } from "../src/store/session"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Card, EmptyState, Screen, ScreenHeader } from "../src/components"

// Mirrors apps/web/lib/suppliers/serialize.ts's serializeSupplier() output
// exactly (verified against that file plus apps/web/app/api/suppliers/route.ts
// directly, not from memory). The underlying `supplier` table dropped
// `address`/`is_active` columns — the API always synthesizes address: null and
// is_active: true regardless of what's sent, so neither field is editable here.
interface Supplier {
  id: string
  name: string
  phone: string | null
  email: string | null
}

interface SuppliersResponse {
  suppliers: Supplier[]
}

// Mirrors apps/web/app/api/suppliers/route.ts's WRITE_ROLES (create — open to
// pharmacists, since suppliers are often added inline while receiving stock)
// and apps/web/app/api/suppliers/[id]/route.ts's WRITE_ROLES (edit —
// management-only). There's no DELETE route for suppliers at all.
const CREATE_ROLES = ["owner", "manager", "pharmacist"]
const EDIT_ROLES = ["owner", "manager"]

export default function Suppliers() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { role } = useSessionStore()
  // Computed before the access gate further down so it can double as an
  // effect guard (Hooks must run unconditionally on every render — the
  // gate's `if` can't sit above the useState/useEffect calls below).
  const hasAccess = role == null || ["owner", "manager", "pharmacist"].includes(role)

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // Bumped by retry/pull-to-refresh/after a write to re-run the load effect
  // below (mirrors inventory.tsx/appointments.tsx/categories.tsx's shape).
  const [reloadToken, setReloadToken] = useState(0)

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  useEffect(() => {
    if (!hasAccess) return
    async function load() {
      try {
        const res = await apiFetch("/api/suppliers")
        if (!res.ok) {
          setError(`Could not load suppliers (HTTP ${res.status})`)
          return
        }
        const json = (await res.json()) as SuppliersResponse
        setSuppliers(json.suppliers)
        setLoaded(true)
        setError(null)
      } catch {
        setError("Could not reach the server. Check your connection and try again.")
      } finally {
        setRefreshing(false)
      }
    }
    load()
  }, [reloadToken, hasAccess])

  // Access gate — must come after every Hook call above (rules-of-hooks:
  // Hooks can't run conditionally), but before the read/write logic below
  // that assumes an authorized role.
  if (role && !hasAccess) {
    return (
      <Screen>
        <ScreenHeader title="Suppliers" />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
          message="You don't have access to supplier management."
        />
      </Screen>
    )
  }

  const canCreate = role != null && CREATE_ROLES.includes(role)
  const canEdit = role != null && EDIT_ROLES.includes(role)

  function retry() {
    setReloadToken((t) => t + 1)
  }

  function onRefresh() {
    setRefreshing(true)
    setReloadToken((t) => t + 1)
  }

  function resetForm() {
    setName("")
    setPhone("")
    setEmail("")
    setFormError(null)
  }

  async function handleCreate() {
    setFormError(null)
    const trimmedName = name.trim()
    if (!trimmedName) {
      setFormError("Supplier name is required")
      return
    }
    setSubmitting(true)
    try {
      const res = await apiFetch("/api/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: trimmedName,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
        }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setFormError(body?.error ?? `Could not create supplier (HTTP ${res.status})`)
        return
      }
      setShowForm(false)
      resetForm()
      setReloadToken((t) => t + 1)
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(s: Supplier) {
    setEditingId(s.id)
    setEditName(s.name)
    setEditPhone(s.phone ?? "")
    setEditEmail(s.email ?? "")
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError(null)
  }

  async function saveEdit(id: string) {
    setEditError(null)
    const trimmedName = editName.trim()
    if (!trimmedName) {
      setEditError("Supplier name is required")
      return
    }
    setEditSubmitting(true)
    try {
      const res = await apiFetch(`/api/suppliers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: trimmedName,
          phone: editPhone.trim(),
          email: editEmail.trim(),
        }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setEditError(body?.error ?? `Could not save (HTTP ${res.status})`)
        return
      }
      setEditingId(null)
      setReloadToken((t) => t + 1)
    } catch {
      setEditError("Could not reach the server. Check your connection and try again.")
    } finally {
      setEditSubmitting(false)
    }
  }

  if (error && !loaded) {
    return (
      <Screen style={styles.centered}>
        <ScreenHeader title="Suppliers" />
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
        <ScreenHeader title="Suppliers" />
        <Text style={styles.label}>Loading…</Text>
      </Screen>
    )
  }

  return (
    <Screen>
      <FlatList
        data={suppliers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.green} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader title="Suppliers" />
            <View style={styles.titleRow}>
              <Text style={styles.subtitle}>{suppliers.length} suppliers</Text>
              {canCreate ? (
                <Button
                  title={showForm ? "Close" : "Add"}
                  onPress={() => setShowForm((v) => !v)}
                  icon={showForm ? undefined : <Ionicons name="add" size={18} color="#fff" />}
                  style={styles.addButton}
                />
              ) : null}
            </View>

            {canCreate && showForm ? (
              <Card style={styles.formCard}>
                <Text style={styles.formTitle}>New supplier</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Supplier name"
                  placeholderTextColor={theme.textTertiary}
                  value={name}
                  onChangeText={setName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Phone (optional)"
                  placeholderTextColor={theme.textTertiary}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email (optional)"
                  placeholderTextColor={theme.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />

                {formError ? <Text style={styles.error}>{formError}</Text> : null}

                <View style={styles.formActionsRow}>
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={() => {
                      setShowForm(false)
                      resetForm()
                    }}
                    style={styles.formActionButton}
                  />
                  <Button title="Save" onPress={handleCreate} loading={submitting} style={styles.formActionButton} />
                </View>
              </Card>
            ) : null}

            {error ? <Text style={styles.inlineError}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) =>
          editingId === item.id ? (
            <Card style={styles.supplierCard}>
              <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Supplier name" placeholderTextColor={theme.textTertiary} autoFocus />
              <TextInput
                style={styles.input}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="Phone"
                placeholderTextColor={theme.textTertiary}
                keyboardType="phone-pad"
              />
              <TextInput
                style={styles.input}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="Email"
                placeholderTextColor={theme.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {editError ? <Text style={styles.error}>{editError}</Text> : null}
              <View style={styles.formActionsRow}>
                <Button title="Cancel" variant="secondary" onPress={cancelEdit} style={styles.formActionButton} />
                <Button title="Save" onPress={() => saveEdit(item.id)} loading={editSubmitting} style={styles.formActionButton} />
              </View>
            </Card>
          ) : (
            <SupplierRow supplier={item} canEdit={canEdit} onEdit={() => startEdit(item)} theme={theme} styles={styles} />
          )
        }
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="business-outline" size={28} color={theme.textTertiary} />}
            message="No suppliers yet"
          />
        }
      />
    </Screen>
  )
}

function SupplierRow({
  supplier,
  canEdit,
  onEdit,
  theme,
  styles,
}: {
  supplier: Supplier
  canEdit: boolean
  onEdit: () => void
  theme: Theme
  styles: Styles
}) {
  return (
    <Card style={styles.supplierCard}>
      <View style={styles.supplierRow}>
        <View style={styles.supplierNameCol}>
          <Text style={styles.supplierName} numberOfLines={1}>
            {supplier.name}
          </Text>
          {supplier.phone ? (
            <Text style={styles.supplierMeta} numberOfLines={1}>
              {supplier.phone}
            </Text>
          ) : null}
          {supplier.email ? (
            <Text style={styles.supplierMeta} numberOfLines={1}>
              {supplier.email}
            </Text>
          ) : null}
        </View>
        {canEdit ? (
          <Pressable onPress={onEdit} hitSlop={8} style={styles.iconButton}>
            <Ionicons name="pencil-outline" size={18} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>
    </Card>
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
    header: { gap: 10, marginBottom: 4 },
    titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    subtitle: { fontSize: 13, color: theme.textSecondary },
    addButton: { paddingVertical: 10, paddingHorizontal: 16 },

    formCard: { gap: 10 },
    formTitle: { fontSize: 15, fontWeight: "700", color: theme.text },
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

    rowGap: { height: 8 },
    supplierCard: { gap: 8 },
    supplierRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
    supplierNameCol: { flex: 1, gap: 2 },
    supplierName: { fontSize: 15, fontWeight: "600", color: theme.text },
    supplierMeta: { fontSize: 13, color: theme.textSecondary },
    iconButton: { padding: 4 },
  })
}

type Styles = ReturnType<typeof createStyles>
