/* PharmaTrack service worker — installable PWA + resilient asset/navigation caching.
 * Intentionally simple and framework-agnostic (no build step):
 *  - static build assets: stale-while-revalidate
 *  - navigations: network-first, fall back to the last cached shell when offline
 * Business data is handled by the app's IndexedDB layer, not here.
 */
const VERSION = "v1"
const STATIC_CACHE = `pt-static-${VERSION}`
const PAGE_CACHE = `pt-pages-${VERSION}`

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

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Never cache API/auth/dynamic traffic.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return

  // Static build assets — cache-first with background refresh.
  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icon")) {
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
          const cache = await caches.open(PAGE_CACHE)
          cache.put(req, res.clone())
          return res
        } catch {
          const cache = await caches.open(PAGE_CACHE)
          return (await cache.match(req)) || (await cache.match("/pos")) || Response.error()
        }
      })(),
    )
  }
})
