import type { MetadataRoute } from "next"
import { POSTS } from "@/lib/blog/posts"

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmatrack.co.ke"

// Public, indexable pages only. The app (dashboard/pos/platform) is auth-gated
// and excluded via robots.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const posts: MetadataRoute.Sitemap = POSTS.map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.date),
    changeFrequency: "yearly",
    priority: 0.6,
  }))
  return [
    { url: `${SITE_URL}/`,       lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${SITE_URL}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/blog`,   lastModified: now, changeFrequency: "weekly",  priority: 0.7 },
    ...posts,
  ]
}
