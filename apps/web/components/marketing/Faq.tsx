"use client"

import { useState } from "react"
import { Plus } from "lucide-react"

const QA = [
  { q: "How long does setup take?", a: "Most pharmacies are selling the same day. Load the Kenyan catalogue in one click, set your prices and opening stock in a bulk grid, and you're live — usually in under an hour." },
  { q: "Does it really work offline?", a: "Yes. The POS caches your full branch catalogue on the device and queues sales while offline — with no time limit. When the connection returns, sales sync automatically and the server removes any duplicates." },
  { q: "Can I move my existing data in?", a: "Import products and opening stock from a CSV (up to 2,000 rows) with column auto-mapping and a preview before anything is created. We'll help with migration on Growth and Enterprise." },
  { q: "Is M-Pesa included?", a: "Yes — M-Pesa STK Push runs at checkout and confirmation callbacks are matched to the sale automatically. Cash, card and split payments are supported too." },
  { q: "Can I run more than one branch?", a: "Yes. Growth covers up to three branches and Enterprise is unlimited, each with its own stock, staff and reports — owners and managers switch between them, while cashiers are locked to their own branch." },
  { q: "Do I own my data?", a: "Always. You can self-host the entire platform on your own server, or we host it for you. There's no lock-in either way, and you can export your data." },
  { q: "Is it compliant with PPB?", a: "The controlled-substances register is built in and fills itself from every dispensed controlled sale, ready to export in a PPB-friendly format." },
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="bg-[var(--pt-surface)] border-y border-[var(--pt-border)]">
      <div className="mx-auto max-w-3xl px-5 py-20 md:py-28">
        <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight text-center">
          Questions, answered.
        </h2>
        <div className="mt-10 divide-y divide-[var(--pt-border)] border-y border-[var(--pt-border)]">
          {QA.map((item, i) => {
            const isOpen = open === i
            return (
              <div key={item.q}>
                <button onClick={() => setOpen(isOpen ? null : i)} className="w-full flex items-center justify-between gap-4 py-5 text-left">
                  <span className="font-semibold text-[var(--pt-text)]">{item.q}</span>
                  <Plus size={18} className={`shrink-0 text-[var(--pt-green-600)] transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`} />
                </button>
                <div className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100 pb-5" : "grid-rows-[0fr] opacity-0"}`}>
                  <p className="overflow-hidden text-[var(--pt-text-secondary)] leading-relaxed">{item.a}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
