import type { Metadata } from "next"
import { connection } from "next/server"
import { Bricolage_Grotesque } from "next/font/google"
import { platformContact } from "@/lib/platform-contact"
import { MarketingNav } from "@/components/marketing/MarketingNav"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"
import { Analytics } from "@/components/marketing/Analytics"
import { ContactWidget } from "@/components/marketing/ContactWidget"
import { STANDARD_TRIAL_DAYS } from "@/lib/launch-offer"

// Distinctive display face for headlines — paired with the app's Inter body.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800"],
})

export const metadata: Metadata = {
  // absolute: the root template would otherwise append "· PharmaTrack" twice.
  title: { absolute: "PharmaTrack — Pharmacy POS & Inventory Software for Kenya" },
  description:
    `Pharmacy POS, stock and M-Pesa software for Kenyan chemists. Sells offline all day on Android, Windows or the browser, PPB register built in. From KES 1,500/month — ${STANDARD_TRIAL_DAYS}-day free trial.`,
  openGraph: {
    title: "PharmaTrack — Run your whole pharmacy in one place",
    description:
      "Offline POS, batch & expiry stock, M-Pesa and the PPB register — on Android, Windows or the browser.",
    type: "website",
  },
}

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Render per request: analytics IDs and contact details are runtime env vars
  // (absent from the Docker build), so a static page would bake them out.
  // Nothing slow is awaited here any more — the session check runs in the
  // browser and app-download manifests stream in behind a Suspense boundary.
  await connection()
  const contact = platformContact()

  return (
    <div className={`${display.variable} marketing-root min-h-screen bg-[var(--pt-bg)] text-[var(--pt-text)] antialiased`}>
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
      <Analytics />
      <ContactWidget whatsappLink={contact.whatsappLink} />
    </div>
  )
}
