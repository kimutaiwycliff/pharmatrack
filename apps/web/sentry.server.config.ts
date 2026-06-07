import * as Sentry from "@sentry/nextjs"

const dsn = process.env.SENTRY_DSN

// No-op unless SENTRY_DSN is set, so local/dev and unconfigured deploys are unaffected.
Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
})
