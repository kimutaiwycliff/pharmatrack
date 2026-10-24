import { ImageResponse } from "next/og"
import { POSTS, getPost } from "@/lib/blog/posts"

export const alt = "PharmaTrack blog"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }))
}

// Per-article share card (WhatsApp, Facebook, X, LinkedIn) — the post title on
// the same brand gradient as the landing page card.
export default async function PostOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const title = getPost(slug)?.title ?? "Running a Kenyan pharmacy, better"
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "72px 80px", background: "linear-gradient(135deg, #052e1a 0%, #0b4d2c 55%, #16a34a 100%)",
          color: "white", fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 800 }}>＋</div>
          <div style={{ fontSize: 30, fontWeight: 700 }}>PharmaTrack · Blog</div>
        </div>
        <div style={{ fontSize: title.length > 70 ? 56 : 64, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5, maxWidth: 1040 }}>
          {title}
        </div>
        <div style={{ fontSize: 28, color: "#bbf7d0" }}>Pharmacy POS &amp; stock software for Kenya · pharmatrack.co.ke</div>
      </div>
    ),
    { ...size },
  )
}
