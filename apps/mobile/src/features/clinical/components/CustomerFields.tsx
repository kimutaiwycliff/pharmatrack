import Ionicons from "@expo/vector-icons/Ionicons"
import { StyleSheet, View } from "react-native"
import { Button, ListRow, Text, TextField } from "../../../components"
import { useTheme } from "../../../theme/useTheme"
import { radius, space } from "../../../theme/tokens"
import { useCustomerSearch } from "../hooks"
import type { CustomerHit } from "../types"

export interface CustomerValue {
  /** Set once an existing customer is picked; typing in name/phone clears it (web behaviour). */
  customerId?: string
  name: string
  phone: string
  email: string
}

interface CustomerFieldsProps {
  value: CustomerValue
  onChange: (patch: Partial<CustomerValue>) => void
  onPick: (c: CustomerHit) => void
  nameLabel: string
  showEmail?: boolean
  errors?: { name?: string; phone?: string; email?: string }
}

// Name + phone (+ email) with existing-customer suggestions underneath, like
// the autocomplete in web's BookAppointmentDialog / NewPrescriptionDialog:
// pick one to reuse the record, or keep typing to create a new customer.
export function CustomerFields({ value, onChange, onPick, nameLabel, showEmail, errors }: CustomerFieldsProps) {
  const theme = useTheme()
  const hits = useCustomerSearch(value.name || value.phone, !value.customerId)

  return (
    <View style={styles.wrap}>
      <TextField
        label={nameLabel}
        value={value.name}
        onChangeText={(name) => onChange({ name, customerId: undefined })}
        placeholder="e.g. Jane Wanjiku"
        autoCapitalize="words"
        error={errors?.name}
      />
      {hits.length > 0 ? (
        <View style={[styles.hits, { borderColor: theme.border, backgroundColor: theme.surface }]} accessibilityLabel="Existing customers">
          <Text variant="caption" tone="secondary" style={styles.hitsTitle}>
            Existing customers
          </Text>
          {hits.slice(0, 5).map((c) => (
            <ListRow
              key={c.id}
              title={c.full_name}
              subtitle={c.phone ?? c.email ?? null}
              leading={<Ionicons name="person-circle-outline" size={24} color={theme.textSecondary} />}
              onPress={() => onPick(c)}
              accessibilityLabel={`Use existing customer ${c.full_name}${c.phone ? `, ${c.phone}` : ""}`}
            />
          ))}
        </View>
      ) : null}
      {value.customerId ? (
        <View style={[styles.picked, { backgroundColor: theme.green50 }]}>
          <Ionicons name="checkmark-circle" size={18} color={theme.green600} />
          <Text variant="caption" tone="success" style={styles.flex}>
            Using the existing customer record
          </Text>
          <Button title="New instead" size="sm" variant="ghost" onPress={() => onChange({ customerId: undefined })} />
        </View>
      ) : null}
      <TextField
        label="Phone (optional)"
        value={value.phone}
        onChangeText={(phone) => onChange({ phone, customerId: undefined })}
        placeholder="07XX XXX XXX"
        keyboardType="phone-pad"
        error={errors?.phone}
      />
      {showEmail ? (
        <TextField
          label="Email (optional)"
          value={value.email}
          onChangeText={(email) => onChange({ email })}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          error={errors?.email}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  hits: { borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  hitsTitle: { paddingHorizontal: space.lg, paddingTop: space.sm },
  picked: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.md, paddingLeft: space.md },
})
