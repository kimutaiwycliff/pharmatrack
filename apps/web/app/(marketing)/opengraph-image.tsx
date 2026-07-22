import { ImageResponse } from "next/og"

export const alt = "PharmaTrack — Pharmacy POS & Inventory Software for Kenya"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Branded social-share card (Open Graph + Twitter) auto-attached to marketing pages.
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #052e1a 0%, #0b4d2c 55%, #16a34a 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64, height: 64, borderRadius: 18, background: "#16a34a",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 44, fontWeight: 800,
            }}
          >
            ＋
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>PharmaTrack</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 940 }}>
            Run your whole pharmacy in one place.
          </div>
          <div style={{ fontSize: 32, color: "#bbf7d0", maxWidth: 900 }}>
            Offline-capable POS, inventory, M-Pesa &amp; PPB compliance — built for Kenyan pharmacies.
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {["Offline POS", "M-Pesa", "Multi-branch", "PPB register", "30-day free trial"].map((t) => (
            <div
              key={t}
              style={{
                fontSize: 24, padding: "10px 22px", borderRadius: 999,
                background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  )
}
