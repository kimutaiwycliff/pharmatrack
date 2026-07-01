import { platformContact } from "@/lib/platform-contact"

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmatrack.co.ke"

// Mirrors the FAQ section — kept in sync with Faq.tsx.
const FAQ: { q: string; a: string }[] = [
  { q: "How long does setup take?", a: "Most pharmacies are selling the same day. Load the Kenyan catalogue in one click, set your prices and opening stock in a bulk grid, and you're live — usually in under an hour." },
  { q: "Does it really work offline?", a: "Yes. The POS caches your full branch catalogue on the device and queues sales while offline — with no time limit. When the connection returns, sales sync automatically and duplicates are removed." },
  { q: "Can I move my existing data in?", a: "Import products and opening stock from a CSV (up to 2,000 rows) with column auto-mapping and a preview before anything is created." },
  { q: "Is M-Pesa included?", a: "Yes — M-Pesa STK Push runs at checkout and confirmations are matched to the sale. Cash, card and split payments are supported too." },
  { q: "Can I run more than one branch?", a: "Yes. Growth covers up to three branches and Enterprise is unlimited, each with its own stock, staff and reports." },
  { q: "Do I own my data?", a: "Always. You can self-host the entire platform on your own server, or we host it for you. There's no lock-in and you can export your data." },
  { q: "Is it compliant with PPB?", a: "The controlled-substances register is built in and fills itself from every dispensed controlled sale, ready to export in a PPB-friendly format." },
]

// JSON-LD for rich results: the product (SoftwareApplication with pricing), the
// organization, and an FAQ block (eligible for FAQ rich snippets).
export function StructuredData() {
  const contact = platformContact()
  const org = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "PharmaTrack",
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
    areaServed: { "@type": "Country", name: "Kenya" },
    ...(contact.email || contact.whatsapp
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "sales",
            ...(contact.email ? { email: contact.email } : {}),
            ...(contact.whatsapp ? { telephone: contact.whatsapp } : {}),
            areaServed: "KE",
            availableLanguage: ["en", "sw"],
          },
        }
      : {}),
  }

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      org,
      {
        "@type": "SoftwareApplication",
        name: "PharmaTrack",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Pharmacy Management / Point of Sale",
        operatingSystem: "Web, iOS, Android (PWA)",
        url: SITE_URL,
        description:
          "Offline-capable pharmacy POS, inventory, M-Pesa payments and PPB compliance for Kenyan pharmacies. Multi-branch, works offline, sell in minutes.",
        provider: { "@id": `${SITE_URL}/#organization` },
        featureList: [
          "Offline-capable Point of Sale",
          "M-Pesa STK Push payments",
          "FEFO inventory & batch expiry tracking",
          "Multi-branch management",
          "PPB controlled-substances register",
          "Appointments & SMS/WhatsApp reminders",
          "Reports & dashboards",
        ],
        offers: [
          { "@type": "Offer", name: "Starter", price: "2500", priceCurrency: "KES", category: "monthly subscription", url: `${SITE_URL}/#pricing` },
          { "@type": "Offer", name: "Growth", price: "6000", priceCurrency: "KES", category: "monthly subscription", url: `${SITE_URL}/#pricing` },
          { "@type": "Offer", name: "Enterprise", priceCurrency: "KES", category: "custom", url: `${SITE_URL}/#pricing` },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  }

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }} />
  )
}
