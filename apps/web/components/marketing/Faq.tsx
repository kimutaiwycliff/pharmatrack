"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { FAQ as QA } from "@/lib/marketing/content"


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
