import * as Sentry from "@sentry/react-native"
import { env } from "./env"

// GlitchTip is a self-hosted, Sentry-protocol-compatible error tracker — the
// same one web already uses (apps/web/sentry.*.config.ts). No GlitchTip
// project/DSN exists for mobile yet (EXPO_PUBLIC_GLITCHTIP_DSN is unset), so
// this is a documented no-op until one is provisioned and the env var is set
// in eas.json's build profiles — mirrors web's `enabled: !!dsn` pattern
// exactly, so an unconfigured deploy is unaffected rather than crashing on
// a missing DSN.
//
// Manual setup (not `npx @sentry/wizard`): the wizard targets sentry.io and
// requires an interactive OAuth login, neither of which applies to a
// self-hosted GlitchTip target. No source-map upload is configured either —
// that needs a Sentry auth token this project doesn't have; add
// "@sentry/react-native" to app.config.ts's plugins + a SENTRY_AUTH_TOKEN
// build secret if that's wanted later.
export function initCrashReporting() {
  Sentry.init({
    dsn: env.EXPO_PUBLIC_GLITCHTIP_DSN,
    enabled: !!env.EXPO_PUBLIC_GLITCHTIP_DSN,
    tracesSampleRate: 0.1,
  })
}
