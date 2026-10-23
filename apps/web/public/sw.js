/* PharmaTrack service worker — installable PWA + resilient asset/navigation caching.
 * Intentionally simple and framework-agnostic (no build step):
 *  - static build assets: stale-while-revalidate
 *  - navigations: network-first, fall back to the last cached shell when offline
 *  - "warm" message: the page hands over its own URL + loaded assets, so the
 *    till opens offline even when the worker wasn't controlling the first visit
 * Business data is handled by the app's IndexedDB layer, not here.
 */
const VERSION = "v2"
const STATIC_CACHE = `pt-static-${VERSION}`
const PAGE_CACHE = `pt-pages-${VERSION}`

// Opening the app's front door with no internet should land on the till.
const TILL_FIRST = new Set(["/", "/home", "/login"])

self.addEventListener("install", () => self.skipWaiting())

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

const isStatic = (url) => url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icon")

self.addEventListener("message", (event) => {
  const data = event.data
  if (!data || data.type !== "warm") return
  event.waitUntil(
    (async () => {
      if (typeof data.page === "string" && data.page.startsWith("/")) {
        try {
          const res = await fetch(data.page, { credentials: "same-origin" })
          if (res.ok && !res.redirected) await (await caches.open(PAGE_CACHE)).put(data.page, res)
        } catch {
          // offline — keep what we have
        }
      }
      const assets = Array.isArray(data.assets) ? data.assets.slice(0, 300) : []
      const cache = await caches.open(STATIC_CACHE)
      await Promise.all(
        assets.map(async (a) => {
          try {
            const url = new URL(a, self.location.origin)
            if (url.origin !== self.location.origin || !isStatic(url)) return
            if (await cache.match(url.href)) return
            const res = await fetch(url.href)
            if (res.ok) await cache.put(url.href, res)
          } catch {
            // ignore one bad asset
          }
        }),
      )
    })(),
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Never cache API/auth/dynamic traffic.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return

  // Static build assets — cache-first with background refresh.
  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req)
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone())
            return res
          })
          .catch(() => hit)
        return hit || network
      }),
    )
    return
  }

  // Navigations — network-first, fall back to a cached page when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          // A redirect's final page (e.g. "/" → "/home") isn't cached under the URL that was asked for.
          if (res.ok && !res.redirected) {
            const cache = await caches.open(PAGE_CACHE)
            cache.put(req, res.clone())
          }
          return res
        } catch {
          const cache = await caches.open(PAGE_CACHE)
          const pos = await cache.match("/pos")
          if (TILL_FIRST.has(url.pathname) && pos) return pos
          return (await cache.match(req)) || pos || Response.error()
        }
      })(),
    )
  }
})
