import { z } from "zod"

// Accepts any UUID Postgres stores. Zod v4's `z.string().uuid()` enforces the
// RFC 4122 version/variant nibbles and so REJECTS the non-RFC "pretty" UUIDs in
// our seed data (e.g. branches/orgs like `b1b2c3d4-0002-0002-0002-0000...`),
// even though the database accepts and stores them. Validating those payloads
// must be lenient or legitimate rows can never be referenced. Matches the
// client-side `isUuid` guard in lib/utils.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Lenient UUID validator for API request schemas (any 8-4-4-4-12 hex). */
export const zUuid = () => z.string().regex(UUID_RE, "Invalid UUID")
