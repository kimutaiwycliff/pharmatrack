// Trailing-debounced persistence with an explicit flush (vitest-tested; used
// by store/cart.ts). Rapid changes (a scanning burst) cost one write instead
// of one per scan; `writeNow` and `flush` exist for the moments where losing
// the last few hundred ms is not acceptable (cart cleared after a sale, app
// going to the background, right before a sale is committed).

export interface TimerApi {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

const realTimers: TimerApi = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

export interface DebouncedWriter<T> {
  /** Remember `value` and write it after `delayMs` of quiet. */
  schedule: (value: T) => void
  /** Write `value` immediately, dropping anything pending. */
  writeNow: (value: T) => void
  /** Write the pending value now (no-op when nothing is pending). */
  flush: () => void
  hasPending: () => boolean
}

export function createDebouncedWriter<T>(write: (value: T) => void, delayMs: number, timers: TimerApi = realTimers): DebouncedWriter<T> {
  let pending: { value: T } | null = null
  let handle: unknown = null

  const cancel = () => {
    if (handle !== null) timers.clear(handle)
    handle = null
  }

  const flush = () => {
    cancel()
    if (!pending) return
    const { value } = pending
    pending = null
    write(value)
  }

  return {
    schedule(value) {
      pending = { value }
      cancel()
      handle = timers.set(flush, delayMs)
    },
    writeNow(value) {
      cancel()
      pending = null
      write(value)
    },
    flush,
    hasPending: () => pending !== null,
  }
}
