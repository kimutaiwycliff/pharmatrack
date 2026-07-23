"use client"

import { useEffect, useState } from "react"
import { MessageCircle } from "lucide-react"

const GREETING = encodeURIComponent("Hi! I'm interested in PharmaTrack for my pharmacy — can you tell me more?")

/**
 * Persistent WhatsApp contact button — hidden until the visitor scrolls a
 * little, then fades/slides in and settles into a gentle continuous float
 * (reuses the site's .mk-float keyframe, which already respects
 * prefers-reduced-motion) to draw the eye without being obnoxious.
 */
export function FloatingWhatsApp({ whatsappLink }: { whatsappLink: string | null }) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!whatsappLink) return
    const onScroll = () => { if (window.scrollY > 150) setShown(true) }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [whatsappLink])

  if (!whatsappLink) return null

  return (
    <a
      href={`${whatsappLink}?text=${GREETING}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className={`fixed bottom-5 right-5 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg shadow-black/25 transition-all duration-500 ease-out hover:scale-110 ${
        shown ? "opacity-100 translate-y-0 mk-float" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <MessageCircle size={26} />
    </a>
  )
}
