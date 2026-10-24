import { PLAN_MATRIX, PLAN_ORDER } from "@pharmatrack/core"
import { platformContact } from "@/lib/platform-contact"
import { FAQ, PLAN_PRICE_KES, CATALOGUE_SIZE_LABEL } from "@/lib/marketing/content"

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmatrack.co.ke"


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
        operatingSystem: "Android, Windows, Web",
        url: SITE_URL,
        description:
          `Pharmacy POS, inventory and M-Pesa software for Kenyan pharmacies. Sells offline all day on Android, Windows or the browser, with a ${CATALOGUE_SIZE_LABEL} medicine catalogue including the PPB register.`,
        provider: { "@id": `${SITE_URL}/#organization` },
        featureList: [
          "Point of sale that works offline",
          "M-Pesa, cash, card and split payments (STK Push on Growth)",
          "Batch and expiry tracking with FEFO selling",
          `${CATALOGUE_SIZE_LABEL} medicine catalogue including the PPB register`,
          "Excel and CSV import from your old system",
          "Purchase orders and suppliers",
          "PPB controlled-substances register",
          "Prescriptions with drug-interaction checks",
          "Multi-branch stock, staff and reports",
          "Shift cash-up with variance",
        ],
        offers: PLAN_ORDER.map((code) => ({
          "@type": "Offer",
          name: PLAN_MATRIX[code].label,
          ...(PLAN_PRICE_KES[code] != null ? { price: String(PLAN_PRICE_KES[code]) } : {}),
          priceCurrency: "KES",
          category: PLAN_PRICE_KES[code] != null ? "monthly subscription" : "custom",
          url: `${SITE_URL}/#pricing`,
        })),
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
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, "\\u003c") }} />
  )
}
