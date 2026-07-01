import Link from "next/link"
import { Bricolage_Grotesque } from "next/font/google"
import { Cross, ArrowRight, Search } from "lucide-react"

// Brand display face (same as the marketing site) — this page lives at the app
// root, outside the marketing layout that defines --font-display, so we load it
// locally. Server-rendered + CSS-only animations = zero client JS, instant paint.
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700", "800"] })

export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
}

// A classic PQRST heartbeat trace; pathLength=100 normalises the dash maths so
// one bright pulse can run the whole line regardless of its real length.
const ECG_POINTS =
  "0,30 92,30 104,30 112,16 122,44 132,8 143,40 152,30 176,30 184,36 192,30 360,30"

export default function NotFound() {
  return (
    <main className="pt-nf">
      <style>{CSS}</style>

      {/* Ambient brand glow + drifting capsules — purely decorative */}
      <div className="pt-nf__glow" aria-hidden />
      <span className="pt-nf__pill pt-nf__pill--a" aria-hidden />
      <span className="pt-nf__pill pt-nf__pill--b" aria-hidden />
      <span className="pt-nf__pill pt-nf__pill--c" aria-hidden />

      <section className="pt-nf__inner">
        <div className="pt-nf__emblem" aria-hidden>
          <span className="pt-nf__ring" />
          <span className="pt-nf__ring pt-nf__ring--2" />
          <span className="pt-nf__tile">
            <Cross size={30} strokeWidth={2.6} />
          </span>
        </div>

        <p className={`pt-nf__eyebrow ${display.className}`}>Error 404</p>
        <h1 className={`pt-nf__title ${display.className}`}>This page is out of stock</h1>
        <p className="pt-nf__sub">
          We looked on every shelf but couldn&rsquo;t find what you were after. The link may be
          broken, or the page has been moved.
        </p>

        {/* Heartbeat trace: a faint full line with one glowing pulse travelling it */}
        <svg className="pt-nf__ecg" viewBox="0 0 360 56" role="img" aria-label="">
          <polyline className="pt-nf__ecg-track" points={ECG_POINTS} />
          <polyline className="pt-nf__ecg-pulse" points={ECG_POINTS} pathLength={100} />
        </svg>

        <div className="pt-nf__actions">
          <Link href="/" className="pt-nf__btn pt-nf__btn--primary">
            Back to homepage <ArrowRight size={16} strokeWidth={2.5} />
          </Link>
          <Link href="/home" className="pt-nf__btn pt-nf__btn--ghost">
            <Search size={15} strokeWidth={2.5} /> Open the app
          </Link>
        </div>
      </section>
    </main>
  )
}

