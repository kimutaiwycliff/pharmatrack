// Relocated to packages/core/src/phone.ts so mobile's offline PIN cache
// (apps/mobile/src/lib/device-users.ts) normalizes phones identically to the
// server — re-exported here so none of this file's existing importers
// (apps/web/app/api/settings/route.ts, staff/route.ts, staff/[id]/route.ts,
// lib/auth/pin-plugin.ts) need to change their import path.
export { normalizeKePhone } from "@pharmatrack/core"
