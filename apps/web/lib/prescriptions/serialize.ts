import { desc, eq, inArray, and, type SQL } from "drizzle-orm"
import { prescription, prescription_item, customer, type DrizzleDB } from "@pharmatrack/db"

const rxCols = {
  rx: prescription,
  c_id: customer.id, c_name: customer.full_name, c_phone: customer.phone, c_allergies: customer.allergies,
}

function shape(r: { rx: typeof prescription.$inferSelect; c_id: string | null; c_name: string | null; c_phone: string | null; c_allergies: string | null }, items: (typeof prescription_item.$inferSelect)[]) {
  return {
    ...r.rx,
    customer: r.c_id ? { id: r.c_id, full_name: r.c_name, phone: r.c_phone, allergies: r.c_allergies } : null,
    items,
  }
}

export async function fetchPrescriptions(db: DrizzleDB, where: SQL | undefined, limit = 100) {
  const rows = await db.select(rxCols).from(prescription)
    .leftJoin(customer, eq(customer.id, prescription.customer_id))
    .where(where).orderBy(desc(prescription.created_at)).limit(limit)
  const ids = rows.map((r) => r.rx.id)
  const items = ids.length ? await db.select().from(prescription_item).where(inArray(prescription_item.prescription_id, ids)) : []
  const byRx: Record<string, (typeof prescription_item.$inferSelect)[]> = {}
  for (const it of items) (byRx[it.prescription_id] ??= []).push(it)
  return rows.map((r) => shape(r, byRx[r.rx.id] ?? []))
}

export async function fetchPrescription(db: DrizzleDB, id: string) {
  const list = await fetchPrescriptions(db, eq(prescription.id, id), 1)
  return list[0] ?? null
}
