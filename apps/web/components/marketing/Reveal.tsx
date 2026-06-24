"use client"

import { useEffect, useRef, useState } from "react"

// Reveals its children with a smooth fade-up the first time they scroll into
// view (IntersectionObserver — broad browser support). Respects reduced-motion
// via the CSS in globals.css.
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} className={`mk-reveal${shown ? " mk-revealed" : ""}${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  )
}
