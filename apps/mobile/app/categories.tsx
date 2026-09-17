import { useEffect, useState } from "react"
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { apiFetch } from "../src/lib/api-fetch"
import { env } from "../src/lib/env"
import { listLocalCategories, createLocalCategory, updateLocalCategory, deleteLocalCategory } from "../src/repo/catalog"
import { useSessionStore } from "../src/store/session"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Card, EmptyState, Screen, ScreenHeader } from "../src/components"

// Mirrors apps/web/app/api/categories/route.ts's GET handler exactly (verified
// against that file and apps/web/app/api/categories/[id]/route.ts directly,
// not from memory): a flat two-level list — every row has `parent_id` either
// null (top-level) or pointing at a top-level row's id. The server enforces
// exactly two levels (a category with a non-null parent_id can't itself be a
// parent), so building the tree client-side just means grouping by parent_id.
interface Category {
  id: string
  name: string
  parent_id: string | null
}

interface CategoriesResponse {
  categories: Category[]
}

// Mirrors the two separate write gates: creating a category is open to
// pharmacists too (apps/web/app/api/categories/route.ts's WRITE_ROLES — inline
// creation during product entry), but renaming/reparenting/deleting is
// management-only (apps/web/app/api/categories/[id]/route.ts's WRITE_ROLES).
const CREATE_ROLES = ["owner", "manager", "pharmacist"]
const EDIT_ROLES = ["owner", "manager"]

type Row = { kind: "parent" | "child"; cat: Category }

// Groups the flat list into top-level categories followed by their children.
// A category is treated as top-level if its parent_id is null OR if its
// parent isn't present in the current list (defensive — shouldn't happen
// given the server's two-level invariant, but avoids silently dropping rows).
function buildRows(categories: Category[]): Row[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const topLevel = categories.filter((c) => !c.parent_id || !byId.has(c.parent_id))
  const rows: Row[] = []
  for (const top of topLevel) {
    rows.push({ kind: "parent", cat: top })
    const children = categories.filter((c) => c.parent_id === top.id)
    for (const child of children) rows.push({ kind: "child", cat: child })
  }
  return rows
}

