import { OFFLINE_MODE } from "@/lib/offline-mode"

export async function register() {
  // ADR-014: an Offline Edition install has no internet to report errors to
  // Sentry/GlitchTip anyway — skip the import entirely so Next's OpenTelemetry
  // auto-instrumentation (which merely importing @sentry/nextjs pulls in,
  // regardless of whether Sentry.init() ends up enabled) never loads its
  // require-in-the-middle hook, which needs to write a generated shim file at
  // runtime and can fail inside a read-only, relocated app bundle.
  if (OFFLINE_MODE) return
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}

// Captures errors thrown in server components, route handlers and middleware.
// Dynamically imported (not a static re-export) so OFFLINE_MODE never pulls
// in @sentry/nextjs at all — see the note in register() above.
export async function onRequestError(...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) {
  if (OFFLINE_MODE) return
  const { captureRequestError } = await import("@sentry/nextjs")
  return captureRequestError(...args)
}
