import type { PlanCode } from "@pharmatrack/core"

// Single source for marketing copy that appears in more than one place — the
// visible page AND the JSON-LD Google reads. Keep claims true to what ships:
// no eTIMS/SHA (Phase 8), no SMS reminders (not switched on).

/** Monthly prices in KES. `null` = quoted per customer. */
export const PLAN_PRICE_KES: Record<PlanCode, number | null> = {
  starter: 1500,
  growth: 4500,
  enterprise: null,
}

/** How many medicines the shared catalogue starts with (curated KEML + PPB register). */
export const CATALOGUE_SIZE_LABEL = "3,800+"

export const FAQ: { q: string; a: string }[] = [
  {
    q: "How long does setup take?",
    a: `Most pharmacies are selling the same day. Pick your medicines from the built-in catalogue of ${CATALOGUE_SIZE_LABEL} products — including the PPB register — or import your old system's Excel export, set prices and opening stock, and you're live.`,
  },
  {
    q: "Can I bring my products over from my old system?",
    a: "Yes. Upload the Excel (.xlsx) or CSV export from your current system — up to 2,000 rows at a time. Columns are matched automatically, products are recognised against the catalogue to fill in generic names and prescription flags, duplicates are skipped, and you see a preview before anything is created.",
  },
  {
    q: "Does it really work offline?",
    a: "Yes — for the whole trading day. Each till keeps your branch's products, prices and its share of the stock on the device, so search, scanning and selling all work with no internet from opening to closing. Sales send themselves when the connection returns (each one only once); a till just needs to connect once before midnight, and a manager can extend that to noon the next day.",
  },
  {
    q: "What devices does it run on?",
    a: "An Android app for phones and tablets, a Windows app for the counter PC, and any modern web browser. All three sell offline. Barcode scanners that type into the screen work out of the box.",
  },
  {
    q: "Is M-Pesa included?",
    a: "Yes. Every plan records M-Pesa, cash, card and split payments at the till. On Growth and above, STK Push sends the payment prompt straight to the customer's phone and the money lands in your own till or paybill.",
  },
  {
    q: "Can I run more than one branch?",
    a: "Yes. Growth covers up to three branches and Enterprise is unlimited, each with its own stock, staff and reports. Owners and managers switch between branches; cashiers stay on their own.",
  },
  {
    q: "Does it help with PPB compliance?",
    a: "Products marked as controlled write to the controlled-substances register on every sale — pharmacist, prescriber, patient, quantity and batch — ready to export as PDF or CSV for an inspection.",
  },
  {
    q: "Can I get my data out?",
    a: "Any time. Export your products, prices and stock to Excel or CSV from the Products page, and every report exports to CSV.",
  },
]
