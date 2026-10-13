// Ignore a repeat tap within `ms` (vitest-tested). Used for navigation, where
// a double tap would otherwise push the same screen twice (cf. app/scan.tsx).
export function createTapGuard(ms: number, now: () => number = Date.now) {
  let last = -Infinity
  return function allow(): boolean {
    const t = now()
    if (t - last < ms) return false
    last = t
    return true
  }
}
