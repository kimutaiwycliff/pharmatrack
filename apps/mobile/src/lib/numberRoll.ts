// Pure maths behind <AnimatedNumber> (vitest-tested): a money/quantity figure
// "rolls" from the old value to the new one in integer steps and always lands
// EXACTLY on the new value — the roll is cosmetic, never a rounding source.

/** Ease-out cubic: fast start, gentle landing. */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3)

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

/** Integer value shown at progress `t` (0..1) of a roll from `from` to `to`. */
export function rollFrame(from: number, to: number, t: number): number {
  if (t >= 1) return to
  if (t <= 0) return from
  return Math.round(from + (to - from) * easeOutCubic(t))
}

/**
 * Should this change roll, or just snap? Snaps when animation is off, on the
 * first value, when nothing changed, and while the value is being typed (a
 * change arriving within `burstMs` of the previous one — keypad entry).
 */
export function shouldRoll(opts: {
  enabled: boolean
  reduced: boolean
  from: number | null
  to: number
  lastChangeAt: number | null
  now: number
  burstMs?: number
}): boolean {
  const { enabled, reduced, from, to, lastChangeAt, now, burstMs = 350 } = opts
  if (!enabled || reduced || from === null || from === to) return false
  if (lastChangeAt !== null && now - lastChangeAt < burstMs) return false
  return true
}
