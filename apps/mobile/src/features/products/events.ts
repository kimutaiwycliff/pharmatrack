import { useEffect, useRef } from "react"

// A tiny "products changed" signal. The list, the detail pane and the detail
// route live in different stack screens that all stay mounted, so after a save
// on /products/[id]/edit (or a deactivate in the tablet detail pane) the
// screens underneath refetch in the background instead of showing stale rows.

const listeners = new Set<() => void>()

export function notifyProductsChanged(): void {
  for (const l of [...listeners]) l()
}

/** Calls `refresh` whenever another screen reports a product change. */
export function useRefreshOnProductsChange(refresh: () => void): void {
  const ref = useRef(refresh)
  useEffect(() => {
    ref.current = refresh
  })
  useEffect(() => {
    const l = () => ref.current()
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
}
