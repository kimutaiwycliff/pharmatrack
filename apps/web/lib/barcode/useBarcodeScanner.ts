"use client"

import { useEffect, useRef, useCallback } from "react"
import { parseBarcode, type BarcodeScanEvent } from "./barcodeParser"

interface UseBarcodeScanner {
  onScan: (event: BarcodeScanEvent) => void
  enabled?: boolean
}

// If 2+ chars arrive within this window → scanner (not human typing)
const SCANNER_THRESHOLD_MS = 50
// After this much silence with chars buffered → process the scan
const COMPLETION_TIMEOUT_MS = 100
// Minimum buffer length to treat as a barcode
const MIN_BARCODE_LENGTH = 3
// Minimum gap between two scans (prevent double-scan)
const DEBOUNCE_MS = 300

export function useBarcodeScanner({ onScan, enabled = true }: UseBarcodeScanner) {
  const bufferRef = useRef<string>("")
  const lastKeyTimeRef = useRef<number>(0)
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastScanTimeRef = useRef<number>(0)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  const processBuffer = useCallback(() => {
    const raw = bufferRef.current.trim()
    bufferRef.current = ""

    if (raw.length < MIN_BARCODE_LENGTH) return

    const now = Date.now()
    if (now - lastScanTimeRef.current < DEBOUNCE_MS) return
    lastScanTimeRef.current = now

    onScanRef.current(parseBarcode(raw))
  }, [])

  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore modifier-only keys
      if (e.key.length > 1 && e.key !== "Enter") return

      // If focused on an input/textarea, don't intercept unless it's Enter
      const target = e.target as HTMLElement
      const isInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      if (isInput && e.key !== "Enter") return

      const now = Date.now()
      const gap = now - lastKeyTimeRef.current
      lastKeyTimeRef.current = now

      if (e.key === "Enter") {
        if (completionTimerRef.current) {
          clearTimeout(completionTimerRef.current)
          completionTimerRef.current = null
        }
        if (bufferRef.current.length >= MIN_BARCODE_LENGTH) {
          processBuffer()
        } else {
          bufferRef.current = ""
        }
        return
      }

      // If the gap since last char is too long, this is human typing — reset buffer
      if (bufferRef.current.length > 0 && gap > SCANNER_THRESHOLD_MS * 2) {
        bufferRef.current = ""
      }

      bufferRef.current += e.key

      // Schedule auto-processing if no Enter arrives
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
      completionTimerRef.current = setTimeout(() => {
        processBuffer()
      }, COMPLETION_TIMEOUT_MS)
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    }
  }, [enabled, processBuffer])
}
