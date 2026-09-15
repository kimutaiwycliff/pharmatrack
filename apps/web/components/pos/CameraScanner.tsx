"use client"

import { useEffect, useRef, useState } from "react"
import { X, Loader2, CameraOff } from "lucide-react"
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser"
import { parseBarcode, type BarcodeScanEvent } from "@pharmatrack/core"

// Camera barcode scanner (zxing). Reuses parseBarcode, so results flow through the
// same GTIN lookup as the USB wedge. Prefers the rear camera; keeps scanning so
// the cashier can rattle through a basket, de-duping the same code within 1.5s.
export function CameraScanner({
  onScan,
  onClose,
}: {
  onScan: (event: BarcodeScanEvent) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 })
  const onScanRef = useRef(onScan)
  useEffect(() => { onScanRef.current = onScan }, [onScan])

  const [status, setStatus] = useState<"starting" | "scanning" | "denied" | "error">("starting")
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    let cancelled = false

    async function start() {
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current!,
          (result) => {
            if (!result) return
            const text = result.getText()
            const now = Date.now()
            // Ignore a repeat of the same code within 1.5s (a scan lingers in frame).
            if (lastRef.current.code === text && now - lastRef.current.at < 1500) return
            lastRef.current = { code: text, at: now }
            setFlash(true)
            setTimeout(() => setFlash(false), 150)
            onScanRef.current(parseBarcode(text))
          },
        )
        if (cancelled) { controls.stop(); return }
        controlsRef.current = controls
        setStatus("scanning")
      } catch (err) {
        setStatus((err as Error)?.name === "NotAllowedError" ? "denied" : "error")
      }
    }
    start()

    return () => {
      cancelled = true
      controlsRef.current?.stop()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col" role="dialog" aria-label="Camera scanner">
      <div className="flex items-center justify-between px-4 h-14 text-white shrink-0">
        <span className="text-sm font-semibold">Scan a barcode</span>
        <button onClick={onClose} aria-label="Close scanner" className="p-2 -mr-2 rounded-lg hover:bg-white/10">
          <X size={22} />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />

        {/* Reticle */}
        {status === "scanning" && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className={`w-[70vw] max-w-sm aspect-[3/2] rounded-2xl border-2 transition-colors ${flash ? "border-[var(--pt-green)]" : "border-white/70"}`}>
              <div className="w-full h-full rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>
          </div>
        )}

        {status === "starting" && (
          <div className="absolute inset-0 grid place-items-center text-white/90">
            <span className="inline-flex items-center gap-2 text-sm"><Loader2 size={18} className="animate-spin" /> Starting camera…</span>
          </div>
        )}
        {(status === "denied" || status === "error") && (
          <div className="absolute inset-0 grid place-items-center px-8 text-center text-white/90">
            <div>
              <CameraOff size={28} className="mx-auto mb-3 opacity-80" />
              <p className="text-sm font-medium">
                {status === "denied" ? "Camera permission denied" : "Couldn't start the camera"}
              </p>
              <p className="text-xs text-white/60 mt-1">
                {status === "denied"
                  ? "Allow camera access in your browser, then reopen the scanner. On iPhone, Safari needs HTTPS (which we have)."
                  : "No camera found, or it's in use by another app. You can still use a USB scanner or type the code."}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 text-center text-white/70 text-xs shrink-0">
        Point the rear camera at the barcode. It keeps scanning — tap ✕ when you&rsquo;re done.
      </div>
    </div>
  )
}
