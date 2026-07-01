"use client"

// Last-resort boundary: fires only when the ROOT layout itself throws, so Next
// bypasses that layout (and its globals.css) and renders this in its place. That
// means no theme tokens and no fonts are available here — everything is inlined
// and self-contained so it renders even when the rest of the app is broken.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "2rem 1.25rem",
          textAlign: "center",
          background: "radial-gradient(120% 90% at 50% -10%, rgba(22,163,74,.10), transparent 60%) #ffffff",
          color: "#0f172a",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <style>{`
          @keyframes ptge-rise { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }
          @keyframes ptge-bob  { 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-6px) } }
          @keyframes ptge-ring { 0%{ opacity:.5; transform:scale(.7) } 100%{ opacity:0; transform:scale(1.7) } }
          .ptge-el { opacity:0; animation: ptge-rise .6s cubic-bezier(.22,1,.36,1) forwards; }
          @media (prefers-reduced-motion: reduce) {
            .ptge-el { opacity:1; animation:none }
            .ptge-tile, .ptge-ring { animation:none }
          }
        `}</style>

        <div style={{ maxWidth: "28rem" }}>
          <div
            style={{
              position: "relative",
              width: 76,
              height: 76,
              margin: "0 auto 1.5rem",
              display: "grid",
              placeItems: "center",
            }}
            aria-hidden
          >
            <span
              className="ptge-ring"
              style={{
                position: "absolute",
                inset: 8,
                borderRadius: 20,
                border: "2px solid rgba(22,163,74,.55)",
                animation: "ptge-ring 2.8s ease-out infinite",
              }}
            />
            <span
              className="ptge-tile"
              style={{
                width: 60,
                height: 60,
                borderRadius: 18,
                display: "grid",
                placeItems: "center",
                color: "#fff",
                background: "linear-gradient(160deg,#16a34a,#15803d)",
                boxShadow: "0 10px 30px -8px rgba(22,163,74,.5)",
                animation: "ptge-bob 5s ease-in-out infinite",
              }}
            >
              {/* Medical cross — the PharmaTrack mark */}
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 2h2a2 2 0 0 1 2 2v5h5a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-5v5a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-5H4a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h5V4a2 2 0 0 1 2-2z" />
              </svg>
            </span>
          </div>

          <p className="ptge-el" style={{ margin: 0, fontSize: ".72rem", fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: "#15803d", animationDelay: ".05s" }}>
            Something went wrong
          </p>
          <h1 className="ptge-el" style={{ margin: ".5rem 0 0", fontSize: "clamp(1.7rem,5.5vw,2.4rem)", fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.06, animationDelay: ".12s" }}>
            The app hit an unexpected error
          </h1>
          <p className="ptge-el" style={{ margin: ".85rem auto 0", maxWidth: "24rem", fontSize: ".975rem", lineHeight: 1.6, color: "#475569", animationDelay: ".2s" }}>
            Please reload the page. If the problem continues, contact support and share the reference below.
          </p>

          {error?.digest ? (
            <code className="ptge-el" style={{ display: "inline-block", marginTop: ".9rem", fontSize: ".72rem", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "#64748b", background: "#f1f5f9", border: "1px solid #e2e8f0", padding: ".2rem .55rem", borderRadius: ".4rem", animationDelay: ".26s" }}>
              ref: {error.digest}
            </code>
          ) : null}

          <div className="ptge-el" style={{ display: "flex", flexWrap: "wrap", gap: ".6rem", justifyContent: "center", marginTop: "1.5rem", animationDelay: ".32s" }}>
            <button
              onClick={() => reset()}
              style={{ cursor: "pointer", height: "2.75rem", padding: "0 1.3rem", borderRadius: ".75rem", border: "none", fontSize: ".9rem", fontWeight: 600, color: "#fff", background: "#16a34a", boxShadow: "0 8px 20px -8px rgba(22,163,74,.7)" }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{ display: "inline-flex", alignItems: "center", height: "2.75rem", padding: "0 1.3rem", borderRadius: ".75rem", border: "1px solid #e2e8f0", fontSize: ".9rem", fontWeight: 600, color: "#0f172a", textDecoration: "none", background: "#fff" }}
            >
              Reload
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
