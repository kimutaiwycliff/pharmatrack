import { ImageResponse } from "next/og"

// iOS ignores SVG manifest icons for the home screen, so generate a real PNG
// apple-touch-icon. Next auto-injects the <link rel="apple-touch-icon">.
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #22c55e 0%, #15803d 100%)",
        }}
      >
        {/* White medical cross, matching app/icon.svg */}
        <div style={{ display: "flex", position: "relative", width: 98, height: 98 }}>
          <div style={{ position: "absolute", left: 35, top: 0, width: 28, height: 98, background: "#fff", borderRadius: 9 }} />
          <div style={{ position: "absolute", left: 0, top: 35, width: 98, height: 28, background: "#fff", borderRadius: 9 }} />
        </div>
      </div>
    ),
    size,
  )
}
