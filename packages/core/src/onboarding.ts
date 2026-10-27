// ─────────────────────────────────────────────────────────────────────────────
// Setup guide (ADR-019) — the steps that take a new pharmacy from sign-up to
// its first sale, and the optional ones after it. Pure: progress is worked out
// from facts about the pharmacy's real data (never from "mark as done"
// clicks), so it's always right and can't be skipped by accident. Shared by
// the web app and, later, the Android app.
// ─────────────────────────────────────────────────────────────────────────────

/** Facts the server counts for one pharmacy. */
export interface SetupFacts {
  products: number       // active products
  priced: number         // active products with a selling price
  stocked: number        // batches with stock left
  sales: number          // completed sales
  staff: number          // active staff, owner included
  mpesa: boolean         // M-Pesa set up and tested
  receiptLogo: boolean   // a logo on receipts
  devices: number        // registered tills/computers/phones
}

export type SetupStepKey =
  | "pharmacy" | "products" | "prices" | "stock" | "first_sale"
  | "staff" | "mpesa" | "receipt" | "devices"

export interface SetupStep {
  key: SetupStepKey
  /** Core steps lead to the first sale; the rest make it yours. */
  core: boolean
  title: string
  /** One line on why it matters. */
  why: string
  minutes: number
  action: { label: string; href: string }
  /** The staff guide chapter with screenshots. */
  guide?: string
  done: boolean
  /** e.g. "12 products" — what's there so far. */
  detail?: string
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-KE")} ${n === 1 ? one : many}`

export function setupSteps(f: SetupFacts): SetupStep[] {
  const unpriced = Math.max(0, f.products - f.priced)
  return [
    {
      key: "pharmacy", core: true, title: "Create your pharmacy",
      why: "Your free trial is running and your pharmacy is ready to set up.",
      minutes: 0, action: { label: "Pharmacy details", href: "/settings?tab=org" }, done: true,
    },
    {
      key: "products", core: true, title: "Add your products",
      why: "Pick what you stock from 3,800+ medicines — or import your old system's Excel list.",
      minutes: 4, action: { label: "Add products", href: "/products?quickstart=1" }, guide: "/guide#catalogue",
      done: f.products > 0, detail: f.products > 0 ? plural(f.products, "product") : undefined,
    },
    {
      key: "prices", core: true, title: "Set your prices",
      why: "Products without a selling price can't be sold at the till.",
      minutes: 3, action: { label: "Set prices", href: "/products?needsPrice=1" }, guide: "/guide#products",
      done: f.priced > 0 && unpriced === 0,
      detail: f.products === 0 ? undefined : unpriced > 0 ? `${plural(unpriced, "product")} still need a price` : "All priced",
    },
    {
      key: "stock", core: true, title: "Add your stock",
      why: "Count what's on the shelf with each batch's expiry date, so the till sells the earliest expiry first.",
      minutes: 5, action: { label: "Add stock", href: "/inventory/receive?tour=1" }, guide: "/guide#receiving",
      done: f.stocked > 0, detail: f.stocked > 0 ? plural(f.stocked, "batch", "batches") + " in stock" : undefined,
    },
    {
      key: "first_sale", core: true, title: "Make your first sale",
      why: "Start a shift, sell a product and print the receipt — we'll show you each step.",
      minutes: 2, action: { label: "Open the till", href: "/pos?coach=1" }, guide: "/guide#pos",
      done: f.sales > 0, detail: f.sales > 0 ? plural(f.sales, "sale") : undefined,
    },
    {
      key: "staff", core: false, title: "Invite your staff",
      why: "Each person gets their own sign-in and 4-digit till PIN, so you can see who sold what.",
      minutes: 2, action: { label: "Invite staff", href: "/staff" }, guide: "/guide#roles",
      done: f.staff > 1, detail: f.staff > 1 ? plural(f.staff - 1, "staff member") : undefined,
    },
    {
      key: "mpesa", core: false, title: "Take M-Pesa at the till",
      why: "Send the payment prompt straight to the customer's phone, paid into your own till.",
      minutes: 5, action: { label: "Set up M-Pesa", href: "/settings?tab=payments" },
      done: f.mpesa,
    },
    {
      key: "receipt", core: false, title: "Put your logo on receipts",
      why: "Your name, logo and contact details on every receipt you print or share.",
      minutes: 2, action: { label: "Customise receipts", href: "/settings?tab=receipt" },
      done: f.receiptLogo,
    },
    {
      key: "devices", core: false, title: "Set up your tills to work offline",
      why: "Install the Android or Windows app and keep selling when the internet drops.",
      minutes: 3, action: { label: "Set up a till", href: "/settings?tab=devices" },
      done: f.devices > 0, detail: f.devices > 0 ? plural(f.devices, "device") : undefined,
    },
  ]
}

export interface SetupProgress {
  steps: SetupStep[]
  coreDone: number
  coreTotal: number
  /** All core steps done — the pharmacy has made its first sale. */
  ready: boolean
  /** The step to nudge them to now (first core step not done, else first optional). */
  next: SetupStepKey | null
  minutesLeft: number
}

export function setupProgress(f: SetupFacts): SetupProgress {
  const steps = setupSteps(f)
  const core = steps.filter((s) => s.core)
  const coreDone = core.filter((s) => s.done).length
  const next = core.find((s) => !s.done) ?? steps.find((s) => !s.core && !s.done) ?? null
  return {
    steps,
    coreDone,
    coreTotal: core.length,
    ready: coreDone === core.length,
    next: next?.key ?? null,
    minutesLeft: core.filter((s) => !s.done).reduce((m, s) => m + s.minutes, 0),
  }
}
