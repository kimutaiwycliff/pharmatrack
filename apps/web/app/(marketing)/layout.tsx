import type { Metadata } from "next"
import { Bricolage_Grotesque } from "next/font/google"
import { getSession } from "@/lib/auth/helpers"
import { MarketingNav } from "@/components/marketing/MarketingNav"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"
import { Analytics } from "@/components/marketing/Analytics"

// Distinctive display face for headlines — paired with the app's Inter body.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800"],
})

export const metadata: Metadata = {
  title: "PharmaTrack — All-in-one pharmacy management for Kenya",
  description:
    "POS, inventory, M-Pesa, appointments and PPB compliance in one offline-capable platform built for Kenyan pharmacies. Start a 14-day free trial.",
  openGraph: {
    title: "PharmaTrack — Run your whole pharmacy in one place",
    description:
      "Offline-first POS, FEFO inventory, M-Pesa payments and Kenyan compliance. Built for Kenyan pharmacies.",
    type: "website",
  },
}

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const signedIn = !!session?.user

  return (
    <div className={`${display.variable} marketing-root min-h-screen bg-[var(--pt-bg)] text-[var(--pt-text)] antialiased`}>
      <MarketingNav signedIn={signedIn} />
      <main>{children}</main>
      <MarketingFooter />
      <Analytics />
    </div>
  )
}
