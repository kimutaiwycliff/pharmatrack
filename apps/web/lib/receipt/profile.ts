import { eq } from "drizzle-orm"
import { dbAdmin, organization, org_settings } from "@pharmatrack/db"
import { receiptProfileFrom, type ReceiptProfile } from "@pharmatrack/core"

/** The organisation's receipt branding (Settings → Receipt + Organization). */
export async function loadReceiptProfile(organizationId: string): Promise<ReceiptProfile> {
  const db = dbAdmin()
  const [org] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, organizationId)).limit(1)
  const [row] = await db.select({ settings: org_settings.settings }).from(org_settings).where(eq(org_settings.organization_id, organizationId)).limit(1)
  return receiptProfileFrom(org?.name ?? "Pharmacy", row?.settings)
}
