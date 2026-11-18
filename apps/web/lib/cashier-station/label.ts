// Order numbers restart each Nairobi day per branch and are shown short, so a
// cashier can call them out: 1 → "A-001" … 999 → "A-999", 1000 → "B-001".

export function orderLabel(n: number): string {
  const i = Math.max(1, Math.floor(n)) - 1
  const letter = String.fromCharCode(65 + (Math.floor(i / 999) % 26))
  return `${letter}-${String((i % 999) + 1).padStart(3, "0")}`
}

/** Read "A-047", "a47" or "47" back to its number; null if it isn't one. */
export function parseOrderLabel(text: string): number | null {
  const m = /^\s*(?:([a-z])\s*-?\s*)?(\d{1,3})\s*$/i.exec(text)
  if (!m) return null
  const block = m[1] ? m[1].toUpperCase().charCodeAt(0) - 65 : 0
  const n = Number(m[2])
  if (n < 1 || n > 999) return null
  return block * 999 + n
}
