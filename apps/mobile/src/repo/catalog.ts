import { eq } from "drizzle-orm"
import * as Crypto from "expo-crypto"
import { db } from "../db/database"
import { categories, suppliers } from "../db/schema"

// ADR-014 — local repo for Categories/Suppliers screens. Return shapes match
// the ONLINE app's API responses field-for-field (snake_case `parent_id`
// etc.) so the screens' existing state/JSX need no remapping — only the
// apiFetch call sites are swapped for these.

export interface CategoryDTO {
  id: string
  name: string
  parent_id: string | null
}

export async function listLocalCategories(): Promise<CategoryDTO[]> {
  const rows = await db.select().from(categories)
  return rows.map((r) => ({ id: r.id, name: r.name, parent_id: r.parentId }))
}

export async function createLocalCategory(name: string, parentId: string | null): Promise<CategoryDTO> {
  const id = Crypto.randomUUID()
  await db.insert(categories).values({ id, name, parentId })
  return { id, name, parent_id: parentId }
}

export async function updateLocalCategory(id: string, name: string): Promise<void> {
  await db.update(categories).set({ name }).where(eq(categories.id, id))
}

export async function deleteLocalCategory(id: string): Promise<void> {
  await db.delete(categories).where(eq(categories.id, id))
}

export interface SupplierDTO {
  id: string
  name: string
  phone: string | null
  email: string | null
}

export async function listLocalSuppliers(): Promise<SupplierDTO[]> {
  return db.select().from(suppliers)
}

export async function createLocalSupplier(input: { name: string; phone?: string | null; email?: string | null }): Promise<SupplierDTO> {
  const id = Crypto.randomUUID()
  const row = { id, name: input.name, phone: input.phone ?? null, email: input.email ?? null }
  await db.insert(suppliers).values(row)
  return row
}

export async function updateLocalSupplier(id: string, input: { name: string; phone?: string | null; email?: string | null }): Promise<void> {
  await db.update(suppliers).set({ name: input.name, phone: input.phone ?? null, email: input.email ?? null }).where(eq(suppliers.id, id))
}
