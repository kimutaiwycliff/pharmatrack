import { useRef, useState } from "react"
import { RefreshControl, StyleSheet, View, type TextInput } from "react-native"
import { FlashList } from "@shopify/flash-list"
import Ionicons from "@expo/vector-icons/Ionicons"
import { apiJson, errorMessage } from "../src/lib/api"
import { env } from "../src/lib/env"
import { toast } from "../src/lib/toast"
import { listLocalSuppliers, createLocalSupplier, updateLocalSupplier } from "../src/repo/catalog"
import { useCan } from "../src/hooks/useCan"
import { useQuery } from "../src/hooks/useQuery"
import { useTheme } from "../src/theme/useTheme"
import { space } from "../src/theme/tokens"
import {
  Button, EmptyState, ErrorState, IconButton, ListRow, Screen, ScreenHeader, Sheet, SkeletonList, Text, TextField,
} from "../src/components"

// Mirrors apps/web/lib/suppliers/serialize.ts's serializeSupplier() output and
// apps/web/app/api/suppliers/route.ts (GET list, POST create) +
// apps/web/app/api/suppliers/[id]/route.ts (PATCH). The supplier table dropped
// address/is_active, so only name/phone/email are editable. Gates match the
// API: creating needs suppliers.manage, stock.receive or products.create
// (suppliers are often added while receiving stock); editing needs
// suppliers.manage. There's no DELETE route. The Offline Edition uses the
// local SQLite repo instead.
interface Supplier {
  id: string
  name: string
  phone: string | null
  email: string | null
}

type FormState = { kind: "create" } | { kind: "edit"; supplier: Supplier } | null

async function fetchSuppliers(): Promise<Supplier[]> {
  if (env.EXPO_PUBLIC_OFFLINE_MODE) return listLocalSuppliers()
  const json = await apiJson<{ suppliers: Supplier[] }>("/api/suppliers")
  return json.suppliers
}

export default function Suppliers() {
  const theme = useTheme()
  const can = useCan()
  const canManage = can("suppliers.manage")
  const canView = can("products.view") || canManage
  const canCreate = canManage || can("stock.receive") || can("products.create")

  const q = useQuery(canView ? "suppliers" : null, fetchSuppliers)
  const suppliers = q.data ?? []

  const [form, setForm] = useState<FormState>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [nameError, setNameError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const phoneRef = useRef<TextInput>(null)
  const emailRef = useRef<TextInput>(null)

  if (!canView) {
    return (
      <Screen>
        <ScreenHeader title="Suppliers" />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={32} color={theme.textTertiary} />}
          title="No access"
          message="You don't have access to suppliers. Ask the owner to turn on “Browse products & inventory” for your role."
        />
      </Screen>
    )
  }

  function openForm(next: Exclude<FormState, null>) {
    const s = next.kind === "edit" ? next.supplier : null
    setName(s?.name ?? "")
    setPhone(s?.phone ?? "")
    setEmail(s?.email ?? "")
    setNameError(null)
    setFormError(null)
    setForm(next)
  }

  async function submit() {
    if (!form || submitting) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError("Supplier name is required")
      return
    }
    setNameError(null)
    setFormError(null)
    setSubmitting(true)
    try {
      if (form.kind === "create") {
        if (env.EXPO_PUBLIC_OFFLINE_MODE) {
          await createLocalSupplier({ name: trimmedName, phone: phone.trim() || null, email: email.trim() || null })
        } else {
          await apiJson("/api/suppliers", {
            method: "POST",
            body: { name: trimmedName, phone: phone.trim() || undefined, email: email.trim() || undefined },
          })
        }
        toast.success(`Added “${trimmedName}”`)
      } else {
        const id = form.supplier.id
        if (env.EXPO_PUBLIC_OFFLINE_MODE) {
          await updateLocalSupplier(id, { name: trimmedName, phone: phone.trim() || null, email: email.trim() || null })
        } else {
          // "" clears phone/email server-side (see the PATCH handler).
          await apiJson(`/api/suppliers/${id}`, { method: "PATCH", body: { name: trimmedName, phone: phone.trim(), email: email.trim() } })
        }
        toast.success("Supplier saved")
      }
      setForm(null)
      q.refresh()
    } catch (err) {
      setFormError(errorMessage(err, "Couldn't save the supplier. Please try again."))
    } finally {
      setSubmitting(false)
    }
  }

  const subtitle = q.data ? `${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"}` : null

  let body
  if (q.loading) {
    body = <SkeletonList rows={8} />
  } else if (q.error && !q.data) {
    body = <ErrorState message={q.error} onRetry={q.retry} />
  } else {
    body = (
      <FlashList keyboardShouldPersistTaps="handled"
        data={suppliers}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={theme.green} colors={[theme.green]} />}
        ListHeaderComponent={q.error ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const contact = [item.phone, item.email].filter(Boolean).join(" · ")
          return (
            <ListRow
              title={item.name}
              subtitle={contact || "No contact details"}
              leading={<Ionicons name="business-outline" size={22} color={theme.textSecondary} />}
              onPress={canManage ? () => openForm({ kind: "edit", supplier: item }) : undefined}
              accessibilityLabel={`${item.name}${contact ? `, ${contact}` : ""}`}
              accessibilityHint={canManage ? "Edit supplier" : undefined}
              trailing={canManage ? <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} /> : null}
            />
          )
        }}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="business-outline" size={32} color={theme.textTertiary} />}
            title="No suppliers yet"
            message="Add the wholesalers you buy from so you can pick them when receiving stock."
            action={canCreate ? { label: "Add supplier", onPress: () => openForm({ kind: "create" }) } : undefined}
          />
        }
      />
    )
  }

  return (
    <Screen>
      <ScreenHeader
        title="Suppliers"
        subtitle={subtitle}
        right={
          canCreate ? (
            <IconButton icon="add" variant="filled" accessibilityLabel="Add supplier" onPress={() => openForm({ kind: "create" })} />
          ) : null
        }
      />
      <View style={styles.flex}>{body}</View>

      <Sheet
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.kind === "edit" ? "Edit supplier" : "New supplier"}
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
          label="Supplier name"
          placeholder="e.g. Harleys Ltd"
          value={name}
          onChangeText={(v) => {
            setName(v)
            if (nameError) setNameError(null)
          }}
          maxLength={120}
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => phoneRef.current?.focus()}
          error={nameError}
        />
        <TextField
          inSheet
          ref={phoneRef}
          label="Phone (optional)"
          placeholder="07…"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={40}
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <TextField
          inSheet
          ref={emailRef}
          label="Email (optional)"
          placeholder="orders@supplier.co.ke"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={120}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        {formError ? (
          <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
            {formError}
          </Text>
        ) : null}
      </Sheet>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { paddingBottom: space.xxl },
  footerRow: { flexDirection: "row", gap: space.sm },
})
