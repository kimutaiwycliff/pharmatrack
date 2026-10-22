import { eq } from "drizzle-orm"
import { category, type DrizzleDB } from "@pharmatrack/db"
import { findTaxonomyEntry, taxonomyKey } from "@pharmatrack/core"

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * A default category (packages/core taxonomy key, e.g. "pain-fever/gout") →
 * this pharmacy's own category id, creating the department and subcategory
 * only now, the first time a product uses them. Existing rows are reused:
 * first by their default_key (so renames are respected), then by name — a
 * same-named category the pharmacy already has just gets linked. Nothing else
 * in the pharmacy's categories changes. Null for an unknown key.
 * Runs inside the caller's tenant transaction.
 */
export async function resolveDefaultCategory(db: DrizzleDB, organizationId: string, key: string): Promise<string | null> {
  const entry = findTaxonomyEntry(key)
  if (!entry) return null
  const parentKey = taxonomyKey(entry.category)
  const rows = await db.select({ id: category.id, name: category.name, parent_id: category.parent_id, default_key: category.default_key }).from(category)

  const leaf = rows.find((r) => r.default_key === key)
  if (leaf) return leaf.id

  let parent = rows.find((r) => r.default_key === parentKey) ?? rows.find((r) => !r.parent_id && same(r.name, entry.category))
  if (!parent) {
    const [ins] = await db.insert(category).values({ organization_id: organizationId, name: entry.category, default_key: parentKey })
      .returning({ id: category.id, name: category.name, parent_id: category.parent_id, default_key: category.default_key })
    parent = ins!
  } else if (!parent.default_key) {
    await db.update(category).set({ default_key: parentKey }).where(eq(category.id, parent.id))
  }

  const child = rows.find((r) => r.parent_id === parent.id && !r.default_key && same(r.name, entry.subcategory))
  if (child) {
    await db.update(category).set({ default_key: key }).where(eq(category.id, child.id))
    return child.id
  }
  const [ins] = await db.insert(category).values({ organization_id: organizationId, name: entry.subcategory, parent_id: parent.id, default_key: key })
    .returning({ id: category.id })
  return ins!.id
}
