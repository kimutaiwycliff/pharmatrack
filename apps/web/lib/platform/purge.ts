import { eq, inArray, sql } from "drizzle-orm"
import { dbAdmin, organization, user } from "@pharmatrack/db"

type AdminDb = ReturnType<typeof dbAdmin>

/**
 * Permanently purge a tenant and ALL its data. Every organization_id-scoped table
 * is FK'd to organization ON DELETE CASCADE, so deleting the organization row
 * wipes branches, products, inventory, sales, customers, subscription + payments,
 * staff_profile, member, invitation, org_settings, tenant_deletion and audit_log.
 *
 * Staff LOGIN accounts belonging SOLELY to this tenant are then removed (cascading
 * their sessions + accounts) so the email is free to sign up again. Platform
 * operators and users who also belong to another org are preserved.
 *
 * Returns the number of freed login accounts. Runs in a single transaction.
 */
export async function purgeTenant(db: AdminDb, orgId: string): Promise<number> {
  let freedAccounts = 0
  await db.transaction(async (tx) => {
    // Accounts solely in this org and not platform operators — computed while the
    // member rows still exist (before the cascading delete).
    const eligible = (await tx.execute(sql`
      SELECT u."id" AS id
      FROM "user" u
      JOIN "member" m ON m."userId" = u."id" AND m."organizationId" = ${orgId}
      WHERE NOT EXISTS (SELECT 1 FROM "member" m2 WHERE m2."userId" = u."id" AND m2."organizationId" <> ${orgId})
        AND NOT EXISTS (SELECT 1 FROM "platform_admin" p WHERE p."user_id" = u."id")
    `)) as unknown as Array<{ id: string }>
    const ids = eligible.map((r) => r.id)

    await tx.delete(organization).where(eq(organization.id, orgId))

    if (ids.length) {
      await tx.delete(user).where(inArray(user.id, ids))
      freedAccounts = ids.length
    }
  })
  return freedAccounts
}
