// Hardware (USB/Bluetooth HID) scanners type into whatever field has focus —
// usually the POS search box. They "type" a whole code in a burst (well under
// 40 ms between keystrokes) and finish with Enter; people don't. This tells
// the two apart from onChangeText/onSubmitEditing timestamps so a scan adds
// the product instead of running a search, and whatever the cashier had typed
// before the burst is restored. Pure + clock-injected for tests.

export const BURST_GAP_MS = 40
/** Enter must follow the last burst character this quickly. */
export const BURST_SUBMIT_MS = 80
export const MIN_SCAN_LENGTH = 4

export type SubmitResult = { kind: "scan"; code: string; rest: string } | { kind: "search"; text: string }

export interface BurstDetector {
  change: (text: string, now: number) => void
  submit: (text: string, now: number) => SubmitResult
  reset: () => void
}

export function createBurstDetector(opts: { gapMs?: number; submitMs?: number; minLength?: number } = {}): BurstDetector {
  const gapMs = opts.gapMs ?? BURST_GAP_MS
  const submitMs = opts.submitMs ?? BURST_SUBMIT_MS
  const minLength = opts.minLength ?? MIN_SCAN_LENGTH
  let prev = ""
  let lastAt = Number.NEGATIVE_INFINITY
  // Index in the text where the current burst began; -1 = no burst.
  let burstFrom = -1

  return {
    change(text, now) {
      const appended = text.length > prev.length && text.startsWith(prev)
      if (!appended) burstFrom = -1 // deletion / edit in the middle: not a scanner
      else if (burstFrom === -1 || now - lastAt > gapMs) burstFrom = prev.length // new burst starts with this input
      prev = text
      lastAt = now
    },
    submit(text, now) {
      const fromBurst = burstFrom >= 0 && text === prev && now - lastAt <= submitMs && text.length - burstFrom >= minLength
      const result: SubmitResult = fromBurst
        ? { kind: "scan", code: text.slice(burstFrom).trim(), rest: text.slice(0, burstFrom) }
        : { kind: "search", text }
      burstFrom = -1
      return result
    },
    reset() {
      prev = ""
      lastAt = Number.NEGATIVE_INFINITY
      burstFrom = -1
    },
  }
}
