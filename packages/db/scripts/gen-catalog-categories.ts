/**
 * Writes infra/migrations/037_drug_catalog_default_categories.sql: every shared
 * catalogue row placed in the default categories (packages/core/src/catalog/taxonomy.ts).
 *
 *   PPB rows      classified from the raw register (trade name, INN, dosage form)
 *                 in packages/db/data/ppb/retained-products.csv, keyed by registration no.
 *   curated rows  classified from name + brand + generic + form; rows the rules
 *                 can't place keep their hand-curated department, mapped across.
 *
 * Reads the catalogue as it stands after migration 035 (curated rows aren't in
 * a data file). The down migration restores the previous values exactly.
 *
 * Usage: DATABASE_URL=postgres://… pnpm --filter @pharmatrack/db exec tsx scripts/gen-catalog-categories.ts
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import postgres from "postgres"
import { suggestCategory } from "../../core/src/catalog/taxonomy"

const ROOT = path.resolve(__dirname, "../../..")
const CSV = path.join(ROOT, "packages/db/data/ppb/retained-products.csv")
const OUT = path.join(ROOT, "infra/migrations/037_drug_catalog_default_categories.sql")

// The old hand-curated departments → the closest default, for curated rows the rules miss.
const OLD_TO_NEW: Record<string, [string, string] | null> = {
  "Antacids & GI": ["Stomach & Digestion", "Antacids & heartburn"],
  "Antibiotics & Antifungals": ["Antibiotics & Infections", "Urinary & other antibiotics"],
  "Antiparasitics": ["Malaria & Parasites", "Dewormers"],
  "Cardiovascular & Metabolic": ["Heart & Blood Pressure", "Blood pressure"],
  "Contraceptives": ["Women's Health", "Contraceptive pills"],
  "Cough & Cold": ["Cough, Cold & Allergy", "Cough syrups"],
  "Eye & Ear Drops": ["Eye & Ear Care", "Eye allergy & inflammation"],
  "Injections & Misc": ["Hospital & Specialist", "Other injectables"],
  "Pain & Anti-inflammatory": ["Pain & Fever", "Paracetamol & combinations"],
  "Psychiatric Medications": ["Brain & Mental Health", "Depression & anxiety"],
  "Respiratory": ["Asthma & Respiratory", "Asthma tablets & syrups"],
  "Topicals": ["Skin Care", "Medicated skin care"],
  "Vitamins & Supplements": ["Vitamins & Supplements", "Multivitamins"],
  "Misc": null,
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = [], cur = "", q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c
    } else if (c === '"') q = true
    else if (c === ",") { row.push(cur); cur = "" }
    else if (c === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = "" }
    else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  const [head, ...body] = rows
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head!.map((h, i) => [h, r[i] ?? ""])))
}

const lit = (v: string | null | undefined) => (v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`)

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("Set DATABASE_URL to a database migrated to 035")
  const sql = postgres(url, { max: 1 })
  const ppbRaw = new Map(parseCsv(readFileSync(CSV, "utf8")).map((r) => [r.registration_no!, r]))
  const ppb = await sql<{ reg: string; category: string | null; subcategory: string | null }[]>`
    SELECT ppb_registration_no AS reg, category, subcategory FROM drug_catalog WHERE source = 'ppb' AND ppb_registration_no IS NOT NULL ORDER BY 1`
  const curated = await sql<{ name: string; strength: string | null; dosage_form: string | null; generic_name: string | null; brand_name: string | null; category: string | null; subcategory: string | null }[]>`
    SELECT name, strength, dosage_form, generic_name, brand_name, category, subcategory FROM drug_catalog WHERE source = 'curated' ORDER BY name, strength, dosage_form`
  await sql.end()

  const stats = { ppb: 0, ppbMiss: 0, curated: 0, curatedFallback: 0, curatedMiss: 0 }
  const ppbUp: string[] = [], ppbDown: string[] = []
  for (const r of ppb) {
    const raw = ppbRaw.get(r.reg)
    const s = raw ? suggestCategory({ name: raw.trade_name, generic: raw.inn, dosageForm: raw.dosage_form }) : null
    if (s) stats.ppb++; else stats.ppbMiss++
    ppbUp.push(`(${lit(r.reg)}, ${lit(s?.category)}, ${lit(s?.subcategory)})`)
    ppbDown.push(`(${lit(r.reg)}, ${lit(r.category)}, ${lit(r.subcategory)})`)
  }
  const curUp: string[] = [], curDown: string[] = []
  for (const r of curated) {
    const s = suggestCategory({ name: [r.name, r.brand_name].filter(Boolean).join(" "), generic: r.generic_name, dosageForm: r.dosage_form })
    let pair: [string, string] | null = s ? [s.category, s.subcategory] : null
    if (pair) stats.curated++
    else if (r.category && OLD_TO_NEW[r.category]) { pair = OLD_TO_NEW[r.category]!; stats.curatedFallback++ }
    else stats.curatedMiss++
    const key = `${lit(r.name)}, ${lit(r.strength)}, ${lit(r.dosage_form)}`
    curUp.push(`(${key}, ${lit(pair?.[0])}, ${lit(pair?.[1])})`)
    curDown.push(`(${key}, ${lit(r.category)}, ${lit(r.subcategory)})`)
  }

  const ppbUpdate = (rows: string[]) => `UPDATE drug_catalog d SET category = v.category, subcategory = v.subcategory
FROM (VALUES
${rows.join(",\n")}
) AS v(reg, category, subcategory)
WHERE d.source = 'ppb' AND d.ppb_registration_no = v.reg;`
  const curUpdate = (rows: string[]) => `UPDATE drug_catalog d SET category = v.category, subcategory = v.subcategory
FROM (VALUES
${rows.join(",\n")}
) AS v(name, strength, dosage_form, category, subcategory)
WHERE d.source = 'curated' AND d.name = v.name AND d.strength IS NOT DISTINCT FROM v.strength AND d.dosage_form IS NOT DISTINCT FROM v.dosage_form;`

  writeFileSync(OUT, `-- migrate:up
-- GENERATED by packages/db/scripts/gen-catalog-categories.ts — regenerate, don't hand-edit.
-- Shared catalogue → the default categories (packages/core/src/catalog/taxonomy.ts).
-- PPB: ${stats.ppb} placed, ${stats.ppbMiss} left uncategorised. Curated: ${stats.curated} by rule,
-- ${stats.curatedFallback} from their old department, ${stats.curatedMiss} uncategorised.
-- Pharmacies' own categories and products are not touched.

${ppbUpdate(ppbUp)}

${curUpdate(curUp)}

-- migrate:down
-- Restores the previous categories exactly.

${ppbUpdate(ppbDown)}

${curUpdate(curDown)}
`)
  console.log(stats, "→", path.relative(ROOT, OUT))
}

void main().catch((e) => { console.error(e); process.exit(1) })
