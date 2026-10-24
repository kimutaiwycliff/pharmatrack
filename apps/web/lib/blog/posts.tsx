import type { ReactNode } from "react"
import Link from "next/link"
import { STANDARD_TRIAL_DAYS } from "@/lib/launch-offer"

export interface Post {
  slug: string
  title: string
  description: string
  date: string // ISO
  updated?: string // ISO — bump when a post is materially revised
  readingMins: number
  keywords: string[]
  body: ReactNode
}

// Blog content lives here (no CMS needed). Each post is server-rendered under the
// marketing layout, indexed via the sitemap, and carries Article JSON-LD.
export const POSTS: Post[] = [
  {
    slug: "best-pharmacy-pos-software-kenya",
    updated: "2026-10-23",
    title: "Best Pharmacy POS Software in Kenya (2026): What to Look For",
    description:
      "A practical buyer’s guide to choosing pharmacy POS and inventory software in Kenya — offline selling, M-Pesa, PPB compliance, multi-branch and pricing.",
    date: "2026-07-01",
    readingMins: 5,
    keywords: ["pharmacy POS Kenya", "pharmacy software Kenya", "best pharmacy software", "chemist software"],
    body: (
      <>
        <p>Choosing pharmacy software in Kenya is really about five things: does it keep selling when the internet drops, does it take M-Pesa cleanly, does it keep you compliant with the Pharmacy and Poisons Board, can it grow to more than one branch, and can you actually afford it. Here’s what to weigh.</p>
        <h2>1. It must keep selling offline — all day</h2>
        <p>Kenyan connectivity is not guaranteed, and a till that stops when the line drops costs you sales. Look for a POS that keeps your full branch catalogue on the device, lets you sell from opening to closing with no connection, and syncs automatically when the line comes back — without duplicates, and without selling stock you don’t have.</p>
        <h2>2. M-Pesa should be first-class</h2>
        <p>Most pharmacy customers pay by M-Pesa. The software should support STK Push (auto-prompting the customer’s phone) using <em>your own</em> till, plus cash, card and split payments. If STK isn’t set up, a clean manual-confirm flow should still record the sale.</p>
        <h2>3. PPB compliance built in</h2>
        <p>Dispensing controlled substances means keeping a register. Good software fills that register automatically from every controlled sale — pharmacist, prescriber, patient and batch — ready to export in a PPB-friendly format, so an inspection is a non-event.</p>
        <h2>4. Multi-branch and roles</h2>
        <p>Even if you have one shop today, pick software that supports multiple branches with per-branch stock and reports, and role-based access so cashiers see the till while owners see the numbers.</p>
        <h2>5. Honest, local pricing</h2>
        <p>Look for KES pricing, a free trial, and no lock-in — you should be able to export your products, stock and reports whenever you like. Ask too whether the vendor can import the Excel export from your current system, so switching doesn’t mean retyping hundreds of products.</p>
        <p><strong>PharmaTrack</strong> was built around exactly these needs for Kenyan pharmacies. You can <Link href="/signup">start a {STANDARD_TRIAL_DAYS}-day free trial</Link> and be selling the same day.</p>
      </>
    ),
  },
  {
    slug: "accept-mpesa-at-your-pharmacy-till",
    updated: "2026-10-23",
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
        <p>STK Push is included on the Growth plan and above. Once verified, the till auto-prompts customers. If it isn’t set up, PharmaTrack quietly falls back to manual confirm, so you’re never stuck. <Link href="/signup">Try it free</Link>.</p>
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
        <p>Want to see it? <Link href="/signup">Start a free trial</Link> and mark a product as controlled to watch the register fill itself.</p>
      </>
    ),
  },
  {
    slug: "offline-pharmacy-pos-kenya",
    updated: "2026-10-23",
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
          <li>Ask how long the till can run offline and what it needs to keep going — a full trading day with no connection is the minimum a Kenyan pharmacy should accept.</li>
          <li>Ask what stops two tills selling the same last box while both are offline. Without a rule for this, offline selling quietly creates negative stock.</li>
        </ul>
        <h2>How PharmaTrack does it</h2>
        <p>Every till — the Android app, the Windows app or a browser — keeps your branch catalogue on the device, along with its own share of the stock so two tills can never sell the same last box. You can sell all day with no connection. Each sale carries a unique reference, so when the till reconnects it syncs exactly once, and anything that can’t sync lands in a Sync issues list for a manager instead of vanishing. A till only needs to connect once before midnight, and a manager can extend that to noon the next day.</p>
        <p>See it for yourself — <Link href="/signup">start a {STANDARD_TRIAL_DAYS}-day free trial</Link> and try switching your Wi-Fi off mid-sale.</p>
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
        <p><Link href="/signup">Start a free trial</Link> and receive a batch with a near expiry date to see FEFO pick it first at the till.</p>
      </>
    ),
  },
  {
    slug: "ppb-practice360-facility360-track-and-trace",
    title: "Practice360, Facility360 and Track & Trace: What Kenyan Pharmacies Must Do Now",
    description:
      "PPB has moved licensing onto Practice360 and Facility360 and is rolling out a national Track & Trace system. Here's who onboards where, the deadline ahead of the 2027 licensing cycle, and what to do about traceability today.",
    date: "2026-10-24",
    readingMins: 7,
    keywords: ["Practice360", "Facility360", "PPB track and trace", "PPB licence renewal 2027", "pharmacy compliance Kenya", "National Track and Trace System"],
    body: (
      <>
        <p>2026 has changed how pharmacies in Kenya deal with the Pharmacy and Poisons Board (PPB). Licensing has moved onto two new online platforms, and a national system for tracking medicines from importer to patient is on its way. If you own or run a pharmacy, here is what has happened, what you need to do before the 2027 licensing cycle, and what you can safely wait on.</p>

        <blockquote><p><strong>In short:</strong> the superintendent onboards on <strong>Practice360</strong>, the premises onboards on <strong>Facility360</strong>, and PPB has urged everyone to finish before <strong>31 October 2026</strong>, ahead of 2027 licence renewals. For Track &amp; Trace, start recording batch numbers on everything you receive and sell — but don&rsquo;t buy scanners or special software until PPB publishes the retail requirements.</p></blockquote>

        <h2>What changed in 2026</h2>
        <p>In June 2026, Health Cabinet Secretary Aden Duale told the Pharmaceutical Society of Kenya conference that pharmacists, pharmaceutical technologists, pharmacies, chemists, wholesalers, distributors, importers and manufacturers would all be required to register on — and keep up to date with — three national platforms from 1 July 2026:</p>
        <ul>
          <li><strong>Practice360</strong> — registration, licensing and continuing professional development (CPD) for pharmacists and pharmaceutical technologists.</li>
          <li><strong>Facility360</strong> — licensing, inspection and compliance monitoring of pharmaceutical premises.</li>
          <li><strong>The National Track and Trace System (NTTS)</strong> — following health products from manufacture or importation through distribution and dispensing to the patient, to catch substandard, falsified and illegally imported medicines.</li>
        </ul>
        <p>PPB later confirmed the platforms in its own communications, and its regulatory notice on <em>&ldquo;Implementation of Authentication and Traceability Requirements for Health Products and Technologies and Onboarding on Practice 360 and Facility 360&rdquo;</em> asked licensed professionals and premises to complete onboarding by <strong>31 October 2026</strong> so that their 2027 licence applications can be processed. One welcome side-effect: members of the public can now scan the QR code on a pharmacy&rsquo;s licence to check that it is genuine.</p>

        <h2>Who needs to do what</h2>
        <h3>The superintendent (and every pharmacist or technologist)</h3>
        <p>Each registered pharmacist and enrolled pharmaceutical technologist onboards <em>personally</em> on Practice360 — it holds your registration, your annual practice licence and your CPD record. Do it yourself rather than sharing a login: PPB treats every action on a portal account as the account holder&rsquo;s own.</p>
        <h3>The pharmacy premises</h3>
        <p>The business onboards on Facility360, where the premises licence, inspections and compliance history now live. Have your business registration documents ready — a BN3 for a sole proprietorship or partnership, or a Certificate of Incorporation and CR12 for a limited company — because ownership and directorship must match what PPB has on file.</p>
        <h3>Renewal still ends on 31 December</h3>
        <p>All PPB licences still expire on 31 December of the licence year, and late renewal attracts penalties under the Pharmacy and Poisons Act. Onboarding early simply means your 2027 renewal isn&rsquo;t held up in December, when everyone else is trying to renew too.</p>

        <h2>Track &amp; Trace: what it means at your counter</h2>
        <p>The traceability system is being rolled out in stages, starting upstream with manufacturers and importers. PPB&rsquo;s draft standard for authentication and traceability describes four stages for dispensing points like retail pharmacies:</p>
        <ol>
          <li>Recording batch numbers when stock is received, and linking what you dispense to its batch.</li>
          <li>Using a system that can capture and send batch and dispensing data electronically.</li>
          <li>Scanning the serialised GS1 DataMatrix code on each pack at dispensing and checking it against the national repository.</li>
          <li>Routinely verifying the authenticity of medicines through the national system before they are dispensed.</li>
        </ol>
        <p>At the time of writing PPB has <strong>not published dates</strong> for these retail stages, a list of approved scanner apps, prices, or the technical specification for connecting pharmacy software. Treat anyone selling you a &ldquo;Track &amp; Trace compliant&rdquo; scanner today with caution.</p>

        <h2>What to do this week</h2>
        <ul>
          <li><strong>Superintendent:</strong> sign in to Practice360, check your registration details and CPD points, and fix anything out of date.</li>
          <li><strong>Owner:</strong> onboard the premises on Facility360 and upload ownership documents that match your business registration exactly.</li>
          <li><strong>Every member of staff:</strong> make sure their practice licence is current — anyone dispensing without one puts the premises at risk.</li>
          <li><strong>Stock:</strong> start recording the batch number and expiry date of everything you receive, and keep the supplier invoice. This is stage one of traceability and it costs nothing.</li>
          <li><strong>Suppliers:</strong> ask your wholesalers when their packs will carry GS1 DataMatrix codes.</li>
          <li><strong>Confirm dates with PPB</strong> on its website or official social media pages — timelines in this rollout have moved more than once.</li>
        </ul>

        <h2>How PharmaTrack fits in</h2>
        <p>PharmaTrack already does the groundwork traceability needs. Stock is received by batch with its expiry date, every sale is linked to the batch it came from (the earliest-expiring one first), and the till reads GS1 barcodes, including the batch and expiry encoded on many packs. Controlled substances are written to your <Link href="/blog/ppb-controlled-substances-register-kenya">PPB controlled-substances register</Link> automatically. PharmaTrack does not yet send data to the national Track &amp; Trace system — PPB hasn&rsquo;t published how pharmacy software should connect — and we&rsquo;ll follow the requirements as they are released.</p>
        <p>If you&rsquo;re still recording batches in a notebook, <Link href="/signup">start a free trial</Link> and receive your next delivery by batch — it&rsquo;s the habit every stage of Track &amp; Trace builds on.</p>
      </>
    ),
  },
  {
    slug: "how-to-start-a-pharmacy-in-kenya",
    title: "How to Start a Pharmacy in Kenya (2026): Licences, Fees and Steps",
    description:
      "A step-by-step guide to opening a retail pharmacy or chemist in Kenya in 2026 — who can own one, the superintendent rule, PPB fees, Facility360 and Practice360, county and KRA registration, and setting up your till.",
    date: "2026-10-24",
    readingMins: 8,
    keywords: ["how to start a pharmacy in Kenya", "pharmacy licence Kenya", "PPB premises registration", "requirements to open a chemist in Kenya", "pharmacy business Kenya", "PPB licence fees"],
    body: (
      <>
        <p>Opening a pharmacy in Kenya is one of the more regulated small businesses you can start — and for good reason. The rules exist so that the person handing over medicine is qualified to do it. This guide walks through the steps in the order you will meet them in 2026, using the Pharmacy and Poisons Board&rsquo;s (PPB) own published requirements.</p>

        <blockquote><p><strong>Quick facts (from PPB):</strong> premises registration fee <strong>KES 10,000</strong>; annual practice licence <strong>KES 5,000</strong>; all licences expire on <strong>31 December</strong>; applications go through PPB&rsquo;s online portals, now <strong>Facility360</strong> for premises and <strong>Practice360</strong> for professionals. Always confirm current fees on the PPB website before you pay.</p></blockquote>

        <h2>1. Check who can own the pharmacy</h2>
        <p>This is the rule that surprises most first-time investors. Under the Pharmacy and Poisons Act, a pharmacy business may only operate if the premises are approved by PPB <strong>and every person with a financial interest in the business is a registered pharmacist or an enrolled pharmaceutical technologist</strong>. In practice that means you cannot simply fund a chemist and hire a pharmacist to run it unless the ownership structure meets PPB&rsquo;s rules — take advice before you sign a lease.</p>

        <h2>2. Appoint a superintendent</h2>
        <p>Every pharmacy needs one superintendent who is responsible for it professionally:</p>
        <ul>
          <li>A <strong>registered pharmacist</strong>, or</li>
          <li>An <strong>enrolled pharmaceutical technologist with at least three years&rsquo; experience</strong> after enrolment.</li>
        </ul>
        <p>One person can only superintend <strong>one premises at a time</strong>. Other pharmacists and technologists can work with you, but each needs their own current practice licence.</p>

        <h2>3. Register the business</h2>
        <p>Register your business name or company on the Business Registration Service (eCitizen). You will need the matching documents later for PPB:</p>
        <ul>
          <li><strong>Sole proprietorship or partnership:</strong> the BN3 (and a partnership deed for partners).</li>
          <li><strong>Limited company:</strong> the Certificate of Incorporation and the CR12 showing directors and shareholders.</li>
        </ul>
        <p>Get a <strong>KRA PIN</strong> for the business at the same time. KRA now expects businesses to issue electronic tax invoices through eTIMS, so ask your accountant how this applies to you before you open.</p>

        <h2>4. Find and prepare the premises</h2>
        <p>Choose a location you can lease long-term, because the PPB licence is tied to the premises. PPB publishes <em>Guidelines for Registration and Licensing of Premises</em> on its website — read them before fitting out, so that the shelving, storage, dispensing area and security meet the standard the inspector will check. Plan for:</p>
        <ul>
          <li>Clean, dry storage away from direct sunlight, and a fridge if you will stock vaccines, insulin or other cold-chain products.</li>
          <li>A lockable cabinet for controlled substances.</li>
          <li>A dispensing area where you can counsel patients privately.</li>
          <li>Signage and the display of your licences.</li>
        </ul>

        <h2>5. Apply to PPB</h2>
        <p>Applications are made online. Since August 2026 professionals use <strong>Practice360</strong> and premises use <strong>Facility360</strong> (<Link href="/blog/ppb-practice360-facility360-track-and-trace">here&rsquo;s what each one does</Link>).</p>
        <ol>
          <li>The superintendent makes sure their own <strong>practice licence</strong> is current on Practice360 (KES 5,000 a year; CPD points are needed after the first year).</li>
          <li>Apply for the <strong>premises registration</strong> on Facility360 (KES 10,000), selecting the correct business type and attaching the matching ownership documents.</li>
          <li>Pay through the portal — PPB only starts reviewing paid-up applications, and processing time counts from payment.</li>
          <li>PPB inspects the premises. Fix anything raised and resubmit if the application comes back with queries.</li>
        </ol>
        <p>Keep everything consistent: names, directors and the premises address must match across your business registration, KRA and PPB. Mismatches are a common reason applications are declined.</p>

        <h2>6. County permit</h2>
        <p>Apply for your county&rsquo;s Single Business Permit (and any health or fire certificates your county requires). Fees vary by county and by the size of the premises.</p>

        <h2>7. Stock up — from licensed suppliers only</h2>
        <p>Buy only from PPB-licensed wholesalers and distributors, and keep every invoice. Start with what your neighbourhood actually needs — common antibiotics, painkillers, antimalarials, chronic medicines for blood pressure and diabetes, family planning and everyday OTC products — and expand from your sales data rather than guesswork. Record the <strong>batch number and expiry date</strong> of everything you receive from day one: it protects you in a recall, cuts expiry losses, and is the first step of PPB&rsquo;s Track &amp; Trace rollout.</p>

        <h2>8. Set up your till and records</h2>
        <p>From your first sale you need to record what was sold, from which batch, for how much and how it was paid — and keep a controlled-substances register. A notebook works for a week; it doesn&rsquo;t survive month-end, stock takes or an inspection. Look for a system that:</p>
        <ul>
          <li>Keeps selling when the internet or power drops (<Link href="/blog/offline-pharmacy-pos-kenya">what to check</Link>).</li>
          <li>Takes M-Pesa at the till and records each payment against the sale (<Link href="/blog/accept-mpesa-at-your-pharmacy-till">how STK Push works</Link>).</li>
          <li>Tracks stock by batch and sells the earliest expiry first (<Link href="/blog/cutting-pharmacy-expiry-losses-fefo">why FEFO matters</Link>).</li>
          <li>Fills in the controlled-substances register as you sell.</li>
          <li>Gives each staff member their own login so you know who sold what (<Link href="/blog/stop-cash-leakage-pharmacy-till">more on that</Link>).</li>
        </ul>

        <h2>9. Keep it compliant every year</h2>
        <ul>
          <li>Renew the premises and every practice licence before <strong>31 December</strong>.</li>
          <li>Keep CPD points up to date for every pharmacist and technologist.</li>
          <li>Keep invoices, the controlled-substances register and prescription records for inspection.</li>
          <li>Do a full stock take at least once a year, and count high-value and controlled items monthly.</li>
        </ul>

        <h2>Getting the system side right from day one</h2>
        <p>PharmaTrack was built for exactly this stage. It comes with <strong>3,800+ medicines</strong> already loaded, including the PPB register, so you pick what you stock instead of typing it all in; it sells offline all day on an Android phone, a Windows PC or a browser; and it records batches, M-Pesa payments and the controlled-substances register as you trade. Plans start at KES 1,500 a month — <Link href="/signup">try it free for {STANDARD_TRIAL_DAYS} days</Link> while you&rsquo;re setting up.</p>
        <p><em>This guide summarises PPB&rsquo;s published requirements as of October 2026 and is not legal advice. Fees and procedures change — confirm with the Pharmacy and Poisons Board before you apply.</em></p>
      </>
    ),
  },
  {
    slug: "switch-pharmacy-software-kenya",
    title: "How to Switch Pharmacy Software Without Retyping Your Stock",
    description:
      "Moving from your old pharmacy POS to a new one? Here's how to export your products, fix the problems every old export has (mixed box and tablet prices, duplicates, placeholder prices) and import them cleanly.",
    date: "2026-10-24",
    readingMins: 7,
    keywords: ["switch pharmacy software", "pharmacy POS migration Kenya", "import products Excel pharmacy", "change pharmacy system", "pharmacy data migration"],
    body: (
      <>
        <p>The biggest reason pharmacies stay on software they&rsquo;ve outgrown isn&rsquo;t price — it&rsquo;s the thought of retyping a thousand products. The good news is that almost every pharmacy system can export its product list to Excel, and a clean import takes an afternoon. The bad news is that old exports are almost never clean. Here&rsquo;s how to do the switch properly, based on real pharmacy data we&rsquo;ve migrated.</p>

        <h2>Step 1: Export everything from the old system</h2>
        <p>Look for a &ldquo;stock status&rdquo;, &ldquo;item list&rdquo; or &ldquo;inventory valuation&rdquo; report and export it to Excel or CSV. You want, at minimum:</p>
        <ul>
          <li>Product name (and the item code from the old system — keep it, staff will search by it)</li>
          <li>Selling price and cost price</li>
          <li>Quantity in stock</li>
          <li>Category, if the old system had one</li>
          <li>Batch numbers and expiry dates, if it tracked them</li>
        </ul>
        <p>Export on a quiet afternoon, after your last delivery of the day has been entered, so the quantities match what&rsquo;s on the shelf.</p>

        <h2>Step 2: Fix the problems every old export has</h2>
        <p>When we cleaned up a 1,200-product export from a Kenyan pharmacy recently, about one row in six needed attention. These are the patterns to look for:</p>
        <h3>Box prices mixed with tablet prices</h3>
        <p>Many systems store the selling price per tablet but the cost per box — or both per box for some items and per tablet for others. A box of 30 that costs KES 1,200 and sells at KES 55 a tablet looks like a loss if you read the cost as per tablet. Decide for every product: what is the <em>smallest unit you sell</em> (tablet, bottle, tube), how many are in a pack, and is each price per pack or per unit? A good rule of thumb: if the cost is several times the selling price, the cost is probably for the whole box.</p>
        <h3>Placeholder prices</h3>
        <p>Look for suspiciously round prices like 10, 20 or 30 on expensive brands — they&rsquo;re often placeholders someone typed to get a sale through. Compare each against its cost. If you sell below cost, the old system was hiding a problem.</p>
        <h3>Whole-pack products priced per tablet</h3>
        <p>Supplement bottles, effervescent tubes, contraceptive cycles, antibiotic courses and treatment kits are usually sold whole. If the export says a 3-tablet azithromycin pack sells at 200 &ldquo;per tablet&rdquo;, it almost certainly means 200 per pack.</p>
        <h3>Duplicates and placeholders</h3>
        <p>Search for the same product appearing twice (often one row with zero stock), test items, and rows named after the software itself. Merge or remove them before import, and keep a list of what you removed.</p>
        <h3>Pack sizes hidden in the name</h3>
        <p>Names like &ldquo;PAN 40 TABS 30S&rdquo; contain both the strength (40mg) and the pack size (30). Make sure the pack size you import is the count, not the strength.</p>
        <h3>Missing costs and expiry dates</h3>
        <p>Products with no cost will show 100% profit in your new reports. Fill in costs from recent supplier invoices. If the old system had no expiry dates, plan to receive stock by batch in the new system (step 4) rather than inventing dates.</p>

        <h2>Step 3: Import</h2>
        <p>In PharmaTrack, go to <strong>Products → Import from Excel</strong> and upload the file as it is. The importer:</p>
        <ul>
          <li>Matches your columns automatically (&ldquo;Item&rdquo;, &ldquo;Selling price&rdquo;, &ldquo;Qty&rdquo;…), and lets you correct any it guessed wrong.</li>
          <li>Recognises products against a catalogue of 3,800+ medicines, filling in generic names, dosage forms and prescription flags.</li>
          <li>Keeps your old item codes so staff can still search and scan by them.</li>
          <li>Skips duplicates, and shows a preview with every problem row flagged before anything is created.</li>
        </ul>
        <p>Up to 2,000 rows go in one file. If your list is longer, split it by category.</p>

        <h2>Step 4: Get the stock right</h2>
        <p>Quantities only count if they&rsquo;re real. Either include batch numbers and expiry dates in the import, or import the products first and then <strong>receive</strong> your current stock shelf by shelf with the batch and expiry from each pack. The second route doubles as an opening stock take — you&rsquo;ll find expired and missing stock you didn&rsquo;t know about.</p>

        <h2>Step 5: Run both systems for a day</h2>
        <p>Pick a quieter day, sell on the new system, and keep the old one open read-only for lookups. At closing, compare the day&rsquo;s sales and cash with what you expected. Then check a handful of popular products: right price per tablet, right price per box, right stock.</p>

        <h2>Step 6: Train the team — briefly</h2>
        <p>Cashiers need three things on day one: how to sign in with their PIN, how to find and sell a product, and how to take each payment type. Everything else can wait for the second week. Our <Link href="/guide">staff guide</Link> walks through it with screenshots.</p>

        <h2>A migration checklist</h2>
        <ol>
          <li>Export products, prices, costs and stock to Excel.</li>
          <li>Fix units (per tablet vs per box), placeholder prices and duplicates.</li>
          <li>Fill missing costs from invoices.</li>
          <li>Import and review the preview.</li>
          <li>Receive current stock with batches and expiry dates.</li>
          <li>Run a day side by side, then switch.</li>
        </ol>
        <p>Thinking of switching? <Link href="/signup">Start a free trial</Link>, upload your old system&rsquo;s export, and look at the preview — nothing is created until you confirm.</p>
      </>
    ),
  },
  {
    slug: "stop-cash-leakage-pharmacy-till",
    title: "Stopping Cash Leakage at the Pharmacy Till: A Practical Guide",
    description:
      "Unrecorded sales, M-Pesa to the wrong number, unexplained discounts and missing stock quietly eat a Kenyan pharmacy's profit. Here's where the money goes and the controls that stop it.",
    date: "2026-10-24",
    readingMins: 6,
    keywords: ["pharmacy cash management", "cash variance pharmacy", "pharmacy theft Kenya", "shift cash up", "pharmacy stock loss", "M-Pesa till pharmacy"],
    body: (
      <>
        <p>Most pharmacy owners have had the feeling: the shop is busy, the shelves empty, but the money at month-end doesn&rsquo;t match. It&rsquo;s rarely one big theft. It&rsquo;s small amounts, every day, through gaps nobody is watching. Here are the common leaks and the simple controls that close them — most of which work whether or not you use software.</p>

        <h2>Where the money goes</h2>
        <ul>
          <li><strong>Sales that are never recorded.</strong> Cash goes into a pocket or a drawer instead of through the till.</li>
          <li><strong>M-Pesa to the wrong number.</strong> A customer is told to send money to a personal line instead of the business till.</li>
          <li><strong>Discounts nobody approved.</strong> &ldquo;Regular customer&rdquo; prices that were never agreed.</li>
          <li><strong>Stock walking out.</strong> Products leave without a sale — high-value brands and controlled medicines are the usual targets.</li>
          <li><strong>Credit that is never collected.</strong> &ldquo;They&rsquo;ll pay on Friday.&rdquo;</li>
          <li><strong>Honest mistakes.</strong> Wrong change, a box sold at the tablet price, a price that was never updated.</li>
        </ul>

        <h2>Control 1: Everyone signs in as themselves</h2>
        <p>If staff share one login, nobody is responsible for anything. Give every cashier and pharmacist their own sign-in — a quick 4-digit PIN at the till is enough — so every sale, discount and stock adjustment has a name on it. The behaviour change alone is significant.</p>

        <h2>Control 2: Count the cash at every shift change</h2>
        <p>Start each shift with a counted <strong>opening float</strong>. At the end, the cashier counts the drawer before seeing what the system expects. The difference is the <strong>variance</strong>. Small variances happen; a pattern of short drawers on one person&rsquo;s shifts is the signal you&rsquo;re looking for. Record variances every day — it&rsquo;s the trend that matters, not one bad day.</p>

        <h2>Control 3: Make M-Pesa go to the business, every time</h2>
        <p>The cleanest fix is STK Push: the till sends the payment prompt straight to the customer&rsquo;s phone for the exact amount, and the money can only land in your till or paybill. If you use manual confirmation, insist that the M-Pesa receipt code is recorded on every sale, and check your M-Pesa statement against sales at the end of each day. (<Link href="/blog/accept-mpesa-at-your-pharmacy-till">How to set up STK Push.</Link>)</p>

        <h2>Control 4: Cap discounts</h2>
        <p>Set a maximum discount per product so a cashier can&rsquo;t give away margin on a whim, and look at total discounts by cashier each week. Generous discounting is sometimes good customer service — but it should be visible.</p>

        <h2>Control 5: Count the stock that matters, often</h2>
        <p>You don&rsquo;t need to count the whole shop every week. Count your top 20 high-value products and every controlled substance weekly or monthly, and the whole shop once or twice a year. Every difference should be recorded as a stock adjustment <em>with a reason</em> — damaged, expired, count correction, theft — so you can see which kind of loss is growing.</p>

        <h2>Control 6: Read one report every morning</h2>
        <p>Five minutes with yesterday&rsquo;s numbers catches most problems early:</p>
        <ul>
          <li>Sales by cashier and by payment method (cash, M-Pesa, card).</li>
          <li>The shift variances.</li>
          <li>Discounts given and stock adjustments made.</li>
          <li>Anything sold below cost.</li>
        </ul>

        <h2>Control 7: Separate the duties you can</h2>
        <p>In a small pharmacy one person often does everything, but where you can, keep receiving stock, selling, and counting stock with different people — or at least have the owner or a manager check what was received against the supplier invoice.</p>

        <h2>How PharmaTrack helps</h2>
        <p>PharmaTrack builds these controls into the everyday workflow: each staff member signs in with their own PIN; shifts open with a float and close with a cash count and automatic variance; M-Pesa STK Push sends payments to your own till; discounts are capped per product; stock adjustments need a reason and are logged; the dashboard shows today&rsquo;s sales by payment method, and Reports break sales and profit down by cashier. Roles keep cashiers on the till while owners and managers see the numbers — from anywhere.</p>
        <p><Link href="/signup">Start a free {STANDARD_TRIAL_DAYS}-day trial</Link> and run one week of shifts with cash counts. Most owners learn something in the first week.</p>
      </>
    ),
  },
]

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug)
}
