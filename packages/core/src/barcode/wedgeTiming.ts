// Shared tuning + pure decision logic for USB/Bluetooth-HID "keyboard wedge"
// barcode scanners: they inject keystrokes fast enough to distinguish from a
// human typing, terminated by Enter. Web (apps/web/lib/barcode/useBarcodeScanner.ts)
// and mobile (apps/mobile's hardware scan catcher) both listen for raw
// keystrokes on their own platform-specific surface (DOM keydown vs a hidden
// TextInput's onKeyPress) but must agree on these thresholds so a given
// scanner behaves identically on both.

// If 2+ chars arrive within this window → scanner (not human typing)
export const SCANNER_THRESHOLD_MS = 50
// After this much silence with chars buffered → process the scan
export const COMPLETION_TIMEOUT_MS = 100
// Minimum buffer length to treat as a barcode
export const MIN_BARCODE_LENGTH = 3
// Minimum gap between two scans (prevent double-scan)
export const DEBOUNCE_MS = 300

// True when the gap since the last keystroke is long enough that the buffer
// should be discarded rather than appended to (this keystroke starts a new,
// unrelated burst — most likely human typing after a scan already timed out).
export function isStaleGap(gapMs: number): boolean {
  return gapMs > SCANNER_THRESHOLD_MS * 2
}

/** GS1 group separator (FNC1 inside a code), ASCII 29. */
export const WEDGE_GS = "\x1D"

// What one keystroke adds to a scan buffer, or null to ignore it. A wedge
// scanner can't type ASCII 29, so in keyboard mode it sends Ctrl+] (US layout)
// for the separator between variable-length GS1 fields (batch, serial). Read
// as a plain "]" it would glue the batch to the next field and break expiry.
export function wedgeKeyChar(e: { key: string; code?: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }): string | null {
  if (e.key === WEDGE_GS) return WEDGE_GS
  if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === "]" || e.code === "BracketRight")) return WEDGE_GS
  if (e.ctrlKey || e.altKey || e.metaKey) return null
  return e.key.length === 1 ? e.key : null
}

// A burst this long into a text box is a scanner, not someone typing.
export const INPUT_SCAN_MIN_LENGTH = 6

/**
 * Enter pressed in the till's search box: was that a barcode? `burst` is the
 * run of keystrokes ≤ SCANNER_THRESHOLD_MS apart just before Enter (GS kept);
 * `value` is what's in the box. A burst counts only if it looks like a code —
 * no spaces, at least one digit — so a quick typist's "augmentin" stays a
 * search. Otherwise a typed barcode — 8–14 digits, GS1 "(01)…"/"01…", or one
 * of our own "PT…" codes — still counts. Returns the code to look up, or null
 * to treat Enter as a normal search.
 */
export function scanFromSearchBox(burst: string, value: string): string | null {
  const typed = value.trim()
  const plain = burst.split(WEDGE_GS).join("")
  if (plain.length >= INPUT_SCAN_MIN_LENGTH && !/\s/.test(plain) && /\d/.test(plain) && typed.endsWith(plain)) return burst
  if (/^\d{8,14}$/.test(typed) || /^\(01\)\d{14}/.test(typed) || /^01\d{14}/.test(typed) || /^PT[0-9A-Z]{8,}$/.test(typed)) return typed
  return null
}

// True when a completed buffer is long enough, and far enough past the last
// accepted scan, to be treated as a genuine new scan rather than noise or an
// accidental double-read of the same label.
export function canAcceptScan(bufferLength: number, now: number, lastScanTime: number): boolean {
  return bufferLength >= MIN_BARCODE_LENGTH && now - lastScanTime >= DEBOUNCE_MS
}
