"use client"

import { useEffect, useState } from "react"
import { MessageCircle, X, Send, Loader2, CheckCircle2 } from "lucide-react"

const WHATSAPP_GREETING = encodeURIComponent("Hi! I'm interested in PharmaTrack for my pharmacy — can you tell me more?")

/**
 * Floating contact widget — hidden until the visitor scrolls a little, then
 * fades in and settles into a gentle continuous float (.mk-float, already
 * prefers-reduced-motion safe). Clicking opens a small chat-style popover:
 * the message is emailed straight to the operator via /api/contact, with a
 * WhatsApp deep link offered as a secondary option.
 */
export function ContactWidget({ whatsappLink }: { whatsappLink: string | null }) {
  const [shown, setShown] = useState(false)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [message, setMessage] = useState("")
  const [website, setWebsite] = useState("") // honeypot — real visitors never fill this
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onScroll = () => { if (window.scrollY > 150) setShown(true) }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  async function submit() {
    if (!message.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || undefined, phone: phone || undefined, message, website }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to send")
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSending(false)
    }
  }

  function reset() {
    setOpen(false)
    setTimeout(() => { setSent(false); setName(""); setPhone(""); setMessage(""); setError(null) }, 300)
  }

  return (
    <>
      <div
        className={`fixed bottom-24 right-5 z-50 w-[calc(100vw-2.5rem)] max-w-sm rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-2xl transition-all duration-300 origin-bottom-right ${
          open ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4 pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 rounded-t-2xl bg-[#25D366] text-white">
          <div>
            <p className="font-bold text-sm">PharmaTrack</p>
            <p className="text-[11px] text-white/85">Usually replies within a few hours</p>
          </div>
          <button onClick={reset} aria-label="Close chat" className="p-1 rounded-md hover:bg-white/15">
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          {sent ? (
            <div className="py-6 text-center">
              <CheckCircle2 size={32} className="mx-auto text-[var(--pt-green)] mb-2" />
              <p className="font-semibold text-sm">Message sent!</p>
              <p className="text-xs text-[var(--pt-text-secondary)] mt-1">We&apos;ll get back to you shortly.</p>
              <button onClick={reset} className="mt-4 text-xs font-semibold text-[var(--pt-green-600)] hover:underline">Close</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[13px] text-[var(--pt-text-secondary)]">Send us a message and we&apos;ll reply personally.</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name (optional)"
                className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--pt-border)] bg-[var(--pt-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--pt-border)] bg-[var(--pt-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Your message…"
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--pt-border)] bg-[var(--pt-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] resize-none"
              />
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />
              {error && <p className="text-xs text-[var(--pt-red)]">{error}</p>}
              <button
                onClick={submit}
                disabled={sending || !message.trim()}
                className="w-full h-10 rounded-lg bg-[#25D366] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Send message
              </button>
              {whatsappLink && (
                <a
                  href={`${whatsappLink}?text=${WHATSAPP_GREETING}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-[11px] text-[var(--pt-text-tertiary)] hover:underline pt-1"
                >
                  Or message us directly on WhatsApp
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Minimize chat" : "Chat with us"}
        className={`fixed bottom-5 right-5 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg shadow-black/25 transition-all duration-500 ease-out hover:scale-110 ${
          shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        } ${!open ? "mk-float" : ""}`}
      >
        {open ? <X size={26} /> : <MessageCircle size={26} />}
      </button>
    </>
  )
}
