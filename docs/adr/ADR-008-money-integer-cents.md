# ADR-008 — Money: integer cents in core, numeric(12,2) in DB
**Status:** Accepted

All monetary arithmetic uses integer cents in `packages/core` (no floating point);
DB columns are `numeric(12,2)` (or `*_cents` integer per CLAUDE.md §5). Round only
at the boundary. Display in KES, Africa/Nairobi timezone.
