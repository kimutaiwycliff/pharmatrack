import Script from "next/script"

// Marketing-site analytics only (not the authenticated app), so we measure
// acquisition without tracking pharmacy staff at the till. Each source is
// env-gated — set the env var and it turns on, no code change:
//   NEXT_PUBLIC_GA_ID           — Google Analytics 4 Measurement ID (G-XXXXXXX)
//   NEXT_PUBLIC_CF_BEACON_TOKEN — Cloudflare Web Analytics token (privacy-first)
export function Analytics() {
  const ga = process.env.NEXT_PUBLIC_GA_ID
  const cf = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN
  return (
    <>
      {ga && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}');`}
          </Script>
        </>
      )}
      {cf && (
        <Script
          src="https://static.cloudflareinsights.com/beacon.min.js"
          strategy="afterInteractive"
          data-cf-beacon={`{"token": "${cf}"}`}
        />
      )}
    </>
  )
}
