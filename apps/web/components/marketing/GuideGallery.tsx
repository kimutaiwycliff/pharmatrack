"use client"

import { useState, useCallback, useEffect } from "react"
import Image from "next/image"
import { X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react"

export interface GuideShot {
  src: string
  width: number
  height: number
  caption: string
}

// Screenshot grid for one guide chapter, with a click-to-enlarge lightbox
// (arrow keys / Escape / backdrop click) scoped to that chapter's own shots.
export function GuideGallery({ shots }: { shots: GuideShot[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const close = useCallback(() => setOpenIndex(null), [])
  const prev = useCallback(() => setOpenIndex((i) => (i === null ? null : (i - 1 + shots.length) % shots.length)), [shots.length])
  const next = useCallback(() => setOpenIndex((i) => (i === null ? null : (i + 1) % shots.length)), [shots.length])

  useEffect(() => {
    if (openIndex === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close()
      if (e.key === "ArrowLeft") prev()
      if (e.key === "ArrowRight") next()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openIndex, close, prev, next])

  return (
    <>
      <div className={shots.length > 1 ? "grid sm:grid-cols-2 gap-5" : ""}>
        {shots.map((s, i) => (
          <figure key={s.src} className="m-0">
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              className="group relative block w-full overflow-hidden rounded-xl border border-[var(--pt-border)] shadow-sm text-left"
              aria-label={`Enlarge screenshot: ${s.caption}`}
            >
              <Image src={s.src} width={s.width} height={s.height} alt={s.caption} loading="lazy" sizes="(min-width: 640px) 50vw, 100vw" className="w-full h-auto block" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                <ZoomIn size={22} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </span>
            </button>
            <figcaption className="mt-2 text-xs text-[var(--pt-text-secondary)] leading-relaxed">{s.caption}</figcaption>
          </figure>
        ))}
      </div>

      {openIndex !== null && shots[openIndex] && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label={shots[openIndex].caption}
          onClick={close}
        >
          <div className="flex items-center justify-between px-4 sm:px-6 h-14 shrink-0 text-white/80">
            <span className="text-sm truncate pr-4">{shots[openIndex].caption}</span>
            <button type="button" onClick={close} aria-label="Close" className="p-2 rounded-lg hover:bg-white/10 shrink-0">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center px-4 sm:px-14 pb-6 min-h-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shots[openIndex].src}
              alt={shots[openIndex].caption}
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {shots.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); prev() }}
                aria-label="Previous screenshot"
                className="fixed left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); next() }}
                aria-label="Next screenshot"
                className="fixed right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}
