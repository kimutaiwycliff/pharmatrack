import { useState } from "react"
import { RefreshControl, StyleSheet, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import Ionicons from "@expo/vector-icons/Ionicons"
import { apiJson, errorMessage } from "../src/lib/api"
import { env } from "../src/lib/env"
import { toast } from "../src/lib/toast"
import { listLocalCategories, createLocalCategory, updateLocalCategory, deleteLocalCategory } from "../src/repo/catalog"
import { useCan } from "../src/hooks/useCan"
import { useQuery } from "../src/hooks/useQuery"
import { useTheme } from "../src/theme/useTheme"
import { space } from "../src/theme/tokens"
import {
  Button, Chip, EmptyState, ErrorState, IconButton, ListRow, Screen, ScreenHeader, Sheet, SkeletonList, Text, TextField,
} from "../src/components"
import {
  buildCategoryRows, categoryNameError, parentOptions, type Category, type CategoryRow,
} from "../src/features/catalogue/logic/categories"
import { confirm as askConfirm } from "../src/lib/confirm"

// Mirrors apps/web/app/api/categories/route.ts (GET list, POST create) and
// apps/web/app/api/categories/[id]/route.ts (PATCH rename, DELETE). Two write
// gates, same as the API: creating needs products.create OR categories.manage
// (inline creation during product entry), renaming/deleting needs
// categories.manage. Actions the user can't take are hidden, not disabled.
// The Offline Edition reads/writes the local SQLite repo instead.

type FormState = { kind: "create" } | { kind: "rename"; cat: Category } | null

async function fetchCategories(): Promise<Category[]> {
  if (env.EXPO_PUBLIC_OFFLINE_MODE) return listLocalCategories()
  const json = await apiJson<{ categories: Category[] }>("/api/categories")
  return json.categories
}

export default function Categories() {
  const theme = useTheme()
  const can = useCan()
  const canView = can("products.view")
  const canManage = can("categories.manage")
  const canCreate = can("products.create") || canManage

  const q = useQuery(canView ? "categories" : null, fetchCategories)
  const categories = q.data ?? []

  const [form, setForm] = useState<FormState>(null)
  const [name, setName] = useState("")
  const [parentId, setParentId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!canView) {
    return (
      <Screen>
        <ScreenHeader title="Categories" />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={32} color={theme.textTertiary} />}
          title="No access"
          message="You don't have access to categories. Ask the owner to turn on “Browse products & inventory” for your role."
        />
      </Screen>
    )
  }

  function openCreate() {
    setName("")
    setParentId(null)
    setFormError(null)
    setForm({ kind: "create" })
  }

  function openRename(cat: Category) {
    setName(cat.name)
    setFormError(null)
    setForm({ kind: "rename", cat })
  }

  async function submit() {
    if (!form || submitting) return
    const invalid = categoryNameError(name)
    if (invalid) {
      setFormError(invalid)
      return
    }
    const trimmed = name.trim()
    setFormError(null)
    setSubmitting(true)
    try {
      if (form.kind === "create") {
        if (env.EXPO_PUBLIC_OFFLINE_MODE) await createLocalCategory(trimmed, parentId)
        else await apiJson("/api/categories", { method: "POST", body: { name: trimmed, parent_id: parentId } })
        toast.success(`Added “${trimmed}”`)
      } else {
        if (env.EXPO_PUBLIC_OFFLINE_MODE) await updateLocalCategory(form.cat.id, trimmed)
        else await apiJson(`/api/categories/${form.cat.id}`, { method: "PATCH", body: { name: trimmed } })
        toast.success("Category renamed")
      }
      setForm(null)
      q.refresh()
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  function confirmDelete(row: CategoryRow) {
    const extra = row.childCount > 0 ? " Move or delete its subcategories first." : " Products in it become uncategorised."
    void askConfirm({
      title: "Delete category",
      message: `Delete “${row.cat.name}”? This cannot be undone.${extra}`,
      confirmLabel: "Delete",
      destructive: true,
    }).then((ok) => {
      if (ok) void deleteCategory(row.cat)
    })
  }

  async function deleteCategory(cat: Category) {
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) await deleteLocalCategory(cat.id)
      else await apiJson(`/api/categories/${cat.id}`, { method: "DELETE" })
      toast.success(`Deleted “${cat.name}”`)
      q.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const rows = buildCategoryRows(categories)
  const subtitle = q.data ? `${categories.length} categor${categories.length === 1 ? "y" : "ies"}` : null
  const header = (
    <ScreenHeader
      title="Categories"
      subtitle={subtitle}
      right={canCreate ? <IconButton icon="add" variant="filled" accessibilityLabel="Add category" onPress={openCreate} /> : null}
    />
  )

  let body
  if (q.loading) {
    body = <SkeletonList rows={8} />
  } else if (q.error && !q.data) {
    body = <ErrorState message={q.error} onRetry={q.retry} />
  } else {
    body = (
      <FlashList
        data={rows}
        keyExtractor={(item) => `${item.kind}-${item.cat.id}`}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={theme.green} colors={[theme.green]} />}
        ListHeaderComponent={q.error ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <ListRow
            title={item.cat.name}
            subtitle={
              item.kind === "parent"
                ? item.childCount > 0
                  ? `${item.childCount} subcategor${item.childCount === 1 ? "y" : "ies"}`
                  : null
                : "Subcategory"
            }
            style={item.kind === "child" ? styles.childRow : null}
            accessibilityLabel={item.kind === "child" ? `${item.cat.name}, subcategory` : item.cat.name}
            leading={
              <Ionicons
                name={item.kind === "parent" ? "folder-outline" : "return-down-forward-outline"}
                size={item.kind === "parent" ? 22 : 18}
                color={item.kind === "parent" ? theme.green600 : theme.textTertiary}
              />
            }
            trailing={
              canManage ? (
                <View style={styles.actions}>
                  <IconButton icon="pencil-outline" size={20} color={theme.textSecondary} accessibilityLabel={`Rename ${item.cat.name}`} onPress={() => openRename(item.cat)} />
                  <IconButton icon="trash-outline" size={20} color={theme.red} accessibilityLabel={`Delete ${item.cat.name}`} onPress={() => confirmDelete(item)} />
                </View>
              ) : null
            }
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="folder-open-outline" size={32} color={theme.textTertiary} />}
            title="No categories yet"
            message="Group products into categories (and one level of subcategories) to find them faster."
            action={canCreate ? { label: "Add category", onPress: openCreate } : undefined}
          />
        }
      />
    )
  }

  const parents = parentOptions(categories)

  return (
    <Screen>
      {header}
      <View style={styles.flex}>{body}</View>

      <Sheet
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.kind === "rename" ? "Rename category" : "New category"}
        scrollable
        footer={
          <View style={styles.footerRow}>
            <Button title="Cancel" variant="secondary" onPress={() => setForm(null)} disabled={submitting} style={styles.flex} />
            <Button title="Save" onPress={submit} loading={submitting} style={styles.flex} />
          </View>
        }
      >
        <TextField
          inSheet
          label="Name"
          placeholder="e.g. Analgesics"
          value={name}
          onChangeText={(v) => {
            setName(v)
            if (formError) setFormError(null)
          }}
          maxLength={60}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={submit}
          error={formError}
        />
        {form?.kind === "create" ? (
          <View style={styles.parentBlock}>
            <Text variant="label" tone="secondary">
              Parent
            </Text>
            <View style={styles.chips} accessibilityRole="radiogroup">
              <Chip label="Top-level" selected={parentId === null} onPress={() => setParentId(null)} />
              {parents.map((c) => (
                <Chip key={c.id} label={c.name} selected={parentId === c.id} accessibilityLabel={`Inside ${c.name}`} onPress={() => setParentId(c.id)} />
              ))}
            </View>
            <Text variant="caption" tone="secondary">
              Subcategories can only go one level deep.
            </Text>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { paddingBottom: space.xxl },
  childRow: { paddingLeft: space.xxl },
  actions: { flexDirection: "row" },
  parentBlock: { gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  footerRow: { flexDirection: "row", gap: space.sm },
})
