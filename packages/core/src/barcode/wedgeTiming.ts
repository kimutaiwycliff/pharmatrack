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

// True when a completed buffer is long enough, and far enough past the last
// accepted scan, to be treated as a genuine new scan rather than noise or an
// accidental double-read of the same label.
export function canAcceptScan(bufferLength: number, now: number, lastScanTime: number): boolean {
  return bufferLength >= MIN_BARCODE_LENGTH && now - lastScanTime >= DEBOUNCE_MS
}
