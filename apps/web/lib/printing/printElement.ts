"use client"

import type { PaperWidth } from "@pharmatrack/core"

// Print one element through the browser's print dialog, from its own little
// document. Printing the live page meant fighting everything around the
// receipt — the dialog's fixed position and Tailwind `translate` centring, a
// 55vh scroll box, enter animations, and a CSS minifier that folds
// `translate: none` into `transform` — which pushed the receipt half off the
// page in production. A hidden iframe holding only the receipt (with the app's
// stylesheets, so it looks the same) has none of that: it prints from the top
// at full length, like the PDF does.

export async function printElement(el: HTMLElement, paper: PaperWidth): Promise<void> {
  const frame = document.createElement("iframe")
  frame.setAttribute("aria-hidden", "true")
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden"
  document.body.appendChild(frame)
  const win = frame.contentWindow
  const doc = frame.contentDocument
  if (!win || !doc) {
    frame.remove()
    window.print()
    return
  }

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join("")
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title>${styles}
<style>
  @page { size: ${paper} auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  #receipt-printable { margin: 0 auto; }
</style></head><body>${el.outerHTML}</body></html>`)
  doc.close()

  // Wait for the copied stylesheets (served from cache) before printing.
  await Promise.all(Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map((l) =>
    (l as HTMLLinkElement).sheet ? null : new Promise((done) => {
      l.addEventListener("load", done, { once: true })
      l.addEventListener("error", done, { once: true })
      setTimeout(done, 3000)
    }),
  ))
  await doc.fonts?.ready

  const cleanup = () => setTimeout(() => frame.remove(), 500)
  win.addEventListener("afterprint", cleanup, { once: true })
  win.focus()
  win.print()
  // Some browsers don't fire afterprint for iframes; don't leave it behind.
  setTimeout(() => { if (frame.isConnected) frame.remove() }, 60_000)
}
