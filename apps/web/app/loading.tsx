import { Bricolage_Grotesque } from "next/font/google"
import { Cross } from "lucide-react"

// Route-transition loading UI (App Router). Server-rendered + CSS-only so it
// paints instantly, and shares the brand language of not-found / error:
// the medical-cross mark, pulse rings and --pt- tokens.
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["700", "800"] })

export default function Loading() {
  return (
    <div className="pt-load" role="status" aria-label="Loading">
      <style>{CSS}</style>
      <div className="pt-load__glow" aria-hidden />

      <div className="pt-load__emblem" aria-hidden>
        <span className="pt-load__ring" />
        <span className="pt-load__ring pt-load__ring--2" />
        <span className="pt-load__tile">
          <Cross size={28} strokeWidth={2.6} />
        </span>
      </div>

      <p className={`pt-load__word ${display.className}`}>
        Loading<span className="pt-load__dots"><i>.</i><i>.</i><i>.</i></span>
      </p>

      {/* Indeterminate progress: a bright segment sweeps the track on a loop. */}
      <div className="pt-load__track" aria-hidden>
        <span className="pt-load__bar" />
      </div>
    </div>
  )
}

const CSS = `
.pt-load {
  position: relative;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  overflow: hidden;
  padding: 2rem 1.25rem;
  background:
    radial-gradient(120% 90% at 50% -10%, color-mix(in oklab, var(--pt-green) 8%, transparent), transparent 60%),
    var(--pt-bg);
}
.pt-load__glow {
  position: absolute; inset: auto 0 0 0; height: 50%;
  background: radial-gradient(60% 100% at 50% 100%, color-mix(in oklab, var(--pt-green) 10%, transparent), transparent 70%);
  pointer-events: none;
}

.pt-load__emblem { position: relative; width: 76px; height: 76px; display: grid; place-items: center; }
.pt-load__tile {
  position: relative; z-index: 2;
  width: 60px; height: 60px; border-radius: 18px;
  display: grid; place-items: center; color: #fff;
  background: linear-gradient(160deg, var(--pt-green), var(--pt-green-600));
  box-shadow: 0 10px 30px -8px color-mix(in oklab, var(--pt-green) 60%, transparent);
  animation: pt-load-bob 2.4s ease-in-out infinite;
}
.pt-load__ring {
  position: absolute; inset: 8px; border-radius: 20px;
  border: 2px solid color-mix(in oklab, var(--pt-green) 55%, transparent);
  animation: pt-load-ring 2s ease-out infinite;
}
.pt-load__ring--2 { animation-delay: 1s; }

.pt-load__word {
  position: relative; z-index: 1;
  font-size: .95rem; font-weight: 700; letter-spacing: .04em;
  color: var(--pt-text-secondary); margin: 0;
  display: inline-flex; align-items: baseline;
}
.pt-load__dots { display: inline-flex; margin-left: 1px; }
.pt-load__dots i { font-style: normal; animation: pt-load-dot 1.4s infinite; opacity: 0; }
.pt-load__dots i:nth-child(2) { animation-delay: .2s; }
.pt-load__dots i:nth-child(3) { animation-delay: .4s; }

.pt-load__track {
  position: relative; z-index: 1;
  width: min(220px, 60vw); height: 4px; border-radius: 999px;
  background: var(--pt-muted-strong); overflow: hidden;
}
.pt-load__bar {
  position: absolute; inset: 0 auto 0 0; width: 40%; border-radius: 999px;
  background: linear-gradient(90deg, transparent, var(--pt-green), transparent);
  animation: pt-load-sweep 1.3s cubic-bezier(.4, 0, .2, 1) infinite;
}

@keyframes pt-load-bob   { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes pt-load-ring  { 0% { opacity: .5; transform: scale(.75); } 100% { opacity: 0; transform: scale(1.6); } }
@keyframes pt-load-dot   { 0%,60%,100% { opacity: 0; } 30% { opacity: 1; } }
@keyframes pt-load-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }

@media (prefers-reduced-motion: reduce) {
  .pt-load__tile, .pt-load__ring, .pt-load__bar, .pt-load__dots i { animation: none; }
  .pt-load__dots i { opacity: 1; }
  .pt-load__bar { width: 100%; background: var(--pt-green); }
}
`
