import type { supplier } from "@pharmatrack/db"

type SupplierRow = typeof supplier.$inferSelect

// The new supplier schema dropped address + is_active. The UI + @pharmatrack/types
// Supplier still expect them, so synthesize (address null, always active).
export function serializeSupplier(row: SupplierRow) {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: null as string | null,
    is_active: true,
    created_at: row.created_at,
  }
}
