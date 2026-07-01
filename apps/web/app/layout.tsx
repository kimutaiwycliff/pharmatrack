import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import { ThemeProvider } from "@/components/theme/ThemeProvider"
import { ThemedToaster } from "@/components/theme/ThemedToaster"
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister"
import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
})

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmatrack.co.ke"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PharmaTrack — Pharmacy POS & Inventory Software for Kenya",
    template: "%s · PharmaTrack",
  },
  description:
    "PharmaTrack is an offline-capable pharmacy POS, inventory, M-Pesa and PPB-compliance platform built for Kenyan pharmacies. Sell in minutes, keep selling offline, run multiple branches. 14-day free trial.",
  applicationName: "PharmaTrack",
  keywords: [
    "pharmacy POS Kenya", "pharmacy software Kenya", "pharmacy management system",
    "M-Pesa POS", "offline POS", "pharmacy inventory software", "chemist software Kenya",
    "PPB compliance software", "drug inventory system Kenya", "point of sale pharmacy",
    "Nairobi pharmacy software", "pharmacy billing software", "pharmacy stock management",
  ],
  authors: [{ name: "PharmaTrack" }],
  creator: "PharmaTrack",
  publisher: "PharmaTrack",
  category: "Business Software",
  alternates: { canonical: "/" },
  formatDetection: { telephone: false, address: false, email: false },
  appleWebApp: {
    capable: true,
    title: "PharmaTrack",
    statusBarStyle: "default",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: "PharmaTrack",
    title: "PharmaTrack — Pharmacy POS & Inventory Software for Kenya",
    description:
      "Offline-capable pharmacy POS, inventory, M-Pesa and PPB compliance — built for Kenyan pharmacies. Start a 14-day free trial.",
    url: SITE_URL,
    locale: "en_KE",
  },
  twitter: {
    card: "summary_large_image",
    title: "PharmaTrack — Pharmacy POS & Inventory Software for Kenya",
    description:
      "Offline-capable pharmacy POS, inventory, M-Pesa and PPB compliance — built for Kenyan pharmacies.",
  },
}

// Separate from metadata per Next's viewport API. `viewport-fit: cover` plus
// the safe-area padding in globals.css keeps fixed bars clear of notches and
// the iOS home indicator when installed full-screen. themeColor tints the
// mobile browser chrome (light/dark aware).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#16a34a" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="h-full">
        <ThemeProvider>
          {children}
          <ThemedToaster />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  )
}
