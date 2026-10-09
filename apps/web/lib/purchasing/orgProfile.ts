import { eq } from "drizzle-orm"
import { dbAdmin, organization, org_settings } from "@pharmatrack/db"
import type { PoPdfOrg } from "@/components/purchasing/PurchaseOrderPDF"

/** Letterhead details for documents (name + org_settings profile fields). */
export async function loadOrgProfile(organizationId: string): Promise<PoPdfOrg> {
  const db = dbAdmin()
  const [org] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, organizationId)).limit(1)
  const [row] = await db.select({ settings: org_settings.settings }).from(org_settings).where(eq(org_settings.organization_id, organizationId)).limit(1)
  const s = (row?.settings ?? {}) as Record<string, string | undefined>
  return {
    name: org?.name ?? "Pharmacy",
    registration_number: s.registration_number ?? null,
    phone: s.phone ?? null,
    email: s.email ?? null,
    address: s.address ?? null,
  }
}
