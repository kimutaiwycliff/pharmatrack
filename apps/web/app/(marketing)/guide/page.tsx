import type { Metadata } from "next"
import { Fragment } from "react"
import { GuideGallery, type GuideShot } from "@/components/marketing/GuideGallery"

export const metadata: Metadata = {
  title: "Staff Guide",
  description: "A screenshot-driven walkthrough of PharmaTrack — from signup to selling, receiving stock, appointments, reports, and staff roles.",
  alternates: { canonical: "/guide" },
}

// Turns "**bold**" markers into <strong> without dangerouslySetInnerHTML.
function fmt(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-[var(--pt-text)]">{part.slice(2, -2)}</strong>
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

function shot(file: string, caption: string, w = 1600, h = 907): GuideShot {
  return { src: `/guide/${file}`, width: w, height: h, caption }
}

interface Chapter {
  id: string
  num: string
  title: string
  intro: string
  steps: string[]
  tip?: { kind: "tip" | "note"; text: string }
  shots: GuideShot[]
}

const CHAPTERS: Chapter[] = [
  {
    id: "start", num: "01", title: "Create your pharmacy",
    intro: "Everything starts at **pharmatrack.co.ke/signup**. No sales call, no setup fee — you're selling within minutes of finishing this page.",
    steps: [
      "Go to **pharmatrack.co.ke** and click **Start free trial**.",
      "Enter your pharmacy's name, your own name, a work email, and a password.",
      "We email a 6-digit code to that address — enter it to confirm you own the inbox.",
      "Click **Create account & start trial**. Your organization, a Main Branch, and a 14-day trial are created in the same step — you're signed in immediately.",
    ],
    tip: { kind: "tip", text: "The 14-day trial unlocks every Growth-tier feature — M-Pesa STK push, appointments, prescriptions, reports — regardless of which plan you end up billed on. Use the trial to actually try everything, not just the basics." },
    shots: [
      shot("01-signup.jpg", "The signup form — pharmacy name, your name, work email, password.", 1600, 1245),
      shot("02-signup-otp.jpg", "A 6-digit code confirms the email address before the account is created.", 1600, 1062),
    ],
  },
  {
    id: "dashboard", num: "02", title: "Find your way around",
    intro: "You land on the **Dashboard** — today's numbers at a glance, and the same left-hand menu follows you everywhere. It's short on purpose: cashiers and pharmacists see only what their role needs.",
    steps: [
      "The sidebar lists every section you have access to — it changes per role (more on that at the end of this page).",
      "The top bar always shows your current branch, a shift indicator, and a light/dark theme toggle.",
      "On day one the dashboard is empty. Once you've sold something, it fills in on its own — no refresh needed.",
    ],
    shots: [
      shot("03-dashboard-empty.jpg", "A brand-new pharmacy: zero revenue, zero transactions, ready to go."),
      shot("03-dashboard-populated.jpg", "The same dashboard after a morning of sales — revenue, basket size, M-Pesa share, top products, recent receipts."),
    ],
  },
  {
    id: "catalogue", num: "03", title: "Build your catalogue",
    intro: "You don't type in products one at a time. **Inventory → Quick Start** loads a real, pre-priced Kenyan pharmacy catalogue by department — pick what you stock, everything else stays out of your way.",
    steps: [
      "Open **Inventory** and click **Quick Start** on the banner.",
      "Tick the departments you actually stock — Antibiotics, Pain & Anti-inflammatory, Cough & Cold, and so on.",
      "Click **Load N products**. They're created active, with reference cost and sell prices already filled in.",
      "A **Price & stock** review opens so you can tune any price before it goes live — skip it and adjust later from the Products page if you'd rather.",
      "For anything the catalogue doesn't cover, use **Add Product** on the Products page instead.",
    ],
    tip: { kind: "tip", text: "Cost price and margin only show for Owner and Manager accounts. A pharmacist or cashier opening the same product sees name, strength, and sell price — never what you paid for it." },
    shots: [
      shot("05-catalog-quickstart-dialog.jpg", "Quick Start — 14 departments, each showing how many products it will add."),
      shot("05-catalog-price-review.jpg", "Reference cost, sell price, and margin per product, ready to tune before going live."),
      shot("06-products-list.jpg", "The Products catalogue after loading three departments — 137 SKUs, searchable and filterable by category."),
    ],
  },
  {
    id: "products", num: "04", title: "Fix up one product",
    intro: "Every product opens into the same detail sheet, whether it came from Quick Start or you added it by hand. This is also where you attach a real barcode.",
    steps: [
      "Click **Edit** on any product row.",
      "Fill in brand, strength, dosage form, category, supplier, pack size, and pricing.",
      "Next to **GTIN / Barcode**, click the scan icon and point your camera at the actual box — no more typing 13 digits by hand.",
      "Toggle **Requires prescription** or **Controlled substance** where the law requires it — this feeds the PPB register automatically later.",
    ],
    shots: [shot("06-edit-product-sheet.jpg", "Full product detail — identity, category, supplier, pricing, regulatory flags, pack sizes.")],
  },
  {
    id: "receiving", num: "05", title: "Receive real stock",
    intro: "Loading the catalogue only creates products — zero units on the shelf. Stock arrives through **Stock Receive**, batch by batch, exactly the way a delivery note works.",
    steps: [
      "Open **Stock Receive**. Scan the barcode on the box, or search the product by name.",
      "A GS1 DataMatrix (the small square barcode) auto-fills batch number and expiry date. A plain barcode only gives you the product — type the rest in.",
      "Enter the batch number, expiry date, quantity, and what you paid per pack.",
      "Click **Add to receiving list** and repeat for the rest of the delivery.",
      "Click **Post Receiving** once — every batch lands in stock together.",
    ],
    tip: { kind: "tip", text: "PharmaTrack always sells the earliest-expiring batch first (FEFO) — you never have to think about which batch a sale should come from. It's handled automatically at the till." },
    shots: [
      shot("07-receive-stock-search.jpg", "Searching by name surfaces every matching product with its current stock level."),
      shot("07-receive-stock-form.jpg", "Batch number, expiry date, quantity, and cost per pack for the selected product."),
      shot("07-receive-stock-list.jpg", "Three products queued in one delivery, with a running total value before posting."),
    ],
  },
  {
    id: "inventory", num: "06", title: "Keep an eye on stock",
    intro: "The Inventory list is the day-to-day view: what's in stock, what's low, what's expiring. Click into any product to see its batches individually.",
    steps: [
      "Filter by **Out of stock**, **Low stock**, **Expiring**, or **Controlled** using the pills above the table.",
      "Click the batch count on any row to open its full batch history — expiry, cost, quantity remaining, and a progress bar per batch.",
      "From there you can edit a batch's details, adjust stock (count correction, damage, theft, expiry write-off), or view the adjustment history.",
    ],
    shots: [
      shot("08-inventory-list-filtered.jpg", "Amoxicillin 250mg after receiving — 200 units in stock, one batch, expiring December 2027."),
      shot("09-batches-sheet.jpg", "One product's batch detail — cost per unit, received date, and remaining stock against what came in."),
    ],
  },
  {
    id: "pos", num: "07", title: "Sell at the till",
    intro: "This is where staff spend most of their day. Clock in with an opening float, ring up a sale, take payment, print or PDF the receipt.",
    steps: [
      "Open **POS Terminal**. On the first sale of the day you're asked for an **opening float** — the cash you're starting the till with.",
      "Scan a barcode, use a USB keyboard-wedge scanner, or search by name to add items to the cart.",
      "Adjust quantity or apply a per-line discount — capped automatically at whatever **Max discount %** that product allows.",
      "Choose **Cash**, **M-Pesa**, or **Split**. Cash shows change due instantly from quick-tender buttons (500 / 1k / 2k / 5k).",
      "For M-Pesa: send an STK push to the customer's phone if it's configured, or confirm manually once you've seen the payment — the transaction code is optional.",
      "The receipt is ready to print or save as a PDF the moment payment clears.",
    ],
    tip: { kind: "tip", text: "STK push (the prompt that pops up on the customer's own phone) only appears once you've added your Till or Paybill number under Settings → Payments. Until then, POS quietly falls back to manual confirm — nothing breaks, it just asks for a transaction code instead." },
    shots: [
      shot("11-pos-search.jpg", "Searching “Paracetamol” surfaces every matching pack size with live stock counts."),
      shot("11-pos-cart.jpg", "Two items in the cart, running subtotal and total, three payment methods ready."),
      shot("11-pos-cash-modal.jpg", "Cash payment — tap a quick-tender amount, change due calculates itself."),
      shot("11-pos-mpesa-modal.jpg", "M-Pesa manual confirm — for a customer who paid via Till or Paybill on their own phone."),
      shot("11-pos-receipt.jpg", "A completed sale — receipt number, itemized total, payment method, change given."),
    ],
  },
  {
    id: "shifts", num: "08", title: "Close out a shift",
    intro: "Every till session is a shift: an opening float, a closing count, and whatever variance falls out between them.",
    steps: [
      "Click **End Shift** in the POS header whenever you're done.",
      "Count the cash drawer and enter it as the **closing cash count**.",
      "PharmaTrack shows the variance immediately — over or short — against the opening float and what was actually taken.",
      "Every past shift lives under **Shifts**: who worked it, how long, how many sales, and the variance, filterable by date.",
    ],
    shots: [
      shot("10-shift-clockin.jpg", "Clocking in — every till session starts with an opening cash float."),
      shot("10-shift-clockout.jpg", "Ending a shift — count the drawer, and the variance appears before you confirm."),
      shot("10-shifts-history.jpg", "Shift history — staff member, duration, sales total, and variance, all in one table."),
    ],
  },
  {
    id: "appointments", num: "09", title: "Book appointments",
    intro: "Depo-Provera refills, vaccinations, consultations — anything that brings a customer back on a schedule. PharmaTrack tracks the customer, the service, and sends the reminder for you.",
    steps: [
      "Click **Book appointment** and start typing a customer's name — existing customers autocomplete.",
      "Pick a service. Recurring ones (like Depo-Provera, every 12 weeks) will suggest the next booking automatically once this one's done.",
      "Set the date, time, branch, and who it's assigned to.",
      "Leave **Send appointment reminders** on and a WhatsApp or SMS goes out the day before — to the customer, and an SMS to the assigned staff member.",
    ],
    tip: { kind: "tip", text: "Manage the list of bookable services yourself under Settings → Services — add whatever your pharmacy offers and set a recurrence interval for anything that repeats." },
    shots: [
      shot("13-appointment-book-dialog.jpg", "Booking a Family Planning appointment — customer, service, date/time, and reminder toggle."),
      shot("13-appointments-upcoming.jpg", "The Upcoming tab — tap Confirm, Complete, No-show, or Cancel as the day plays out."),
    ],
  },
  {
    id: "prescriptions", num: "10", title: "Record a prescription",
    intro: "A dispensing record with the patient, the prescriber, and every drug on the script — checked against known interactions before you hand anything over.",
    steps: [
      "Click **New prescription**. Search for an existing customer or type in a new patient's details.",
      "Add the prescriber's name and registration number, and the diagnosis if you want it on file.",
      "Add each drug with its dose, frequency, duration, and quantity — **Add drug** for more than one item.",
      "PharmaTrack cross-checks the drugs against a drug-interaction reference and flags anything contraindicated, major, or moderate before you save.",
      "Mark it **Complete** once it's been dispensed — it's linked back to the sale for a full audit trail.",
    ],
    shots: [
      shot("14-prescription-form.jpg", "A new prescription — patient, prescriber, and medication with dose, frequency, and quantity."),
      shot("14-prescriptions-list.jpg", "Active prescriptions — mark Complete once dispensed, or Cancel if it wasn't filled."),
    ],
  },
  {
    id: "reports", num: "11", title: "Read your numbers",
    intro: "Three reports, one date-range picker: **Sales**, **Inventory**, and **Financial**. Every number lines up to Africa/Nairobi time, and every table exports to CSV.",
    steps: [
      "**Sales** — revenue, gross profit and margin, the cash/M-Pesa split, top products by revenue and profit, sales by cashier, and the latest 100 transactions.",
      "**Inventory** — every SKU with stock level, reorder threshold, and expiry, filterable by out-of-stock, low-stock, expiring, or controlled.",
      "**Financial** — revenue, discounts given, average order value, and a monthly gross-profit trend.",
      "Owners and managers see cost and profit throughout. Pharmacists and cashiers can't open Reports at all — it's not in their menu.",
    ],
    shots: [
      shot("15-reports-sales.jpg", "Sales report — revenue, gross profit, payment split, top products, and per-cashier totals."),
      shot("15-reports-inventory.jpg", "Inventory report — every SKU, stock on hand, reorder level, and expiry status."),
      shot("15-reports-financial.jpg", "Financial report — revenue, discounts, average order value, and monthly trend."),
    ],
  },
  {
    id: "staff", num: "12", title: "Bring your team on",
    intro: "Invite each staff member once, assign a role and a branch, and give them a fast way to sign in at a shared till.",
    steps: [
      "Open **Staff → Invite Staff**. Enter their name, email, phone, and pick a role: Manager, Pharmacist, or Cashier.",
      "They're active immediately — no email confirmation loop to chase.",
      "For a shared till, open the ⋯ menu on their row and **Set Login PIN** — they can then sign in with just their phone number and a 4-digit PIN instead of a full password.",
      "The same menu lets you change their role, resend an invite, suspend, or remove them.",
    ],
    shots: [
      shot("12-staff-list.jpg", "The Staff page — one owner account, ready to grow."),
      shot("12-staff-invite-dialog.jpg", "Inviting a pharmacist — name, email, phone, role, and branch."),
      shot("12-staff-list-full.jpg", "A three-person team: Owner, Pharmacist, and Cashier, each scoped to Main Branch."),
      shot("12-staff-set-pin.jpg", "Setting a 4-digit quick-login PIN for fast sign-in at a shared till."),
    ],
  },
  {
    id: "settings", num: "13", title: "Configure your pharmacy",
    intro: "Everything organization-wide lives under one Settings page, split into tabs.",
    steps: [
      "**Organization** — name, PPB registration number, contact details — these print on every receipt.",
      "**Branches** — add more locations as you grow; each gets its own stock and till.",
      "**Services** — the bookable appointment list, with recurrence intervals for anything repeating.",
      "**Payments** — add your M-Pesa Till or Paybill number and Daraja API credentials to turn on STK push.",
      "**Billing** — your plan, trial countdown, and payment history.",
      "**My Profile** — your own name, phone, password, and PIN.",
      "**Appearance** — light, dark, or match-my-device.",
    ],
    tip: { kind: "note", text: "The Payments tab only appears if your plan includes M-Pesa STK push. During your trial that's everyone — it can disappear later if you settle on the Starter plan, since STK push is a Growth-tier feature." },
    shots: [
      shot("16-settings-org.jpg", "Organization details — name, PPB registration number, contact information."),
      shot("16-settings-payments.jpg", "M-Pesa configuration — Till or Paybill number, Daraja credentials, sandbox or live."),
      shot("16-settings-billing.jpg", "Billing — current plan, trial countdown, and payment history."),
      shot("16-settings-appearance-light.jpg", "Light theme — the whole app, including this Settings page, switches instantly."),
    ],
  },
]

const ROLE_ROWS: [string, boolean, boolean, boolean, boolean][] = [
  ["POS & selling", true, true, true, true],
  ["Dashboard", true, true, true, false],
  ["Inventory, Products, Receiving", true, true, true, false],
  ["Cost price & margin", true, true, false, false],
  ["Appointments & Prescriptions", true, true, true, false],
  ["Shifts & Reports", true, true, false, false],
  ["Staff management", true, true, false, false],
  ["Settings & Billing", true, false, false, false],
]

function Cell({ yes }: { yes: boolean }) {
  return yes
    ? <td className="py-2.5 px-4 text-[var(--pt-green-600)] font-semibold">Yes</td>
    : <td className="py-2.5 px-4 text-[var(--pt-text-tertiary)]">—</td>
}

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
      {/* Hero */}
      <div className="max-w-2xl mb-14">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--pt-green-600)]">A working guide, not a brochure</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-extrabold tracking-tight mt-2 leading-[1.08]">
          Getting started with PharmaTrack
        </h1>
        <p className="mt-4 text-lg text-[var(--pt-text-secondary)]">
          Thirteen short chapters, in the order you&apos;ll actually touch them: sign up, load a catalogue, receive stock,
          sell at the till, and see what came in at the end of the day. Every screenshot below is the real app — click
          any of them to zoom in.
        </p>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--pt-text-secondary)] pt-5 border-t border-[var(--pt-border)]">
          <span><b className="text-[var(--pt-text)] font-semibold">13</b> chapters</span>
          <span><b className="text-[var(--pt-text)] font-semibold">~15 min</b> read</span>
          <span><b className="text-[var(--pt-text)] font-semibold">4</b> staff roles covered</span>
        </div>
      </div>

      {/* Quick nav */}
      <nav aria-label="Chapters" className="mb-16 flex flex-wrap gap-2">
        {CHAPTERS.map((c) => (
          <a
            key={c.id}
            href={`#${c.id}`}
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-[var(--pt-border)] text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] hover:border-[var(--pt-border-strong)] transition-colors"
          >
            {c.num} {c.title}
          </a>
        ))}
        <a href="#roles" className="text-xs font-medium px-3 py-1.5 rounded-full border border-[var(--pt-border)] text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] hover:border-[var(--pt-border-strong)] transition-colors">
          Roles at a glance
        </a>
      </nav>

      {/* Chapters */}
      <div className="space-y-20">
        {CHAPTERS.map((c) => (
          <section key={c.id} id={c.id} className="scroll-mt-24 max-w-3xl">
            <div className="flex items-baseline gap-3 mb-3">
              <span className="font-mono text-sm text-[var(--pt-green-600)]">{c.num}</span>
              <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold tracking-tight">{c.title}</h2>
            </div>
            <p className="text-[var(--pt-text-secondary)] text-base mb-6 max-w-[62ch]">{fmt(c.intro)}</p>

            <ol className="mb-6 space-y-3 max-w-[62ch]">
              {c.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--pt-green-50)] text-[var(--pt-green-600)] text-xs font-semibold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span>{fmt(s)}</span>
                </li>
              ))}
            </ol>

            {c.tip && (
              <div
                className={`mb-8 max-w-[62ch] rounded-lg border-l-[3px] px-4 py-3 ${
                  c.tip.kind === "tip"
                    ? "border-l-amber-500 bg-amber-50 dark:bg-amber-500/10"
                    : "border-l-[var(--pt-green)] bg-[var(--pt-green-50)]"
                }`}
              >
                <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${c.tip.kind === "tip" ? "text-amber-700 dark:text-amber-400" : "text-[var(--pt-green-600)]"}`}>
                  {c.tip.kind === "tip" ? "Tip" : "Note"}
                </p>
                <p className="text-sm text-[var(--pt-text-secondary)] leading-relaxed">{fmt(c.tip.text)}</p>
              </div>
            )}

            <GuideGallery shots={c.shots} />
          </section>
        ))}
      </div>

      {/* Roles table */}
      <section id="roles" className="scroll-mt-24 mt-20 max-w-3xl">
        <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold tracking-tight mb-3">Roles at a glance</h2>
        <p className="text-[var(--pt-text-secondary)] text-base mb-6 max-w-[62ch]">
          Every account is one of four roles. The menu you see — and what you can see inside it — changes accordingly.
        </p>
        <div className="overflow-x-auto rounded-xl border border-[var(--pt-border)]">
          <table className="w-full text-sm border-collapse min-w-[560px]">
            <thead>
              <tr className="bg-[var(--pt-green-50)] text-left">
                <th className="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--pt-text-secondary)]">Area</th>
                <th className="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--pt-text-secondary)]">Owner</th>
                <th className="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--pt-text-secondary)]">Manager</th>
                <th className="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--pt-text-secondary)]">Pharmacist</th>
                <th className="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--pt-text-secondary)]">Cashier</th>
              </tr>
            </thead>
            <tbody>
              {ROLE_ROWS.map(([area, owner, manager, pharmacist, cashier]) => (
                <tr key={area} className="border-t border-[var(--pt-border)]">
                  <th scope="row" className="py-2.5 px-4 text-left font-medium whitespace-nowrap">{area}</th>
                  <Cell yes={owner} />
                  <Cell yes={manager} />
                  <Cell yes={pharmacist} />
                  <Cell yes={cashier} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Closing */}
      <div className="mt-20 pt-10 border-t border-[var(--pt-border)] max-w-[62ch]">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold mb-2">That&apos;s the whole loop.</h2>
        <p className="text-[var(--pt-text-secondary)]">
          Sign up, load a catalogue, receive stock, sell, close the shift, read the report the next morning. Everything
          else in PharmaTrack — appointments, prescriptions, multi-branch, M-Pesa STK — hangs off that same loop.
        </p>
      </div>
    </div>
  )
}
