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
      "A practical buyer's guide to choosing pharmacy POS and inventory software in Kenya — offline selling, M-Pesa, PPB compliance, multi-branch and pricing.",
    date: "2026-07-01",
    readingMins: 5,
    keywords: ["pharmacy POS Kenya", "pharmacy software Kenya", "best pharmacy software", "chemist software"],
    body: (
      <>
        <p>Choosing pharmacy software in Kenya is really about five things: does it keep selling when the internet drops, does it take M-Pesa cleanly, does it keep you compliant with the Pharmacy and Poisons Board, can it grow to more than one branch, and can you actually afford it. Here's what to weigh.</p>
        <h2>1. It must work offline — indefinitely</h2>
        <p>Kenyan connectivity is not guaranteed, and a till that stops when the line drops costs you sales. Look for a POS that caches your full branch catalogue on the device and queues sales locally with no time limit, then syncs automatically when the connection returns — without creating duplicates.</p>
        <h2>2. M-Pesa should be first-class</h2>
        <p>Most pharmacy customers pay by M-Pesa. The software should support STK Push (auto-prompting the customer's phone) using <em>your own</em> till, plus cash, card and split payments. If STK isn't set up, a clean manual-confirm flow should still record the sale.</p>
        <h2>3. PPB compliance built in</h2>
        <p>Dispensing controlled substances means keeping a register. Good software fills that register automatically from every controlled sale — pharmacist, prescriber, patient and batch — ready to export in a PPB-friendly format, so an inspection is a non-event.</p>
        <h2>4. Multi-branch and roles</h2>
        <p>Even if you have one shop today, pick software that supports multiple branches with per-branch stock and reports, and role-based access so cashiers see the till while owners see the numbers.</p>
        <h2>5. Honest, local pricing</h2>
        <p>Look for KES pricing, a free trial, and no lock-in — ideally the option to self-host and export your data.</p>
        <p><strong>PharmaTrack</strong> was built around exactly these needs for Kenyan pharmacies. You can <a href="/signup">start a 14-day free trial</a> and be selling the same day.</p>
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
        <p>Manually reading out an M-Pesa till number and waiting for the customer to type it is slow and error-prone. STK Push flips it around: the POS prompts the customer's phone with the exact amount, they enter their PIN, and the money lands in <em>your</em> till. Here's how to set it up properly.</p>
        <h2>What you need from Safaricom</h2>
        <ul>
          <li>A <strong>Buy Goods (till)</strong> or <strong>Pay Bill</strong> number.</li>
          <li>A <strong>Daraja app</strong> at developer.safaricom.co.ke with <em>Lipa na M-Pesa Online</em> enabled — this gives you a <strong>Consumer Key</strong> and <strong>Consumer Secret</strong>.</li>
          <li>The <strong>Passkey</strong> tied to your shortcode.</li>
        </ul>
        <h2>Why per-pharmacy credentials matter</h2>
        <p>A single shared app can't push money into arbitrary tills — Safaricom ties STK Push to the shortcode that owns the app. That's why each pharmacy configures its <em>own</em> credentials: it's the only way the payment reaches your own till directly and safely.</p>
        <h2>Switching it on in PharmaTrack</h2>
        <p>Go to <strong>Settings → Payments</strong>, paste your shortcode, consumer key/secret and passkey, choose sandbox or production, then use <strong>Test connection</strong> and <strong>Send test STK</strong> to confirm end-to-end before going live. Secrets are encrypted at rest and never shown again.</p>
        <p>Once verified, the till auto-prompts customers. If it isn't set up, PharmaTrack quietly falls back to manual confirm, so you're never stuck. <a href="/signup">Try it free</a>.</p>
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
]

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug)
}
