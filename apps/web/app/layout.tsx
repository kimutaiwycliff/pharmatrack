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

export const metadata: Metadata = {
  title: "PharmaTrack",
  description: "Pharmacy POS & inventory management for Kenyan pharmacies",
  appleWebApp: {
    capable: true,
    title: "PharmaTrack",
    statusBarStyle: "default",
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
