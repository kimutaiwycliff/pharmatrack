import type { ReactNode } from "react"

export interface Post {
  slug: string
  title: string
  description: string
  date: string // ISO
  readingMins: number
  keywords: string[]
  body: ReactNode
}

// Blog content lives here (no CMS needed). Each post is server-rendered under the
// marketing layout, indexed via the sitemap, and carries Article JSON-LD.
export const POSTS: Post[] = [
  {
    slug: "best-pharmacy-pos-software-kenya",
    title: "Best Pharmacy POS Software in Kenya (2026): What to Look For",
    description:
      "A practical buyer’s guide to choosing pharmacy POS and inventory software in Kenya — offline selling, M-Pesa, PPB compliance, multi-branch and pricing.",
    date: "2026-07-01",
    readingMins: 5,
    keywords: ["pharmacy POS Kenya", "pharmacy software Kenya", "best pharmacy software", "chemist software"],
    body: (
      <>
        <p>Choosing pharmacy software in Kenya is really about five things: does it keep selling when the internet drops, does it take M-Pesa cleanly, does it keep you compliant with the Pharmacy and Poisons Board, can it grow to more than one branch, and can you actually afford it. Here’s what to weigh.</p>
        <h2>1. It must work offline — indefinitely</h2>
        <p>Kenyan connectivity is not guaranteed, and a till that stops when the line drops costs you sales. Look for a POS that caches your full branch catalogue on the device and queues sales locally with no time limit, then syncs automatically when the connection returns — without creating duplicates.</p>
        <h2>2. M-Pesa should be first-class</h2>
        <p>Most pharmacy customers pay by M-Pesa. The software should support STK Push (auto-prompting the customer’s phone) using <em>your own</em> till, plus cash, card and split payments. If STK isn’t set up, a clean manual-confirm flow should still record the sale.</p>
        <h2>3. PPB compliance built in</h2>
        <p>Dispensing controlled substances means keeping a register. Good software fills that register automatically from every controlled sale — pharmacist, prescriber, patient and batch — ready to export in a PPB-friendly format, so an inspection is a non-event.</p>
        <h2>4. Multi-branch and roles</h2>
        <p>Even if you have one shop today, pick software that supports multiple branches with per-branch stock and reports, and role-based access so cashiers see the till while owners see the numbers.</p>
        <h2>5. Honest, local pricing</h2>
        <p>Look for KES pricing, a free trial, and no lock-in — ideally the option to self-host and export your data.</p>
        <p><strong>PharmaTrack</strong> was built around exactly these needs for Kenyan pharmacies. You can <a href="/signup">start a 30-day free trial</a> and be selling the same day.</p>
      </>
    ),
  },
  {
    slug: "accept-mpesa-at-your-pharmacy-till",
    title: "How to Accept M-Pesa at Your Pharmacy Till (STK Push, the right way)",
    description:
      "Set up M-Pesa STK Push at your pharmacy POS so payments land in your own till — what you need from Safaricom Daraja and how to switch it on in PharmaTrack.",
    date: "2026-07-01",
    readingMins: 4,
    keywords: ["M-Pesa POS", "M-Pesa pharmacy", "STK push", "Lipa na M-Pesa", "Daraja"],
    body: (
      <>
        <p>Manually reading out an M-Pesa till number and waiting for the customer to type it is slow and error-prone. STK Push flips it around: the POS prompts the customer’s phone with the exact amount, they enter their PIN, and the money lands in <em>your</em> till. Here’s how to set it up properly.</p>
        <h2>What you need from Safaricom</h2>
        <ul>
          <li>A <strong>Buy Goods (till)</strong> or <strong>Pay Bill</strong> number.</li>
          <li>A <strong>Daraja app</strong> at developer.safaricom.co.ke with <em>Lipa na M-Pesa Online</em> enabled — this gives you a <strong>Consumer Key</strong> and <strong>Consumer Secret</strong>.</li>
          <li>The <strong>Passkey</strong> tied to your shortcode.</li>
        </ul>
        <h2>Why per-pharmacy credentials matter</h2>
        <p>A single shared app can’t push money into arbitrary tills — Safaricom ties STK Push to the shortcode that owns the app. That’s why each pharmacy configures its <em>own</em> credentials: it’s the only way the payment reaches your own till directly and safely.</p>
        <h2>Switching it on in PharmaTrack</h2>
        <p>Go to <strong>Settings → Payments</strong>, paste your shortcode, consumer key/secret and passkey, choose sandbox or production, then use <strong>Test connection</strong> and <strong>Send test STK</strong> to confirm end-to-end before going live. Secrets are encrypted at rest and never shown again.</p>
        <p>Once verified, the till auto-prompts customers. If it isn’t set up, PharmaTrack quietly falls back to manual confirm, so you’re never stuck. <a href="/signup">Try it free</a>.</p>
      </>
    ),
  },
  {
    slug: "ppb-controlled-substances-register-kenya",
    title: "The PPB Controlled Substances Register: What Kenyan Pharmacies Must Keep",
    description:
      "A plain-English guide to the controlled-drugs register Kenyan pharmacies must maintain for the Pharmacy and Poisons Board — and how to keep it automatically.",
    date: "2026-07-01",
    readingMins: 4,
    keywords: ["PPB compliance", "controlled substances register", "pharmacy compliance Kenya", "poisons board"],
    body: (
      <>
        <p>If your pharmacy dispenses controlled substances, the Pharmacy and Poisons Board (PPB) expects a proper register. Keeping it by hand is tedious and easy to get wrong — and gaps surface at exactly the wrong moment: an inspection.</p>
        <h2>What the register should capture</h2>
        <p>For each controlled dispensing, you generally record the drug and quantity, the batch number, the dispensing pharmacist (name and registration), the prescriber, and the patient. The point is a complete, tamper-evident trail from stock to patient.</p>
        <h2>Why automation beats a paper book</h2>
        <p>When the register fills itself from every controlled sale at the point of dispensing, there are no missed entries and no end-of-day reconciliation. You get an accurate, exportable record without extra work — and the data already ties back to the specific batch you sold.</p>
        <h2>How PharmaTrack handles it</h2>
        <p>Products flagged as controlled automatically write to the register on every sale, capturing the details above, and you can export a PPB-friendly report as PDF or CSV whenever you need it. Compliance becomes a by-product of just running your till.</p>
        <p>Want to see it? <a href="/signup">Start a free trial</a> and mark a product as controlled to watch the register fill itself.</p>
      </>
    ),
  },
  {
    slug: "offline-pharmacy-pos-kenya",
    title: "Offline Pharmacy POS: How to Keep Selling When the Internet Drops",
    description:
      "Kenyan pharmacies can't afford a till that stops working every time the connection drops. Here's what offline-capable POS software actually needs to do — and how to test it before you buy.",
    date: "2026-07-20",
    readingMins: 4,
    keywords: ["offline pharmacy POS", "offline POS Kenya", "pharmacy software no internet", "POS works offline"],
    body: (
      <>
        <p>Power and internet drop often enough in Kenya that “offline mode” is a real requirement, not a nice-to-have. But a lot of software marketed as offline-capable only means the receipt screen still renders — the moment you try to search a product or take a payment, it needs a live connection anyway. Here’s what actually matters.</p>
        <h2>What “offline capable” should really mean</h2>
        <p>True offline support means your <em>full branch catalogue</em> — products, pack sizes, prices, batches — is cached on the device itself before you ever lose connection. That way product search, barcode lookup and pricing all keep working with zero internet, not just the till screen.</p>
        <h2>The sync problem nobody mentions</h2>
        <p>Queuing a sale while offline is the easy part. The hard part is syncing it back safely once the connection returns — without double-charging a customer or decrementing stock twice if the network blips mid-sync. That needs each offline sale to carry its own unique reference so the server can recognise and discard a duplicate automatically.</p>
        <h2>What to check before you buy</h2>
        <ul>
          <li>Ask the vendor to demo with Wi-Fi and mobile data both switched off — not just a slow connection.</li>
          <li>Ask what happens to a sale that <em>fails</em> to sync. It should land somewhere visible for retry, not disappear silently.</li>
          <li>Ask if there’s a time limit on how long the POS can run offline. Some products cap it at 24 hours; a pharmacy that loses connectivity over a weekend shouldn’t lose its till.</li>
        </ul>
        <h2>How PharmaTrack does it</h2>
        <p>The POS caches your full branch catalogue on the device on load, queues sales with a unique offline reference, and syncs automatically the moment connectivity returns — the server dedupes on that reference, and anything that fails to sync lands in a visible retry queue instead of vanishing. There’s no time limit on how long it can run offline.</p>
        <p>See it for yourself — <a href="/signup">start a 30-day free trial</a> and try switching your Wi-Fi off mid-sale.</p>
      </>
    ),
  },
  {
    slug: "cutting-pharmacy-expiry-losses-fefo",
    title: "Cutting Drug Expiry Losses in Kenyan Pharmacies with FEFO",
    description:
      "Expired stock is one of the biggest silent costs in a Kenyan pharmacy. Here's how First-Expiry-First-Out selling and batch tracking cut those losses — and what to set up.",
    date: "2026-07-20",
    readingMins: 4,
    keywords: ["reduce pharmacy stock losses Kenya", "FEFO pharmacy", "drug expiry tracking", "pharmacy inventory Kenya"],
    body: (
      <>
        <p>Expiry write-offs are one of the quietest costs in a pharmacy — nobody notices the loss until a shelf audit or a batch of stock that has to be pulled entirely. Most of it is preventable with one change: selling the batch that expires soonest, every time, automatically.</p>
        <h2>Why FIFO isn’t enough</h2>
        <p>First-In-First-Out sells whichever stock arrived first. That sounds right, but a later delivery from a different supplier can have a <em>shorter</em> shelf life than stock already on the shelf. Selling by arrival order can leave the actually-expiring batch sitting untouched. First-Expiry-First-Out (FEFO) sells whichever batch expires soonest, regardless of when it arrived — which is what actually prevents write-offs.</p>
        <h2>What FEFO needs from your system</h2>
        <ul>
          <li><strong>Batch-level tracking</strong> — batch number, expiry date and quantity recorded per batch, not one combined stock count per product.</li>
          <li><strong>Automatic consumption at checkout</strong> — the earliest-expiry batch should decrement first on every sale, without relying on a cashier to check dates during a rush.</li>
          <li><strong>An expiring-soon view</strong> — so stock nearing expiry (say, within 90 days) can be marked down or returned to a supplier before it becomes a total loss.</li>
        </ul>
        <h2>Why a spreadsheet stops working</h2>
        <p>Tracking expiry by memory or a spreadsheet holds up with one branch and a handful of SKUs. It breaks down fast once you’re running multiple branches with hundreds of products — the batch decision has to happen automatically at the point of sale, every single time, or it simply won’t happen consistently.</p>
        <h2>How PharmaTrack does it</h2>
        <p>Every sale automatically decrements the earliest-expiry batch first. Inventory surfaces anything expiring within 90 days so you can act before it’s a write-off, and every stock adjustment — including expiry write-offs — logs a reason to an audit trail.</p>
        <p><a href="/signup">Start a free trial</a> and receive a batch with a near expiry date to see FEFO pick it first at the till.</p>
      </>
    ),
  },
]

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug)
}
