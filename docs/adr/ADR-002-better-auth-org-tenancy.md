# ADR-002 — Better Auth org model is the tenancy source of truth
**Status:** Accepted

Better Auth (Drizzle adapter) owns identity (`user/session/account/verification`)
and the **organization** plugin models tenants (`organization/member/invitation`,
roles). `admin` plugin gates platform operators. PIN login is a custom credential
verifying `staff_profile.pin_hash` by phone. No bespoke auth crypto.