export default function Categories() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { role } = useSessionStore()
  // Computed before the access gate further down so it can double as an
  // effect guard (Hooks must run unconditionally on every render — the
  // gate's `if` can't sit above the useState/useEffect calls below).
  const hasAccess = role == null || ["owner", "manager", "pharmacist"].includes(role)

  const [categories, setCategories] = useState<Category[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // Bumped by retry/pull-to-refresh/after a write to re-run the load effect
  // below without exposing the fetch function itself as a captured effect
  // dependency (mirrors inventory.tsx/appointments.tsx's shape).
  const [reloadToken, setReloadToken] = useState(0)

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [parentId, setParentId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [editSubmitting, setEditSubmitting] = useState(false)

  useEffect(() => {
    if (!hasAccess) return
    async function load() {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        try {
          setCategories(await listLocalCategories())
          setLoaded(true)
          setError(null)
        } finally {
          setRefreshing(false)
        }
        return
      }
      try {
        const res = await apiFetch("/api/categories")
        if (!res.ok) {
          setError(`Could not load categories (HTTP ${res.status})`)
          return
        }
        const json = (await res.json()) as CategoriesResponse
        setCategories(json.categories)
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
        <ScreenHeader title="Categories" />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
          message="You don't have access to category management."
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
    setParentId(null)
    setFormError(null)
  }

  async function handleCreate() {
    setFormError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setFormError("Category name is required")
      return
    }
    setSubmitting(true)
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        await createLocalCategory(trimmed, parentId)
      } else {
        const res = await apiFetch("/api/categories", {
          method: "POST",
          body: JSON.stringify({ name: trimmed, parent_id: parentId }),
        })
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        if (!res.ok) {
          setFormError(body?.error ?? `Could not create category (HTTP ${res.status})`)
          return
        }
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

  function startEdit(cat: Category) {
    setEditingId(cat.id)
    setEditingName(cat.name)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingName("")
  }

  async function saveEdit(id: string) {
    const trimmed = editingName.trim()
    if (!trimmed) return
    setEditSubmitting(true)
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        await updateLocalCategory(id, trimmed)
      } else {
        const res = await apiFetch(`/api/categories/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: trimmed }),
        })
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        if (!res.ok) {
          Alert.alert("Could not save", body?.error ?? `HTTP ${res.status}`)
          return
        }
      }
      setEditingId(null)
      setReloadToken((t) => t + 1)
    } catch {
      Alert.alert("Could not reach the server", "Check your connection and try again.")
    } finally {
      setEditSubmitting(false)
    }
  }

  function confirmDelete(cat: Category) {
    Alert.alert("Delete category", `Delete "${cat.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteCategory(cat.id) },
    ])
  }

  async function deleteCategory(id: string) {
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        await deleteLocalCategory(id)
      } else {
        const res = await apiFetch(`/api/categories/${id}`, { method: "DELETE" })
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        if (!res.ok) {
          Alert.alert("Could not delete", body?.error ?? `HTTP ${res.status}`)
          return
        }
      }
      setReloadToken((t) => t + 1)
    } catch {
      Alert.alert("Could not reach the server", "Check your connection and try again.")
    }
  }

  if (error && !loaded) {
    return (
      <Screen style={styles.centered}>
        <ScreenHeader title="Categories" />
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
        <ScreenHeader title="Categories" />
        <Text style={styles.label}>Loading…</Text>
      </Screen>
    )
  }

  const topLevelOptions = categories.filter((c) => !c.parent_id)
  const rows = buildRows(categories)

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(item) => `${item.kind}-${item.cat.id}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.green} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader title="Categories" />
            <View style={styles.titleRow}>
              <Text style={styles.subtitle}>{categories.length} categories</Text>
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
                <Text style={styles.formTitle}>New category</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Category name"
                  placeholderTextColor={theme.textTertiary}
                  value={name}
                  onChangeText={setName}
                />

                <Text style={styles.fieldLabel}>Parent</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}
                >
                  <Pressable
                    onPress={() => setParentId(null)}
                    style={[styles.chip, parentId === null && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, parentId === null && styles.chipTextActive]}>Top-level</Text>
                  </Pressable>
                  {topLevelOptions.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setParentId(c.id)}
                      style={[styles.chip, parentId === c.id && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, parentId === c.id && styles.chipTextActive]}>{c.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

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
        renderItem={({ item }) => (
          <CategoryRow
            row={item}
            canEdit={canEdit}
            isEditing={editingId === item.cat.id}
            editingName={editingName}
            editSubmitting={editSubmitting}
            onEditingNameChange={setEditingName}
            onStartEdit={() => startEdit(item.cat)}
            onCancelEdit={cancelEdit}
            onSaveEdit={() => saveEdit(item.cat.id)}
            onDelete={() => confirmDelete(item.cat)}
            theme={theme}
            styles={styles}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="folder-outline" size={28} color={theme.textTertiary} />}
            message="No categories yet"
          />
        }
      />
    </Screen>
  )
}

function CategoryRow({
  row,
  canEdit,
  isEditing,
  editingName,
  editSubmitting,
  onEditingNameChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  theme,
  styles,
}: {
  row: Row
  canEdit: boolean
  isEditing: boolean
  editingName: string
  editSubmitting: boolean
  onEditingNameChange: (v: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onDelete: () => void
  theme: Theme
  styles: Styles
}) {
  return (
    <Card style={[styles.catCard, row.kind === "child" && styles.catCardChild]}>
      {isEditing ? (
        <View style={styles.editRow}>
          <TextInput
            style={[styles.input, styles.editInput]}
            value={editingName}
            onChangeText={onEditingNameChange}
            autoFocus
          />
          <Pressable onPress={onSaveEdit} disabled={editSubmitting} hitSlop={8} style={styles.iconButton}>
            <Ionicons name="checkmark" size={20} color={theme.green} />
          </Pressable>
          <Pressable onPress={onCancelEdit} disabled={editSubmitting} hitSlop={8} style={styles.iconButton}>
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.catRow}>
          <View style={styles.catNameCol}>
            {row.kind === "child" ? <Ionicons name="return-down-forward-outline" size={14} color={theme.textTertiary} /> : null}
            <Text style={[styles.catName, row.kind === "parent" && styles.catNameParent]} numberOfLines={1}>
              {row.cat.name}
            </Text>
          </View>
          {canEdit ? (
            <View style={styles.catActions}>
              <Pressable onPress={onStartEdit} hitSlop={8} style={styles.iconButton}>
                <Ionicons name="pencil-outline" size={18} color={theme.textSecondary} />
              </Pressable>
              <Pressable onPress={onDelete} hitSlop={8} style={styles.iconButton}>
                <Ionicons name="trash-outline" size={18} color={theme.red} />
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
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
    chipText: { fontSize: 13, fontWeight: "600", color: theme.textSecondary },
    chipTextActive: { color: "#fff" },

    rowGap: { height: 8 },
    catCard: { paddingVertical: 10 },
    catCardChild: { marginLeft: 20 },
    catRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
    catNameCol: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
    catName: { fontSize: 14, color: theme.text, flexShrink: 1 },
    catNameParent: { fontSize: 15, fontWeight: "600" },
    catActions: { flexDirection: "row", gap: 4 },
    iconButton: { padding: 4 },

    editRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    editInput: { flex: 1, paddingVertical: 8 },
  })
}

type Styles = ReturnType<typeof createStyles>
