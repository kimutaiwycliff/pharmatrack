"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Bricolage_Grotesque } from "next/font/google"
import { AlertTriangle, RotateCcw, RefreshCw, Home } from "lucide-react"

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700", "800"] })

// Root error boundary. Its most common trigger is a stale/missing JS chunk during
// client-side navigation (after a deploy the running tab references old hashes;
// in dev an on-demand compile can race) — which is exactly the "works on reload"
// symptom. For those we reload automatically; everything else gets a retry.
const CHUNK_ERROR = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|importing a module script failed/i

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (CHUNK_ERROR.test(error?.message ?? "") || CHUNK_ERROR.test(error?.name ?? "")) {
      // Reload to fetch fresh chunks, but at most once per 10s so a genuinely
      // broken build can't trigger a reload loop.
      try {
        const KEY = "pt-chunk-reload-at"
        const last = Number(sessionStorage.getItem(KEY) || 0)
        if (Date.now() - last > 10_000) {
          sessionStorage.setItem(KEY, String(Date.now()))
          window.location.reload()
        }
      } catch {
        window.location.reload()
      }
    }
  }, [error])

  return (
    <main className="pt-err">
      <style>{CSS}</style>

      <div className="pt-err__glow" aria-hidden />

      <section className="pt-err__inner">
        <div className="pt-err__emblem" aria-hidden>
          <span className="pt-err__ring" />
          <span className="pt-err__ring pt-err__ring--2" />
          <span className="pt-err__tile">
            <AlertTriangle size={28} strokeWidth={2.4} />
          </span>
        </div>

        <p className={`pt-err__eyebrow ${display.className}`}>Something went wrong</p>
        <h1 className={`pt-err__title ${display.className}`}>We couldn&rsquo;t fill this request</h1>
        <p className="pt-err__sub">
          A hiccup stopped this page from loading. It&rsquo;s usually temporary — try again, and if
          it keeps happening, reload the page.
        </p>

        {error?.digest ? (
          <code className="pt-err__digest">ref: {error.digest}</code>
        ) : null}

        <div className="pt-err__actions">
          <button onClick={() => reset()} className="pt-err__btn pt-err__btn--primary">
            <RotateCcw size={16} strokeWidth={2.5} /> Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="pt-err__btn pt-err__btn--ghost"
          >
            <RefreshCw size={15} strokeWidth={2.5} /> Reload
          </button>
          <Link href="/home" className="pt-err__btn pt-err__btn--ghost">
            <Home size={15} strokeWidth={2.5} /> Home
          </Link>
        </div>
      </section>
    </main>
  )
}

const CSS = `
.pt-err {
  position: relative;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: 2rem 1.25rem;
  background:
    radial-gradient(120% 90% at 50% -10%, color-mix(in oklab, var(--pt-amber) 10%, transparent), transparent 60%),
    var(--pt-bg);
  text-align: center;
}
.pt-err__glow {
  position: absolute; inset: auto 0 0 0; height: 55%;
  background: radial-gradient(60% 100% at 50% 100%, color-mix(in oklab, var(--pt-amber) 10%, transparent), transparent 70%);
  pointer-events: none;
}
.pt-err__inner { position: relative; max-width: 30rem; display: flex; flex-direction: column; align-items: center; }

.pt-err__emblem { position: relative; width: 76px; height: 76px; margin-bottom: 1.5rem; display: grid; place-items: center; }
.pt-err__tile {
  position: relative; z-index: 2;
  width: 60px; height: 60px; border-radius: 18px;
  display: grid; place-items: center; color: #fff;
  background: linear-gradient(160deg, var(--pt-amber), color-mix(in oklab, var(--pt-amber) 78%, #b45309));
  box-shadow: 0 10px 30px -8px color-mix(in oklab, var(--pt-amber) 60%, transparent);
  animation: pt-err-bob 5s ease-in-out infinite;
}
.pt-err__ring {
  position: absolute; inset: 8px; border-radius: 20px;
  border: 2px solid color-mix(in oklab, var(--pt-amber) 55%, transparent);
  animation: pt-err-ring 2.8s ease-out infinite;
}
.pt-err__ring--2 { animation-delay: 1.4s; }

.pt-err__eyebrow {
  font-size: .72rem; font-weight: 700; letter-spacing: .18em; text-transform: uppercase;
  color: color-mix(in oklab, var(--pt-amber) 85%, var(--pt-text)); margin: 0;
  opacity: 0; animation: pt-err-rise .6s cubic-bezier(.22,1,.36,1) .05s forwards;
}
.pt-err__title {
  font-size: clamp(1.7rem, 5.5vw, 2.5rem); font-weight: 800; letter-spacing: -.02em; line-height: 1.06;
  color: var(--pt-text); margin: .5rem 0 0;
  opacity: 0; animation: pt-err-rise .6s cubic-bezier(.22,1,.36,1) .12s forwards;
}
.pt-err__sub {
  font-size: .975rem; line-height: 1.6; color: var(--pt-text-secondary); margin: .85rem 0 0; max-width: 26rem;
  opacity: 0; animation: pt-err-rise .6s cubic-bezier(.22,1,.36,1) .2s forwards;
}
.pt-err__digest {
  margin-top: .9rem; font-size: .72rem; font-family: var(--font-jetbrains-mono, ui-monospace, monospace);
  color: var(--pt-text-tertiary); background: var(--pt-muted); border: 1px solid var(--pt-border);
  padding: .2rem .55rem; border-radius: .4rem;
  opacity: 0; animation: pt-err-rise .6s cubic-bezier(.22,1,.36,1) .26s forwards;
}

.pt-err__actions {
  display: flex; flex-wrap: wrap; gap: .6rem; justify-content: center; margin-top: 1.5rem;
  opacity: 0; animation: pt-err-rise .6s cubic-bezier(.22,1,.36,1) .32s forwards;
}
.pt-err__btn {
  display: inline-flex; align-items: center; gap: .45rem; cursor: pointer;
  height: 2.75rem; padding: 0 1.2rem; border-radius: .75rem;
  font-size: .9rem; font-weight: 600; text-decoration: none;
  transition: transform .15s ease, background .15s ease, border-color .15s ease;
}
.pt-err__btn:active { transform: translateY(1px); }
.pt-err__btn--primary {
  color: #fff; border: none; background: var(--pt-green);
  box-shadow: 0 8px 20px -8px color-mix(in oklab, var(--pt-green) 70%, transparent);
}
.pt-err__btn--primary:hover { background: var(--pt-green-600); }
.pt-err__btn--ghost { color: var(--pt-text); background: var(--pt-surface); border: 1px solid var(--pt-border); }
.pt-err__btn--ghost:hover { border-color: var(--pt-border-strong); background: var(--pt-muted-strong); }

@keyframes pt-err-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes pt-err-bob  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes pt-err-ring { 0% { opacity: .5; transform: scale(.7); } 100% { opacity: 0; transform: scale(1.7); } }

@media (prefers-reduced-motion: reduce) {
  .pt-err__eyebrow, .pt-err__title, .pt-err__sub, .pt-err__digest, .pt-err__actions { opacity: 1; animation: none; }
  .pt-err__tile, .pt-err__ring { animation: none; }
}
`
