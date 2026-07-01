import type { MetadataRoute } from "next"

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmatrack.co.ke"

// Crawl the public marketing pages; keep the authenticated app, operator console
// and APIs out of the index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/", "/dashboard", "/pos", "/platform", "/settings",
        "/setup", "/onboarding", "/home", "/login", "/auth/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
