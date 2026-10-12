import { useCallback, useEffect, useRef, useState } from "react"
import { apiJson, errorMessage } from "../lib/api"

// R3: tiny data hooks so every online screen gets the same loading / error /
// retry / pull-to-refresh / paging behaviour without hand-rolling it. State is
// keyed: when `key` changes (new filter, branch, search) the old data is
// dropped and `loading` is true again, so a skeleton shows instead of stale
// rows. A null key means "don't fetch yet". setState only ever happens after
// an await, keeping the react-hooks/set-state-in-effect rule happy.

export interface QueryState<T> {
  data: T | undefined
  error: string | null
  /** First load for this key (show a skeleton). */
  loading: boolean
  /** Pull-to-refresh in flight (data stays on screen). */
  refreshing: boolean
  refresh: () => void
  retry: () => void
  /** Replace the data locally (after a successful mutation). */
  setData: (updater: (prev: T | undefined) => T | undefined) => void
}

export function useQuery<T>(key: string | null, fetcher: (key: string) => Promise<T>): QueryState<T> {
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })
  const [state, setState] = useState<{ key: string | null; data: T | undefined; error: string | null }>({
    key: null,
    data: undefined,
    error: null,
  })
  const [token, setToken] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!key) return
    let cancelled = false
    fetcherRef
      .current(key)
      .then(
        (data) => {
          if (!cancelled) setState({ key, data, error: null })
        },
        (err: unknown) => {
          if (!cancelled) setState((s) => ({ key, data: s.key === key ? s.data : undefined, error: errorMessage(err) }))
        },
      )
      .finally(() => {
        if (!cancelled) setRefreshing(false)
      })
    return () => {
      cancelled = true
    }
  }, [key, token])

  const current = state.key === key ? state : null
  const refresh = useCallback(() => {
    setRefreshing(true)
    setToken((t) => t + 1)
  }, [])
  const retry = useCallback(() => {
    setState((s) => ({ ...s, error: null }))
    setToken((t) => t + 1)
  }, [])
  const setData = useCallback(
    (updater: (prev: T | undefined) => T | undefined) => setState((s) => ({ ...s, data: updater(s.data) })),
    [],
  )

  return {
    data: current?.data,
    error: current?.error ?? null,
    loading: !!key && (!current || (current.data === undefined && current.error === null)),
    refreshing,
    refresh,
    retry,
    setData,
  }
}

/** GET an API path as JSON (null path = skip). */
export function useApiQuery<T>(path: string | null): QueryState<T> {
  return useQuery<T>(path, (p) => apiJson<T>(p))
}

// ── Paged lists ──────────────────────────────────────────────────────────────

export interface Page<TItem> {
  items: TItem[]
  total: number
}

export interface PagedState<TItem> {
  items: TItem[]
  total: number
  error: string | null
  loading: boolean
  refreshing: boolean
  loadingMore: boolean
  hasMore: boolean
  /** Wire to FlashList/FlatList onEndReached. */
  loadMore: () => void
  refresh: () => void
  retry: () => void
  /** Patch rows locally after a mutation. */
  setItems: (updater: (prev: TItem[]) => TItem[]) => void
}

interface PagedInternal<TItem> {
  key: string | null
  items: TItem[]
  total: number
  page: number
  error: string | null
  loaded: boolean
}

/**
 * Page-numbered lists (the web APIs take `page` + `limit` and return a total).
 * `key` identifies the query (path + filters); `fetchPage(page)` loads one page.
 */
export function usePagedQuery<TItem>(key: string | null, fetchPage: (page: number) => Promise<Page<TItem>>): PagedState<TItem> {
  const fetchRef = useRef(fetchPage)
  useEffect(() => {
    fetchRef.current = fetchPage
  })
  const [s, setS] = useState<PagedInternal<TItem>>({ key: null, items: [], total: 0, page: 0, error: null, loaded: false })
  const [token, setToken] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const keyRef = useRef(key)
  useEffect(() => {
    keyRef.current = key
  }, [key])

  useEffect(() => {
    if (!key) return
    let cancelled = false
    fetchRef
      .current(1)
      .then(
        (p) => {
          if (!cancelled) setS({ key, items: p.items, total: p.total, page: 1, error: null, loaded: true })
        },
        (err: unknown) => {
          if (!cancelled) setS((prev) => (prev.key === key ? { ...prev, error: errorMessage(err) } : { key, items: [], total: 0, page: 0, error: errorMessage(err), loaded: false }))
        },
      )
      .finally(() => {
        if (!cancelled) setRefreshing(false)
      })
    return () => {
      cancelled = true
    }
  }, [key, token])

  const current = s.key === key ? s : null
  const hasMore = !!current && current.loaded && current.items.length < current.total

  const loadMore = useCallback(() => {
    if (loadingMore || !current || !hasMore || current.error) return
    const forKey = current.key
    const next = current.page + 1
    setLoadingMore(true)
    fetchRef
      .current(next)
      .then(
        (p) => {
          if (keyRef.current !== forKey) return
          setS((prev) => (prev.key === forKey ? { ...prev, items: [...prev.items, ...p.items], total: p.total, page: next } : prev))
        },
        (err: unknown) => {
          if (keyRef.current !== forKey) return
          setS((prev) => (prev.key === forKey ? { ...prev, error: errorMessage(err) } : prev))
        },
      )
      .finally(() => setLoadingMore(false))
  }, [loadingMore, current, hasMore])

  const refresh = useCallback(() => {
    setRefreshing(true)
    setToken((t) => t + 1)
  }, [])
  const retry = useCallback(() => {
    setS((prev) => ({ ...prev, error: null }))
    setToken((t) => t + 1)
  }, [])
  const setItems = useCallback((updater: (prev: TItem[]) => TItem[]) => setS((prev) => ({ ...prev, items: updater(prev.items) })), [])

  return {
    items: current?.items ?? [],
    total: current?.total ?? 0,
    error: current?.error ?? null,
    loading: !!key && (!current || (!current.loaded && !current.error)),
    refreshing,
    loadingMore,
    hasMore,
    loadMore,
    refresh,
    retry,
    setItems,
  }
}
