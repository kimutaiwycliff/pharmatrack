"use client"

import { useCallback, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/**
 * A page's filters kept in the address bar (?status=low_stock&page=2), so a
 * view can be bookmarked, shared or linked to (the bell, dashboard chips) and
 * survives refresh and Back. Values equal to their default are left out of
 * the URL. Updates replace the history entry — typing doesn't fill Back.
 */
export function useUrlParams<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>, opts?: { push?: boolean }) => void] {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const values = useMemo(() => {
    const out = { ...defaults }
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const v = searchParams.get(key as string)
      if (v !== null) out[key] = v as T[keyof T]
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaults is a literal per page
  }, [searchParams])

  // `push` adds a history entry instead (switching tabs: Back goes to the last tab).
  const set = useCallback((patch: Partial<T>, opts?: { push?: boolean }) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, v] of Object.entries(patch)) {
      if (v === undefined || v === defaults[key]) next.delete(key)
      else next.set(key, v as string)
    }
    const qs = next.toString()
    const url = qs ? `${pathname}?${qs}` : pathname
    if (opts?.push) router.push(url, { scroll: false })
    else router.replace(url, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaults is a literal per page
  }, [searchParams, pathname, router])

  return [values, set]
}
