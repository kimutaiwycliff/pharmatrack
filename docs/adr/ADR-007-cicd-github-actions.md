# ADR-007 — CI/CD: GitHub Actions at launch
**Status:** Accepted

GitHub Actions: install → typecheck → lint → vitest → fresh-migration apply on a
throwaway DB → RLS isolation suite → build. Migrate to Gitea + Woodpecker when the
team grows. Forward-only migrations; must apply cleanly on an empty DB.