const CSS = `
.pt-nf {
  position: relative;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: 2rem 1.25rem;
  background:
    radial-gradient(120% 90% at 50% -10%, color-mix(in oklab, var(--pt-green) 9%, transparent), transparent 60%),
    var(--pt-bg);
  text-align: center;
}
.pt-nf__glow {
  position: absolute; inset: auto 0 0 0; height: 55%;
  background: radial-gradient(60% 100% at 50% 100%, color-mix(in oklab, var(--pt-green) 12%, transparent), transparent 70%);
  pointer-events: none;
}
.pt-nf__inner {
  position: relative;
  max-width: 30rem;
  display: flex; flex-direction: column; align-items: center;
}

/* Emblem: brand tile behind two expanding pulse rings */
.pt-nf__emblem { position: relative; width: 76px; height: 76px; margin-bottom: 1.5rem; display: grid; place-items: center; }
.pt-nf__tile {
  position: relative; z-index: 2;
  width: 60px; height: 60px; border-radius: 18px;
  display: grid; place-items: center; color: #fff;
  background: linear-gradient(160deg, var(--pt-green), var(--pt-green-600));
  box-shadow: 0 10px 30px -8px color-mix(in oklab, var(--pt-green) 60%, transparent);
  animation: pt-nf-bob 5s ease-in-out infinite;
}
.pt-nf__ring {
  position: absolute; inset: 8px; border-radius: 20px;
  border: 2px solid color-mix(in oklab, var(--pt-green) 55%, transparent);
  animation: pt-nf-ring 2.8s ease-out infinite;
}
.pt-nf__ring--2 { animation-delay: 1.4s; }

.pt-nf__eyebrow {
  font-size: .72rem; font-weight: 700; letter-spacing: .18em; text-transform: uppercase;
  color: var(--pt-green-600); margin: 0;
  opacity: 0; animation: pt-nf-rise .6s cubic-bezier(.22,1,.36,1) .05s forwards;
}
.pt-nf__title {
  font-size: clamp(1.9rem, 6vw, 2.75rem); font-weight: 800; letter-spacing: -.02em; line-height: 1.05;
  color: var(--pt-text); margin: .5rem 0 0;
  opacity: 0; animation: pt-nf-rise .6s cubic-bezier(.22,1,.36,1) .12s forwards;
}
.pt-nf__sub {
  font-size: .975rem; line-height: 1.6; color: var(--pt-text-secondary); margin: .85rem 0 0; max-width: 26rem;
  opacity: 0; animation: pt-nf-rise .6s cubic-bezier(.22,1,.36,1) .2s forwards;
}

.pt-nf__ecg { width: 100%; max-width: 320px; height: auto; margin: 1.6rem 0 .4rem; overflow: visible; }
.pt-nf__ecg-track {
  fill: none; stroke: var(--pt-border-strong); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; opacity: .55;
}
.pt-nf__ecg-pulse {
  fill: none; stroke: var(--pt-green); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;
  stroke-dasharray: 14 100; stroke-dashoffset: 114;
  filter: drop-shadow(0 0 5px color-mix(in oklab, var(--pt-green) 70%, transparent));
  animation: pt-nf-trace 2.6s linear infinite;
}

.pt-nf__actions {
  display: flex; flex-wrap: wrap; gap: .6rem; justify-content: center; margin-top: 1.4rem;
  opacity: 0; animation: pt-nf-rise .6s cubic-bezier(.22,1,.36,1) .3s forwards;
}
.pt-nf__btn {
  display: inline-flex; align-items: center; gap: .45rem;
  height: 2.75rem; padding: 0 1.3rem; border-radius: .75rem;
  font-size: .9rem; font-weight: 600; text-decoration: none;
  transition: transform .15s ease, background .15s ease, border-color .15s ease, box-shadow .15s ease;
}
.pt-nf__btn:active { transform: translateY(1px); }
.pt-nf__btn--primary {
  color: #fff; background: var(--pt-green);
  box-shadow: 0 8px 20px -8px color-mix(in oklab, var(--pt-green) 70%, transparent);
}
.pt-nf__btn--primary:hover { background: var(--pt-green-600); }
.pt-nf__btn--ghost {
  color: var(--pt-text); background: var(--pt-surface); border: 1px solid var(--pt-border);
}
.pt-nf__btn--ghost:hover { border-color: var(--pt-border-strong); background: var(--pt-muted-strong); }

/* Drifting capsule pills */
.pt-nf__pill {
  position: absolute; border-radius: 999px; pointer-events: none;
  background: linear-gradient(180deg, color-mix(in oklab, var(--pt-green) 22%, transparent), transparent);
  border: 1px solid color-mix(in oklab, var(--pt-green) 22%, transparent);
}
.pt-nf__pill--a { width: 84px; height: 34px; top: 16%;  left: 12%;  --r: rotate(-24deg); transform: translateY(0) var(--r); animation: pt-nf-float 7s ease-in-out infinite; }
.pt-nf__pill--b { width: 56px; height: 24px; top: 24%;  right: 14%; --r: rotate(18deg);  transform: translateY(0) var(--r); animation: pt-nf-float 9s ease-in-out infinite reverse; }
.pt-nf__pill--c { width: 68px; height: 28px; bottom: 18%; left: 18%; --r: rotate(12deg);  transform: translateY(0) var(--r); animation: pt-nf-float 8s ease-in-out infinite; }

@keyframes pt-nf-rise  { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes pt-nf-bob   { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes pt-nf-float { 0%,100% { transform: translateY(0) var(--r, rotate(0deg)); } 50% { transform: translateY(-14px) var(--r, rotate(0deg)); } }
@keyframes pt-nf-ring  { 0% { opacity: .5; transform: scale(.7); } 100% { opacity: 0; transform: scale(1.7); } }
@keyframes pt-nf-trace { to { stroke-dashoffset: 14; } }

@media (prefers-reduced-motion: reduce) {
  .pt-nf__eyebrow, .pt-nf__title, .pt-nf__sub, .pt-nf__actions { opacity: 1; animation: none; }
  .pt-nf__tile, .pt-nf__ring, .pt-nf__ecg-pulse, .pt-nf__pill { animation: none; }
  .pt-nf__ecg-pulse { stroke-dashoffset: 40; }
}
`
